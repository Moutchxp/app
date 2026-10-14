import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  blocsDuCercle, controlerUrl, decoderEntites, lireLignesSources, lirePageWfs, pageSuivante, sourcesDuCercle, urlGetFeature,
  WFS_COUCHE, WFS_PAR_PAGE,
} from './sourceWfs';
import { dallesDuCercle, nomDalle } from './grilleLidar';

/**
 * Lot IMPORT LiDAR HD — la source WFS de la Géoplateforme IGN, éprouvée sur une RÉPONSE RÉELLE ENREGISTRÉE (requête
 * GetFeature du 14/10/2026 sur la dalle d'Asnières, HTTP 200). Aucun appel réseau dans npm test.
 */
const REPONSE = JSON.parse(readFileSync('app/lib/lidar/__fixtures__/wfs-metadata-asnieres.json', 'utf8')) as {
  features: { properties: Record<string, unknown> }[]; numberMatched: number; numberReturned: number;
};
const ASNIERES = { xKm: 646, yKm: 6868 };
const NOTRE_DAME_L93 = { x: 652296.9731460073, y: 6861636.3585152 };

describe('la réponse réelle du WFS (dalle d’Asnières)', () => {
  it('une entité, clé 0646_6868, URLs MNS et MNT décodées (&amp; → &), contrôlées sans anomalie', () => {
    const page = lirePageWfs(REPONSE);
    expect(page.anomalies).toEqual([]);
    expect(page.renvoyees).toBe(1);
    expect(page.correspondantes).toBe(1);
    expect(page.entrees).toHaveLength(1);
    const [e] = page.entrees;
    expect(e.dalle).toBe('0646_6868');
    expect(e.urls.MNS).not.toContain('&amp;');
    // Le même fichier que celui du Mac, sur l'emprise exacte mesurée en base, 2000 × 2000 px.
    const mns = new URL(e.urls.MNS!);
    expect(mns.searchParams.get('FILENAME')).toBe('LHD_FXX_0646_6868_MNS_O_0M50_LAMB93_IGN69.tif');
    expect(mns.searchParams.get('BBOX')).toBe('645999.75,6867000.25,646999.75,6868000.25');
    expect(mns.searchParams.get('WIDTH')).toBe('2000');
    expect(mns.searchParams.get('LAYERS')).toBe('IGNF_LIDAR-HD_MNS_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93');
    expect(new URL(e.urls.MNT!).searchParams.get('FILENAME')).toBe('LHD_FXX_0646_6868_MNT_O_0M50_LAMB93_IGN69.tif');
  });

  it('une URL qui ne correspond pas à la dalle (autre fichier, autre emprise) est refusée et signalée', () => {
    const url = decoderEntites(String(REPONSE.features[0].properties.url_mns));
    expect(controlerUrl(ASNIERES, 'MNS', url)).toBeNull();
    expect(controlerUrl(ASNIERES, 'MNT', url)).toMatch(/≠ LHD_FXX_0646_6868_MNT_/);
    expect(controlerUrl({ xKm: 647, yKm: 6868 }, 'MNS', url)).toMatch(/≠ LHD_FXX_0647_6868_MNS_/);
    expect(controlerUrl(ASNIERES, 'MNS', url.replace('646999.75', '647000'))).toMatch(/BBOX/);
    const fausse = { ...REPONSE, features: [{ properties: { ...REPONSE.features[0].properties, url_mnt: url } }] };
    const page = lirePageWfs(fausse);
    expect(page.anomalies).toEqual([expect.stringContaining('0646_6868 MNT : fichier')]);
    expect(page.entrees[0].urls.MNT).toBeUndefined();
  });
});

describe('requêtes et pagination', () => {
  it('URL GetFeature : couche, JSON, BBOX Lambert-93 en X,Y, pagination STARTINDEX / COUNT', () => {
    const u = new URL(urlGetFeature({ xmin: 646400, ymin: 6867400, xmax: 646600, ymax: 6867600 }, 2000));
    expect(u.origin + u.pathname).toBe('https://data.geopf.fr/wfs/ows');
    expect(u.searchParams.get('TYPENAMES')).toBe(WFS_COUCHE);
    expect(u.searchParams.get('OUTPUTFORMAT')).toBe('application/json');
    expect(u.searchParams.get('BBOX')).toBe('646400,6867400,646600,6867600,urn:ogc:def:crs:EPSG::2154');
    expect(u.searchParams.get('STARTINDEX')).toBe('2000');
    expect(u.searchParams.get('COUNT')).toBe(String(WFS_PAR_PAGE));
  });

  it('page suivante seulement si la page est pleine et le total pas encore atteint', () => {
    const page = (renvoyees: number, correspondantes: number | null) => ({ entrees: [], anomalies: [], renvoyees, correspondantes });
    expect(pageSuivante(page(1, 1), 0)).toBe(false);
    expect(pageSuivante(page(1000, 2500), 0)).toBe(true);
    expect(pageSuivante(page(1000, 2000), 1000)).toBe(false);
    expect(pageSuivante(page(1000, null), 0)).toBe(true);
  });

  it('les blocs de 10 km couvrent toute l’enveloppe du cercle de 36 km (8 × 8 blocs)', () => {
    const blocs = blocsDuCercle(NOTRE_DAME_L93, 36_000);
    expect(blocs).toHaveLength(64);
    expect(Math.min(...blocs.map((b) => b.xmin))).toBe(NOTRE_DAME_L93.x - 36_000);
    expect(Math.max(...blocs.map((b) => b.ymax))).toBe(NOTRE_DAME_L93.y + 36_000);
  });
});

describe('croisement avec les dalles du cercle', () => {
  it('dalles absentes du WFS signalées (zones non diffusées, ZICAD), sans bloquer ; doublons de blocs fusionnés', () => {
    const page = lirePageWfs(REPONSE);
    const dalles = dallesDuCercle(NOTRE_DAME_L93, 36_000);
    const s = sourcesDuCercle(dalles, [...page.entrees, ...page.entrees]); // la même dalle reçue par deux blocs
    expect(s.disponibles).toBe(1);
    expect(s.indisponibles).toHaveLength(4220);
    expect(s.indisponibles).not.toContain('0646_6868');
    expect(s.lignes).toHaveLength(2);
    const table = lireLignesSources(s.lignes.join('\n'));
    expect(new URL(table.get('0646_6868|MNS')!).searchParams.get('FILENAME')).toBe('LHD_FXX_0646_6868_MNS_O_0M50_LAMB93_IGN69.tif');
    expect(dalles.map(nomDalle)).toContain('0646_6868');
  });
});
