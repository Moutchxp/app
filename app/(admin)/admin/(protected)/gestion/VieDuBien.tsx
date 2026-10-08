'use client';

import { useEffect, useState } from 'react';
import { CSS_PIECES, PiecesJointes } from './PiecesJointes';
/* 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 5 — LA MÊME LECTURE QUE LA CONVERSATION, et pas un second chemin :
   la fonction a été DÉPLACÉE dans ce module partagé, elle n'a pas été recopiée. */
import { chargerCorpsDuMessage } from './chargerCorps';
// 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 5 — « voir dans Gmail » sur une piece non conservee.
import { lienGmail, COMPTE_GESTION_DEFAUT } from '../../../../lib/gestion/gmailMenu';
import { dateHeureCourte, formaterTaille, libelleSens } from '../../../../lib/gestion/ecran';
import { corpsLisible, etatTrombone, motTrombone, trierPieces } from '../../../../lib/gestion/lisibilite';
import { nettoyerObjet } from '../../../../lib/gestion/objet';
/* 🔴🔴 LOT PJ-STATUT-ENVOI-FAMILLES — les FAMILLES destinataires remplacent les parties : une famille de
   plus (Interne), « non affecté » devenu Extérieur, et le Cci compté quand on le connaît. */
import type { FamilleVue } from '../../../../lib/gestion/familleDestinataire';
/* 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — les noms de pièces cités dans le corps. Voir l'encadré du module. */
import {
  decouperLesPiecesCitees, piecesCiteesAilleurs, type PieceCitable,
} from '../../../../lib/gestion/piecesCitees';
import { motCapsule, tonCapsule, type CapsuleStatut } from '../../../../lib/gestion/statutClassement';
/* 🔴 LOT MARQUES-EVENEMENT-EN-COURS — le mot de la capsule orange, écrit UNE fois pour les quatre écrans. */
import { motEvenementEnCours } from '../../../../lib/gestion/evenementQualite';
// 🔴🔴 LOT CONTACTS-EXTERNES — le mot du rôle instantané, écrit UNE fois dans le module PUR.
import { motRoleInstantane } from '../../../../lib/gestion/contactExterne';
import type { LigneHistorique } from '../../../../lib/gestion/historique';
/* 🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — le découpage des mots surlignés vit dans le module PUR : il est
   éprouvé sans écran, et il ne rend jamais de HTML. */
import { decouperPourSurligner, motTonDeMail, type TonMail } from '../../../../lib/gestion/historiqueBien';
/* 🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE — l'adresse trouvée et son rôle. Importé en TYPE : rien de `pg` n'entre. */
import type { AdresseTrouvee } from '../../../../lib/gestion/rechercheAdresses';
/* 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — le nom ET l'adresse d'un destinataire, séparés (module pur). */
import type { PersonneDuMail } from '../../../../lib/gestion/adressesMessage';
/* 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — le mot du bouton vient du module pur, comme tous les autres. */
import {
  MOT_MODIFIER_LE_RATTACHEMENT, MOT_SORTIR_DU_SUIVI,
} from '../../../../lib/gestion/sortirDuSuivi';

/**
 * LOT FICHES-ANNUAIRE (étape B) — « LA VIE DU BIEN » : TOUS SES MAILS, DANS LA FICHE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEMANDE D'ARNO, MOT POUR MOT : « VIE DU BIEN : tous les mails rattachés à ce bien, en ordre
 * antéchronologique, dans le même format de ligne que la boîte (capsules, trombone gris/noir, triangle ▶/▼,
 * dépliable sur place). Avec leurs pièces jointes (œil Visualiser, lien Drive) et leurs événements. Filtres
 * simples : Tous / avec pièces jointes / avec événement ouvert, plus une recherche. »
 *
 * 🔴 « LE MÊME FORMAT DE LIGNE QUE LA BOÎTE » N'EST PAS UNE RESSEMBLANCE : ce sont les MÊMES fonctions pures qui
 * décident. `capsuleStatut` pour la capsule, `etatTrombone`/`motTrombone` pour le trombone, `trierPieces` pour ce
 * qui compte comme pièce. En réécrire une seule ici donnerait, un jour, deux verdicts pour un même mail — et c'est
 * celui qu'on regarde le moins qui garderait l'erreur.
 *
 * 🔴 LE TROMBONE DIT OÙ EST LA PIÈCE, comme dans la boîte : NOIR quand elle est dans CE mail, GRIS quand elle est
 * ailleurs dans la conversation. Ici chaque ligne EST un mail, donc « ailleurs » ne se pose pas — mais la règle
 * passe par la même fonction, et l'info-bulle dit laquelle des deux en toutes lettres.
 *
 * ⚠️ LES PIÈCES SONT RENDUES PAR `PiecesJointes`, LE COMPOSANT EXISTANT — miniature, œil « Visualiser »,
 * « Télécharger », « Drive ». On n'en écrit pas un second.
 *
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` : les types passent par `import type`, effacé à la compilation.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-2 — OÙ CE BLOC EST SUPPRIMÉ, ET OÙ IL RESTE LE SEUL LISTING ════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ACCORD EXPLICITE D'ARNO, 04/10/2026, mot pour mot : « le bloc “Vie du bien” est SUPPRIMÉ (deux listings de
 * mails, c'est un de trop). Le moteur de recherche prend SA PLACE (**juste sous “Historique des locataires”**). »
 *
 * 🔴 CET ACCORD PORTE SUR LA FICHE D'UN **BIEN**, ET SUR ELLE SEULE — « juste sous Historique des locataires » est
 * une place qui n'existe que là. C'est là qu'il y avait DEUX listings de mails (celui-ci et le moteur), et c'est
 * ce doublon qui est supprimé : `VueLot` ne monte plus ce composant, le moteur occupe son rang et son ancre.
 *
 * 🔴 SUR LA FICHE D'UN **LOCATAIRE**, IL EST LE SEUL LISTING, ET IL RESTE. `VueLocataire` le monte pour montrer
 * « les échanges de SON logement » — il n'y a là aucun doublon, donc rien de ce qu'Arno a motivé. Le retirer
 * aurait supprimé une fonctionnalité qu'il n'a pas ouverte, ce que la consigne permanente interdit en toutes
 * lettres : « Hors de “Vie du bien” (accord donné), ne retire, ne masque et ne conditionne aucune fonctionnalité
 * sans l'accord d'Arno. » 🔭 **Question posée à Arno** : veut-il le moteur là aussi, ou ce listing tel quel ?
 *
 * 🔴 ET CE FICHIER PORTE CE QUE LE MOTEUR RÉUTILISE. `LigneVie` est LA ligne de courrier du moteur (« reçu de… » /
 * « nous avons écrit… », capsules, trombone, date, triangle ▸, dépliage sur place), et `CSS_VIE_DU_BIEN` son
 * style, qu'emporte `CSS_HISTORIQUE_DU_BIEN`. Les déménager aurait été une recopie déguisée — même code, nouvel
 * endroit, deux historiques de modification à relire le jour d'un défaut.
 *
 * ⚠️ CE QUE LE MOTEUR A REPRIS, UN À UN, pour que « rien n'est perdu » soit vérifiable et non promis :
 *   · la recherche « dans l'objet et le texte » → `Reglages.texte` + le champ du pavé OPTIONS ;
 *   · le filtre « Avec pièces jointes »        → `Reglages.pieces`, avec son complément « Sans pièce jointe » ;
 *   · le filtre « Avec événement ouvert »      → `Reglages.evenementOuvert` + son bouton, et le cartouche y
 *                                                 arrive DÉJÀ allumé (`evenementOuvertInitial`) ;
 *   · le dépliage par le triangle ▸            → `LigneVie`, inchangée ;
 *   · la sélection d'un mail                   → `onOuvrirFil`, passée telle quelle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
/** Les trois filtres d'Arno, et rien de plus : un filtre qu'on n'utilise pas est un filtre qu'on relit. */
export type FiltreVie = 'tous' | 'pieces' | 'evenement';

