import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * V3 — POST /api/admin/permis/demandes : création des LOTS SÉLECTIONNÉS. On MOCKE creerDemandes (+ garde + config) : ce
 * fichier teste le COMPORTEMENT de la route (validation de la sélection, transmission au repo, compte rendu, 400/503),
 * pas la logique de sélection (testée purement dans demande.test.ts : apparierSelection/cleLot). db/client mocké (aucune DB).
 */
vi.mock('../../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/sitadel/veilleConfig', () => ({ chargerConfigVeille: vi.fn(async () => ({ profilDemandeurDefaut: 'entreprise' })) }));
vi.mock('../../../../../lib/sitadel/demandeRepo', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, creerDemandes: vi.fn(), listerDemandes: vi.fn(), changerStatutLot: vi.fn() };
});

import { POST, PATCH } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { creerDemandes, changerStatutLot } from '../../../../../lib/sitadel/demandeRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const creer = creerDemandes as unknown as ReturnType<typeof vi.fn>;
const transition = changerStatutLot as unknown as ReturnType<typeof vi.fn>;

const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/demandes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const patch = (body: unknown) => PATCH(new Request('http://test/api/admin/permis/demandes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const RAPPORT = { crees: ['SVAV-DEM-2026-000001'], demandesCreees: 1, lotsSelectionnes: 2, dossiersCrees: 5, ignoresConflit: 0, lotsInvalides: [{ cle: '9-9', communeNom: 'Ville', raison: 'lot plus disponible' }], profil: 'entreprise' };

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 });
});

describe('V3 — POST : ne crée QUE les lots transmis', () => {
  it('non-administrateur → 403, aucune création', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await post({ lots: [{ cle: '1-2' }] });
    expect(res.status).toBe(403);
    expect(creer).not.toHaveBeenCalled();
  });

  it('sélection valide → 200, creerDemandes reçoit EXACTEMENT les lots transmis (cle + libellé), et le compte rendu repart tel quel', async () => {
    creer.mockResolvedValueOnce(RAPPORT);
    const res = await post({ profil: 'entreprise', lots: [{ cle: '1-2', communeNom: 'Asnières' }, { cle: '3', communeNom: 'Colombes' }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ demandesCreees: 1, dossiersCrees: 5 });
    // Le repo reçoit la sélection validée (5e argument), et un profil.
    const args = creer.mock.calls[0];
    expect(args[3]).toBe('entreprise'); // profil
    expect(args[4]).toEqual([{ cle: '1-2', communeNom: 'Asnières' }, { cle: '3', communeNom: 'Colombes' }]);
  });

  it('compte rendu TOUJOURS chiffré + lots invalidés listés avec raison (repassés au client)', async () => {
    creer.mockResolvedValueOnce(RAPPORT);
    const b = await (await post({ lots: [{ cle: '1-2' }] })).json();
    expect(b.demandesCreees).toBe(1);
    expect(b.dossiersCrees).toBe(5);
    expect(b.lotsInvalides[0]).toMatchObject({ communeNom: 'Ville', raison: expect.stringMatching(/plus disponible/) });
  });

  it('AUCUN lot sélectionné → 400 explicite, création jamais appelée (jamais « tout créer »)', async () => {
    const res = await post({ lots: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).erreur).toMatch(/aucun lot/i);
    expect(creer).not.toHaveBeenCalled();
  });

  it('body sans « lots » → 400 (le choix est obligatoire)', async () => {
    expect((await post({ profil: 'personne' })).status).toBe(400);
    expect(creer).not.toHaveBeenCalled();
  });

  it('lots présents mais TOUS invalides (aucune clé) → 400', async () => {
    expect((await post({ lots: [{ communeNom: 'X' }, 42, { cle: '' }] })).status).toBe(400);
    expect(creer).not.toHaveBeenCalled();
  });

  it('exception INATTENDUE de creerDemandes → 503 APRÈS journalisation (jamais un catch muet)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    creer.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '42703', column: 'xxx' }));
    const res = await post({ lots: [{ cle: '1-2' }] });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ erreur: 'création impossible' });
    expect(spy).toHaveBeenCalled();
    const trace = spy.mock.calls[0][1] as Record<string, unknown>;
    expect(trace).toMatchObject({ code: '42703', column: 'xxx' });
    expect(trace.lots).toEqual(['1-2']); // contexte tracé
    spy.mockRestore();
  });
});

describe('U3 (B) — PATCH annulee : chemin d’annulation UNIQUE réutilisé (changerStatutLot)', () => {
  it('statut=annulee → 200 ; changerStatutLot([id],\'annulee\',auteur) est l’écrivain appelé', async () => {
    transition.mockResolvedValueOnce([]);
    const res = await patch({ ids: [42], statut: 'annulee' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, traites: 1 });
    expect(transition).toHaveBeenCalledWith([42], 'annulee', '5'); // le SEUL écrivain de demande.statut='annulee'
  });

  it('statut inconnu → 400, AUCUNE écriture (changerStatutLot jamais appelé)', async () => {
    const res = await patch({ ids: [42], statut: 'nimportequoi' });
    expect(res.status).toBe(400);
    expect(transition).not.toHaveBeenCalled();
  });

  it('ids tous invalides → 400, aucune écriture (jamais un succès à 0)', async () => {
    const res = await patch({ ids: [], statut: 'annulee' });
    expect(res.status).toBe(400);
    expect(transition).not.toHaveBeenCalled();
  });

  it('exception inattendue de changerStatutLot → 503 (jamais un faux succès), journalisée', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    transition.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '22P02' }));
    const res = await patch({ ids: [42], statut: 'annulee' });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ erreur: 'action impossible' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('non-administrateur → 403, aucune écriture', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await patch({ ids: [42], statut: 'annulee' });
    expect(res.status).toBe(403);
    expect(transition).not.toHaveBeenCalled();
  });
});
