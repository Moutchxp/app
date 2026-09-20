import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D3 — GET /vivier-recherche. On MOCKE chargerVivier (+ garde + config) : ce fichier teste le COMPORTEMENT de la route
 * (garde admin, validation du process, requête vide, passe-plat + scoping). La recherche pure est testée dans rechercheVivier.test.ts.
 */
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerModule: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/veilleConfig', () => ({ chargerConfigVeille: vi.fn(async () => ({ ancienneteMaxDemandeAnnees: 1 })) }));
vi.mock('../../../../../../lib/sitadel/demandeRepo', () => ({ chargerVivier: vi.fn(), communesBloqueesTeleservice: vi.fn(), plafondsTeleservice: vi.fn(), idsDossiersCartesVirtuelles: vi.fn() }));

import { GET } from './route';
import { exigerModule } from '../../../../../../lib/admin/garde';
import { chargerVivier, communesBloqueesTeleservice, plafondsTeleservice, idsDossiersCartesVirtuelles } from '../../../../../../lib/sitadel/demandeRepo';

const garde = exigerModule as unknown as ReturnType<typeof vi.fn>;
const vivier = chargerVivier as unknown as ReturnType<typeof vi.fn>;
const bloquees = communesBloqueesTeleservice as unknown as ReturnType<typeof vi.fn>;
const plafonds = plafondsTeleservice as unknown as ReturnType<typeof vi.fn>;
const cartesVirt = idsDossiersCartesVirtuelles as unknown as ReturnType<typeof vi.fn>;
const req = (qs: string) => GET(new Request(`http://test/api/admin/permis/demandes/vivier-recherche${qs}`, { method: 'GET' }));

