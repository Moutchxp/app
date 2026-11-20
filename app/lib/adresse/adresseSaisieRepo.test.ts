import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (20/11/2026, lot 7a) — une adresse saisie, enregistrée au format unique là où la table le permet (rien sans la migration 505). */
const h = vi.hoisted(() => ({ dispo: true, rapproches: [] as unknown[], enregistres: [] as unknown[], statut: 'certain' as string }));
vi.mock('../db/client', () => ({ query: async () => ({ rows: [{ ok: h.dispo }] }) }));
vi.mock('./banRepo', () => ({
  rapprocherBien: async (l: unknown) => { h.rapproches.push(l); return { statut: h.statut, ban: h.statut === 'certain' ? { id: '92026_5162_00001' } : null }; },
  rapprocherAdresse: async (a: unknown) => { h.rapproches.push(a); return { statut: h.statut, ban: h.statut === 'certain' ? { id: '92026_5162_00001' } : null }; },
  enregistrerRapprochement: async (_q: unknown, lot: number, r: { statut: string }, o: unknown) => { h.enregistres.push([lot, r.statut, o]); return true; },
}));
const AUTEUR = { id: 2, libelle: 'a.jorel@sansvisavis.com' };
beforeEach(() => { h.rapproches = []; h.enregistres = []; h.statut = 'certain'; vi.resetModules(); });
const charger = async (dispo: boolean) => { h.dispo = dispo; return import('./adresseSaisieRepo'); };

describe('un bien', () => {
  it('choisi dans la liste et retrouvé : un rapprochement « saisie / auto-complétion » posé dans la transaction', async () => {
    const m = await charger(true);
    await m.enregistrerAdresseSaisieDuLot({} as never, 501, { adresse: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE', nature: 'liste' }, AUTEUR);
    expect(h.rapproches).toEqual([{ immeuble: null, adresse: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE' }]);
    expect(h.enregistres).toEqual([[501, 'certain', { origine: 'saisie', methode: 'auto_completion', motifFin: 'adresse saisie dans l’application' }]]);
  });
  it('hors liste, ou non retrouvée : le rapprochement du module tel quel (il entre dans la file « à vérifier »)', async () => {
    const m = await charger(true);
    h.statut = 'a_verifier';
    await m.enregistrerAdresseSaisieDuLot({} as never, 502, { adresse: '3 chemin perdu', codePostal: '77000', commune: 'MELUN', nature: 'hors_liste' }, AUTEUR);
    expect(h.enregistres).toEqual([[502, 'a_verifier', expect.objectContaining({ origine: 'saisie', methode: 'similarite_voie' })]]);
  });
  it('sans la migration 505, ou sans adresse : rien', async () => {
    const m = await charger(false);
    await m.enregistrerAdresseSaisieDuLot({} as never, 503, { adresse: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE' }, AUTEUR);
    expect([h.rapproches, h.enregistres]).toEqual([[], []]);
    const n = await charger(true);
    await n.enregistrerAdresseSaisieDuLot({} as never, 504, { adresse: '  ', codePostal: null, commune: null }, AUTEUR);
    expect(h.enregistres).toEqual([]);
  });
});

describe('une adresse de copropriété', () => {
  it('l’identifiant BAN seulement si l’adresse est retrouvée avec certitude ; sinon aucune supposition', async () => {
    const m = await charger(true);
    expect(await m.banIdDeLAdresse({ libelle: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE' })).toBe('92026_5162_00001');
    h.statut = 'a_verifier';
    expect(await m.banIdDeLAdresse({ libelle: '1 rue X', codePostal: null, commune: null })).toBeNull();
    const n = await charger(false);
    expect(await n.banIdDeLAdresse({ libelle: '1 Villa Des Lilas', codePostal: '92400', commune: 'COURBEVOIE' })).toBeNull();
  });
});

describe('les chemins d’écriture d’un bien l’emploient (création, annexes, modification de l’adresse)', () => {
  it('insererLot, insererBien et modifierBien posent le format unique dans leur transaction', async () => {
    const { readFileSync } = await import('node:fs');
    const creation = readFileSync('app/lib/location/creationBienRepo.ts', 'utf8');
    const location = readFileSync('app/lib/location/locationRepo.ts', 'utf8');
    expect(creation.match(/async function insererLot[\s\S]*?\n}\n/)?.[0]).toContain('await enregistrerAdresseSaisieDuLot(q, id,');
    expect(location.match(/async function insererBien[\s\S]*?\n}\n/)?.[0]).toContain('await enregistrerAdresseSaisieDuLot(q, id,');
    expect(location.match(/export async function modifierBien[\s\S]*?\n}\n/)?.[0]).toMatch(/if \(app && adr\.ecrire\) \{[\s\S]*?enregistrerAdresseSaisieDuLot\(q, lotId,/);
  });
});
