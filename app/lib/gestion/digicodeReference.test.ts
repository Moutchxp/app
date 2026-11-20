import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (20/11/2026, lot 5) — une écriture d'origine n'a plus son bloc de digicodes : ils se lisent à l'adresse officielle qu'elle écrit autrement. */
const h = vi.hoisted(() => ({ ecriture: null as Record<string, unknown> | null, adresse: null as { cle: string } | null, avec505: true }));
const q = vi.hoisted(() => async (sql: string) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (s.startsWith('SELECT a.copropriete_id::text AS copro, a.ban_id AS ban')) return { rows: h.ecriture ? [h.ecriture] : [] };
  if (s.startsWith('SELECT cle_immeuble AS cle FROM gestion_copropriete_adresse WHERE copropriete_id = $1 AND ban_id = $2')) return { rows: h.adresse ? [h.adresse] : [] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (f: (x: typeof q) => unknown) => f(q) }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avec505 }));
import { cleDeReferenceDigicode } from './digicodesRepo';

beforeEach(() => { h.ecriture = null; h.adresse = null; h.avec505 = true; });
describe('la clé de référence des digicodes', () => {
  it('une écriture de la même adresse officielle que la copropriété → la clé de la copropriété (le 54 : un seul bloc)', async () => {
    h.ecriture = { copro: '276', ban: '92026_7184_00054', cle_copro: '54 avenue puvis de chavannes 92400 courbevoie', ban_copro: '92026_7184_00054' };
    expect(await cleDeReferenceDigicode('54 avneue puvis de chavannes')).toBe('54 avenue puvis de chavannes 92400 courbevoie');
  });
  it('une écriture d’une AUTRE adresse officielle de l’immeuble → la première adresse de cette adresse officielle (le 43 avenue Marceau du 80)', async () => {
    h.ecriture = { copro: '157', ban: '92026_6120_00043', cle_copro: '80 rue de normandie', ban_copro: '92026_6670_00080' };
    h.adresse = { cle: '43 avenue marceau' };
    expect(await cleDeReferenceDigicode('43 av marceau')).toBe('43 avenue marceau');
  });
  it('une adresse qui n’est pas une écriture, ou une base sans la 505 : sa propre clé', async () => {
    expect(await cleDeReferenceDigicode('80 rue de normandie')).toBe('80 rue de normandie');
    h.avec505 = false; h.ecriture = { copro: '1', ban: 'B', cle_copro: 'x', ban_copro: 'B' };
    expect(await cleDeReferenceDigicode('y')).toBe('y');
  });
});
