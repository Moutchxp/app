import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONDS_DE_PLAN, ZOOM_MAX_CARTE } from './fondsDePlan';

describe('carte de localisation — la carte reste affichée à tous les zooms', () => {
  it('chaque fond déclare le dernier niveau qu’il FOURNIT réellement (OSM et Esri : 19)', () => {
    expect(FONDS_DE_PLAN.map.zoomMaxFourni).toBe(19);
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
    expect(src).toContain('maxZoom: ZOOM_MAX_CARTE, })');
    expect(src).not.toMatch(/tile\.openstreetmap\.org|arcgisonline/); // les URL ne vivent plus qu'à un seul endroit
  });
});