const PERMIS = (over: Record<string, unknown> = {}) => ({ dossierId: 1, numDau: 'PC-A', type: 'PC', codeInsee: '75056', communeNom: 'Paris', canal: 'formulaire', categorie: 'immeuble_neuf', dateAutorisation: '2024-06-01', ...over });

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 });
  vivier.mockResolvedValue({ vivier: [PERMIS(), PERMIS({ dossierId: 2, numDau: 'PC-B', canal: 'email', communeNom: 'Paris' })], tronque: false });
  bloquees.mockResolvedValue({});
  plafonds.mockResolvedValue({});
  cartesVirt.mockResolvedValue(new Set()); // §B — aucune carte virtuelle par défaut ; les tests qui marquent le posent explicitement
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

  it('MODE MANUEL — process FORMULAIRE : l’état du plafond mensuel par commune est renvoyé dans `plafonds`', async () => {
    plafonds.mockResolvedValueOnce({ '75056': { consomme: 5, plafond: 5, depasse: true } });
    const body = await (await req('?q=paris&process=formulaire')).json();
    expect(body.plafonds).toEqual({ '75056': { consomme: 5, plafond: 5, depasse: true } });
    expect(plafonds).toHaveBeenCalledTimes(1);
  });

  it('MODE MANUEL — process EMAIL : le plafond téléservice n’est PAS calculé (plafondsTeleservice non appelée)', async () => {
    const body = await (await req('?q=paris&process=email')).json();
    expect(plafonds).not.toHaveBeenCalled();
    expect(body.plafonds).toEqual({});
  });

  it('MOTEUR COMPLET — `types` filtre les catégories demandées (téléservice)', async () => {
    vivier.mockResolvedValueOnce({ vivier: [
      PERMIS({ dossierId: 1, numDau: 'PC-N', categorie: 'immeuble_neuf' }),
      PERMIS({ dossierId: 2, numDau: 'PC-S', categorie: 'surelevation' }),
    ], tronque: false });
    const body = await (await req('?q=pc&process=formulaire&types=surelevation')).json();
    expect(body.resultats.map((x: { dossierId: number }) => x.dossierId)).toEqual([2]);
  });

  it('MOTEUR COMPLET — `tri=date:asc` ordonne les résultats (téléservice)', async () => {
    vivier.mockResolvedValueOnce({ vivier: [
      PERMIS({ dossierId: 1, numDau: 'PC-A', dateAutorisation: '2024-05-01' }),
      PERMIS({ dossierId: 2, numDau: 'PC-B', dateAutorisation: '2024-01-01' }),
    ], tronque: false });
    const body = await (await req('?q=pc&process=formulaire&tri=date:asc')).json();
    expect(body.resultats.map((x: { dossierId: number }) => x.dossierId)).toEqual([2, 1]);
  });

  it('MOTEUR COMPLET — un tri INVALIDE (ex. « surface ») est IGNORÉ : ordre naturel, statut 200, jamais une erreur', async () => {
    vivier.mockResolvedValueOnce({ vivier: [
      PERMIS({ dossierId: 1, numDau: 'PC-A', dateAutorisation: '2024-05-01' }),
      PERMIS({ dossierId: 2, numDau: 'PC-B', dateAutorisation: '2024-01-01' }),
    ], tronque: false });
    const res = await req('?q=pc&process=formulaire&tri=surface:asc');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resultats.map((x: { dossierId: number }) => x.dossierId)).toEqual([1, 2]); // tri ignoré → ordre naturel
  });

  it('RÉTROCOMPAT — sans `types` ni `tri` (cas du rail e-mail) : réponse INCHANGÉE', async () => {
    const body = await (await req('?q=paris&process=email')).json();
    expect(body.resultats.map((x: { dossierId: number }) => x.dossierId)).toEqual([2]); // PC-B email (beforeEach)
    expect(body.autreProcess).toBe(1);
  });

  it('§1 — q VIDE + `types` (téléservice) → recherche EXÉCUTÉE (vivier chargé, résultats filtrés par type)', async () => {
    vivier.mockResolvedValueOnce({ vivier: [
      PERMIS({ dossierId: 1, numDau: 'PC-N', categorie: 'immeuble_neuf', canal: 'formulaire' }),
      PERMIS({ dossierId: 2, numDau: 'PC-S', categorie: 'surelevation', canal: 'formulaire' }),
    ], tronque: false });
    const body = await (await req('?q=&process=formulaire&types=immeuble_neuf')).json();
    expect(vivier).toHaveBeenCalledTimes(1); // le vivier EST chargé (q facultatif car un filtre est fourni)
    expect(body.resultats.map((x: { dossierId: number }) => x.dossierId)).toEqual([1]);
  });

  it('§1 — RÉGRESSION CLÉ : q VIDE + AUCUN filtre → vide SANS charger le vivier (comportement d’avant, cas rail e-mail)', async () => {
    const body = await (await req('?q=&process=email')).json();
    expect(body).toEqual({ resultats: [], total: 0, autreProcess: 0, tronque: false });
    expect(vivier).not.toHaveBeenCalled();
  });

  it('TRI SEUL — q VIDE + `tri` explicite (sans type) → recherche EXÉCUTÉE (vivier chargé, ordonné)', async () => {
    vivier.mockResolvedValueOnce({ vivier: [
      PERMIS({ dossierId: 1, numDau: 'PC-A', dateAutorisation: '2024-05-01', canal: 'formulaire' }),
      PERMIS({ dossierId: 2, numDau: 'PC-B', dateAutorisation: '2024-01-01', canal: 'formulaire' }),
    ], tronque: false });
    const body = await (await req('?q=&process=formulaire&tri=date:asc')).json();
    expect(vivier).toHaveBeenCalledTimes(1); // le vivier EST chargé : le tri explicite est un critère suffisant
    expect(body.resultats.map((x: { dossierId: number }) => x.dossierId)).toEqual([2, 1]); // date asc
  });

  it('NON-RÉGRESSION — sans q, sans types ET sans tri → vide SANS charger le vivier (comportement d’avant)', async () => {
    const body = await (await req('?q=&process=formulaire')).json();
    expect(body).toEqual({ resultats: [], total: 0, autreProcess: 0, tronque: false });
    expect(vivier).not.toHaveBeenCalled();
  });

  it('COMPTEUR — `total` (avant cap) est propagé tel quel ; tronque quand total > CAP', async () => {
    vivier.mockResolvedValueOnce({ vivier: Array.from({ length: 60 }, (_, i) => PERMIS({ dossierId: i + 1, numDau: `PC${i}`, categorie: 'immeuble_neuf', canal: 'formulaire' })), tronque: false });
    const body = await (await req('?q=&process=formulaire&types=immeuble_neuf')).json();
    expect(body.resultats.length).toBe(50); // cap
    expect(body.total).toBe(60);            // total AVANT cap
    expect(body.tronque).toBe(true);        // total > CAP → tronque signalé
  });

  it('§B — un permis porté par une carte virtuelle est marqué « enAttente » (le cas PC 07511425V0025, Paris)', async () => {
    vivier.mockResolvedValueOnce({ vivier: [PERMIS({ dossierId: 241, numDau: '07511425V0025', type: 'PC', communeNom: 'Paris', codeInsee: '75056', canal: 'formulaire' })], tronque: false });
    cartesVirt.mockResolvedValueOnce(new Set([241]));
    const body = await (await req('?q=paris&process=formulaire')).json();
    const p = body.resultats.find((x: { dossierId: number }) => x.dossierId === 241);
    expect(p.enAttente).toBe(true);
    expect(cartesVirt).toHaveBeenCalledTimes(1);
  });

  it('§B — rail E-MAIL : idsDossiersCartesVirtuelles n’est PAS appelée (pas de carrousel), aucun marquage', async () => {
    cartesVirt.mockResolvedValueOnce(new Set([2]));
    const body = await (await req('?q=paris&process=email')).json();
    expect(cartesVirt).not.toHaveBeenCalled();
    expect(body.resultats.every((x: { enAttente?: boolean }) => x.enAttente !== true)).toBe(true);
  });
});
