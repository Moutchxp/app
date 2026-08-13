import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D2 — listerDemandes enrichit chaque demande de ses `rangs` de catégorie (pour le filtre par type), via une requête PROPRE
 * réutilisant expressionRangSql. On mocke ../db/client et on route par fragment de SQL. On PROUVE que : (1) la requête rangs
 * est bien émise et rattachée ; (2) la liste n'émet PAS la requête des CANDIDATS (chemin candidats non touché).
 */
const { appels, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (sql.includes('config_veille')) return { rows: [] };                                  // → chargerConfigVeille repli défauts
    if (sql.includes('array_agg(DISTINCT')) return { rows: [{ demande_id: 1, rangs: [1, 4], numeros: ['PC0920042500001', 'PC0920042500002'] }] };
    if (sql.includes('FROM demande d LEFT JOIN commune')) return { rows: [{ id: 1, reference: 'SVAV-DEM-2026-000001', code_insee: '92004', commune_nom: 'Asnières', dest_canal: 'email', dest_origine: 'mairie_contact', dest_nom: null, nb: 2, dossiers_dus: 2, statut: 'prete', profil_demandeur: 'entreprise', cree_le: '2026-01-01' }] };
    if (sql.includes('GROUP BY statut')) return { rows: [{ statut: 'prete', n: 1 }] };
    if (sql.includes('count(DISTINCT dossier_id)')) return { rows: [{ n: 2 }] };
    return { rows: [] };
  };
  return { appels, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { listerDemandes } from './demandeRepo';

beforeEach(() => { appels.length = 0; });

describe('D2 — listerDemandes : enrichissement rangs, chemin candidats intact', () => {
  it('émet la requête rangs (array_agg DISTINCT sur demande_dossier ⋈ sitadel_dossier, GROUP BY demande)', async () => {
    await listerDemandes();
    const q = appels.find((a) => a.sql.includes('array_agg(DISTINCT'));
    expect(q).toBeDefined();
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain('FROM demande_dossier dd JOIN sitadel_dossier d ON d.id = dd.dossier_id');
    expect(norm).toContain('GROUP BY dd.demande_id');
    expect(norm).toContain('LEAST('); // classement par catégorie réutilisé (expressionRangSql)
  });

  it('rattache les rangs à la demande', async () => {
    const { demandes } = await listerDemandes();
    expect(demandes[0].rangs).toEqual([1, 4]);
  });

  it('T6-B — la MÊME requête agrège AUSSI les num_dau des dossiers ACTIFS (colonne « N° permis »), aucun aller-retour', async () => {
    await listerDemandes();
    const q = appels.find((a) => a.sql.includes('array_agg(DISTINCT'));
    const norm = q!.sql.replace(/\s+/g, ' ');
    expect(norm).toContain('array_agg(d.num_dau ORDER BY d.num_dau) FILTER (WHERE dd.actif) AS numeros'); // ACTIFS seulement → cohérent avec `nb`
  });

  it('T6-B — rattache les numéros de permis à la demande', async () => {
    const { demandes } = await listerDemandes();
    expect(demandes[0].numeros).toEqual(['PC0920042500001', 'PC0920042500002']);
  });

  it('T2-C — le compte de dossiers ne compte QUE les attachés (dd.actif) ; expose aussi les dus (actif ET non satisfait)', async () => {
    const { demandes } = await listerDemandes();
    const q = appels.find((a) => a.sql.includes('FROM demande d LEFT JOIN commune'));
    const norm = q!.sql.replace(/\s+/g, ' ');
    // nb (colonne Dossiers + en-tête) = dossiers ATTACHÉS : un dossier retiré (actif=false) n'est jamais compté comme couvert.
    expect(norm).toContain('count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS nb');
    // dossiers_dus = attachés ET non satisfaits → sert au masquage « En cours » des demandes à 0 dû.
    expect(norm).toContain('dd.actif AND dd.satisfait_le IS NULL) AS dossiers_dus');
    expect(demandes[0].dossiersDus).toBe(2); // remonté sur la ligne de liste
  });

  it('NE réutilise PAS le tri des candidats (aucune requête liste ne porte l’ordre secondaire candidats)', async () => {
    await listerDemandes();
    // La signature du tri des candidats (construireRequeteListe) : « … superficie_terrain ELSE d.surf_creee END) DESC NULLS LAST ».
    expect(appels.some((a) => a.sql.includes('superficie_terrain ELSE d.surf_creee END) DESC'))).toBe(false);
    expect(appels.some((a) => /LIMIT \$\d+ OFFSET \$\d+/.test(a.sql))).toBe(false); // ni LIMIT/OFFSET des candidats
  });
});
