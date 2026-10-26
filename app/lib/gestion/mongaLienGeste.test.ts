import { describe, it, expect, vi } from 'vitest';
import {
  ACTION_JOURNAL_LIEN, MOTIF_LIEN_OUVERTURE, MOTIF_LIEN_RATTACHEMENT, auteurHumain, decisionDuLien, motifLienRattrapage,
  poserLiensMonga, preparerLiensMonga, referencesCreees, type PlanLiensMonga,
} from './mongaLienGeste';
import type { RequeteTx } from '../db/client';

/**
 * LOT MONGA-LIEN-PAR-LE-GESTE — le module qui pose le lien référence Monga → événement dans la transaction du geste.
 * On éprouve le COMPORTEMENT (décisions, paramètres liés, journal), jamais la forme exacte du SQL (AGENTS.md).
 */
const plat = (t: string): string => t.replace(/\s+/g, ' ');

/** Une fausse transaction qui répond selon le SENS de la requête, et garde tout ce qu'on lui a demandé. */
function fausseTransaction(rep: { lien?: (ref: string) => unknown[]; insertLien?: () => unknown[] }) {
  const appels: { sql: string; params: unknown[] }[] = [];
  const q = vi.fn(async (sql: string, params: unknown[] = []) => {
    const s = plat(sql);
    appels.push({ sql: s, params });
    if (s.includes('FROM gestion_monga_lien l')) return { rows: rep.lien?.(String(params[0])) ?? [] };
    if (s.includes('INSERT INTO gestion_monga_lien')) return { rows: rep.insertLien?.() ?? [{ id: 1 }] };
    return { rows: [] };
  });
  return { q: q as unknown as RequeteTx, appels };
}

const ARNO = { id: 1, libelle: 'arno' };

describe('les règles pures', () => {
  it('un humain, toujours : ni vide, ni « automatique » (même règle que la contrainte en base)', () => {
    expect(auteurHumain('arno')).toBe(true);
    expect(auteurHumain('a.dasilva')).toBe(true);
    for (const non of ['', '   ', 'automatique', ' Automatique ', null, undefined]) expect(auteurHumain(non)).toBe(false);
  });

  it('les cas limites d’Arno : aucune → créer · même événement → rien · autre événement → ne pas déplacer', () => {
    expect(decisionDuLien(null, 9)).toBe('creer');
    expect(decisionDuLien({ evenementId: 9, evenementReference: 'GES-2026-000009' }, 9)).toBe('deja');
    expect(decisionDuLien({ evenementId: 4, evenementReference: 'GES-2026-000004' }, 9)).toBe('ailleurs');
  });

  it('les motifs sont ceux d’Arno, mot pour mot', () => {
    expect(MOTIF_LIEN_RATTACHEMENT).toBe('relié par le rattachement du mail');
    expect(MOTIF_LIEN_OUVERTURE).toBe('relié par l’ouverture de l’événement');
    expect(motifLienRattrapage('26/10/2026')).toBe('rattrapage du 26/10/2026');
  });

  it('seules les références CRÉÉES font classer leurs anciens mails', () => {
    expect(referencesCreees([
      { reference: 'MNG-1001', issue: 'cree', evenementReference: null },
      { reference: 'MNG-1002', issue: 'deja', evenementReference: null },
      { reference: 'MNG-1003', issue: 'ailleurs', evenementReference: 'GES-2026-000004' },
    ])).toEqual(['MNG-1001']);
    expect(referencesCreees(undefined)).toEqual([]);
  });
});

describe('① lire avant d’écrire', () => {
  it('verrouille le lien vivant de CHAQUE référence, dans l’ordre alphabétique, sans rien écrire', async () => {
    const t = fausseTransaction({});
    const plan = await preparerLiensMonga(t.q, ['MNG-3000', 'MNG-1000', 'MNG-3000'], 9, ARNO);
    expect(plan.lignes.map((l) => l.reference)).toEqual(['MNG-1000', 'MNG-3000']);
    expect(plan.lignes.every((l) => l.decision === 'creer')).toBe(true);
    expect(t.appels.every((a) => a.sql.includes('FOR UPDATE'))).toBe(true);
    expect(t.appels.some((a) => a.sql.includes('INSERT'))).toBe(false);
  });

  it('un auteur non humain → plan vide, AUCUNE requête (la base refuserait le lien et ferait tomber le geste)', async () => {
    const t = fausseTransaction({});
    expect((await preparerLiensMonga(t.q, ['MNG-1000'], 9, { id: null, libelle: 'automatique' })).lignes).toEqual([]);
    expect(t.appels).toHaveLength(0);
  });
});

describe('② écrire ce qui a été décidé', () => {
  const plan = (decision: 'creer' | 'deja' | 'ailleurs'): PlanLiensMonga => ({
    lignes: [{
      reference: 'MNG-25126', decision,
      existant: decision === 'creer' ? null : { evenementId: decision === 'deja' ? 9 : 4, evenementReference: decision === 'deja' ? 'GES-2026-000009' : 'GES-2026-000004' },
    }],
  });
  const o = { evenementId: 9, evenementReference: 'GES-2026-000009', auteur: ARNO, motif: MOTIF_LIEN_RATTACHEMENT };

  it('créer : le lien est signé par l’auteur du geste, puis journalisé sur l’événement avec le motif', async () => {
    const t = fausseTransaction({});
    const r = await poserLiensMonga(t.q, plan('creer'), o);
    expect(r).toEqual([{ reference: 'MNG-25126', issue: 'cree', evenementReference: null }]);
    const ins = t.appels.find((a) => a.sql.includes('INSERT INTO gestion_monga_lien'));
    expect(ins?.params).toEqual(['MNG-25126', 9, 1, 'arno']);
    expect(ins?.sql).toContain('ON CONFLICT');
    const j = t.appels.find((a) => a.sql.includes('INSERT INTO gestion_journal'));
    expect(j?.params).toContain(ACTION_JOURNAL_LIEN);
    expect(j?.params).toContain('arno');
    expect(String(j?.params.find((p) => typeof p === 'string' && p.includes('MNG-25126 reliée')))).toContain(MOTIF_LIEN_RATTACHEMENT);
  });

  it('déjà relié au même événement, ou à un autre : RIEN n’est écrit, et l’autre événement est nommé', async () => {
    for (const d of ['deja', 'ailleurs'] as const) {
      const t = fausseTransaction({});
      const r = await poserLiensMonga(t.q, plan(d), o);
      expect(t.appels).toHaveLength(0);
      expect(r[0].issue).toBe(d);
      expect(r[0].evenementReference).toBe(d === 'ailleurs' ? 'GES-2026-000004' : null);
    }
  });

  it('un autre geste a posé le lien entre-temps : pas d’erreur (le rattachement passerait à la trappe), on relit qui le tient', async () => {
    const t = fausseTransaction({
      insertLien: () => [],
      lien: () => [{ evenement_id: 4, reference_evenement: 'GES-2026-000004' }],
    });
    const r = await poserLiensMonga(t.q, plan('creer'), o);
    expect(r).toEqual([{ reference: 'MNG-25126', issue: 'ailleurs', evenementReference: 'GES-2026-000004' }]);
    expect(t.appels.some((a) => a.sql.includes('INSERT INTO gestion_journal'))).toBe(false);
  });
});
