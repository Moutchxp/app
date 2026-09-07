import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ecranVersCanvas } from '../../../../lib/permis/calageEmprise';
import { guidageTrace } from './TraceEmpriseRendu';

/**
 * PROJ-AGR — FILET du RATIO LIVE (socle N largeurs, lot F). Prouve que la conversion écran→PDF pose les points au MÊME endroit géométrique
 * à N'IMPORTE QUELLE largeur d'affichage — pas seulement les deux largeurs re-rendues. Le mécanisme réel (lot F) : cliquerPdf lit un RATIO
 * LIVE = canvas.width / offsetWidth (largeur de MISE EN PAGE, dé-zoomée) AU MOMENT DE L'USAGE, au lieu d'un `apercu.ratio` figé au re-rendu →
 * la composition est exacte pour la largeur courante, quelle qu'elle soit. La preuve ci-dessous est une PROPRIÉTÉ D'INVARIANCE : on balaie N
 * couples (scale de rendu, largeur d'affichage) arbitraires — y compris NON ronds — et l'on exige le MÊME point PDF partout. TOLÉRANCE : 1e-9
 * — la construction est EXACTE (aucun arrondi), la tolérance ne couvre que l'IEEE754.
 */

// Une VUE de rendu au scale `scale`, largeur d'affichage `displayW`. canvasW = pageWpt·scale ; ratio = canvasW/displayW ; le viewport
//   pdf.js mappe canvas-pixel ↔ PDF (÷scale, Y inversé) — inverses EXACTS, fidèle à la sémantique pdf.js.
function vue(pageWpt: number, pageHpt: number, scale: number, displayW: number) {
  const canvasW = pageWpt * scale, canvasH = pageHpt * scale;
  return {
    ratio: canvasW / displayW,
    displayW,
    displayH: canvasH / (canvasW / displayW), // hauteur AFFICHÉE (canvas en width:100% → display height = canvasH/ratio)
    vp: {
      convertToPdfPoint: (x: number, y: number): number[] => [x / scale, (canvasH - y) / scale],
      convertToViewportPoint: (px: number, py: number): number[] => [px * scale, canvasH - py * scale],
    },
  };
}
// Réplique EXACTE de BlocTraceEmprise.cliquerPdf (clic à une position d'AFFICHAGE ; conteneur en (0,0), pan 0, zoom 1).
function poser(v: ReturnType<typeof vue>, displayX: number, displayY: number) {
  const u = ecranVersCanvas(displayX, displayY, 0, 0, { x: 0, y: 0 }, 1);
  const [px, py] = v.vp.convertToPdfPoint(u.x * v.ratio, u.y * v.ratio);
  return { x: px, y: py };
}
// Réplique EXACTE de BlocTraceEmprise.versCss (PDF → position d'affichage), ratio DE LA VUE (= largeur de rendu). Utilisé quand la vue
//   affichée EST celle rendue (largeur re-rendue) — c'est le cas des invariances (a)/(b) ci-dessus, où chaque vue est son propre rendu.
function versDisplay(v: ReturnType<typeof vue>, p: { x: number; y: number }) {
  const [vx, vy] = v.vp.convertToViewportPoint(p.x, p.y);
  return { x: vx / v.ratio, y: vy / v.ratio };
}
// LOT 3 — versCss RÉEL du composant : le ratio d'affichage est LIVE = apercu.largeurCanvasPx / largeurCanvasCss, où largeurCanvasPx =
//   canvas.width (px-device du RENDU) et largeurCanvasCss = largeur AFFICHÉE non zoomée LUE EN DIRECT (ResizeObserver). Le point-clé : le
//   bitmap peut avoir été rendu à UNE largeur (canvasPx fixe) et être AFFICHÉ à une AUTRE largeur (largeurAffichee), sans re-rendu — la
//   3e largeur du niveau 3, ou un simple redimensionnement de fenêtre. `versCssLive` modélise EXACTEMENT ce cas.
function versCssLive(canvasPx: number, canvasHpx: number, scale: number, largeurAffichee: number, p: { x: number; y: number }) {
  const vx = p.x * scale, vy = canvasHpx - p.y * scale;   // convertToViewportPoint (device px), sémantique pdf.js
  const ratioAffichage = canvasPx / largeurAffichee;      // apercu.largeurCanvasPx / largeurCanvasCss (LIVE)
  return { x: vx / ratioAffichage, y: vy / ratioAffichage };
}
// L'ANCIEN versCss (avant lot 3) : ratio FIGÉ au rendu (canvas.width / largeur AU RENDU). Sert à PROUVER par contraste qu'à une largeur
//   NON re-rendue il place le repère à côté — c'est le décalage silencieux que le ratio d'affichage live corrige.
function versCssFige(canvasPx: number, canvasHpx: number, scale: number, largeurAuRendu: number, p: { x: number; y: number }) {
  const vx = p.x * scale, vy = canvasHpx - p.y * scale;
  const ratioFige = canvasPx / largeurAuRendu;            // apercu.ratio (instantané du re-rendu)
  return { x: vx / ratioFige, y: vy / ratioFige };
}

