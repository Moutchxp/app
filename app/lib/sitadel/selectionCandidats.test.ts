import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * V2 — la config de sélection (nb_candidats_examines / tri_candidats) arrive bien jusqu'à la requête des CANDIDATS émise par
 * demandeRepo.proposition (chemin réel : proposition → lireDossiersPriorite → construireRequeteListe). On mocke ../db/client
 * et on capture (sql, params) ; on identifie la requête candidats par sa LIMIT/OFFSET (les autres requêtes n'en ont pas).
 * Protocole : comportement + paramètres LIÉS + fragments sémantiques, jamais la forme complète d'un SQL.
 */
const { appels, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  return {
    appels,
    queryMock: async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: [] as unknown[] }; },
  };
});

vi.mock('../db/client', () => ({ query: queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { proposition } from './demandeRepo';
import { CONFIG_VEILLE_DEFAUT, type ConfigVeille } from './veilleConfig';

beforeEach(() => { appels.length = 0; });
/** La requête des candidats est la SEULE à porter LIMIT/OFFSET (lireHistorique n'en a pas). */
const reqCandidats = () => appels.find((a) => /LIMIT \$\d+ OFFSET \$\d+/.test(a.sql));

describe('V2 — la config de sélection arrive jusqu’à la requête des candidats', () => {
  it('nb_candidats_examines devient le paramètre LIÉ de la LIMIT (avant-dernier param), OFFSET = 0 (page 1)', async () => {
    const cfg: ConfigVeille = { ...CONFIG_VEILLE_DEFAUT, nbCandidatsExamines: 1234 };
    await proposition(cfg);
    const q = reqCandidats();
    expect(q).toBeDefined();
    expect(q!.params[q!.params.length - 2]).toBe(1234); // LIMIT lié = valeur de config (plus aucune const 600)
    expect(q!.params[q!.params.length - 1]).toBe(0);     // OFFSET lié
  });

  it('tri_candidats = « date_puis_surface » gouverne l’ordre secondaire de CETTE requête (date avant surface)', async () => {
    await proposition({ ...CONFIG_VEILLE_DEFAUT, triCandidats: 'date_puis_surface' });
    const sql = reqCandidats()!.sql;
    const iDate = sql.indexOf('d.date_reelle_autorisation DESC NULLS LAST');
    const iSurface = sql.indexOf("CASE WHEN d.type = 'PD' THEN d.superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST");
    expect(iDate).toBeGreaterThan(-1);
    expect(iSurface).toBeGreaterThan(-1);
    expect(iDate).toBeLessThan(iSurface);
  });

  it('tri_candidats au défaut « surface_puis_date » → surface avant date', async () => {
    await proposition({ ...CONFIG_VEILLE_DEFAUT, triCandidats: 'surface_puis_date' });
    const sql = reqCandidats()!.sql;
    const iDate = sql.indexOf('d.date_reelle_autorisation DESC NULLS LAST');
    const iSurface = sql.indexOf("CASE WHEN d.type = 'PD' THEN d.superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST");
    expect(iSurface).toBeLessThan(iDate);
  });
});
