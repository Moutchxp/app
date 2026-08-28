import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Lot C — issue de secours du verrou de commune (`debloquerDepotPresumeSansAccuse`) + lecture des communes bloquées
 * (`communesBloqueesTeleservice`). On mocke `../db/client` et on capture chaque (sql, params). Protocole : COMPORTEMENT +
 * PARAMÈTRES LIÉS + fragments SQL sémantiques whitespace-normalisés (jamais la forme exacte).
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { statut: 'envoyee' as string | null, presomptionLevee: true, bloquees: [] as { code_insee: string; reference: string | null; demande_id: number }[] };
  const run = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/SELECT statut FROM demande WHERE id = \$1/i.test(sql)) return { rows: [{ statut: etat.statut }], rowCount: 1 };
    if (/UPDATE demande_depot_presume[\s\S]*RETURNING/i.test(sql)) return { rows: etat.presomptionLevee ? [{ id: 1 }] : [], rowCount: etat.presomptionLevee ? 1 : 0 };
    if (/FROM demande_depot_presume dp JOIN demande d/i.test(sql)) return { rows: etat.bloquees, rowCount: etat.bloquees.length };
    return { rows: [], rowCount: 1 };
  };
  const withTransactionMock = async (fn: (q: typeof run) => Promise<unknown>) => fn(run);
  return { appels, etat, queryMock: run, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { debloquerDepotPresumeSansAccuse, communesBloqueesTeleservice } from './demandeRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.statut = 'envoyee'; etat.presomptionLevee = true; etat.bloquees = []; });

describe('debloquerDepotPresumeSansAccuse — issue de secours « pas d’accusé attendu »', () => {
  it('résout la présomption VIVANTE en « sans_accuse », NE touche PAS demande.statut, et journalise', async () => {
    const leve = await debloquerDepotPresumeSansAccuse(866, 'admin');
    expect(leve).toBe(true);
    const upd = trouver(/UPDATE demande_depot_presume/i)!;
    expect(norm(upd.sql)).toContain("resolution = 'sans_accuse'");
    expect(norm(upd.sql)).toContain('WHERE demande_id = $1 AND resolu_le IS NULL'); // présomption VIVANTE seule
    expect(upd.params).toEqual([866, 'admin']);
    // jamais de changement de statut de la demande
    expect(appels.some((a) => /UPDATE demande SET statut/i.test(a.sql))).toBe(false);
    // audit
    const jr = trouver(/INSERT INTO demande_journal/i)!;
    expect(jr, 'le déblocage doit être journalisé').toBeDefined();
    expect(norm(jr.sql)).toContain('déblocage commune');
  });

  it('idempotent : AUCUNE présomption vivante → false, aucun journal', async () => {
    etat.presomptionLevee = false;
    const leve = await debloquerDepotPresumeSansAccuse(866, 'admin');
    expect(leve).toBe(false);
    expect(trouver(/INSERT INTO demande_journal/i)).toBeUndefined();
  });
});

describe('communesBloqueesTeleservice — communes en attente d’accusé (pour le vivier)', () => {
  it('renvoie une entrée par code_insee, avec la référence SVAV de la demande qui bloque', async () => {
    etat.bloquees = [{ code_insee: '75056', reference: 'SVAV-DEM-2026-000160', demande_id: 866 }];
    const map = await communesBloqueesTeleservice();
    expect(map['75056']).toEqual({ reference: 'SVAV-DEM-2026-000160', demandeId: 866 });
    // ne lit QUE les présomptions vivantes
    expect(norm(trouver(/FROM demande_depot_presume dp JOIN demande d/i)!.sql)).toContain('WHERE dp.resolu_le IS NULL');
  });

  it('aucune commune bloquée → objet vide', async () => {
    etat.bloquees = [];
    expect(await communesBloqueesTeleservice()).toEqual({});
  });
});