const pageWpt = 600, pageHpt = 800;
// N LARGEURS ARBITRAIRES — chacune : autre scale de RENDU (→ autre canvasW) ET autre largeur d'AFFICHAGE (→ ratio LIVE distinct = canvasW/displayW).
//   On inclut des valeurs NON rondes et des sous-échelles : l'invariance ne doit rien devoir à des cas « ronds » particuliers.
const LARGEURS = [
  vue(pageWpt, pageHpt, 1.0, 480),    // W1 — vue normale
  vue(pageWpt, pageHpt, 3.2, 1400),   // W2 — plein écran 2 colonnes
  vue(pageWpt, pageHpt, 2.1, 900),    // W3 — image seule (à venir)
  vue(pageWpt, pageHpt, 1.37, 613),   // largeurs NON rondes
  vue(pageWpt, pageHpt, 4.8, 2007),
  vue(pageWpt, pageHpt, 0.75, 355),   // sous-échelle
  vue(pageWpt, pageHpt, 5.5, 1024),
];
const FRACTIONS: [number, number][] = [[0.37, 0.62], [0.5, 0.25], [0.08, 0.91], [0.999, 0.001], [0.1234, 0.8766]];

describe('PROJ-AGR — INVARIANCE EN LARGEUR (ratio live) : le point posé ne dépend PAS de la largeur d’affichage', () => {
  it('(a) la MÊME fraction d’affichage → le MÊME point PDF à N largeurs arbitraires, ET l’ancre absolue (tolérance 1e-9)', () => {
    for (const [f, g] of FRACTIONS) {
      const pts = LARGEURS.map((v) => poser(v, f * v.displayW, g * v.displayH));
      for (const p of pts) {
        expect(p.x).toBeCloseTo(f * pageWpt, 9);           // ancre absolue : fraction f de la page, indépendante de scale ET de displayW
        expect(p.y).toBeCloseTo((1 - g) * pageHpt, 9);     // Y inversé (fraction g depuis le haut)
      }
      for (const p of pts) { expect(p.x).toBeCloseTo(pts[0].x, 9); expect(p.y).toBeCloseTo(pts[0].y, 9); } // toutes les largeurs concordent entre elles
    }
  });

  it('(b) ALLER-RETOUR à N largeurs : un point posé re-projette à la MÊME fraction d’affichage dans TOUTES les vues', () => {
    const p = poser(LARGEURS[0], 0.5 * LARGEURS[0].displayW, 0.25 * LARGEURS[0].displayH);
    const fracs = LARGEURS.map((v) => { const d = versDisplay(v, p); return { fx: d.x / v.displayW, fy: d.y / v.displayH }; });
    for (const fr of fracs) { expect(fr.fx).toBeCloseTo(fracs[0].fx, 9); expect(fr.fy).toBeCloseTo(fracs[0].fy, 9); }
    expect(fracs[0].fx).toBeCloseTo(0.5, 9); expect(fracs[0].fy).toBeCloseTo(0.25, 9); // ancre : re-projette bien à la fraction d'origine
  });

  it('(c) compteur de calage et tracé IDENTIQUES quelle que soit la largeur (guidageTrace ne dépend pas de la taille de rendu)', () => {
    expect(guidageTrace('calage', 1, false, 0, true).titre).toContain('(1/2)');
    expect(guidageTrace('calage', 2, false, 0, true).titre).toContain('✓ 2 points');
    expect(guidageTrace('trace', 2, false, 3, true).titre).toContain('3 sommets');
  });
});

