import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/** 🔴🔴 Arno (18/11/2026, « Mandat par bien », lot 3) — l'écriture de la reprise : seulement les n° encore vides, une ligne au journal du bien, rien d'effacé. 🔒 Base simulée. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], avec492: true, vides: new Set([10]) }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('UPDATE gestion_annuaire_lot')) return { rows: [], rowCount: h.vides.has(p[0] as number) ? 1 : 0 };
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({ query: q, withTransaction: async (f: (x: typeof q) => unknown) => f(q) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => h.avec492 }));
const { appliquerRepriseMandats } = await import('./repriseMandatsParBienRepo');
const AUTEUR = { id: null, libelle: 'reprise « mandat par bien » (script)' };
const PLAN = { affectations: [{ lotId: 10, adresse: '10 rue', sorte: 'gestion' as const, numero: 'MG 7', signeLe: null, depuis: [1] },
  { lotId: 11, adresse: '11 rue', sorte: 'gestion' as const, numero: 'MG 7', signeLe: null, depuis: [1] }], deja: [], autres: [], plusieurs: [], conflits: [], restentSurLaFiche: [] };
beforeEach(() => { h.sql = []; h.avec492 = true; });

describe('🔴 l’écriture de la reprise', () => {
  it('seulement un n° encore vide (le 11 en avait un entre-temps : rien) ; une ligne au journal du bien écrit ; aucun DELETE, la fiche du propriétaire jamais touchée', async () => {
    expect(await appliquerRepriseMandats(PLAN, AUTEUR as never)).toEqual({ ok: true, ecrits: 1 });
    const ecrit = h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
    expect(ecrit.filter((x) => x.s.startsWith('UPDATE')).every((x) => x.s.includes('AND mandat_gestion_numero IS NULL'))).toBe(true);
    expect(ecrit.filter((x) => x.s.startsWith('INSERT')).map((x) => x.p[0])).toEqual([10]);
    expect(ecrit.some((x) => /DELETE|gestion_annuaire_proprietaire/.test(x.s))).toBe(false);
  });
  it('sans la 492 : refus, rien d’écrit', async () => {
    h.avec492 = false;
    expect((await appliquerRepriseMandats(PLAN, AUTEUR as never)).ok).toBe(false);
    expect(h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s))).toEqual([]);
  });
  it('le script : à blanc par défaut (session en lecture seule), --reel seul écrit ; ses rapports dans .captures/mandats/', () => {
    const src = readFileSync('app/scripts/mandats-par-bien-reprise.ts', 'utf8');
    expect(src).toContain("const reel = process.argv.includes('--reel');");
    expect(src).toContain("if (!reel) await query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');");
    expect(src).toContain("nomScript: 'mandats'");
    expect(src).not.toMatch(/Desktop|Bureau/);
  });
});
