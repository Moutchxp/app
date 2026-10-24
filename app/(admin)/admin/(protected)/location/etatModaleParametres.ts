'use client';

import { useSyncExternalStore } from 'react';

/**
 * ══ 🔴 Arno (24/10/2026) — L'ÉTAT DE LA MODALE « PARAMÈTRES LOCATION » EST DANS L'ADRESSE ═══════════════════════════════════════════
 * Son ouverture, son onglet, la carte et le panneau ouverts : `?parametres=apporteurs&apporteur=123&panneau=rattachement`. Un
 * rechargement de la page (quelle qu'en soit la cause) la rouvre exactement au même endroit. L'adresse est réécrite SUR PLACE
 * (`history.replaceState`) : ni navigation, ni remontage de la page.
 */
export type OngletModale = 'destinataires' | 'baremes' | 'archivage' | 'apporteurs' | 'commissions';
export const PARAM_MODALE = 'parametres';
const ONGLETS: readonly OngletModale[] = ['destinataires', 'baremes', 'archivage', 'apporteurs', 'commissions'];
export function lireEtatModale(recherche: string): { onglet: OngletModale | null; apporteur: number | null; panneau: string | null } {
  const p = new URLSearchParams(recherche);
  const o = p.get(PARAM_MODALE);
  const a = Number(p.get('apporteur'));
  return { onglet: o !== null && (ONGLETS as readonly string[]).includes(o) ? o as OngletModale : null, apporteur: Number.isSafeInteger(a) && a > 0 ? a : null, panneau: p.get('panneau') };
}
export function ecrireEtatModale(maj: Partial<Record<'parametres' | 'apporteur' | 'panneau', string | null>>): void {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  for (const [k, v] of Object.entries(maj)) { if (v === null || v === undefined) u.searchParams.delete(k); else u.searchParams.set(k, v); }
  const cible = `${u.pathname}${u.search}${u.hash}`;
  if (cible !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', cible);
}
const abonnerAdresse = (f: () => void): (() => void) => { window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f); };
/** L'adresse lue sans écart d'hydratation : vide côté serveur, la vraie côté navigateur. */
export function useRechercheAdresse(): string {
  return useSyncExternalStore(abonnerAdresse, () => window.location.search, () => '');
}

