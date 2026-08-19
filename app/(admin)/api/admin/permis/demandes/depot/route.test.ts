import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * S16 / FUS-4 ② — POST /api/admin/permis/demandes/depot : « Marquer comme déposée » (téléservice). On MOCKE marquerDeposee
 * (+ garde + retenter). APRÈS le dépôt COMMITTÉ, si une référence (collée depuis l'accusé) est fournie, on re-tente le
 * rattachement différé des messages de la mairie déjà arrivés — dans un try/catch ISOLÉ : le dépôt n'est JAMAIS défait, et
 * retenter voit le NOUVEAU statut 'envoyee' (garde d'ambiguïté). db/client mocké (aucune DB).
 */
vi.mock('../../../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn() }));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/demandeRepo', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, marquerDeposee: vi.fn(), listerADeposer: vi.fn() }; // DepotInterditError reste la VRAIE classe (instanceof)
});
vi.mock('../../../../../../lib/veille/demandeReponseRepo', () => ({ retenterRattachementParReference: vi.fn() })); // FUS-4 ②

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { marquerDeposee, DepotInterditError } from '../../../../../../lib/sitadel/demandeRepo';
import { retenterRattachementParReference } from '../../../../../../lib/veille/demandeReponseRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const deposer = marquerDeposee as unknown as ReturnType<typeof vi.fn>;
const retenter = retenterRattachementParReference as unknown as ReturnType<typeof vi.fn>;
const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/demandes/depot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => { vi.clearAllMocks(); garde.mockResolvedValue({ auteurId: 5 }); deposer.mockResolvedValue(undefined); retenter.mockResolvedValue(0); });

describe('S16 — POST depot : gardes et dépôt', () => {
  it('non-administrateur → 403, aucun dépôt', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await post({ id: 119, reference: 'X' })).status).toBe(403);
    expect(deposer).not.toHaveBeenCalled();
    expect(retenter).not.toHaveBeenCalled();
  });

  it('id invalide → 400 (aucun dépôt, aucun re-rattachement)', async () => {
    expect((await post({ id: 'x', reference: 'X' })).status).toBe(400);
    expect(deposer).not.toHaveBeenCalled();
    expect(retenter).not.toHaveBeenCalled();
  });

  it('canal non-formulaire → DepotInterditError → 409, aucun re-rattachement', async () => {
    deposer.mockRejectedValueOnce(new DepotInterditError('le dépôt manuel est réservé au canal formulaire'));
    const res = await post({ id: 1, reference: 'SLC260818242370' });
    expect(res.status).toBe(409);
    expect(retenter).not.toHaveBeenCalled(); // le dépôt a échoué → on ne re-rattache rien
  });
});

describe('FUS-4 ② — POST depot déclenche le re-rattachement différé (isolé du dépôt, APRÈS commit)', () => {
  it('dépôt avec référence citée par un message non rattaché → retenter (id, réf trimée, auteur), 1 rattaché renvoyé', async () => {
    retenter.mockResolvedValueOnce(1);
    const res = await post({ id: 233, reference: ' SLC260818242370 ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rattaches: 1 });
    // marquerDeposee reçoit la référence (greffe interne) ; retenter reçoit la référence TRIMÉE + l'auteur (auteurId 5).
    expect(deposer).toHaveBeenCalledWith(233, '5', ' SLC260818242370 ');
    expect(retenter).toHaveBeenCalledWith(233, 'SLC260818242370', '5');
  });

  it('le statut vu par la garde est bien « envoyee » : retenter est appelé APRÈS marquerDeposee (post-commit)', async () => {
    retenter.mockResolvedValueOnce(1);
    await post({ id: 233, reference: 'SLC260818242370' });
    // preuve d'ORDONNANCEMENT : le dépôt (→ statut 'envoyee', committé) précède le re-rattachement → la garde d'ambiguïté
    //   (statut IN ('envoyee','close')) voit bien le nouveau statut.
    expect(deposer.mock.invocationCallOrder[0]).toBeLessThan(retenter.mock.invocationCallOrder[0]);
  });

  it('dépôt SANS référence → aucun appel à retenter', async () => {
    const res = await post({ id: 119 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rattaches: 0 });
    expect(deposer).toHaveBeenCalledWith(119, '5', undefined);
    expect(retenter).not.toHaveBeenCalled();
  });

  it('référence vide/espaces → aucun appel à retenter (trim → chaîne vide)', async () => {
    await post({ id: 119, reference: '   ' });
    expect(retenter).not.toHaveBeenCalled();
  });

  it('ambiguïté (retenter renvoie 0) → 0 rattaché, dépôt acquis', async () => {
    retenter.mockResolvedValueOnce(0); // garde d'ambiguïté interne de retenter → aucun rattachement
    const res = await post({ id: 233, reference: 'SLC260818242370' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rattaches: 0 });
    expect(deposer).toHaveBeenCalledTimes(1); // le dépôt a bien eu lieu
  });

  it('🔴 échec ISOLÉ du re-rattachement → dépôt acquis, réponse 200 {ok:true, rattaches:0}, échec journalisé', async () => {
    retenter.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '42P01' }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post({ id: 233, reference: 'SLC260818242370' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rattaches: 0 }); // dégradé : 0, mais le dépôt est PRÉSERVÉ
    expect(deposer).toHaveBeenCalledTimes(1);                       // dépôt jamais mis en péril
    expect(spy).toHaveBeenCalled();                                 // échec journalisé, jamais muet
    spy.mockRestore();
  });
});
