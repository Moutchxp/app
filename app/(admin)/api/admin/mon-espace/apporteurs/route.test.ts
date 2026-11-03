import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 MON ESPACE, LOT 9 — la VRAIE route /api/admin/mon-espace/apporteurs, dépôt simulé : le titulaire est celui de la session (jamais du corps),
 * le 409 d'un doublon renvoie les fiches existantes, les actions inconnues et les ids illisibles sont refusés, un conflit de fiche reste un 409.
 */
const h = vi.hoisted(() => ({ garde: vi.fn(), lire: vi.fn(), creer: vi.fn(), utiliser: vi.fn(), fiche: vi.fn(), doublons: vi.fn(), geste: vi.fn() }));
vi.mock('../../../../../lib/mon-espace/garde', () => ({ exigerMonEspace: h.garde }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'lea@x.fr' }) }));
vi.mock('../../../../../lib/mon-espace/apporteursRepo', () => ({
  lireMesApporteurs: h.lire, creerApporteurMonEspace: h.creer, utiliserApporteur: h.utiliser, modifierFicheMonEspace: h.fiche, doublonsDansLAnnuaire: h.doublons, gesteAnnuaireMonEspace: h.geste,
}));
import { GET, POST } from './route';
import { GET as GET_DOUBLONS } from './doublons/route';

const poster = async (corps: Record<string, unknown>) => {
  const r = await POST(new Request('http://local/api/admin/mon-espace/apporteurs', { method: 'POST', body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as Record<string, unknown> };
};
const DOUBLON = { id: 1, libelle: 'DURAND Paul', collegue: 'Marc', raisons: ['telephone'] };
beforeEach(() => {
  h.garde.mockResolvedValue({ auteurId: 5 });
  h.lire.mockReset().mockResolvedValue({ apporteurs: [], collegues: [] });
  h.creer.mockReset().mockResolvedValue({ ok: true, id: 42 });
  h.utiliser.mockReset().mockResolvedValue({ ok: true });
  h.fiche.mockReset().mockResolvedValue({ ok: true, data: { id: 1 } });
  h.doublons.mockReset().mockResolvedValue([DOUBLON]);
  h.geste.mockReset().mockResolvedValue({ ok: true });
});

describe('🔴 /api/admin/mon-espace/apporteurs', () => {
  it('GET : les apporteurs du compte de la SESSION', async () => {
    const r = await GET(new Request('http://local/api/admin/mon-espace/apporteurs?compteId=9'));
    expect(r.status).toBe(200);
    expect(h.lire).toHaveBeenCalledWith(5);
  });
  it('créer : 200 avec l’id ; un doublon : 409 avec les fiches existantes', async () => {
    expect(await poster({ action: 'creer', apporteur: { nom: 'Zoé' } })).toMatchObject({ status: 200, corps: { etat: 'ok', data: { id: 42 } } });
    expect(h.creer).toHaveBeenCalledWith(5, { nom: 'Zoé' }, { id: 5, libelle: 'lea@x.fr' });
    h.creer.mockResolvedValue({ ok: false, statut: 409, motif: 'Cet apporteur existe déjà, rattaché à Marc', doublons: [DOUBLON] });
    expect(await poster({ action: 'creer', apporteur: { nom: 'Paul' } })).toMatchObject({ status: 409, corps: { etat: 'refus', doublons: [DOUBLON] } });
  });
  it('utiliser et fiche : l’id est lu ; illisible ou action inconnue : 400', async () => {
    expect((await poster({ action: 'utiliser', apporteurId: 1 })).status).toBe(200);
    expect(h.utiliser).toHaveBeenCalledWith(5, 1, expect.anything());
    expect((await poster({ action: 'utiliser', apporteurId: 'x' })).status).toBe(400);
    expect((await poster({ action: 'supprimer', apporteurId: 1 })).status).toBe(400);
  });
  it('fiche : 403 tel quel ; conflit : 409 « conflit »', async () => {
    h.fiche.mockResolvedValue({ ok: false, statut: 403, motif: 'Seuls son collègue…' });
    expect((await poster({ action: 'fiche', apporteurId: 1, fiche: {}, version: 'v1' })).status).toBe(403);
    h.fiche.mockResolvedValue({ ok: false, statut: 409, motif: 'conflit' });
    expect(await poster({ action: 'fiche', apporteurId: 1, fiche: {}, version: 'v1' })).toMatchObject({ status: 409, corps: { etat: 'conflit' } });
    expect(h.fiche).toHaveBeenLastCalledWith(5, 1, {}, 'v1', expect.anything());
  });
  it('🔴 D26 — rattachement, taux, rémunération : le compte de la SESSION, l’avertissement de création ; 403 et 409 tels quels', async () => {
    expect(await poster({ action: 'rattachement', apporteurId: 3, collegueAvant: null, rattachement: { collegueId: 7 } })).toMatchObject({ status: 200, corps: { etat: 'ok' } });
    expect(h.geste).toHaveBeenCalledWith(5, 3, 'rattachement', expect.objectContaining({ collegueAvant: null }), expect.anything());
    await poster({ action: 'bareme-apporteur', apporteurId: 3, bareme: {} });
    expect(h.geste).toHaveBeenLastCalledWith(5, 3, 'bareme-apporteur', expect.anything(), expect.anything());
    h.geste.mockResolvedValue({ ok: false, statut: 403, motif: 'administrateur' });
    expect((await poster({ action: 'remuneration-collegue', apporteurId: 3 })).status).toBe(403);
    h.geste.mockResolvedValue({ ok: false, statut: 409, motif: 'changé' });
    expect(await poster({ action: 'rattachement', apporteurId: 3 })).toMatchObject({ status: 409, corps: { etat: 'conflit' } });
    h.creer.mockResolvedValue({ ok: true, id: 43, avertissement: 'Apporteur créé ; le reste…' });
    expect(await poster({ action: 'creer', apporteur: {} })).toMatchObject({ corps: { data: { id: 43, avertissement: 'Apporteur créé ; le reste…' } } });
  });
  it('sans le droit « Mon espace » : le refus de la garde, rien n’est lu ni écrit', async () => {
    h.garde.mockResolvedValue({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await poster({ action: 'creer', apporteur: {} })).status).toBe(403);
    expect(h.creer).not.toHaveBeenCalled();
  });
  it('GET doublons : la saisie est transmise, la réponse ne porte que nom, collègue, raisons', async () => {
    const r = await GET_DOUBLONS(new Request('http://local/api/admin/mon-espace/apporteurs/doublons?nom=Paul&telephone=0612345678'));
    expect(h.doublons).toHaveBeenCalledWith({ nom: 'Paul', prenom: '', telephone: '0612345678', email: '' });
    expect(await r.json()).toEqual({ etat: 'ok', data: [DOUBLON] });
  });
});
