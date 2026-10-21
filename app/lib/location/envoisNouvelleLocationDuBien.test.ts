import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026) — les lectures des boutons discrets et de l'Historique, sur une base SIMULÉE : le bail EN COURS de chaque
 * bien (posé sur lui, ou par une occupation en cours), et les envois RÉUSSIS du bien. Lecture seule : aucune écriture.
 * Fragments sémantiques et paramètres liés, jamais la forme exacte d'un SQL.
 */
const appels: { sql: string; params: unknown[] }[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ');
let colonnes = new Set(['bail_id', 'message']);
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM gestion_location_mail_envoi e JOIN gestion_bail g')) {
    return { rows: [{ id: '4', bail_id: '536', quand: '2026-10-21 14:32:00+02', par: 'Arno JOREL', n: 3, message: 'Bonjour' }], rowCount: 1 };
  }
  if (s.includes('SELECT DISTINCT ON (x.lot)')) return { rows: [{ lot: '7', id: '536', entree: '2026-11-01' }], rowCount: 1 };
  if (s.includes('FROM gestion_location_mail_envoi WHERE bail_id = $1')) return { rows: [], rowCount: 0 };
  return { rows: [], rowCount: 0 };
});
vi.mock('../db/client', () => ({ query: (sql: string, params?: unknown[]) => query(sql, params ?? []) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => colonnes.has(c) }));
const { bauxEnCoursDesLots, envoisDuBien } = await import('./mailNouvelleLocationRepo');

beforeEach(() => { appels.length = 0; colonnes = new Set(['bail_id', 'message']); });

describe('bauxEnCoursDesLots', () => {
  it('le bail EN COURS (sortie vide) posé sur le bien OU par une occupation en cours ; identifiants filtrés', async () => {
    expect(await bauxEnCoursDesLots([7, 7, -2, 8])).toEqual({ 7: { bailId: 536, entree: '2026-11-01', dernierEnvoi: null } });
    const a = appels.find((x) => x.sql.includes('DISTINCT ON (x.lot)'))!;
    expect(a.params).toEqual([[7, 8]]);
    expect(a.sql).toContain('g.sortie IS NULL');
    expect(a.sql).toContain('o.sortie IS NULL');
    expect(appels.every((x) => !/^(INSERT|UPDATE|DELETE)/.test(x.sql))).toBe(true);
  });
  it('aucun bien, ou base sans la 393 : rien, aucune requête', async () => {
    expect(await bauxEnCoursDesLots([])).toEqual({});
    colonnes = new Set();
    expect(await bauxEnCoursDesLots([7])).toEqual({});
    expect(appels).toEqual([]);
  });
});

describe('envoisDuBien', () => {
  it('les envois RÉUSSIS du bien, avec le nombre de destinataires et le message', async () => {
    colonnes.add('bail_id'); colonnes.add('message');
    expect(await envoisDuBien(7)).toEqual([{ id: 4, bailId: 536, quand: '2026-10-21 14:32:00+02', par: 'Arno JOREL', n: 3, message: 'Bonjour' }]);
    const a = appels.find((x) => x.sql.includes('FROM gestion_location_mail_envoi e'))!;
    expect(a.sql).toContain("e.statut = 'envoye'");
    expect(a.params).toEqual([7]);
  });
});
