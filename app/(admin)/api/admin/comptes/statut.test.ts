import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 LOT P (439) — « Statut » à la création d'un compte (obligatoire dès la 439, refus clair et AUCUN compte créé sans lui ; posé et
 * journalisé avec lui) et la route de changement (administrateur ; sans la 439 : 409). Dépôts simulés.
 */
const h = vi.hoisted(() => ({ lotP: vi.fn(), creer: vi.fn(), definir: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/admin/garde', () => ({ exigerAdministrateur: async () => ({ auteurId: 2 }) }));
vi.mock('../../../../lib/admin/comptes', () => ({ creerCompteAdministration: h.creer, listerComptes: async () => [{ id: 1, prenom: 'Arnaud', nom: 'Jorel' }, { id: 9, prenom: 'Léa', nom: 'Essai' }], ErreurCompte: class extends Error {} }));
vi.mock('../../../../lib/admin/motDePasseTemporaire', () => ({ genererMotDePasseTemporaire: () => 'TEMP' }));
vi.mock('../../../../lib/admin/invitationRepo', () => ({ envoyerInvitation: async () => ({ ok: true, etat: 'factice', destinataire: 'x@x.fr' }), etatsInvitations: async () => new Map() }));
vi.mock('../../../../lib/admin/schemaDroits', () => ({ repartitionDisponible: async () => false, societeLesDeuxDisponible: async () => false, statutDisponible: () => h.lotP() }));
vi.mock('../../../../lib/admin/societeCompte', () => ({ definirSocieteCompte: vi.fn(), societesDesComptes: async () => new Map() }));
vi.mock('../../../../lib/admin/statutCompte', () => ({ definirStatutCompte: h.definir, statutsDesComptes: async () => new Map([[1, 'associe'], [9, null]]) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
const { GET, POST } = await import('./route');
const { POST: POST_STATUT } = await import('./[id]/statut/route');
const req = (corps: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(corps) });
const CORPS = { identifiant: 'lea@criterimmo.fr', prenom: 'Léa', nom: 'Essai', role: 'collaborateur', perms: {} };
beforeEach(() => { Object.values(h).forEach((f) => f.mockReset()); h.creer.mockResolvedValue({ id: 9 }); h.definir.mockResolvedValue({ ok: true, change: true }); h.lotP.mockResolvedValue(true); });

describe('🔴 LOT P — le statut d’un compte', () => {
  it('439 appliquée : sans statut, refus clair et AUCUN compte créé ; avec, posé et journalisé (auteur)', async () => {
    const r = await POST(req(CORPS));
    expect(r.status).toBe(422);
    expect((await r.json()).erreur).toMatch(/Associé, Salarié, Indépendant ou Observateur/);
    expect(h.creer).not.toHaveBeenCalled();
    for (const statut of ['associe', 'salarie', 'independant', 'observateur']) {
      h.definir.mockClear();
      expect((await POST(req({ ...CORPS, statut }))).status).toBe(201);
      expect(h.definir.mock.calls[0]).toEqual([9, statut, 2]);
    }
  });
  it('sans la 439 : ni exigé ni écrit — la création marche comme avant', async () => {
    h.lotP.mockResolvedValue(false);
    expect((await POST(req(CORPS))).status).toBe(201);
    expect(h.definir).not.toHaveBeenCalled();
  });
  it('la liste porte le statut de chaque compte (null : à renseigner)', async () => {
    const b = await (await GET(new Request('http://x/api'))).json();
    expect(b.statutDisponible).toBe(true);
    expect(b.comptes.map((c: { id: number; statut: unknown }) => [c.id, c.statut])).toEqual([[1, 'associe'], [9, null]]);
  });
  it('la route de changement : seul `statut` est lu ; sans la 439, 409', async () => {
    const ctx = { params: Promise.resolve({ id: '9' }) };
    expect((await POST_STATUT(req({ statut: 'observateur', role: 'administrateur' }), ctx)).status).toBe(200);
    expect(h.definir.mock.calls[0]).toEqual([9, 'observateur', 2]);
    h.definir.mockResolvedValue({ ok: false, motif: 'Mise à jour de la base à appliquer (migration 439) avant de pouvoir renseigner le statut.' });
    expect((await POST_STATUT(req({ statut: 'salarie' }), ctx)).status).toBe(409);
  });
});
