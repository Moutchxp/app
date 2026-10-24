import { describe, expect, it, vi } from 'vitest';
import { instantParis } from '../../temps/paris';

/**
 * 🔴 Arno (24/10/2026) — UNE DATE RESTE LE MÊME JOUR. Une colonne `date` lue à minuit de Paris puis écrite par `toISOString()` reculait
 * d'un jour : la version du 24/10/2026 s'affichait « depuis le 23/10/2026 », une rétrocession d'août comptait en juillet, une règle du
 * négociateur commençait la veille. Les dates sont lues en TEXTE (`::text`) ; une `Date` éventuelle donne son jour civil À PARIS.
 * Base simulée.
 */
vi.mock('server-only', () => ({}));
const lues: string[] = [];
const query = vi.fn(async (sql: string) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  lues.push(s);
  if (s.includes('information_schema') || s.includes('to_regclass')) return { rows: [{ n: '1', existe: true, ok: true }], rowCount: 1 };
  if (s.includes('FROM gestion_location_retrocession')) {
    return { rows: [{ id: '1', negociateur_id: null, negociateur_libelle: 'Fictif', mois: s.includes('mois::text') ? '2026-08-01' : instantParis(2026, 8, 1), montant: '200', libelle: 'Alex' }], rowCount: 1 };
  }
  if (s.includes('FROM gestion_location_commission_regle')) {
    return { rows: [{ depuis: s.includes('depuis::text') ? '2026-01-01' : instantParis(2026, 1, 1), taux_negociateur: '0.15', prime_gestion_logement: '150', prime_gestion_parking: '50', prime_gestion_local: null }], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
});
vi.mock('../../db/client', () => ({ query, withTransaction: vi.fn() }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { lireRetrocessions, lireRegles } = await import('./suiviRepo');

describe('🔴 les dates du suivi ne reculent jamais d’un jour', () => {
  it('rétrocession d’août : mois « 2026-08-01 » (lu en texte) — elle compte en août, pas en juillet', async () => {
    const r = await lireRetrocessions();
    expect(lues.some((s) => s.includes('mois::text AS mois'))).toBe(true);
    expect(r.map((x) => x.mois)).toEqual(['2026-08-01']);
  });
  it('règle du négociateur du 01/01/2026 : « 2026-01-01 » (pas le 31/12/2025)', async () => {
    const r = await lireRegles();
    expect(lues.some((s) => s.includes('depuis::text AS depuis'))).toBe(true);
    expect(r.map((x) => x.depuis)).toEqual(['2026-01-01']);
  });
});
