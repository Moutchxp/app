/**
 * MODULE « GESTION » — LOT CONTACTS-ET-EVENEMENT : DE QUOI S'AGIT-IL, ET EST-CE URGENT ? Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CE FICHIER EXISTE À PART. Ces listes et ces mots sont lus des DEUX côtés de la frontière : par le geste
 * serveur qui écrit la carte (`gestes.ts`, qui tire `pg`) ET par le bloc « Événement rattaché », qui est un
 * composant de NAVIGATEUR. Les laisser dans `gestes.ts` obligeait le navigateur à importer un module qui remonte
 * jusqu'à `pg`, donc jusqu'à `dns` — et webpack refuse alors de construire TOUTE l'application, page de connexion
 * comprise. C'est l'incident du 24/09/2026, et le garde `clientBoundary.guard.test.ts` l'a rattrapé ici même
 * pendant l'écriture de ce lot.
 *
 * ⚠️ AUCUN IMPORT, AUCUNE BASE, AUCUN React. Des constantes et quatre fonctions pures.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Les quatre catégories d'Arno, mot pour mot. La base les tient aussi (migration 268). */
export const CATEGORIES_EVENEMENT = ['travaux', 'fuite_eau', 'administratif', 'litige'] as const;

/** Les trois degrés d'urgence. Le MOT est toujours écrit à l'écran, jamais une couleur seule. */
export const URGENCES_EVENEMENT = ['normale', 'haute', 'critique'] as const;

/**
 * La catégorie retenue, ou `null`. PUR.
 *
 * ⚠️ ON N'INVENTE JAMAIS UNE CATÉGORIE QU'ON N'A PAS COMPRISE. Une valeur hors liste vaut « non précisé » — et la
 * contrainte de la base la refuserait de toute façon : deux gardes pour la même règle, parce qu'un garde applicatif
 * se contourne au prochain script et une contrainte non.
 */
export function categorieValide(brut: unknown): string | null {
  return typeof brut === 'string' && (CATEGORIES_EVENEMENT as readonly string[]).includes(brut) ? brut : null;
}

/** L'urgence retenue, ou `null`. PUR. */
export function urgenceValide(brut: unknown): string | null {
  return typeof brut === 'string' && (URGENCES_EVENEMENT as readonly string[]).includes(brut) ? brut : null;
}

/** Le mot d'une catégorie, tel qu'il s'affiche. PUR. */
export function motCategorie(c: string | null | undefined): string {
  if (c === 'travaux') return 'Travaux';
  if (c === 'fuite_eau') return 'Fuite d’eau';
  if (c === 'administratif') return 'Administratif';
  if (c === 'litige') return 'Litige';
  return 'Non précisée';
}

/** Le mot d'une urgence, tel qu'il s'affiche. PUR. */
export function motUrgence(u: string | null | undefined): string {
  if (u === 'critique') return 'Critique';
  if (u === 'haute') return 'Haute';
  if (u === 'normale') return 'Normale';
  return 'Non précisée';
}

/**
 * L'ÉVÉNEMENT EFFECTIF D'UN MAIL, tel que l'écran le reçoit. Le type vit ici, du côté PUR, pour que le composant
 * de navigateur n'ait aucune raison d'importer le dépôt qui le produit.
 */
export interface EvenementDuMail {
  evenementId: number;
  reference: string;
  objet: string;
  etat: string;
  /** `mail` = posé sur ce message seul ; `conversation` = hérité de son échange. */
  portee: 'mail' | 'conversation';
  categorie: string | null;
  urgence: string | null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT RATTACHEMENT-PONCTUEL, POINT 0 — LES DATES ET LA NOTE D'UNE CARTE NEUVE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   ACCORD D'ARNO (06/10/2026), mot pour mot : « ajoute au formulaire PARTAGÉ de création d'événement les trois
   champs “date d'ouverture” (préremplie à la date du mail quand on vient d'un mail, sinon aujourd'hui), “date de
   clôture” (facultative) et “note” (facultative), dans son unique chemin d'écriture ».

   🔴 AUCUNE MIGRATION N'A ÉTÉ NÉCESSAIRE, et c'est vérifié en base avant d'écrire une ligne : `gestion_evenement`
   porte DÉJÀ `ouvert_le` (NOT NULL, défaut `now()`), `traite_le` et `note`. Ce qui manquait n'était pas la place,
   c'était le chemin : la création ne nommait aucune de ces trois colonnes.

   🔴🔴 LA CONTRAINTE DE LA BASE DICTE LA RÈGLE, ET PAS L'INVERSE :
   `gestion_evenement_traite_chk :: CHECK ((etat = 'traite') = (traite_le IS NOT NULL))`. Donner une date de
   clôture à la création veut donc dire, en base comme en français, que la carte naît CLOSE — et son état doit
   être `traite`. Écrire l'une sans l'autre serait refusé par la base ; on l'écrit donc d'un seul geste.

   ⚠️ UNE CLÔTURE AVANT L'OUVERTURE EST REFUSÉE, et ce n'est pas un détail d'ergonomie : une carte close avant
   d'être ouverte fausse tous les comptes de durée, et personne ne la retrouverait pour la corriger.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Un jour civil `AAAA-MM-JJ`, ou `null` si ce n'en est pas un. PUR. */
export function jourCivil(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const j = brut.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return null;
  /* ⚠️ ON VÉRIFIE QUE LA DATE EXISTE, pas seulement sa forme : « 2026-02-31 » a la bonne forme et n'existe pas. */
  const d = new Date(`${j}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === j ? j : null;
}

/** Ce que le refus dit, quand il y en a un. Une phrase, pas un code. */
export const MOT_CLOTURE_AVANT_OUVERTURE =
  'La date de clôture ne peut pas précéder la date d’ouverture.';

export interface BornesEvenement {
  /** Le jour d'ouverture retenu, ou `null` = « laisse la base poser aujourd'hui ». */
  ouvertLe: string | null;
  /** Le jour de clôture retenu, ou `null` = la carte reste à traiter. */
  closLe: string | null;
  /** `null` = rien à redire. Sinon, la phrase à afficher, et RIEN n'est écrit. */
  refus: string | null;
}

/**
 * LES DEUX BORNES D'UNE CARTE NEUVE, VALIDÉES. PUR.
 *
 * ⚠️ UNE SAISIE ILLISIBLE VAUT « NON RENSEIGNÉE », jamais une erreur : un champ de date vidé rend `''`, et
 * refuser le geste pour cela aurait bloqué la création sur un champ facultatif.
 */
export function bornesEvenement(ouvertLeBrut: unknown, closLeBrut: unknown): BornesEvenement {
  const ouvertLe = jourCivil(ouvertLeBrut);
  const closLe = jourCivil(closLeBrut);
  if (ouvertLe !== null && closLe !== null && closLe < ouvertLe) {
    return { ouvertLe, closLe, refus: MOT_CLOTURE_AVANT_OUVERTURE };
  }
  return { ouvertLe, closLe, refus: null };
}

/**
 * La note retenue : tronquée au plafond, ou `null`. PUR.
 *
 * ⚠️ LE PLAFOND EST NOMMÉ ET NON DEVINÉ. La colonne est un `text` sans borne ; c'est donc l'écran qui doit en
 * poser une, sans quoi un copier-coller de dix pages entrerait dans une carte et la rendrait illisible partout
 * où elle s'affiche.
 */
export const NOTE_EVENEMENT_MAX = 2000;

export function noteEvenement(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const n = brut.trim();
  return n === '' ? null : n.slice(0, NOTE_EVENEMENT_MAX);
}
