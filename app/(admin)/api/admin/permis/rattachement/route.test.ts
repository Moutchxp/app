import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * M5-fix — CONTRAT front → route. Le front envoie `dossierId` tel qu'il l'a reçu de l'API : un `bigint` PostgreSQL, que le pilote
 * `pg` renvoie en CHAÎNE. Ce test POSTe donc un dossierId EN CHAÎNE (la réalité runtime) et vérifie que la route l'ACCEPTE et le
 * transmet en NOMBRE aux fonctions métier — au lieu de le rejeter « requête invalide ». Il aurait échoué avant le correctif.
 * On mocke la garde et les fonctions métier : on teste UNIQUEMENT le passage/validation de la requête, pas le métier.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: async () => ({ admin: { id: 1 } }) }));
vi.mock('../../../../../lib/permis/rattachementSuiviRepo', () => ({
  listerSuivi: async () => ({ lignes: [], compteurs: {} }),
  lireDetailSuivi: async () => ({ dossierId: 11430 }),
  ouvrirRattachementManuel: vi.fn(async () => ({ ok: true, rattId: 1 })),
}));
vi.mock('../../../../../lib/permis/affectationRepo', () => ({
  lireComparaison: async () => ({}),
  affecterPolygone: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../../../../lib/permis/actionsRattachement', () => ({
  validerRattachement: vi.fn(async () => ({ ok: true })),
  refuserRattachement: vi.fn(async () => ({ ok: true })),
  retourLidar: vi.fn(async () => ({ ok: true })),
}));
vi.mock('../../../../../lib/permis/rattachementConfig', () => ({
  lireDaactDeclencheurActif: async () => true,
  ecrireDaactDeclencheurActif: async () => true,
}));

import { POST } from './route';
import { ouvrirRattachementManuel } from '../../../../../lib/permis/rattachementSuiviRepo';
import { affecterPolygone } from '../../../../../lib/permis/affectationRepo';
import { validerRattachement } from '../../../../../lib/permis/actionsRattachement';

const post = (body: unknown) => POST(new Request('http://test.local/api/admin/permis/rattachement', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe('M5-fix — route POST : dossierId en CHAÎNE (bigint pg) est accepté et transmis en NOMBRE', () => {
  it('ouvrir_manuel { dossierId: "11430" } → 200, et la fonction reçoit 11430 (number)', async () => {
    const res = await post({ action: 'ouvrir_manuel', dossierId: '11430', motif: 'test' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(ouvrirRattachementManuel).toHaveBeenCalledWith(11430, 'test', expect.any(String));
    expect(typeof (ouvrirRattachementManuel as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe('number');
  });

  it('affecter { dossierId: "11430" } → 200, dossierId transmis en number (M2 était cassé pareil)', async () => {
    const res = await post({ action: 'affecter', dossierId: '11430', corpsId: 1, cleabs: 'BAT_A', operation: 'ajout' });
    expect(res.status).toBe(200);
    expect(affecterPolygone).toHaveBeenCalledWith(11430, 1, 'BAT_A', 'ajout', expect.any(String));
  });

  it('valider { dossierId: "11430" } → 200, dossierId transmis en number (M3 était cassé pareil)', async () => {
    const res = await post({ action: 'valider', dossierId: '11430', cotes: { BAT_A: 88.9 } });
    expect(res.status).toBe(200);
    expect((validerRattachement as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe(11430);
  });

  it('dossierId ABSENT → 400 « requête invalide » (la garde tient toujours)', async () => {
    const res = await post({ action: 'ouvrir_manuel', motif: 'test' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ erreur: 'requête invalide' });
    expect(ouvrirRattachementManuel).not.toHaveBeenCalled();
  });

  it('dossierId NON numérique ("abc") → 400 « requête invalide »', async () => {
    const res = await post({ action: 'ouvrir_manuel', dossierId: 'abc', motif: 'test' });
    expect(res.status).toBe(400);
    expect(ouvrirRattachementManuel).not.toHaveBeenCalled();
  });
});
