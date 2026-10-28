import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT GESTION-INVITATION-ADMIN — les ROUTES : création → invitation dite telle quelle (envoyée / NON envoyée + motif) ;
 * « Renvoyer » → « Mail renvoyé à … » ou l'erreur réelle ; activation publique. Dépôt simulé : aucun mail, aucune base.
 */
const h = vi.hoisted(() => ({
  exigerAdministrateur: vi.fn(), creerCompteAdministration: vi.fn(), envoyerInvitation: vi.fn(), etatsInvitations: vi.fn(),
  listerComptes: vi.fn(), activerParLien: vi.fn(), lireLien: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/admin/garde', () => ({ exigerAdministrateur: h.exigerAdministrateur }));
vi.mock('../../../../lib/admin/comptes', () => ({
  creerCompteAdministration: h.creerCompteAdministration, listerComptes: h.listerComptes, ErreurCompte: class extends Error {},
}));
vi.mock('../../../../lib/admin/motDePasseTemporaire', () => ({ genererMotDePasseTemporaire: () => 'TEMP-FIXE' }));
// TRANSACTION, LOTS D-E — la sonde de la 434 (société à la création) ne doit jamais lire la vraie base : « absente », comme avant ce lot.
// LOT P — la sonde du statut (439) figée ici : sans elle, le test lirait la VRAIE base (et changerait d'issue selon la recette).
vi.mock('../../../../lib/admin/schemaDroits', async (importOriginal) => ({ ...(await importOriginal<object>()), commissionneDisponible: async () => false, repartitionDisponible: async () => false, statutDisponible: async () => false }));
vi.mock('../../../../lib/admin/invitationRepo', () => ({
  envoyerInvitation: h.envoyerInvitation, etatsInvitations: h.etatsInvitations, activerParLien: h.activerParLien, lireLien: h.lireLien,
}));

const creation = await import('./route');
const renvoi = await import('./[id]/invitation/route');
const activation = await import('../activation/route');

const req = (corps?: unknown) => new Request('http://x/api', { method: 'POST', body: corps === undefined ? undefined : JSON.stringify(corps) });
const CORPS = { identifiant: 'lea@criterimmo.fr', prenom: 'Léa', nom: 'Essai', role: 'administrateur', perms: {} };
const ctx = { params: Promise.resolve({ id: '9' }) };

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.exigerAdministrateur.mockResolvedValue({ auteurId: 1 });
  h.creerCompteAdministration.mockResolvedValue({ id: 9, identifiant: 'lea@criterimmo.fr', role: 'administrateur', actif: true });
});

describe('création d’un compte → mail d’invitation', () => {
  it('envoyé → la réponse le dit (et le mot de passe temporaire reste rendu une fois, comme avant)', async () => {
    h.envoyerInvitation.mockResolvedValue({ ok: true, etat: 'envoye', destinataire: 'lea@criterimmo.fr' });
    const res = await creation.POST(req(CORPS));
    expect(res.status).toBe(201);
    const b = await res.json();
    expect(h.envoyerInvitation).toHaveBeenCalledWith(9, 1);
    expect(b.motDePasseTemporaire).toBe('TEMP-FIXE');
    expect(b.invitation).toMatchObject({ ok: true, phrase: 'Mail d’invitation envoyé à lea@criterimmo.fr.' });
  });

  it('échec d’envoi → le compte est créé, et l’écran reçoit « NON envoyé » avec le motif réel', async () => {
    h.envoyerInvitation.mockResolvedValue({ ok: false, etat: 'echec', destinataire: 'lea@criterimmo.fr', motif: 'Le jeton de gestion@ n’a pas pu être rafraîchi.' });
    const b = await (await creation.POST(req(CORPS))).json();
    expect(b.compte.id).toBe(9);
    expect(b.invitation.ok).toBe(false);
    expect(b.invitation.phrase).toBe('Mail d’invitation NON envoyé à lea@criterimmo.fr : Le jeton de gestion@ n’a pas pu être rafraîchi.');
  });

  it('exception pendant l’envoi → jamais « envoyé »', async () => {
    h.envoyerInvitation.mockRejectedValue(new Error('panne'));
    const b = await (await creation.POST(req(CORPS))).json();
    expect(b.invitation.ok).toBe(false);
    expect(b.invitation.phrase).toMatch(/NON envoyé/);
  });

  it('la liste porte l’état d’invitation de chaque compte', async () => {
    h.listerComptes.mockResolvedValue([{ id: 9 }, { id: 3 }]);
    h.etatsInvitations.mockResolvedValue(new Map([[9, { active: false }]]));
    const b = await (await creation.GET(new Request('http://x'))).json();
    expect(b.comptes).toEqual([{ id: 9, invitation: { active: false } }, { id: 3, invitation: null }]);
  });
});

describe('« Renvoyer le mail d’invitation »', () => {
  it('envoyé → « Mail renvoyé à … »', async () => {
    h.envoyerInvitation.mockResolvedValue({ ok: true, etat: 'envoye', destinataire: 'lea@criterimmo.fr' });
    const res = await renvoi.POST(req(), ctx);
    expect(await res.json()).toEqual({ ok: true, etat: 'envoye', message: 'Mail renvoyé à lea@criterimmo.fr.' });
  });
  it('trop rapproché ou compte activé → refus clair (409), avec le motif', async () => {
    h.envoyerInvitation.mockResolvedValue({ ok: false, etat: 'refuse', destinataire: 'lea@criterimmo.fr', motif: 'Un mail vient d’être envoyé : attendez 2 min avant de le renvoyer.' });
    const res = await renvoi.POST(req(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toMatch(/attendez/);
  });
  it('échec d’envoi → l’erreur réelle (502), jamais « renvoyé »', async () => {
    h.envoyerInvitation.mockResolvedValue({ ok: false, etat: 'echec', destinataire: 'lea@criterimmo.fr', motif: 'quota Gmail dépassé' });
    const res = await renvoi.POST(req(), ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).erreur).toBe('Mail d’invitation NON envoyé à lea@criterimmo.fr : quota Gmail dépassé.');
  });
  it('réservé aux administrateurs (garde)', async () => {
    h.exigerAdministrateur.mockResolvedValue({ refus: new Response(null, { status: 403 }) });
    expect((await renvoi.POST(req(), ctx)).status).toBe(403);
    expect(h.envoyerInvitation).not.toHaveBeenCalled();
  });
});

describe('activation publique', () => {
  it('lecture : n’écrit rien, rend le prénom seulement si le lien agit', async () => {
    h.lireLien.mockResolvedValue({ verdict: { ok: true }, prenom: 'Léa', identifiant: 'lea@criterimmo.fr' });
    const b = await (await activation.GET(new Request('http://x/api/admin/activation?j=JETON'))).json();
    expect(b).toEqual({ ok: true, prenom: 'Léa', identifiant: 'lea@criterimmo.fr' });
    expect(h.activerParLien).not.toHaveBeenCalled();
  });
  it('lien expiré / déjà utilisé → 409 avec le message clair', async () => {
    h.activerParLien.mockResolvedValue({ ok: false, statut: 409, message: 'Ce lien a déjà servi : votre compte est activé. Connectez-vous avec votre mot de passe.' });
    const res = await activation.POST(req({ jeton: 'J', motDePasse: 'mot-de-passe-solide', confirmation: 'mot-de-passe-solide' }));
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toMatch(/déjà servi/);
  });
  it('jeton absent → refusé sans appeler le dépôt', async () => {
    expect((await activation.POST(req({ motDePasse: 'x' }))).status).toBe(409);
    expect(h.activerParLien).not.toHaveBeenCalled();
  });
});
