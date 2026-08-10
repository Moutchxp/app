import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * S14e — verrou du CAST int8→int sur les identifiants de demande renvoyés au client. `demande.id` est un bigint que
 * node-postgres rend en CHAÎNE ; sans `d.id::int AS id`, l'id part au client en string et la PATCH groupée (filtre
 * Number.isInteger) l'écarte en silence. On capture le SQL émis via un mock de `../db/client`.
 */
const { sqls, queryMock } = vi.hoisted(() => {
  const sqls: string[] = [];
  return {
    sqls,
    queryMock: async (text: string) => { sqls.push(text); return { rows: [] as unknown[] }; },
  };
});

vi.mock('../db/client', () => ({
  query: queryMock,
  withTransaction: async () => undefined,
  pool: {},
  closePool: async () => undefined,
}));

import { listerDemandes, lireDemande, diagnostiquer } from './demandeRepo';
import type { CandidatDossier } from './demande';

beforeEach(() => { sqls.length = 0; });

const HIST = { dejaRattaches: new Set<number>(), permisCeMoisParCommune: new Map<string, number>() };
const PARAMS = { dossiersParDemande: 5, permisParCommuneParMois: 5, dateMin: null };
const c = (over: Partial<CandidatDossier>): CandidatDossier => ({
  dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'email', numDau: 'PC1', dateReelleAutorisation: '2025-03-10',
  adresse: 'x', codePostal: '75001', cadastre: [], etatDau: '2', absentDuDernierMillesime: false, ...over,
});

describe('S16 — diagnostiquer sépare les TROIS catégories', () => {
  it('formulaire → « à déposer à la main » (nommée) ; courrier → écartée (nommée) ; email → produit un lot', () => {
    const d = diagnostiquer([
      c({ dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire' as CandidatDossier['canal'] }),
      c({ dossierId: 2, codeInsee: '92050', communeNom: 'Nanterre', canal: 'courrier' as CandidatDossier['canal'] }),
      c({ dossierId: 3, codeInsee: '93066', communeNom: 'Saint-Denis', canal: 'email' }),
    ], HIST, PARAMS);
    expect(d.communesFormulaire).toEqual(['Paris']);   // à déposer à la main (produit un lot)
    expect(d.communesCourrier).toEqual(['Nanterre']);  // écartée faute d'adresse e-mail (pas de lot)
    // e-mail : ni dans formulaire ni dans courrier (envoyable — un lot est produit ailleurs)
    expect(d.communesFormulaire).not.toContain('Saint-Denis');
    expect(d.communesCourrier).not.toContain('Saint-Denis');
  });
});

describe('S14e — cast int8 des id de demande (round-trip client → PATCH groupée)', () => {
  it('listerDemandes caste d.id::int AS id', async () => {
    await listerDemandes();
    expect(sqls.some((s) => /d\.id::int\s+AS\s+id/.test(s))).toBe(true);
  });

  it('lireDemande caste d.id::int AS id', async () => {
    await lireDemande(1);
    expect(sqls.some((s) => /d\.id::int\s+AS\s+id/.test(s))).toBe(true);
  });
});

describe('Q2a — diagnostiquer : compteurs CONSTANTS (mêmes buckets, via la définition partagée)', () => {
  const canal = (v: string) => v as CandidatDossier['canal'];
  it('un dossier par critère → chaque compteur/bucket exact (comportement inchangé)', () => {
    const d = diagnostiquer([
      c({ dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'email' }),                 // proposable
      c({ dossierId: 2, etatDau: '4' }),                                                            // annulé
      c({ dossierId: 3, absentDuDernierMillesime: true }),                                          // absent du millésime
      c({ dossierId: 4, dateReelleAutorisation: null }),                                            // hors fenêtre (sans date)
      c({ dossierId: 5, dateReelleAutorisation: '2000-01-01' }),                                    // hors fenêtre (trop ancien)
      c({ dossierId: 6 }),                                                                          // déjà rattaché (via hist)
      c({ dossierId: 7, codeInsee: '11111', communeNom: null }),                                    // sans canal (commune inconnue)
      c({ dossierId: 8, codeInsee: '22222', canal: canal('inconnu') }),                             // sans canal
      c({ dossierId: 9, codeInsee: '92050', communeNom: 'Nanterre', canal: canal('courrier') }),    // courrier (écartée)
      c({ dossierId: 10, codeInsee: '93066', communeNom: 'Saint-Denis', canal: canal('formulaire') }), // formulaire (proposable + à déposer)
    ], { dejaRattaches: new Set([6]), permisCeMoisParCommune: new Map<string, number>() },
       { dossiersParDemande: 5, permisParCommuneParMois: 5, dateMin: '2020-01-01' });
    expect(d.candidatsExamines).toBe(10);
    expect(d.dossiersAnnules).toBe(1);
    expect(d.dossiersAbsents).toBe(1);
    expect(d.dossiersHorsFenetre).toBe(2);            // sans date + trop ancien
    expect(d.dossiersDejaRattaches).toBe(1);
    expect(d.communesSansCanal).toBe(2);              // commune inconnue (11111) + canal 'inconnu' (22222)
    expect(d.communesCourrier).toEqual(['Nanterre']);
    expect(d.communesFormulaire).toEqual(['Saint-Denis']);
  });
});
