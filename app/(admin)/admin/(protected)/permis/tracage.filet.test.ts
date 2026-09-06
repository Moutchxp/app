import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ecranVersCanvas } from '../../../../lib/permis/calageEmprise';
import { guidageTrace } from './TraceEmpriseRendu';

/**
 * FILET DE SÉCURITÉ du CALAGE / TRACÉ (chantier « unification des visionneuses », Option 1). C'est la finalité du module :
 * définir et valider les polygones projetés au PIXEL PRÈS. Ce filet VERROUILLE la chaîne de capture de clic AVANT toute modification
 * autour des visionneuses (parité, best-of, agrandissement) — il doit passer À L'IDENTIQUE avant et après.
 *
 * ⚠️ Les fonctions PURES de la chaîne (ecranVersCanvas, calculerSimilitude, anneauVersLambert, projeterDansBoite / inverseDepuisBoite,
 * aireM2, residuFitM…) sont DÉJÀ couvertes par `app/lib/permis/calageEmprise.test.ts` (31 cas). Le trou que ce fichier comble : la
 * COMPOSITION réellement utilisée dans le composant `BlocTraceEmprise` (cliquerPdf = ecranVersCanvas → ×ratio → convertToPdfPoint ;
 * versCss = convertToViewportPoint → ÷ratio) + le COMPTEUR de calage (guidageTrace), qui n'avaient AUCUN test.
 *
 * 🔴 POURQUOI DEUX RENDUS PDF DISTINCTS RESTENT DEUX (ne pas « nettoyer » plus tard) : la visionneuse de « Bâtiments et projection »
 * calcule le viewport pdf.js au scale `(largeurCss/base)·dpr` avec **dpr NON plafonné** et stocke `apercu={vp,ratio}` ; le calage lit
 * `apercu.vp.convertToPdfPoint(u·ratio)`. La liseuse de la planche, elle, plafonne le dpr à 2 + borne le canvas à MAX_PX et peint un
 * ImageBitmap (pas de viewport exposé). Adopter le rendu de la planche côté tracé CHANGERAIT le viewport → décalerait tous les points
 * posés, au pixel, SILENCIEUSEMENT et sans test. D'où la décision Arno (31/08/2026) de garder deux rendus. Ce filet est le garde-fou.
 */

// Faux viewport pdf.js : convertToPdfPoint / convertToViewportPoint sont des INVERSES EXACTS (échelle s, hauteur Hpx, Y inversé) —
//   modèle suffisant et fidèle à la sémantique pdf.js pour prouver la COMPOSITION du composant.
function fauxViewport(s: number, hPx: number) {
  return {
    convertToPdfPoint: (x: number, y: number): number[] => [x / s, (hPx - y) / s],
    convertToViewportPoint: (px: number, py: number): number[] => [px * s, hPx - py * s],
  };
}
// Réplique EXACTE de BlocTraceEmprise.cliquerPdf (le repère de coordonnées à préserver au pixel).
function poserPoint(vp: ReturnType<typeof fauxViewport>, ratio: number, clientX: number, clientY: number, left: number, top: number, pan: { x: number; y: number }, zoom: number) {
  const u = ecranVersCanvas(clientX, clientY, left, top, pan, zoom);
  const [px, py] = vp.convertToPdfPoint(u.x * ratio, u.y * ratio);
  return { x: px, y: py };
}
// Réplique EXACTE de BlocTraceEmprise.versCss (overlay des points posés).
function versCss(vp: ReturnType<typeof fauxViewport>, ratio: number, p: { x: number; y: number }) {
  const [vx, vy] = vp.convertToViewportPoint(p.x, p.y);
  return { x: vx / ratio, y: vy / ratio };
}

