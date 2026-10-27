'use client';

import { useCallback, useEffect, useState } from 'react';

/** TUILE TRANSACTION — le socle des écrans : lecture de la route, envoi d'un geste, formats. Aucun calcul métier ici (`modele.ts`). */
export const API_TRANSACTION = '/api/admin/transaction';

export type Lecture<T> = { etat: 'charge' } | { etat: 'erreur'; message: string } | { etat: 'ok'; data: T };

/** Lit `?<parametres>` ; `relire()` relit (après un geste). */
export function useTransaction<T>(parametres: string): { lu: Lecture<T>; relire: () => void } {
  const [lu, setLu] = useState<Lecture<T>>({ etat: 'charge' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivant = true;
    fetch(`${API_TRANSACTION}?${parametres}`, { cache: 'no-store' })
      .then(async (r) => (r.status === 401 || r.status === 403 ? { etat: 'refus' } : r.json()))
      .then((x: { etat?: string; data?: T; message?: string; motif?: string }) => {
        if (!vivant) return;
        if (x.etat === 'ok' && x.data !== undefined) setLu({ etat: 'ok', data: x.data });
        else setLu({ etat: 'erreur', message: x.etat === 'refus' ? 'Accès refusé : droit « Transaction » requis (ou session expirée).' : x.motif ?? x.message ?? 'Lecture impossible.' });
      })
      .catch(() => { if (vivant) setLu({ etat: 'erreur', message: 'Lecture impossible : le serveur n’a pas répondu.' }); });
    return () => { vivant = false; };
  }, [parametres, n]);
  return { lu, relire: useCallback(() => setN((x) => x + 1), []) };
}

/** Envoie un geste ; rend `null` s'il est accepté, sinon le motif (montré tel quel). */
export async function posterTransaction(corps: Record<string, unknown>): Promise<string | null> {
  try {
    const r = await fetch(API_TRANSACTION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
    if (r.status === 401 || r.status === 403) return 'Accès refusé : droit « Transaction » requis (ou session expirée).';
    const d = await r.json() as { etat?: string; motif?: string; message?: string };
    return d.etat === 'ok' ? null : d.motif ?? d.message ?? 'Enregistrement refusé.';
  } catch {
    return 'Enregistrement impossible : le serveur n’a pas répondu.';
  }
}

export const eur = (x: number): string => `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (x: number): string => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
export const signePct = (x: number | null): string => (x === null ? '—' : `${x >= 0 ? '+' : '−'}${pct(Math.abs(x))}`);
export const ecartEur = (x: number): string => `${x >= 0 ? '+' : '−'}${eur(Math.abs(x))}`;
export const COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Les paramètres de l'adresse de la page, lus une fois (rien côté serveur : la page est rendue après lecture). */
export function parametre(nom: string): string | null {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(nom);
}
/** Réécrit l'adresse (sans recharger) : la sélection se garde dans un lien ou un rechargement. */
export function ecrireAdresse(p: Record<string, string | null>): void {
  const u = new URL(window.location.href);
  const avant = u.searchParams.toString();
  for (const [k, v] of Object.entries(p)) { if (v === null) u.searchParams.delete(k); else u.searchParams.set(k, v); }
  if (u.searchParams.toString() === avant) return;
  const q = u.searchParams.toString();
  window.history.replaceState(window.history.state, '', `${u.pathname}${q === '' ? '' : `?${q}`}${u.hash}`);
}

/** Les classes propres à la tuile (les autres viennent du Suivi de la Location : `tdb-*`, `loc-*`). Jetons de couleur seulement. */
export const CSS_TRANSACTION = `
.trx-barre{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.trx-vues{display:flex;gap:4px;border-bottom:1px solid var(--color-svv-line);overflow-x:auto}
.trx-actions{display:flex;flex-wrap:wrap;gap:8px}
.trx-actions .svv-btn{width:auto;min-height:44px}
.trx-bouton-lien{appearance:none;border:0;background:transparent;color:var(--color-svv-red);font:inherit;font-weight:700;cursor:pointer;min-height:44px;padding:0 6px;text-decoration:underline}
.trx-bouton-lien:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}
.trx-pastilles{display:inline-flex;flex-wrap:wrap;gap:4px;margin-left:6px;vertical-align:middle}
.trx-pastille--orange{background:var(--color-svv-amber-soft);color:var(--color-svv-amber)}
.trx-pastille--verte{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
.trx-source{color:var(--color-svv-muted);font-size:.78rem}
.trx-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.trx-form label{display:flex;flex-direction:column;gap:4px;font-size:.82rem;font-weight:700;color:var(--color-svv-muted)}
.trx-form input,.trx-form textarea,.trx-form select{min-height:44px;border:1px solid var(--color-svv-line-strong);border-radius:10px;padding:0 10px;font:inherit;font-size:.95rem;font-weight:400;color:var(--color-svv-ink);background:var(--color-svv-surface)}
.trx-form textarea{min-height:72px;padding:8px 10px}
.trx-form .trx-plein{grid-column:1/-1}
.trx-parts{display:flex;flex-direction:column;gap:8px}
.trx-part{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.4fr) minmax(0,1fr) auto;gap:8px;align-items:end}
.trx-erreur{color:var(--color-svv-red);font-weight:700}
.trx-journal{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.trx-journal li{border:1px solid var(--color-svv-line);border-radius:10px;padding:8px 10px;font-size:.88rem}
.trx-total{font-weight:800}
.trx-resultat{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 16px;max-width:520px}
.trx-resultat dt{color:var(--color-svv-muted)}
.trx-resultat dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
@media (max-width:640px){
  .trx-form{grid-template-columns:minmax(0,1fr)}
  .trx-part{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
}
`;
