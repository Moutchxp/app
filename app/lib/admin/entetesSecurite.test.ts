import { describe, it, expect } from 'vitest';
import nextConfig from '../../../next.config';
import { entetesSecuriteAdmin, CHEMINS_ADMIN } from './entetesSecurite';

/**
 * AUDIT POINT 7 (15/10/2026) — avant ce lot, `next.config.ts` n'avait AUCUN `headers()` : l'admin ne recevait ni anti-cadre,
 * ni nosniff, ni Referrer-Policy, ni HSTS (audit §4). Ce test lit la VRAIE configuration de Next.
 */
const cle = (regles: { headers: { key: string; value: string }[] }[], k: string) => regles[0].headers.find((h) => h.key === k)?.value;

describe('en-têtes de sécurité de l’admin (point 7)', () => {
  it('next.config pose bien des en-têtes (il n’en posait aucun)', async () => {
    expect(typeof nextConfig.headers).toBe('function');
    const regles = await nextConfig.headers!();
    expect(regles.map((r) => r.source)).toEqual([...CHEMINS_ADMIN]);
  });

  it('anti-cadre SAMEORIGIN (l’admin encadre ses propres aperçus), nosniff, Referrer-Policy same-origin', () => {
    const r = entetesSecuriteAdmin(false);
    expect(cle(r, 'X-Frame-Options')).toBe('SAMEORIGIN');
    expect(cle(r, 'X-Content-Type-Options')).toBe('nosniff');
    expect(cle(r, 'Referrer-Policy')).toBe('same-origin');
  });

  it('HSTS en production seulement, un an, SANS includeSubDomains ; pas en développement (http local)', () => {
    expect(cle(entetesSecuriteAdmin(true), 'Strict-Transport-Security')).toBe('max-age=31536000');
    expect(cle(entetesSecuriteAdmin(false), 'Strict-Transport-Security')).toBeUndefined();
  });

  it('PAS de CSP globale (les routes de pièces et de mails posent la leur, plus stricte — elle ne doit pas être remplacée)', () => {
    expect(cle(entetesSecuriteAdmin(true), 'Content-Security-Policy')).toBeUndefined();
  });

  it('l’admin SEULE est concernée : le tunnel public ne reçoit rien de nouveau', async () => {
    const regles = await nextConfig.headers!();
    for (const r of regles) expect(r.source.startsWith('/admin') || r.source.startsWith('/api/admin')).toBe(true);
    const motifs = regles.map((r) => new RegExp(`^${r.source.replace(/:chemin\*/, '.*')}$`));
    const couvert = (p: string) => motifs.some((m) => m.test(p));
    expect(couvert('/admin')).toBe(true);
    expect(couvert('/admin/login')).toBe(true);
    expect(couvert('/api/admin/session')).toBe(true);
    expect(couvert('/')).toBe(false);
    expect(couvert('/api/analyse')).toBe(false);
  });
});