export const FILTRES_VIE: { cle: FiltreVie; mot: string }[] = [
  { cle: 'tous', mot: 'Tous' },
  { cle: 'pieces', mot: 'Avec pièces jointes' },
  { cle: 'evenement', mot: 'Avec événement ouvert' },
];

type Etat =
  | { v: 'charge' }
  | { v: 'erreur'; message: string }
  | { v: 'ok'; lignes: LigneHistorique[]; suite: boolean; total: number };

/** Le temps de silence après la dernière frappe avant d'interroger : assez court pour paraître instantané. */
const ATTENTE_FRAPPE_MS = 250;

export function VieDuBien({ lotCle, maintenant, onOuvrirFil, filtreInitial = 'tous' }: {
  /** La clé WIPPIMMO du lot — la cible de l'historique, et la seule identité qui survive à un ré-import. */
  lotCle: string;
  maintenant: Date;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /**
   * 🔴 LOT FICHES-RETOUCHES-2 — LE FILTRE DE DÉPART. Le cartouche « Événement en cours » d'une carte de bien mène
   * ici avec `'evenement'` : on arrive sur les échanges qui portent un événement ouvert, et non sur la liste
   * entière qu'il faudrait filtrer soi-même.
   *
   * ⚠️ C'EST UN DÉPART, PAS UNE CONTRAINTE : les trois filtres restent cliquables, et le premier clic reprend la
   * main. Un filtre imposé ferait croire que le bien n'a que ces échanges-là.
   */
  filtreInitial?: FiltreVie;
}) {
  const [filtre, setFiltre] = useState<FiltreVie>(filtreInitial);
  const [texte, setTexte] = useState('');
  const [page, setPage] = useState(0);
  const [etat, setEtat] = useState<Etat>({ v: 'charge' });
  const [deplie, setDeplie] = useState<Set<number>>(new Set());

  /**
   * ⚠️ TOUT CHANGEMENT DE FILTRE REMET À LA PREMIÈRE PAGE. Sans cela, filtrer depuis la page 3 afficherait « rien
   * à voir » sur un résultat qui en a douze — et l'on croirait le filtre vide.
   */
  useEffect(() => { setPage(0); }, [filtre, texte]);

  useEffect(() => {
    let vivant = true;
    setEtat((e) => (e.v === 'ok' ? e : { v: 'charge' }));
    const minuterie = setTimeout(() => {
      void (async () => {
        try {
          const p = new URLSearchParams({ cible: `lot-${lotCle}`, taille: '25', page: String(page) });
          if (filtre === 'pieces') p.set('pieces', 'avec');
          if (filtre === 'evenement') p.set('evt', 'ouvert');
          if (texte.trim() !== '') p.set('q', texte.trim());
          const res = await fetch(`/api/admin/gestion/historique?${p}`, { cache: 'no-store' });
          const d = (await res.json()) as {
            etat?: string;
            data?: { lignes?: LigneHistorique[]; suite?: boolean; entete?: { nbMails?: number } };
          };
          if (!vivant) return;
          if (d.etat !== 'ok') { setEtat({ v: 'erreur', message: 'La vie du bien n’a pas pu être lue.' }); return; }
          setEtat({
            v: 'ok', lignes: d.data?.lignes ?? [], suite: d.data?.suite === true,
            total: d.data?.entete?.nbMails ?? 0,
          });
        } catch {
          if (vivant) setEtat({ v: 'erreur', message: 'La vie du bien n’a pas pu être lue : le serveur n’a pas répondu.' });
        }
      })();
    }, texte.trim() === '' ? 0 : ATTENTE_FRAPPE_MS);
    return () => { vivant = false; clearTimeout(minuterie); };
  }, [lotCle, filtre, texte, page]);

  return (
    <section className="ann-bloc" aria-labelledby="ann-vie">
      <style>{CSS_PIECES}</style>
      <h4 className="ann-bloc-titre" id="ann-vie">
        Vie du bien
        {etat.v === 'ok' && <span className="gst-compte">{etat.total}</span>}
      </h4>

      {/* ══ LES FILTRES — trois boutons et une recherche. Le filtre actif est dit par `aria-pressed` ET par son
          aspect : une couleur seule ne dirait pas lequel est allumé à qui ne la voit pas. */}
      <div className="vdb-filtres" role="group" aria-label="Filtrer la vie du bien">
        {FILTRES_VIE.map((f) => (
          <button key={f.cle} type="button" aria-pressed={filtre === f.cle}
            className={`vdb-filtre${filtre === f.cle ? ' vdb-filtre--actif' : ''}`}
            onClick={() => setFiltre(f.cle)}>{f.mot}</button>
        ))}
        <input type="search" className="ann-champ vdb-recherche" value={texte} autoComplete="off"
          aria-label="Chercher dans les mails de ce bien"
          placeholder="Chercher dans l’objet et le texte…"
          onChange={(e) => setTexte(e.target.value)} />
      </div>

      {etat.v === 'charge' ? <p className="gst-info" role="status">Chargement…</p>
        : etat.v === 'erreur' ? <p className="gst-erreur" role="status">{etat.message}</p>
          : etat.lignes.length === 0 ? (
            <p className="ann-gris" role="status">
              {filtre === 'tous' && texte.trim() === ''
                ? 'Aucun mail rattaché à ce bien.'
                : 'Aucun mail ne correspond à ce filtre.'}
            </p>
          ) : (
            <>
              <ol className="vdb-liste">
                {etat.lignes.map((l) => (
                  <LigneVie key={`${l.messageId}`} l={l} maintenant={maintenant}
                    ouvert={deplie.has(l.messageId)}
                    onBasculer={() => setDeplie((s) => {
                      const n = new Set(s);
                      if (n.has(l.messageId)) n.delete(l.messageId); else n.add(l.messageId);
                      return n;
                    })}
                    onOuvrirFil={onOuvrirFil} />
                ))}
              </ol>
              {/* ⚠️ « VOIR LA SUITE » PLUTÔT QUE TOUT CHARGER : le lot le plus fourni compte 429 mails. */}
              <div className="vdb-pages">
                {page > 0 && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n - 1)}>← Page précédente</button>
                )}
                {etat.suite && (
                  <button type="button" className="svv-btn svv-btn-outline gst-btn"
                    onClick={() => setPage((n) => n + 1)}>Voir la suite →</button>
                )}
              </div>
            </>
          )}
    </section>
  );
}

