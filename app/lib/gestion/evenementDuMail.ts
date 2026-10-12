/**
 * ══ 🔴🔴 LOT BOUTON-EVENEMENT-ET-RATTACHEMENT-EN-LECTURE — « ÉVÉNEMENT DE CE MAIL » ══════════════════════════════════
 *
 * DÉCISION D'ARNO (12/10/2026, accord donné pour ce déplacement) : « les ACTIONS sur l'événement quittent la fenêtre
 * “Modifier le rattachement” et passent dans une fenêtre dédiée. Rien n'est supprimé : tout est DÉPLACÉ. »
 *
 *   · un 3e bouton « Événement » sur le mail déplié, à côté de « Sortir du suivi » et « Modifier le rattachement » ;
 *   · il ouvre « Événement de ce mail » : A) lier ce mail (one shot) à un événement déjà ouvert, B) créer un
 *     événement à partir de ce mail ;
 *   · le bloc « Événement rattaché » de « Modifier le rattachement » ne garde que la LECTURE.
 *
 * 🔴 AUCUNE PORTE D'ÉCRITURE NEUVE : lier, créer et retirer passent par la route qui le faisait déjà
 * (`/messages/<id>/affectation` — POST `{ evenementId }`, POST `{ nouveau }`, DELETE), donc même journal et même
 * réversibilité. Ce module est PUR : il ne fait que des mots et des corps de requête.
 */

/** Le mot du 3e bouton, court comme ses deux voisins. */
export const MOT_EVENEMENT_DU_MAIL = 'Événement';

/** Le titre de la fenêtre. */
export const TITRE_EVENEMENT_DU_MAIL = 'Événement de ce mail';

/** L'info-bulle du bouton : ce qu'il ouvre. */
export const AIDE_EVENEMENT_DU_MAIL =
  'Lier ce mail à un événement déjà ouvert, ou créer un événement à partir de ce mail';

/** Les deux onglets, mot pour mot. */
export const ONGLET_LIER = 'Lier ce mail à un événement déjà ouvert (one shot)';
export const ONGLET_CREER = 'Créer un événement à partir de ce mail';

/**
 * 🔴🔴 LOT FENETRE-EVENEMENT-STRUCTUREE-ET-BLOC-PARTIES — CE QUE FONT VRAIMENT LES DEUX BOUTONS, lu dans le code :
 * « Garder pour la validation » ne fait que replier le formulaire en une ligne « À créer : « … » — Modifier » ; RIEN
 * n'est enregistré, et fermer la fenêtre perd la saisie. « Créer l'événement » écrit tout de suite (POST
 * `/messages/<id>/affectation`, `{ nouveau }`) : l'événement est créé, ouvert, et ce mail en est le premier.
 */
export const EXPLICATION_BOUTONS_CREER =
  'Garder pour la validation : replie le formulaire, rien n’est encore enregistré · '
  + 'Créer l’événement : l’événement est créé et ouvert tout de suite, avec ce mail comme premier mail';

/** La phrase du bloc en lecture seule de « Modifier le rattachement », mot pour mot (Arno). */
export const PHRASE_BLOC_LECTURE =
  'Pour créer un événement ou y lier ce mail, utilisez le bouton Événement du mail.';

/** Le libellé d'un bien dans ces fenêtres : « adresse — lot N », celui de « Modifier le rattachement ». PUR. */
export function libelleBienDuMail(b: { adresseComplete: string; numeroLot: string }): string {
  return `${b.adresseComplete} — lot ${b.numeroLot}`;
}

/** Une partie de la carte neuve : le bien, son propriétaire, son locataire. */
export type PartieCarteNeuve = { sorte: 'lot' | 'proprietaire' | 'locataire'; cle: string; libelle: string };

/**
 * LES PARTIES DE LA CARTE NEUVE — le bien, son propriétaire, son locataire (règle du lot CONTACTS-ET-EVENEMENT),
 * lues sur la fiche. Un bien sans fiche garde sa ligne « lot ». Sortie de `RattachementsDuFil` sans changement. PUR.
 */
export function partiesDesBiensFiche(
  biensFiche: ReadonlyArray<{ cle: string; personnes?: ReadonlyArray<{ role: string; cle: string; nom: string }> }>,
  voulus: ReadonlyArray<{ cle: string; libelle: string }>,
): PartieCarteNeuve[] {
  const out: PartieCarteNeuve[] = [];
  const parCle = new Map(biensFiche.map((b) => [b.cle, b]));
  for (const v of voulus) {
    out.push({ sorte: 'lot', cle: v.cle, libelle: v.libelle });
    for (const p of parCle.get(v.cle)?.personnes ?? []) {
      if (p.role === 'proprietaire' || p.role === 'locataire') out.push({ sorte: p.role, cle: p.cle, libelle: p.nom });
    }
  }
  return out;
}

/** Ce qu'un formulaire de création retient. `concernes` : le choix MODIFIÉ des personnes concernées, sinon `null`. */
export interface EvenementACreer {
  objet: string;
  categorie: string;
  urgence: string;
  ouvertLe: string | null;
  closLe: string | null;
  note: string | null;
  concernes?: { modifie: boolean; choix: unknown[] } | null;
}

/**
 * LE CORPS DE `POST /messages/<id>/affectation` POUR CRÉER — celui que « Modifier le rattachement » envoyait, mot
 * pour mot (lot CLASSER-PAR-LA-MODALE), sorti ici pour que la fenêtre « Événement de ce mail » envoie le MÊME.
 *
 * ⚠️ SANS LA MIGRATION 268 (`qualifie` faux), catégorie et urgence ne sont pas envoyées.
 * 🔴 UN CHOIX MODIFIÉ DES PERSONNES CONCERNÉES remplace les locataires du jour du mail (le propriétaire reste). PUR.
 */
export function corpsCreation(
  v: EvenementACreer, qualifie: boolean, parties: readonly PartieCarteNeuve[],
): { nouveau: Record<string, unknown> } {
  const modifie = v.concernes?.modifie === true;
  return {
    nouveau: {
      objet: v.objet.trim(),
      ...(qualifie ? { categorie: v.categorie === '' ? null : v.categorie } : {}),
      ...(qualifie ? { urgence: v.urgence === '' ? null : v.urgence } : {}),
      parties: modifie ? parties.filter((p) => p.sorte !== 'locataire') : [...parties],
      ...(modifie ? { concernes: v.concernes?.choix ?? [] } : {}),
      ouvertLe: v.ouvertLe,
      closLe: v.closLe,
      note: v.note,
    },
  };
}

/**
 * « remplacera GES-… » : un mail ne porte qu'UN événement en base (un rattachement actif par message) — lier à un
 * autre remplace l'actuel (lot f47dcafb). `null` quand rien n'est remplacé. PUR.
 */
export function phraseRemplacement(
  actuels: ReadonlyArray<{ id: number; reference: string }>, choisi: number | null,
): string | null {
  if (choisi === null) return null;
  const remplaces = actuels.filter((e) => e.id !== choisi);
  return remplaces.length === 0 ? null : `remplacera ${remplaces.map((e) => e.reference).join(', ')}`;
}

/** Le titre prérempli d'une carte neuve : le premier bien du mail (« adresse — lot »), sinon l'objet du mail. PUR. */
export function titrePrerempli(biens: ReadonlyArray<string>, objetDuMail: string | null | undefined): string {
  return biens[0] ?? (objetDuMail ?? '').trim();
}
