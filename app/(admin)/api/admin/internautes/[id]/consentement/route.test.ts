import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks des dépendances de la route : on teste l'ORCHESTRATION (garde admin, validation, mapping des statuts → HTTP)
// sans charger NI la base NI `cycleVie` (server-only + pool pg). `textesConsentement` est PUR → laissé réel (la liste
// fermée des finalités vient donc du vrai catalogue, pas d'une invention).
vi.mock('server-only', () => ({}));
const { exigerAdministrateur } = vi.hoisted(() => ({ exigerAdministrateur: vi.fn() }));
const { retirerConsentement } = vi.hoisted(() => ({ retirerConsentement: vi.fn() }));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur }));
vi.mock('../../../../../../lib/internaute/cycleVie', () => ({ retirerConsentement }));

import { PATCH } from './route';

const UUID = '11111111-1111-1111-1111-111111111111';
const req = (body: unknown) => ({ json: async () => body }) as unknown as Request;
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  exigerAdministrateur.mockReset();
  retirerConsentement.mockReset();
  exigerAdministrateur.mockResolvedValue({ auteurId: 5 }); // admin authentifié par défaut
});

describe('PATCH /api/admin/internautes/[id]/consentement — retrait admin', () => {
  it('non-admin → refus renvoyé tel quel (aucun retrait)', async () => {
    exigerAdministrateur.mockResolvedValue({ refus: Response.json({ erreur: 'interdit' }, { status: 403 }) });
    const res = await PATCH(req({ finalite: 'email_marketing', aLaDemandeDe: 'admin' }), ctx(UUID));
    expect(res.status).toBe(403);
    expect(retirerConsentement).not.toHaveBeenCalled();
  });

  it('id non-UUID → 404, aucun retrait', async () => {
    const res = await PATCH(req({ finalite: 'email_marketing', aLaDemandeDe: 'admin' }), ctx('pas-un-uuid'));
    expect(res.status).toBe(404);
    expect(retirerConsentement).not.toHaveBeenCalled();
  });

  it('finalite hors liste fermée → 422, aucun retrait', async () => {
    const res = await PATCH(req({ finalite: 'inconnue', aLaDemandeDe: 'admin' }), ctx(UUID));
    expect(res.status).toBe(422);
    expect(retirerConsentement).not.toHaveBeenCalled();
  });

  it('aLaDemandeDe hors enum → 422', async () => {
    const res = await PATCH(req({ finalite: 'email_marketing', aLaDemandeDe: 'quelquun' }), ctx(UUID));
    expect(res.status).toBe(422);
    expect(retirerConsentement).not.toHaveBeenCalled();
  });

  it('nominal : retrait effectué → 200, appel avec (id, finalite, auteurId, contexte)', async () => {
    retirerConsentement.mockResolvedValue({ retire: true });
    const res = await PATCH(req({ finalite: 'email_marketing', aLaDemandeDe: 'internaute', motif: 'désabo' }), ctx(UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, retire: true });
    expect(retirerConsentement).toHaveBeenCalledWith(UUID, 'email_marketing', 5, { aLaDemandeDe: 'internaute', motif: 'désabo' });
  });

  it('IDEMPOTENT : déjà inactive → 200 { retire:false, deja:true } (succès, pas une erreur)', async () => {
    retirerConsentement.mockResolvedValue({ retire: false, raison: 'deja_inactif' });
    const res = await PATCH(req({ finalite: 'email_marketing', aLaDemandeDe: 'admin' }), ctx(UUID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, retire: false, deja: true });
  });

  it('profil introuvable / effacé → 404', async () => {
    retirerConsentement.mockResolvedValue({ retire: false, raison: 'introuvable' });
    const res = await PATCH(req({ finalite: 'email_marketing', aLaDemandeDe: 'admin' }), ctx(UUID));
    expect(res.status).toBe(404);
  });
});
