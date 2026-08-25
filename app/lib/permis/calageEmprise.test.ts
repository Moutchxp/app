import { describe, it, expect } from 'vitest';
import {
  calculerSimilitude, appliquerSimilitude, echelleImpliciteMParPt, ratioEchelleImplicite,
  echelleDeclareeMParPt, residuFitM, residuEchelleDeclareeM, verdictCalage, aireM2, anneauVersLambert,
  verdictVraisemblance, SEUIL_RESIDU_CALAGE_M, type PaireCalage,
  cadreDeAnneaux, projeterDansBoite, inverseDepuisBoite, type Boite,
} from './calageEmprise';

const paire = (px: number, py: number, lx: number, ly: number): PaireCalage => ({ plan: { x: px, y: py }, lambert: { x: lx, y: ly } });

describe('PROJ-2 — similitude plan→Lambert (moindres carrés complexes)', () => {
  it('TRANSLATION seule : c = 1, décalage (10, 20)', () => {
    const s = calculerSimilitude([paire(0, 0, 10, 20), paire(1, 0, 11, 20)])!;
    expect(s.a).toBeCloseTo(1, 9); expect(s.b).toBeCloseTo(0, 9);
    expect(s.tx).toBeCloseTo(10, 9); expect(s.ty).toBeCloseTo(20, 9);
    const q = appliquerSimilitude(s, { x: 5, y: 5 });
    expect(q.x).toBeCloseTo(15, 9); expect(q.y).toBeCloseTo(25, 9);
  });

  it('ROTATION seule (90°) : c = i, aucune translation', () => {
    const s = calculerSimilitude([paire(1, 0, 0, 1), paire(0, 1, -1, 0)])!;
    expect(s.a).toBeCloseTo(0, 9); expect(s.b).toBeCloseTo(1, 9);
    expect(s.tx).toBeCloseTo(0, 9); expect(s.ty).toBeCloseTo(0, 9);
    expect(echelleImpliciteMParPt(s)).toBeCloseTo(1, 9); // rotation pure → échelle 1
  });

  it('ÉCHELLE seule (×3) : c = 3', () => {
    const s = calculerSimilitude([paire(1, 0, 3, 0), paire(0, 1, 0, 3)])!;
    expect(s.a).toBeCloseTo(3, 9); expect(s.b).toBeCloseTo(0, 9);
    expect(echelleImpliciteMParPt(s)).toBeCloseTo(3, 9);
  });

  it('LES TROIS combinées : échelle ×2, rotation 90°, translation (5, −1)', () => {
    // p ↦ 2·R90·p + (5,−1) ; R90(x,y) = (−y, x)
    const s = calculerSimilitude([paire(1, 0, 5, 1), paire(0, 1, 3, -1)])!;
    expect(s.a).toBeCloseTo(0, 9); expect(s.b).toBeCloseTo(2, 9);
    expect(s.tx).toBeCloseTo(5, 9); expect(s.ty).toBeCloseTo(-1, 9);
    const q = appliquerSimilitude(s, { x: 2, y: 3 }); // 2·(−3)+5 = −1 ; 2·2 −1 = 3
    expect(q.x).toBeCloseTo(-1, 9); expect(q.y).toBeCloseTo(3, 9);
  });

  it('moins de 2 paires OU points plan confondus → null (pas d’échelle définissable)', () => {
    expect(calculerSimilitude([paire(0, 0, 1, 1)])).toBeNull();
    expect(calculerSimilitude([paire(2, 2, 0, 0), paire(2, 2, 9, 9)])).toBeNull(); // même point plan deux fois
  });
});

