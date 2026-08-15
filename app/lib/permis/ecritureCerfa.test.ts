import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N7-D — dépôt d'écriture Cerfa (niveau PERMIS). `db/client` mocké. On éprouve : la purge CIBLÉE methode='cerfa' ; l'écriture des
 * colonnes déclarées SANS lire les corps (la règle « ≥2 corps » ne s'applique pas) ; le journal (retenue avec pièce/champ/
 * confiance/réserve, ecartee+motif pour le non-écrit) ; l'invariant saisie (ignoré → ecartee). Comportement + paramètres liés.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = { originesGlobal: {} as Record<string, unknown> };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/_origine\s+AS\s+"/i.test(sql) && /FROM\s+permis_caracteristique/i.test(sql)) return { rows: [state.originesGlobal] };
    return { rows: [] };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireCerfa, MOTIF_SAISIE_PRIORITAIRE } from './ecritureCerfa';
import { decisionCerfa, type ChampCerfa } from './decisionCerfa';

const champ = (nom: string, valeur: string): ChampCerfa => ({ nom, valeur, page: 4, pieceNom: 'cerfa_13409.pdf' });
const decisionComplete = () => decisionCerfa([
  champ('S1M_stationnementapres', '0'), champ('W2SF1', '13032'),
  champ('W2BF1', '11901'), champ('W2CF1', '356'),
  champ('T2Q_numero', '3'), champ('T2V_voie', 'AVENUE X'), champ('T2L_localite', 'PARIS'),
], 13032);

// index params journal : 0 dossier 1 champ 2 valeur 3 role 4 confiance 5 reserve 6 motif 7 piece 8 page 9 extrait
const journal = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_extraction_journal/i.test(a.sql)).map((a) => a.params);
const deletesCerfa = () => H.appels.filter((a) => /DELETE\s+FROM\s+permis_extraction_journal/i.test(a.sql) && /methode\s*=\s*'cerfa'/i.test(a.sql));
const insertCaract = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_caracteristique/i.test(a.sql));
const lectureCorps = () => H.appels.filter((a) => /json_agg/i.test(a.sql));

beforeEach(() => { H.appels.length = 0; H.state.originesGlobal = {}; });

describe('ecrireCerfa — écriture niveau permis + journal', () => {
  it('purge CIBLÉE methode=cerfa, écrit les colonnes permis, NE lit PAS les corps', async () => {
    const r = await ecrireCerfa(1, decisionComplete(), 'auto');
    expect(deletesCerfa()).toHaveLength(1);                       // recompute idempotent, ciblé
    expect(insertCaract().length).toBeGreaterThan(0);            // upsert des colonnes déclarées
    expect(lectureCorps()).toHaveLength(0);                       // règle « ≥2 corps » NON héritée : les corps ne sont pas lus
    expect(r.champsEcrits.sort()).toEqual(['adresse_terrain', 'destinations', 'nb_places_stationnement', 'surface_plancher_m2']);
  });

  it('journalise retenue (pièce, champ, confiance, réserve) et ecartee+motif pour le non-écrit', async () => {
    await ecrireCerfa(1, decisionComplete(), 'auto');
    const surf = journal().find((p) => p[1] === 'surface_plancher_m2')!;
    expect(surf[3]).toBe('retenue'); expect(surf[4]).toBe('confirmee'); expect(surf[7]).toBe('cerfa_13409.pdf');
    const stat = journal().find((p) => p[1] === 'nb_places_stationnement')!;
    expect(stat[3]).toBe('retenue'); expect(stat[2]).toBe(0); expect(stat[9]).toContain('S1M_stationnementapres');
    const dest = journal().find((p) => p[1] === 'destinations')!; // N13 — tableau des sous-destinations (valeur numérique NULL ; libellés dans l'extrait)
    expect(dest[3]).toBe('retenue'); expect(dest[2]).toBeNull(); expect(dest[9]).toContain('Bureau'); expect(dest[9]).toContain('W2·F1');
    const log = journal().find((p) => p[1] === 'nb_logements')!;
    expect(log[3]).toBe('ecartee'); expect(log[6]).toContain('absence de champ ne vaut pas zéro');
    const corpsAdr = journal().find((p) => p[1] === 'adresse')!;
    expect(corpsAdr[3]).toBe('ecartee'); expect(corpsAdr[6]).toContain('attribution par bâtiment');
  });

  it('champ déjà « saisie » → non écrasé, journal ecartee (saisie prioritaire)', async () => {
    H.state.originesGlobal = { surfacePlancherM2: 'saisie' };
    const r = await ecrireCerfa(1, decisionComplete(), 'auto');
    expect(r.champsIgnoresSaisie).toContain('surface_plancher_m2');
    const surf = journal().find((p) => p[1] === 'surface_plancher_m2')!;
    expect(surf[3]).toBe('ecartee'); expect(surf[6]).toBe(MOTIF_SAISIE_PRIORITAIRE);
  });
});
