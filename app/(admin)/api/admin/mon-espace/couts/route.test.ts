import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 « LES COÛTS » (Arno, 03/11/2026, lots 1 et 2) — la VRAIE route /api/admin/mon-espace/couts, dépôts simulés :
 *   GET  un associé reçoit la lecture de « Coûts globaux » (`lireDonneesGlobal`, sans les compromis) et, pour la saisie, les profils et les versions ;
 *   POST une saisie écrit par les fonctions du dépôt de la Transaction (les mêmes enregistrements) ; 409 si la ligne a changé ; 422 FUSION / MACJ
 *        pour la location ; un compte qui n'est pas associé : 403, rien n'est lu ni écrit.
 */
const h = vi.hoisted(() => ({ garde: vi.fn(), voir: vi.fn(), lire: vi.fn(), ajouter: vi.fn(), modifier: vi.fn(), gestion: vi.fn(), empreinte: vi.fn(), valider: vi.fn(),
  validations: vi.fn() }));
vi.mock('../../../../../lib/mon-espace/garde', () => ({ exigerMonEspace: h.garde }));
vi.mock('../../../../../lib/mon-espace/compteRepo', () => ({ peutVoirCouts: h.voir }));
vi.mock('../../../../../lib/transaction/donneesGlobal', () => ({ lireDonneesGlobal: h.lire }));
vi.mock('../../../../../lib/transaction/repo', () => ({ ajouterCoutLigne: h.ajouter, modifierCoutLigne: h.modifier, modifierPosteGestion: h.gestion,
  empreinteCouts: h.empreinte, lireVersionsGestion: async () => ({ '2026-10': { version: 7, origine: 'saisie' } }), validerPosteCout: h.valider, lireValidationsCouts: h.validations }));
vi.mock('../../../../../lib/admin/schemaDroits', () => ({ coutsSaisisDisponible: async () => true, mongaDisponible: async () => true }));
vi.mock('../../../../../lib/location/suivi/suivi', () => ({ aujourdhuiParis: () => '2026-11-03' }));
vi.mock('../../../../../lib/admin/fonctionsCompte', () => ({ lireProfilsCouts: async () => [{ id: 5, libelle: 'Jean-Baptiste Pons', fonctions: ['location'] }] }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 4, libelle: 'arno' }) }));
import { GET, POST } from './route';

const lire = async (q = '') => { const r = await GET(new Request(`http://local/api/admin/mon-espace/couts${q}`)); return { status: r.status, corps: await r.json() as Record<string, unknown> }; };
const poster = async (corps: unknown) => {
  const r = await POST(new Request('http://local/api/admin/mon-espace/couts', { method: 'POST', body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as Record<string, unknown> };
};
const SALAIRE = { action: 'ligne-ajouter', ligne: { societe: 'criterimmo', famille: 'location', poste: 'salaires', annee: 2026, mois: 10, compteId: 5, montantHt: 2100.5 } };
beforeEach(() => {
  h.garde.mockReset().mockResolvedValue({ auteurId: 4 });
  h.voir.mockReset().mockResolvedValue(true);
  h.lire.mockReset().mockResolvedValue({ ventes: ['…'] });
  h.ajouter.mockReset().mockResolvedValue({ ok: true, valeur: 41 });
  h.modifier.mockReset().mockResolvedValue({ ok: true });
  h.gestion.mockReset().mockResolvedValue({ ok: true });
  h.empreinte.mockReset().mockResolvedValue('99|2026-11-03');
  h.valider.mockReset().mockResolvedValue({ ok: true });
  h.validations.mockReset().mockResolvedValue([]);
});

describe('🔴 GET /api/admin/mon-espace/couts', () => {
  it('un associé : les données de « Coûts globaux » (sans les compromis), les profils, les versions de la Gestion, la 451', async () => {
    const r = await lire();
    expect(r.status).toBe(200);
    expect(r.corps).toEqual({ etat: 'ok', data: { ventes: ['…'], profils: [{ id: 5, libelle: 'Jean-Baptiste Pons', fonctions: ['location'] }],
      versionsGestion: { '2026-10': { version: 7, origine: 'saisie' } }, saisie: true, validations: [] } });
    expect(h.voir).toHaveBeenCalledWith(4);
    expect(h.lire).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), { compromis: false });
  });
  it('🔴 lot 3 — ?rappel=1 : le mois précédent (octobre au 03/11/2026) à compléter dans les structures vues ; tout validé : aucun rappel', async () => {
    expect((await lire('?rappel=1&agence=macj')).corps).toEqual({ etat: 'ok', data: { rappel: { mois: { annee: 2026, mois: 10 }, mot: 'Coûts d’octobre à saisir' } } });
    h.validations.mockResolvedValue([{ societe: 'macj', famille: 'vente', poste: 'salaires', annee: 2026, mois: 10 }, { societe: 'macj', famille: 'vente', poste: 'autres', annee: 2026, mois: 10 }]);
    expect((await lire('?rappel=1&agence=macj')).corps).toEqual({ etat: 'ok', data: { rappel: null } });
    expect((await lire('?rappel=1&agence=tous')).corps.data).toMatchObject({ rappel: { mot: 'Coûts d’octobre à saisir' } }); // CRITERIMMO reste à compléter
    expect((await lire('?rappel=1&agence=fusion')).status).toBe(400);
    h.validations.mockResolvedValue(null); // sans la 452 : aucun rappel
    expect((await lire('?rappel=1&agence=macj')).corps).toEqual({ etat: 'ok', data: { rappel: null } });
  });
  it('?empreinte=1 : l’empreinte des coûts seule', async () => {
    expect((await lire('?empreinte=1')).corps).toEqual({ etat: 'ok', data: { empreinte: '99|2026-11-03' } });
    expect(h.lire).not.toHaveBeenCalled();
  });
  it('pas associé (ou pas administrateur) : 403, rien n’est lu', async () => {
    h.voir.mockResolvedValue(false);
    const r = await lire();
    expect(r.status).toBe(403);
    expect(r.corps.data).toBeUndefined();
    expect(h.lire).not.toHaveBeenCalled();
  });
  it('sans le droit « Mon espace » : le refus de la garde, rien n’est lu', async () => {
    h.garde.mockResolvedValue({ refus: Response.json({ erreur: 'REFUS' }, { status: 403 }) });
    expect((await lire()).status).toBe(403);
    expect(h.voir).not.toHaveBeenCalled();
    expect(h.lire).not.toHaveBeenCalled();
  });
});

