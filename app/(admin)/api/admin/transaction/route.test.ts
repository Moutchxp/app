import { beforeEach, describe, expect, it, vi } from 'vitest';

/** TUILE « TRANSACTION » — la route : double barrière, lectures sans migration, refus lisibles, gestes transmis au dépôt. */
vi.mock('server-only', () => ({}));
const garde = vi.fn();
vi.mock('../../../../lib/transaction/garde', () => ({ exigerTransaction: () => garde() }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'arno' }) }));
const repo = {
  transactionDisponible: vi.fn(), lireVentes: vi.fn(), lireRetrocessions: vi.fn(), lireARattacher: vi.fn(), lireGestion: vi.fn(), lireJournal: vi.fn(),
  creerVente: vi.fn(), modifierVente: vi.fn(), retirerVente: vi.fn(), rattacherRetro: vi.fn(), saisirRetro: vi.fn(), enregistrerGestion: vi.fn(), annulerGeste: vi.fn(),
};
vi.mock('../../../../lib/transaction/repo', () => repo);
vi.mock('../../../../lib/transaction/locationLue', () => ({ lireCaLocation: async () => ({ '2025-03': 100 }) }));

const { GET, POST } = await import('./route');
const get = (q: string) => GET(new Request(`http://x/api/admin/transaction?${q}`));
const post = (corps: unknown) => POST(new Request('http://x/api/admin/transaction', { method: 'POST', body: JSON.stringify(corps) }));

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 3 });
  repo.transactionDisponible.mockResolvedValue(true);
  for (const f of [repo.lireVentes, repo.lireRetrocessions, repo.lireARattacher, repo.lireGestion, repo.lireJournal]) f.mockResolvedValue([]);
});

describe('la barrière', () => {
  it('un refus de la garde est rendu tel quel, sans lecture ni écriture', async () => {
    garde.mockResolvedValue({ refus: new Response('interdit', { status: 403 }) });
    expect((await get('vue=societe&societe=macj')).status).toBe(403);
    expect((await post({ action: 'annuler', journalId: 1 })).status).toBe(403);
    expect(repo.lireVentes).not.toHaveBeenCalled();
    expect(repo.annulerGeste).not.toHaveBeenCalled();
  });
});

describe('les lectures', () => {
  it('sans la migration : listes vides, « disponible: false » ; la location reste lue', async () => {
    repo.transactionDisponible.mockResolvedValue(false);
    const s = await (await get('vue=societe&societe=criterimmo')).json();
    expect(s.data).toMatchObject({ disponible: false, ventes: [], retrocessions: [], aRattacher: [] });
    const g = await (await get('vue=global')).json();
    expect(g.data).toMatchObject({ disponible: false, ventes: [], gestion: [], location: { '2025-03': 100 } });
    expect(repo.lireVentes).not.toHaveBeenCalled();
  });
  it('une société inconnue, une entité de journal inconnue : 400', async () => {
    expect((await get('vue=societe&societe=autre')).status).toBe(400);
    expect((await get('vue=journal&entite=admin_utilisateur&id=1')).status).toBe(400);
  });
});

describe('les gestes', () => {
  it('une saisie illisible est refusée (422) avec son motif, sans écrire', async () => {
    const r = await post({ action: 'vente-saisir', vente: { societe: 'macj', libelle: '', honorairesTtc: 1, statut: 'vendue', annee: 2025 } });
    expect(r.status).toBe(422);
    expect((await r.json()).motif).toMatch(/libellé/);
    expect(repo.creerVente).not.toHaveBeenCalled();
  });
  it('le rattachement d’une rétrocession passe la vente (ou null : « à répartir ») et l’auteur', async () => {
    repo.rattacherRetro.mockResolvedValue({ ok: true });
    expect((await post({ action: 'retro-rattacher', id: 4, venteId: null })).status).toBe(200);
    expect(repo.rattacherRetro).toHaveBeenCalledWith(4, null, { id: 3, libelle: 'arno' });
    await post({ action: 'retro-rattacher', id: 4, venteId: 12 });
    expect(repo.rattacherRetro).toHaveBeenLastCalledWith(4, 12, { id: 3, libelle: 'arno' });
  });
  it('la gestion du mois : mois invalide refusé ; sinon transmise lue', async () => {
    expect((await post({ action: 'gestion-enregistrer', annee: 2025, mois: 13, gestion: {} })).status).toBe(400);
    repo.enregistrerGestion.mockResolvedValue({ ok: true });
    await post({ action: 'gestion-enregistrer', annee: 2025, mois: 5, gestion: { nbLots: '286', honorairesHt: '15345,12' } });
    expect(repo.enregistrerGestion).toHaveBeenCalledWith(2025, 5, { nbLots: 286, honorairesHt: 15345.12, adhocHt: null, salarieHt: null, resteHt: null, note: null }, { id: 3, libelle: 'arno' });
  });
  it('action inconnue : 400', async () => {
    expect((await post({ action: 'supprimer', id: 1 })).status).toBe(400);
  });
});
