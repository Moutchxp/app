import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATTRIBUTION_IGN, FONDS_DE_PLAN, FOND_PLAN_IGN, ZOOM_ARRIVEE_POINT_GPS, ZOOM_DETAILLE_PLAN_IGN, ZOOM_MAX_CARTE } from './fondsDePlan';

describe('carte de localisation — la carte reste affichée à tous les zooms', () => {
  it('chaque fond déclare le dernier niveau qu’il FOURNIT en entier (Plan IGN : 18, le dernier détaillé ; Esri : 19)', () => {
    expect(FONDS_DE_PLAN.map.zoomMaxFourni).toBe(18);
    expect(FONDS_DE_PLAN.satellite.zoomMaxFourni).toBe(19);
  });

  it('le zoom maximal de la carte (20, inchangé) dépasse ou égale chaque niveau fourni : au-delà, sur-zoom', () => {
    expect(ZOOM_MAX_CARTE).toBe(20);
    for (const fond of Object.values(FONDS_DE_PLAN)) expect(ZOOM_MAX_CARTE).toBeGreaterThanOrEqual(fond.zoomMaxFourni);
  });

  it('MapContent passe maxNativeZoom = niveau fourni et maxZoom = zoom maximal à CHAQUE fond (jamais de tuile inexistante)', () => {
    const src = readFileSync(join(process.cwd(), 'app/MapContent.tsx'), 'utf8').replace(/\s+/g, ' ');
    expect(src).toContain('const fond = FONDS_DE_PLAN[mapMode];');
    expect(src).toContain('L.tileLayer(fond.url, { maxNativeZoom: fond.zoomMaxFourni,');
    expect(src).toContain('maxZoom: ZOOM_MAX_CARTE, attribution: fond.attribution,');
    expect(src).not.toMatch(/tile\.openstreetmap\.org|arcgisonline/); // les URL ne vivent plus qu'à un seul endroit
  });
});

describe('carte du faisceau — mêmes fonds, même sur-zoom, zoom des boutons inchangé', () => {
  const src = readFileSync(join(process.cwd(), 'app/FaisceauMap.tsx'), 'utf8').replace(/\s+/g, ' ');
  it('les deux couches (création et bascule Plan/Satellite) passent maxNativeZoom = niveau fourni et maxZoom = zoom maximal', () => {
    expect(src.match(/maxNativeZoom: t0?\.zoomMaxFourni, maxZoom: ZOOM_MAX_CARTE,/g)?.length).toBe(2);
    expect(src).not.toMatch(/maxZoom: t0?\.maxZoom/);
    expect(src).not.toMatch(/tile\.openstreetmap\.org|arcgisonline/); // URL : une seule source, fondsDePlan.ts
  });
  it('les boutons « + » / « − » gardent leurs bornes (19 et 3) : comportement inchangé', () => {
    expect(src).toContain('appliquerVue(Math.min(19, (mapRef.current?.getZoom() ?? 0) + 1))');
    expect(src).toContain('appliquerVue(Math.max(3, (mapRef.current?.getZoom() ?? 0) - 1))');
  });
});

/**
 * 🔴 Arno (20/10/2026) — LE FOND « PLAN » EST LE PLAN IGN V2 (data.geopf.fr, WMTS, sans clé), PARTOUT ; plus aucune tuile
 * OpenStreetMap (403 sans Referer depuis `Referrer-Policy: same-origin`, gardé tel quel) ; attribution IGN sur chaque carte.
 */