describe('🔴 POST /api/admin/mon-espace/couts — la saisie (lot 2)', () => {
  it('un salaire : écrit par `ajouterCoutLigne` (la même ligne que la page de saisie), au nom de l’auteur', async () => {
    const r = await poster(SALAIRE);
    expect(r).toEqual({ status: 200, corps: { etat: 'ok', data: { id: 41 } } });
    expect(h.ajouter).toHaveBeenCalledWith({ ...SALAIRE.ligne, libelle: null }, { id: 4, libelle: 'arno' });
  });
  it('pas associé : 403, rien n’est écrit', async () => {
    h.voir.mockResolvedValue(false);
    expect((await poster(SALAIRE)).status).toBe(403);
    expect(h.ajouter).not.toHaveBeenCalled();
  });
  it('FUSION, ou la location sur MACJ : 422, rien n’est écrit', async () => {
    expect((await poster({ ...SALAIRE, ligne: { ...SALAIRE.ligne, societe: 'tous' } })).status).toBe(422);
    expect((await poster({ ...SALAIRE, ligne: { ...SALAIRE.ligne, societe: 'macj' } })).status).toBe(422);
    expect(h.ajouter).not.toHaveBeenCalled();
  });
  it('une écriture périmée (la ligne a changé depuis sa lecture) : 409 et le motif', async () => {
    h.modifier.mockResolvedValue({ ok: false, motif: 'Ce coût a été modifié entre-temps', conflit: true });
    const r = await poster({ action: 'ligne-modifier', id: 3, version: 12, montantHt: 10 });
    expect(r.status).toBe(409);
    expect(h.modifier).toHaveBeenCalledWith(3, 12, { montantHt: 10, compteId: undefined, libelle: undefined }, { id: 4, libelle: 'arno' });
  });
  it('retirer une ligne ; ADHOC / MONGA d’un mois : par `modifierPosteGestion` (la Gestion du Suivi CA)', async () => {
    expect((await poster({ action: 'ligne-retirer', id: 3, version: 12 })).status).toBe(200);
    expect(h.modifier).toHaveBeenCalledWith(3, 12, { retirer: true }, { id: 4, libelle: 'arno' });
    expect((await poster({ action: 'gestion-poste', annee: 2026, mois: 10, poste: 'monga', montantHt: 412.5, version: 7 })).status).toBe(200);
    expect(h.gestion).toHaveBeenCalledWith(2026, 10, 'monga', 412.5, 7, { id: 4, libelle: 'arno' });
  });
});

describe('🔴 POST — lot 3 : valider un poste du mois', () => {
  it('valider / dévalider : par `validerPosteCout` ; FUSION ou la gestion sur MACJ : 422 ; pas associé : 403', async () => {
    const V = { societe: 'criterimmo', famille: 'gestion', poste: 'monga', annee: 2026, mois: 10 };
    expect((await poster({ action: 'valider', validation: V, valide: true })).status).toBe(200);
    expect(h.valider).toHaveBeenCalledWith(V, true, { id: 4, libelle: 'arno' });
    expect((await poster({ action: 'valider', validation: { ...V, societe: 'tous' }, valide: true })).status).toBe(422);
    expect((await poster({ action: 'valider', validation: { ...V, societe: 'macj' }, valide: true })).status).toBe(422);
    expect((await poster({ action: 'valider', validation: { ...V, famille: 'vente' }, valide: true })).status).toBe(422); // MONGA n'est pas de la vente
    h.voir.mockResolvedValue(false);
    expect((await poster({ action: 'valider', validation: V, valide: true })).status).toBe(403);
    expect(h.valider).toHaveBeenCalledTimes(1);
  });
});
