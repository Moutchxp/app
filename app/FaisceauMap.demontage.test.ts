import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Grande carte du faisceau (écran d'orientation) : la quitter < 300 ms après son apparition levait
// « Cannot read properties of undefined (reading '_leaflet_pos') » (recalage différé sur une carte détruite).
// Même correction que la mini-carte (FaisceauMini.demontage.test.ts).
describe('FaisceauMap — démontage propre', () => {
  const src = readFileSync(join(process.cwd(), 'app/FaisceauMap.tsx'), 'utf8').replace(/\s+/g, ' ');
  it('le recalage différé est mémorisé, annulé au démontage, et ne vise que la carte encore montée', () => {
    expect(src).toContain('let recalage: ReturnType<typeof setTimeout> | null = null;');
    expect(src).toContain('recalage = setTimeout(() => { if (mapRef.current === map) map.invalidateSize(); }, 300);');
    expect(src).toContain('if (recalage !== null) clearTimeout(recalage);');
  });
  it('les animations sont arrêtées AVANT la destruction de la carte', () => {
    const i = src.indexOf('if (recalage !== null) clearTimeout(recalage);');
    const nettoyage = src.slice(i, src.indexOf('}, [lat, lon]);', i));
    expect(nettoyage.indexOf('mapRef.current.stop?.();')).toBeGreaterThan(-1);
    expect(nettoyage.indexOf('mapRef.current.stop?.();')).toBeLessThan(nettoyage.indexOf('mapRef.current.remove();'));
  });
  it('comportement inchangé : même recalage immédiat, carte créée une seule fois, mêmes gestes désactivés', () => {
    expect(src).toContain('map.invalidateSize();');
    expect(src).toContain('if (cancelled || !divRef.current || mapRef.current) return;');
    expect(src).toContain('dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,');
  });
});
