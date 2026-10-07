'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FicheUrl } from '../../../../lib/gestion/ecranUrl';
import {
  classerSuggestions, rangSuivant, suggestionsAnnuaire,
  type PersonnePourSuggestion, type SuggestionAnnuaire,
} from '../../../../lib/gestion/suggestionAnnuaire';
/* 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 2 — la dernière ligne visible l'est EN ENTIER (module PUR). */
import { hauteurEntiereDans } from '../../../../lib/gestion/listeDefilante';

/**
 * ══ 🔴🔴 LOT ACCUEIL-GESTION-ANNUAIRE, POINT 3 — LA BARRE DE RECHERCHE ANNUAIRE DE L'ACCUEIL ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ARNO (07/10/2026) : « à la place du bloc retiré, juste au-dessus des deux colonnes : un grand champ de saisie
 * sur toute la largeur, avec le libellé “Annuaire” à sa droite. Pendant la saisie, une liste de suggestions des
 * contacts de l'annuaire. Clic sur un locataire → ouvre directement la fiche locataire ; clic sur un propriétaire
 * → la fiche propriétaire. Clavier : flèches haut/bas, Entrée, Échap. “Aucun contact trouvé” si rien ne
 * correspond. »
 *
 * 🔴 AUCUNE SECONDE RECHERCHE — c'est la demande, mot pour mot. Cette barre interroge
 * `/api/admin/gestion/annuaire?q=…`, la MÊME route et la MÊME fonction (`rechercherPersonnes`) que l'écran
 * Annuaire : elle accepte déjà un nom, une adresse, une commune, un téléphone, un e-mail, un numéro de lot, sans
 * accent ni casse. Écrire ici un filtre « maison » aurait donné deux annuaires qui ne trouvent pas les mêmes gens.
 *
 * 🔴 ET AUCUNE SECONDE FICHE : le clic rend un `FicheUrl` — `{ sorte: 'proprietaire' | 'locataire', id }` —, que
 * l'écran passe tel quel à `Annuaire`, exactement comme un clic dans ses propres résultats.
 *
 * ⚠️ UNE SUGGESTION PAR RÔLE, et le rangement est fait par le module PUR `suggestionAnnuaire` : une personne à la
 * fois propriétaire et locataire paraît DEUX fois, chacune menant à SA fiche. C'est la demande d'Arno, et c'est
 * aussi la seule façon de ne pas avoir à choisir à sa place.
 *
 * ⚠️ LES AUTRES RÔLES (syndic, artisan…) N'EXISTENT PAS DANS CET ANNUAIRE. Il ne connaît que des propriétaires et
 * des locataires (`RolePersonne`) ; les partenaires internes vivent ailleurs et n'ont pas de fiche d'annuaire.
 * On n'en invente donc aucune — c'est dit à Arno plutôt que fabriqué.
 *
 * 🔒 Aucun jeton, aucune donnée en cache : la route répond `private, no-store`, et cette barre ne garde rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Ce que la route rend. On ne lit QUE ce qu'on affiche — le reste de la personne ne nous regarde pas.
 *
 * 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — `tronque` ENTRE DANS CETTE LECTURE, et il le fallait : le serveur plafonne à
 * 60 personnes (`PLAFOND_RESULTATS`) et le DIT dans sa réponse. Cette barre l'ignorait, donc coupait en silence.
 * C'est exactement le défaut mesuré par Arno le 26/09/2026 sur l'ancien écran (« puvis » : 76 logements, 60
 * montrés, 16 disparus sans un mot) — la règle « une liste coupée le dit » vaut ici comme là-bas.
 */
interface ReponseAnnuaire {
  etat?: string;
  data?: { personnes?: PersonnePourSuggestion[]; tronque?: boolean };
}

/**
 * ⚠️ UN DÉLAI AVANT D'INTERROGER : taper « martin » lancerait six recherches, dont cinq jetées. 250 ms est le
 * temps d'une frappe courante — assez pour ne pas doubler les appels, assez court pour que la liste suive.
 */
