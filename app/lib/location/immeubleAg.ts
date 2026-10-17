import { cleImmeuble } from '../gestion/syndics';

/**
 * ══ 🔴🔴 TUILE LOCATION — DATE DE LA DERNIÈRE AG DE COPROPRIÉTÉ, PAR IMMEUBLE (Arno, 18/10/2026). PUR. ════════════════════
 *
 * « Stockée au niveau de la copropriété / de l'immeuble (même rattachement que le syndic : l'“Immeuble” du bien), pour que
 * tous les lots du même immeuble partagent la même date. Masquée pour un parking nu sans immeuble. » (Arno)
 * La clé est celle de la Gestion (`cleImmeuble` de l'« Immeuble » du lot) ; un lot sans « Immeuble » (rare : imports
 * incomplets) prend son adresse — sauf un PARKING NU, qui n'a alors pas d'immeuble : pas de date d'AG.
 */

export const LIBELLE_AG = 'Date de la dernière AG';

/** L'immeuble d'un lot pour l'AG : sa clé et son libellé, ou `null` (parking nu sans immeuble, ou rien de connu). PUR. */
export function immeubleDeLAg(l: { immeuble?: string | null; adresse?: string | null; parking: boolean }): { cle: string; libelle: string } | null {
  const immeuble = (l.immeuble ?? '').trim();
  if (immeuble !== '') return { cle: cleImmeuble(immeuble), libelle: immeuble };
  if (l.parking) return null;
  const adresse = (l.adresse ?? '').trim();
  return adresse === '' ? null : { cle: cleImmeuble(adresse), libelle: adresse };
}

/** La date saisie : `null` (vide) ou « AAAA-MM-JJ » valide ; sinon le motif du refus. PUR. */
export function verifierDateAg(v: unknown): { ok: true; date: string | null } | { ok: false; motif: string } {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return { ok: true, date: null };
  const t = typeof v === 'string' ? v.trim() : '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const d = m === null ? null : new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (m === null || d === null || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3]) || Number(m[1]) < 1900) {
    return { ok: false, motif: 'La date de la dernière AG n’est pas une date valide.' };
  }
  return { ok: true, date: t };
}
