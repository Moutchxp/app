import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 TRANSACTION, LOT D (434) — « Société : CRITERIMMO / MACJ » à la création d'un compte : obligatoire dès la 434 appliquée (refus clair,
 * aucun compte créé), posée à compter d'aujourd'hui ; sans la 434, ni exigée ni écrite (la création marche comme avant). Dépôts simulés.
 */
const h = vi.hoisted(() => ({ lotD: vi.fn(), lotK: vi.fn(), creer: vi.fn(), definir: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/admin/garde', () => ({ exigerAdministrateur: async () => ({ auteurId: 2 }) }));
vi.mock('../../../../lib/admin/comptes', () => ({ creerCompteAdministration: h.creer, listerComptes: async () => [], ErreurCompte: class extends Error {} }));
vi.mock('../../../../lib/admin/motDePasseTemporaire', () => ({ genererMotDePasseTemporaire: () => 'TEMP' }));
vi.mock('../../../../lib/admin/invitationRepo', () => ({ envoyerInvitation: async () => ({ ok: true, etat: 'factice', destinataire: 'x@x.fr' }), etatsInvitations: async () => new Map() }));
vi.mock('../../../../lib/admin/schemaDroits', () => ({ commissionneDisponible: async () => false, repartitionDisponible: () => h.lotD(), societeLesDeuxDisponible: () => h.lotK(), statutDisponible: async () => false }));
vi.mock('../../../../lib/admin/societeCompte', () => ({ definirSocieteCompte: h.definir, societesDesComptes: async () => new Map() }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
const { POST } = await import('./route');
const req = (corps: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(corps) });
const CORPS = { identifiant: 'lea@criterimmo.fr', prenom: 'Léa', nom: 'Essai', role: 'collaborateur', perms: {} };
beforeEach(() => { Object.values(h).forEach((f) => f.mockReset()); h.creer.mockResolvedValue({ id: 9 }); h.definir.mockResolvedValue({ ok: true, change: true }); h.lotK.mockResolvedValue(false); });

describe('la société à la création d’un compte', () => {
  it('434 appliquée : sans société, refus clair et AUCUN compte créé', async () => {
    h.lotD.mockResolvedValue(true);
    const r = await POST(req(CORPS));
    expect(r.status).toBe(422);
    expect((await r.json()).erreur).toMatch(/CRITERIMMO, MACJ, ou CRITERIMMO et MACJ/);
    expect(h.creer).not.toHaveBeenCalled();
  });
  it('434 appliquée : la société est posée à compter d’aujourd’hui', async () => {
    h.lotD.mockResolvedValue(true);
    const r = await POST(req({ ...CORPS, societe: 'macj' }));
    expect(r.status).toBe(201);
    expect(h.definir.mock.calls[0].slice(0, 2)).toEqual([9, 'macj']);
    expect(h.definir.mock.calls[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('sans la 434 : ni exigée ni écrite — la création marche comme avant', async () => {
    h.lotD.mockResolvedValue(false);
    expect((await POST(req(CORPS))).status).toBe(201);
    expect(h.definir).not.toHaveBeenCalled();
  });
  it('🔴 LOT K — « CRITERIMMO et MACJ » : refusé sans la 438 (aucun compte créé) ; posé avec elle', async () => {
    h.lotD.mockResolvedValue(true);
    const r = await POST(req({ ...CORPS, societe: 'les_deux' }));
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toMatch(/migration 438/);
    expect(h.creer).not.toHaveBeenCalled();
    h.lotK.mockResolvedValue(true);
    expect((await POST(req({ ...CORPS, societe: 'les_deux' }))).status).toBe(201);
    expect(h.definir.mock.calls[0].slice(0, 2)).toEqual([9, 'les_deux']);
  });
});