describe('PROJ-2 — résidus (visibles, jamais lissés)', () => {
  it('calage PARFAIT (2 points) → résidu de fit NUL', () => {
    const paires = [paire(0, 0, 100, 200), paire(10, 0, 130, 200)];
    const s = calculerSimilitude(paires)!;
    expect(residuFitM(s, paires)).toBeCloseTo(0, 9);
  });

  it('3e repère INCOHÉRENT → résidu de fit NON nul (détecté)', () => {
    const paires = [paire(0, 0, 0, 0), paire(10, 0, 10, 0), paire(0, 10, 3, 12)]; // le 3e ne suit pas la similitude des 2 premiers
    const s = calculerSimilitude(paires)!;
    expect(residuFitM(s, paires)).toBeGreaterThan(SEUIL_RESIDU_CALAGE_M);
  });

  it('échelle déclarée : résidu non nul si la feuille ment (implicite ≠ déclarée), verdict « douteux »', () => {
    // calage à l'échelle 1:100 (0,0254/72×100 m/pt), mais la feuille annonce « 1:1000 » (note de révision)
    const mParPt100 = echelleDeclareeMParPt(100);
    const paires = [paire(0, 0, 0, 0), paire(100, 0, 100 * mParPt100, 0)]; // base 100 pt → 100×0,0353 m réels
    const s = calculerSimilitude(paires)!;
    expect(ratioEchelleImplicite(s)).toBeCloseTo(100, 3); // le calage dit bien 1:100
    const resid = residuEchelleDeclareeM(s, paires, 1000)!; // la feuille dit 1:1000
    expect(resid).toBeGreaterThan(0);
    const v = verdictCalage(s, paires, 1000);
    expect(v.douteux).toBe(true);
    expect(v.raisons.join(' ')).toMatch(/échelle/);
    // même feuille, échelle déclarée COHÉRENTE (1:100) → pas d'alerte d'échelle
    expect(verdictCalage(s, paires, 100).douteux).toBe(false);
  });
});

describe('PROJ-2 — aire & vraisemblance', () => {
  it('aire d’un carré 10×10 Lambert = 100 m² (sens de parcours indifférent)', () => {
    const carre = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(aireM2(carre)).toBeCloseTo(100, 9);
    expect(aireM2([...carre].reverse())).toBeCloseTo(100, 9); // horaire ou anti-horaire : |aire| identique
    expect(aireM2([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0); // < 3 sommets
  });

  it('anneauVersLambert : tracé plan → anneau Lambert via la similitude, aire cohérente', () => {
    const s = calculerSimilitude([paire(0, 0, 0, 0), paire(1, 0, 2, 0)])!; // échelle ×2
    const anneau = anneauVersLambert(s, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]);
    expect(aireM2(anneau)).toBeCloseTo(100, 6); // carré 5×5 pt × échelle² (2²) = 100 m²
  });

  it('vraisemblance : cohérente (plancher/étages), et 🔴 dépassement du terrain signalé sans bloquer', () => {
    const ok = verdictVraisemblance({ aireM2: 300, surfacePlancherM2: 900, nbEtages: 3, surfaceTerrainM2: 2886.5 });
    expect(ok.empriseVsPlancher).toBe('coherent');
    expect(ok.empriseAttendueM2).toBeCloseTo(300, 6);
    expect(ok.depasseTerrain).toBe(false);
    const trop = verdictVraisemblance({ aireM2: 3000, surfacePlancherM2: 900, nbEtages: 3, surfaceTerrainM2: 2886.5 });
    expect(trop.depasseTerrain).toBe(true);
    expect(trop.messages.join(' ')).toMatch(/SUPÉRIEURE au terrain/);
    // données manquantes → 'inconnu', aucun message inventé
    expect(verdictVraisemblance({ aireM2: 300, surfacePlancherM2: null, nbEtages: null, surfaceTerrainM2: null }).empriseVsPlancher).toBe('inconnu');
  });
});

describe('PROJ-2 — projection parcelle ↔ boîte (dessin ↔ clic), aller-retour EXACT', () => {
  const anneaux = [[{ x: 1000, y: 2000 }, { x: 1050, y: 2000 }, { x: 1050, y: 2040 }, { x: 1000, y: 2040 }]];
  const b: Boite = { largeur: 320, hauteur: 240, marge: 12, cadre: cadreDeAnneaux(anneaux)! };
  it('cadre = bbox Lambert des anneaux', () => {
    expect(b.cadre).toEqual({ minX: 1000, maxX: 1050, minY: 2000, maxY: 2040 });
  });
  it('inverse(projeter(p)) = p pour chaque sommet (Y inversé compris)', () => {
    for (const p of anneaux[0]) {
      const r = inverseDepuisBoite(b, projeterDansBoite(b, p));
      expect(r.x).toBeCloseTo(p.x, 6); expect(r.y).toBeCloseTo(p.y, 6);
    }
  });
  it('Y est inversé : un point plus AU NORD (y grand) se projette plus HAUT (py petit)', () => {
    const bas = projeterDansBoite(b, { x: 1025, y: 2000 });
    const haut = projeterDansBoite(b, { x: 1025, y: 2040 });
    expect(haut.y).toBeLessThan(bas.y);
  });
});
