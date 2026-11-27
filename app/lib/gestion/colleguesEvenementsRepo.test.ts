import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (27/11/2026, 11h01, point 2) — les collègues de la fenêtre « Ouvert par » : comptes ACTIFS ayant accès à Gestion OU à Location. */
const h = vi.hoisted(() => ({ sql: [] as string[], avecLocation: true, rows: [] as Record<string, unknown>[] }));
vi.mock('../db/client', () => ({ query: async (s: string) => { h.sql.push(s.replace(/\s+/g, ' ').trim()); return { rows: h.rows }; } }));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => h.avecLocation }));
import { colleguesGestionLocation } from './colleguesEvenementsRepo';

beforeEach(() => { h.sql = []; h.avecLocation = true; h.rows = []; });

describe('colleguesGestionLocation', () => {
  it('actifs ET (administrateur OU perm_gestion OU perm_location) : la règle des tuiles ; SELECT seulement', async () => {
    h.rows = [{ id: 2, prenom: 'Arnaud', nom: 'Jorel' }];
    expect(await colleguesGestionLocation()).toEqual([{ id: 2, prenom: 'Arnaud', nom: 'Jorel' }]);
    expect(h.sql[0]).toContain("WHERE actif AND (role = 'administrateur' OR perm_gestion IS TRUE OR perm_location IS TRUE)");
    expect(/\b(INSERT|UPDATE|DELETE)\b/i.test(h.sql[0])).toBe(false);
  });
  it('sans la colonne perm_location : Gestion seule (la direction sûre)', async () => {
    h.avecLocation = false;
    await colleguesGestionLocation();
    expect(h.sql[0]).toContain("WHERE actif AND (role = 'administrateur' OR perm_gestion IS TRUE)");
    expect(h.sql[0]).not.toContain('perm_location');
  });
});
