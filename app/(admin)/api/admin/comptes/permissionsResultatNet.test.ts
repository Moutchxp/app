import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 Arno (26/10/2026, 428) — LA ROUTE DES PERMISSIONS ET « ACCÈS AU RÉSULTAT NET DE L'AGENCE ? » : écrit APRÈS les permissions, avec la
 * session de l'administrateur ; tuile Location décochée → droit retiré ; réponse absente (écran d'avant) → inchangée.
 */
const modifierPermissions = vi.fn();
const trouverCompteParId = vi.fn();
const exigerAdministrateur = vi.fn();
const definirResultatNet = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/admin/garde', () => ({ exigerAdministrateur: (...a: unknown[]) => exigerAdministrateur(...a) }));
vi.mock('../../../../lib/admin/comptes', () => ({
  modifierPermissions: (...a: unknown[]) => modifierPermissions(...a),
  trouverCompteParId: (...a: unknown[]) => trouverCompteParId(...a),
}));
vi.mock('../../../../lib/admin/resultatNet', () => ({ definirResultatNet: (...a: unknown[]) => definirResultatNet(...a) }));
vi.mock('../../../../lib/admin/sessionServeur', () => ({ lireSessionCuration: async () => ({ jti: 'jti-123', iat: null, sub: 7 }) }));

import { POST } from './[id]/permissions/route';

const PERMS = (o: Record<string, boolean> = {}) => ({
  pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false, permis: false, gestion: false, location: false, transaction: false, ...o,
});
const requete = (corps: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(corps) });
const ctx = { params: Promise.resolve({ id: '42' }) };

beforeEach(() => {
  modifierPermissions.mockReset().mockResolvedValue(true);
  definirResultatNet.mockReset().mockResolvedValue(true);
  exigerAdministrateur.mockReset().mockResolvedValue({ auteurId: 7 });
});

describe('🔴 « Accès au Résultat net de l’agence ? » à l’enregistrement des permissions', () => {
  it('Location + Oui : écrit APRÈS les permissions, avec l’auteur et la session', async () => {
    const r = await POST(requete({ perms: PERMS({ location: true }), resultat_net: true }), ctx);
    expect(r.status).toBe(200);
    expect(definirResultatNet).toHaveBeenCalledWith(42, true, 7, 'jti-123');
    expect(modifierPermissions.mock.invocationCallOrder[0]).toBeLessThan(definirResultatNet.mock.invocationCallOrder[0]);
  });
  it('Location + Non : écrit à faux', async () => {
    await POST(requete({ perms: PERMS({ location: true }), resultat_net: false }), ctx);
    expect(definirResultatNet).toHaveBeenCalledWith(42, false, 7, 'jti-123');
  });
  it('🔴 tuile Location DÉCOCHÉE : le droit est retiré, même si la requête dit Oui', async () => {
    await POST(requete({ perms: PERMS({ location: false }), resultat_net: true }), ctx);
    expect(definirResultatNet).toHaveBeenCalledWith(42, false, 7, 'jti-123');
    definirResultatNet.mockClear();
    await POST(requete({ perms: PERMS({ location: false }) }), ctx);
    expect(definirResultatNet).toHaveBeenCalledWith(42, false, 7, 'jti-123');
  });
  it('Location cochée, réponse absente (un écran d’avant) : rien n’est changé', async () => {
    await POST(requete({ perms: PERMS({ location: true }) }), ctx);
    expect(definirResultatNet).not.toHaveBeenCalled();
  });
  it('permissions refusées (administrateur, compte absent) : le droit n’est pas touché', async () => {
    modifierPermissions.mockResolvedValue(false);
    trouverCompteParId.mockResolvedValue({ id: 42 });
    expect((await POST(requete({ perms: PERMS({ location: true }), resultat_net: true }), ctx)).status).toBe(409);
    expect(definirResultatNet).not.toHaveBeenCalled();
  });
});
