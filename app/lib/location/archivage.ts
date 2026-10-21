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
  /** Déjà sorti du portefeuille : quand, par qui, et l'origine (propriétaire, migration 380) — `null` = actif. */
  sortie: { le: string; par: string | null; origine?: string | null } | null;
  /** Les biens et annexes qui sortiront (identifiants). */
  biens: number[];
  partages: BienPartage[];
  occupees: LocationOccupee[];
  /** Les locataires archivés avec (identifiants), hors le sujet lui-même. */
  locatairesArchives: number[];
  locatairesGardes: LocataireGarde[];
  /**
   * « Supprimer un des biens d'un propriétaire » (Arno, 18/10/2026) : l'aperçu porte sur les BIENS SÉLECTIONNÉS (`sujet` =
   * le propriétaire dont la fiche est ouverte, `id` = son identifiant). Les `partages` y sont SIGNALÉS : un bien partagé sort
   * pour tous ses propriétaires. Absent = l'archivage d'une fiche entière.
   */
  portee?: 'biens';
  /** Les biens choisis (têtes) — en mode « biens » seulement. */
  lotsChoisis?: number[];
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

// ══ L'ORIGINE DE L'ARCHIVAGE D'UN PROPRIÉTAIRE (Arno, 18/10/2026 — migration 380) ═══════════════════════════════════════
// « Dernière question avant l'archivage définitif » : un seul choix, une sous-question obligatoire pour la mise en vente,
// une précision libre facultative. Codes STABLES (ceux de la base) ; les libellés vivent ici.

export const ORIGINES = ['recupere_proprietaire', 'mise_en_vente', 'mecontent', 'deces_succession', 'litige'] as const;
export type Origine = (typeof ORIGINES)[number];
export const SOUS_ORIGINES_VENTE = ['notre_agence', 'autre_agence', 'lui_meme', 'indetermine'] as const;
export type SousOrigine = (typeof SOUS_ORIGINES_VENTE)[number];

export const LIBELLE_ORIGINE: Record<Origine, string> = {
  recupere_proprietaire: 'Récupéré par le propriétaire / sa famille',
  mise_en_vente: 'Mise en vente',
  mecontent: 'Propriétaire mécontent',
  deces_succession: 'Décès / succession',
  litige: 'Litige',
};
export const LIBELLE_SOUS_ORIGINE: Record<SousOrigine, string> = {
  notre_agence: 'Par notre agence',
  autre_agence: 'Par une autre agence',
  lui_meme: 'Par lui-même',
  indetermine: 'Indéterminé',
};

export const QUESTION_ORIGINE = 'Quelle est l’origine de l’archivage de ce propriétaire ?';
export const MOTIF_ORIGINE_REQUISE = 'Indiquez l’origine de l’archivage de ce propriétaire (et, pour une mise en vente, par qui) : rien n’a été archivé.';
const PRECISION_MAX = 1000;

export interface OrigineArchivage { origine: Origine; sousOrigine: SousOrigine | null; precision: string | null }

/** Vérifie l'origine envoyée (écran ou appel direct). `null` = incomplète : le serveur refuse l'archivage. */
export function verifierOrigine(brut: unknown): OrigineArchivage | null {
  if (brut === null || typeof brut !== 'object') return null;
  const o = brut as Record<string, unknown>;
  if (!(ORIGINES as readonly unknown[]).includes(o.origine)) return null;
  const origine = o.origine as Origine;
  const sous = (SOUS_ORIGINES_VENTE as readonly unknown[]).includes(o.sousOrigine) ? o.sousOrigine as SousOrigine : null;
  if ((origine === 'mise_en_vente') !== (sous !== null)) return null;
  const p = typeof o.precision === 'string' ? o.precision.trim().slice(0, PRECISION_MAX) : '';
  return { origine, sousOrigine: sous, precision: p === '' ? null : p };
}

/** « Mise en vente par une autre agence » · « Litige » — le libellé affiché après « Archivé le … par X — ». */
export function libelleOrigine(o: { origine: string; sousOrigine: string | null }): string {
  const base = LIBELLE_ORIGINE[o.origine as Origine] ?? o.origine;
  if (o.origine !== 'mise_en_vente' || o.sousOrigine === null) return base;
  const suite: Record<SousOrigine, string> = {
    notre_agence: 'par notre agence', autre_agence: 'par une autre agence', lui_meme: 'par lui-même', indetermine: '(vendeur indéterminé)',
  };
  const s = suite[o.sousOrigine as SousOrigine];
  return s === undefined ? base : `${base} ${s}`;
}

/** Le bouton final est-il permis ? (un choix ; et, pour la mise en vente, la sous-question répondue) */
export function originePrete(origine: Origine | null, sous: SousOrigine | null): boolean {
  return origine !== null && (origine !== 'mise_en_vente' || sous !== null);
}