describe('FILET calage — composition cliquerPdf : le point tombe au bon endroit, INDÉPENDAMMENT du zoom/pan', () => {
  const vp = fauxViewport(2, 1000);
  const ratio = 1.5;
  it('zoom 1 / pan 0 : point PDF = convertToPdfPoint((clientX−left)·ratio, (clientY−top)·ratio)', () => {
    // u = (60,50) ; ·ratio = (90,75) ; convertToPdfPoint = (45 ; (1000−75)/2 = 462,5)
    expect(poserPoint(vp, ratio, 80, 60, 20, 10, { x: 0, y: 0 }, 1)).toEqual({ x: 45, y: 462.5 });
  });
  it('🔴 MÊME point PDF quels que soient le zoom ET le pan (ecranVersCanvas les annule → calage exact)', () => {
    const base = poserPoint(vp, ratio, 80, 60, 20, 10, { x: 0, y: 0 }, 1);
    const u = ecranVersCanvas(80, 60, 20, 10, { x: 0, y: 0 }, 1);
    // le clic ÉCRAN qui vise le MÊME point du document, à zoom 2 + pan (12,7) : screen = left + pan + u·zoom
    const p2 = poserPoint(vp, ratio, 20 + 12 + u.x * 2, 10 + 7 + u.y * 2, 20, 10, { x: 12, y: 7 }, 2);
    expect(p2.x).toBeCloseTo(base.x, 9);
    expect(p2.y).toBeCloseTo(base.y, 9);
  });
  it('🔴 ALLER-RETOUR overlay : versCss(point posé) redonne les coords canvas du clic (le repère se pose OÙ on a cliqué)', () => {
    const u = ecranVersCanvas(80, 60, 20, 10, { x: 0, y: 0 }, 1);
    const css = versCss(vp, ratio, poserPoint(vp, ratio, 80, 60, 20, 10, { x: 0, y: 0 }, 1));
    expect(css.x).toBeCloseTo(u.x, 9);
    expect(css.y).toBeCloseTo(u.y, 9);
  });
});

describe('FILET calage — compteur guidageTrace : 0/2 → point posé → 1/2 → 2/2, puis tracé', () => {
  it('calage : 0/2 → « Point posé » (attente schéma) → 1/2 → ✓ 2 points', () => {
    expect(guidageTrace('calage', 0, false, 0, true).titre).toContain('(0/2)');
    expect(guidageTrace('calage', 0, true, 0, true).instruction).toContain('Point posé sur le plan'); // 1er point de plan posé
    expect(guidageTrace('calage', 1, false, 0, true).titre).toContain('(1/2)');                        // 1re paire complète
    expect(guidageTrace('calage', 2, false, 0, true).titre).toContain('✓ 2 points');                   // 2/2
  });
  it('tracé : le compteur suit le nombre de sommets ; 3 → contour fermé (Enregistrer)', () => {
    expect(guidageTrace('trace', 2, false, 1, true).titre).toContain('1 sommet');
    expect(guidageTrace('trace', 2, false, 3, true).titre).toContain('3 sommets');
    expect(guidageTrace('trace', 2, false, 3, true).instruction).toContain('Enregistrer');
  });
  it('vue NON traçable → « Traçage indisponible » (jamais un point posé sur une vue non-plan)', () => {
    expect(guidageTrace('calage', 0, false, 0, false).titre).toBe('Traçage indisponible');
  });
});

describe('FILET calage — gardes de SOURCE : capture ACTIVE côté Bâtiments, PASSIVE côté planche', () => {
  const bloc = readFileSync(fileURLToPath(new URL('./BlocTraceEmprise.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  const lis = readFileSync(fileURLToPath(new URL('./LiseusePieces.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  it('BlocTraceEmprise : le pointer-up de l’aperçu route vers cliquerPdf, composition de coordonnées inchangée', () => {
    expect(bloc).toContain('cliquerPdf(e.clientX, e.clientY)');
    expect(bloc).toContain('apercu.vp.convertToPdfPoint(u.x * apercu.ratio, u.y * apercu.ratio)');
  });
  it('LiseusePieces (planche) : PASSIVE — aucun cliquerPdf, aucun convertToPdfPoint (un clic n’y pose RIEN)', () => {
    expect(lis).not.toContain('convertToPdfPoint');
    expect(lis).not.toContain('cliquerPdf');
  });
});
