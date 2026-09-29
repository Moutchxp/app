'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CSS_PIECES_BROUILLON, PiecesBrouillon } from './PiecesBrouillon';
// LOT REDACTION-GMAIL — le corps en texte mis en forme, et le nettoyage du HTML collé (module PUR, partagé serveur).
import { CSS_EDITEUR_RICHE, EditeurRiche, type ApiEditeur } from './EditeurRiche';
import { htmlVersTexte, texteVersHtml } from '../../../../lib/gestion/htmlMail';
import {
  SelecteurFichierDrive, CSS_SELECTEUR_FICHIER, type ChoixFichierDrive,
} from './SelecteurFichierDrive';
import { ChampClassement, CSS_CHAMP_CLASSEMENT } from './ChampClassement';
import {
  adresseValide, decouperAdresses, MENTION_DESTINATAIRES_APPROXIMATIFS, MENTION_PIECES_NON_JOINTES,
  MENTION_SANS_SIGNATURE, pretAEnvoyer, secondesRestantes,
  type Brouillon, brouillonTouche} from '../../../../lib/gestion/redaction';
// LOT BROUILLONS-GMAIL — quand enregistrer, et comment savoir que quelque chose a VRAIMENT changé. Module PUR.
import {
  brouillonAQuelqueChose, delaiPour, MOTS_ENREGISTREMENT, signatureBrouillon, sorteDuChangement,
  type EtatEnregistrement,
} from '../../../../lib/gestion/brouillonEnregistrement';

/**
 * LOT 5e — ÉCRIRE UN MESSAGE. Composant CLIENT.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 ON N'ENVOIE QUE SUR CLIC EXPLICITE DU BOUTON « ENVOYER ». Jamais sur Entrée, jamais à la perte de focus, jamais
 * par un raccourci. Le formulaire n'a PAS de `onSubmit` qui envoie — un « Entrée » dans le champ objet ne doit pas
 * expédier un message à moitié écrit à un locataire. C'est la décision d'Arno, et c'est aussi la seule forme qui
 * pardonne une erreur de frappe.
 *
 * 🔴 PUIS UNE FENÊTRE POUR SE RAVISER. Après le clic, N secondes (réglage en base, 10 par défaut) pendant lesquelles
 * RIEN N'EST PARTI : aucune requête n'a quitté le navigateur. « Annuler l'envoi » revient simplement au brouillon.
 * Un envoi différé côté serveur aurait demandé une file d'attente et un moyen de l'annuler — trois choses de plus à
 * surveiller pour un besoin que dix secondes d'attente résolvent exactement.
 *
 * 🔴 DOUBLE-CLIC = UN SEUL ENVOI. Une clé d'idempotence est tirée à l'ouverture de la fenêtre d'annulation et
 * accompagne la requête ; c'est la BASE qui tranche (contrainte UNIQUE). Le bouton se désactive aussi, mais un bouton
 * désactivé ne protège pas d'un navigateur qui rejoue la requête.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * MOBILE D'ABORD : plein écran sur téléphone, champs à 16 px (en dessous, iOS zoome à chaque mise au point), pastilles
 * de destinataires qui passent à la ligne, aucune barre fixée en bas (le clavier iOS la recouvrirait), cibles ≥ 44 px,
 * aucune interaction au survol seul. Jetons `--color-svv-*` uniquement.
 */

export interface ContexteRedactionEcran {
  schemaPret: boolean;
  /** LOT 5-PJ-ENVOI — la migration 252 est-elle appliquée ? Sinon, aucune zone de pièces jointes n'est rendue. */
  piecesDisponibles?: boolean;
  peutEnvoyer: boolean;
  jetonPresent: boolean;
  signature: string;
  nomExpediteur: string;
  adresseGestion: string;
  delaiAnnulationS: number;
  /**
   * LOT REDACTION-GMAIL — la migration 265 est-elle appliquée ? Deux sondes SÉPARÉES (elles peuvent diverger si la
   * migration est appliquée à moitié) :
   *   · `htmlDisponible`     : le brouillon ENREGISTRÉ garde-t-il sa mise en forme ? Sinon on l'écrit à l'écran —
   *     l'éditeur riche fonctionne quand même, et l'ENVOI part bien en HTML (il lit l'écran, pas la base) ;
   *   · `classementDisponible` : peut-on garder les cibles de « Classer ce mail » ? Sinon le champ n'est PAS
   *     affiché — proposer un classement qui se perdrait au rechargement serait pire qu'une fonction absente.
   */
  htmlDisponible?: boolean;
  classementDisponible?: boolean;
  /**
   * LOT REDACTION-GMAIL — la signature Gmail de gestion@, EN HTML (logo compris), déjà assainie par la route.
   * Vide ⇒ on garde la signature TEXTE, exactement comme avant ce lot. Lisible avec la portée déjà accordée
   * (`gmail.settings.basic`) : rien de nouveau n'a été autorisé pour l'obtenir.
   */
  signatureHtml?: string;
}

type Etat =
  | { v: 'ecriture' }
  | { v: 'compte_a_rebours'; clicLe: Date; cle: string }
  | { v: 'envoi' }
  | { v: 'parti' }
  | { v: 'echec'; motif: string };

/** Ce que l'écran garde du brouillon, plus son identifiant en base une fois enregistré. */
/**
 * 🔴 `repris` — CE BROUILLON VIENT DE LA BASE, L'ÉDITEUR NE L'A PAS CRÉÉ.
 *
 * L'éditeur abandonne, à la fermeture, un brouillon que personne n'a touché (règle du lot BROUILLON-SILENCIEUX :
 * c'est elle qui empêche de semer des lignes vides). Un brouillon ROUVERT part exactement de ce qu'il contient :
 * l'écart avec « ce que l'éditeur a pré-rempli » est nul, et la règle, prise au mot, l'abandonnerait pour l'avoir
 * seulement REGARDÉ. Absent ou faux ⇒ comportement d'avant, mot pour mot.
 */
export interface BrouillonEcran extends Brouillon { id: number | null; repris?: boolean }

