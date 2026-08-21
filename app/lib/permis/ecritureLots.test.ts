import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N8-B — dépôt d'écriture par lot. `db/client` mocké (routé par fragment SQL). On éprouve : renommage d'un corps anonyme → 2D1 +
 * création de 2D2 (idempotent : réutilisés si déjà nommés) ; écriture des valeurs ; sommet déplacé au niveau permis ; journal
 * sous methode='enonce' (que le recompute ne purge pas) ; purge ciblée 'enonce'. Comportement + paramètres liés.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  // N10-S — `journal` modélise permis_extraction_journal (methode/champ) : le mock applique la VRAIE sémantique DELETE (methode +
  //   éventuel filtre champ = ANY) et INSERT, pour PROUVER qu'une purge scopée épargne la trace d'un autre writer.
  const state = { corps: [] as { id: number; repere: string | null }[], origineCorps: {} as Record<string, unknown>, insertCorpsId: 200, sommetOrigine: null as string | null, journal: [] as { methode: string | null; champ: unknown }[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/json_agg/i.test(sql)) return { rows: [{ global: null, corps: state.corps }] };
    if (/DELETE\s+FROM\s+permis_extraction_journal/i.test(sql)) {
      const methode = /methode\s*=\s*'(\w+)'/i.exec(sql)?.[1] ?? null;
      const parChamp = /champ\s*=\s*ANY/i.test(sql) ? (params?.[1] as unknown[]) : null; // null = purge NON filtrée par champ (l'ancien défaut)
      for (let i = state.journal.length - 1; i >= 0; i--) { const r = state.journal[i]; if ((methode === null || r.methode === methode) && (parChamp === null || parChamp.includes(r.champ))) state.journal.splice(i, 1); }
      return { rows: [] };
    }
    if (/INSERT\s+INTO\s+permis_extraction_journal/i.test(sql)) { state.journal.push({ methode: /'(\w+)'/.exec(sql)?.[1] ?? null, champ: params?.[2] }); return { rows: [] }; }
    if (/INSERT\s+INTO\s+permis_corps_batiment/i.test(sql)) return { rows: [{ id: state.insertCorpsId }] };
    if (/_origine\s+AS\s+"/i.test(sql) && /FROM\s+permis_corps_batiment/i.test(sql)) return { rows: [state.origineCorps] };
    if (/SELECT\s+altitude_sommet_ngf_origine/i.test(sql)) return { rows: [{ o: state.sommetOrigine }] };
    return { rows: [] };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireLots } from './ecritureLots';
import type { DecisionLots } from './decisionLots';

const src = (piece: string, page: number, extrait = 'x') => ({ piece, page, extrait });
const decision = (): DecisionLots => ({
  lots: [
    { repere: '2D1', nbEtages: { valeur: 7, confiance: 'confirmee', sources: [src('PC4_A4.pdf', 3)] }, nbSousSol: { valeur: 1, confiance: 'confirmee', sources: [src('PC39.pdf', 16)], note: 'partage commun/séparé non déterminé' }, plancher: { valeur: 82.93, confiance: 'a_verifier', motif: 'R07 = 82.93 énoncé ; R+7 = 2D1 énoncé', sources: [src('PC3.pdf', 2)] }, plancherMotif: null, sommetMotif: 'attribution par lot non établie (P4/P5)' },
    { repere: '2D2', nbEtages: { valeur: 6, confiance: 'confirmee', sources: [src('PC4_A4.pdf', 3)] }, nbSousSol: { valeur: 1, confiance: 'confirmee', sources: [src('PC39.pdf', 23)], note: 'partage commun/séparé non déterminé' }, plancher: null, plancherMotif: 'plancher R+6 de 2D2 non libellé par lot', sommetMotif: 'attribution par lot non établie (P4/P5)' },
  ],
  sommetPermis: { valeur: 89.46, reserve: 'superstructure de toiture…', source: src('PC3.pdf', 2, 'NGF +89.46') },
});

const journal = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_extraction_journal/i.test(a.sql));
const jrows = () => journal().map((a) => a.params); // 0 dossier 1 corps 2 champ 3 valeur 4 unite 5 role 6 conf 7 reserve 8 motif 9 piece 10 page 11 extrait
const updatesCorps = () => H.appels.filter((a) => /UPDATE\s+permis_corps_batiment\s+SET\s+repere/i.test(a.sql));
const insertsCorps = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_corps_batiment/i.test(a.sql));

