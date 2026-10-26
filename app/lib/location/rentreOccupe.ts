/**
 * ══ 🔴🔴 LOCATION — LE BIEN « RENTRÉ OCCUPÉ » (Arno, 26/10/2026, migration 430). PUR. ══════════════════════════════════════════
 *
 * CONSTAT : un nouveau mandat de gestion confié avec un locataire déjà en place (CHALAH / REIFHI, locataire depuis 2014) n'était pas
 * identifiable dans « Nouvelles gestions du mois ». Les règles d'Arno :
 *   · R1 — à la création d'un bien EN GESTION, une question obligatoire : « Le bien est-il loué au moment de la prise en gestion ? » ;
 *   · R2 — Non : rien ne change (la gestion entre dans le suivi comme aujourd'hui : à la date de création de la fiche) ;
 *   · R3 — Oui : la gestion entre dans le suivi à la DATE DU MANDAT DE GESTION (pré-remplie au jour de la saisie, modifiable), puis le
 *     formulaire complet « Nouveau locataire » s'ouvre pour le locataire en place, avec la date réelle de son bail ; ce bail n'est
 *     jamais un bail signé par l'agence : son suivi commercial est un « Mandat de gestion seul », sans honoraire de location.
 * Aucune base, aucun réseau : sûr côté navigateur.
 */

export const QUESTION_RENTRE_OCCUPE = 'Le bien est-il loué au moment de la prise en gestion ?';
export const MANQUE_RENTRE_OCCUPE = 'Le bien est-il loué au moment de la prise en gestion ? Oui ou Non.';
export const MANQUE_DATE_MANDAT = 'Bien loué à la prise en gestion : la date du mandat de gestion (JJ/MM/AAAA).';
export const MENTION_EN_PLACE = 'locataire en place à la prise en gestion';
export const MENTION_SANS_430 = 'Disponible après la mise à jour de la base (migration 430) : le bien se crée comme aujourd’hui.';

const dateValide = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`))
  && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;

/**
 * Ce qui manque à la question (la barre « Reste à renseigner ») : rien hors gestion, rien sans la migration 430. PUR.
 */
export function manquesRentreOccupe(o: { enGestion: boolean | null | undefined; disponible: boolean; entreOccupe: boolean | null; dateMandat: string }): Record<string, string> {
  if (!o.disponible || o.enGestion === false) return {};
  if (o.entreOccupe === null) return { entreOccupe: MANQUE_RENTRE_OCCUPE };
  if (o.entreOccupe && !dateValide(o.dateMandat)) return { dateMandat: MANQUE_DATE_MANDAT };
  return {};
}

export type RentreOccupeVerifie = { ok: true; entreOccupe: boolean | null; dateEffet: string | null } | { ok: false; motif: string };

/**
 * Ce que le serveur accepte. `entreOccupe` absent (écran d'avant, autre appelant) : rien ne change. Oui exige une date de mandat
 * valide, jamais dans le futur ; elle devient la date d'entrée dans le suivi. Un bien hors gestion n'a pas de prise en gestion. PUR.
 */
export function verifierRentreOccupe(brut: { entreOccupe?: unknown; dateMandat?: unknown }, enGestion: boolean, aujourdhui: string): RentreOccupeVerifie {
  if (brut.entreOccupe === undefined || brut.entreOccupe === null) return { ok: true, entreOccupe: null, dateEffet: null };
  if (typeof brut.entreOccupe !== 'boolean') return { ok: false, motif: MANQUE_RENTRE_OCCUPE };
  if (!enGestion) return { ok: true, entreOccupe: null, dateEffet: null };
  if (!brut.entreOccupe) return { ok: true, entreOccupe: false, dateEffet: null };
  if (!dateValide(brut.dateMandat)) return { ok: false, motif: MANQUE_DATE_MANDAT };
  if (brut.dateMandat > aujourdhui) return { ok: false, motif: 'La date du mandat de gestion ne peut pas être dans le futur.' };
  return { ok: true, entreOccupe: true, dateEffet: brut.dateMandat };
}

/** Le formulaire « Nouveau locataire » pour le locataire en place du bien créé (enchaînement R3). PUR. */
export const lienLocataireEnPlace = (lotId: number): string => `/admin/location/nouveau-locataire?bien=${lotId}&enPlace=1`;

/**
 * Le suivi commercial d'un bail en place : un « Mandat de gestion seul » daté du mandat, sans honoraire de location (il n'entre ni
 * dans « Baux signés » ni dans le CA, et ne porte aucune commission d'apporteur sur la location). PUR.
 */
export function activiteEnPlace<T extends { type: string; dateSignature: string; honoProprietaireHt: string; honoLocataireHt: string }>(s: T, dateMandat: string | null): T {
  return { ...s, type: 'gestion_seule', dateSignature: dateMandat !== null && dateValide(dateMandat) ? dateMandat : s.dateSignature, honoProprietaireHt: '0', honoLocataireHt: '0' };
}

/** Ce que la route rend d'un bien : sa réponse et, rentré occupé, sa date d'entrée dans le suivi (la date du mandat). */
export interface RentreOccupeDuBien { lotId: number; entreOccupe: boolean | null; dateMandat: string | null; titre: string }

/** « 15/10/2026 ». PUR. */
export const dateFr = (iso: string): string => iso.split('-').reverse().join('/');

/**
 * R4 — un bien CANDIDAT « rentré occupé » : son bail en cours à l'entrée en gestion a commencé NETTEMENT avant (par défaut 90 jours).
 * Une liste à décider au cas par cas, jamais une bascule. PUR.
 */
export const ECART_CANDIDAT_JOURS = 90;
export function estCandidatRentreOccupe(o: { entreeGestion: string; bailEntree: string | null }, ecartJours = ECART_CANDIDAT_JOURS): boolean {
  if (o.bailEntree === null || !dateValide(o.bailEntree) || !dateValide(o.entreeGestion)) return false;
  const jours = (Date.parse(`${o.entreeGestion}T12:00:00Z`) - Date.parse(`${o.bailEntree}T12:00:00Z`)) / 86_400_000;
  return jours >= ecartJours;
}