// LOT 3 — INVARIANCE EN LARGEUR DES REPÈRES. Le lot F avait rendu le CLIC (écran→PDF) exact à N largeurs mais laissé versCss (PDF→écran,
//   les repères) sur le ratio FIGÉ au re-rendu — exact seulement aux largeurs re-rendues. Ce lot introduit une 3e largeur (niveau 3) NON
//   forcément re-rendue à l'instant de l'affichage → il fallait rendre les REPÈRES eux aussi exacts à N largeurs. Mécanisme : ratio
//   d'affichage LIVE (largeurCanvasPx/largeurCanvasCss, largeurCanvasCss observée). On PROUVE la PROPRIÉTÉ D'INVARIANCE demandée : un sommet
//   ENREGISTRÉ (point PDF fixe) s'AFFICHE à la MÊME FRACTION d'affichage à N largeurs arbitraires, y compris une largeur NON re-rendue ;
//   l'aller-retour poser→afficher→re-poser est invariant en largeur pour le POINT ET pour son REPÈRE. TOLÉRANCE 1e-9 (IEEE754 seul).
describe('LOT 3 — INVARIANCE EN LARGEUR DES REPÈRES (ratio d’affichage live) : un sommet enregistré s’affiche à la MÊME fraction partout', () => {
  const pageW = 600, pageH = 800;
  // UN SEUL rendu (canvas figé), AFFICHÉ à N largeurs arbitraires SANS re-rendu — le cas exact du niveau 3 non re-rendu / d'un resize.
  const scaleRendu = 2.1, canvasPx = pageW * scaleRendu, canvasHpx = pageH * scaleRendu; // bitmap rendu à 2,1× (1260×1680 device px)
  const LARGEURS_AFFICHAGE = [480, 900, 1400, 613, 2007, 355, 1024, 1261.37]; // arbitraires, non rondes, dont une ≈ largeur de rendu

  it('(e) un point PDF fixe → MÊME fraction d’affichage à N largeurs (repère invariant en largeur, sans re-rendu)', () => {
    // p enregistré = fractions (0,37 ; 0,62) de la page (x depuis la gauche, y depuis le HAUT → p.y = (1−0,62)·pageH).
    const p = { x: 0.37 * pageW, y: (1 - 0.62) * pageH };
    const fracs = LARGEURS_AFFICHAGE.map((W) => {
      const d = versCssLive(canvasPx, canvasHpx, scaleRendu, W, p);
      const displayH = canvasHpx * (W / canvasPx); // canvas en width:100% → hauteur affichée = canvasHpx·(W/canvasPx)
      return { fx: d.x / W, fy: d.y / displayH };
    });
    for (const fr of fracs) {
      expect(fr.fx).toBeCloseTo(0.37, 9);          // fraction X constante = p.x/pageW, quelle que soit la largeur d'affichage
      expect(fr.fy).toBeCloseTo(0.62, 9);          // fraction Y constante = 1 − p.y/pageH
    }
    for (const fr of fracs) { expect(fr.fx).toBeCloseTo(fracs[0].fx, 9); expect(fr.fy).toBeCloseTo(fracs[0].fy, 9); }
  });

  it('(f) ALLER-RETOUR poser→afficher→re-poser invariant en largeur pour le POINT ET son REPÈRE', () => {
    // On POSE à une largeur (W_pose), on AFFICHE le repère à une AUTRE largeur (W_aff, non re-rendue), puis on RE-POSE à l'endroit du repère
    //   dans une TROISIÈME largeur (W_repose) : on doit retrouver le MÊME point PDF, et la fraction du repère = fraction de pose.
    for (const [fPose, gPose] of FRACTIONS) {
      const vPose = vue(pageW, pageH, scaleRendu, 900);
      const p = poser(vPose, fPose * vPose.displayW, gPose * vPose.displayH); // POINT enregistré
      for (const Waff of LARGEURS_AFFICHAGE) {
        const d = versCssLive(canvasPx, canvasHpx, scaleRendu, Waff, p);       // REPÈRE affiché à Waff (bitmap NON re-rendu)
        const displayHaff = canvasHpx * (Waff / canvasPx);
        expect(d.x / Waff).toBeCloseTo(fPose, 9);                              // le repère est à la fraction de pose…
        expect(d.y / displayHaff).toBeCloseTo(gPose, 9);                       // …en X ET en Y
        // RE-POSER à l'endroit du repère, dans une vue de largeur Waff (ratio live = canvasPx/Waff) → même point PDF (aller-retour exact).
        const vRepose = { ratio: canvasPx / Waff, displayW: Waff, displayH: displayHaff,
          vp: { convertToPdfPoint: (x: number, y: number): number[] => [x / scaleRendu, (canvasHpx - y) / scaleRendu],
                convertToViewportPoint: (px: number, py: number): number[] => [px * scaleRendu, canvasHpx - py * scaleRendu] } };
        const p2 = poser(vRepose, d.x, d.y);
        expect(p2.x).toBeCloseTo(p.x, 9); expect(p2.y).toBeCloseTo(p.y, 9);
      }
    }
  });

  it('(g) CONTRASTE — le ratio FIGÉ (apercu.ratio) place le repère à CÔTÉ dès que la largeur diffère du rendu ; le live le corrige', () => {
    const p = { x: 0.5 * pageW, y: (1 - 0.25) * pageH };
    const Wrendu = 900, Wautre = 1400; // largeur affichée ≠ largeur de rendu (niveau 3 non re-rendu)
    const displayHautre = canvasHpx * (Wautre / canvasPx);
    const live = versCssLive(canvasPx, canvasHpx, scaleRendu, Wautre, p);
    const fige = versCssFige(canvasPx, canvasHpx, scaleRendu, Wrendu, p);
    expect(live.x / Wautre).toBeCloseTo(0.5, 9);                 // LIVE : bonne fraction
    expect(live.y / displayHautre).toBeCloseTo(0.25, 9);
    // FIGÉ : fraction dérivée du rapport Wrendu/Wautre → PAS 0,5 (décalage silencieux que ce lot supprime).
    expect(fige.x / Wautre).toBeCloseTo(0.5 * (Wrendu / Wautre), 9);
    expect(Math.abs(fige.x / Wautre - 0.5)).toBeGreaterThan(0.15); // ≈ 0,18 d'écart de fraction : bien visible, pas un epsilon
  });
});

