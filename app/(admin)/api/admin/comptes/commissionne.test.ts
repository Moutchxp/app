import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 LOT S (441) — « Commissionné / Non commissionné » : obligatoire à la création d'un ADMINISTRATEUR (refus clair, AUCUN compte créé sans
 * lui) ; un collaborateur ne porte pas ce choix (rien n'est exigé ni écrit) ; la route de changement (sans la 441 : 409 ; un collaborateur :
 * 422). Dépôts simulés.
 */
const h = vi.hoisted(() => ({ lotS: vi.fn(), creer: vi.fn(), definir: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/admin/garde', () => ({ exigerAdministrateur: async () => ({ auteurId: 2 }) }));
vi.mock('../../../../lib/admin/comptes', () => ({ creerCompteAdministration: h.creer, listerComptes: async () => [{ id: 1, prenom: 'Arnaud', nom: 'Jorel', role: 'administrateur' }, { id: 9, prenom: 'Léa', nom: 'Essai', role: 'collaborateur' }], ErreurCompte: class extends Error {} }));
vi.mock('../../../../lib/admin/motDePasseTemporaire', () => ({ genererMotDePasseTemporaire: () => 'TEMP' }));
vi.mock('../../../../lib/admin/invitationRepo', () => ({ envoyerInvitation: async () => ({ ok: true, etat: 'factice', destinataire: 'x@x.fr' }), etatsInvitations: async () => new Map() }));
vi.mock('../../../../lib/admin/schemaDroits', () => ({ commissionneDisponible: () => h.lotS(), repartitionDisponible: async () => false, societeLesDeuxDisponible: async () => false, statutDisponible: async () => false }));
vi.mock('../../../../lib/admin/societeCompte', () => ({ definirSocieteCompte: vi.fn(), societesDesComptes: async () => new Map() }));
vi.mock('../../../../lib/admin/statutCompte', () => ({ definirStatutCompte: vi.fn(), statutsDesComptes: async () => new Map() }));
vi.mock('../../../../lib/admin/commissionneCompte', async (orig) => ({ ...(await orig<object>()), definirCommissionneCompte: h.definir,
  commissionnesDesComptes: async () => new Map([[1, false], [9, true]]) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'a.jorel@sansvisavis.com' }) }));
const { GET, POST } = await import('./route');
const { POST: POST_COMMISSIONNE } = await import('./[id]/commissionne/route');
const req = (corps: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(corps) });
const ADMIN = { identifiant: 'c.jullien@criterimmo.fr', prenom: 'Cédric', nom: 'Jullien', role: 'administrateur', perms: {} };
const COLLAB = { ...ADMIN, identifiant: 'lea@criterimmo.fr', role: 'collaborateur' };
beforeEach(() => { Object.values(h).forEach((f) => f.mockReset()); h.creer.mockResolvedValue({ id: 9 }); h.definir.mockResolvedValue({ ok: true, change: true }); h.lotS.mockResolvedValue(true); });

describe('🔴 LOT S — « Commissionné / Non commissionné »', () => {
  it('administrateur, 441 appliquée : sans le choix, refus clair et AUCUN compte créé ; avec, posé et journalisé (auteur)', async () => {
    const r = await POST(req(ADMIN));
    expect(r.status).toBe(422);
    expect((await r.json()).erreur).toMatch(/Commissionné.*Non commissionné/);
    expect(h.creer).not.toHaveBeenCalled();
    for (const x of [true, false]) {
      h.definir.mockClear();
      expect((await POST(req({ ...ADMIN, commissionne: x }))).status).toBe(201);
      expect(h.definir.mock.calls[0]).toEqual([9, x, 2]);
    }
  });
  it('un collaborateur ne porte pas ce choix : rien d’exigé, rien d’écrit (même si l’écran l’envoie)', async () => {
    expect((await POST(req(COLLAB))).status).toBe(201);
    expect((await POST(req({ ...COLLAB, commissionne: false }))).status).toBe(201);
    expect(h.definir).not.toHaveBeenCalled();
  });
  it('sans la 441 : ni exigé ni écrit — la création marche comme avant', async () => {
    h.lotS.mockResolvedValue(false);
    expect((await POST(req(ADMIN))).status).toBe(201);
    expect(h.definir).not.toHaveBeenCalled();
  });
  it('la liste porte le choix effectif (administrateur non commissionné ; collaborateur toujours commissionné)', async () => {
    const b = await (await GET(new Request('http://x/api'))).json();
    expect(b.commissionneDisponible).toBe(true);
    expect(b.comptes.map((c: { id: number; commissionne: unknown }) => [c.id, c.commissionne])).toEqual([[1, false], [9, true]]);
  });
  it('la route de changement : seul `commissionne` est lu ; sans la 441 : 409 ; un collaborateur : 422', async () => {
    const ctx = { params: Promise.resolve({ id: '1' }) };
    expect((await POST_COMMISSIONNE(req({ commissionne: true, role: 'collaborateur' }), ctx)).status).toBe(200);
    expect(h.definir.mock.calls[0]).toEqual([1, true, 2]);
    const { MOTIF_SANS_441 } = await import('../../../../lib/admin/commissionneCompte');
    h.definir.mockResolvedValue({ ok: false, motif: MOTIF_SANS_441 });
    expect((await POST_COMMISSIONNE(req({ commissionne: false }), ctx)).status).toBe(409);
    h.definir.mockResolvedValue({ ok: false, motif: 'Un collaborateur est toujours commissionné : le choix ne concerne que les administrateurs.' });
    expect((await POST_COMMISSIONNE(req({ commissionne: false }), ctx)).status).toBe(422);
  });
});
