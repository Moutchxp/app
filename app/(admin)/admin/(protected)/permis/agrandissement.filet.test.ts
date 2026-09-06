import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ecranVersCanvas } from '../../../../lib/permis/calageEmprise';
import { guidageTrace } from './TraceEmpriseRendu';

/**
 * PROJ-AGR — FILET de l'AGRANDISSEMENT INTERACTIF (« tracer en grand »). Prouve, sur le modèle de tracage.filet.test.ts, que la vue
 * agrandie recalcule sa conversion écran→PDF POUR ELLE-MÊME (autre scale de rendu, autre largeur d'affichage) et pose donc les points
 * au MÊME endroit géométrique que la vue normale. Le mécanisme réel : `imageAgrandie` est dans les deps de l'effet d'auto-affichage →
 * le canvas se re-rend à la largeur de la nouvelle vue → apercu/ratio se recalculent ; cliquerPdf (composition inchangée) devient exact
 * pour cette vue. TOLÉRANCE retenue : 1e-9 (flottant) — la construction est EXACTE (aucun arrondi), la tolérance ne couvre que l'IEEE754.
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
// Réplique EXACTE de BlocTraceEmprise.versCss (PDF → position d'affichage).
function versDisplay(v: ReturnType<typeof vue>, p: { x: number; y: number }) {
  const [vx, vy] = v.vp.convertToViewportPoint(p.x, p.y);
  return { x: vx / v.ratio, y: vy / v.ratio };
}

const pageWpt = 600, pageHpt = 800;
const petite = vue(pageWpt, pageHpt, 1.0, 480);   // vue NORMALE
const grande = vue(pageWpt, pageHpt, 3.2, 1400);  // vue AGRANDIE : autre scale de rendu ET autre largeur d'affichage

describe('PROJ-AGR — exactitude au pixel de la vue agrandie', () => {
  it('(a) même FRACTION d’affichage cliquée dans les deux vues → MÊME point PDF (tolérance 1e-9)', () => {
    const f = 0.37, g = 0.62; // fractions horizontale / verticale du plan
    const pPetit = poser(petite, f * petite.displayW, g * petite.displayH);
    const pGrand = poser(grande, f * grande.displayW, g * grande.displayH);
    expect(pGrand.x).toBeCloseTo(pPetit.x, 9);
    expect(pGrand.y).toBeCloseTo(pPetit.y, 9);
    expect(pPetit.x).toBeCloseTo(f * pageWpt, 9);           // repère absolu : le point PDF est bien la fraction f de la page
    expect(pPetit.y).toBeCloseTo((1 - g) * pageHpt, 9);     // Y inversé (fraction g depuis le haut)
  });

  it('(b) ALLER-RETOUR grand ↔ petit : un point déjà posé ne se déplace PAS (même fraction d’affichage dans les deux vues)', () => {
    const p = poser(petite, 0.5 * petite.displayW, 0.25 * petite.displayH); // posé en petit
    const dPetit = versDisplay(petite, p), dGrand = versDisplay(grande, p);
    expect(dGrand.x / grande.displayW).toBeCloseTo(dPetit.x / petite.displayW, 9);
    expect(dGrand.y / grande.displayH).toBeCloseTo(dPetit.y / petite.displayH, 9);
  });

  it('(c) compteur de calage et tracé IDENTIQUES dans les deux vues (guidageTrace ne dépend pas de la taille de rendu)', () => {
    expect(guidageTrace('calage', 1, false, 0, true).titre).toContain('(1/2)');
    expect(guidageTrace('calage', 2, false, 0, true).titre).toContain('✓ 2 points');
    expect(guidageTrace('trace', 2, false, 3, true).titre).toContain('3 sommets');
  });
});

describe('PROJ-AGR — (d) planche PASSIVE + mécanisme d’exactitude (gardes de source)', () => {
  const lis = readFileSync(fileURLToPath(new URL('./LiseusePieces.tsx', import.meta.url)), 'utf8');
  const bloc = readFileSync(fileURLToPath(new URL('./BlocTraceEmprise.tsx', import.meta.url)), 'utf8').replace(/\s+/g, ' ');
  it('LiseusePieces : agrandi PRÉSENT mais PASSIF — aucun cliquerPdf, aucun convertToPdfPoint (un clic n’y pose rien)', () => {
    expect(lis).toContain('imageAgrandie');
    expect(lis).not.toContain('convertToPdfPoint');
    expect(lis).not.toContain('cliquerPdf');
  });
  it('BlocTraceEmprise : l’agrandi re-déclenche le rendu (deps imageAgrandie) → apercu/ratio recalculés ; composition cliquerPdf INCHANGÉE', () => {
    expect(bloc).toContain('[pieceId, page, etat, imageAgrandie]');
    expect(bloc).toContain('apercu.vp.convertToPdfPoint(u.x * apercu.ratio, u.y * apercu.ratio)');
  });
});