// ══ « SUPPRIMER UN DES BIENS D'UN PROPRIÉTAIRE » (Arno, 18/10/2026 — migration 381) ══════════════════════════════════════

/** Un locataire montré par son nom, et identifié par sa fiche (la clé d'une liste n'est jamais un nom). */
export interface LocataireNomme { id: number; nom: string }

/** Un bien du propriétaire, tel que l'écran de sélection le montre. */
export interface BienASortir {
  lotId: number;
  adresse: string | null;
  lot: string | null;
  nature: string | null;
  /** Ses annexes (détachées comprises) : elles sortent avec lui. */
  annexes: { lotId: number; libelle: string; detachee: boolean }[];
  /** Les locataires en place (location en cours) — `id` = la fiche du locataire : deux homonymes restent deux (Arno, 21/10/2026). */
  locataires: LocataireNomme[];
  /** Famille du bien (logement / local / parking), pour « Logement vacant », « Local vacant », « Parking vacant ». */
  famille: 'logement' | 'local' | 'parking' | null;
  /** Loué : la date d'entrée dans les lieux (la plus ancienne des locataires en place), AAAA-MM-JJ, ou `null`. */
  entree: string | null;
  /** Vacant : le ou les locataires de la DERNIÈRE location seulement (pas l'historique) ; vide = aucun locataire connu. */
  derniersLocataires: LocataireNomme[];
  /** Vacant : la date de sortie de cette dernière location, si connue. */
  derniereSortie: string | null;
  /** Les AUTRES propriétaires actifs : le bien sortira pour tous. */
  autresProprietaires: string[];
}

export const QUESTION_ORIGINE_BIENS = 'Quelle est l’origine de la sortie de ce(s) bien(s) ?';
export const LIBELLE_FINAL_BIENS = 'Sortir définitivement';
export const LIBELLE_CONFIRMER_BIENS = 'Confirmer la sortie de ce(s) bien(s)';
export const TITRE_ALERTE_BIENS = 'Attention, au moins un bien sélectionné est actuellement occupé par un locataire';
export const BANDEAU_TOUS_LES_BIENS =
  'Tous les biens de ce propriétaire sont sélectionnés : le propriétaire sortira lui aussi de la gestion et sera archivé';
export const MOTIF_SELECTION_VIDE = 'Sélectionnez au moins un bien à sortir de la gestion : rien n’a été modifié.';
export const MOTIF_BIEN_HORS_SELECTION = 'Un des biens choisis n’est plus un bien actif de ce propriétaire (déjà sorti, ou à un autre propriétaire) : rien n’a été modifié.';

/** « Sortir 2 biens de la gestion » — le gros bouton du mode « biens ». */
export function libelleSortirBiens(n: number): string {
  return `Sortir ${n} bien${n > 1 ? 's' : ''} de la gestion`;
}

/** Ce que la sortie de biens fait, en une phrase. */
export function phraseSortieBiens(): string {
  return 'Rien n’est effacé : chaque bien choisi et ses annexes (détachées comprises) quittent les listes actives et la recherche, '
    + 'restent dans « Anciens » avec tout leur historique et peuvent être réactivés. Les locations en cours sont closes à la date du jour ; '
    + 'leurs locataires sont archivés aussi, sauf s’ils louent un autre bien du portefeuille.';
}

/** Tous les biens actifs du propriétaire sont-ils choisis ? Alors c'est l'archivage du propriétaire. */
export function tousChoisis(biens: readonly { lotId: number }[], choisis: Iterable<number>): boolean {
  const c = new Set(choisis);
  return biens.length > 0 && biens.every((b) => c.has(b.lotId));
}

/** « Logement vacant », « Local vacant », « Parking vacant » (Arno, 18/10/2026). */
export function motVacant(famille: BienASortir['famille']): string {
  return famille === 'local' ? 'Local vacant' : famille === 'parking' ? 'Parking vacant' : 'Logement vacant';
}

/** « 01/09/2024 » — une date AAAA-MM-JJ lisible. */
export function dateFr(iso: string | null): string | null {
  const m = iso === null ? null : /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m === null ? null : `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * La famille d'un bien pour « … vacant » : sa catégorie (biens créés dans l'application), sinon déduite de la nature de
 * l'import WIPPIMMO (« Local commercial » → local ; « Parking », « Garage », « Box » → parking ; le reste → logement).
 */
export function familleDuBien(familleCategorie: BienASortir['famille'], nature: string | null, typeBien: string | null): NonNullable<BienASortir['famille']> {
  if (familleCategorie !== null) return familleCategorie;
  const t = `${nature ?? ''} ${typeBien ?? ''}`.toLowerCase();
  if (/local|commerc|bureau|boutique/.test(t)) return 'local';
  if (/parking|garage|\bbox\b/.test(t)) return 'parking';
  return 'logement';
}
