import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (18/11/2026, « Mandat par bien », migration 492) — l'écriture du mandat SUR LE BIEN, après le contrôle. 🔒 Base simulée. */
const h = vi.hoisted(() => ({ sql: [] as { s: string; p: unknown[] }[], avant: { n: null as string | null, d: null as string | null }, usages: [] as Record<string, unknown>[] }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push({ s, p });
  if (s.startsWith('SELECT mandat_gestion_numero AS n') || s.startsWith('SELECT mandat_transaction_numero AS n')) return { rows: [h.avant] };
  if (s.startsWith('SELECT l.id::text, l.adresse')) return { rows: h.usages };
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { ecrireMandatDuBien, MandatAConfirmer, MandatRefuse } = await import('./mandatParBienRepo');
import type { RequeteTx } from '../db/client';
const tx = q as unknown as RequeteTx;
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
const ecritures = () => h.sql.filter((x) => /^(INSERT|UPDATE|DELETE)/.test(x.s));
const usage = (proprios: string[]) => ({ id: '50', adresse: '4 rue _TEST MANDAT', cp: '92600', commune: 'Asnières-sur-Seine', etage: '2', porte: null, proprios });
beforeEach(() => { h.sql = []; h.avant = { n: null, d: null }; h.usages = []; });

describe('🔴 le mandat écrit sur le bien', () => {
  it('un n° neuf : écrit sur le bien (n°, forme de comparaison, date) et journalisé sur le bien ; le n° est verrouillé le temps de la transaction', async () => {
    await ecrireMandatDuBien(tx, 60, { sorte: 'gestion', numero: 'MG 2026-041', signeLe: '2026-11-18' }, [11], false, AUTEUR, 'à « Nouveau bien »');
    expect(h.sql.some((x) => x.s.startsWith('SELECT pg_advisory_xact_lock') && x.p[0] === 'mandat-bien:gestion:MG202641')).toBe(true);
    expect(ecritures().map((x) => [x.s.slice(0, 60), x.p])).toEqual([
      ['UPDATE gestion_annuaire_lot SET mandat_gestion_numero = $2, ', [60, 'MG 2026-041', 'MG202641', '2026-11-18']],
      ['INSERT INTO gestion_journal (entite, entite_id, action, vale', [60, 'location_numero_mandat', null, 'MG 2026-041 · 2026-11-18', 'Mandat de gestion du bien saisi à « Nouveau bien »', 2, 'a.jorel@sansvisavis.com']]]);
  });
  it('déjà sur un bien du même propriétaire, sans confirmation : MandatAConfirmer, rien d’écrit ; confirmé : écrit', async () => {
    h.usages = [usage(['11'])];
    await expect(ecrireMandatDuBien(tx, 60, { sorte: 'gestion', numero: 'MG 41', signeLe: null }, [11], false, AUTEUR, '…')).rejects.toBeInstanceOf(MandatAConfirmer);
    expect(ecritures()).toEqual([]);
    await ecrireMandatDuBien(tx, 60, { sorte: 'gestion', numero: 'MG 41', signeLe: null }, [11], true, AUTEUR, '…');
    expect(ecritures()).toHaveLength(2);
  });
  it('🔴 déjà chez un autre propriétaire : MandatRefuse même confirmé, rien d’écrit', async () => {
    h.usages = [usage(['20'])];
    await expect(ecrireMandatDuBien(tx, 60, { sorte: 'transaction', numero: 'MT 7', signeLe: null }, [11], true, AUTEUR, '…')).rejects.toBeInstanceOf(MandatRefuse);
    expect(ecritures()).toEqual([]);
  });
  it('rien de changé : rien d’écrit ; n° vide : celui du bien est gardé (la date seule change, sans contrôle)', async () => {
    h.avant = { n: 'MG 41', d: null };
    await ecrireMandatDuBien(tx, 60, { sorte: 'gestion', numero: 'MG 41', signeLe: null }, [11], false, AUTEUR, '…');
    expect(ecritures()).toEqual([]);
    h.usages = [usage(['20'])];
    await ecrireMandatDuBien(tx, 60, { sorte: 'gestion', numero: null, signeLe: '2026-11-01' }, [11], false, AUTEUR, '…');
    expect(ecritures()[0].p).toEqual([60, 'MG 41', 'MG41', '2026-11-01']);
  });
});