describe('fond Plan IGN — une seule URL, toutes les cartes, attribution obligatoire', () => {
  it('le Plan IGN v2 de la Géoplateforme, en WebMercator (PM), comme les cartes de certificat', () => {
    expect(FONDS_DE_PLAN.map).toBe(FOND_PLAN_IGN);
    expect(FOND_PLAN_IGN.url).toMatch(/^https:\/\/data\.geopf\.fr\/wmts\?/);
    for (const p of ['LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'TILEMATRIXSET=PM', 'TILEMATRIX={z}', 'TILEROW={y}', 'TILECOL={x}', 'STYLE=normal']) {
      expect(FOND_PLAN_IGN.url).toContain(p);
    }
    expect(readFileSync(join(process.cwd(), 'app/lib/carte/orientationCarte.ts'), 'utf8')).toContain("const LAYER = 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2';");
    expect(ATTRIBUTION_IGN).toContain('IGN');
  });
  const CARTES = ['app/MapContent.tsx', 'app/FaisceauMap.tsx', 'app/FaisceauMini.tsx', 'app/origine/Carte.tsx',
    'app/(admin)/admin/(protected)/curation/CurationCarte.tsx', 'app/(admin)/admin/(protected)/statistiques/CarteCommunes.tsx'];
  it.each(CARTES)('%s : aucune tuile OpenStreetMap ; le fond vient de fondsDePlan.ts ; l’attribution est posée', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect(src).not.toMatch(/tile\.openstreetmap\.org/);
    expect(src).toMatch(/FOND_PLAN_IGN|FONDS_DE_PLAN/);
    expect(src).toMatch(/attribution[:=]\s*\{?\s*(FOND_PLAN_IGN\.attribution|fond\.attribution|t0?\.attribution)/);
    expect(src).not.toMatch(/attributionControl:\s*false/);
  });
  it('la Referrer-Policy de l’admin n’est PAS assouplie (same-origin)', () => {
    expect(readFileSync(join(process.cwd(), 'app/lib/admin/entetesSecurite.ts'), 'utf8')).toContain("{ key: 'Referrer-Policy', value: 'same-origin' }");
  });
});

/**
 * 🔴 Arno (22/10/2026) — PLAN IGN DÉTAILLÉ À TOUS LES ZOOMS. Mesure : le 18 est le dernier niveau qui porte noms de rue, jardins,
 * numéros et sens de circulation ; le 19 n'a plus que bâtiments et parcelles ; le 20 n'existe pas. Chaque carte du Plan IGN
 * s'arrête au 18 (maxNativeZoom) et garde son zoom maximal ; seul l'écran du point GPS change de zoom d'arrivée (18).
 */
describe('🔴 Plan IGN : le dernier niveau détaillé, agrandi au-delà, sur les six cartes', () => {
  const lire = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\s+/g, ' ');
  it('une seule source : 18 ; le satellite garde son 19', () => {
    expect(ZOOM_DETAILLE_PLAN_IGN).toBe(18);
    expect(FOND_PLAN_IGN.zoomMaxFourni).toBe(ZOOM_DETAILLE_PLAN_IGN);
    expect(FONDS_DE_PLAN.map).toBe(FOND_PLAN_IGN);
    expect(FONDS_DE_PLAN.satellite.zoomMaxFourni).toBe(19);
  });
  it('mini-carte du résultat, Curation, Statistiques, point d’origine : maxNativeZoom = 18, zoom maximal inchangé', () => {
    expect(lire('app/FaisceauMini.tsx')).toContain('maxNativeZoom: FOND_PLAN_IGN.zoomMaxFourni, // dernier niveau détaillé du Plan IGN : agrandi au-delà (fondsDePlan.ts) maxZoom: 19,');
    expect(lire('app/(admin)/admin/(protected)/curation/CurationCarte.tsx')).toContain('maxNativeZoom: FOND_PLAN_IGN.zoomMaxFourni, // dernier niveau détaillé du Plan IGN : agrandi au-delà (fondsDePlan.ts) maxZoom: 19,');
    expect(lire('app/(admin)/admin/(protected)/statistiques/CarteCommunes.tsx')).toContain('maxNativeZoom={FOND_PLAN_IGN.zoomMaxFourni} maxZoom={ZOOM_MAX}');
    expect(lire('app/origine/Carte.tsx')).toContain('maxNativeZoom={FOND_PLAN_IGN.zoomMaxFourni} maxZoom={18}');
  });
  it('zoom d’arrivée : 18 sur l’écran du point GPS seulement ; 19 par défaut (Banc de test inchangé)', () => {
    expect(ZOOM_ARRIVEE_POINT_GPS).toBe(18);
    expect(lire('app/MapContent.tsx')).toContain('zoomDepart = 19, }: MapContentProps)');
    expect(lire('app/MapContent.tsx')).toContain('zoom: zoomDepart,');
    expect(lire('app/page.tsx')).toContain('zoomDepart={ZOOM_ARRIVEE_POINT_GPS}');
    expect(lire('app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx')).not.toContain('zoomDepart');
  });
});
