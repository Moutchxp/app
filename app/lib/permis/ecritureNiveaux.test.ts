import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * N9-B — dépôt d'écriture des tableaux de niveaux. `db/client` mocké (routé par fragment SQL). On éprouve : la CORRECTION explicite
 * (82,93 → 84,57 sur 2D1) journalisée ; le sommet PAR CORPS (acrotère/toiture) ; le garde-corps écarté avec motif ; l'effacement du
 * sommet permis 89,46 (réattribué) ; l'invariant (saisie non écrasée) ; le journal sous methode='enonce'.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  // N10-S — `journal` modélise la table permis_extraction_journal (methode/champ), pour PROUVER qu'une purge scopée épargne la
  //   trace d'un autre writer. Le mock applique la VRAIE sémantique DELETE (methode + éventuel filtre champ = ANY) et INSERT.
  const state = { global: null as unknown, corps: [] as unknown[], origineCorps: {} as Record<string, unknown>, insertCorpsId: 200, journal: [] as { methode: string | null; champ: unknown }[] };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/json_agg/i.test(sql)) return { rows: [{ global: state.global, corps: state.corps }] };
    if (/DELETE\s+FROM\s+permis_extraction_journal/i.test(sql)) {
      const methode = /methode\s*=\s*'(\w+)'/i.exec(sql)?.[1] ?? null;
      const parChamp = /champ\s*=\s*ANY/i.test(sql) ? (params?.[1] as unknown[]) : null; // null = purge NON filtrée par champ (l'ancien défaut)
      for (let i = state.journal.length - 1; i >= 0; i--) { const r = state.journal[i]; if ((methode === null || r.methode === methode) && (parChamp === null || parChamp.includes(r.champ))) state.journal.splice(i, 1); }
      return { rows: [] };
    }
    if (/INSERT\s+INTO\s+permis_extraction_journal/i.test(sql)) { state.journal.push({ methode: /'(\w+)'/.exec(sql)?.[1] ?? null, champ: params?.[2] }); return { rows: [] }; }
    if (/INSERT\s+INTO\s+permis_corps_batiment/i.test(sql)) return { rows: [{ id: state.insertCorpsId }] };
    if (/_origine\s+AS\s+"/i.test(sql) && /FROM\s+permis_corps_batiment/i.test(sql)) return { rows: [state.origineCorps] };
    return { rows: [] };
  };
  return { appels, state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { ecrireNiveaux } from './ecritureNiveaux';
import type { DecisionNiveaux } from './decisionNiveaux';

const src = (piece: string, page: number) => ({ piece, page });
const decision = (): DecisionNiveaux => ({
  corps: [
    { repere: '2D1', niveaux: [], sources: [src('PC3.pdf', 2)], nbPieces: 3,
      plancher: { valeur: 84.57, label: 'R07', confiance: 'confirmee', sources: [src('PC3.pdf', 2)] },
      nbEtages: { valeur: 7, confiance: 'confirmee', sources: [src('PC3.pdf', 2)], tension: null },
      nbSousSol: { valeur: 1, confiance: 'confirmee', sources: [src('PC3.pdf', 2)], reserve: null },
      sommet: { valeur: 88.91, confiance: 'confirmee', qualif: 'acrotere', label: 'Acrotère', ecart: 0.5, sources: [src('PC3.pdf', 2)], note: null },
      gardeCorps: [{ cote: 89.46, pieces: ['PC3.pdf', 'PC40.pdf'] }], niveauxNommes: [], superstructures: [] },
    { repere: '2D2', niveaux: [], sources: [src('PC3.pdf', 2)], nbPieces: 3,
      plancher: { valeur: 82.93, label: 'R07', confiance: 'confirmee', sources: [src('PC3.pdf', 2)] },
      nbEtages: { valeur: 7, confiance: 'confirmee', sources: [src('PC3.pdf', 2)], tension: 'la coupe donne 7 niveaux R0n ; le décompte texte dit R+6 (PC4.pdf)' },
      nbSousSol: { valeur: 1, confiance: 'confirmee', sources: [src('PC3.pdf', 2)], reserve: null },
      sommet: { valeur: 86.11, confiance: 'confirmee', qualif: 'toiture', label: 'TOITURE', ecart: null, sources: [src('PC3.pdf', 2)], note: 'acrotère 87.13 vu sur 1 pièce seulement (non corroboré) → non retenu' },
      gardeCorps: [], niveauxNommes: [], superstructures: [] },
  ],
  gardeCorpsAttribue: { cote: 89.46, repere: '2D1' },
  nonAttribue: null,
});

const journal = () => H.appels.filter((a) => /INSERT\s+INTO\s+permis_extraction_journal/i.test(a.sql)).map((a) => a.params);
// 0 dossier 1 corps 2 champ 3 valeur 4 unite 5 role 6 conf 7 reserve 8 motif 9 piece 10 page 11 extrait

beforeEach(() => {
  H.appels.length = 0; H.state.origineCorps = {}; H.state.insertCorpsId = 200; H.state.journal = [];
  // 2D1 = corps #1 avec un plancher FAUX (82,93 = R07 de 2D2) à corriger ; 2D2 = corps #2 ; sommet permis 89,46 (extraite).
  H.state.corps = [{ id: 1, repere: '2D1', altitudeDernierPlancherNgf: 82.93, altitudeSommetNgf: null }, { id: 2, repere: '2D2', altitudeDernierPlancherNgf: null, altitudeSommetNgf: null }];
  H.state.global = { altitudeSommetNgf: 89.46, altitudeSommetNgfOrigine: 'extraite' };
});

describe('ecrireNiveaux', () => {
  it('CORRIGE le plancher 2D1 (82,93 → 84,57) et le dit dans le journal + le résultat', async () => {
    const r = await ecrireNiveaux(1, decision(), 'enonce:niveaux');
    const c2d1 = r.corps.find((c) => c.repere === '2D1')!;
    expect(c2d1.corrections.join(' ')).toContain('82.93');
    expect(c2d1.corrections.join(' ')).toContain('84.57');
    const p = journal().find((x) => x[1] === 1 && x[2] === 'altitude_dernier_plancher_ngf' && x[5] === 'retenue')!;
    expect(p[3]).toBe(84.57); expect(String(p[7])).toContain('corrige 82.93');
  });

  it('sommet PAR CORPS : 2D1 = acrotère 88,91 (retenue) ; garde-corps 89,46 écarté avec motif « ajouré »', async () => {
    await ecrireNiveaux(1, decision(), 'enonce:niveaux');
    const som = journal().find((x) => x[1] === 1 && x[2] === 'altitude_sommet_ngf' && x[5] === 'retenue')!;
    expect(som[3]).toBe(88.91); expect(String(som[7])).toContain('Acrotère');
    const gc = journal().find((x) => x[1] === 1 && x[2] === 'altitude_sommet_ngf' && x[5] === 'ecartee' && x[3] === 89.46)!;
    expect(String(gc[8])).toContain('garde-corps'); expect(String(gc[8])).toContain('ajouré');
  });

  it('2D2 : sommet = toiture 86,11 ; nb_etages 7 porte la réserve de tension R+6/R+7', async () => {
    await ecrireNiveaux(1, decision(), 'enonce:niveaux');
    const som = journal().find((x) => x[1] === 2 && x[2] === 'altitude_sommet_ngf' && x[5] === 'retenue')!;
    expect(som[3]).toBe(86.11); expect(String(som[7])).toContain('TOITURE');
    const et = journal().find((x) => x[1] === 2 && x[2] === 'nb_etages' && x[5] === 'retenue')!;
    expect(et[3]).toBe(7); expect(String(et[7])).toContain('R+6');
  });

  it('sommet PERMIS 89,46 EFFACÉ (réattribué) : UPDATE …=NULL + journal ecartee expliquant', async () => {
    const r = await ecrireNiveaux(1, decision(), 'enonce:niveaux');
    expect(r.sommetPermisEfface).toBe(true);
    expect(H.appels.some((a) => /UPDATE\s+permis_caracteristique\s+SET\s+altitude_sommet_ngf\s*=\s*NULL/i.test(a.sql))).toBe(true);
    const eff = journal().find((x) => x[1] === null && x[2] === 'altitude_sommet_ngf')!;
    expect(String(eff[8])).toContain('effacé'); expect(String(eff[8])).toContain('garde-corps');
  });

  it('invariant : sommet permis en « saisie » → NON effacé, journal MOTIF saisie', async () => {
    H.state.global = { altitudeSommetNgf: 90, altitudeSommetNgfOrigine: 'saisie' };
    const r = await ecrireNiveaux(1, decision(), 'enonce:niveaux');
    expect(r.sommetPermisEfface).toBe(false);
    expect(H.appels.some((a) => /UPDATE\s+permis_caracteristique\s+SET\s+altitude_sommet_ngf\s*=\s*NULL/i.test(a.sql))).toBe(false);
    const eff = journal().find((x) => x[1] === null && x[2] === 'altitude_sommet_ngf')!;
    expect(String(eff[8])).toContain('saisie');
  });

  it('journal entièrement sous methode=enonce + purge ciblée avant écriture', async () => {
    await ecrireNiveaux(1, decision(), 'enonce:niveaux');
    expect(H.appels.filter((a) => /INSERT\s+INTO\s+permis_extraction_journal/i.test(a.sql)).every((a) => /'enonce'/.test(a.sql))).toBe(true);
    expect(H.appels.some((a) => /DELETE\s+FROM\s+permis_extraction_journal/i.test(a.sql) && /methode\s*=\s*'enonce'/i.test(a.sql))).toBe(true);
  });

  it('N10-S — la purge est SCOPÉE par champ : la trace « enonce/designation » d’un AUTRE writer SURVIT', async () => {
    H.state.journal = [{ methode: 'enonce', champ: 'designation' }]; // posée par ecritureDesignation avant que niveaux tourne
    await ecrireNiveaux(1, decision(), 'enonce:niveaux');
    // le bug d'origine : donnée juste (colonne), preuve perdue (journal). Ici la ligne DOIT survivre.
    expect(H.state.journal.some((r) => r.methode === 'enonce' && r.champ === 'designation')).toBe(true);
    // et le DELETE est bien filtré par champ, sur le DOMAINE de niveaux (jamais 'designation') — échoue si on réélargit la purge.
    const del = H.appels.find((a) => /DELETE\s+FROM\s+permis_extraction_journal/i.test(a.sql))!;
    expect(/champ\s*=\s*ANY/i.test(del.sql)).toBe(true);
    expect(del.params[1]).toContain('altitude_sommet_ngf');
    expect(del.params[1]).not.toContain('designation');
  });
});
