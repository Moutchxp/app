import { dateIsoValide, versionADate, type Datee } from './suivi';

/**
 * ══ 🔴 Arno (25/10/2026, 427) — LA « MARGE GLI » ET LES « NOUVELLES GLI » DU PORTEFEUILLE DE GESTION ═══════════════════════════════════
 * « Marge que l'agence perçoit sur les assurances GLI proposées, appliquée au loyer charges comprises. » Un pourcentage (2 décimales,
 * 0 accepté), versionné « applicable à partir du » : une GLI prend la marge en vigueur à SA date de souscription, jamais une autre.
 *
 * Une GLI « nouvelle » dans un mois (décisions d'Arno, 25/10/2026) :
 *   · la dernière saisie des garanties du bail dit « GLI » ;
 *   · son mois = celui de la SIGNATURE de la location (la ligne du Suivi, à défaut l'entrée du bail) ; ajoutée plus tard par « Modifier » :
 *     celui de la PREMIÈRE saisie qui dit « GLI » (aucun champ de date nouveau) ;
 *   · seulement les locations AVEC GESTION (bien en gestion à la date de signature), comme les autres lignes du Portefeuille ;
 *   · loyer CC = loyer HC + provisions À L'ENTRÉE (jamais le loyer révisé) ; sans l'une des deux : la GLI est comptée parmi les GLI du
 *     mois, mais son gain ne l'est pas — elle est signalée (« N GLI sans loyer charges comprises : non comptées »), rien n'est inventé.
 * Gain / mois = loyer CC × marge ; / an = × 12 ; « Depuis le 1er janvier » = la somme des gains mensuels de chaque GLI, comptés UNE fois
 * (pas d'effet boule de neige, comme les gestions). Aucun arrondi : les montants sont formatés à l'affichage seulement. PUR.
 */
export interface MargeGli extends Datee { id?: number; marge: number; saisiLe?: string | null; par?: string | null }

/** Une GLI d'un bail avec gestion, telle que lue (`lireGli`). `date` : AAAA-MM-JJ, sa date de souscription retenue. */
export interface LigneGli {
  bailId: number; activiteId: number | null; lotId: number | null; bien: string; locataire: string; date: string;
  loyerHc: number | null; provisions: number | null;
}

export interface GliComptee extends LigneGli {
  /** null : loyer HC ou provisions manquant. */
  loyerCc: number | null;
  /** La marge (en %) en vigueur à la date ; null : aucune version encore à cette date. */
  marge: number | null;
  /** null : sans loyer CC ou sans marge — non compté. */
  gainMensuel: number | null;
}

export interface GliPeriode { nb: number; mensuel: number; annuel: number; sansLoyer: number; sansMarge: number; gli: GliComptee[] }

export const AIDE_MARGE_GLI = 'Marge que l’agence perçoit sur les assurances GLI proposées, appliquée au loyer charges comprises.';

/** Le loyer charges comprises à l'entrée : HC + provisions ; null s'il manque l'un des deux. */
export const loyerCc = (l: Pick<LigneGli, 'loyerHc' | 'provisions'>): number | null =>
  (l.loyerHc === null || l.provisions === null ? null : l.loyerHc + l.provisions);

/** Une GLI chiffrée : sa marge à SA date, son gain mensuel (loyer CC × marge %). */
export function chiffrerGli(l: LigneGli, marges: readonly MargeGli[]): GliComptee {
  const cc = loyerCc(l);
  const m = versionADate(marges, l.date)?.marge ?? null;
  return { ...l, loyerCc: cc, marge: m, gainMensuel: cc === null || m === null ? null : cc * m / 100 };
}

/** Les GLI d'un ensemble (mois ou cumul) : nombre, gain mensuel, annuel (× 12), et ce qui n'a pas pu être compté. */
function periode(lignes: readonly LigneGli[], marges: readonly MargeGli[]): GliPeriode {
  const gli = lignes.map((l) => chiffrerGli(l, marges)).sort((a, b) => a.date.localeCompare(b.date) || a.bailId - b.bailId);
  const mensuel = gli.reduce((s, g) => s + (g.gainMensuel ?? 0), 0);
  return { nb: gli.length, mensuel, annuel: mensuel * 12, gli,
    sansLoyer: gli.filter((g) => g.loyerCc === null).length, sansMarge: gli.filter((g) => g.loyerCc !== null && g.marge === null).length };
}

/** Les nouvelles GLI du mois « AAAA-MM ». PUR. */
export const gliDuMois = (lignes: readonly LigneGli[], marges: readonly MargeGli[], mois: string): GliPeriode =>
  periode(lignes.filter((l) => l.date.slice(0, 7) === mois), marges);

/** Les nouvelles GLI du 1er janvier au mois « AAAA-MM » inclus : chaque GLI compte UNE fois (pas d'effet boule de neige). PUR. */
export const gliDepuisJanvier = (lignes: readonly LigneGli[], marges: readonly MargeGli[], mois: string): GliPeriode =>
  periode(lignes.filter((l) => l.date.slice(0, 4) === mois.slice(0, 4) && l.date.slice(0, 7) <= mois), marges);

/** « 2,5 % » : la marge telle que saisie (aucun arrondi : 2 décimales au plus en base). */
export const margeFr = (m: number): string => `${String(m).replace('.', ',')} %`;

/** Vérifie une nouvelle version : date d'effet, pourcentage de 0 à 100 avec 2 décimales au plus. PUR. */
export function verifierMargeGli(brut: unknown): { ok: true; depuis: string; marge: number } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  if (!dateIsoValide(b.depuis)) return { ok: false, motif: 'La date « applicable à partir du » est obligatoire.' };
  const t = typeof b.marge === 'number' ? String(b.marge) : typeof b.marge === 'string' ? b.marge.replace(/[\s %]/g, '').replace(',', '.') : '';
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, motif: 'Marge GLI : un pourcentage de 0 à 100, deux décimales au plus (ex. 2,5).' };
  const marge = Number(t);
  if (marge > 100) return { ok: false, motif: 'Marge GLI : un pourcentage de 0 à 100, deux décimales au plus (ex. 2,5).' };
  return { ok: true, depuis: b.depuis, marge };
}
