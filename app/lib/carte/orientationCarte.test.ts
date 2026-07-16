import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { cadrerVueEnHaut, construireOverlayVueEnHaut, genererCarteOrientation, ErreurCarteIncomplete, TRACE_VALIDATION } from './orientationCarte';

// Asnières (le point du golden). Géométrie MOTEUR (champ 180°, portée 200 m) — celle du certificat.
const LAT = 48.90693182287072;
const LON = 2.269431435588249;
const MOTEUR = { demiAngleDeg: 90, rayonAxeM: 200, rayonChampM: 200, arcPoints: 49 };

let tilePng: Buffer;
beforeAll(async () => {
  tilePng = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 210, g: 220, b: 210, alpha: 1 } } }).png().toBuffer();
});

describe('cadrerVueEnHaut — cadrage bbox + zoom DÉRIVÉ (pur, sans réseau)', () => {
  it('origine centrée en largeur, près du bas ; zoom dérivé (pas de 18 en dur)', () => {
    const f = cadrerVueEnHaut(LAT, MOTEUR);
    expect(f.ox).toBe(500); // OUT_W / 2 → origine centrée horizontalement
    expect(f.oy).toBeGreaterThan(560); // près du bord bas (OUT_H = 617)
    expect(f.oy).toBeLessThan(617);
    expect(f.zSrc).toBe(18); // DÉRIVÉ de mppOut (pas une constante) — vaut 18 pour cette géométrie/cartouche
    expect(f.mppOut).toBeCloseTo(0.448, 2);
  });

  it('changer la PORTÉE change le cadrage (zoom dérivé, pas figé) → la carte ne casse pas en silence', () => {
    const proche = cadrerVueEnHaut(LAT, MOTEUR);
    const loin = cadrerVueEnHaut(LAT, { ...MOTEUR, rayonAxeM: 600, rayonChampM: 600 });
    expect(loin.mppOut).toBeGreaterThan(proche.mppOut); // portée 3× → résolution plus grossière
    expect(loin.zSrc).toBeLessThan(proche.zSrc); // et un zoom source plus faible, DÉRIVÉ
  });
});

describe('construireOverlayVueEnHaut — overlay VUE EN HAUT (esthétique écran, géométrie moteur)', () => {
  const f = cadrerVueEnHaut(LAT, MOTEUR);
  it('cône APLAT écran (#3b82f6 @0.25, contour #2563eb) + axe #dc2626 + attribution gravée', () => {
    const svg = construireOverlayVueEnHaut(f.ox, f.oy, f.mppOut, 343, MOTEUR);
    expect(svg).toContain('#3b82f6');
    expect(svg).toContain('fill-opacity="0.25"'); // APLAT, pas de dégradé
    expect(svg).toContain('#2563eb');
    expect(svg).toContain('#dc2626');
    expect(svg).toContain('© IGN');
  });

  it("l'axe du verdict est VERTICAL et pointe vers le HAUT (quel que soit l'azimut)", () => {
    for (const az of [0, 90, 200, 343]) {
      const svg = construireOverlayVueEnHaut(f.ox, f.oy, f.mppOut, az, MOTEUR);
      const m = svg.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#dc2626"/);
      expect(m).toBeTruthy();
      const [x1, y1, x2, y2] = [Number(m![1]), Number(m![2]), Number(m![3]), Number(m![4])];
      expect(x2).toBeCloseTo(x1, 1); // vertical : même x
      expect(x1).toBeCloseTo(f.ox, 1); // sur l'axe central
      expect(y2).toBeLessThan(y1); // pointe (y2) AU-DESSUS de l'origine (y1)
    }
  });
});

describe('genererCarteOrientation — chaîne VUE EN HAUT (réseau stubbé)', () => {
  it('toutes les tuiles → PNG au ratio du cartouche (1000×617), rien de rogné', async () => {
    const buf = await genererCarteOrientation(LAT, LON, 343, MOTEUR, { fetchTuile: async () => tilePng });
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(617);
  });

  it('toutes les tuiles en échec (donc la centrale) → ErreurCarteIncomplete', async () => {
    await expect(
      genererCarteOrientation(LAT, LON, 343, MOTEUR, { fetchTuile: async () => { throw new Error('réseau'); } }),
    ).rejects.toBeInstanceOf(ErreurCarteIncomplete);
  });

  it('géométrie REQUISE : l’appelant passe la sienne (ici moteur ; TRACE_VALIDATION exportée pour l’écran)', () => {
    expect(TRACE_VALIDATION.demiAngleDeg).toBeGreaterThan(0); // simple garde : l'export existe et est cohérent
  });
});
