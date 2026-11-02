import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 MON ESPACE, LOT 10 — le MODE AGENCE des VRAIES routes /affaires et /empreinte, dépôt simulé : `?agence=` part vers la lecture de la
 * structure (jamais l'espace personnel), un non-administrateur reçoit 403 (le dépôt, qui relit le rôle en base, répond null), une structure
 * inconnue 400 sans rien lire, et sans `?agence=` rien ne change.
 */
const h = vi.hoisted(() => ({ garde: vi.fn(), agence: vi.fn(), empreinte: vi.fn(), perso: vi.fn(), empreintePerso: vi.fn() }));
vi.mock('../../../../../lib/mon-espace/garde', () => ({ exigerMonEspace: h.garde }));
vi.mock('../../../../../lib/mon-espace/agenceRepo', () => ({ lireAgence: h.agence, empreinteAgence: h.empreinte, MOTIF_AGENCE_ADMIN: 'Le mode agence est réservé aux administrateurs.' }));
vi.mock('../../../../../lib/mon-espace/mesAffairesRepo', () => ({ lireMesAffaires: h.perso, empreinteMesAffaires: h.empreintePerso }));
import { GET } from './route';
import { GET as GET_EMPREINTE } from '../empreinte/route';

const lire = async (q: string) => { const r = await GET(new Request(`http://local/api/admin/mon-espace/affaires${q}`)); return { status: r.status, corps: await r.json() as Record<string, unknown> }; };
const empreinte = async (q: string) => { const r = await GET_EMPREINTE(new Request(`http://local/api/admin/mon-espace/empreinte${q}`)); return { status: r.status, corps: await r.json() as Record<string, unknown> }; };
beforeEach(() => {
  h.garde.mockResolvedValue({ auteurId: 1 });
  h.agence.mockReset().mockResolvedValue({ agence: { cle: 'macj', societe: 'macj' } });
  h.empreinte.mockReset().mockResolvedValue('1,2#9');
  h.perso.mockReset().mockResolvedValue({ moi: true });
  h.empreintePerso.mockReset().mockResolvedValue('3#4');
});

describe('🔴 mode agence : /affaires et /empreinte', () => {
  it.each(['criterimmo', 'macj', 'tous'])('?agence=%s : la structure, pour le compte de la session', async (a) => {
    expect((await lire(`?agence=${a}`)).status).toBe(200);
    expect(h.agence).toHaveBeenCalledWith(1, a, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(h.perso).not.toHaveBeenCalled();
  });
  it('un non-administrateur : 403 (le dépôt répond null), aucune donnée', async () => {
    h.agence.mockResolvedValue(null);
    const r = await lire('?agence=tous');
    expect(r.status).toBe(403);
    expect(r.corps.data).toBeUndefined();
    h.empreinte.mockResolvedValue(null);
    expect((await empreinte('?agence=tous')).status).toBe(403);
  });
  it('une structure inconnue : 400, rien n’est lu', async () => {
    expect((await lire('?agence=fusion')).status).toBe(400);
    expect((await empreinte('?agence=')).status).toBe(400);
    expect(h.agence).not.toHaveBeenCalled();
    expect(h.empreinte).not.toHaveBeenCalled();
  });
  it('sans ?agence= : l’espace personnel, inchangé ; l’empreinte de la structure avec ?agence=', async () => {
    expect((await lire('')).corps).toEqual({ etat: 'ok', data: { moi: true } });
    expect((await empreinte('')).corps).toEqual({ etat: 'ok', data: { empreinte: '3#4' } });
    expect((await empreinte('?agence=macj')).corps).toEqual({ etat: 'ok', data: { empreinte: '1,2#9' } });
    expect(h.empreinte).toHaveBeenCalledWith(1, 'macj');
  });
});
