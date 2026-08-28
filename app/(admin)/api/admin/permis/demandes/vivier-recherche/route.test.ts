import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D3 — GET /vivier-recherche. On MOCKE chargerVivier (+ garde + config) : ce fichier teste le COMPORTEMENT de la route
 * (garde admin, validation du process, requête vide, passe-plat + scoping). La recherche pure est testée dans rechercheVivier.test.ts.
 */
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/veilleConfig', () => ({ chargerConfigVeille: vi.fn(async () => ({ ancienneteMaxDemandeAnnees: 1 })) }));
vi.mock('../../../../../../lib/sitadel/demandeRepo', () => ({ chargerVivier: vi.fn(), communesBloqueesTeleservice: vi.fn() }));

import { GET } from './route';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerVivier, communesBloqueesTeleservice } from '../../../../../../lib/sitadel/demandeRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const vivier = chargerVivier as unknown as ReturnType<typeof vi.fn>;
const bloquees = communesBloqueesTeleservice as unknown as ReturnType<typeof vi.fn>;
const req = (qs: string) => GET(new Request(`http://test/api/admin/permis/demandes/vivier-recherche${qs}`, { method: 'GET' }));

const PERMIS = (over: Record<string, unknown> = {}) => ({ dossierId: 1, numDau: 'PC-A', type: 'PC', codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: '2024-06-01', ...over });

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 });
  vivier.mockResolvedValue({ vivier: [PERMIS(), PERMIS({ dossierId: 2, numDau: 'PC-B', canal: 'email', communeNom: 'Paris' })], tronque: false });
  bloquees.mockResolvedValue({});
});

describe('D3 — GET vivier-recherche', () => {
  it('non-administrateur → 403', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await req('?q=paris&process=formulaire')).status).toBe(403);
    expect(vivier).not.toHaveBeenCalled();
  });

  it('process invalide → 422', async () => {
    expect((await req('?q=paris&process=courrier')).status).toBe(422);
    expect((await req('?q=paris')).status).toBe(422);
  });

  it('requête vide → résultat vide, SANS charger le vivier', async () => {
    const body = await (await req('?q=&process=formulaire')).json();
    expect(body).toEqual({ resultats: [], total: 0, autreProcess: 0, tronque: false });
    expect(vivier).not.toHaveBeenCalled();
  });

  it('scopé au process actif + mention non silencieuse de l’autre', async () => {
    const body = await (await req('?q=paris&process=formulaire')).json();
    expect(body.resultats.map((x: { dossierId: number }) => x.dossierId)).toEqual([1]); // formulaire
    expect(body.autreProcess).toBe(1);                                                   // le permis email
  });

  it('vivier tronqué → tronque=true propagé', async () => {
    vivier.mockResolvedValueOnce({ vivier: [PERMIS()], tronque: true });
    const body = await (await req('?q=paris&process=formulaire')).json();
    expect(body.tronque).toBe(true);
  });

  it('chargerVivier rejette → 503', async () => {
    vivier.mockRejectedValueOnce(new Error('db'));
    expect((await req('?q=paris&process=formulaire')).status).toBe(503);
  });

  it('Lot C — process FORMULAIRE : les communes bloquées (en attente d’accusé) sont renvoyées dans `bloquees`', async () => {
    bloquees.mockResolvedValueOnce({ '75056': { reference: 'SVAV-DEM-2026-000160', demandeId: 866 } });
    const body = await (await req('?q=paris&process=formulaire')).json();
    expect(body.bloquees).toEqual({ '75056': { reference: 'SVAV-DEM-2026-000160', demandeId: 866 } });
    expect(bloquees).toHaveBeenCalledTimes(1);
  });

  it('Lot C — process EMAIL : aucun blocage téléservice → communesBloqueesTeleservice N’EST PAS appelée', async () => {
    const body = await (await req('?q=paris&process=email')).json();
    expect(bloquees).not.toHaveBeenCalled();
    expect(body.bloquees).toEqual({});
  });
});