/**
 * ══ 🔴 UNE LIGNE, DANS L'IDIOME DE LA BOÎTE ═══════════════════════════════════════════════════════════════════
 *
 * Triangle ▶/▼ à GAUCHE, VOISIN de la ligne et jamais son enfant — un bouton dans un bouton est du HTML invalide
 * et injouable au clavier (règle posée au lot LECTURE-HTML-FIL-TROMBONE, et éprouvée là-bas).
 *
 * Le triangle est invisible au clavier (`tabIndex=-1`, `aria-hidden`) : l'action vit déjà sur la ligne, qui porte
 * `aria-expanded`. Deux arrêts de tabulation pour un seul geste, et un lecteur d'écran annoncerait deux boutons.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-1 — EXPORTÉE, ET POUR UNE SEULE RAISON ═══════════════════════════════════════════
 *
 * DEMANDE D'ARNO (04/10/2026) : « LE FIL : même présentation que les mails de “Vie du bien” (“reçu de…” / “nous
 * avons écrit…”, badge de statut, objet, aperçu, trombone, date). **RÉUTILISE ce composant, ne le recopie pas.** »
 *
 * 🔴 LA RECOPIE ÉTAIT LE PIÈGE. Deux rendus d'une même ligne de courrier divergent au premier ajustement — et
 * c'est le second qu'on oublie. Ce dépôt l'a déjà payé plusieurs fois (deux listes de domaines, deux règles de
 * repli, trois listes de types d'images). Le nouveau bloc « Historique » rend donc EXACTEMENT cette ligne-ci.
 *
 * ⚠️ AUCUN CONTENU N'A CHANGÉ ICI : ni le rendu, ni les classes, ni les props, ni une virgule du corps. Seul le
 * mot-clé `export` a été ajouté — même geste que `CHOIX_SUIVI` au lot BROUILLONS-APERCU-TYPES-LIBELLES, et pour
 * la même raison. « Vie du bien » continue de l'appeler sans savoir qu'un autre écran l'appelle aussi.
 */
