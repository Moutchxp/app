/**
 * ══ 🔴🔴 TUILE LOCATION — ARCHIVER = SORTIR DU PORTEFEUILLE, MÊME AVEC UN LOCATAIRE EN PLACE (Arno, 18/10/2026). PUR. ═══
 *
 * « ARCHIVER = SORTIR DU PORTEFEUILLE, jamais d'effacement en base : le propriétaire et tous ses biens et annexes
 * quittent les listes actives et la recherche, restent consultables dans “Anciens” avec tout leur historique,
 * réactivables. Les locations en cours de ces biens sont closes à la date du jour ; les locataires concernés sont
 * archivés aussi, SAUF s'ils ont une location active sur un autre bien du portefeuille. Un bien partagé avec un autre
 * propriétaire actif n'est PAS archivé. » — et cela REMPLACE l'ancienne règle « sortie refusée si locataire en place »,
 * partout (propriétaire, bien, locataire), avec le même avertissement.
 *
 * Ce module ne lit rien : il décrit l'APERÇU (ce que l'archivage fera, calculé par `archivageRepo.ts`) et en tire le gros
 * bouton, les phrases de la modale et le motif du refus serveur quand l'avertissement n'a pas été confirmé.
 */
/** Les trois fiches qui sortent du portefeuille (même liste que `SujetPortefeuille` du dépôt, ici sans dépendance serveur). */
export type SujetPortefeuille = 'proprietaire' | 'locataire' | 'bien';

/** Une location EN COURS qui sera close à la date du jour. */
export interface LocationOccupee {
  occupationId: number;
  lotId: number;
  /** « 12 rue X, 75011 Paris » — ou `null` si le bien n'a pas d'adresse. */
  adresse: string | null;
  /** Le N° de lot (WIPPIMMO), tel que la Gestion l'affiche. */
  lot: string | null;
  locataireId: number;
  locataire: string;
  /** Date d'entrée (AAAA-MM-JJ) ou `null` si inconnue. */
  entree: string | null;
}

/** Un bien que l'archivage d'un propriétaire LAISSE dans le portefeuille : un autre propriétaire actif le détient. */
export interface BienPartage {
  lotId: number;
  adresse: string | null;
  lot: string | null;
  /** Les autres propriétaires actifs (noms). */
  autres: string[];
  /** Ce bien est-il loué ? (sa location reste ouverte : il n'est pas archivé) */
  occupe: boolean;
}

/** Un locataire dont la location est close mais qui reste actif : il loue un autre bien du portefeuille. */
export interface LocataireGarde {
  id: number;
  nom: string;
  /** L'adresse de l'autre bien loué. */
  ailleurs: string | null;
}

export interface ApercuArchivage {
  sujet: SujetPortefeuille;
  id: number;
  nom: string;
  /** Déjà sorti du portefeuille : quand, par qui (`null` = actif). */
  sortie: { le: string; par: string | null } | null;
  /** Les biens et annexes qui sortiront (identifiants). */
  biens: number[];
  partages: BienPartage[];
  occupees: LocationOccupee[];
  /** Les locataires archivés avec (identifiants), hors le sujet lui-même. */
  locatairesArchives: number[];
  locatairesGardes: LocataireGarde[];
}

export type EtatBouton = 'archiver' | 'alerte' | 'reactiver';

/** Le gros bouton : rouge sans location en cours, orange d'alerte s'il en reste une, « Réactiver » une fois archivé. */
export function etatBouton(a: Pick<ApercuArchivage, 'sortie' | 'occupees'>): EtatBouton {
  if (a.sortie !== null) return 'reactiver';
  return a.occupees.length > 0 ? 'alerte' : 'archiver';
}

export const LIBELLE_BOUTON: Record<EtatBouton, string> = {
  archiver: 'Archiver le propriétaire et son historique',
  alerte: 'Attention, au moins un bien est actuellement occupé par un locataire',
  reactiver: 'Réactiver le propriétaire et ses biens',
};

export const LIBELLE_CONFIRMER_OCCUPE = 'Confirmer l’archivage du propriétaire et de ses biens';

/** Le refus du serveur quand des locations sont en cours et que l'avertissement n'a pas été confirmé. */
export const MOTIF_OCCUPATION_A_CONFIRMER =
  'Au moins un bien est actuellement occupé par un locataire : confirmez l’archivage (les locations en cours seront closes à la date du jour).';

/** Ce que l'archivage fait, en une phrase (sous la confirmation). */
export function phraseArchivage(sujet: SujetPortefeuille): string {
  if (sujet === 'locataire') {
    return 'Rien n’est effacé : ses locations en cours sont closes à la date du jour, la fiche quitte les listes actives et la recherche, reste dans « Anciens » avec tout son historique et peut être réactivée.';
  }
  return 'Rien n’est effacé : '
    + (sujet === 'proprietaire' ? 'le propriétaire et ses biens (annexes comprises)' : 'le bien et ses annexes')
    + ' quittent les listes actives et la recherche, restent dans « Anciens » avec tout leur historique (mails, tâches, événements) et peuvent être réactivés. '
    + 'Les locations en cours sont closes à la date du jour ; leurs locataires sont archivés aussi, sauf s’ils louent un autre bien du portefeuille.';
}

/** La date d'entrée lisible (« 01/09/2024 ») ou « date d'entrée inconnue ». */
export function dateEntree(iso: string | null): string {
  const m = iso === null ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? 'date d’entrée inconnue' : `entré(e) le ${m[3]}/${m[2]}/${m[1]}`;
}

/** « 12 rue X, Paris · lot 315 » — l'adresse et le N° de lot d'un bien. */
export function libelleBien(b: { adresse: string | null; lot: string | null; lotId: number }): string {
  return [b.adresse ?? `Bien ${b.lotId}`, b.lot === null ? null : `lot ${b.lot}`].filter((x) => x !== null).join(' · ');
}
