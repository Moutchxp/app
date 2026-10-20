/**
 * ══ 🔴🔴 LOCATION — LE MANDAT D'UN BIEN, SELON « BIEN EN GESTION ? » (Arno, 21/10/2026, migration 397). PUR. ═══════════════
 *
 * À « Nouveau bien », Oui ouvre « Mandat de gestion », Non ouvre « Mandat de transaction locative » : n° (texte libre) et date de
 * signature, FACULTATIFS. Seul le mandat du choix FINAL est enregistré. Il est rattaché au PROPRIÉTAIRE (les champs existants de
 * sa fiche : `numero_mandat_gestion` / `numero_mandat_transaction`, et leur date — 397) et au BIEN par sa réponse « Bien en
 * gestion ? » (Oui → mandat de gestion, Non → mandat de transaction). Aucune structure en double.
 */

export type SorteMandat = 'gestion' | 'transaction';
export interface Mandat { numero: string | null; signeLe: string | null }
export interface SaisieMandat { sorte: SorteMandat; numero: string | null; signeLe: string | null }

export const LIBELLE_MANDAT: Record<SorteMandat, string> = { gestion: 'Mandat de gestion', transaction: 'Mandat de transaction locative' };
export const sorteDuBien = (enGestion: boolean | null | undefined): SorteMandat | null => (enGestion === true ? 'gestion' : enGestion === false ? 'transaction' : null);

const dateFr = (iso: string): string => iso.split('-').reverse().join('/');

/** La saisie envoyée : la sorte (celle du choix final), le n° (80 caractères), la date « AAAA-MM-JJ ». `null` = rien saisi. PUR. */
export function verifierMandat(brut: unknown): { ok: true; mandat: SaisieMandat | null } | { ok: false; motif: string } {
  if (brut === undefined || brut === null) return { ok: true, mandat: null };
  if (typeof brut !== 'object') return { ok: false, motif: 'Mandat illisible.' };
  const b = brut as Record<string, unknown>;
  const sorte = b.sorte === 'gestion' || b.sorte === 'transaction' ? b.sorte : null;
  if (sorte === null) return { ok: false, motif: 'Mandat : la sorte (gestion ou transaction) manque.' };
  const numero = typeof b.numero === 'string' && b.numero.trim() !== '' ? b.numero.trim().slice(0, 80) : null;
  const brutDate = typeof b.signeLe === 'string' ? b.signeLe.trim() : '';
  if (brutDate !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(brutDate) || Number.isNaN(Date.parse(`${brutDate}T12:00:00Z`)))) {
    return { ok: false, motif: `${LIBELLE_MANDAT[sorte]} : la date de signature est à saisir au format JJ/MM/AAAA.` };
  }
  const signeLe = brutDate === '' ? null : brutDate;
  return { ok: true, mandat: numero === null && signeLe === null ? null : { sorte, numero, signeLe } };
}

/** « Mandat de gestion n° MG-41, signé le 15/10/2026 » ; `null` si rien n'est connu. PUR. */
export function libelleMandat(sorte: SorteMandat, m: Mandat): string | null {
  if (m.numero === null && m.signeLe === null) return null;
  return [`${LIBELLE_MANDAT[sorte]}${m.numero ? ` n° ${m.numero}` : ''}`, m.signeLe ? `signé le ${dateFr(m.signeLe)}` : null].filter((x) => x !== null).join(', ');
}
