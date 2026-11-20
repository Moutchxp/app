import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (20/11/2026, lot 5) — l'essai d'unification n'écrit rien : connexion en lecture seule exigée, aucune instruction d'écriture, tables comptées. */
const h = vi.hoisted(() => ({ sql: [] as string[], lectureSeule: 'on' }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push(s);
  if (s.startsWith('SELECT current_database() AS base')) return { rows: [{ base: 'svav_recette', lecture_seule: h.lectureSeule }] };
  if (s.startsWith('SELECT to_regclass($1)::text AS t')) return { rows: [{ t: p[0] }] };
  if (s.startsWith('SELECT count(*)::text AS n FROM')) return { rows: [{ n: '3' }] };
  if (s.startsWith('SELECT id::text, immeuble, adresse')) return { rows: [{ id: '1', immeuble: '54 Avneue Puvis de Chavannes', adresse: null, code_postal: '92400', commune: 'Courbevoie' }] };
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../gestion/digicodesRepo', () => ({ digicodesDesAdresses: async () => [] }));
vi.mock('../gestion/regroupementCoproprietesRepo', () => ({ regroupementsEnCours: async () => [] }));
vi.mock('./banRepo', () => ({ rapprocherBien: async () => ({ statut: 'introuvable', ban: null, codePostal: '92400' }), rapprocherAdresse: async () => ({ statut: 'introuvable', ban: null }) }));
import { unificationDuStock } from './unificationStockRepo';

beforeEach(() => { h.sql = []; h.lectureSeule = 'on'; });
describe('🔴 l’essai d’unification n’écrit rien', () => {
  it('aucune instruction d’écriture ; les tables du chantier comptées avant et après, identiques', async () => {
    const e = await unificationDuStock();
    expect(e.ok && [e.intact, e.plan.biens.total]).toEqual([true, 1]);
    expect(h.sql.filter((s) => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/i.test(s))).toEqual([]);
  });
  it('une connexion qui n’est pas en lecture seule : refus, rien n’est lu au-delà', async () => {
    h.lectureSeule = 'off';
    expect(await unificationDuStock()).toEqual({ ok: false, motif: 'La connexion à « svav_recette » n’est pas en lecture seule : rien n’est fait.' });
    expect(h.sql).toHaveLength(1);
  });
});
