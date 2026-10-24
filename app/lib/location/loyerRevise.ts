import { enCentimes, eurosExacts, formaterCentimes } from './conditionsEntree';

/**
 * ══ 🔴 Arno (25/10/2026, migration 423) — LE LOYER RÉVISÉ RÉEL d'un bail (module PUR, écran et serveur) ══════════════════════════════
 * Saisi dans le Dossier de location : date d'effet, loyer HC, provisions. Il est PRIORITAIRE sur le loyer calculé (entrée × indices) à
 * partir de sa date d'effet, et s'affiche « réel ». La révision ne porte que sur le loyer HC ; les provisions ne changent que par un loyer
 * réel. Une ligne saisie par erreur s'annule (jamais effacée).
 */
export interface LoyerReviseLu { id: number; effetLe: string; loyerHc: number; provisions: number | null; saisiLe: string; saisiPar: string }
export interface SaisieLoyerRevise { effetLe: string; loyerHc: string; provisions: string }
export const LOYER_REVISE_VIDE: SaisieLoyerRevise = { effetLe: '', loyerHc: '', provisions: '' };

/** La saisie vérifiée (montants exacts en euros, texte « 1180.50 » pour la base), ou le motif du refus. PUR. */
export function verifierLoyerRevise(brut: unknown, bail: { entree: string | null; sortie: string | null }):
  { ok: true; effetLe: string; loyerHc: string; provisions: string | null } | { ok: false; motif: string } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const effet = String(b.effetLe ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effet)) return { ok: false, motif: 'Loyer révisé : la date d’effet.' };
  if (bail.entree !== null && effet <= bail.entree) return { ok: false, motif: 'Loyer révisé : la date d’effet doit suivre la date d’entrée du bail.' };
  if (bail.sortie !== null && effet > bail.sortie) return { ok: false, motif: 'Loyer révisé : la date d’effet est après la sortie du locataire.' };
  const hc = enCentimes(b.loyerHc);
  if (hc === null || hc === undefined) return { ok: false, motif: 'Loyer révisé : le loyer HC, un montant en euros au centime (ex. 1 180,50).' };
  const prov = enCentimes(b.provisions);
  if (prov === undefined) return { ok: false, motif: 'Loyer révisé : les provisions, un montant en euros au centime (ex. 90), ou vide.' };
  return { ok: true, effetLe: effet, loyerHc: eurosExacts(hc), provisions: prov === null ? null : eurosExacts(prov) };
}

/** « 1 180,50 € HC + 90,00 € de provisions, à partir du 01/03/2027 ». PUR. */
export function libelleLoyerRevise(l: Pick<LoyerReviseLu, 'effetLe' | 'loyerHc' | 'provisions'>): string {
  const c = (x: number): string => formaterCentimes(Math.round(x * 100));
  return `${c(l.loyerHc)} HC${l.provisions === null ? '' : ` + ${c(l.provisions)} de provisions`}, à partir du ${l.effetLe.split('-').reverse().join('/')}`;
}
