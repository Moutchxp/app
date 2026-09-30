import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const repo = { lireDepotsDuFil: vi.fn() };
vi.mock('../../../../../../../lib/gestion/driveRepo', () => ({
  lireDepotsDuFil: (...a: unknown[]) => repo.lireDepotsDuFil(...a),
}));
const schema = { depotsDriveDisponibles: vi.fn() };
vi.mock('../../../../../../../lib/gestion/schema', () => ({
  depotsDriveDisponibles: () => schema.depotsDriveDisponibles(),
}));

import { GET } from './route';

/**
 * LOT PIECES-DE-LA-CONVERSATION — CE QUI EST DÉJÀ DANS LE DRIVE, POUR TOUT UN ÉCHANGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CETTE ROUTE EXISTE. Le récapitulatif des pièces s'ouvre d'un clic et montre les pièces des DOUZE
 * messages d'un échange : chacune doit dire si elle est déjà rangée. Relire message par message aurait fait douze
 * allers-retours — et douze fois la même sonde de schéma — pour une seule fenêtre.
 *
 * ⚠️ ELLE NE FAIT QUE LIRE NOTRE BASE. Aucun appel à Google : on ne redemande pas au Drive ce que notre registre de
 * dépôts sait déjà.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request('http://local/api/admin/gestion/fils/5/pieces-drive');
const DEPOT = {
  pieceId: 20, driveFileId: 'F1', dossierId: 'D1', dossierNom: 'Quittances 2026',
  webViewLink: 'https://drive.example/F1', deposeLe: '2026-09-20T08:00:00Z', deposePar: 'arno',
};

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  repo.lireDepotsDuFil.mockReset(); repo.lireDepotsDuFil.mockResolvedValue([DEPOT]);
  schema.depotsDriveDisponibles.mockReset(); schema.depotsDriveDisponibles.mockResolvedValue(true);
});

describe('🔴 les dépôts d’un échange', () => {
  it('🔒 exige un compte actif ayant le droit « gestion », et ne lit rien avant', async () => {
    gardeMock.mockResolvedValue(new Response('non', { status: 403 }));
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(repo.lireDepotsDuFil).not.toHaveBeenCalled();
  });

  it('🔴 rend les dépôts de l’échange, en UNE lecture', async () => {
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(200);
    expect(repo.lireDepotsDuFil.mock.calls).toEqual([[5]]);
    expect(await res.json()).toEqual({ etat: 'ok', depots: [DEPOT] });
  });

  /**
   * 🔴 LA RÉPONSE NE SE CACHE PAS : elle dit dans quel dossier client une pièce a été rangée. Ni cache partagé, ni
   * disque — même règle que toutes les réponses du module qui portent du contenu de locataire.
   */
  it('🔴 `private, no-store` sur toutes les réponses', async () => {
    expect((await GET(req(), ctx('5'))).headers.get('Cache-Control')).toBe('private, no-store');
    expect((await GET(req(), ctx('0'))).headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('un identifiant absurde → 400, sans rien lire', async () => {
    const res = await GET(req(), ctx('zéro'));
    expect(res.status).toBe(400);
    expect(repo.lireDepotsDuFil).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 MIGRATION 245 ABSENTE ⇒ LISTE VIDE, PAS UNE ERREUR. Il ne PEUT alors pas exister de dépôt, et la fenêtre
   * des pièces doit s'afficher exactement comme avant — simplement sans aucune mention « Dans le Drive ». Une
   * erreur, elle, aurait fait croire à une panne là où il n'y a qu'une mise à jour à appliquer.
   */
  it('🔴 sans la migration, une liste vide et un état qui le DIT', async () => {
    schema.depotsDriveDisponibles.mockResolvedValue(false);
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ etat: 'sans_schema', depots: [] });
    expect(repo.lireDepotsDuFil).not.toHaveBeenCalled();
  });

  /** ⚠️ UNE LECTURE EN ÉCHEC NE FAIT PAS TOMBER LA FENÊTRE : on perd la mention, jamais la liste des pièces. */
  it('une base muette → 503 avec une liste vide, jamais une exception', async () => {
    repo.lireDepotsDuFil.mockRejectedValue(new Error('pg down'));
    const res = await GET(req(), ctx('5'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ etat: 'erreur', depots: [] });
  });
});
