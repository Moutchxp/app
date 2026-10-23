import { describe, it, expect, vi, beforeEach } from 'vitest';

/** LOCATION « Outils de suivi » (406) — la porte du suivi : les barèmes et rétrocessions exigent un ADMINISTRATEUR ;
 *  les montants de rétrocession ne se lisent que par qui peut « Voir les commissions ». */
vi.mock('server-only', () => ({}));
const exigerAdministrateur = vi.fn();
const exigerLocation = vi.fn();
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: (...a: unknown[]) => exigerAdministrateur(...a) }));
vi.mock('../../../../../lib/location/garde', () => ({ exigerLocation: (...a: unknown[]) => exigerLocation(...a) }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 5, libelle: 'Jean-Baptiste PONS' }) }));
const repo = {
  ajouterBaremeApporteur: vi.fn(), ajouterRegle: vi.fn(), ajouterRetrocession: vi.fn(), annulerRetrocession: vi.fn(), creerApporteur: vi.fn(),
  enregistrerActiviteBail: vi.fn(), lireApporteurs: vi.fn(), lireNegociateurs: vi.fn(), lireRegles: vi.fn(), lireRetrocessions: vi.fn(),
  peutVoirCommissions: vi.fn(), proposerActivite: vi.fn(), suiviDisponible: vi.fn(),
  annuaireDisponible: vi.fn(), lireCollegues: vi.fn(), modifierActivite: vi.fn(), modifierApporteur: vi.fn(), rattacherApporteur: vi.fn(),
  /* Arno (24/10/2026, 411) — l'origine « Personnalisé » peut-elle être proposée ? */
  personnalisableDisponible: vi.fn(async () => false),
};
vi.mock('../../../../../lib/location/suivi/suiviRepo', () => Object.fromEntries(Object.entries(repo).map(([k, f]) => [k, (...a: unknown[]) => f(...a)])));
const donneesTableau = vi.fn();
vi.mock('../../../../../lib/location/suivi/tableauBordRepo', () => ({ donneesTableau: (...a: unknown[]) => donneesTableau(...a), lireActivites: async () => [], anneesActives: async () => [] }));
const { GET, POST } = await import('./route');

const poster = (corps: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(corps) }));
const REFUS = () => ({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });

beforeEach(() => {
  for (const f of Object.values(repo)) f.mockReset().mockResolvedValue({ etat: 'ok' });
  repo.suiviDisponible.mockResolvedValue(true);
  repo.lireApporteurs.mockResolvedValue([]);
  repo.lireRegles.mockResolvedValue([]);
  repo.lireNegociateurs.mockResolvedValue([]);
  repo.lireCollegues.mockResolvedValue([]);
  repo.annuaireDisponible.mockResolvedValue(true);
  repo.lireRetrocessions.mockResolvedValue([{ id: 1, montant: 200 }]);
  repo.peutVoirCommissions.mockResolvedValue(false);
  exigerAdministrateur.mockReset().mockResolvedValue({ auteurId: 2 });
  exigerLocation.mockReset().mockResolvedValue({ auteurId: 5 });
});

describe('/api/admin/location/suivi', () => {
  it('🔴 un collaborateur Location ne crée NI barème, NI règle, NI rétrocession (garde administrateur)', async () => {
    exigerAdministrateur.mockResolvedValue(REFUS());
    for (const action of ['bareme-apporteur', 'regle', 'retrocession', 'annuler-retrocession', 'modifier-apporteur', 'rattacher-apporteur']) {
      expect((await poster({ action })).status).toBe(403);
    }
    expect(repo.ajouterBaremeApporteur).not.toHaveBeenCalled();
    expect(repo.ajouterRegle).not.toHaveBeenCalled();
    expect(repo.ajouterRetrocession).not.toHaveBeenCalled();
    expect(repo.annulerRetrocession).not.toHaveBeenCalled();
    expect(repo.modifierApporteur).not.toHaveBeenCalled();
    expect(repo.rattacherApporteur).not.toHaveBeenCalled();
  });
  it('407 — la feuille du mois corrige une affaire avec le droit Location ; l’annuaire passe par la garde administrateur', async () => {
    expect((await poster({ action: 'modifier-activite', id: 12, champs: { origineContact: 'internet' } })).status).toBe(200);
    expect(repo.modifierActivite).toHaveBeenCalledWith(12, { origineContact: 'internet' }, { id: 5, libelle: 'Jean-Baptiste PONS' });
    expect(exigerAdministrateur).not.toHaveBeenCalled();
    await poster({ action: 'rattacher-apporteur', apporteurId: 3, rattachement: { collegueId: 2, depuis: '2026-01-01' } });
    expect(exigerAdministrateur).toHaveBeenCalled();
    expect(repo.rattacherApporteur).toHaveBeenCalledWith(3, { collegueId: 2, depuis: '2026-01-01' }, { id: 5, libelle: 'Jean-Baptiste PONS' });
  });
  it('le suivi d’un bail et « + Nouvel apporteur » : droit Location, avec l’auteur de la requête', async () => {
    expect((await poster({ action: 'enregistrer-activite', bailId: 7, activite: { dateSignature: '2026-10-22' } })).status).toBe(200);
    expect(repo.enregistrerActiviteBail).toHaveBeenCalledWith(7, { dateSignature: '2026-10-22' }, { id: 5, libelle: 'Jean-Baptiste PONS' });
    expect((await poster({ action: 'creer-apporteur', apporteur: { nom: 'X' } })).status).toBe(200);
    expect(exigerAdministrateur).not.toHaveBeenCalled();
  });
  it('sans le droit Location : refusé', async () => {
    exigerLocation.mockResolvedValue(REFUS());
    expect((await poster({ action: 'enregistrer-activite', bailId: 7 })).status).toBe(403);
    expect((await GET(new Request('http://x/api/admin/location/suivi'))).status).toBe(403);
  });
  it('🔴 les rétrocessions ne sont lues que par qui peut « Voir les commissions »', async () => {
    let d = await (await GET(new Request('http://x/api/admin/location/suivi'))).json();
    expect(d.data.retrocessions).toEqual([]);
    expect(d.data.voirCommissions).toBe(false);
    expect(repo.lireRetrocessions).not.toHaveBeenCalled();
    repo.peutVoirCommissions.mockResolvedValue(true);
    d = await (await GET(new Request('http://x/api/admin/location/suivi'))).json();
    expect(d.data.retrocessions).toEqual([{ id: 1, montant: 200 }]);
    expect(d.data.moi).toBe(5);
  });
  it('🔴 le tableau de bord : l’année demandée, et le droit « Voir les commissions » relu pour la requête', async () => {
    donneesTableau.mockReset().mockResolvedValue({ activites: [] });
    await GET(new Request('http://x/api/admin/location/suivi?vue=tableau&annee=2025'));
    expect(donneesTableau).toHaveBeenCalledWith(2025, false, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    repo.peutVoirCommissions.mockResolvedValue(true);
    await GET(new Request('http://x/api/admin/location/suivi?vue=tableau&annee=n%27importe'));
    expect(donneesTableau.mock.calls[1][0]).toBe(new Date().getFullYear());
    expect(donneesTableau.mock.calls[1][1]).toBe(true);
  });
  it('une action inconnue ou un corps illisible : 400', async () => {
    expect((await poster({ action: 'supprimer' })).status).toBe(400);
    expect((await POST(new Request('http://x', { method: 'POST', body: '{' }))).status).toBe(400);
  });
});