/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — TOUTES LES ADRESSES D'UN MAIL DÉPLIÉ ══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), mot pour mot : « Au-dessus de “À :”, une ligne “De : Nom <adresse>”. “À :” liste
 * TOUS les destinataires, à la suite sur la même ligne (retour à la ligne propre si c'est long). Ligne “Cc :” si
 * des personnes sont en copie. Cci seulement si on le connaît (nos envois). Chaque adresse porte la petite
 * pastille de couleur de sa catégorie (rouge propriétaire, vert locataire, bleu tiers, gris non affecté, rien
 * pour l'agence), avec une info-bulle sur la catégorie. Lisible en Clair et en Sombre. »
 *
 * 🔴 « RIEN POUR L'AGENCE » EST UNE RÈGLE, PAS UN OUBLI : nous ne sommes pas une partie du bien, et nous poser
 * une pastille de couleur nous mettrait sur le même plan qu'un propriétaire. C'est `tonDeLExpediteur` qui rend
 * déjà `'nous'` pour nos adresses, et ce composant n'en peint aucune.
 *
 * ⚠️ UNE LIGNE QUI SE REPLIE, ET NON UNE COLONNE : Arno demande « à la suite sur la même ligne (retour à la
 * ligne propre si c'est long) ». Chaque destinataire est donc un bloc insécable (`white-space: nowrap` sur la
 * pastille et son nom) dans un conteneur qui passe à la ligne entre deux destinataires — jamais au milieu d'une
 * adresse.
 *
 * ⚠️ L'ADRESSE EST TOUJOURS ÉCRITE, MÊME QUAND LE NOM EXISTE : « Jean PONS <jb.pons@…> ». C'est l'adresse qui
 * identifie quelqu'un, et c'est elle qu'on recopie pour chercher ailleurs ; un nom seul oblige à rouvrir le
 * mail dans Gmail pour savoir à qui l'on a écrit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
function UneAdresse({ p, tonDe }: { p: PersonneDuMail; tonDe?: (adresse: string) => TonMail | null }) {
  const ton = tonDe === undefined ? null : tonDe(p.adresse);
  /* 🔴 AUCUNE PASTILLE POUR NOUS NI POUR L'INCONNU : « rien pour l'agence » (Arno), et rien non plus quand
     l'appelant ne sait pas répondre — une pastille grise par défaut aurait fait passer tout le monde pour
     « non affecté », ce qui est une affirmation. */
  const peint = ton !== null && ton !== 'nous';
  return (
    <span className="vdb-qui">
      {peint && (
        <span className={`vdb-pastille vdb-pastille--${ton}`} title={motTonDeMail(ton)}
          aria-label={motTonDeMail(ton)} />
      )}
      {p.nom !== null && <span className="vdb-qui-nom">{p.nom}</span>}
      <span className="vdb-qui-adr">{p.nom === null ? p.adresse : `<${p.adresse}>`}</span>
    </span>
  );
}

function LigneAdresses({ mot, gens, tonDe }: {
  mot: string; gens: readonly PersonneDuMail[]; tonDe?: (adresse: string) => TonMail | null;
}) {
  if (gens.length === 0) return null;
  return (
    <p className="vdb-dest">
      <span className="vdb-dest-mot">{mot} :</span>
      {gens.map((p, i) => (
        <UneAdresse key={`${p.adresse}-${i}`} p={p} tonDe={tonDe} />
      ))}
    </p>
  );
}

function AdressesDuMail({ l, tonDe }: {
  l: LigneHistorique; tonDe?: (adresse: string) => TonMail | null;
}) {
  return (
    <div className="vdb-adresses">
      {/* 🔴 « DE » EN PREMIER, AU-DESSUS DE « À » — demande d'Arno, et c'est l'ordre d'un en-tête de courrier. */}
      <LigneAdresses mot="De" gens={[{ nom: l.deNom, adresse: l.de }]} tonDe={tonDe} />
      <LigneAdresses mot="À" gens={l.a} tonDe={tonDe} />
      <LigneAdresses mot="Cc" gens={l.cc} tonDe={tonDe} />
      {/* ⚠️ « Cci » SEULEMENT SI ON LE CONNAÎT : on ne sait la copie cachée d'un mail REÇU que si l'on y était.
          Une ligne « Cci : — » sur un mail reçu laisserait croire qu'il n'y en avait pas. */}
      <LigneAdresses mot="Cci" gens={l.cci} tonDe={tonDe} />
      {/* ⚠️ LE REPLI DU DÉPÔT RESTE VISIBLE quand la liste ancienne était bornée et que la neuve est vide : un
          mail d'avant la capture des champs `jsonb` n'a que `destinataires`. Le taire aurait fait disparaître
          des destinataires qu'on affichait hier. */}
      {l.a.length === 0 && l.cc.length === 0 && l.destinataires.length > 0 && (
        <p className="vdb-dest"><span className="vdb-dest-mot">À :</span> {l.destinataires.join(', ')}</p>
      )}
    </div>
  );
}

export function LigneVie({
  l, maintenant, ouvert, onBasculer, onOuvrirFil, surligner = [], tonDe, sortieDuSuivi, modifierRattachement,
  onVisualiser,
  destinataires = [], piecesCitables = [], adressesTrouvees = [],
}: {
  l: LigneHistorique; maintenant: Date; ouvert: boolean; onBasculer: () => void;
  onOuvrirFil?: (filId: number, messageId?: number | null) => void;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « SORTIR DU SUIVI », À DROITE DE L'EN-TÊTE DÉPLIÉ ═════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « Bouton “Sortir du suivi”, à DROITE du bloc d'en-tête du mail déplié (ligne
   * “nous avons écrit… / Objet… / pour … · via …”), discret, bordure rouge fine. »
   *
   * ⚠️ ABSENT ⇒ AUCUN BOUTON, ET LES TROIS AUTRES ÉCRANS NE BOUGENT PAS D'UN PIXEL. Cette ligne est montée par
   * quatre écrans (Historique du bien, fiche d'un locataire, Vie du bien, Annuaire) ; seul le premier connaît
   * un bien dont on puisse sortir. Une propriété facultative est le seul chemin sans régression — c'est déjà la
   * règle de `tonDe` et de `surligner` juste au-dessous.
   *
   * 🔴 ET IL N'APPARAÎT QUE DÉPLIÉ, parce qu'Arno l'a demandé « dans le mail déplié » : un bouton de détachement
   * sur chacune des cent lignes repliées d'un fil serait une rangée de boutons rouges qu'on finit par cliquer.
   */
  sortieDuSuivi?: { aide: string; onSortir: () => void };
  /**
   * 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — le second bouton, voisin du premier. Absent ⇒ il n'est pas rendu,
   * et la ligne est exactement celle d'avant ce lot.
   */
  modifierRattachement?: { aide: string; onModifier: () => void };
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 3 — L'ŒIL DU MAIL DÉPLIÉ ═════════════════════════════════════════════
   *
   * CONSTAT D'ARNO : la visionneuse doit être « rétablie PARTOUT où l'œil existe », mail déplié compris.
   *
   * 🔴 ET SANS CETTE PROPRIÉTÉ, L'ŒIL N'EXISTAIT PAS ICI. `PiecesJointes` ne l'affiche que si on lui passe un
   * rappel (`voirIci`), et la raison écrite là-bas était la même que celle qui a cassé le résumé : « il n'y a
   * pas de conversation dont on puisse faire le tour » sur un écran qui mêle plusieurs échanges. C'était la
   * même confusion — le tour vaut ce qu'on lui donne, et « les pièces de cette sélection » est un tour légitime.
   *
   * ⚠️ FACULTATIVE ⇒ LES TROIS AUTRES ÉCRANS NE BOUGENT PAS D'UN PIXEL. Cette ligne est montée par quatre
   * écrans ; seul « Historique du bien » a une visionneuse à ouvrir. C'est déjà la règle de `tonDe`, de
   * `surligner` et de `sortieDuSuivi` juste au-dessus.
   */
  onVisualiser?: (pieceId: number) => void;
  /**
   * 🔴🔴 LOT HISTORIQUE-BIEN-14, POINT 2 — les parties à qui NOUS avons envoyé ce mail, pour les lignes
   * « → envoyé à la partie … » sous ses miniatures.
   *
   * ⚠️ VIDE PAR DÉFAUT ⇒ LES TROIS AUTRES ÉCRANS NE BOUGENT PAS. Seul « Historique du bien » connaît les
   * catégories d'un bien ; la fiche d'un locataire n'en a aucune à lire. Même règle que `tonDe`.
   */
  destinataires?: readonly FamilleVue[];
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — LES PIÈCES DE LA CONVERSATION, POUR LES NOMS CITÉS ═══════════════
   *
   * CONSTAT D'ARNO : le mail de Louis Vaglio du 30/06/2026 affiche trois noms de fichiers sans pièce jointe.
   * Vérifié dans Gmail : ce mail n'en porte AUCUNE — les noms sont ceux du mail CITÉ du 11/11/2025, et les
   * fichiers existent, sur d'autres mails du même fil.
   *
   * ⚠️ VIDE PAR DÉFAUT ⇒ LE CORPS EST RENDU D'UN BLOC, exactement comme avant ce lot. Les trois autres écrans
   * qui montent cette ligne ne connaissent pas les pièces d'une conversation : ils ne passent rien.
   */
  piecesCitables?: readonly PieceCitable[];
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — LA CATÉGORIE D'UNE ADRESSE, DEMANDÉE À L'APPELANT ═══════════════
   *
   * DEMANDE D'ARNO : « Chaque adresse porte la petite pastille de couleur de sa catégorie (rouge propriétaire,
   * vert locataire, bleu tiers, gris non affecté, rien pour l'agence), avec une info-bulle sur la catégorie. »
   *
   * 🔴 L'APPELANT RÉPOND, PARCE QUE LUI SEUL SAIT. Les catégories sont celles d'UN BIEN : la même adresse est
   * « locataire » sur un logement et « tiers » sur un autre. Cette ligne, elle, est montée par quatre écrans —
   * dont la fiche d'un locataire, qui n'a aucun bien en tête.
   *
   * ⚠️ ABSENTE ⇒ AUCUNE PASTILLE, et les trois autres écrans ne bougent pas d'un pixel. Les adresses s'y
   * affichent quand même : c'est la COULEUR qui manque, pas l'information.
   */
  tonDe?: (adresse: string) => TonMail | null;
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 5 — LES MOTS CHERCHÉS, SURLIGNÉS DANS L'APERÇU ═════════════════════════
   *
   * DEMANDE D'ARNO (05/10/2026) : « les mots trouvés sont surlignés dans l'aperçu ».
   *
   * ⚠️ VIDE PAR DÉFAUT, DONC AUCUN CHANGEMENT LÀ OÙ PERSONNE NE CHERCHE : la fiche d'un LOCATAIRE monte cette
   * même ligne et ne passe rien — son aperçu est, au caractère près, celui d'avant ce lot.
   *
   * 🔴 DES MORCEAUX, ET NON DU HTML. `decouperPourSurligner` rend des morceaux que React pose et échappe ; une
   * chaîne balisée aurait obligé à l'injecter sans échappement, c'est-à-dire à faire confiance au corps d'un
   * courrier que n'importe qui envoie.
   */
  surligner?: readonly string[];
  /**
   * ══ 🔴🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE (08/10/2026), POINT 4 — POURQUOI CE MAIL EST LÀ ═══════════════════
   *
   * ARNO : « Dans la liste des résultats, montre POURQUOI le mail correspond : l'adresse trouvée est
   * surlignée, avec une petite étiquette de son rôle (“expéditeur”, “destinataire”, “en copie”, “dans le
   * texte”). »
   *
   * 🔴 SANS CELA, LA RECHERCHE EST UNE BOÎTE NOIRE. Chercher « gohudif » et voir revenir neuf mails dont
   * l'objet, l'expéditeur et l'extrait ne portent pas le mot, c'est se demander si l'écran s'est trompé. La
   * réponse — « l'adresse est en copie, et la voici » — est la moitié de l'outil qu'Arno demande.
   *
   * ⚠️ FACULTATIVE, COMME `surligner` ET `tonDe` JUSTE AU-DESSUS, et pour la MÊME raison : cette ligne est
   * montée par QUATRE écrans (Historique du bien, fiche d'un locataire, Vie du bien, Annuaire). Seul le
   * premier porte un champ de recherche. Absente ⇒ la ligne est exactement celle d'avant ce lot, au pixel.
   */
  adressesTrouvees?: readonly AdresseTrouvee[];
}) {
  const { vraies, signatures } = trierPieces(l.pieces);
  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 5 — LE MAIL DÉPLIÉ MONTRE TOUT LE MESSAGE ══════════════════════════════
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * CONSTAT D'ARNO (05/10/2026) : « Le mail déplié affiche l'INTÉGRALITÉ du nouveau message (aujourd'hui il est
   * coupé : “Par ailleurs, avez-vou”), SANS l'historique cité en dessous. »
   *
   * 🔴 LA CAUSE N'ÉTAIT PAS LA DÉTECTION DE CITATION — elle marchait déjà, et c'est `corpsLisible`, celle de la
   * Conversation. La cause était en amont : la route de l'historique n'envoie que les **240 premiers
   * caractères** du corps (`EXTRAIT_MAX`), parce que cet extrait sert à reconnaître un mail dans une frise de
   * cent lignes. « Par ailleurs, avez-vou » EST le 240e caractère. Il n'y avait donc aucune citation à écarter :
   * elle commençait après la coupure.
   *
   * 🔴 LE CORPS COMPLET SE CHARGE AU DÉPLIAGE, et par la porte qui existe déjà — celle que la Conversation
   * emploie pour la même raison (« les autres arrivent avec `extrait` et se chargent au dépliage »). Un fil de
   * cent mails ne traverse pas le réseau pour qu'on en lise un.
   *
   * ⚠️ ON NE CHARGE QU'UNE FOIS, et seulement à l'ouverture : replier puis rouvrir ne redemande rien.
   *
   * ⚠️ EN CAS D'ÉCHEC, ON GARDE L'EXTRAIT — et surtout on n'affiche pas un vide. C'est la règle d'Arno pour la
   * citation (« si elle échoue sur un cas, affiche tout plutôt que de couper »), appliquée au chargement.
   * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  const [corpsEntier, setCorpsEntier] = useState<string | null>(null);
  useEffect(() => {
    if (!ouvert || corpsEntier !== null) return undefined;
    let vivant = true;
    void (async () => {
      const d = await chargerCorpsDuMessage(l.messageId);
      if (!vivant || d === undefined || d.texte === null || d.texte.trim() === '') return;
      setCorpsEntier(d.texte);
    })();
    return () => { vivant = false; };
  }, [ouvert, corpsEntier, l.messageId]);

  /**
   * 🔴 LA LIGNE REPLIÉE GARDE SON EXTRAIT (c'est tout ce qu'il faut pour reconnaître un mail) ; la ligne DÉPLIÉE
   * lit le corps entier dès qu'il est là. La même fonction écarte la citation dans les deux cas — une seule
   * règle, et c'est celle de la Conversation.
   */
  const lisible = l.extrait === null ? null : corpsLisible(l.extrait);
  const lisibleOuvert = corpsEntier !== null ? corpsLisible(corpsEntier) : lisible;
  /**
   * 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 0 — les pièces que ce mail CITE alors qu'il n'en porte aucune.
   *
   * ⚠️ SUR LE CORPS BRUT, citation comprise : c'est là que les noms sont écrits, et `corpsLisible` les retire.
   */
  const citees = piecesCiteesAilleurs(corpsEntier ?? l.extrait, piecesCitables, l.recuLe);
  // 🔴 LA MÊME RÈGLE QUE LA BOÎTE : les « ._ » et les images de signature ne comptent pas comme pièces.
  const trombone = etatTrombone(vraies.length, 0);
  const motDuTrombone = motTrombone(trombone);
  const ouverts = l.evenements.filter((e) => e.ouvert);

  return (
    <li className="vdb-item">
      <div className="vdb-rangee">
        <button type="button" className={`vdb-triangle${ouvert ? ' vdb-triangle--ouvert' : ''}`}
          aria-hidden="true" tabIndex={-1} onClick={onBasculer}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M5 3l5 4-5 4z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" className="vdb-ligne" aria-expanded={ouvert} onClick={onBasculer}>
          <span className="vdb-haut">
            <span className="vdb-qui">
              {libelleSens(l.sens)} {(l.deNom ?? '').trim() === '' ? l.de : l.deNom}
            </span>
            {l.statut !== null && (
              <span className={`vdb-capsule vdb-capsule--${tonCapsule(l.statut as CapsuleStatut)}`}
                title={l.statutDetail ?? undefined}>
                {motCapsule(l.statut as CapsuleStatut)}
              </span>
            )}
            {/**
              * 🔴🔴 LOT MARQUES-EVENEMENT-EN-COURS — LE MOT VIENT DU MODULE PUR, ET N'EST PLUS ÉCRIT ICI.
              *
              * La capsule ne change ni de place ni de couleur : elle reste juste après celle de statut, dans la
              * paire AMBRE qu'Arno appelle « orange » et qui porte déjà « événement en cours » sur cette fiche.
              *
              * ⚠️ SON MOT, LUI, CHANGE — « Événement ouvert » devient « Événement en cours ». C'est demandé, et
              * c'est celui de la bande de l'en-tête : une même chose dite de deux façons sur un même écran se lit
              * comme deux choses. Les trois autres écrans du lot lisent la MÊME fonction.
              */}
            {motEvenementEnCours(ouverts.length) !== null && (
              <span className="vdb-capsule vdb-capsule--evt">{motEvenementEnCours(ouverts.length)}</span>
            )}
            {motDuTrombone !== null && (
              <span className="vdb-trombone" title={motDuTrombone} aria-label={motDuTrombone}>
                <span aria-hidden="true">📎</span>{vraies.length}
              </span>
            )}
            <span className="vdb-quand">{dateHeureCourte(l.recuLe, maintenant)}</span>
          </span>
          <span className="vdb-objet">Objet : {nettoyerObjet(l.objet ?? '') || '(sans objet)'}</span>
          {/* ══ 🔴🔴 LOT CONTACTS-EXTERNES — « pour MARTY Jean-François (locataire sortant) · via Me Martin, avocat »
              Demande d'Arno : le mail apparaît ici « avec le rôle instantané et le contact externe ».
              ⚠️ LE RÔLE EST CELUI DU JOUR DU MAIL, et il ne bougera plus : c'est ce qui permet de relire un
              courrier d'avocat de 2025 sans le faire mentir. Vide ⇒ rien n'est affiché, et la ligne est celle
              d'avant ce lot — c'est le cas de l'immense majorité du courrier. */}
          {(l.interventions ?? []).length > 0 && (
            <span className="vdb-via">
              {(l.interventions ?? []).map((x) => (
                <span key={`${x.sorte}-${x.libelle}`} className="vdb-via-qui">
                  pour {x.libelle} <span className="vdb-via-role">({motRoleInstantane(x.role).toLowerCase()})</span>
                  {x.via !== null && <> · <span className="vdb-via-contact">{x.via}</span></>}
                </span>
              ))}
            </span>
          )}
          {/**
            * ══ 🔴🔴 POINT 4 — LES ADRESSES QUI EXPLIQUENT LA CORRESPONDANCE ═══════════════════════════════
            *
            * 🔴 DANS LA LIGNE REPLIÉE COMME DÉPLIÉE : c'est en PARCOURANT la liste qu'on cherche à comprendre
            * pourquoi un mail y figure. Les montrer seulement une fois le mail ouvert obligerait à déplier
            * chacun des neuf résultats pour trouver le bon.
            *
            * ⚠️ L'ADRESSE EST SURLIGNÉE AU MÊME ENDROIT QUE LE RESTE (`decouperPourSurligner`, module pur,
            * qui rend des MORCEAUX que React échappe) : on ne colle pas de HTML, même pour une adresse —
            * elle vient d'un courrier que n'importe qui envoie.
            */}
          {adressesTrouvees.length > 0 && (
            <span className="vdb-adresses">
              {adressesTrouvees.map((x) => (
                <span key={`${x.role}-${x.adresse}`} className="vdb-adresse">
                  <span className="vdb-adresse-role">{x.mot}</span>
                  <span className="vdb-adresse-mot">
                    {surligner.length === 0
                      ? x.adresse
                      : decouperPourSurligner(x.adresse, surligner).map((m, i) => (
                        m.trouve
                          ? <mark key={`${i}-${m.texte}`} className="vdb-trouve">{m.texte}</mark>
                          : <span key={`${i}-${m.texte}`}>{m.texte}</span>
                      ))}
                  </span>
                </span>
              ))}
            </span>
          )}
          {!ouvert && lisible !== null && lisible.visible !== '' && (
            <span className="vdb-extrait">
              {surligner.length === 0
                ? lisible.visible
                : decouperPourSurligner(lisible.visible, surligner).map((m, i) => (
                  m.trouve
                    ? <mark key={`${i}-${m.texte}`} className="vdb-trouve">{m.texte}</mark>
                    : <span key={`${i}-${m.texte}`}>{m.texte}</span>
                ))}
            </span>
          )}
        </button>
        {/* 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — LE BOUTON EST LE **VOISIN** DE LA LIGNE, jamais son enfant :
            l'en-tête entier EST un `<button>`, et un bouton dans un bouton n'est pas du HTML valide. C'est
            exactement la raison pour laquelle le triangle vit à gauche, en frère, depuis le lot d'origine. */}
        {ouvert && sortieDuSuivi !== undefined && (
          <button type="button" className="vdb-sortir" title={sortieDuSuivi.aide}
            aria-label={sortieDuSuivi.aide} onClick={sortieDuSuivi.onSortir}>
            {MOT_SORTIR_DU_SUIVI}
          </button>
        )}
        {/* ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 1 — « MODIFIER LE RATTACHEMENT », SON VOISIN ═════════════
            Arno : « À côté de “Sortir du suivi”, même style, un second bouton ». Même classe, donc même
            dessin : deux boutons de même rang doivent se ressembler, sans quoi l'un paraît plus grave.

            ⚠️ VOISIN DE LA LIGNE, COMME L'AUTRE, et jamais son enfant : l'en-tête entier EST un `<button>`, et
            un bouton dans un bouton n'est pas du HTML valide. */}
        {ouvert && modifierRattachement !== undefined && (
          <button type="button" className="vdb-sortir" title={modifierRattachement.aide}
            aria-label={modifierRattachement.aide} onClick={modifierRattachement.onModifier}>
            {MOT_MODIFIER_LE_RATTACHEMENT}
          </button>
        )}
      </div>

      {/* ⚠️ LE DÉTAIL S'OUVRE SUR PLACE : on ne quitte pas la fiche pour lire un mail de ce bien. */}
      {ouvert && (
        <div className="vdb-detail">
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — DE / À / CC / CCI, TOUTES LES ADRESSES ══════════════════
              DEMANDE D'ARNO (05/10/2026) : « Au-dessus de “À :”, une ligne “De : Nom <adresse>”. “À :” liste
              TOUS les destinataires, à la suite sur la même ligne (retour à la ligne propre si c'est long).
              Ligne “Cc :” si des personnes sont en copie. Cci seulement si on le connaît (nos envois). Chaque
              adresse porte la petite pastille de couleur de sa catégorie […] avec une info-bulle. »

              🔴 CE QUE CELA REMPLACE : une seule ligne « À : » qui mêlait le À ET le Cc, bornée à six, suivie
              de « et d'autres ». On ne savait donc ni qui était en copie, ni combien manquaient, ni qui avait
              écrit — l'expéditeur n'était nulle part dans le détail.

              ⚠️ LES LISTES SONT COMPLÈTES, SANS BORNE. Mesuré : le pire mail du dépôt porte 52 destinataires,
              et la moyenne est de 1,15. C'est une ligne qui se replie, pas une liste qui explose. */}
          <AdressesDuMail l={l} tonDe={tonDe} />
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 3 — LES NOMS DE PIÈCES CITÉS DEVIENNENT DE PETITS LIENS ════
              DEMANDE D'ARNO : « chaque nom cité "<fichier.ext>" qui correspond à une pièce réelle de la MÊME
              conversation devient un petit lien discret (trombone + nom) qui ouvre cette pièce dans la
              visionneuse, avec l'info-bulle "pièce du mail du 11/11/2025". Sans correspondance, le texte reste
              tel quel. Aucun ajout de pièce au mail lui-même. »

              🔴 DES MORCEAUX, ET NON DU HTML : le corps d'un mail est écrit par n'importe qui. Rendre une
              chaîne balisée aurait obligé à l'injecter sans échappement, c'est-à-dire à faire confiance à
              l'expéditeur. C'est la règle de `decouperPourSurligner`, et elle vaut double ici. */}
          {lisibleOuvert !== null && lisibleOuvert.visible !== '' && (
            <p className="vdb-corps">
              {decouperLesPiecesCitees(lisibleOuvert.visible, piecesCitables, l.recuLe).map((m, i) => (
                m.sorte === 'texte'
                  ? <span key={i}>{m.texte}</span>
                  : (
                    <button key={i} type="button" className="vdb-piece-citee" title={m.aide}
                      aria-label={`${m.texte} — ${m.aide}`}
                      disabled={onVisualiser === undefined}
                      onClick={() => onVisualiser?.(m.pieceId)}>
                      <span aria-hidden="true">📎</span>{m.texte}
                    </button>
                  )
              ))}
            </p>
          )}
          {l.evenements.length > 0 && (
            <p className="vdb-evts">
              {l.evenements.map((e) => (
                <span key={e.id} className={`vdb-capsule${e.ouvert ? ' vdb-capsule--evt' : ' vdb-capsule--gris'}`}>
                  {e.reference} — {e.objet}{e.ouvert ? '' : ' (traité)'}
                </span>
              ))}
            </p>
          )}
          {l.pieces.length > 0 && (
            <PiecesJointes messageId={l.messageId} filId={l.filId} vraies={vraies} signatures={signatures}
              onVisualiser={onVisualiser} destinataires={destinataires}
              gmailDuMail={lienGmail(COMPTE_GESTION_DEFAUT, { messageIdRfc: l.messageIdRfc })} />
          )}
          {/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-3, POINT 4 — LE MOT D'ARNO ════════════════════════════════════════════
              « “Ouvrir l'échange →” devient “Voir la conversation d'origine →”. Il ouvre la conversation dont le
              mail est tiré. »

              🔴 LE LIBELLÉ CHANGE ICI, DONC AUX DEUX ENDROITS QUI MONTENT CETTE LIGNE — le bloc « Historique »
              d'une fiche de bien et le listing de la fiche d'un LOCATAIRE. C'est voulu : c'est le même geste et
              la même destination, et deux libellés pour une même action se mettraient à divergEr. Le nouveau mot
              est d'ailleurs le plus juste des deux partout : il dit qu'on quitte une LISTE pour aller voir la
              conversation D'OÙ le mail est tiré.

              🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 6 — IL EST EN BAS À DROITE DU MAIL DÉPLIÉ (demande d'Arno). Il
              est donc rendu EN DERNIER dans le détail, et poussé à droite par son enveloppe : c'est une SORTIE,
              et une sortie se place là où le regard finit, pas au milieu de ce qu'on lit. */}
          {/* ══ 🔴🔴 LOT CLASSER-PAR-LA-MODALE, POINT 0 — « AUCUNE PIÈCE JOINTE » MENAIT À UNE IMPASSE ═══════
              CONSTAT D'ARNO (06/10/2026) : sur le mail du 30/06/2026 (fil 3366), le mail déplié annonce
              « Aucune pièce jointe » « parce que la citation est masquée ». Il a raison, et le mail n'a bien
              AUCUNE pièce (vérifié dans Gmail : 18 118 octets, ni `attachments` ni `attachmentIds`). Ce qui
              était faux, c'est de s'arrêter là : le texte cité nomme trois documents que nous avons.

              SA RÈGLE : « Aucune pièce jointe à ce mail — il cite 3 pièces du mail du 11/11/2025 : » suivi des
              liens (trombone + nom) qui ouvrent la visionneuse. Même rendu que dans la conversation.

              🔴 ON LIT LE CORPS ENTIER, CITATION COMPRISE, et c'est tout l'objet : `lisibleOuvert.visible`
              écarte justement la partie où les noms sont écrits. Le découpage du corps, lui, garde la partie
              visible — les deux ne regardent pas la même chose, et c'est voulu.

              ⚠️ AUCUNE PIÈCE N'EST AJOUTÉE AU MAIL : le trombone, le résumé des pièces et les compteurs
              continuent de dire qu'il n'en porte pas, parce qu'il n'en porte pas. */}
          {l.pieces.length === 0 && (citees === null ? (
            <p className="ann-gris">
              {formaterTaille(0) === '' ? '' : ''}Aucune pièce jointe.
            </p>
          ) : (
            <p className="ann-gris vdb-citees">
              <span className="vdb-citees-mot">{citees.mot}</span>
              {citees.pieces.map((p) => (
                <button key={p.pieceId} type="button" className="vdb-piece-citee" title={p.aide}
                  aria-label={`${p.nom} — ${p.aide}`}
                  disabled={onVisualiser === undefined}
                  onClick={() => onVisualiser?.(p.pieceId)}>
                  <span aria-hidden="true">📎</span>{p.nom}
                </button>
              ))}
            </p>
          ))}
          {onOuvrirFil && (
            <p className="vdb-sortie">
              <button type="button" className="gst-lien-bouton"
                onClick={() => onOuvrirFil(l.filId, l.messageId)}>Voir la conversation d’origine →</button>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export const CSS_VIE_DU_BIEN = `
/* AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul accent grave
   terminerait — piege consigne onze fois dans ce depot, et onze fois dans un commentaire. */
.vdb-filtres{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem}
.vdb-filtre{background:var(--color-svv-surface);border:1px solid var(--color-svv-line-strong);
  border-radius:999px;padding:.3rem .8rem;font:inherit;font-size:.8rem;color:var(--color-svv-muted);
  cursor:pointer;min-height:36px}
.vdb-filtre:hover{color:var(--color-svv-ink);border-color:var(--color-svv-line-strong-hover)}
/* LE FILTRE ACTIF se dit par son ASPECT *et* par aria-pressed : une couleur seule ne dit rien a qui ne la voit pas. */
.vdb-filtre--actif{background:var(--color-svv-ink);border-color:var(--color-svv-ink);color:var(--color-svv-surface);
  font-weight:700}
.vdb-filtre:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.vdb-recherche{flex:1 1 13rem;min-width:0;min-height:36px;font-size:.85rem}
.vdb-liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.vdb-item{background:var(--color-svv-surface);border:1px solid var(--color-svv-line);border-radius:10px;
  box-shadow:0 1px 2px rgba(22,32,44,.05);overflow:hidden}
.svv-adm-root[data-theme='dark'] .vdb-item{box-shadow:0 1px 2px rgba(0,0,0,.3)}
@media (prefers-color-scheme:dark){
  .svv-adm-root:not([data-theme='light']) .vdb-item{box-shadow:0 1px 2px rgba(0,0,0,.3)}
}
/* LE TRIANGLE EST LE VOISIN DE LA LIGNE, jamais son enfant : un bouton dans un bouton est du HTML invalide. */
.vdb-rangee{display:flex;align-items:stretch;min-width:0}
.vdb-triangle{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:26px;
  background:none;border:0;padding:0;margin:0;cursor:pointer;color:var(--color-svv-red)}
.vdb-triangle svg{transition:transform .15s ease}
.vdb-triangle--ouvert svg{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.vdb-triangle svg{transition:none}}
.vdb-ligne{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:.15rem;align-items:stretch;
  text-align:left;background:none;border:0;padding:8px 12px 8px 0;font:inherit;color:inherit;cursor:pointer}
/* ══ 🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 2 — LA TRAME DE SURVOL COUVRE TOUTE LA LIGNE D'EN-TETE ════════════
   CONSTAT D'ARNO (06/10/2026) : « Au survol, la zone "nous avons ecrit … / Objet … / date" prend une trame plus
   foncee, mais pas le bout de ligne qui porte les boutons a droite. »

   🔴 LA CAUSE TENAIT EN UN SELECTEUR : la trame etait posee sur .vdb-ligne, qui est le BOUTON de l'en-tete —
   or le triangle et les deux boutons de droite sont ses VOISINS (un bouton dans un bouton est du HTML invalide,
   c'est la regle de ce fichier depuis son origine). La trame s'arretait donc a leurs bords.

   🔴 ELLE EST DESORMAIS POSEE SUR LA RANGEE ENTIERE, qui les contient tous les trois : toute la ligne s'allume
   au meme instant, y compris sous « Sortir du suivi » et « Modifier le rattachement ».

   ⚠️ LA RANGEE NE CONTIENT PAS LE DETAIL DEPLIE (.vdb-detail est sa SŒUR) : survoler le corps du mail
   n'allume donc pas son en-tete, et c'est bien ce qu'on veut — l'en-tete est ce qui se clique.
   ⚠️ UN SEUL JETON, celui d'avant : la trame ne change pas de couleur, elle change d'etendue. Clair et Sombre
   suivent le jeton, comme partout ailleurs. */
.vdb-rangee:hover{background:var(--color-svv-field)}
.vdb-ligne:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:-2px}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 1 — « SORTIR DU SUIVI », DISCRET, BORDURE ROUGE FINE ════════════════════
   Arno : « a DROITE du bloc d'en-tete du mail deplie […], discret, bordure rouge fine. »

   🔴 DISCRET VEUT DIRE : PAS DE FOND, PAS DE GRAS, UN TEXTE EN RETRAIT. Le bouton retire un mail d'un dossier —
   il doit se trouver quand on le cherche, et ne pas appeler le clic quand on lit. C'est le survol qui l'allume.

   ⚠️ align-self:flex-start ET NON stretch : la rangee est en align-items:stretch, et sans cela le bouton aurait
   pris toute la hauteur du bloc deplie — une colonne rouge de la hauteur d'un mail.
   ⚠️ flex:0 0 auto : il ne doit jamais prendre la place de l'objet, qui est l'information de la ligne.
   ⚠️ AUCUN ACCENT GRAVE DANS CE BLOC : il fermerait le litteral de gabarit (piege vu plus de dix fois). */
.vdb-sortir{flex:0 0 auto;align-self:flex-start;margin:8px 0 0 .5rem;padding:3px 8px;
  font:inherit;font-size:.74rem;line-height:1.3;color:var(--color-svv-muted);background:none;
  border:1px solid var(--color-svv-red);border-radius:.4rem;cursor:pointer;white-space:nowrap}
.vdb-sortir:hover{color:var(--color-svv-red);background:var(--color-svv-field)}
.vdb-sortir:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.vdb-haut{display:flex;flex-wrap:wrap;align-items:center;gap:.45rem;min-width:0}
.vdb-qui{font-size:.88rem;font-weight:700;color:var(--color-svv-ink);overflow-wrap:anywhere}
.vdb-quand{margin-left:auto;font-size:.76rem;color:var(--color-svv-muted);flex:0 0 auto}
.vdb-objet{font-size:.84rem;font-weight:600;color:var(--color-svv-ink);overflow-wrap:anywhere}
/* ══ 🔴🔴 LOT RECHERCHE-MAILS-PAR-ADRESSE, POINT 4 — LES ADRESSES QUI EXPLIQUENT LA CORRESPONDANCE ════════════
   Une rangee de petites pastilles sous l'objet : l'etiquette du role en gris, l'adresse a cote, le morceau
   cherche surligne par la regle commune.
   ⚠️ ELLE S'ENROULE (flex-wrap) : un mail peut porter la meme adresse en trois roles, et une rangee qui
   deborde pousserait la largeur de toute la liste.
   ⚠️ AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
.vdb-adresses{display:flex;flex-wrap:wrap;gap:4px 8px;margin:2px 0 0}
.vdb-adresse{display:inline-flex;align-items:baseline;gap:4px;max-width:100%;
  padding:1px 6px;border-radius:999px;background:var(--color-svv-field);
  border:1px solid var(--color-svv-line);font-size:.72rem}
.vdb-adresse-role{font-weight:700;color:var(--color-svv-muted);white-space:nowrap}
.vdb-adresse-mot{color:var(--color-svv-ink);overflow-wrap:anywhere}
.vdb-extrait{font-size:.8rem;color:var(--color-svv-muted);overflow:hidden;text-overflow:ellipsis;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
/* LES MOTS TROUVES, surlignes dans l'apercu (lot HISTORIQUE-BIEN-3, point 5). Jetons seulement : lisible dans
   les deux themes, et c'est un <mark>, donc un lecteur d'ecran l'annonce comme une mise en valeur. */
.vdb-trouve{background:var(--color-svv-amber-soft);color:var(--color-svv-ink);font-weight:700;
  border-radius:3px;padding:0 1px}
/* 🔴🔴 LOT CONTACTS-EXTERNES — « pour MARTY Jean-Francois (locataire sortant) · via Me Martin, avocat ».
   Elle s'enroule d'elle-meme quand la largeur manque : sur un telephone, une ligne de plus vaut mieux qu'un nom
   tronque au milieu. Le ROLE est entre parentheses et le contact en italique — deux informations de nature
   differente, et l'oeil doit pouvoir les separer sans les lire. */
.vdb-via{display:flex;flex-wrap:wrap;gap:.1rem .6rem;font-size:.78rem;color:var(--color-svv-muted);min-width:0}
.vdb-via-qui{overflow-wrap:anywhere}
.vdb-via-role{font-weight:600}
.vdb-via-contact{font-style:italic}
/* LES CAPSULES — les memes MOTS que la boite, et les memes tons. Le mot porte l'information, le ton l'appuie. */
.vdb-capsule{font-size:.68rem;font-weight:700;border-radius:999px;padding:.1rem .5rem;border:1px solid transparent;
  flex:0 0 auto}
.vdb-capsule--vert{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink);
  border-color:var(--color-svv-green-soft)}
.vdb-capsule--rouge{background:var(--color-svv-red-soft);color:var(--color-svv-red-dark);
  border-color:var(--color-svv-red-soft)}
.vdb-capsule--gris{background:var(--color-svv-field);color:var(--color-svv-muted);
  border-color:var(--color-svv-line)}
.vdb-capsule--evt{background:var(--color-svv-amber-soft);color:var(--color-svv-amber);
  border-color:var(--color-svv-amber-soft)}
/* LE TROMBONE : NOIR (encre) quand la piece est dans CE mail. Son infobulle dit laquelle des deux situations. */
.vdb-trombone{font-size:.76rem;font-weight:600;color:var(--color-svv-ink);flex:0 0 auto}
.vdb-detail{border-top:1px solid var(--color-svv-line);padding:10px 12px 12px 26px;
  display:flex;flex-direction:column;gap:.5rem;background:var(--color-svv-field)}
/* ══ 🔴🔴 LOT HISTORIQUE-BIEN-10, POINT 3 — DE / A / CC / CCI, AVEC LEURS PASTILLES ════════════════════════════
   DEMANDE D'ARNO : « “A :” liste TOUS les destinataires, A LA SUITE SUR LA MEME LIGNE (retour a la ligne propre
   si c'est long) ». D'ou un conteneur en flex qui passe a la ligne ENTRE deux destinataires, et un
   destinataire qui ne se coupe jamais en deux (voir flex-wrap).
   ⚠️ AUCUN ACCENT GRAVE DANS CES COMMENTAIRES : ils vivent DANS un litteral gabarit, qu'un seul terminerait. */
.vdb-adresses{display:flex;flex-direction:column;gap:.15rem;margin:0 0 .3rem}
.vdb-dest{margin:0;font-size:.8rem;color:var(--color-svv-muted);display:flex;flex-wrap:wrap;
  align-items:baseline;gap:.1rem .45rem}
/* Le mot (De / A / Cc / Cci) a une largeur fixe : les quatre lignes s'alignent, et l'oeil descend tout droit. */
.vdb-dest-mot{flex:0 0 auto;min-width:2.1rem;font-weight:700;color:var(--color-svv-ink)}
/* UN destinataire = un bloc insecable. Le retour a la ligne se fait ENTRE deux, jamais au milieu d'une adresse —
   sauf si une seule adresse depasse la largeur, auquel cas overflow-wrap la coupe plutot que de deborder. */
.vdb-qui{display:inline-flex;align-items:baseline;gap:.25rem;max-width:100%;overflow-wrap:anywhere}
.vdb-qui-nom{color:var(--color-svv-ink)}
.vdb-qui-adr{color:var(--color-svv-muted)}
/* LA PASTILLE : un rond plein de 8 px, aligne sur la ligne de base du texte. Les quatre tons sont des JETONS,
   donc lisibles en Clair comme en Sombre ; « nous » n'en a pas — nous ne sommes pas une partie du bien. */
.vdb-pastille{flex:0 0 auto;width:8px;height:8px;border-radius:999px;transform:translateY(-1px)}
.vdb-pastille--rouge{background:var(--color-svv-red)}
.vdb-pastille--vert{background:var(--color-svv-green)}
/* 🔴 LOT ANCIENS-LOCATAIRES-VIOLET — LE CINQUIEME TON. Le jeton --color-svv-violet existe dans les DEUX modes
   (lot 84), avec ses contrastes mesures : rien n'est invente ici, et aucun #rrggbb n'est ecrit a la main. */
.vdb-pastille--violet{background:var(--color-svv-violet)}
.vdb-pastille--bleu{background:var(--color-svv-blue)}
.vdb-pastille--gris{background:var(--color-svv-line-strong)}
.vdb-corps{margin:0;font-size:.86rem;color:var(--color-svv-ink);white-space:pre-wrap;overflow-wrap:anywhere}
.vdb-evts{margin:0;display:flex;flex-wrap:wrap;gap:.35rem}
/* LOT CLASSER-PAR-LA-MODALE, POINT 0 — « Aucune piece jointe a ce mail — il cite 3 pieces du mail du … : »
   LA PHRASE PREND TOUTE LA LARGEUR (flex-basis 100%), les liens se rangent dessous et se replient d'eux-memes :
   trois noms de PDF ne tiennent pas sur une ligne de telephone, et une phrase coupee en deux morceaux par un
   nom de fichier ne se lit plus. Le lien lui-meme garde son habillage commun (.vdb-piece-citee). */
.vdb-citees{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem .5rem}
.vdb-citees-mot{flex-basis:100%}
.vdb-pages{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.2rem}
/* 🔴🔴 LOT HISTORIQUE-BIEN-4, POINT 6 — LA SORTIE VERS LA CONVERSATION EST EN BAS A DROITE DU MAIL DEPLIE.
   Le detail est une colonne : cette ligne est la derniere, et son contenu est pousse a droite. Un
   margin-top:auto n'a rien a faire ici (la colonne n'a pas de hauteur imposee) ; c'est l'ORDRE dans le JSX
   qui met la sortie en bas, et justify-content qui la met a droite. Sur un telephone elle reste a droite :
   c'est un seul bouton, il ne deborde pas. */
.vdb-sortie{margin:0;display:flex;justify-content:flex-end}
`;