describe('PROJ-AGR — (d) planche PASSIVE + mécanisme du RATIO LIVE (gardes de source)', () => {
  const lis = readFileSync(fileURLToPath(new URL('./LiseusePieces.tsx', import.meta.url)), 'utf8');
  const bloc = readFileSync(fileURLToPath(new URL('./BlocTraceEmprise.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  it('LiseusePieces : agrandi PRÉSENT mais PASSIF — aucun cliquerPdf, aucun convertToPdfPoint (un clic n’y pose rien)', () => {
    expect(lis).toContain('imageAgrandie');
    expect(lis).not.toContain('convertToPdfPoint');
    expect(lis).not.toContain('cliquerPdf');
  });
  it('BlocTraceEmprise : le mapping écran→PDF utilise un RATIO LIVE (getBoundingClientRect dé-zoomée) → exact à N largeurs, plus l’instantané apercu.ratio', () => {
    // la source de justesse du clic = un ratio LIVE, lu au moment de l'usage via un helper partagé (appelé dans un gestionnaire d'événement)
    expect(bloc).toContain('const ratioLive = useCallback');
    expect(bloc).toContain('const larg = c.getBoundingClientRect().width');      // MÊME mesure fractionnaire que r (à :550) → exact, pas de sous-pixel
    expect(bloc).toContain('(c.width * z) / larg');                              // ÷ largeur DÉ-ZOOMÉE (z = zoom) → canvas-px par px-affiché non zoomé
    // cliquerPdf compose avec ce ratio LIVE (le viewport apercu.vp, lui, ne change pas — cf. tracage.filet : deux rendus distincts)
    expect(bloc).toContain('apercu.vp.convertToPdfPoint(u.x * rl, u.y * rl)');
    expect(bloc).not.toContain('u.x * apercu.ratio');                           // l'ancienne composition FIGÉE du clic a disparu
  });
  it('LOT 3 — versCss (repères) utilise un RATIO D’AFFICHAGE LIVE (largeurCanvasPx / largeurCanvasCss), alimenté par un ResizeObserver', () => {
    // la source de justesse des repères = un ratio d'affichage live, PLUS l'instantané apercu.ratio (repli seulement)
    expect(bloc).toContain('apercu.largeurCanvasPx / largeurCanvasCss');        // ratio d'affichage LIVE (px-device du rendu ÷ largeur affichée live)
    expect(bloc).toContain('const versCss = (p: PointPlan)');
    expect(bloc).toContain('vx / ratioAffichage');                             // versCss divise par le ratio d'affichage (live), plus par apercu.ratio directement
    // largeurCanvasCss est la largeur AFFICHÉE non zoomée, observée EN CONTINU par un ResizeObserver sur le conteneur HORS zoom
    expect(bloc).toContain('new ResizeObserver');
    expect(bloc).toContain('setLargeurCanvasCss');
    // apercu porte le nombre de px-device du canvas (canvas.width) → couplé à la largeur affichée live pour le ratio des repères
    expect(bloc).toContain('largeurCanvasPx: canvas.width');
  });
  it('LOT 3 — le NIVEAU 3 (plan seul) : re-rendu à sa largeur (deps), Échap → retour niveau 2, calage indisponible (mode forcé trace)', () => {
    expect(bloc).toContain('const [planSeul, setPlanSeul] = useState(false)');
    expect(bloc).toContain('[pieceId, page, etat, imageAgrandie, planSeul]');   // le canvas se re-rend à la largeur du niveau 3 (netteté)
    expect(bloc).toContain('setMode(\'trace\'); setPlanSeul(true)');            // entrée niveau 3 : tracé actif, calage indisponible (pas de schéma)
    expect(bloc).toContain('if (e.key === \'Escape\') setPlanSeul(false)');     // sortie niveau 3 → retour niveau 2
    expect(bloc).toContain('if (e.key === \'Escape\' && !planSeul)');           // Échap du niveau 2 neutralisé tant que le niveau 3 est ouvert
  });
});
