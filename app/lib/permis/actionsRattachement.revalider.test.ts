import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * RATT-EDIT (lot B3) — revaliderRattachement : la revalidation EN PLACE d'un permis modifié après validation.
 *   · GARDE DU LOT 1, SANS EXCEPTION : un corps non confirmé humainement BLOQUE la revalidation (aucun figeage) ;
 *   · sinon → APPENDE une nouvelle version de gel (figerVersionValidation) — le SEUL effet (ni etat, ni injection d'altitude) ;
 *   · registre de gel indisponible → refus propre (jamais un faux succès).
 * `db/client`, `projectionFileRepo` (garde) et `gelRepo` (figeage) mockés → on éprouve la LOGIQUE, pas la base.
 */
const H = vi.hoisted(() => ({
  nonEnr: [] as { id: number; repere: string | null }[],
  figeCalls: [] as { dossierId: number; valPar: string }[],
  figeResult: { enregistre: true, version: 3 } as { enregistre: boolean; version?: number; raison?: string },
}));
vi.mock('../db/client', () => ({ query: async () => ({ rows: [], rowCount: 0 }), withTransaction: async (fn: (q: unknown) => unknown) => fn(async () => ({ rows: [], rowCount: 0 })) }));
vi.mock('./projectionFileRepo', () => ({
  lireCorpsNonEnregistres: async () => H.nonEnr,
  motifEnregistrement: (c: { id: number; repere: string | null }[]) => `à enregistrer : ${c.map((x) => x.repere ?? `bâtiment ${x.id}`).join(', ')}`,
}));
vi.mock('./gelRepo', () => ({
  PREFIXE_GEL_VALIDATION: 'validation:',
  versionGelCourante: async () => null,
  figerVersionValidation: async (dossierId: number, valPar: string) => { H.figeCalls.push({ dossierId, valPar }); return H.figeResult; },
}));

import { revaliderRattachement } from './actionsRattachement';

beforeEach(() => { H.nonEnr = []; H.figeCalls = []; H.figeResult = { enregistre: true, version: 3 }; });

describe('revaliderRattachement — garde Lot 1 + figeage append-only', () => {
  it('REFUSE si un corps n’est pas confirmé humainement (manque:enregistrement) — AUCUN figeage (pas de porte dérobée)', async () => {
    H.nonEnr = [{ id: 7, repere: 'B1' }];
    const r = await revaliderRattachement(531, 'admin:decision');
    expect(r.ok).toBe(false);
    expect(r.manque).toBe('enregistrement');
    expect(r.motif).toMatch(/enregistrer/i);
    expect(H.figeCalls).toHaveLength(0); // append-only : un état non enregistré n’entre JAMAIS dans le gel
  });

  it('ACCEPTE sinon → appende une NOUVELLE version de gel (figerVersionValidation), rend le n° de version', async () => {
    const r = await revaliderRattachement(531, 'admin:decision');
    expect(r.ok).toBe(true);
    expect(r.versionGel).toBe(3);
    expect(H.figeCalls).toEqual([{ dossierId: 531, valPar: 'admin:decision' }]); // re-fige la référence (surveillance + marqueur)
  });

  it('registre de gel indisponible (169 non appliquée) → refus PROPRE, jamais un faux succès', async () => {
    H.figeResult = { enregistre: false, raison: 'registre indisponible' };
    const r = await revaliderRattachement(531, 'admin:decision');
    expect(r.ok).toBe(false);
  });

  it('dossier invalide → refus, aucun figeage', async () => {
    expect((await revaliderRattachement(0, 'admin:decision')).ok).toBe(false);
    expect(H.figeCalls).toHaveLength(0);
  });
});
