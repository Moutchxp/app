import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T7-C — orchestration du pré-cochage. Partie 1 : COMPORTEMENT par INJECTION (aucun IMAP, aucune base). Partie 2 : la requête
 * RÉELLE des candidats porte l'ANCRE anti-résurrection (repondu_auto_le IS NULL) + l'ancre anti-rétroactif (nature_classee_le)
 * + « pas encore répondu », et marquerReponduAuto ne touche NI repondu_par NI demande.statut.
 */
const { appels, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/FROM demande_reponse r\s+WHERE r\.nature = 'autre'/i.test(sql)) {
      return { rows: [{ reponse_id: 7, message_id: '<m7@mairie.fr>', de_adresse: 'urba@mairie.fr', recu_le: '2026-08-12T09:00:00.000Z' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
  return { appels, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock }));
vi.mock('../sitadel/veilleConfig', () => ({ chargerConfigVeille: vi.fn(async () => ({ releveActive: true, releveProfil: 'entreprise' })) }));

import { executerPreCochageAuto, depsReellesPreCochage, type DepsPreCochage } from './preCochageReponduAuto';
import type { CandidatRepondu, SortantEntete } from './preCochageRepondu';

const cand = (over: Partial<CandidatRepondu> = {}): CandidatRepondu => ({ reponseId: 7, messageId: '<m7@mairie.fr>', mairieAdresse: 'urba@mairie.fr', recuLe: new Date('2026-08-12T09:00:00Z'), ...over });
const sortantReponse = (over: Partial<SortantEntete> = {}): SortantEntete => ({ inReplyTo: '<m7@mairie.fr>', references: [], destinataires: ['urba@mairie.fr'], ...over });

function harness(opts: { active?: boolean; candidats?: CandidatRepondu[]; sortants?: SortantEntete[]; marquerThrows?: boolean } = {}) {
  const marques: number[] = [];
  const lireSortants = vi.fn(async () => opts.sortants ?? []);
  const lireCandidats = vi.fn(async () => opts.candidats ?? []);
  const deps: DepsPreCochage = {
    lireConfig: async () => ({ active: opts.active ?? true, profil: 'entreprise' }),
    lireCandidats,
    lireSortants,
    marquerReponduAuto: async (id) => { if (opts.marquerThrows) throw new Error('DB down'); marques.push(id); },
  };
  return { deps, marques, lireSortants, lireCandidats };
}

beforeEach(() => { appels.length = 0; });

describe('T7-C — executerPreCochageAuto (injection)', () => {
  it('sortant qui répond au fil ET adressé à la mairie → pré-coché une fois', async () => {
    const h = harness({ candidats: [cand()], sortants: [sortantReponse()] });
    const b = await executerPreCochageAuto(h.deps);
    expect(b.precoches).toBe(1);
    expect(h.marques).toEqual([7]);
  });

  it('aucun candidat → AUCUNE connexion IMAP (lireSortants jamais appelé — repli sûr)', async () => {
    const h = harness({ candidats: [] });
    const b = await executerPreCochageAuto(h.deps);
    expect(b).toMatchObject({ examines: 0, precoches: 0 });
    expect(h.lireSortants).not.toHaveBeenCalled();
  });

  it('opt-in désactivé → rien, aucun candidat chargé', async () => {
    const h = harness({ active: false, candidats: [cand()] });
    const b = await executerPreCochageAuto(h.deps);
    expect(b.precoches).toBe(0);
    expect(h.lireCandidats).not.toHaveBeenCalled();
  });

  it('TRANSFERT à un tiers (fil correct, To sans la mairie) → PAS de cochage', async () => {
    const h = harness({ candidats: [cand()], sortants: [sortantReponse({ destinataires: ['tiers@autre.fr'] })] });
    expect((await executerPreCochageAuto(h.deps)).precoches).toBe(0);
    expect(h.marques).toEqual([]);
  });

  it('sortant SANS en-tête de fil → PAS de cochage', async () => {
    const h = harness({ candidats: [cand()], sortants: [sortantReponse({ inReplyTo: null, references: [] })] });
    expect((await executerPreCochageAuto(h.deps)).precoches).toBe(0);
  });

  it('dossier envoyés vide / absent (lireSortants → []) → aucun cochage', async () => {
    const h = harness({ candidats: [cand()], sortants: [] });
    expect((await executerPreCochageAuto(h.deps)).precoches).toBe(0);
    expect(h.marques).toEqual([]);
  });

  it('ISOLATION : un marquage qui échoue est compté, n’interrompt pas les autres', async () => {
    const h = harness({ candidats: [cand({ reponseId: 7 }), cand({ reponseId: 8, messageId: '<m8@mairie.fr>' })],
      sortants: [sortantReponse(), sortantReponse({ inReplyTo: '<m8@mairie.fr>' })], marquerThrows: true });
    const b = await executerPreCochageAuto(h.deps);
    expect(b.erreurs).toBe(2);
    expect(b.precoches).toBe(0);
  });

  it('fenêtre SINCE = plus ancien recu_le des candidats (une réponse ne précède jamais le mail)', async () => {
    const h = harness({ candidats: [cand({ reponseId: 7, recuLe: new Date('2026-08-12T09:00:00Z') }), cand({ reponseId: 8, messageId: '<m8@x>', recuLe: new Date('2026-08-01T00:00:00Z') })], sortants: [] });
    await executerPreCochageAuto(h.deps);
    const depuis = (h.lireSortants.mock.calls[0] as unknown[])[2] as Date;
    expect(depuis).toEqual(new Date('2026-08-01T00:00:00Z'));
  });
});

describe('T7-C — depsReellesPreCochage : requêtes ancrées', () => {
  it('lireCandidats : nature=autre ∧ nature_classee_le IS NOT NULL ∧ repondu_le IS NULL ∧ repondu_auto_le IS NULL ∧ rattaché', async () => {
    const deps = depsReellesPreCochage();
    const candidats = await deps.lireCandidats('entreprise');
    const sel = appels.find((a) => /FROM demande_reponse r\s+WHERE r\.nature = 'autre'/i.test(a.sql))!;
    const sql = sel.sql.replace(/\s+/g, ' ');
    expect(sql).toContain("r.nature = 'autre'");
    expect(sql).toContain('r.nature_classee_le IS NOT NULL');   // anti-rétroactif (Paris protégée)
    expect(sql).toContain('r.repondu_le IS NULL');              // pas déjà répondu
    expect(sql).toContain('r.repondu_auto_le IS NULL');         // ANTI-RÉSURRECTION : jamais auto-coché deux fois
    expect(sql).toContain('r.demande_id IS NOT NULL');          // rattaché
    expect(sel.params).toEqual(['entreprise']);
    expect(candidats[0]).toMatchObject({ reponseId: 7, messageId: '<m7@mairie.fr>', mairieAdresse: 'urba@mairie.fr' });
  });
});
