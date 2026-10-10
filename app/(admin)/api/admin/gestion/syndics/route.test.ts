import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN — les routes de l'annuaire des syndics : la saisie est re-validée par le
 * serveur, l'auteur vient de la session, et la création comme la modification passent par la MÊME porte.
 */
const enregistrerSyndic = vi.fn();
const supprimerSyndic = vi.fn();
const doublonsAilleurs = vi.fn(async () => ({ emails: [], noms: [{ prenom: 'Jean', nom: 'NEUF', titre: null, syndicId: 9, syndicNom: 'AUTRE', syndicVille: 'Lyon' }] }));
const adressesBanLocale = vi.fn(async () => [{ cle: '25 rue edith cavell', libelle: '25 Rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' }]);
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: vi.fn(async () => null) }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: vi.fn(async () => ({ id: 7, libelle: 'arno' })) }));
vi.mock('../../../../../lib/gestion/syndicRepo', () => ({
  syndicsDisponibles: vi.fn(async () => true),
  listerSyndics: vi.fn(async () => [
    { id: 1, nom: 'Citya', email: null, telephone: null, nbCoproprietes: 2, nbBiens: 5, cherchable: 'citya citya com' },
    { id: 2, nom: 'Foncia', email: null, telephone: null, nbCoproprietes: 1, nbBiens: 1, cherchable: 'foncia' },
  ]),
  enregistrerSyndic: (...a: unknown[]) => enregistrerSyndic(...a),
  supprimerSyndic: (...a: unknown[]) => supprimerSyndic(...a),
  adressesBanLocale: (...a: unknown[]) => adressesBanLocale(...(a as [])),
  doublonsAilleurs: (...a: unknown[]) => doublonsAilleurs(...(a as [])),
  ficheSyndic: vi.fn(async (id: number) => (id === 1 ? { id: 1, nom: 'Citya' } : null)),
  immeublesConnus: vi.fn(async () => []),
}));

const requete = (url: string, corps?: unknown, methode = 'POST'): Request =>
  new Request(`http://localhost${url}`, corps === undefined ? {} : { method: methode, body: JSON.stringify(corps) });

describe('/api/admin/gestion/syndics', () => {
  beforeEach(() => { enregistrerSyndic.mockReset(); enregistrerSyndic.mockResolvedValue({ ok: true, id: 11 }); });

  it('GET filtre par nom / domaine', async () => {
    const { GET } = await import('./route');
    const j = await (await GET(requete('/api/admin/gestion/syndics?q=citya.com'))).json();
    expect(j.syndics.map((s: { id: number }) => s.id)).toEqual([1]);
  });

  it('POST sans nom : refusé (422), rien n\'est écrit', async () => {
    const { POST } = await import('./route');
    const r = await POST(requete('/api/admin/gestion/syndics', { nom: ' ' }));
    expect(r.status).toBe(422);
    expect(enregistrerSyndic).not.toHaveBeenCalled();
  });

  it('POST valide : création par la seule porte, avec l\'auteur de la SESSION', async () => {
    const { POST } = await import('./route');
    const r = await POST(requete('/api/admin/gestion/syndics', { nom: 'Cabinet TEST', adresse: '1 rue A', codePostal: '75001', ville: 'Paris', immeubles: ['12 rue X'], auteur: 'pirate' }));
    expect(await r.json()).toEqual({ ok: true, id: 11 });
    expect(enregistrerSyndic.mock.calls[0][0]).toBeNull();
    expect(enregistrerSyndic.mock.calls[0][1]).toMatchObject({ nom: 'Cabinet TEST', immeubles: [{ libelle: '12 rue X', codePostal: '', commune: '' }] });
    expect(enregistrerSyndic.mock.calls[0][2]).toEqual({ id: 7, libelle: 'arno' });
  });

  it('PUT /[id] : modification par la même porte ; GET /[id] inconnu → 404', async () => {
    const { PUT, GET } = await import('./[id]/route');
    const params = (id: string) => ({ params: Promise.resolve({ id }) });
    await PUT(requete('/api/admin/gestion/syndics/11', { nom: 'Cabinet TEST', adresse: '1 rue A', codePostal: '75001', ville: 'Paris' }, 'PUT'), params('11'));
    expect(enregistrerSyndic.mock.calls[0][0]).toBe(11);
    expect((await GET(requete('/api/admin/gestion/syndics/5'), params('5'))).status).toBe(404);
    expect((await GET(requete('/api/admin/gestion/syndics/abc'), params('abc'))).status).toBe(422);
  });

  it('DELETE /[id] : « Supprimer ce syndic » par la porte dédiée, avec l\'auteur de la session', async () => {
    supprimerSyndic.mockResolvedValue({ ok: true, coproprietes: 2 });
    const { DELETE } = await import('./[id]/route');
    const r = await DELETE(requete('/api/admin/gestion/syndics/11', undefined), { params: Promise.resolve({ id: '11' }) });
    expect(await r.json()).toEqual({ ok: true, coproprietes: 2 });
    expect(supprimerSyndic).toHaveBeenCalledWith(11, { id: 7, libelle: 'arno' });
    supprimerSyndic.mockResolvedValue({ ok: false, motif: 'Ce syndic n’existe pas ou a déjà été supprimé.' });
    expect((await DELETE(requete('/api/admin/gestion/syndics/12', undefined), { params: Promise.resolve({ id: '12' }) })).status).toBe(404);
  });

  it('GET /adresses : la BAN LOCALE, la saisie transmise telle quelle (bornée)', async () => {
    const { GET } = await import('./adresses/route');
    const j = await (await GET(requete('/api/admin/gestion/syndics/adresses?q=25%20rue%20edith'))).json();
    expect(j.adresses[0].libelle).toBe('25 Rue Edith Cavell');
    expect(adressesBanLocale).toHaveBeenCalledWith('25 rue edith');
  });

  it('GET /doublons : le syndic exclu, les e-mails en liste, le reste transmis tel quel (LOT SYNDIC-CONTACTS-ANTI-DOUBLON)', async () => {
    const { GET } = await import('./doublons/route');
    const j = await (await GET(requete('/api/admin/gestion/syndics/doublons?syndic=22&prenom=Jean&nom=Neuf&emails=a%40b.fr,c%40d.fr'))).json();
    expect(doublonsAilleurs).toHaveBeenCalledWith(22, 'Jean', 'Neuf', ['a@b.fr', 'c@d.fr']);
    expect(j.noms[0].syndicNom).toBe('AUTRE');
    await GET(requete('/api/admin/gestion/syndics/doublons?syndic=&prenom=&nom=&emails='));
    expect(doublonsAilleurs).toHaveBeenLastCalledWith(null, '', '', []);
  });

  it('GET /[id]?lot=N : la fiche lue POUR UN BIEN (note de ce couple) — LOT SYNDIC-NOTE-PAR-BIEN', async () => {
    const repo = await import('../../../../../lib/gestion/syndicRepo');
    const { GET } = await import('./[id]/route');
    await GET(requete('/api/admin/gestion/syndics/1?lot=101'), { params: Promise.resolve({ id: '1' }) });
    expect(repo.ficheSyndic).toHaveBeenLastCalledWith(1, 101);
    await GET(requete('/api/admin/gestion/syndics/1'), { params: Promise.resolve({ id: '1' }) });
    expect(repo.ficheSyndic).toHaveBeenLastCalledWith(1, null);
  });
});
