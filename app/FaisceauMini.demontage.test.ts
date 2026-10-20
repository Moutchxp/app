import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Mini-carte de la page de résultat : quitter la page < 200 ms après son apparition levait
// « Cannot read properties of undefined (reading '_leaflet_pos') » (recalage différé sur une carte détruite).
describe('FaisceauMini — démontage propre', () => {
  const src = readFileSync(join(process.cwd(), 'app/FaisceauMini.tsx'), 'utf8').replace(/\s+/g, ' ');
  it('le recalage différé est mémorisé, annulé au démontage, et ne vise que la carte encore montée', () => {
    expect(src).toContain('let recalage: ReturnType<typeof setTimeout> | null = null;');
    expect(src).toContain('recalage = setTimeout(() => { if (mapRef.current === map) map.invalidateSize(); }, 200);');
    expect(src).toContain('if (recalage !== null) clearTimeout(recalage);');
  });
  it('les animations sont arrêtées AVANT la destruction de la carte', () => {
    const i = src.indexOf('return () => {');
    const nettoyage = src.slice(i, src.indexOf('};', i));
    expect(nettoyage.indexOf('m.stop?.();')).toBeGreaterThan(-1);
    expect(nettoyage.indexOf('m.stop?.();')).toBeLessThan(nettoyage.indexOf('m.remove();'));
  });
  it('affichage inchangé : même zoom fixe, mêmes tuiles, même recalage immédiat', () => {
    expect(src).toContain('map.invalidateSize();');
    // Arno (20/10/2026) : le fond est le Plan IGN v2 (fondsDePlan.ts) — même zoom, même crossOrigin, attribution IGN en plus.
    expect(src).toContain('L.tileLayer(FOND_PLAN_IGN.url, { maxZoom: 19, attribution: FOND_PLAN_IGN.attribution, crossOrigin: true, })');
  });
});