const DELAI_MS = 250;
/** En dessous de deux lettres, la recherche rendrait la moitié de l'annuaire : on ne la lance pas. */
const MINIMUM = 2;
/**
 * 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 2 — LE PLAFOND DE LA LISTE, écrit UNE fois. La feuille le pose
 * (`max-height:min(60vh,380px)`) et la mesure le relit : deux valeurs auraient fini par différer, et la liste
 * aurait coupé une ligne de plus que prévu.
 */
const PLAFOND_LISTE_PX = 380;

/**
 * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — `focusAuMontage` ════════════════════════════════════════════════════════════
 *
 * Arno : « le focus est sur le champ à l'ouverture de l'écran Annuaire ». C'est une propriété de L'ÉCRAN qui
 * monte la barre, pas de la barre : sur l'écran partagé, prendre le focus volerait le clavier à la boîte mail et
 * ferait sauter la page vers le haut à chaque arrivée. Le défaut est donc `false`, et seul l'écran Annuaire
 * demande le focus.
 */
export function BarreAnnuaire({ onFiche, focusAuMontage = false }: {
  onFiche: (f: FicheUrl) => void;
  focusAuMontage?: boolean;
}) {
  const [texte, setTexte] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionAnnuaire[] | null>(null);
  const [rang, setRang] = useState(-1);
  const [occupe, setOccupe] = useState(false);
  /**
   * 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — « D'AUTRES CORRESPONDENT ». Vrai quand le serveur a plafonné sa réponse :
   * la liste montre alors les premiers, et la barre doit le dire au lieu de laisser croire qu'on a tout vu.
   */
  const [tronque, setTronque] = useState(false);
  /**
   * 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — « l'annuaire n'est pas installé » est un ÉTAT, pas une absence de résultat.
   * Voir l'encadré du chargement : la route le rend en 200 exprès, pour qu'aucun écran ne confonde les deux.
   */
  const [sansSchema, setSansSchema] = useState(false);
  const idListe = useId();
  const champ = useRef<HTMLInputElement | null>(null);
  /**
   * 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — L'ENVELOPPE, pour savoir ce qui est « dehors ». Elle contient la capsule
   * (donc le champ et son libellé) ET la liste : un clic DANS l'un des deux n'est pas un clic dehors, et c'est
   * cette enveloppe-là qui tranche, jamais une liste de sélecteurs à maintenir.
   */
  const racine = useRef<HTMLDivElement | null>(null);
  /**
   * ══ 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 2 — LA DERNIÈRE LIGNE VISIBLE L'EST EN ENTIER ═════════════
   *
   * Arno : « la liste doit montrer le dernier élément visible en entier (pas de ligne coupée par le bord) ».
   * Le plafond de la feuille est une PLACE (`min(60vh, 380px)`), pas un nombre de lignes : il tombe donc au
   * milieu d'une suggestion, et c'est ainsi qu'« ALEJO FERNANDEZ Paula » est apparue à moitié coupée.
   *
   * 🔴 ON MESURE, COMME POUR LES ENCARTS DE PARTIES, et par la MÊME fonction (`hauteurEntiereDans`) : on garde
   * la dernière ligne qui tient entièrement dans ce budget, et la boîte s'arrête à son bas. Les lignes ont des
   * hauteurs différentes — une mention « + Propriétaire de X biens » en ajoute une —, donc aucune hauteur
   * calculée à la main n'aurait pu tenir.
   *
   * ⚠️ `null` TANT QU'ON N'A PAS MESURÉ : la feuille garde la main, et la liste ne saute pas au premier rendu.
   */
  const boiteListe = useRef<HTMLUListElement | null>(null);
  const [hauteurListe, setHauteurListe] = useState<number | null>(null);

  /**
   * 🔴 LA RECHERCHE, APRÈS LE DÉLAI, ET ANNULABLE. `annule` garde la réponse d'une frappe abandonnée hors de
   * l'écran : sans lui, une réponse lente écraserait le résultat d'une frappe plus récente.
   */
  useEffect(() => {
    const t = texte.trim();
    if (t.length < MINIMUM) {
      setSuggestions(null); setRang(-1); setTronque(false); setSansSchema(false); return;
    }
    let annule = false;
    setOccupe(true);
    const minuteur = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/gestion/annuaire?q=${encodeURIComponent(t)}`, { cache: 'no-store' });
          const d = (await res.json().catch(() => ({}))) as ReponseAnnuaire;
          if (annule) return;
          /* ⚠️ LES ERREURS RENDENT UNE LISTE VIDE, pas une liste absente : l'écran dit alors « Aucun contact
             trouvé » plutôt que de laisser le champ muet. */
          /**
           * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — « PAS ENCORE INSTALLÉ » N'EST PAS « AUCUN CONTACT » ═══════════
           *
           * `sans_schema` (migration 253 non appliquée) tombait ici dans le même sac que « rien ne correspond » :
           * la barre annonçait « Aucun contact trouvé » sur un annuaire ABSENT. C'est le mensonge que la route
           * se donne justement pour mission d'éviter — elle rend un ÉTAT en 200, pas une liste vide, « parce
           * qu'une réponse vide se lirait comme un annuaire sans personne dedans ».
           *
           * 🔴 L'ANCIEN ÉCRAN ANNUAIRE LE DISAIT, ET ÉTAIT LE SEUL. En lui retirant sa liste, ce lot aurait fait
           * disparaître la phrase du module entier : elle est donc reportée ici, comme l'avertissement de
           * troncature, et profite désormais aux deux écrans.
           */
          setSansSchema(d.etat === 'sans_schema');
          /**
           * 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 2 — ON CLASSE PAR PERTINENCE DU NOM, TOUS RÔLES
           * MÊLÉS. La recherche rend ses propriétaires puis ses locataires — deux requêtes concaténées, donc un
           * ordre d'ARRIVÉE et non un classement. Sur « jo », les locataires tombaient tous en bas de liste.
           */
          setSuggestions(classerSuggestions(
            suggestionsAnnuaire(d.etat === 'ok' ? (d.data?.personnes ?? []) : []), t,
          ));
          /* 🔴🔴 LE PLAFOND DU SERVEUR SE REDIT TEL QUEL : on ne le recalcule pas depuis le nombre de
             suggestions, qui n'est PAS le nombre de personnes — une personne à double rôle en donne deux. */
          setTronque(d.etat === 'ok' && d.data?.tronque === true);
          setRang(-1);
        } catch {
          if (!annule) { setSuggestions([]); setRang(-1); setTronque(false); setSansSchema(false); }
        } finally {
          if (!annule) setOccupe(false);
        }
      })();
    }, DELAI_MS);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [texte]);

  /**
   * ⚠️ ON MESURE APRÈS CHAQUE CHANGEMENT DE LISTE, et c'est le seul moment où il le faut : les lignes ne bougent
   * pas d'elles-mêmes. Le budget vient de la feuille (`min(60vh, 380px)`), relu ici pour ne pas l'écrire deux
   * fois — une valeur recopiée aurait fini par différer de celle qui s'applique.
   */
  useEffect(() => {
    const el = boiteListe.current;
    if (el === null) { setHauteurListe(null); return; }
    const positions = [...el.querySelectorAll('li')].map((x) => ({
      haut: (x as HTMLElement).offsetTop, hauteur: (x as HTMLElement).offsetHeight,
    }));
    const budget = Math.min(window.innerHeight * 0.6, PLAFOND_LISTE_PX);
    setHauteurListe(hauteurEntiereDans(positions, budget));
  }, [suggestions]);

  /**
   * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — « LA BARRE REDEVIENT VIERGE », UN SEUL GESTE POUR TROIS SORTIES ═════════
   *
   * ARNO (07/10/2026) : « un clic n'importe où en dehors de la liste de suggestions et du champ ferme la liste ET
   * vide le champ (il redevient vierge, comme avec le ✕). La touche Échap fait la même chose. »
   *
   * 🔴 ÉCRIT UNE SEULE FOIS, et les trois sorties l'empruntent : le clic dehors, Échap, et l'ouverture d'une
   * fiche. Trois recopies de « vider + refermer » auraient fini par diverger — l'une oubliant le rang visé, et
   * la flèche bas serait revenue sur une liste disparue.
   */
  const fermerEtVider = useCallback((): void => {
    setTexte(''); setSuggestions(null); setRang(-1); setTronque(false); setSansSchema(false);
  }, []);

  const ouvrir = (s: SuggestionAnnuaire): void => {
    fermerEtVider();
    onFiche(s.fiche);
  };

  /**
   * ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — LE CLIC DEHORS ══════════════════════════════════════════════════════════
   *
   * ⚠️ C'EST L'ENVELOPPE QUI DÉFINIT « DEHORS », et non une liste de sélecteurs : tout ce que la barre possède —
   * le libellé, le champ, son ✕, la liste, la ligne « d'autres correspondent » — vit dedans. Un clic sur une
   * suggestion est donc un clic DEDANS, et c'est son propre `onMouseDown` qui ouvre la fiche : ce garde-fou ne
   * peut pas le lui voler.
   *
   * ⚠️ `mousedown` ET `touchstart`, PAS `blur` : le champ perd le focus aussi quand on clique une suggestion, et
   * un `blur` aurait vidé le champ avant que le clic n'aboutisse — exactement le défaut que `onMouseDown`
   * contourne déjà dans la liste.
   *
   * ⚠️ RIEN À ÉCOUTER QUAND LE CHAMP EST VIDE : on n'attache le garde-fou que lorsqu'il a quelque chose à
   * effacer, et il se détache de lui-même ensuite.
   */
  useEffect(() => {
    if (texte === '') return;
    const dehors = (e: Event): void => {
      const cible = e.target;
      if (cible instanceof Node && racine.current?.contains(cible) === true) return;
      fermerEtVider();
    };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('touchstart', dehors);
    return () => {
      document.removeEventListener('mousedown', dehors);
      document.removeEventListener('touchstart', dehors);
    };
  }, [texte, fermerEtVider]);

  /**
   * 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — LE FOCUS À L'OUVERTURE, quand l'écran le demande. L'écran Annuaire n'a
   * plus que cette barre : y arriver sans pouvoir taper obligerait à un clic pour rien.
   */
  useEffect(() => {
    if (focusAuMontage) champ.current?.focus();
  }, [focusAuMontage]);

  /**
   * 🔴 LE CLAVIER, EN ENTIER (Arno) : flèches pour parcourir, Entrée pour ouvrir, Échap pour refermer. Le
   * déplacement lui-même vient du module PUR (`rangSuivant`), parce que c'est la partie qui se trompe.
   *
   * ⚠️ ENTRÉE SANS SÉLECTION NE FAIT RIEN plutôt que d'ouvrir la première : on n'ouvre pas une fiche que
   * personne n'a désignée.
   *
   * 🔴🔴 ÉCHAP VIDE AUSSI LE CHAMP depuis le lot ECRAN-ANNUAIRE-MINIMAL : il refermait la liste en laissant la
   * saisie, et la frappe suivante la rouvrait sur un terme qu'on croyait abandonné.
   */
  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    const liste = suggestions ?? [];
    if (e.key === 'Escape') { fermerEtVider(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setRang((r) => rangSuivant(r, liste.length, e.key === 'ArrowDown' ? 'bas' : 'haut'));
      return;
    }
    if (e.key === 'Enter' && rang >= 0 && liste[rang] !== undefined) {
      e.preventDefault();
      ouvrir(liste[rang]);
    }
  };

  const liste = suggestions ?? [];
  return (
    <div className="gst-annuaire" ref={racine}>
      <style>{CSS_BARRE_ANNUAIRE}</style>
      {/* ══ 🔴🔴 LOT ANNUAIRE-BLOC-DEDIE, POINT 2 — LE LIBELLÉ PASSE À GAUCHE, DANS LA CAPSULE ════════════════
          Arno : « le libellé “Annuaire” passe à GAUCHE du champ. Libellé + champ forment une seule capsule à
          fond BLANC, un peu plus haute qu'aujourd'hui, pour donner de l'importance à l'outil. Le libellé est en
          gras, bien lisible, séparé du champ par un léger trait vertical. Le bouton ✕ reste dans la capsule. »

          🔴 UNE SEULE CAPSULE, ET LE CHAMP N'EN A PLUS : c'est l'enveloppe qui porte le fond, le bord et le
          liseré de focus (`:focus-within`), et le champ y est posé nu. Deux cadres imbriqués se seraient vus.

          🔴 LE ✕ EST CELUI DU NAVIGATEUR (`type="search"`), et il vit DANS le champ, donc dans la capsule : il
          n'a pas bougé. En écrire un à la main aurait ajouté un bouton là où le navigateur en met déjà un.

          ⚠️ LE LIBELLÉ EST UN VRAI `label`, lié au champ : il le NOMME pour un lecteur d'écran au lieu d'être un
          mot décoratif posé à côté. C'est ce qui permet de retirer l'`aria-label`, qui le doublait. */}
      <div className="gst-annuaire-capsule">
        <label className="gst-annuaire-mot" htmlFor={`${idListe}-champ`}>Annuaire</label>
        <input ref={champ} id={`${idListe}-champ`} type="search" className="gst-annuaire-champ"
          value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={auClavier}
          placeholder="Chercher un locataire, un propriétaire, une adresse…"
          role="combobox" aria-expanded={liste.length > 0} aria-controls={idListe}
          aria-autocomplete="list"
          aria-activedescendant={rang >= 0 && liste[rang] !== undefined ? `${idListe}-${rang}` : undefined} />
      </div>

      {/* ⚠️ RIEN TANT QU'ON N'A PAS CHERCHÉ : `suggestions === null` veut dire « on n'a pas encore demandé », et
          c'est différent de « on a demandé et il n'y a rien ». Afficher « Aucun contact » sur un champ vide
          apprendrait à ignorer la phrase. */}
      {suggestions !== null && (
        liste.length === 0
          ? <p className="gst-annuaire-vide" role="status">
            {occupe
              ? 'Recherche…'
              /* 🔴🔴 TROIS PHRASES POUR TROIS FAITS DISTINCTS, et surtout pas une seule : « on cherche »,
                 « l'annuaire n'est pas installé », « personne ne correspond ». Les confondre apprendrait a
                 lire la troisieme comme un simple « pas de chance ». */
              : sansSchema
                ? 'L’annuaire n’est pas encore installé sur cette base (mise à jour 253 à appliquer).'
                : 'Aucun contact trouvé.'}
          </p>
          : (
            <ul className="gst-annuaire-liste" id={idListe} role="listbox" aria-label="Contacts trouvés"
              ref={boiteListe}
              style={hauteurListe === null ? undefined : { maxHeight: `${hauteurListe}px` }}>
              {liste.map((s, i) => (
                <li key={s.cle} id={`${idListe}-${i}`} role="option" aria-selected={i === rang}>
                  {/* ⚠️ `onMouseDown` ET NON `onClick` : le champ perd le focus au clic, ce qui referme la liste
                      avant que le clic n'aboutisse. `onMouseDown` part avant le `blur`. */}
                  <button type="button"
                    className={`gst-annuaire-item${i === rang ? ' gst-annuaire-item--vise' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); ouvrir(s); }}
                    onMouseEnter={() => setRang(i)}>
                    <span className="gst-annuaire-nom">{s.nom}</span>
                    {/* 🔴🔴 LOT ANNUAIRE-CAPSULES-TAMISEES — ROUGE pour un propriétaire, VERT pour un locataire,
                        mais TAMISÉS : fond pâle, texte foncé, sur le modèle exact de l'entrée active du menu de
                        gauche. Les jetons existent déjà dans le thème, avec leur variante Sombre.

                        🔴🔴 REQUALIFIÉ LE 07/10/2026 — LOT ANCIENS-LOCATAIRES-VIOLET. Il disait « VERT pour un
                        locataire (ANCIEN COMPRIS) » : Arno tranche autrement — « l'Annuaire : la capsule “Ancien
                        locataire” (aujourd'hui verte) passe en violet ». Le vert reste donc au locataire EN
                        PLACE, et le rôle `ancien` — que le module pur distinguait DÉJÀ — porte enfin sa couleur.
                        Le MOT, lui, ne change pas d'un caractère : c'est lui qui porte l'information. */}
                    <span className={`gst-annuaire-role gst-annuaire-role--${s.role}`}>{s.mot}</span>
                    {/* 🔴 L'ADRESSE DISTINGUE LES HOMONYMES, et elle ne porte PAS le numéro de lot (Arno). */}
                    {s.lieu !== null && <span className="gst-annuaire-lieu">{s.lieu}</span>}
                    {/* 🔴🔴 LOT ANNUAIRE-MENTION-PARENTHESES — « (Propriétaire de X biens au total) », APRÈS
                        l'adresse et dans le MÊME gris (Arno : « style discret, dans le gris de l'adresse »).
                        Elle ne paraît qu'à partir de deux biens EN GESTION — voir `mentionBiens`. */}
                    {s.mention !== null && <span className="gst-annuaire-lieu">{s.mention}</span>}
                  </button>
                </li>
              ))}
              {/* ══ 🔴🔴 LOT ECRAN-ANNUAIRE-MINIMAL — UNE LISTE COUPÉE LE DIT ════════════════════════════════
                  Le serveur rend au plus 60 personnes et signale qu'il a plafonné (`tronque`). Sans cette
                  ligne, on lisait les premières en croyant les avoir toutes — le défaut mesuré par Arno le
                  26/09/2026 sur l'ancien écran (« puvis » : 76 logements, 60 montrés, 16 disparus sans un mot).

                  🔴 AUCUN NOMBRE DANS LA PHRASE, ET C'EST VOLONTAIRE : le nombre de SUGGESTIONS n'est pas le
                  nombre de PERSONNES — une personne à double rôle en donne deux. Annoncer « 60 » serait faux
                  une fois sur deux ; « d'autres correspondent » est vrai à chaque fois.

                  ⚠️ `role="presentation"` : ce n'est pas une option de la liste, on ne doit pas pouvoir la
                  viser aux flèches ni l'ouvrir. `role="status"` la fait DIRE par un lecteur d'écran.
                  ⚠️ ELLE EST DANS LA LISTE, donc mesurée comme une ligne par `hauteurEntiereDans` : la boîte
                  ne s'arrête jamais au milieu de l'avertissement. */}
              {tronque && (
                <li className="gst-annuaire-tronque" role="presentation">
                  <span role="status">D’autres contacts correspondent — précisez votre recherche.</span>
                </li>
              )}
            </ul>
          )
      )}
    </div>
  );
}

