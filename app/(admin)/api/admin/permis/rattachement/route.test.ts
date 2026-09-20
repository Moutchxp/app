import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * M5-fix — CONTRAT front → route. Le front envoie `dossierId` tel qu'il l'a reçu de l'API : un `bigint` PostgreSQL, que le pilote
 * `pg` renvoie en CHAÎNE. Ce test POSTe donc un dossierId EN CHAÎNE (la réalité runtime) et vérifie que la route l'ACCEPTE et le
 * transmet en NOMBRE aux fonctions métier — au lieu de le rejeter « requête invalide ». Il aurait échoué avant le correctif.
 * On mocke la garde et les fonctions métier : on teste UNIQUEMENT le passage/validation de la requête, pas le métier.
 */
// RATT-EDIT (lot B3/C1) — état HOISTÉ configurable : refus de capacité (exigerCapaciteModif) + résultats de revaliderRattachement / restaurerVersionGel.
const H = vi.hoisted(() => ({
  refusModif: null as Response | null,
  revalResult: { ok: true, versionGel: 4 } as { ok: boolean; versionGel?: number; motif?: string; manque?: string },
  restauResult: { ok: true, versionGel: 8, nbCorps: 1, nbEmprises: 1 } as { ok: boolean; versionGel?: number; motif?: string; nbCorps?: number; nbEmprises?: number },
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({
  exigerAdministrateur: async () => ({ admin: { id: 1 } }),
  exigerCapaciteModif: async () => H.refusModif, // null = autorisé ; Response = refus (403), URL directe comprise
}));
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
  revaliderRattachement: vi.fn(async () => H.revalResult),
}));
vi.mock('../../../../../lib/permis/restaurationGel', () => ({
  restaurerVersionGel: vi.fn(async () => H.restauResult),
}));
vi.mock('../../../../../lib/permis/rattachementConfig', () => ({
  lireDaactDeclencheurActif: async () => true,
  ecrireDaactDeclencheurActif: async () => true,
}));

import { POST } from './route';
import { ouvrirRattachementManuel } from '../../../../../lib/permis/rattachementSuiviRepo';
import { affecterPolygone } from '../../../../../lib/permis/affectationRepo';
import { validerRattachement, revaliderRattachement } from '../../../../../lib/permis/actionsRattachement';
import { restaurerVersionGel } from '../../../../../lib/permis/restaurationGel';

const post = (body: unknown) => POST(new Request('http://test.local/api/admin/permis/rattachement', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

beforeEach(() => { vi.clearAllMocks(); H.refusModif = null; H.revalResult = { ok: true, versionGel: 4 }; H.restauResult = { ok: true, versionGel: 8, nbCorps: 1, nbEmprises: 1 }; });

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

describe('B3 — action « revalider »', () => {
  it('avec la capacité → 200, revaliderRattachement appelé (dossierId en number), renvoie versionGel', async () => {
    const res = await post({ action: 'revalider', dossierId: '531' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, versionGel: 4 });
    expect((revaliderRattachement as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe(531);
  });

  it('SANS la capacité (exigerCapaciteModif refuse) → 403, revalidation NON tentée (garde serveur, URL directe comprise)', async () => {
    H.refusModif = Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 });
    const res = await post({ action: 'revalider', dossierId: '531' });
    expect(res.status).toBe(403);
    expect(revaliderRattachement).not.toHaveBeenCalled();
  });

  it('refus métier (corps non enregistré → manque:enregistrement) → 409, message + manque relayés', async () => {
    H.revalResult = { ok: false, motif: 'Bâtiment(s) à enregistrer…', manque: 'enregistrement' };
    const res = await post({ action: 'revalider', dossierId: '531' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ erreur: expect.stringMatching(/enregistrer/i), manque: 'enregistrement' });
  });
});

describe('C1 — action « restaurer »', () => {
  it('avec la capacité + gelId valide → 200, restaurerVersionGel appelé (dossierId + gelId en number), renvoie versionGel/nbCorps/nbEmprises', async () => {
    const res = await post({ action: 'restaurer', dossierId: '531', gelId: '17' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, versionGel: 8, nbCorps: 1, nbEmprises: 1 });
    const call = (restaurerVersionGel as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call[0]).toBe(531); expect(call[1]).toBe(17);
  });

  it('SANS la capacité → 403, restauration NON tentée (URL directe comprise)', async () => {
    H.refusModif = Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 });
    const res = await post({ action: 'restaurer', dossierId: '531', gelId: '17' });
    expect(res.status).toBe(403);
    expect(restaurerVersionGel).not.toHaveBeenCalled();
  });

  it('gelId absent/non numérique → 400, restauration non tentée', async () => {
    const res = await post({ action: 'restaurer', dossierId: '531' });
    expect(res.status).toBe(400);
    expect(restaurerVersionGel).not.toHaveBeenCalled();
  });

  it('refus métier (version introuvable/sans snapshot) → 409', async () => {
    H.restauResult = { ok: false, motif: 'version de gel introuvable pour ce permis' };
    const res = await post({ action: 'restaurer', dossierId: '531', gelId: '17' });
    expect(res.status).toBe(409);
  });
});
