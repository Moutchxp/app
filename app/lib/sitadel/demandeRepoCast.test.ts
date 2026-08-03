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

const HIST = { dejaRattaches: new Set<number>(), demandesCeMoisParCommune: new Map<string, number>() };
const PARAMS = { dossiersParDemande: 5, demandesParCommuneParMois: 5, dateMin: null };
const c = (over: Partial<CandidatDossier>): CandidatDossier => ({
  dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'email', numDau: 'PC1', dateReelleAutorisation: '2025-03-10',
  adresse: 'x', codePostal: '75001', cadastre: [], etatDau: '2', absentDuDernierMillesime: false, ...over,
});

describe('S15 — diagnostiquer COMPTE et NOMME les communes écartées faute d’e-mail', () => {
  it('courrier/formulaire → listées « Nom (canal) » dans communesCanalNonEmail ; email → non listée', () => {
    const d = diagnostiquer([
      c({ dossierId: 1, codeInsee: '75056', communeNom: 'Paris', canal: 'courrier' as CandidatDossier['canal'] }),
      c({ dossierId: 2, codeInsee: '92050', communeNom: 'Nanterre', canal: 'formulaire' as CandidatDossier['canal'] }),
      c({ dossierId: 3, codeInsee: '93066', communeNom: 'Saint-Denis', canal: 'email' }),
    ], HIST, PARAMS);
    expect(d.communesCanalNonEmail).toEqual(['Nanterre (formulaire)', 'Paris (courrier)']);
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
