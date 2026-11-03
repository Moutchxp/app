import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 🔴 D35 — les fonctions datées et l'activité principale (salaire) : RÉSERVÉES AUX ADMINISTRATEURS ; seuls `fonctions`, `principale`, `depuis` sont lus. */
vi.mock('server-only', () => ({}));
const exigerAdministrateur = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur: (...a: unknown[]) => exigerAdministrateur(...a) }));
vi.mock('../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'Arnaud Jorel' }) }));
const definirFonctions = vi.fn();
const lireFonctions = vi.fn();
vi.mock('../../../../../../lib/admin/fonctionsCompte', async () => ({ ...(await vi.importActual<object>('../../../../../../lib/admin/fonctionsCompteModele')),
  definirFonctions: (...a: unknown[]) => definirFonctions(...a), lireFonctions: (...a: unknown[]) => lireFonctions(...a) }));
vi.mock('../../../../../../lib/admin/schemaDroits', () => ({ fonctionsComptesDisponible: async () => true }));
const { GET, POST } = await import('./route');

const appeler = (corps: unknown, id = '5') => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(corps) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  exigerAdministrateur.mockReset().mockResolvedValue({ auteurId: 2 });
  definirFonctions.mockReset().mockResolvedValue({ ok: true, change: true });
  lireFonctions.mockReset().mockResolvedValue({ valeur: ['location'], disponible: true, deduites: [] });
});

describe('/api/admin/comptes/[id]/fonctions — D35', () => {
  it('🔴 un non-administrateur est refusé (lecture et écriture), rien n’est écrit', async () => {
    exigerAdministrateur.mockResolvedValue({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await appeler({ fonctions: ['gestion'], principale: 'gestion', depuis: '2027-11-16' })).status).toBe(403);
    expect((await GET(new Request('http://x'), { params: Promise.resolve({ id: '5' }) })).status).toBe(403);
    expect(definirFonctions).not.toHaveBeenCalled();
    expect(lireFonctions).not.toHaveBeenCalled();
  });
  it('Location → Gestion à compter du 16 : posé avec l’auteur ; seuls fonctions / principale / depuis sont lus', async () => {
    expect((await appeler({ fonctions: ['gestion'], principale: 'gestion', depuis: '2027-11-16', role: 'administrateur' })).status).toBe(200);
    expect(definirFonctions).toHaveBeenCalledWith(5, { fonctions: ['gestion'], principale: 'gestion', depuis: '2027-11-16' }, 2, 'Arnaud Jorel');
  });
  it('un appel d’avant (fonctions seules) : inchangé', async () => {
    expect((await appeler({ fonctions: ['vente'] })).status).toBe(200);
    expect(definirFonctions).toHaveBeenCalledWith(5, ['vente'], 2, 'Arnaud Jorel');
  });
  it('principale ou date invalides : 422 ; un refus de la règle : 422 avec son motif ; compte introuvable : 404', async () => {
    expect((await appeler({ fonctions: ['vente'], principale: 'compta' })).status).toBe(422);
    expect((await appeler({ fonctions: ['vente'], principale: 'vente', depuis: '16/11/2027' })).status).toBe(422);
    definirFonctions.mockResolvedValue({ ok: false, change: false, motif: 'Choisissez l’activité principale (salaire) parmi les fonctions cochées.' });
    const r = await appeler({ fonctions: ['vente', 'location'], principale: null, depuis: '2027-11-16' });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { erreur: string }).erreur).toContain('activité principale');
    definirFonctions.mockResolvedValue({ ok: false, change: false, introuvable: true });
    expect((await appeler({ fonctions: ['vente'], principale: 'vente', depuis: '2027-11-16' })).status).toBe(404);
  });
});