/**
 * ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul terminerait.
 *
 * LE CHAMP PREND TOUTE LA LARGEUR et le mot « Annuaire » se pose a sa DROITE (Arno). La liste se pose PAR-DESSUS
 * les deux colonnes (position absolue) : la pousser vers le bas ferait sauter tout l'ecran a chaque frappe.
 */
const CSS_BARRE_ANNUAIRE = `
.gst-annuaire{position:relative}
/* ══ LOT ANNUAIRE-BLOC-DEDIE, POINT 2 — LIBELLE + CHAMP, UNE SEULE CAPSULE ══
   Fond BLANC (la surface du theme : en Sombre, c'est elle qui donne le contraste — un blanc en dur y serait
   illisible), un peu plus haute qu'avant (52 px contre 44) pour donner du poids a l'outil, et le liseré de focus
   porte par l'enveloppe plutot que par le champ : deux cadres imbriques se seraient vus.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.gst-annuaire-capsule{display:flex;align-items:stretch;min-height:52px;
  border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-surface);
  overflow:hidden}
.gst-annuaire-capsule:focus-within{outline:2px solid var(--color-svv-red);outline-offset:1px}
/* Le libelle A GAUCHE, en gras, separe du champ par un trait vertical discret (Arno). */
.gst-annuaire-mot{display:flex;align-items:center;flex:0 0 auto;padding:0 14px;
  font-size:15px;font-weight:700;color:var(--color-svv-ink);
  border-right:1px solid var(--color-svv-line);cursor:text}
.gst-annuaire-champ{flex:1 1 auto;min-width:0;padding:0 14px;font-size:16px;
  border:0;background:transparent;color:var(--color-svv-ink)}
.gst-annuaire-champ:focus-visible{outline:none}
.gst-annuaire-liste,.gst-annuaire-vide{position:absolute;top:56px;left:0;right:0;z-index:30;
  margin:0;padding:0;list-style:none;max-height:min(60vh,380px);overflow:auto;
  background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  box-shadow:0 8px 24px rgba(0,0,0,.12)}
.gst-annuaire-vide{padding:10px 12px;font-size:.88rem;color:var(--color-svv-muted)}
.gst-annuaire-item{display:flex;flex-wrap:wrap;align-items:baseline;gap:.5rem;width:100%;min-height:44px;
  padding:8px 12px;text-align:left;background:none;border:0;cursor:pointer;color:inherit;font:inherit}
.gst-annuaire-item--vise,.gst-annuaire-item:hover{background:var(--color-svv-field)}
.gst-annuaire-item:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
.gst-annuaire-nom{font-weight:700;color:var(--color-svv-ink)}
/* ══ LOT ANNUAIRE-CAPSULES-TAMISEES — LA CAPSULE DE ROLE EST TAMISEE, PAS EN APLAT ══
   DEMANDE D'ARNO (07/10/2026) : « sur le modele exact de l'entree active “Gestion” du menu de gauche : fond clair
   teinte, texte de la couleur foncee, pas d'aplat ».

   🔴 CE SONT LES JETONS DE CETTE ENTREE-LA, repris tels quels : le menu actif s'ecrit
   « background:var(--color-svv-green-soft);color:var(--color-svv-green-ink) » (.svv-adm-link[data-actif]), et
   « Locataire » en est la copie. Une teinte approchante aurait donne deux verts pales dans la meme page.

   🔴 LE PENDANT ROUGE EXISTAIT DEJA DANS LE THEME, il n'y avait rien a creer : --color-svv-red-soft est ne comme
   « pendant ROUGE de green-soft » (globals.css), et son commentaire dit lui-meme avec quoi l'ecrire — « texte =
   red-dark ». Les deux portent leur variante Sombre depuis le meme fichier : la capsule suit donc les trois
   themes sans rien dire d'eux.

   ⚠️ SEULES LES COULEURS CHANGENT : la taille, le gras, l'espacement des lettres et les coins arrondis sont
   exactement ceux d'avant.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.gst-annuaire-role{font-size:.72rem;font-weight:700;letter-spacing:.03em;padding:1px 7px;border-radius:999px;
  color:var(--color-svv-bg);background:var(--color-svv-ink)}
.gst-annuaire-role--proprietaire{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark)}
.gst-annuaire-role--locataire{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
/* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — la capsule « Ancien locataire », dans la paire tamisee violette du theme
   (lot 84 ; contrastes mesures 5,48:1 en Clair, 7,74:1 en Sombre). */
.gst-annuaire-role--ancien_locataire{background:var(--color-svv-violet-soft);color:var(--color-svv-violet)}
.gst-annuaire-lieu{font-size:.82rem;color:var(--color-svv-muted)}
/* ══ LOT ECRAN-ANNUAIRE-MINIMAL — LA LIGNE « D'AUTRES CORRESPONDENT » ══
   DISCRETE (Arno) : le gris des adresses, un filet au-dessus pour la detacher des suggestions, et aucun relief
   qui la ferait passer pour une ligne cliquable — elle informe, elle n'agit pas.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.gst-annuaire-tronque{padding:8px 12px;font-size:.78rem;color:var(--color-svv-muted);
  border-top:1px solid var(--color-svv-line)}
/* Sur telephone, la capsule garde sa forme : c'est le libelle qui se resserre, jamais le champ qui disparait. */
@media (max-width: 560px){
  .gst-annuaire-mot{padding:0 10px;font-size:14px}
  .gst-annuaire-champ{padding:0 10px}
}
`;