beforeEach(() => { H.appels.length = 0; H.state.corps = []; H.state.origineCorps = {}; H.state.insertCorpsId = 200; H.state.sommetOrigine = null; H.state.journal = []; });

describe('ecrireLots — premier passage', () => {
  it('renomme le corps anonyme → 2D1, crée 2D2, écrit les valeurs, déplace le sommet au permis', async () => {
    H.state.corps = [{ id: 1, repere: null }]; // corps #1 existant, anonyme
    const r = await ecrireLots(1, decision(), 'enonce:lots');
    expect(updatesCorps().some((a) => a.params.includes('2D1'))).toBe(true); // renommage
    expect(insertsCorps().some((a) => a.params.includes('2D2'))).toBe(true); // création
    expect(r.corps.find((c) => c.repere === '2D1')!.corpsId).toBe(1);
    expect(r.corps.find((c) => c.repere === '2D2')!.cree).toBe(true);
    expect(r.sommetPermisEcrit).toBe(true);
    expect(H.appels.some((a) => /INSERT\s+INTO\s+permis_caracteristique/i.test(a.sql) && a.params.includes(89.46))).toBe(true);
  });

  it('journal sous methode=enonce : nb_etages retenu corroboré ; sommet du corps ecarté ; sommet permis retenu à vérifier + réserve', async () => {
    H.state.corps = [{ id: 1, repere: null }];
    await ecrireLots(1, decision(), 'enonce:lots');
    expect(journal().every((a) => /'enonce'/.test(a.sql))).toBe(true);
    const et = jrows().find((p) => p[2] === 'nb_etages' && p[3] === 7)!;
    expect(et[5]).toBe('retenue'); expect(et[6]).toBe('confirmee');
    const sommetCorps = jrows().filter((p) => p[2] === 'altitude_sommet_ngf' && p[1] !== null);
    expect(sommetCorps.every((p) => p[5] === 'ecartee' && String(p[8]).includes('attribution par lot'))).toBe(true);
    const sommetPermis = jrows().find((p) => p[2] === 'altitude_sommet_ngf' && p[1] === null)!;
    expect(sommetPermis[5]).toBe('retenue'); expect(sommetPermis[3]).toBe(89.46); expect(sommetPermis[6]).toBe('a_verifier'); expect(String(sommetPermis[7])).toContain('superstructure');
    // plancher 2D2 non écrit → ecartee avec motif « non libellé »
    const plancher2d2 = jrows().find((p) => p[2] === 'altitude_dernier_plancher_ngf' && p[5] === 'ecartee')!;
    expect(String(plancher2d2[8])).toContain('non libellé');
  });

  it('purge ciblée methode=enonce avant réécriture', async () => {
    H.state.corps = [{ id: 1, repere: null }];
    await ecrireLots(1, decision(), 'enonce:lots');
    expect(H.appels.some((a) => /DELETE\s+FROM\s+permis_extraction_journal/i.test(a.sql) && /methode\s*=\s*'enonce'/i.test(a.sql))).toBe(true);
  });

  it('N10-S — la purge est SCOPÉE par champ : la trace « enonce/designation » d’un AUTRE writer SURVIT', async () => {
    H.state.corps = [{ id: 1, repere: null }];
    H.state.journal = [{ methode: 'enonce', champ: 'designation' }]; // posée par ecritureDesignation avant que lots tourne
    await ecrireLots(1, decision(), 'enonce:lots');
    expect(H.state.journal.some((r) => r.methode === 'enonce' && r.champ === 'designation')).toBe(true); // SURVIT
    const del = H.appels.find((a) => /DELETE\s+FROM\s+permis_extraction_journal/i.test(a.sql))!;
    expect(/champ\s*=\s*ANY/i.test(del.sql)).toBe(true); // filtré par champ — échoue si on réélargit la purge
    expect(del.params[1]).toContain('altitude_sommet_ngf');
    expect(del.params[1]).not.toContain('designation');
  });
});

describe('ecrireLots — idempotence (corps déjà nommés)', () => {
  it('réutilise 2D1/2D2 existants : aucun renommage, aucune création', async () => {
    H.state.corps = [{ id: 1, repere: '2D1' }, { id: 2, repere: '2D2' }];
    const r = await ecrireLots(1, decision(), 'enonce:lots');
    expect(updatesCorps()).toHaveLength(0);
    expect(insertsCorps()).toHaveLength(0);
    expect(r.corps.map((c) => c.corpsId).sort()).toEqual([1, 2]);
  });
});
