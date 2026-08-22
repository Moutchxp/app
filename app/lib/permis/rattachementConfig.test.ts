import { describe, it, expect, vi } from 'vitest';

/**
 * FUS-2 — lecture des seuils : valeurs en base converties en unités-métier (provenance 'base') ; sinon repli sur défauts
 * (provenance 'defaut'), colonne non migrée comprise. `db/client` mocké.
 */
const H = vi.hoisted(() => {
  const state = { mode: 'ok' as 'ok' | 'vide' | 'throw', row: { s: 70, b: 55, m: 25 } };
  const queryMock = async () => {
    if (state.mode === 'throw') throw new Error('column "rattachement_seuil_surface_pct" does not exist');
    if (state.mode === 'vide') return { rows: [], rowCount: 0 };
    return { rows: [state.row], rowCount: 1 };
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { lireSeuilsRattachement, SEUIL_SURFACE_PCT_DEFAUT, SEUIL_BORDURE_PCT_DEFAUT, MARGE_ALTITUDE_CM_DEFAUT } from './rattachementConfig';

describe('lireSeuilsRattachement', () => {
  it('valeurs en base → converties (%/cm → ratio/mètres) + provenance « base »', async () => {
    H.state.mode = 'ok'; H.state.row = { s: 70, b: 55, m: 25 };
    const r = await lireSeuilsRattachement();
    expect(r.provenance).toBe('base');
    expect(r.brut).toEqual({ surfacePct: 70, bordurePct: 55, margeAltitudeCm: 25 });
    expect(r.seuils).toEqual({ seuilSurface: 0.7, seuilBordure: 0.55, margeAltitudeM: 0.25 });
  });

  it('colonnes non migrées (erreur SQL) → défauts + provenance « defaut »', async () => {
    H.state.mode = 'throw';
    const r = await lireSeuilsRattachement();
    expect(r.provenance).toBe('defaut');
    expect(r.brut).toEqual({ surfacePct: SEUIL_SURFACE_PCT_DEFAUT, bordurePct: SEUIL_BORDURE_PCT_DEFAUT, margeAltitudeCm: MARGE_ALTITUDE_CM_DEFAUT });
    expect(r.seuils).toEqual({ seuilSurface: 0.8, seuilBordure: 0.6, margeAltitudeM: 0.1 });
  });

  it('ligne config absente → défauts + provenance « defaut »', async () => {
    H.state.mode = 'vide';
    const r = await lireSeuilsRattachement();
    expect(r.provenance).toBe('defaut');
    expect(r.seuils.seuilSurface).toBe(0.8);
  });
});

import { lireDaactDeclencheurActif, ecrireDaactDeclencheurActif } from './rattachementConfig';

describe('RATTACHEMENT — déclencheur DAACT (réglage)', () => {
  it('valeur en base false → false', async () => {
    H.state.mode = 'ok'; H.state.row = { actif: false } as unknown as { s: number; b: number; m: number };
    expect(await lireDaactDeclencheurActif()).toBe(false);
  });
  it('valeur en base true → true', async () => {
    H.state.mode = 'ok'; H.state.row = { actif: true } as unknown as { s: number; b: number; m: number };
    expect(await lireDaactDeclencheurActif()).toBe(true);
  });
  it('colonne non migrée (erreur SQL) → défaut ACTIVÉ (true), sans casser', async () => {
    H.state.mode = 'throw';
    expect(await lireDaactDeclencheurActif()).toBe(true);
  });
  it('ligne absente → défaut ACTIVÉ (true)', async () => {
    H.state.mode = 'vide';
    expect(await lireDaactDeclencheurActif()).toBe(true);
  });
  it('écriture : renvoie l’état APRÈS écriture (booléen strict)', async () => {
    H.state.mode = 'ok';
    expect(await ecrireDaactDeclencheurActif(true)).toBe(true);
    expect(await ecrireDaactDeclencheurActif(false)).toBe(false);
  });
});
