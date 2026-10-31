import { additionnerTotaux, compromisDuMode, NOMS_MOIS, retrosDuMois, totauxMoisMode, TVA, ventesDuMois, type DonneesSociete, type ModeMois, type Retrocession, type Totaux, type Vente } from './modele';

/**
 * ══ 🔴 LOT CP (Arno, 31/10/2026) — « LE MOIS » EN PÉRIODE : plusieurs mois choisis, cumulés ══════════════════════════════════════════════
 * La période est la SOMME EXACTE des mois choisis : chaque mois se compte par les fonctions du mode mensuel (`totauxMoisMode`, `ventesDuMois`,
 * `compromisDuMode`, `retrosDuMois`), puis les mois s'additionnent (`additionnerTotaux`) ou se mettent bout à bout. Aucune copie de calcul. PUR.
 */
export interface MoisChoisi { annee: number; mois: number }

const rang = (m: MoisChoisi): number => m.annee * 12 + (m.mois - 1);
export const cleMois = (m: MoisChoisi): string => `${m.annee}-${String(m.mois).padStart(2, '0')}`;
/** Les mois dans l'ordre du calendrier, sans doublon. */
export const ordonner = (ms: readonly MoisChoisi[]): MoisChoisi[] =>
  [...new Map(ms.map((m) => [rang(m), m])).values()].sort((a, b) => rang(a) - rang(b));

/** La période de l'adresse (« 2026-07,2026-09 ») ; null : absente ou sans aucun mois valable. */
export function lirePeriode(x: string | null): MoisChoisi[] | null {
  if (x === null) return null;
  const ms = x.split(',').flatMap((p) => {
    const r = /^(\d{4})-(\d{1,2})$/.exec(p.trim());
    if (r === null) return [];
    const annee = Number(r[1]); const mois = Number(r[2]);
    return annee >= 2000 && annee <= 2100 && mois >= 1 && mois <= 12 ? [{ annee, mois }] : [];
  });
  return ms.length === 0 ? null : ordonner(ms);
}
export const ecrirePeriode = (ms: readonly MoisChoisi[]): string => ordonner(ms).map(cleMois).join(',');

/** Ce mois est-il choisi ? */
export const estChoisi = (ms: readonly MoisChoisi[], m: MoisChoisi): boolean => ms.some((x) => rang(x) === rang(m));

/** Un clic sur un mois : choisi → retiré, sinon ajouté. Le DERNIER mois choisi ne se retire pas (`refus`). */
export function basculerMois(ms: readonly MoisChoisi[], m: MoisChoisi): { mois: MoisChoisi[]; refus: boolean } {
  if (!estChoisi(ms, m)) return { mois: ordonner([...ms, m]), refus: false };
  if (ms.length <= 1) return { mois: ordonner(ms), refus: true };
  return { mois: ms.filter((x) => rang(x) !== rang(m)), refus: false };
}

/** Les mêmes mois, un an plus tôt (la comparaison N−1). */
export const unAnPlusTot = (ms: readonly MoisChoisi[]): MoisChoisi[] => ms.map((m) => ({ annee: m.annee - 1, mois: m.mois }));

/** Les mois se suivent-ils (sans trou, décembre → janvier compris) ? */
export const contigus = (ms: readonly MoisChoisi[]): boolean => { const o = ordonner(ms); return o.every((m, i) => i === 0 || rang(m) === rang(o[i - 1]) + 1); };

const nom = (m: MoisChoisi): string => NOMS_MOIS[m.mois - 1].toLowerCase();
/**
 * Le nom de la période : un mois « juillet 2026 » ; des mois qui se suivent « juillet → septembre 2026 » (« décembre 2025 → février 2026 ») ;
 * sinon « juillet, septembre 2026 (2 mois) » (« novembre 2025, février 2026 (2 mois) »).
 */
export function libellePeriode(ms: readonly MoisChoisi[]): string {
  const o = ordonner(ms);
  if (o.length === 0) return '';
  if (o.length === 1) return `${nom(o[0])} ${o[0].annee}`;
  if (contigus(o)) {
    const [a, b] = [o[0], o.at(-1)!];
    return a.annee === b.annee ? `${nom(a)} → ${nom(b)} ${b.annee}` : `${nom(a)} ${a.annee} → ${nom(b)} ${b.annee}`;
  }
  const parAnnee = [...new Set(o.map((m) => m.annee))].map((an) => `${o.filter((m) => m.annee === an).map(nom).join(', ')} ${an}`);
  return `${parAnnee.join(', ')} (${o.length} mois)`;
}

type DonneesPeriode = Pick<DonneesSociete, 'ventes' | 'retrocessions'> & Partial<Pick<DonneesSociete, 'societe' | 'statutsNegociateurs'>>;
/** Les totaux de la période = la somme des totaux de chaque mois (`totauxMoisMode`, `additionnerTotaux`). */
export const totauxPeriode = (d: DonneesPeriode, ms: readonly MoisChoisi[], mode: ModeMois): Totaux =>
  ordonner(ms).map((m) => totauxMoisMode(d, m.annee, m.mois, mode)).reduce(additionnerTotaux);
/** Les ventes signées de la période (`ventesDuMois`, mois après mois). */
export const ventesPeriode = (ventes: readonly Vente[], ms: readonly MoisChoisi[]): Vente[] => ordonner(ms).flatMap((m) => ventesDuMois(ventes, m.annee, m.mois));
/** Les compromis de la période selon le mode (`compromisDuMode`, mois après mois), triés par date du compromis (tri stable). */
export const compromisPeriode = (ventes: readonly Vente[], ms: readonly MoisChoisi[], mode: ModeMois): Vente[] =>
  ordonner(ms).flatMap((m) => compromisDuMode(ventes, m.annee, m.mois, mode)).sort((a, b) => (a.dateCompromis ?? '').localeCompare(b.dateCompromis ?? ''));
/** Les rétrocessions saisies sur les mois de la période (`retrosDuMois`). */
export const retrosPeriode = (retros: readonly Retrocession[], ms: readonly MoisChoisi[]): Retrocession[] => ordonner(ms).flatMap((m) => retrosDuMois(retros, m.annee, m.mois));

/**
 * Un montant HT (sans arrondi) de chaque mois, additionné TEL QUE CHAQUE MOIS L'AFFICHE : arrondi au centime, en HT et en TTC (HT × 1,2). La
 * période montre ainsi, au centime, la somme des montants que l'on lit mois par mois (les montants des cartes sont déjà en centimes).
 */
export function sommeDesMoisAffiches(htParMois: readonly number[]): { ht: number; ttc: number } {
  const c = (x: number): number => Math.round(x * 100);
  return { ht: htParMois.reduce((t, x) => t + c(x), 0) / 100, ttc: htParMois.reduce((t, x) => t + c(x * TVA), 0) / 100 };
}
