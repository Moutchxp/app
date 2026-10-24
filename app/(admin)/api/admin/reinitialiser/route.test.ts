import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026, 416) — les routes du « mot de passe oublié » de l'administration (dépôt simulé, aucun mail, aucune base) :
 * la demande répond TOUJOURS pareil ; le lien pose le mot de passe et ouvre la session du navigateur courant.
 */
vi.mock('server-only', () => ({}));
const repo = vi.hoisted(() => ({ demanderReinitialisation: vi.fn(), lireLienReinitialisation: vi.fn(), reinitialiserParLien: vi.fn() }));
vi.mock('../../../../lib/admin/reinitialisationRepo', () => repo);
const comptes = vi.hoisted(() => ({ trouverCompteParId: vi.fn(), marquerConnexion: vi.fn() }));
vi.mock('../../../../lib/admin/comptes', () => comptes);
vi.mock('../../../../lib/admin/ouvertureSession', () => ({ sessionPourCompte: async (c: { id: number }) => ({ sub: c.id }) }));
const pose = vi.hoisted(() => ({ cookies: [] as { nom: string; valeur: string }[] }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: (nom: string, valeur: string) => { pose.cookies.push({ nom, valeur }); } }) }));
vi.mock('../../../../lib/admin/session', () => ({ NOM_COOKIE: 'svv_admin', optionsCookie: () => ({}), signerJeton: async (s: { sub: number }) => `JWS-${s.sub}` }));

const { POST: demander } = await import('./demander/route');
const { GET, POST } = await import('./route');
const post = (corps: unknown) => new Request('http://x', { method: 'POST', body: typeof corps === 'string' ? corps : JSON.stringify(corps) });

beforeEach(() => {
  for (const f of [...Object.values(repo), ...Object.values(comptes)]) f.mockReset();
  pose.cookies.length = 0;
});

describe('🔴 la demande : une réponse identique dans tous les cas', () => {
  it('compte connu, inconnu, désactivé, corps invalide, panne : même statut, même corps', async () => {
    const corps: string[] = [];
    repo.demanderReinitialisation.mockResolvedValueOnce({ envoi: Promise.resolve({ etat: 'envoye' }) });   // connu
    repo.demanderReinitialisation.mockResolvedValueOnce({ envoi: null });                                   // inconnu / désactivé
    repo.demanderReinitialisation.mockRejectedValueOnce(new Error('panne'));                               // panne
    for (const r of [await demander(post({ email: 'lea@criterimmo.fr' })), await demander(post({ email: 'personne@x.fr' })),
      await demander(post({ email: 'lea@criterimmo.fr' })), await demander(post('pas du json'))]) {
      expect(r.status).toBe(200);
      corps.push(JSON.stringify(await r.json()));
    }
    expect(new Set(corps).size).toBe(1);
    expect(JSON.parse(corps[0]).message).toMatch(/^Si un compte est associé à cette adresse, vous allez recevoir un e-mail/);
  });
});

describe('🔴 le lien', () => {
  it('GET : l’identifiant seulement si le lien agit ; sinon « Ce lien n’est plus valide »', async () => {
    repo.lireLienReinitialisation.mockResolvedValueOnce({ ok: true, identifiant: 'lea@criterimmo.fr' }).mockResolvedValueOnce({ ok: false });
    expect(await (await GET(new Request('http://x?j=BON'))).json()).toEqual({ ok: true, identifiant: 'lea@criterimmo.fr' });
    expect(await (await GET(new Request('http://x?j=VIEUX'))).json()).toEqual({ ok: false, message: 'Ce lien n’est plus valide.' });
    expect(await (await GET(new Request('http://x'))).json()).toEqual({ ok: false, message: 'Ce lien n’est plus valide.' });
  });
  it('POST réussi : la session du navigateur courant est ouverte (cookie de session), la connexion est notée', async () => {
    repo.reinitialiserParLien.mockResolvedValue({ ok: true, compteId: 9, identifiant: 'lea@criterimmo.fr' });
    comptes.trouverCompteParId.mockResolvedValue({ id: 9, actif: true });
    const r = await POST(post({ jeton: 'J', motDePasse: 'un-nouveau-mot-de-passe', confirmation: 'un-nouveau-mot-de-passe' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, connecte: true });
    expect(pose.cookies).toEqual([{ nom: 'svv_admin', valeur: 'JWS-9' }]);
    expect(comptes.marquerConnexion).toHaveBeenCalledWith(9);
  });
  it('POST refusé (lien, politique) : le message du dépôt, aucune session', async () => {
    repo.reinitialiserParLien.mockResolvedValue({ ok: false, statut: 409, message: 'Ce lien n’est plus valide.' });
    const r = await POST(post({ jeton: 'J', motDePasse: 'x', confirmation: 'x' }));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ erreur: 'Ce lien n’est plus valide.' });
    expect(pose.cookies).toEqual([]);
    expect((await POST(post({ motDePasse: 'x' }))).status).toBe(409);
  });
});
