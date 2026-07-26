import { describe, it, expect } from 'vitest';
import {
  type FeatureCommune, type CollectionCommunes, type Requete,
  mapFeature, collectionComplete, upserterCommune, urlWfsCommunes, WFS_COUCHE,
} from './commune';

function feature(over: Partial<FeatureCommune['properties']> = {}, geom: FeatureCommune['geometry'] = { type: 'MultiPolygon', coordinates: [] }): FeatureCommune {
  return { properties: { code_insee: '92050', nom_officiel: 'Nanterre', code_insee_du_departement: '92', ...over }, geometry: geom };
}

describe('Sitadel S4 — mapping ADMIN EXPRESS', () => {
  it('extrait code/nom/departement + géométrie', () => {
    const c = mapFeature(feature());
    expect(c).toMatchObject({ codeInsee: '92050', nom: 'Nanterre', departement: '92' });
    expect(c?.geometrie?.type).toBe('MultiPolygon');
  });
  it('feature sans code ou sans nom → ignorée (null)', () => {
    expect(mapFeature(feature({ code_insee: '' }))).toBeNull();
    expect(mapFeature(feature({ nom_officiel: '' }))).toBeNull();
  });
  it('URL WFS : couche ADMIN EXPRESS + filtre sur les 4 départements + GeoJSON', () => {
    const u = urlWfsCommunes();
    expect(u).toContain('data.geopf.fr'); // source IGN (jamais OSM)
    expect(u).toContain(encodeURIComponent(WFS_COUCHE));
    expect(decodeURIComponent(u)).toContain("code_insee_du_departement IN ('75','92','93','78')");
  });
});

describe('Sitadel S4 — complétude du téléchargement', () => {
  const base = { type: 'FeatureCollection', features: [feature(), feature({ code_insee: '92051' })] };
  it('complet quand numberReturned couvre numberMatched', () => {
    expect(collectionComplete({ ...base, numberReturned: 2, numberMatched: 2 } as CollectionCommunes)).toBe(true);
  });
  it('incomplet : tronqué (features < numberMatched) ou vide', () => {
    expect(collectionComplete({ ...base, numberMatched: 335 } as CollectionCommunes)).toBe(false); // 2 features pour 335 attendus
    expect(collectionComplete({ type: 'FeatureCollection', features: [] } as CollectionCommunes)).toBe(false);
  });
});

describe('Sitadel S4 — UPSERT commune idempotent', () => {
  function fauxDepot() {
    const store = new Map<string, unknown[]>();
    const q: Requete = (async (_t: string, params?: unknown[]) => {
      const p = params ?? [];
      const cle = String(p[0]); // code_insee
      if (store.has(cle)) { store.set(cle, [...p]); return { rows: [{ est_nouveau: false }] }; }
      store.set(cle, [...p]);
      return { rows: [{ est_nouveau: true }] };
    }) as Requete;
    return { q, store };
  }
  const c = mapFeature(feature())!;

  it('1re passe = nouveau ; 2e passe = déjà connu, aucune ligne ajoutée (mêmes lignes)', async () => {
    const { q, store } = fauxDepot();
    expect((await upserterCommune(q, c, 'src', 'mill')).nouveau).toBe(true);
    expect(store.size).toBe(1);
    expect((await upserterCommune(q, c, 'src', 'mill')).nouveau).toBe(false);
    expect(store.size).toBe(1); // idempotent : rejouer ne crée rien
  });

  it('géométrie nulle acceptée (paramètre geojson = null)', async () => {
    const { q, store } = fauxDepot();
    const sansGeom = { ...c, geometrie: null };
    await upserterCommune(q, sansGeom, 'src', 'mill');
    expect(store.get('92050')![3]).toBeNull(); // 4e param = geojson
  });
});
