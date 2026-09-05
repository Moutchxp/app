import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// db/client crée un Pool à l'import (lazy, jamais connecté sans requête) ; on le mocke pour des tests PURS/ciblés (aucune I/O réelle).
vi.mock('../db/client', () => ({ query: vi.fn() }));

import { bornerRayon, RAYON_VOISINES_DEFAUT_M, nomParisArrondissement, geocoderAdresse } from './plancheParcellesRepo';
import { query } from '../db/client';

/** PL-A — décision MESURÉE : rayon des voisines borné (paramètre de code), jamais une section entière (Seq Scan, illisible). */
describe('bornerRayon — le périmètre des voisines, borné', () => {
  it('défaut = 50 m quand rien/invalide n’est fourni', () => {
    expect(bornerRayon(undefined)).toBe(RAYON_VOISINES_DEFAUT_M);
    expect(bornerRayon(null)).toBe(50);
    expect(bornerRayon(Number.NaN)).toBe(50);
  });
  it('valeur normale conservée (arrondie)', () => {
    expect(bornerRayon(80)).toBe(80);
    expect(bornerRayon(49.6)).toBe(50);
  });
  it('borné [10 ; 200] (pas de section entière déguisée en rayon)', () => {
    expect(bornerRayon(5)).toBe(10);
    expect(bornerRayon(9999)).toBe(200);
  });
});

/** PL-B2 §3 — nom d'arrondissement parisien DÉRIVÉ du code cadastral (la table `commune` ne porte que 75056 : on ne joint pas, on dérive). */
describe('nomParisArrondissement — 751xx → « Paris Ne », pur', () => {
  it('arrondissements', () => {
    expect(nomParisArrondissement('75119')).toBe('Paris 19e');
    expect(nomParisArrondissement('75120')).toBe('Paris 20e');
    expect(nomParisArrondissement('75101')).toBe('Paris 1er');
  });
  it('Paris ENTIÈRE (75056) → null (ce n’est pas un arrondissement)', () => {
    expect(nomParisArrondissement('75056')).toBeNull();
  });
  it('hors Paris ou invalide → null (jamais un nom inventé)', () => {
    expect(nomParisArrondissement('94003')).toBeNull();
    expect(nomParisArrondissement('75199')).toBeNull(); // arrondissement 99 n'existe pas
    expect(nomParisArrondissement(null)).toBeNull();
    expect(nomParisArrondissement('7511')).toBeNull();
  });
});

/** PL-D — géocodage : copie locale d'abord, RECOURS api-adresse (France entière) sinon ; saisie manuelle → API. Provenance explicite. */
type Q = { rows: unknown[]; rowCount: number };
const dossierRow: Q = { rows: [{ num_dau: '075119000A0001', code_insee: '75056', num: '21', voie: 'RUE DE L\'INSPECTEUR ALLES' }], rowCount: 1 };
const vide: Q = { rows: [], rowCount: 0 };
const apiFeature = (x: number, y: number, label: string) => ({ ok: true, json: async () => ({ features: [{ properties: { x, y, label } }] }) });

describe('geocoderAdresse — recours API nationale + saisie manuelle (PL-D)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  beforeEach(() => { vi.mocked(query).mockReset(); });

  it('SAISIE MANUELLE (texte libre) → API nationale, provenance=api-adresse, point Lambert-93 + libellé', async () => {
    vi.mocked(query).mockResolvedValueOnce(dossierRow as never); // lecture sitadel_dossier
    vi.stubGlobal('fetch', vi.fn(async (u: string) => { expect(u).toContain('api-adresse.data.gouv.fr'); return apiFeature(655865.38, 6864587.11, '21 Rue de l\'Inspecteur Allès 75019 Paris'); }));
    const r = await geocoderAdresse(468, '21 rue de l inspecteur alles paris');
    expect(r).toMatchObject({ x: 655865.38, y: 6864587.11, provenance: 'api-adresse', label: '21 Rue de l\'Inspecteur Allès 75019 Paris' });
  });

  it('AUTO : local échoue (0 ligne BAN) → RECOURS API nationale (le cas 468)', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce(dossierRow as never) // sitadel
      .mockResolvedValueOnce(vide as never)       // BAN exact
      .mockResolvedValueOnce(vide as never);      // BAN voie-seule
    vi.stubGlobal('fetch', vi.fn(async () => apiFeature(655865.38, 6864587.11, '21 Rue de l\'Inspecteur Allès 75019 Paris')));
    const r = await geocoderAdresse(468);
    expect('erreur' in r).toBe(false);
    expect(r).toMatchObject({ provenance: 'api-adresse' });
  });

  it('AUTO : local TROUVE → provenance=ban-local, aucun appel réseau', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.mocked(query)
      .mockResolvedValueOnce(dossierRow as never)                                   // sitadel
      .mockResolvedValueOnce({ rows: [{ x: 652000, y: 6862000 }], rowCount: 1 } as never); // BAN exact TROUVE
    const r = await geocoderAdresse(468);
    expect(r).toMatchObject({ x: 652000, y: 6862000, provenance: 'ban-local' });
    expect(fetchSpy).not.toHaveBeenCalled(); // on ne sollicite l'API QUE si le local échoue
  });

  it('API indisponible (réseau) → erreur explicite, jamais un point inventé', async () => {
    vi.mocked(query).mockResolvedValueOnce(dossierRow as never);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const r = await geocoderAdresse(468, 'une adresse quelconque');
    expect(r).toHaveProperty('erreur');
  });
});
