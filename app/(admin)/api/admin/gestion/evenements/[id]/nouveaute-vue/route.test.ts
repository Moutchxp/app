import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 🔴🔴 LOT NEW-EVENEMENT-PROPRE — déplier la carte éteint le « New » de l'événement, sans rien écrire dans Gmail. */
const gardeMock = vi.fn(async (..._a: unknown[]) => null as Response | null);
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'collegue' }) }));
const vu = vi.fn(async (..._a: unknown[]) => 1);
vi.mock('../../../../../../../lib/gestion/nouveauteEvenement', () => ({ vuParLaCarte: (...a: unknown[]) => vu(...a) }));

const { POST } = await import('./route');
const appel = (id: string) => POST(new Request(`http://x/api/admin/gestion/evenements/${id}/nouveaute-vue`, { method: 'POST' }),
  { params: Promise.resolve({ id }) });

beforeEach(() => { vu.mockClear(); gardeMock.mockClear(); });

describe('POST /evenements/[id]/nouveaute-vue', () => {
  it('pose le seuil de l’événement, au nom de qui a déplié', async () => {
    const r = await appel('12');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ etat: 'ok', marques: 1 });
    expect(vu).toHaveBeenCalledWith(12, 'collegue');
  });

  it('identifiant invalide : 400, rien d’écrit', async () => {
    expect((await appel('0')).status).toBe(400);
    expect((await appel('x')).status).toBe(400);
    expect(vu).not.toHaveBeenCalled();
  });

  it('la garde du module passe d’abord', async () => {
    gardeMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await appel('12')).status).toBe(403);
    expect(vu).not.toHaveBeenCalled();
  });
});
