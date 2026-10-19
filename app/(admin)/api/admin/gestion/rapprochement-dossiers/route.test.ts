import { beforeEach, describe, expect, it, vi } from 'vitest';

/** /api/admin/gestion/rapprochement-dossiers — réservé à l'administrateur ; les gestes passent par le dépôt. Rien de réel. */
vi.mock('server-only', () => ({}));
let admin = true;
vi.mock('../../../../../lib/admin/garde', () => ({
  exigerAdministrateur: async () => (admin ? { auteurId: 1 } : { refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) }),
}));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 1, libelle: 'Arno' }) }));
const decider = vi.fn(async () => ({ ok: true }));
const masse = vi.fn(async () => ({ ok: false, motif: 'Le contrôle à l’œil n’est pas terminé : 3 validé(s) sur 20.' }));
const chercher = vi.fn(async () => [{ id: 9, nom: 'FICHE', detail: null }]);
vi.mock('../../../../../lib/gestion/rapprochementDossiersRepo', () => ({
  lireRapprochement: async () => ({ etat: 'ok', calcul: '2026-10-19', lignes: [] }),
  deciderRapprochement: (...a: unknown[]) => decider(...(a as [])),
  validerTousLesSurs: (...a: unknown[]) => masse(...(a as [])),
  chercherFiches: (...a: unknown[]) => chercher(...(a as [])),
}));
const { GET, POST } = await import('./route');
const URL_API = 'http://localhost/api/admin/gestion/rapprochement-dossiers';
const poster = (corps: unknown) => POST(new Request(URL_API, { method: 'POST', body: JSON.stringify(corps) }));

beforeEach(() => { admin = true; decider.mockClear(); masse.mockClear(); });

describe('rapprochement des dossiers clients — la route', () => {
  it('un non-administrateur est refusé (403), en lecture comme en écriture, sans toucher au dépôt', async () => {
    admin = false;
    expect((await GET(new Request(URL_API))).status).toBe(403);
    expect((await poster({ action: 'decider', propositionId: 1, geste: 'valider' })).status).toBe(403);
    expect(decider).not.toHaveBeenCalled();
  });
  it('GET : les lignes et le plan du lot suivant ; GET ?q= : la recherche de fiche', async () => {
    const j = await (await GET(new Request(URL_API))).json();
    expect(j).toEqual({ etat: 'ok', data: { calcul: '2026-10-19', lignes: [], plan: expect.objectContaining({ deplacements: [], nonDecides: 0 }) } });
    expect(await (await GET(new Request(`${URL_API}?q=fic`))).json()).toEqual({ etat: 'ok', data: [{ id: 9, nom: 'FICHE', detail: null }] });
  });
  it('POST decider : transmet la proposition, le geste, la fiche et l’auteur ; un geste inconnu est refusé', async () => {
    expect((await poster({ action: 'decider', propositionId: 4, geste: 'corriger', proprietaireId: 77 })).status).toBe(200);
    expect(decider).toHaveBeenCalledWith(4, 'corriger', 77, { id: 1, libelle: 'Arno' });
    expect((await poster({ action: 'decider', propositionId: 4, geste: 'effacer' })).status).toBe(400);
  });
  it('POST valider-surs : le refus du dépôt (contrôle incomplet) est rendu tel quel (409)', async () => {
    const r = await poster({ action: 'valider-surs' });
    expect(r.status).toBe(409);
    expect((await r.json()).motif).toMatch(/3 validé\(s\) sur 20/);
  });
});
