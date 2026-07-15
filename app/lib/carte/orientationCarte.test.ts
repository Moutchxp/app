import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { cadrer, projeter, construireSvg, genererCarteOrientation, ErreurCarteIncomplete, ZOOM } from './orientationCarte';

// Cas connu : Asnières (le point du golden). Cadrage z18 figé (calculé hors réseau).
const LAT = 48.90693182287072;
const LON = 2.269431435588249;

let tilePng: Buffer; // une vraie tuile 256×256 pour stubber le réseau (aucun appel externe)
beforeAll(async () => {
  tilePng = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 210, g: 220, b: 210, alpha: 1 } } })
    .png()
    .toBuffer();
});

describe('cadrer — cadrage z18 FIGÉ (pur, sans réseau)', () => {
  it('Asnières → fenêtre 1427×1427, grille 7×7 = 49 tuiles, tuile centrale connue', () => {
    const c = cadrer(LAT, LON);
    expect(c.zoom).toBe(ZOOM);
    expect(c.outW).toBe(1427);
    expect(c.outH).toBe(1427);
    expect([c.tMinX, c.tMaxX, c.tMinY, c.tMaxY]).toEqual([132721, 132727, 90126, 90132]);
    expect(c.tuiles).toHaveLength(49);
    expect(c.centerTile).toEqual({ x: 132724, y: 90129 });
  });

  it('l’origine se projette au CENTRE de la fenêtre (± 1 px)', () => {
    const c = cadrer(LAT, LON);
    const [ox, oy] = projeter(LAT, LON, c);
    expect(ox).toBeCloseTo(c.outW / 2, 0);
    expect(oy).toBeCloseTo(c.outH / 2, 0);
  });
});

describe('construireSvg — overlay vectoriel', () => {
  it('faisceau (rouge) part du centre, cône (bleu métier) + attribution GRAVÉE présents', () => {
    const c = cadrer(LAT, LON);
    const svg = construireSvg(c, LAT, LON, 90);
    expect(svg).toContain('#dc2626'); // faisceau rouge SVAV
    expect(svg).toContain('#3b82f6'); // cône bleu métier (fill)
    expect(svg).toContain('#2563eb'); // cône bleu métier (stroke)
    expect(svg).toContain('© IGN'); // attribution gravée dans l'image
    expect(svg).toContain(`width="${c.outW}"`);
  });

  it('le cône s’ouvre du BON côté : cap 90 (Est) → la pointe du faisceau est à l’Est (x croissant)', () => {
    const c = cadrer(LAT, LON);
    const [ox] = projeter(LAT, LON, c);
    // pointe du faisceau projetée (réutilise la même géodésie que le module) :
    const svg = construireSvg(c, LAT, LON, 90);
    const ligne = svg.match(/<line x1="(-?[\d.]+)" y1="-?[\d.]+" x2="(-?[\d.]+)" y2="-?[\d.]+" stroke="#dc2626"/);
    expect(ligne).toBeTruthy();
    const x1 = Number(ligne![1]);
    const x2 = Number(ligne![2]);
    expect(x1).toBeCloseTo(ox, 0); // le faisceau part de l'origine
    expect(x2).toBeGreaterThan(x1); // cap Est → pointe à droite
  });

  it('cap 270 (Ouest) → pointe à l’Ouest (x décroissant) : la géométrie n’est pas figée sur un sens', () => {
    const c = cadrer(LAT, LON);
    const svg = construireSvg(c, LAT, LON, 270);
    const ligne = svg.match(/<line x1="(-?[\d.]+)" y1="-?[\d.]+" x2="(-?[\d.]+)" y2="-?[\d.]+" stroke="#dc2626"/);
    expect(Number(ligne![2])).toBeLessThan(Number(ligne![1]));
  });
});

describe('genererCarteOrientation — chaîne complète (réseau stubbé, aucun appel externe)', () => {
  const stub = (fail: Set<string> = new Set()) => async (_z: number, x: number, y: number) => {
    if (fail.has(`${x}/${y}`)) throw new Error('tuile en échec (simulée)');
    return tilePng;
  };

  it('toutes les tuiles → PNG 1274×1274 (assemblage + recadrage + overlay)', async () => {
    const buf = await genererCarteOrientation(LAT, LON, 90, { fetchTuile: stub() });
    const meta = await sharp(buf).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1427);
    expect(meta.height).toBe(1427);
  });

  it('une tuile de COIN manquante → carte quand même produite (trou clair toléré)', async () => {
    const buf = await genererCarteOrientation(LAT, LON, 90, { fetchTuile: stub(new Set(['132721/90126'])) });
    expect((await sharp(buf).metadata()).width).toBe(1427);
  });

  it('tuile CENTRALE manquante → ErreurCarteIncomplete (le document perdrait son sujet)', async () => {
    await expect(genererCarteOrientation(LAT, LON, 90, { fetchTuile: stub(new Set(['132724/90129'])) })).rejects.toBeInstanceOf(
      ErreurCarteIncomplete,
    );
  });

  it('trop de tuiles manquantes (> 25 %) → ErreurCarteIncomplete (une carte à moitié vide ne vaut rien)', async () => {
    // 13 échecs sur 49 (~27 %), hors tuile centrale.
    const fail = new Set<string>();
    const c = cadrer(LAT, LON);
    for (const t of c.tuiles) {
      if (fail.size >= 13) break;
      if (t.x === c.centerTile.x && t.y === c.centerTile.y) continue;
      fail.add(`${t.x}/${t.y}`);
    }
    await expect(genererCarteOrientation(LAT, LON, 90, { fetchTuile: stub(fail) })).rejects.toBeInstanceOf(ErreurCarteIncomplete);
  });
});