/**
 * UN CHAMP DE DESTINATAIRES. Autant d'adresses que voulu, chacune en PASTILLE retirable — et le « × » est visible en
 * PERMANENCE, jamais au survol : au doigt, le survol n'existe pas, et une croix qui n'apparaît qu'à la souris est une
 * fonction inaccessible sur téléphone.
 *
 * On valide à la VALIDATION (Entrée, virgule, point-virgule, ou perte de focus), pas à chaque lettre : souligner en
 * rouge une adresse qu'on est en train de taper est un reproche permanent adressé à quelqu'un qui n'a rien fait.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CORRECTIF DU 24/09/2026 — LA SUGGESTION QU'ON NE POUVAIT PAS CHOISIR (défaut constaté par Arno au premier usage).
 *
 * LA CAUSE, établie en la rejouant dans `Redaction.suggestions.test.ts` avant d'écrire une ligne de correctif : un clic
 * sur une suggestion commence par faire PERDRE LE FOCUS au champ. `onBlur` validait alors le texte en cours de frappe
 * (« a. »), ce qui vidait la saisie — et la liste, conditionnée à deux caractères saisis, disparaissait de la page
 * AVANT que le clic n'arrive. On obtenait une pastille « a. » marquée incorrecte, et jamais l'adresse choisie.
 *
 * LE CORRECTIF tient en deux gestes, et il en faut DEUX parce qu'ils ne protègent pas de la même chose :
 *   ① `onMouseDown` annule son comportement par défaut → le focus NE QUITTE PAS le champ, donc `onBlur` ne se
 *      déclenche plus du tout. C'est la correction de la cause.
 *   ② le choix est fait DÈS `mousedown`, pas au `click` → même si un navigateur (ou un lecteur d'écran, ou un futur
 *      remaniement) refaisait perdre le focus, l'adresse est déjà entrée. `onClick` reste branché pour les chemins qui
 *      ne passent pas par la souris, et ajouter deux fois la même adresse ne fait rien : elle est déjà là.
 *
 * Et puisqu'on y était : les FLÈCHES parcourent la liste, « Entrée » choisit la proposition mise en avant, « Échap »
 * referme — au clavier, on ne devrait jamais avoir à viser à la souris.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function ChampDestinataires({
  libelle, valeurs, onChange, suggestions, onChercher, autoFocus = false, actions,
}: {
  libelle: string;
  valeurs: string[];
  onChange: (v: string[]) => void;
  suggestions: { adresse: string; nom: string | null }[];
  onChercher: (q: string) => void;
  autoFocus?: boolean;
  /**
   * 🔴 LOT BROUILLONS-GMAIL — CE QUI SE RANGE DANS LE CHAMP, À DROITE : les boutons « Cc » et « Cci » du champ
   * « À ». Ils vivaient SOUS le champ, en lien « Ajouter Cc / Cci » ; c'est un déplacement, pas un ajout — la
   * fonction est identique, elle est simplement là où l'œil la cherche, comme dans Gmail.
   *
   * ⚠️ FACULTATIF, et absent partout ailleurs : les champs « Cc » et « Cci » eux-mêmes n'ont rien à y mettre.
   */
  actions?: React.ReactNode;
}) {
  const [saisie, setSaisie] = useState('');
  // La proposition MISE EN AVANT au clavier. −1 = aucune : « Entrée » vaut alors ce qu'il a toujours valu, la
  //   validation du texte tapé. On ne met JAMAIS la première en avant d'office — ce serait choisir à la place d'Arno.
  const [avance, setAvance] = useState(-1);
  // « Échap » referme la liste sans rien choisir. Taper à nouveau la rouvre.
  const [repliee, setRepliee] = useState(false);
  // Les NOMS qu'on a appris en choisissant une suggestion. La valeur transmise reste l'ADRESSE seule (c'est elle qu'on
  //   envoie) ; le nom ne sert qu'à l'affichage — « Arno Jorel » se relit, « a.jorel@… » se déchiffre.
  const [noms, setNoms] = useState<Record<string, string>>({});
  const id = `dest-${libelle.toLowerCase().replace(/[^a-z]/g, '')}`;

  const ouverte = suggestions.length > 0 && saisie.trim().length >= 2 && !repliee;
  // Borné à CHAQUE rendu : la liste change pendant qu'on la parcourt (les suggestions arrivent du serveur), et un
  //   indice resté au-delà de la fin désignerait une proposition qui n'existe plus.
  const enAvant = ouverte && avance >= 0 && avance < suggestions.length ? avance : -1;

  const ajouter = (brut: string, nom?: string | null) => {
    const nouvelles = decouperAdresses(brut);
    const deja = new Set(valeurs);
    const ajouts = nouvelles.filter((a) => !deja.has(a));
    if (nom && nouvelles.length === 1) setNoms((n) => ({ ...n, [nouvelles[0]]: nom }));
    setAvance(-1);
    setRepliee(false);
    // Rien de neuf (champ vide, ou adresse déjà présente) : on vide quand même la saisie, mais on ne prévient pas le
    //   parent — un `onChange` qui rend la MÊME liste n'apporte rien et déclenche un enregistrement de brouillon.
    if (ajouts.length === 0) { if (brut !== '') { setSaisie(''); onChercher(''); } return; }
    onChange([...valeurs, ...ajouts]);
    setSaisie('');
    onChercher('');
  };

  /** Ce qu'on affiche dans la pastille : le nom s'il est connu, l'adresse sinon. L'adresse reste dans l'infobulle. */
  const libelleDe = (a: string) => noms[a] ?? a;
  const infobulleDe = (a: string) => (adresseValide(a) ? a : `Adresse incorrecte : ${a}`);

  return (
    <div className="red-champ">
      <label className="red-label" htmlFor={id}>{libelle}</label>
      <div className="red-pastilles">
        {/* ══ 🔴 LOT BROUILLONS-GMAIL — « Cc » ET « Cci » SONT DANS LE CHAMP, à droite, comme dans Gmail ═════════
            Ils vivaient sous le champ, en lien « Ajouter Cc / Cci ». C'est un DÉPLACEMENT : la fonction est la
            même, elle est simplement là où l'œil la cherche — au bout de la ligne des destinataires.
            ⚠️ RENDUS EN DERNIER DANS LE DOM, mais poussés à droite par la mise en page : au clavier, on traverse
            d'abord la saisie (ce qu'on vient faire), et seulement ensuite ces deux boutons. */}
        {valeurs.map((a) => (
          <span key={a} className={`red-pastille${adresseValide(a) ? '' : ' red-pastille--fautive'}`}
            title={infobulleDe(a)}>
            <span className="red-pastille-texte">{libelleDe(a)}</span>
            {/* Le « × » est un VRAI bouton, de 44 px, avec un libellé accessible : « retirer » doit se dire. */}
            <button type="button" className="red-retirer" aria-label={`Retirer ${a}`}
              onClick={() => onChange(valeurs.filter((x) => x !== a))}>
              ×
            </button>
          </span>
        ))}
        <input id={id} className="red-saisie" type="text" inputMode="email" autoComplete="off" autoFocus={autoFocus}
          value={saisie}
          role="combobox" aria-expanded={ouverte} aria-controls={`${id}-liste`} aria-autocomplete="list"
          aria-activedescendant={enAvant >= 0 ? `${id}-s${enAvant}` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            // Une virgule ou un point-virgule VALIDE l'adresse : c'est le geste qu'on fait sans y penser.
            if (/[,;]$/.test(v)) { ajouter(v); return; }
            setSaisie(v);
            setAvance(-1);
            setRepliee(false);
            onChercher(v);
          }}
          onKeyDown={(e) => {
            // ⚠️ « Entrée » AJOUTE UNE ADRESSE — il n'envoie RIEN. `preventDefault` empêche toute soumission.
            if (e.key === 'Enter') {
              e.preventDefault();
              const choisie = enAvant >= 0 ? suggestions[enAvant] : null;
              if (choisie) ajouter(choisie.adresse, choisie.nom);
              else ajouter(saisie);
              return;
            }
            if (ouverte && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              // On ne sort JAMAIS de la liste par le haut ni par le bas : elle se borne à ses deux extrémités, pour
              //   qu'une flèche tenue ne ramène pas silencieusement sur la première ligne.
              e.preventDefault();
              const pas = e.key === 'ArrowDown' ? 1 : -1;
              const dernier = suggestions.length - 1;
              setAvance(Math.min(dernier, Math.max(0, (enAvant < 0 ? -1 : enAvant) + pas)));
              return;
            }
            if (e.key === 'Escape' && ouverte) { e.preventDefault(); setRepliee(true); setAvance(-1); return; }
            if (e.key === 'Backspace' && saisie === '' && valeurs.length > 0) onChange(valeurs.slice(0, -1));
          }}
          onBlur={() => ajouter(saisie)} />
        {actions !== undefined && <span className="red-champ-actions">{actions}</span>}
      </div>
      {ouverte && (
        <ul className="red-suggestions" id={`${id}-liste`} role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.adresse} role="presentation">
              {/* 🔴 `onMouseDown` : on ANNULE le comportement par défaut (le focus reste dans le champ, donc `onBlur`
                  ne valide plus le texte à moitié tapé) ET on choisit TOUT DE SUITE. Les deux, pas l'un ou l'autre —
                  cf. l'encadré en tête de fichier. `onClick` sert les chemins sans souris ; il est sans effet une
                  seconde fois, l'adresse étant déjà entrée. */}
              <button type="button" id={`${id}-s${i}`} role="option" aria-selected={i === enAvant}
                className={`red-suggestion${i === enAvant ? ' red-suggestion--avance' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); ajouter(s.adresse, s.nom); }}
                onClick={() => ajouter(s.adresse, s.nom)}>
                {s.nom ? `${s.nom} — ` : ''}{s.adresse}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Redaction({
  brouillon, contexte, onChange, onFerme, onEnvoye, onGeste, dansFenetre = false, fermetureDemandee = 0,
  reduite = false,
}: {
  brouillon: BrouillonEcran;
  contexte: ContexteRedactionEcran;
  onChange: (b: BrouillonEcran) => void;
  onFerme: () => void;
  onEnvoye: () => void;
  onGeste: (message: string) => void;
  /**
   * LOT REDACTION-GMAIL — l'éditeur est-il rendu DANS une fenêtre flottante ? Alors la fenêtre porte déjà le titre
   * et la croix : on ne les répète pas. `false` (le défaut) = rendu en place, sous un message — l'en-tête reste,
   * exactement comme avant ce lot.
   */
  dansFenetre?: boolean;
  /**
   * 🔴 LA CROIX DE LA FENÊTRE, COMPTÉE. Chaque incrément est une demande de fermeture venue du CADRE (la barre de
   * titre d'une fenêtre flottante). L'éditeur la traite par `fermer` — la même porte que « Garder en brouillon » —
   * pour qu'un brouillon resté vide soit abandonné quelle que soit la croix employée. `0` = aucune demande.
   */
  fermetureDemandee?: number;
  /**
   * 🔴 LA FENÊTRE EST-ELLE REPLIÉE SUR SA BARRE DE TITRE ? Réduire est une façon de dire « je m'en occupe plus
   * tard » : le brouillon doit être en base à cet instant, pas deux secondes après. L'éditeur n'est PAS démonté
   * quand on réduit (il perdrait le texte non enregistré), il est seulement caché — il peut donc s'enregistrer.
   */
  reduite?: boolean;
}) {
  const [etat, setEtat] = useState<Etat>({ v: 'ecriture' });
  /**
   * 🔴 LOT BROUILLONS-GMAIL — « Cc » ET « Cci » S'OUVRENT SÉPARÉMENT, chacun par son bouton dans le champ « À ».
   * Ils s'ouvraient ENSEMBLE, par un lien sous le champ : demander une copie cachée affichait aussi un champ « Cc »
   * vide dont on n'avait que faire. Un brouillon qui EN PORTE DÉJÀ les montre d'emblée — sans quoi on rouvrirait un
   * brouillon en croyant ses destinataires en copie perdus.
   */
  const [afficheCc, setAfficheCc] = useState(brouillon.cc.length > 0);
  const [afficheCci, setAfficheCci] = useState(brouillon.cci.length > 0);
  const [citationOuverte, setCitationOuverte] = useState(false);
  const [suggestions, setSuggestions] = useState<{ adresse: string; nom: string | null }[]>([]);
  const [reste, setReste] = useState(0);
  /** LOT 5-PJ-ENVOI — combien de pièces sont jointes, remonté par la zone des pièces (pour le bouton d'envoi). */
  const [piecesJointes, setPiecesJointes] = useState(0);
  /** LOT REDACTION-GMAIL — la barre de mise en forme est-elle dépliée ? Le bouton « Aa » la bascule, comme Gmail. */
  const [barreOutils, setBarreOutils] = useState(true);
  /** Le sélecteur de fichier Drive, et la petite fenêtre « insérer un lien ». `null` = fermés. */
  const [drive, setDrive] = useState(false);
  const [lien, setLien] = useState<{ texte: string; url: string } | null>(null);
  /** La confirmation de suppression du brouillon. Un brouillon se supprime EXPRÈS, jamais par un clic au passage. */
  const [supprime, setSupprime] = useState(false);
  /**
   * ══ 🔴 LOT REDACTION-GMAIL — LA RÉPONSE EN PLACE PASSE EN PLEIN ÉCRAN ═════════════════════════════════════════
   * Demande d'Arno (A8). Une réponse s'écrit sous le message auquel elle répond — c'est bien pour les trois lignes
   * qu'on écrit neuf fois sur dix, et c'est étroit pour la dixième.
   *
   * 🔴 LE COMPOSANT N'EST PAS DÉMONTÉ : seule sa classe change. C'est la garantie qui compte — démonter puis
   * remonter perdrait le texte non encore enregistré, une pièce en cours de dépôt, et un compte à rebours d'envoi
   * en train de courir. On déplace un CADRE, jamais l'éditeur.
   *
   * ⚠️ SANS EFFET DANS UNE FENÊTRE : celle-ci a déjà son propre bouton de plein écran, dans sa barre de titre.
   */
  const [plein, setPlein] = useState(false);
  /** Remonte la zone des pièces après un ajout venu du Drive : elle relit alors la liste. */
  const [versionPieces, setVersionPieces] = useState(0);
  /** De quoi insérer un lien ou une pièce Drive à la position du curseur. Posé par l'éditeur quand il est prêt. */
  const editeur = useRef<ApiEditeur | null>(null);
  // La clé d'idempotence et le minuteur vivent dans des `ref` : un nouveau rendu ne doit ni en tirer une seconde, ni
  //   relancer le compte à rebours.
  const minuteur = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * ══ 🔴 LOT REPONSE-VISIBLE — L'ÉDITEUR SE MONTRE, ET IL SE MONTRE OÙ IL FAUT ═══════════════════════════════════
   * Constat d'Arno : on cliquait « Répondre » et il ne se passait rien — l'éditeur s'ouvrait bien, mais hors de
   * l'écran, sous une conversation de douze messages. Un bouton dont l'effet est invisible est un bouton cassé.
   *
   * Trois choses à l'ouverture, et elles vont ensemble :
   *   ① on AMÈNE l'éditeur en haut de la zone visible (`block: 'start'`, avec la marge de `scroll-margin-top`) ;
   *   ② on met le curseur là où l'on va taper — dans le MESSAGE, au tout DÉBUT, donc au-dessus de la signature ;
   *      pour un transfert, dans le champ « À », qui est vide et qu'il faut remplir d'abord ;
   *   ③ un bref surlignage confirme que quelque chose s'est ouvert, pour l'œil qui suivait le curseur ailleurs.
   *
   * ⚠️ `prefers-reduced-motion` COUPE LE DÉFILEMENT DOUX, pas le défilement : on arrive au même endroit, d'un coup.
   * Le surlignage, lui, est une animation CSS que la même requête média neutralise.
   *
   * ⚠️ UNE SEULE FOIS PAR OUVERTURE. L'effet ne dépend que de la VOIE et de l'identifiant du brouillon : il ne se
   * rejoue ni à la frappe, ni à l'enregistrement automatique — sans quoi l'écran sauterait toutes les deux secondes
   * pendant qu'on écrit, et le curseur reviendrait au début du texte.
   */
  const racine = useRef<HTMLElement | null>(null);
  const [ouvre, setOuvre] = useState(true);
  const cleOuverture = `${brouillon.voie}:${brouillon.id ?? 'neuf'}`;
  useEffect(() => {
    const doux = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    /**
     * 🔴 APRÈS LA MISE EN PAGE, PAS PENDANT. Mesuré dans le navigateur : appelé dans l'effet, le défilement partait
     * alors que l'éditeur n'avait pas encore sa hauteur définitive (la zone des pièces et le bloc de citation
     * s'installent juste après) — le bloc finissait 83 px trop bas au lieu des 12 px voulus. Une image de retard
     * suffit à le faire arriver pile.
     *
     * ⚠️ ON VÉRIFIE QUE LA MÉTHODE EXISTE. `scrollIntoView` est une fonction du navigateur : elle manque dans
     * jsdom, et rien ne garantit qu'un futur environnement la fournisse. Sans ce test, l'ouverture de l'éditeur
     * JETTE — c'est-à-dire que le geste le plus fréquent du module tombe pour une raison qui n'a rien à voir avec
     * lui. Amener l'éditeur sous les yeux est un confort ; écrire ne l'est pas.
     */
    const caler = () => {
      const el = racine.current;
      if (typeof el?.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'start', behavior: doux ? 'smooth' : 'auto' });
      }
    };
    const apresMiseEnPage = (f: () => void): ReturnType<typeof setTimeout> | number =>
      (typeof globalThis.requestAnimationFrame === 'function'
        ? globalThis.requestAnimationFrame(f)
        : setTimeout(f, 0));
    const image = apresMiseEnPage(caler);
    /**
     * ══ 🔴 DEUX RECALAGES, ET VOICI POURQUOI ILS SONT NÉCESSAIRES ═════════════════════════════════════════════
     * MESURÉ dans le navigateur, et ce n'est pas ce que je croyais au départ. Le bloc finissait 83 px trop bas au
     * lieu de 12, et il n'y restait pas par erreur de calcul : **le navigateur avait défilé au maximum possible à
     * cet instant-là**. Au moment du premier appel, l'éditeur n'a pas encore sa hauteur définitive — la zone des
     * pièces jointes et les suggestions arrivent après leur requête — donc la PAGE est plus courte, et son bas
     * arrive avant la position visée. Quand la page s'allonge ensuite, plus rien ne redéplace la vue : le bloc
     * reste là où il s'était arrêté. Échantillonné toutes les 200 ms : position figée à 83 px, défilement à 1470
     * pour un maximum de 1558.
     *
     * On rappelle donc le calage deux fois, une fois le contenu arrivé. ⚠️ EN DÉFILEMENT INSTANTANÉ (`auto`) : un
     * second défilement DOUX interromprait le premier et donnerait une glissade en deux temps, visible et laide.
     *
     * ⚠️ BORNÉ, ET COURT. Deux rappels, terminés avant que le surlignage s'efface (1,1 s). Recaler plus longtemps
     * ferait sauter l'écran pendant qu'on écrit — le bloc change de hauteur à chaque ligne tapée.
     */
    const recalages = [250, 700].map((ms) => setTimeout(() => {
      const el = racine.current;
      if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }, ms));
    /**
     * LE CURSEUR DANS LE MESSAGE, À LA POSITION 0. `focus()` seul poserait le curseur à la FIN — c'est-à-dire sous
     * la signature et sous la citation, là où personne n'écrit une réponse.
     *
     * ⚠️ PAS POUR UN TRANSFERT NI UN MESSAGE NEUF : là, le champ « À » est vide et c'est lui qu'il faut remplir
     * d'abord. Il porte déjà `autoFocus` — on ne lui reprend donc pas le curseur.
     */
    // ⚠️ LE CURSEUR EST POSÉ PAR L'ÉDITEUR LUI-MÊME depuis le lot REDACTION-GMAIL (`autoFocus`) : le corps n'est
    //   plus un `textarea` mais une zone de texte mis en forme, dont seul l'éditeur sait placer le point d'insertion.
    const fin = setTimeout(() => setOuvre(false), 1100);
    return () => {
      clearTimeout(fin);
      for (const t of recalages) clearTimeout(t);
      if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(image as number);
      else clearTimeout(image as ReturnType<typeof setTimeout>);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : SEULE une nouvelle ouverture doit
    //   déclencher tout cela. Ajouter `brouillon` ferait sauter l'écran à chaque frappe.
  }, [cleOuverture]);

  const modifier = (p: Partial<BrouillonEcran>) => onChange({ ...brouillon, ...p });

  /**
   * ══ LE CORPS À L'OUVERTURE, EN HTML ══════════════════════════════════════════════════════════════════════════
   * Trois cas, dans cet ordre :
   *   ① le brouillon a DÉJÀ du HTML (rouvert, ou déjà tapé) → on le reprend tel quel ;
   *   ② on connaît la signature GMAIL en HTML → le corps naît vide, deux lignes, puis la signature AVEC son logo,
   *      comme dans Gmail. Le curseur se pose au-dessus (voir `autoFocus`) ;
   *   ③ à défaut → le corps texte converti, c'est-à-dire le comportement d'avant ce lot.
   *
   * ⚠️ CALCULÉ UNE SEULE FOIS PAR BROUILLON (`useMemo` sur sa clé) : recalculé à chaque rendu, il remonterait
   * l'éditeur et effacerait ce qu'on est en train d'écrire.
   */
  const cleCorps = `${brouillon.voie}:${brouillon.id ?? 'neuf'}:${brouillon.repondALeMessageId ?? 0}`;
  const corpsInitialHtml = useMemo(() => {
    if ((brouillon.corpsHtml ?? '').trim() !== '') return brouillon.corpsHtml as string;
    const sig = (contexte.signatureHtml ?? '').trim();
    if (sig !== '') return `<p><br /></p><p><br /></p>${sig}`;
    return texteVersHtml(brouillon.corps);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : SEUL un changement de brouillon doit
    //   reconstruire le corps initial. Le suivre ferait remonter l'éditeur à chaque frappe.
  }, [cleCorps]);

  // ── ENREGISTREMENT AUTOMATIQUE. 🔴 Il n'envoie JAMAIS rien : la route des brouillons n'importe aucun chemin
  //    d'envoi (un test statique le vérifie). On attend que la frappe se calme — enregistrer à chaque lettre ferait
  //    une requête par caractère.
  /**
   * ══ 🔴 LOT BROUILLON-SILENCIEUX — LE BROUILLON TEL QU'IL EST NÉ ═══════════════════════════════════════════════
   * Gardé à l'ouverture, et jamais remplacé ensuite : c'est l'étalon auquel on compare pour savoir si quelqu'un a
   * réellement saisi quelque chose. Une réponse naît remplie (objet « Re: … », destinataire, signature) — sans cet
   * étalon, « ce n'est pas vide » se confondait avec « on a écrit », et ouvrir puis fermer « Répondre » laissait un
   * brouillon derrière soi. Mes essais du lot précédent en ont créé douze.
   *
   * ⚠️ `useRef` ET NON `useState` : c'est une mémoire, pas un affichage. Et il n'est repris QUE lorsque l'éditeur
   * change de brouillon (autre voie, autre message) — s'il suivait le brouillon courant, l'écart serait toujours
   * nul et la règle ne dirait plus rien.
   */
  const origine = useRef<BrouillonEcran>(brouillon);
  const cleBrouillon = `${brouillon.voie}:${brouillon.filId ?? 0}:${brouillon.repondALeMessageId ?? 0}`;
  const cleOrigine = useRef(cleBrouillon);
  if (cleOrigine.current !== cleBrouillon) { cleOrigine.current = cleBrouillon; origine.current = brouillon; }

  /**
   * A-t-on saisi quelque chose ? La seule question qui décide qu'un brouillon mérite d'exister.
   *
   * ══ 🔴 LES PIÈCES D'UN BROUILLON ROUVERT NE SONT PAS UNE SAISIE ═══════════════════════════════════════════════
   *
   * DÉFAUT VU À L'ÉCRAN LE 29/09/2026, une minute après avoir livré la réouverture : rouvrir un brouillon qui
   * portait quatorze pièces suffisait à le FAIRE REMONTER EN TÊTE DE LISTE. « Joindre est une saisie » (lot
   * EDITEUR-PJ) est vrai quand on vient de joindre ; appliqué à des pièces DÉJÀ LÀ, il déclarait « touché » un
   * brouillon qu'on avait seulement ouvert, l'enregistrement automatique repartait, et `maj_le` était réécrite.
   * On changeait la date de dernière modification d'un travail qu'on venait de regarder.
   *
   * ⚠️ RIEN N'EST PERDU POUR AUTANT : une pièce ajoutée à un brouillon rouvert est écrite par SA propre route
   * (`POST …/pieces`), qui n'attend pas l'enregistrement du texte. Et modifier le texte, l'objet ou un
   * destinataire rend bien « touché » — c'est la comparaison au contenu rouvert qui le dit.
   */
  /**
   * 🔴 LOT BROUILLONS-GMAIL — LA RÈGLE D'ARNO, AJOUTÉE À CELLE-CI : « au moins un destinataire, un objet, du texte
   * hors signature ou une pièce jointe ». Les deux tiennent ensemble, et il en faut DEUX :
   *   · `brouillonTouche` répond « quelqu'un a-t-il modifié ce que j'avais pré-rempli ? » — c'est ce qui empêche
   *     une réponse, née remplie, de se croire écrite ;
   *   · `brouillonAQuelqueChose` répond « reste-t-il quelque chose à garder ? » — c'est ce qui empêche un
   *     surlignage posé sur la signature de créer un brouillon vide (défaut vu en base le 29/09 au matin, n° 51).
   */
  const touche = brouillonTouche(origine.current, brouillon, brouillon.repris !== true && piecesJointes > 0)
    && brouillonAQuelqueChose(brouillon, origine.current, brouillon.repris !== true && piecesJointes > 0);

  const aEnregistrer = useRef<BrouillonEcran>(brouillon);
  // Le ref suit le brouillon DANS UN EFFET, jamais pendant le rendu : React interdit d'écrire un ref au rendu, et
  //   le faire quand même casse le rendu concurrent (l'état lu n'est alors plus celui qu'on affiche).
  useEffect(() => { aEnregistrer.current = brouillon; }, [brouillon]);
  /** Le même jugement, lisible par l'effet différé — qui s'exécute bien après le rendu qui l'a armé. */
  const toucheRef = useRef(touche);
  useEffect(() => { toucheRef.current = touche; }, [touche]);

  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴🔴 LOT BROUILLONS-GMAIL — L'ENREGISTREMENT EN CONTINU. CE QU'IL REMPLACE, MESURÉ AVANT D'Y TOUCHER :
   *
   *   · minuterie de 1 200 ms (premier enregistrement observé à +1,6 s) ;
   *   · RIEN à la fermeture, à la réduction, au rechargement ni à la fermeture de l'onglet — pas un `pagehide` ;
   *   · aucun indicateur ;
   *   · et un DOUBLON systématique : un brouillon neuf partait DEUX fois (+1,6 s puis +3,6 s), parce que recevoir
   *     son identifiant changeait l'état du brouillon, donc relançait la minuterie.
   *
   * 🔴 LA SIGNATURE TUE LE DOUBLON. On compare ce qu'on s'apprête à écrire à ce qu'on a écrit : un identifiant qui
   * arrive, une citation qu'on replie, un déplacement à l'écran ne changent rien et n'écrivent donc rien.
   *
   * 🔴 DEUX DÉLAIS. Deux secondes après la frappe ; un quart de seconde pour un geste discret (destinataire, objet,
   * pièce) — ce sont ceux qu'on oublie d'enregistrer parce qu'on ferme dans la foulée.
   * ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const [etatEnreg, setEtatEnreg] = useState<EtatEnregistrement>('repos');
  /** La signature de ce qui est DÉJÀ en base. `null` = rien n'y est encore. */
  const signatureEcrite = useRef<string | null>(brouillon.repris === true ? signatureBrouillon(brouillon) : null);
  /** Un envoi en cours : on ne s'enchevêtre pas, et la fermeture peut l'attendre. */
  const envoiEnCours = useRef<Promise<void> | null>(null);

  const corpsPourEnvoi = useCallback((b: BrouillonEcran) => JSON.stringify({
    id: b.id, filId: b.filId, repondAMessageId: b.repondALeMessageId, voie: b.voie,
    a: b.a, cc: b.cc, cci: b.cci, objet: b.objet, corps: b.corps, citation: b.citation,
    // 🔴 LOT EDITEUR-PJ — LA MISE EN FORME PART AVEC : sans elle un brouillon rouvert revient en texte brut.
    corpsHtml: b.corpsHtml ?? null,
  }), []);

  /**
   * ENREGISTRE MAINTENANT, si et seulement s'il y a quelque chose de neuf à écrire.
   *
   * ⚠️ `auVol` = on part (fermeture d'onglet, changement de page) : la requête doit SURVIVRE à la page. `keepalive`
   * le garantit pour un corps de cette taille ; `sendBeacon` prend le relais si le navigateur refuse. On ne lit
   * alors pas la réponse — il n'y a plus personne pour l'entendre.
   */
  const enregistrerMaintenant = useCallback(async (auVol = false): Promise<void> => {
    if (!contexte.schemaPret || !contexte.peutEnvoyer) return;
    if (!toucheRef.current) return;
    const b = aEnregistrer.current;
    const signature = signatureBrouillon(b);
    if (signature === signatureEcrite.current) return;
    const corps = corpsPourEnvoi(b);

    if (auVol) {
      // On marque AVANT de partir : la page peut disparaître à l'instant qui suit.
      signatureEcrite.current = signature;
      try {
        const envoye = globalThis.fetch !== undefined && await Promise.resolve(
          fetch('/api/admin/gestion/brouillons', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps, keepalive: true,
          }).then(() => true, () => false));
        if (!envoye && typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/admin/gestion/brouillons', new Blob([corps], { type: 'application/json' }));
        }
      } catch { /* on part : il n'y a plus d'écran pour recevoir un message d'échec */ }
      return;
    }

    setEtatEnreg('enregistrement');
    const promesse = (async () => {
      try {
        const res = await fetch('/api/admin/gestion/brouillons', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps,
        });
        const d = (await res.json().catch(() => ({}))) as { brouillon?: { id: number } };
        if (!res.ok || !d.brouillon) { setEtatEnreg('echec'); return; }
        signatureEcrite.current = signature;
        if (aEnregistrer.current.id === null) {
          // ⚠️ L'identifiant remonte, et il ne relance RIEN : il ne fait pas partie de la signature.
          aEnregistrer.current = { ...aEnregistrer.current, id: d.brouillon.id };
          onChange(aEnregistrer.current);
        }
        setEtatEnreg('enregistre');
      } catch {
        setEtatEnreg('echec');
      } finally {
        envoiEnCours.current = null;
      }
    })();
    envoiEnCours.current = promesse;
    return promesse;
  }, [contexte.schemaPret, contexte.peutEnvoyer, corpsPourEnvoi, onChange]);

  /** La minuterie : deux secondes après la frappe, un quart de seconde après un geste. */
  const precedent = useRef<BrouillonEcran | null>(null);
  useEffect(() => {
    const sorte = sorteDuChangement(precedent.current, brouillon);
    precedent.current = brouillon;
    if (sorte === 'aucun') return undefined;
    if (signatureBrouillon(brouillon) === signatureEcrite.current) return undefined;
    const t = setTimeout(() => { void enregistrerMaintenant(); }, delaiPour(sorte));
    return () => clearTimeout(t);
  }, [brouillon, enregistrerMaintenant]);

  /**
   * 🔴 ON PART : LA PAGE SE FERME, SE RECHARGE, OU PASSE AU SECOND PLAN. C'est LE moment que l'ancien code ne
   * couvrait pas du tout — deux secondes de frappe non enregistrées disparaissaient avec l'onglet.
   *
   * ⚠️ `pagehide` ET `visibilitychange`, LES DEUX. Safari (et iOS surtout) ne déclenche pas toujours `pagehide`
   * quand on change d'application ; `visibilitychange` vers « caché » est le seul signal fiable dans ce cas.
   * `beforeunload` n'est pas employé : il sert à POSER UNE QUESTION, et nous n'en posons aucune.
   */
  /** 🔴 RÉDUIRE ENREGISTRE. On replie la fenêtre pour y revenir plus tard : « plus tard » suppose que c'est gardé. */
  const reduiteAvant = useRef(reduite);
  useEffect(() => {
    const passeAReduite = reduite && !reduiteAvant.current;
    reduiteAvant.current = reduite;
    if (passeAReduite) void enregistrerMaintenant();
  }, [reduite, enregistrerMaintenant]);

  useEffect(() => {
    const partir = () => { void enregistrerMaintenant(true); };
    const surVisibilite = () => { if (document.visibilityState === 'hidden') partir(); };
    window.addEventListener('pagehide', partir);
    document.addEventListener('visibilitychange', surVisibilite);
    return () => {
      window.removeEventListener('pagehide', partir);
      document.removeEventListener('visibilitychange', surVisibilite);
    };
  }, [enregistrerMaintenant]);

  /**
   * ══ 🔴 FERMER : UN BROUILLON REDEVENU VIDE EST ABANDONNÉ ══════════════════════════════════════════════════════
   * On écrit trois lignes, on les efface, on ferme : il ne doit rien rester. L'abandon est le geste EXISTANT de la
   * route (`DELETE`), qui date la ligne et ne supprime rien — elle reste en base, consultable.
   *
   * 🔴 ET UN BROUILLON AVEC DU CONTENU N'EST JAMAIS PERDU : on n'abandonne QUE si rien n'a été saisi. En cas de
   * doute — l'appel échoue, le réseau tombe — on ferme quand même et on ne touche à rien. Perdre un brouillon écrit
   * serait bien pire que d'en laisser un vide.
   */
  /**
   * ══ JOINDRE UN FICHIER VENU DU DRIVE ═════════════════════════════════════════════════════════════════════════
   * Les octets sont déjà chez nous (la route les a lus, APRÈS avoir vérifié que le fichier n'est pas sous
   * « Documents clients scannés »). On les dépose par la MÊME porte que les pièces venues du Mac : la route des
   * pièces d'un brouillon. Un second chemin de dépôt aurait deux limites de taille, deux listes d'extensions et,
   * un jour, deux comportements.
   *
   * ⚠️ IL FAUT UN BROUILLON EN BASE pour y attacher une pièce. Si l'enregistrement automatique n'a pas encore eu
   * lieu, on le DIT plutôt que de perdre le fichier en silence.
   */
  /**
   * ══ 🔴 LOT EDITEUR-PJ — LE BROUILLON EST CRÉÉ À LA DEMANDE ════════════════════════════════════════════════════
   *
   * LE DÉFAUT, CONSTATÉ PAR ARNO : « Joindre un fichier » restait grisé avec « Le brouillon s'enregistre… », et ne
   * s'activait JAMAIS. Ce n'était pas une lenteur, c'était une impasse. L'enregistrement automatique ne part que si
   * quelque chose a été SAISI (règle du lot BROUILLON-SILENCIEUX, qui évite de semer des brouillons vides à chaque
   * ouverture) — or sur un message neuf, on veut souvent joindre AVANT d'écrire. Les deux règles se contredisaient,
   * et c'est l'attente qui perdait : le message promettait un enregistrement qui n'arriverait pas.
   *
   * 🔴 LA SORTIE N'EST PAS DE RELÂCHER LA RÈGLE — ce serait recréer les brouillons fantômes. C'est de dire que
   * JOINDRE EST UNE SAISIE : on ne joint pas un fichier par accident. Le brouillon est donc créé À CE MOMENT-LÀ,
   * parce qu'il y a désormais quelque chose à garder.
   *
   * ⚠️ RÉENTRANT : deux clics rapprochés ne doivent pas créer deux brouillons. La promesse en cours est mémorisée
   * et partagée — le second appel attend le premier au lieu d'en lancer un second.
   */
  const creationEnCours = useRef<Promise<number | null> | null>(null);
  const assurerBrouillon = useCallback(async (): Promise<number | null> => {
    const deja = aEnregistrer.current.id ?? brouillon.id;
    if (deja !== null) return deja;
    if (creationEnCours.current !== null) return creationEnCours.current;
    const p = (async (): Promise<number | null> => {
      const b = aEnregistrer.current;
      try {
        const res = await fetch('/api/admin/gestion/brouillons', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: null, filId: b.filId, repondAMessageId: b.repondALeMessageId, voie: b.voie,
            a: b.a, cc: b.cc, cci: b.cci, objet: b.objet, corps: b.corps, citation: b.citation,
            corpsHtml: b.corpsHtml ?? null,
          }),
        });
        const d = (await res.json().catch(() => ({}))) as { brouillon?: { id: number } };
        if (!res.ok || !d.brouillon) return null;
        onChange({ ...aEnregistrer.current, id: d.brouillon.id });
        aEnregistrer.current = { ...aEnregistrer.current, id: d.brouillon.id };
        return d.brouillon.id;
      } catch {
        return null;
      } finally {
        creationEnCours.current = null;
      }
    })();
    creationEnCours.current = p;
    return p;
  }, [brouillon.id, onChange]);

  /**
   * ══ 🔴🔴 LOT ENVOI-ARRIERE-PLAN — JOINDRE UNE PIÈCE DU DRIVE, SANS ATTENDRE SES OCTETS ═══════════════════════
   *
   * On n'envoie plus que l'IDENTIFIANT Drive. Le serveur lit les métadonnées (un appel court), inscrit la pièce et
   * rend la main ; les octets sont tirés derrière, par le travailleur de fond. C'est ce qui rend le « Joindre »
   * suivant cliquable immédiatement — le constat d'Arno.
   *
   * 🔴 ON LÈVE EN CAS DE REFUS, et c'est délibéré : le sélecteur a marqué la pièce « ajoutée » par avance pour que
   * le clic suivant soit instantané. C'est l'exception qui lui dit de RETIRER cette marque. Rendre silencieusement
   * laisserait une pièce marquée jointe alors qu'elle ne l'est pas.
   */
  const joindreDepuisDrive = async (c: ChoixFichierDrive): Promise<void> => {
    const f = c.drive;
    if (!f) return;
    const id = await assurerBrouillon();
    if (id === null) throw new Error('Le brouillon n’a pas pu être créé : la pièce n’a pas été jointe.');

    const corps = new FormData();
    corps.append('drive', f.fichierId);
    if (f.dossierId) corps.append('driveDossier', f.dossierId);
    if (f.dossierNom) corps.append('driveDossierNom', f.dossierNom);

    const res = await fetch(`/api/admin/gestion/brouillons/${id}/pieces`, { method: 'POST', body: corps });
    const d = (await res.json().catch(() => ({}))) as { etat?: string; message?: string };
    if (d.etat !== 'ok') throw new Error(d.message ?? 'Cette pièce n’a pas pu être jointe.');
    // La zone des pièces se relit d'elle-même : on la remonte par la clé, comme après un dépôt ordinaire.
    setVersionPieces((v) => v + 1);
  };

  /**
   * SUPPRIMER LE BROUILLON, sur confirmation. C'est le geste d'ABANDON qui existe déjà (`DELETE`), celui qui DATE
   * la ligne sans rien effacer en base — pas une suppression réelle. Le mot « Supprimer » est celui de Gmail ; ce
   * qu'il fait chez nous est plus prudent, et c'est tant mieux.
   */
  const supprimerBrouillon = async (): Promise<void> => {
    const id = aEnregistrer.current.id ?? brouillon.id;
    if (id !== null) {
      try { await fetch(`/api/admin/gestion/brouillons?id=${id}`, { method: 'DELETE' }); }
      catch { /* silence : on ferme de toute façon */ }
    }
    setSupprime(false);
    onGeste('Brouillon supprimé.');
    onFerme();
  };

  /**
   * ══ 🔴🔴 FERMER : UN BROUILLON RESTÉ VIDE EST ABANDONNÉ, PAR QUELQUE CROIX QU'ON PASSE ════════════════════════
   *
   * DEUX CORRECTIONS ICI, le 29/09/2026, et chacune répare une façon différente de laisser une ligne vide en base.
   *
   * ① L'IDENTIFIANT EST LU DANS LA RÉFÉRENCE D'ABORD. Il était lu dans la propriété `brouillon.id`, qui n'arrive
   *    qu'au rendu SUIVANT la création (elle remonte par `onChange`). Fermer juste après avoir joint une pièce puis
   *    l'avoir retirée trouvait donc `null`, et n'abandonnait rien. `supprimerBrouillon`, deux fonctions plus haut,
   *    lisait déjà la référence : les deux gestes lisent désormais la même chose.
   *
   * ② UN BROUILLON ROUVERT N'EST JAMAIS ABANDONNÉ. Il part de ce qu'il contient, donc « rien n'a été touché » est
   *    vrai dès la première seconde. Sans cette garde, ouvrir un brouillon pour le RELIRE l'effacerait de la liste.
   *
   * 🔴 ET UN BROUILLON AVEC DU CONTENU N'EST JAMAIS PERDU : on n'abandonne QUE si rien n'a été saisi. En cas de
   * doute — l'appel échoue, le réseau tombe — on ferme quand même et on ne touche à rien. Perdre un brouillon écrit
   * serait bien pire que d'en laisser un vide.
   */
  const fermer = async () => {
    /**
     * 🔴 LOT BROUILLONS-GMAIL — ON ENREGISTRE D'ABORD, ON FERME ENSUITE. La croix ne perdait rien de dramatique
     * jusqu'ici (la minuterie avait souvent tourné), mais les deux dernières secondes de frappe partaient avec la
     * fenêtre. Fermer, c'est le geste après lequel on n'a plus aucune chance de rattraper.
     *
     * ⚠️ ET SEULEMENT S'IL Y A QUELQUE CHOSE À GARDER : `enregistrerMaintenant` se tait tout seul quand rien n'a
     * été saisi, donc cette ligne ne peut pas ressusciter la création de brouillons vides.
     */
    await enregistrerMaintenant();
    const id = aEnregistrer.current.id ?? brouillon.id;
    if (!touche && brouillon.repris !== true && id !== null) {
      try {
        await fetch(`/api/admin/gestion/brouillons?id=${id}`, { method: 'DELETE' });
      } catch { /* silence : on ferme de toute façon, et la ligne restera simplement en base */ }
    }
    onFerme();
  };

  /**
   * ══ 🔴🔴 LA CROIX DE LA FENÊTRE PASSE PAR LA MÊME PORTE ═══════════════════════════════════════════════════════
   *
   * LE DÉFAUT, trouvé en cherchant d'où venaient les brouillons vides du 28/09 : dans une fenêtre flottante, la
   * croix de la barre de titre fermait la fenêtre DIRECTEMENT, sans passer par `fermer`. Tout le raisonnement
   * ci-dessus était donc contourné par le geste le plus naturel — celui qu'on fait sans réfléchir. « Garder en
   * brouillon » l'appliquait ; la croix, non. Deux façons de fermer, deux comportements, et un seul des deux dit.
   *
   * ⚠️ UN COMPTEUR, PAS UN BOOLÉEN : la fenêtre peut demander la fermeture plusieurs fois (on reclique), et un
   * booléen déjà à `vrai` ne redéclencherait rien. Zéro = personne n'a rien demandé, et c'est le cas ordinaire.
   */
  const fermetureVue = useRef(fermetureDemandee);
  useEffect(() => {
    if (fermetureDemandee === fermetureVue.current) return;
    fermetureVue.current = fermetureDemandee;
    void fermer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontaire : SEULE une nouvelle demande agit. Suivre
    //   `fermer` (qui change d'identité à chaque frappe) fermerait la fenêtre pendant qu'on écrit.
  }, [fermetureDemandee]);

  const chercherCorrespondants = useCallback((q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); return; }
    void (async () => {
      try {
        const res = await fetch(`/api/admin/gestion/correspondants?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        if (!res.ok) return;
        const d = (await res.json()) as { correspondants: { adresse: string; nom: string | null }[] };
        setSuggestions(d.correspondants ?? []);
      } catch { setSuggestions([]); }
    })();
  }, []);

  /** L'ENVOI RÉEL. Appelé UNIQUEMENT quand la fenêtre d'annulation est écoulée — jamais directement par un clic. */
  const envoyerVraiment = useCallback(async (cle: string) => {
    setEtat({ v: 'envoi' });
    const b = aEnregistrer.current;
    try {
      const res = await fetch('/api/admin/gestion/envois', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cleIdempotence: cle, brouillonId: b.id, filId: b.filId, repondAMessageId: b.repondALeMessageId,
          a: b.a, cc: b.cc, cci: b.cci, objet: b.objet,
          // La citation part À LA SUITE du message : ce qu'on a écrit d'abord, ce qu'on cite ensuite.
          corps: b.citation ? `${b.corps}\n\n${b.citation}` : b.corps,
          /**
           * 🔴 LOT REDACTION-GMAIL — LA VERSION HTML PART AVEC. Le serveur la RÉASSAINIT avant de la mettre dans le
           * message : l'écran nettoie pour qu'on voie ce qu'on envoie, le serveur nettoie parce que lui seul ne
           * peut pas être contourné. Vide ⇒ le message part en texte seul, exactement comme avant ce lot.
           *
           * ⚠️ LA CITATION EST AJOUTÉE DANS LES DEUX VERSIONS, et dans le même ordre : sans cela, le destinataire
           * qui lit en HTML verrait la citation et celui qui lit en texte ne la verrait pas (ou l'inverse).
           */
          corpsHtml: (b.corpsHtml ?? '').trim() === '' ? null
            : (b.citationHtml ? `${b.corpsHtml}<br /><br />${b.citationHtml}` : b.corpsHtml),
          /** LOT REDACTION-GMAIL — les cibles de « Classer ce mail » : elles deviennent des rattachements manuels. */
          cibles: (b.cibles ?? []).length > 0 ? b.cibles : undefined,
        }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; erreur?: string };
      if (!res.ok || !d.ok) { setEtat({ v: 'echec', motif: d.erreur ?? 'Envoi impossible.' }); return; }
      setEtat({ v: 'parti' });
      onGeste('Message envoyé.');
      onEnvoye();
    } catch {
      setEtat({ v: 'echec', motif: 'Envoi impossible : le serveur n’a pas répondu. Le brouillon est conservé.' });
    }
  }, [onEnvoye, onGeste]);

  // LE COMPTE À REBOURS. Tant qu'il court, RIEN n'est parti : aucune requête n'a quitté le navigateur.
  useEffect(() => {
    if (etat.v !== 'compte_a_rebours') return;
    const { clicLe, cle } = etat;
    const tic = () => {
      const r = secondesRestantes(clicLe, new Date(), contexte.delaiAnnulationS);
      setReste(r);
      if (r === 0) {
        if (minuteur.current) clearInterval(minuteur.current);
        void envoyerVraiment(cle);
      }
    };
    tic();
    minuteur.current = setInterval(tic, 250);
    return () => { if (minuteur.current) clearInterval(minuteur.current); };
  }, [etat, contexte.delaiAnnulationS, envoyerVraiment]);

  const pret = pretAEnvoyer(brouillon);
  const titre = brouillon.voie === 'transferer' ? 'Transférer'
    : brouillon.voie === 'nouveau' ? 'Nouveau message'
      : brouillon.voie === 'repondre_tous' ? 'Répondre à tous' : 'Répondre';

  // ── ÉTATS D'APRÈS-CLIC ────────────────────────────────────────────────────────────────────────────────────────
  if (etat.v === 'compte_a_rebours') {
    return (
      <section className="red red-apres" aria-live="polite">
        <style>{CSS_REDACTION}</style>
        <p className="red-etat">Envoi dans {reste} seconde{reste > 1 ? 's' : ''}… <strong>rien n’est encore parti.</strong></p>
        <div className="gst-actions">
          <button type="button" className="svv-btn svv-btn-primary gst-btn"
            onClick={() => { if (minuteur.current) clearInterval(minuteur.current); setEtat({ v: 'ecriture' }); onGeste('Envoi annulé : votre message est resté en brouillon.'); }}>
            Annuler l’envoi
          </button>
        </div>
      </section>
    );
  }
  if (etat.v === 'envoi') {
    return (
      <section className="red red-apres" aria-live="polite">
        <style>{CSS_REDACTION}</style>
        <p className="red-etat" role="status">Envoi en cours…</p>
      </section>
    );
  }
  if (etat.v === 'parti') {
    return (
      <section className="red red-apres" aria-live="polite">
        <style>{CSS_REDACTION}</style>
        <p className="red-etat">✅ Message <strong>envoyé</strong>.</p>
      </section>
    );
  }

  return (
    <section className={`red${ouvre ? ' red--ouvre' : ''}${plein ? ' red--plein' : ''}`}
      aria-label={titre} ref={racine}>
      <style>{CSS_REDACTION}</style>
      <style>{CSS_EDITEUR_RICHE}</style>
      <style>{CSS_CHAMP_CLASSEMENT}</style>

      {/* ⚠️ DANS UNE FENÊTRE, CET EN-TÊTE N'EXISTE PAS : la barre de titre de la fenêtre porte déjà le même mot et
          la même croix. Les afficher tous les deux donnait deux « Nouveau message » et deux façons de fermer, à
          deux centimètres l'un de l'autre — vu à l'écran avant livraison. */}
      {!dansFenetre && (
        <div className="red-haut">
          <h3 className="gst-titre">{titre}</h3>
          {/* 🔴 LOT REDACTION-GMAIL — le plein écran de la réponse en place. Le MOT change avec l'état : une
              icône seule ne dirait pas dans quel sens elle agit. */}
          <button type="button" className="svv-btn svv-btn-outline gst-btn"
            aria-pressed={plein}
            onClick={() => setPlein((v) => !v)}>
            {plein ? 'Réduire' : 'Plein écran'}
          </button>
          <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void fermer()}>Fermer</button>
        </div>
      )}

      <p className="gst-note">De : {contexte.nomExpediteur} &lt;{contexte.adresseGestion}&gt;</p>

      {/* 🔴 CE QUI EMPÊCHERAIT D'ENVOYER, DIT AVANT D'ÉCRIRE. On n'attend pas le clic pour l'annoncer. */}
      {!contexte.jetonPresent && (
        <p className="gst-tronc">
          La connexion Google de gestion@ n’est pas encore faite : vous pouvez écrire et enregistrer, mais l’envoi
          échouera. Voir <code>docs/GUIDE_CONNEXION_GOOGLE_GESTION.md</code>.
        </p>
      )}
      {etat.v === 'echec' && <p className="gst-compte-rendu gst-ton-erreur" role="status">{etat.motif}</p>}

      {/* ⚠️ LOT REPONSE-VISIBLE — PLUS D'AUTOFOCUS SUR UNE RÉPONSE. Le champ « À » d'une réponse est DÉJÀ rempli :
          y poser le curseur obligeait à en sortir avant d'écrire. Il le garde là où il est vide et où il faut
          commencer — un transfert, un message neuf. Pour une réponse, c'est le corps qui prend le curseur (voir
          l'encadré de l'effet d'ouverture). */}
      <ChampDestinataires libelle="À" valeurs={brouillon.a} onChange={(a) => modifier({ a })}
        suggestions={suggestions} onChercher={chercherCorrespondants}
        autoFocus={brouillon.a.length === 0 && brouillon.voie !== 'repondre' && brouillon.voie !== 'repondre_tous'}
        /* 🔴 LOT BROUILLONS-GMAIL — les deux boutons DANS le champ, collés à droite, comme dans Gmail. Un clic
           ouvre le champ correspondant ; `aria-expanded` dit s'il est déjà ouvert, pour qui ne voit pas l'écran. */
        actions={(
          <>
            <button type="button" className="red-copie-bouton" aria-expanded={afficheCc}
              title="Ajouter des destinataires en copie" onClick={() => setAfficheCc(true)}>Cc</button>
            <button type="button" className="red-copie-bouton" aria-expanded={afficheCci}
              title="Ajouter des destinataires en copie cachée" onClick={() => setAfficheCci(true)}>Cci</button>
          </>
        )} />

      {/* Cc et Cci REPLIÉS par défaut : neuf messages sur dix n'en ont pas, et deux champs vides de plus font croire
          qu'il faut les remplir. Leurs deux boutons sont maintenant DANS le champ « À », à droite (voir plus haut). */}
      {afficheCc && (
        <ChampDestinataires libelle="Cc" valeurs={brouillon.cc} onChange={(cc) => modifier({ cc })}
          suggestions={suggestions} onChercher={chercherCorrespondants} />
      )}
      {afficheCci && (
        <ChampDestinataires libelle="Cci" valeurs={brouillon.cci} onChange={(cci) => modifier({ cci })}
          suggestions={suggestions} onChercher={chercherCorrespondants} />
      )}

      {brouillon.destinatairesApproximatifs && (
        <p className="gst-tronc red-avertit">⚠ {MENTION_DESTINATAIRES_APPROXIMATIFS}</p>
      )}

      <div className="red-champ">
        <label className="red-label" htmlFor="red-objet">Objet</label>
        {/* ⚠️ « Entrée » ici ne doit RIEN envoyer : le champ n'est pas dans un formulaire, et rien n'écoute la touche. */}
        <input id="red-objet" className="red-saisie red-saisie--pleine" value={brouillon.objet} maxLength={500}
          onChange={(e) => modifier({ objet: e.target.value })} />
      </div>

      {/* ══ 🔴 LOT REDACTION-GMAIL — LE CORPS EN TEXTE MIS EN FORME ══════════════════════════════════════════════
          L'éditeur tient les DEUX versions d'accord à chaque frappe : `corpsHtml` est ce qu'on voit, `corps` est son
          rendu texte fidèle. Les deux partent dans le message (`multipart/alternative`), et la version texte n'est
          pas un sous-produit : une partie des destinataires ne verra qu'elle.

          ⚠️ L'ÉDITEUR N'EST PAS « CONTRÔLÉ » : il lit son contenu initial UNE fois. La `key` le remonte quand on
          change de brouillon — sans elle, répondre à un autre message rouvrirait l'ancien texte. */}
      <div className="red-champ">
        <label className="red-label" id="red-corps-label">Message</label>
        <div className="red-corps-riche">
          <EditeurRiche
            key={cleCorps}
            htmlInitial={corpsInitialHtml}
            barreVisible={barreOutils}
            ariaLabel="Message"
            /* ⚠️ LE CURSEUR DANS LE MESSAGE POUR UNE RÉPONSE, au tout début — règle du lot REPONSE-VISIBLE,
               reprise telle quelle. Pour un transfert ou un message neuf, c'est le champ « À » qui le prend :
               il est vide, et c'est lui qu'il faut remplir d'abord. */
            autoFocus={brouillon.voie === 'repondre' || brouillon.voie === 'repondre_tous'}
            onPret={(api) => { editeur.current = api; }}
            onChange={(v) => modifier({ corpsHtml: v.html, corps: v.texte })} />
        </div>
      </div>

      {/* ══ LOT REDACTION-GMAIL — CLASSER DÈS L'ÉCRITURE (nouveau message sans historique UNIQUEMENT) ═════════════
          🔴 POURQUOI SEULEMENT LÀ (demande d'Arno) : une réponse hérite du classement de son échange. Reproposer
          le geste donnerait deux vérités sur la même conversation, et la seconde n'aurait aucune raison d'être la
          bonne. Un message NEUF, lui, ne se rattache à rien — et c'est au moment de l'écrire qu'on sait de quoi
          il parle. */}
      {brouillon.voie === 'nouveau' && contexte.classementDisponible === true && (
        <ChampClassement cibles={brouillon.cibles ?? []} onChange={(cibles) => modifier({ cibles })} />
      )}

      {contexte.signature.trim() === '' && <p className="gst-note">{MENTION_SANS_SIGNATURE}</p>}
      {brouillon.voie === 'transferer' && piecesJointes > 0 && <p className="gst-note">{MENTION_PIECES_NON_JOINTES}</p>}

      {/* ══ LOT 5-PJ-ENVOI — LES PIÈCES JOINTES ══ Rendues seulement si la base sait les mémoriser : proposer de
          joindre un fichier qu'on ne saurait pas retenir ferait perdre le fichier ET le message. */}
      {contexte.piecesDisponibles && (
        <PiecesBrouillon key={versionPieces} brouillonId={brouillon.id} onChange={setPiecesJointes}
          onBesoinDeBrouillon={assurerBrouillon}
          /**
           * 🔴 LOT EDITEUR-PJ — LES DEUX ICÔNES REJOIGNENT LA ZONE DES PIÈCES (demande d'Arno). Elles vivaient en
           * bas, à côté d'« Envoyer », parmi les outils du message. Or « joindre depuis le Drive » et « joindre un
           * fichier » sont LE MÊME geste avec deux sources : les séparer de trente centimètres obligeait à chercher.
           * Le Drive d'abord, le lien ensuite — l'ordre demandé.
           *
           * ⚠️ RIEN N'EST RETIRÉ : ce sont les mêmes boutons, avec les mêmes libellés et les mêmes actions. Seul
           * leur emplacement change, et leur taille (alignée sur « Joindre un fichier »).
           */
          actions={(
            <>
              <button type="button" className="pjb-outil" title="Insérer depuis Google Drive"
                aria-label="Insérer un fichier depuis Google Drive" onClick={() => setDrive(true)}>
                <span aria-hidden="true">▲</span>
              </button>
              <button type="button" className="pjb-outil" title="Insérer un lien" aria-label="Insérer un lien"
                onClick={() => setLien({ texte: editeur.current?.texteSelectionne() ?? '', url: '' })}>
                <span aria-hidden="true">🔗</span>
              </button>
            </>
          )} />
      )}

      {/* LA CITATION, REPLIÉE : on écrit au-dessus, on ne relit pas ce qu'on vient de lire. Elle part avec le message. */}
      {brouillon.citation && (
        <details className="gst-cite" open={citationOuverte} onToggle={(e) => setCitationOuverte((e.target as HTMLDetailsElement).open)}>
          <summary className="gst-cite-titre">Message d’origine (envoyé avec la réponse)</summary>
          <p className="gst-msg-corps gst-cite-corps">{brouillon.citation}</p>
        </details>
      )}

      {!pret.pret && <p className="gst-note red-avertit">{pret.motif}</p>}

      {/* ══ 🔴 LOT REDACTION-GMAIL — LA PETITE FENÊTRE « INSÉRER UN LIEN » ════════════════════════════════════════
          Deux champs — le TEXTE affiché, et l'ADRESSE. C'est la forme de Gmail, et elle évite le défaut que
          produirait un champ unique : un mail truffé d'URL nues, illisible et impossible à relire. */}
      {lien !== null && (
        <div className="red-lien" role="group" aria-label="Insérer un lien">
          <div className="red-champ">
            <label className="red-label" htmlFor="red-lien-texte">Texte affiché</label>
            <input id="red-lien-texte" className="red-saisie red-saisie--pleine" value={lien.texte}
              placeholder="le contrat de location"
              onChange={(e) => setLien({ ...lien, texte: e.target.value })} />
          </div>
          <div className="red-champ">
            <label className="red-label" htmlFor="red-lien-url">Adresse</label>
            <input id="red-lien-url" className="red-saisie red-saisie--pleine" value={lien.url}
              placeholder="https://…" inputMode="url"
              onChange={(e) => setLien({ ...lien, url: e.target.value })} />
          </div>
          <div className="gst-actions">
            {/* ⚠️ `insererLien` ASSAINIT l'adresse : un `javascript:` collé ici ne devient jamais un lien. */}
            <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={lien.url.trim() === ''}
              onClick={() => { editeur.current?.insererLien(lien.texte, lien.url.trim()); setLien(null); }}>
              Insérer
            </button>
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => setLien(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ══ 🔴🔴 LE SÉLECTEUR DRIVE ══ « Joindre » y est INTERDIT sous « Documents clients scannés » ; seul le lien
          y est proposé. La route refuse de son côté — l'écran explique, le serveur protège. */}
      {/* 🔴 LOT EDITEUR-PJ — LA FENÊTRE NE SE FERME PLUS À CHAQUE PIÈCE : on en prend autant qu'on veut, dans
          autant de dossiers qu'on veut, et c'est « Terminé » qui ferme. Insérer un LIEN, en revanche, referme :
          c'est un geste qui finit dans le corps du message, et l'on veut voir où il a atterri. */}
      {drive && (
        <SelecteurFichierDrive
          /**
           * 🔴 LOT DRIVE-DOSSIER-DU-BIEN — DE QUOI SAVOIR À QUEL BIEN CE MAIL EST RELIÉ.
           *
           * Deux sources, et elles ne se recouvrent pas :
           *   · l'ÉCHANGE auquel on répond — ses rattachements vivants donnent les biens ;
           *   · les LOTS CHOISIS À L'ÉCRITURE (« Classer ce mail »), pour un message neuf qui n'a pas d'échange.
           *
           * ⚠️ UN ÉCHANGE « HORS GESTION » N'A AUCUN RATTACHEMENT VIVANT : il ne produit donc aucune ligne
           * prioritaire, sans qu'aucune règle de plus soit écrite ici.
           */
          filId={brouillon.filId ?? null}
          lots={(brouillon.cibles ?? [])
            .filter((c) => c.sorte === 'lot' && typeof c.cle === 'string' && c.cle !== '')
            .map((c) => c.cle as string)}
          onFermer={() => setDrive(false)}
          onChoisir={async (c) => {
            if (c.lien) { setDrive(false); editeur.current?.insererLien(c.lien.nom, c.lien.url); return; }
            await joindreDepuisDrive(c);
          }} />
      )}

      {/* La confirmation de SUPPRESSION. Un brouillon se supprime EXPRÈS : la corbeille de la barre du bas est à
          côté d'« Envoyer », et un clic de trop ne doit pas effacer ce qu'on vient d'écrire. */}
      {supprime && (
        <p className="red-supprime" role="alert">
          Supprimer ce brouillon ? Le texte sera perdu.{' '}
          <button type="button" className="gst-lien-bouton" onClick={() => void supprimerBrouillon()}>Supprimer</button>
          {' · '}
          <button type="button" className="gst-lien-bouton" onClick={() => setSupprime(false)}>Annuler</button>
        </p>
      )}

      <div className="gst-actions red-bas">
        {/* 🔴 LE SEUL CHEMIN D'ENVOI : ce clic, et lui seul. Il n'envoie même pas tout de suite — il ouvre la fenêtre
            d'annulation. Aucun `type="submit"`, aucun formulaire : « Entrée » ne peut pas déclencher cela. */}
        <button type="button" className="svv-btn svv-btn-primary gst-btn" disabled={!pret.pret}
          onClick={() => setEtat({
            v: 'compte_a_rebours', clicLe: new Date(),
            cle: `${brouillon.id ?? 'x'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          })}>
          Envoyer{piecesJointes > 0 ? ` (${piecesJointes} pièce${piecesJointes > 1 ? 's' : ''} jointe${piecesJointes > 1 ? 's' : ''})` : ''}
        </button>

        {/* ══ LOT REDACTION-GMAIL — LES OUTILS, À CÔTÉ D'« ENVOYER », comme dans Gmail ══════════════════════════
            Chacun porte un MOT dans son libellé accessible et son info-bulle : une rangée d'icônes muettes est
            inutilisable au lecteur d'écran, et devinette pour tout le monde. */}
        <span className="red-outils" role="group" aria-label="Outils du message">
          <button type="button" className="red-outil" title="Mise en forme du texte"
            aria-label="Afficher ou masquer la barre de mise en forme" aria-pressed={barreOutils}
            onClick={() => setBarreOutils((v) => !v)}>
            <span aria-hidden="true">Aa</span>
          </button>
          {/* ⚠️ LE DRIVE ET LE LIEN ONT DÉMÉNAGÉ dans la zone PIÈCES JOINTES (lot EDITEUR-PJ) : ils y sont à côté
              de « Joindre un fichier », qui est le même geste avec une autre source. Rien n'a été retiré. */}
          {/* ⚠️ LA CORBEILLE EST LA DERNIÈRE, et elle DEMANDE confirmation : c'est le seul geste de cette rangée
              qui détruit quelque chose. */}
          <button type="button" className="red-outil red-outil--rouge" title="Supprimer le brouillon"
            aria-label="Supprimer le brouillon" onClick={() => setSupprime(true)}>
            <span aria-hidden="true">🗑</span>
          </button>
        </span>
        {/* ⚠️ « GARDER EN BROUILLON » PASSE PAR LA MÊME PORTE. Son mot promet de garder ; si rien n'a été saisi,
            il n'y a rien à garder, et laisser une ligne vide en base ne tiendrait pas cette promesse — ce serait
            la contourner. `fermer` ne touche qu'aux brouillons restés vides. */}
        <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={() => void fermer()}>
          Garder en brouillon
        </button>

        {/* ══ 🔴 L'INDICATEUR D'ENREGISTREMENT — discret, en bas, comme dans Gmail ═══════════════════════════════
            Deux mots, jamais une alerte : `role="status"` n'interrompt pas une lecture d'écran en cours. Il ne dit
            rien tant qu'il n'y a rien à dire — annoncer « Brouillon enregistré » avant la première lettre serait
            faux, et un indicateur qui ment ne se lit plus. */}
        <span className={`red-enreg${etatEnreg === 'echec' ? ' red-enreg--echec' : ''}`} role="status">
          {MOTS_ENREGISTREMENT[etatEnreg]}
        </span>
      </div>
    </section>
  );
}

const CSS_REDACTION = `
/* ══ 🔴 LOT REDACTION-GMAIL — LA REPONSE EN PLACE, EN PLEIN ECRAN ════════════════════════════════════════════════
   Le composant n'est PAS demonte : seule sa classe change. Demonter perdrait le texte non enregistre, une piece
   en cours de depot et un compte a rebours d'envoi. On deplace un CADRE, jamais l'editeur.
   ⚠️ Le voile est un pseudo-element : pas de noeud de plus dans le DOM, donc rien a demonter non plus. */
.red--plein{position:fixed;top:4vh;bottom:4vh;left:50%;transform:translateX(-50%);z-index:60;
  width:min(900px, calc(100vw - 32px));overflow-y:auto;padding:14px 16px;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);border-radius:.7rem}
.red--plein::before{content:'';position:fixed;inset:0;z-index:-1;background:color-mix(in srgb, var(--color-svv-ink) 42%, transparent)}
@media (max-width: 640px){ .red--plein{inset:0;width:100%;transform:none;border-radius:0} }
/* ══ LOT REDACTION-GMAIL — le corps mis en forme, les outils du bas, le lien, la suppression ══════════════════════ */
.red-corps-riche{border:1px solid var(--color-svv-line);border-radius:.5rem;background:var(--color-svv-surface);
  padding:2px 6px;min-width:0}
/* Les outils vivent A COTE d'« Envoyer », comme dans Gmail. Ils passent a la ligne plutot que de deborder. */
.red-outils{display:inline-flex;flex-wrap:wrap;align-items:center;gap:2px;margin-left:.2rem}
.red-outil{display:inline-flex;align-items:center;justify-content:center;min-width:40px;min-height:40px;padding:0;
  font:inherit;font-size:.9rem;color:var(--color-svv-muted);background:transparent;border:1px solid transparent;
  border-radius:.4rem;cursor:pointer}
.red-outil:hover{background:var(--color-svv-field);color:var(--color-svv-ink)}
.red-outil:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
.red-outil[aria-pressed="true"]{background:var(--color-svv-field);color:var(--color-svv-ink)}
.red-outil--rouge:hover{color:var(--color-svv-red)}
.red-lien{display:flex;flex-direction:column;gap:6px;padding:10px;margin:6px 0;
  border:1px solid var(--color-svv-line);border-radius:.5rem;background:var(--color-svv-field)}
.red-supprime{margin:6px 0;padding:8px 10px;font-size:.85rem;color:var(--color-svv-ink);
  background:var(--color-svv-field);border-left:3px solid var(--color-svv-red);border-radius:0 .4rem .4rem 0}

/* ══ LOT REPONSE-VISIBLE — L'ÉDITEUR S'ANNONCE ══════════════════════════════════════════════════════════════════
   scroll-margin-top : le petit espace au-dessus quand on l'amène en haut de la zone visible. Écrit ici plutôt que
   calculé en pixels dans le code — c'est le navigateur qui sait où commence la zone visible.
   Le surlignage dure 1 s et s'estompe. Il ne porte AUCUNE information : il confirme un geste, rien de plus, et une
   personne qui ne le voit pas n'a rien perdu (le curseur est déjà dans le champ). */
.red{display:flex;flex-direction:column;gap:10px;min-width:0;padding:12px 0;border-top:1px solid var(--color-svv-line);
  scroll-margin-top:12px;border-radius:8px}
.red--ouvre{animation:red-ouvre 1s ease-out}
@keyframes red-ouvre{from{background:var(--color-svv-field)}to{background:transparent}}
@media (prefers-reduced-motion:reduce){.red--ouvre{animation:none}}
.red-apres{align-items:flex-start}
.red-haut{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem}
.red-haut .gst-titre{margin:0}
.red-champ{display:flex;flex-direction:column;gap:3px;min-width:0}
.red-label{font-size:.75rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--color-svv-muted)}
/* Les pastilles PASSENT À LA LIGNE : sur un téléphone, six destinataires ne tiennent pas sur une ligne, et une barre
   qui défile horizontalement cache la moitié des adresses sans le dire. */
.red-pastilles{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px;min-height:44px;
  border:1px solid var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface)}
.red-pastille{display:inline-flex;align-items:center;gap:2px;max-width:100%;padding:2px 2px 2px 8px;border-radius:999px;
  background:var(--color-svv-field);border:1px solid var(--color-svv-line);font-size:.8rem;color:var(--color-svv-ink)}
/* Une adresse fautive est dite par un MOT dans son infobulle ET par une bordure : jamais par la seule couleur. */
.red-pastille--fautive{border-color:var(--color-svv-red);border-style:dashed;color:var(--color-svv-red)}
.red-pastille-texte{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Le « × » est visible EN PERMANENCE, jamais au survol : au doigt, le survol n'existe pas. */
.red-retirer{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:-10px 0;
  padding:0;font-size:1.1rem;line-height:1;color:var(--color-svv-muted);background:transparent;border:0;cursor:pointer}
.red-retirer:hover{color:var(--color-svv-red)}
.red-retirer:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:999px}
/* 16 px MINIMUM : en dessous, iOS zoome à chaque mise au point et l'écran part de travers. */
.red-saisie{flex:1 1 8rem;min-width:0;min-height:40px;padding:.35rem .4rem;font-size:16px;border:0;background:transparent;
  color:var(--color-svv-ink)}
.red-saisie:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:.3rem}
/* 🔴 flex:0 0 auto OBLIGATOIRE. La classe red-saisie porte flex:1 1 8rem : dans la barre de destinataires (en LIGNE),
   ces 8 rem sont une largeur de départ, ce qu'on veut. Mais l'objet vit dans red-champ, qui est une COLONNE — la même
   base devenait une HAUTEUR, et le champ « Objet » s'affichait haut de 8 rem au lieu d'une ligne (défaut vu par Arno
   le 24/09/2026). On remet une hauteur dictée par le contenu ; min-height:44px garde la cible tactile. */
.red-saisie--pleine{flex:0 0 auto;min-height:44px;height:44px;padding:.5rem .7rem;
  border:1px solid var(--color-svv-line-strong);border-radius:.6rem;
  background:var(--color-svv-surface);width:100%;box-sizing:border-box}
.red-corps{width:100%;box-sizing:border-box;min-height:180px;padding:.6rem .7rem;font:inherit;font-size:16px;
  line-height:1.5;border:1px solid var(--color-svv-line-strong);border-radius:.6rem;background:var(--color-svv-surface);
  color:var(--color-svv-ink);resize:vertical}
.red-corps:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.red-suggestions{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-direction:column;gap:2px;
  max-height:min(40vh,240px);overflow-y:auto}
.red-suggestion{width:100%;min-height:44px;padding:.4rem .6rem;text-align:left;font:inherit;font-size:.85rem;
  color:var(--color-svv-ink);background:var(--color-svv-surface);border:1px solid var(--color-svv-line);
  border-radius:.5rem;cursor:pointer}
.red-suggestion:hover,.red-suggestion:focus-visible{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
/* La proposition mise en avant AU CLAVIER. Elle se distingue par une bordure ET un fond, pas par la seule teinte :
   au clavier comme au doigt, il faut voir OÙ l'on est sans avoir à comparer deux nuances de gris. */
.red-suggestion--avance{border-color:var(--color-svv-red);background:var(--color-svv-field);font-weight:600}
.red-avertit{color:var(--color-svv-red);font-weight:600}
.red-etat{margin:0;font-size:.9rem;color:var(--color-svv-ink)}
/* AUCUNE barre fixée en bas : le clavier d'iOS la recouvrirait, et le bouton « Envoyer » deviendrait inatteignable. */
.red-bas{margin-top:4px}

/* ══ 🔴 LOT BROUILLONS-GMAIL — « Cc » ET « Cci » DANS LE CHAMP « A », colles a droite ═══════════════════════════
   Ils sont pousses au bout de la ligne par margin-left:auto, et restent APRES la saisie dans l'ordre du clavier :
   on entre une adresse d'abord, on demande une copie ensuite. */
.red-champ-actions{display:flex;align-items:center;gap:2px;margin-left:auto;flex:0 0 auto}
.red-copie-bouton{min-height:32px;padding:2px 8px;font:inherit;font-size:.78rem;font-weight:600;
  color:var(--color-svv-muted);background:transparent;border:0;border-radius:.4rem;cursor:pointer}
.red-copie-bouton:hover{color:var(--color-svv-ink);background:var(--color-svv-field)}
.red-copie-bouton:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* Deja ouvert : le bouton reste la (recliquer ne fait rien de mal) mais il ne s'annonce plus comme une action. */
.red-copie-bouton[aria-expanded="true"]{color:var(--color-svv-line-strong);cursor:default}

/* ══ 🔴 L'INDICATEUR D'ENREGISTREMENT — discret, a cote des boutons du bas ═════════════════════════════════════
   Il n'occupe aucune place quand il n'a rien a dire : pas de hauteur reservee, pas de saut de mise en page. */
.red-enreg{margin-left:auto;font-size:.76rem;color:var(--color-svv-muted);white-space:nowrap}
.red-enreg--echec{color:var(--color-svv-red);font-weight:600}

${CSS_PIECES_BROUILLON}
`;
