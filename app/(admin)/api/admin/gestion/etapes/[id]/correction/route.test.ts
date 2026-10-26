import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
vi.mock('../../../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 4, libelle: 'Arnaud' }) }));
const repo = {
  corrigerEtape: vi.fn(), changerPresenceEtape: vi.fn(), revenirAuClassementAutomatique: vi.fn(),
};
vi.mock('../../../../../../../lib/gestion/etapeCorrectionRepo', () => ({
  corrigerEtape: (...a: unknown[]) => repo.corrigerEtape(...a),
  changerPresenceEtape: (...a: unknown[]) => repo.changerPresenceEtape(...a),
  revenirAuClassementAutomatique: (...a: unknown[]) => repo.revenirAuClassementAutomatique(...a),
}));

import { PATCH } from './route';

/** LOT FRISE-CORRECTION-MANUELLE — la route de correction : ce qui est transmis, ce qui est rendu. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corps: unknown) => new Request('http://local/x', { method: 'PATCH', body: JSON.stringify(corps) });
const OK = { ok: true, ouvertAvant: null, ouvertApres: null };

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  for (const f of Object.values(repo)) { f.mockReset(); f.mockResolvedValue(OK); }
});

describe('la route de correction', () => {
  it('exige un compte actif « gestion » ; refusée → aucun geste', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await PATCH(req({ geste: 'retirer' }), ctx('596'))).status).toBe(403);
    expect(repo.changerPresenceEtape).not.toHaveBeenCalled();
  });

  it('corriger : transmet la nature, le titre, le jour et l’auteur', async () => {
    const res = await PATCH(req({ geste: 'corriger', type: 'rdv_intervention', titre: 'RDV', jour: '2026-10-28' }), ctx('596'));
    expect(repo.corrigerEtape).toHaveBeenCalledWith({
      id: 596, auteur: { id: 4, libelle: 'Arnaud' }, voulu: { type: 'rdv_intervention', titre: 'RDV', jour: '2026-10-28' },
    });
    expect(await res.json()).toMatchObject({ etat: 'ok', message: 'Correction enregistrée.', etatEvenement: null });
  });

  it('retirer / remettre / revenir à l’automatique', async () => {
    await PATCH(req({ geste: 'retirer' }), ctx('596'));
    expect(repo.changerPresenceEtape).toHaveBeenLastCalledWith(596, 'retire', { id: 4, libelle: 'Arnaud' });
    await PATCH(req({ geste: 'remettre' }), ctx('596'));
    expect(repo.changerPresenceEtape).toHaveBeenLastCalledWith(596, 'vif', { id: 4, libelle: 'Arnaud' });
    await PATCH(req({ geste: 'automatique' }), ctx('596'));
    expect(repo.revenirAuClassementAutomatique).toHaveBeenCalledWith(596, { id: 4, libelle: 'Arnaud' });
  });

  it('un retrait qui change l’état le dit à l’écran (etatEvenement)', async () => {
    repo.changerPresenceEtape.mockResolvedValue({ ok: true, ouvertAvant: true, ouvertApres: false });
    const d = await (await PATCH(req({ geste: 'retirer' }), ctx('596'))).json() as { etatEvenement: string; message: string };
    expect(d.etatEvenement).toBe('traite');
    expect(d.message).toContain('clôturé');
  });

  it('sans la migration 429 → 409 avec le motif et le drapeau, rien d’autre', async () => {
    repo.corrigerEtape.mockResolvedValue({ ok: false, motif: 'disponible après la mise à jour', code: 'sans_schema' });
    const res = await PATCH(req({ geste: 'corriger', type: 'note' }), ctx('596'));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ sansSchema: true });
  });

  it('identifiant absurde, geste inconnu, nature absente → 400 sans toucher la base', async () => {
    expect((await PATCH(req({ geste: 'retirer' }), ctx('abc'))).status).toBe(400);
    expect((await PATCH(req({ geste: 'effacer' }), ctx('596'))).status).toBe(400);
    expect((await PATCH(req({ geste: 'corriger' }), ctx('596'))).status).toBe(400);
    expect(repo.corrigerEtape).not.toHaveBeenCalled();
  });
});
