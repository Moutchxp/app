import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴🔴 LOT NEW-EVENEMENT-PROPRE (04/11/2026) — OUVRIR UN MAIL ÉTEINT LE « NEW » DE SON OU SES ÉVÉNEMENTS.
 * Le marquage Gmail est doublé : ce fichier éprouve la ROUTE (qui écrit quoi, et quand), pas Gmail.
 */
const gardeMock = vi.fn(async (..._a: unknown[]) => null as Response | null);
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'collegue' }) }));
const marquer = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', lu: true } as Record<string, unknown>));
vi.mock('../../../../../../../lib/gestion/lectureGmailReel', () => ({
  depsMarquageGmail: () => ({}), marquerFilGmail: (...a: unknown[]) => marquer(...a),
}));
const vu = vi.fn(async (..._a: unknown[]) => 1);
vi.mock('../../../../../../../lib/gestion/nouveauteEvenement', () => ({ vuParLeMail: (...a: unknown[]) => vu(...a) }));

const { POST } = await import('./route');
const appel = (corps: unknown, id = '5881') => POST(
  new Request('http://x/api/admin/gestion/fils/5881/lecture', { method: 'POST', body: JSON.stringify(corps) }),
  { params: Promise.resolve({ id }) });

beforeEach(() => { marquer.mockClear(); vu.mockClear(); gardeMock.mockClear(); });

describe('🔴 ouvrir le mail (lu) éteint le « New » ; « non lu » ne le rallume pas', () => {
  it('lu : Gmail marqué lu ET l’événement vu, au nom de qui a ouvert', async () => {
    const r = await appel({ lu: true });
    expect(r.status).toBe(200);
    expect(marquer).toHaveBeenCalledWith({}, 5881, true);
    expect(vu).toHaveBeenCalledWith(5881, 'collegue');
  });

  it('non lu (geste humain) : Gmail seulement, l’événement n’est pas touché', async () => {
    marquer.mockResolvedValueOnce({ etat: 'ok', lu: false });
    await appel({ lu: false });
    expect(marquer).toHaveBeenCalledWith({}, 5881, false);
    expect(vu).not.toHaveBeenCalled();
  });

  it('Gmail injoignable : le mail a été ouvert ICI, le « New » s’éteint quand même', async () => {
    marquer.mockResolvedValueOnce({ etat: 'sans_connexion' });
    const r = await appel({ lu: true });
    expect(r.status).toBe(409);
    expect(vu).toHaveBeenCalledWith(5881, 'collegue');
  });

  it('un échec de l’événement ne fait pas échouer la lecture du mail', async () => {
    vu.mockRejectedValueOnce(new Error('base'));
    const r = await appel({ lu: true });
    expect(r.status).toBe(200);
    expect(marquer).toHaveBeenCalled();
  });

  it('appel malformé : rien n’est écrit, ni dans Gmail ni en base', async () => {
    expect((await appel({})).status).toBe(400);
    expect((await appel({ lu: true }, 'abc')).status).toBe(400);
    expect(marquer).not.toHaveBeenCalled();
    expect(vu).not.toHaveBeenCalled();
  });
});
