import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * PROJ-2c — route de la file Projection : GET liste, POST valider (refus 409 si projection incomplète, sinon avance + renvoie la file).
 * Garde et repo mockés ; on teste le passage/validation de la requête et le mapping des résultats.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: async () => ({ admin: { id: 1 } }) }));
vi.mock('../../../../../lib/sitadel/veilleConfig', () => ({ chargerConfigVeille: async () => ({}) }));
vi.mock('../../../../../lib/permis/projectionFileRepo', () => ({
  listerFileProjection: async () => [{ dossierId: 11434, numDau: 'PC1', communeNom: 'Paris', natureLibelle: 'Construction neuve', nbBatiments: 2, satisfaitLe: '2026-07-01' }],
  validerProjection: vi.fn(async () => ({ ok: true, marqueSuivi: true })),
}));

import { GET, POST } from './route';
import { validerProjection } from '../../../../../lib/permis/projectionFileRepo';

const get = () => GET(new Request('http://test.local/api/admin/permis/projection'));
const post = (body: unknown) => POST(new Request('http://test.local/api/admin/permis/projection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => { vi.clearAllMocks(); });

describe('PROJ-2c — route projection', () => {
  it('GET → la file', async () => {
    const j = await (await get()).json();
    expect(j.file).toHaveLength(1);
    expect(j.file[0].numDau).toBe('PC1');
  });

  it('POST valider (dossierId chaîne bigint) → coercé, validerProjection appelé, file renvoyée', async () => {
    const res = await post({ action: 'valider', dossierId: '11434' });
    expect(res.status).toBe(200);
    expect(validerProjection).toHaveBeenCalledWith(11434, 'admin:projection');
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.marqueSuivi).toBe(true);
    expect(j.file).toHaveLength(1);
  });

  it('projection incomplète → 409', async () => {
    (validerProjection as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ ok: false, motif: 'projection incomplète — 2 bâtiments · 1 emprise tracée · 1 en attente' });
    const res = await post({ action: 'valider', dossierId: 11434 });
    expect(res.status).toBe(409);
  });

  it('dossierId invalide → 400 ; action inconnue → 400', async () => {
    expect((await post({ action: 'valider', dossierId: 'abc' })).status).toBe(400);
    expect((await post({ action: 'autre', dossierId: 11434 })).status).toBe(400);
  });
});
