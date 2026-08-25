import { describe, it, expect } from 'vitest';
import {
  calculerSimilitude, appliquerSimilitude, echelleImpliciteMParPt, ratioEchelleImplicite,
  echelleDeclareeMParPt, residuFitM, residuEchelleDeclareeM, verdictCalage, aireM2, anneauVersLambert,
  verdictVraisemblance, deriverDebordement, SEUIL_RESIDU_CALAGE_M, type PaireCalage,
  cadreDeAnneaux, projeterDansBoite, inverseDepuisBoite, rotePoint, boiteEnglobanteRotee, clicVersBoite, ecranVersCanvas, estClic, type Boite,
} from './calageEmprise';

const paire = (px: number, py: number, lx: number, ly: number): PaireCalage => ({ plan: { x: px, y: py }, lambert: { x: lx, y: ly } });

describe('PROJ-3j — rotation du schéma : PARAMÈTRE D’AFFICHAGE, géométrie invariante', () => {
  const C = { x: 150, y: 115 }; // centre de la boîte
  const proche = (a: { x: number; y: number }, b: { x: number; y: number }) => { expect(a.x).toBeCloseTo(b.x, 9); expect(a.y).toBeCloseTo(b.y, 9); };

  it('0° = identité (à la précision flottante)', () => {
    proche(rotePoint({ x: 40, y: 200 }, C, 0), { x: 40, y: 200 });
  });
  it('90° / 180° : valeurs attendues (sens SVG horaire, y-bas)', () => {
    // 180° = symétrie centrale
    proche(rotePoint({ x: 200, y: 100 }, C, 180), { x: 2 * C.x - 200, y: 2 * C.y - 100 });
    // 90° : (dx,dy) -> (-dy, dx)
    const p = { x: 200, y: 100 }, dx = p.x - C.x, dy = p.y - C.y;
    proche(rotePoint(p, C, 90), { x: C.x - dy, y: C.y + dx });
  });
  it('🔴 INVERSE EXACT : dé-tourner (−θ) un clic tourné (+θ) rend le point d’origine, pour 0/90/180/37°', () => {
    for (const theta of [0, 90, 180, 37, 213.5]) {
      for (const q of [{ x: 40, y: 200 }, { x: 260, y: 30 }, { x: 12.7, y: 199.3 }]) {
        // q = point NON tourné ; le clic sur le schéma tourné est rotePoint(q, C, θ) ; on le dé-tourne :
        proche(rotePoint(rotePoint(q, C, theta), C, -theta), q);
      }
    }
  });
  it('🔴 MÊME EMPRISE quel que soit l’angle : le box-point dé-tourné est IDENTIQUE à 0° et à 37°', () => {
    const boite: Boite = { largeur: 300, hauteur: 230, marge: 12, cadre: { minX: 0, maxX: 100, minY: 0, maxY: 80 } };
    const centre = { x: boite.largeur / 2, y: boite.hauteur / 2 };
    // Un même sommet géométrique cliqué : à 0° l'utilisateur clique Q ; à 37° il clique là où Q est affiché = rotePoint(Q, C, 37).
    const Q = { x: 90, y: 150 };
    const boxA0 = rotePoint(Q, centre, -0);                         // dé-rotation à 0°
    const boxA37 = rotePoint(rotePoint(Q, centre, 37), centre, -37); // dé-rotation à 37°
    proche(boxA0, boxA37);                                          // même box-point
    proche(inverseDepuisBoite(boite, boxA0), inverseDepuisBoite(boite, boxA37)); // ⇒ même Lambert ⇒ même emprise
  });
});

describe('PROJ-3k — le schéma remplit la largeur : ajustement (viewBox) et clic à toute échelle', () => {
  const proche = (a: { x: number; y: number }, b: { x: number; y: number }) => { expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6); };
  const boite: Boite = { largeur: 300, hauteur: 230, marge: 12, cadre: { minX: 0, maxX: 100, minY: 0, maxY: 80 } };
  const centre = { x: boite.largeur / 2, y: boite.hauteur / 2 };
  const pointsBox = [{ x: 20, y: 20 }, { x: 260, y: 30 }, { x: 250, y: 200 }, { x: 40, y: 190 }];

  it('boiteEnglobanteRotee : cadre serré + marge uniforme (proportions préservées) ; se réadapte à l’angle', () => {
    const vb0 = boiteEnglobanteRotee(pointsBox, centre, 0, 0);
    expect(vb0).toMatchObject({ minX: 20, minY: 20 });
    expect(vb0.w).toBeCloseTo(240); expect(vb0.h).toBeCloseTo(180); // bbox serrée (sans marge)
    const vb90 = boiteEnglobanteRotee(pointsBox, centre, 90, 0);
    // à 90° la bbox échange (à peu près) largeur/hauteur → aspect différent (réadaptation)
    expect(vb90.w).not.toBeCloseTo(vb0.w);
    // marge uniforme : le côté le plus grand porte la même marge des deux côtés
    const m = boiteEnglobanteRotee(pointsBox, centre, 0, 0.04);
    expect(m.w).toBeCloseTo(240 + 2 * 240 * 0.04);
  });

  it('forme TRÈS ALLONGÉE : bbox finie, non dégénérée, à 0° et à 45°', () => {
    const long = [{ x: 10, y: 100 }, { x: 290, y: 102 }, { x: 290, y: 108 }, { x: 10, y: 106 }];
    for (const a of [0, 45]) { const vb = boiteEnglobanteRotee(long, centre, a); expect(vb.w).toBeGreaterThan(0); expect(vb.h).toBeGreaterThan(0); expect(Number.isFinite(vb.w + vb.h)).toBe(true); }
  });

  it('🔴 MÊME box-point (donc même emprise) quels que soient l’ANGLE et la TAILLE DE RENDU', () => {
    const Q = { x: 130, y: 90 }; // sommet cliqué (coord de boîte non tournée)
    const clicPour = (angle: number, ew: number, eh: number) => {
      const vb = boiteEnglobanteRotee(pointsBox, centre, angle);
      const R = rotePoint(Q, centre, angle);                 // position AFFICHÉE (tournée)
      const ex = ((R.x - vb.minX) / vb.w) * ew, ey = ((R.y - vb.minY) / vb.h) * eh; // px écran
      return clicVersBoite(ex, ey, ew, eh, vb, centre, angle);
    };
    const ref = clicPour(0, 300, 230);
    proche(ref, Q); // à 0° et taille native, on retombe sur Q
    for (const [angle, ew, eh] of [[0, 600, 460], [37, 300, 230], [37, 640, 300], [213.5, 412, 500]] as [number, number, number][]) {
      const box = clicPour(angle, ew, eh);
      proche(box, Q);                                        // même box-point quel que soit l'angle/l'échelle
      proche(inverseDepuisBoite(boite, box), inverseDepuisBoite(boite, ref)); // ⇒ même Lambert ⇒ même emprise
    }
  });
});

describe('PROJ-3l — zoom/déplacement du document (PDF de gauche) : le calage reste exact', () => {
  const proche = (a: { x: number; y: number }, b: { x: number; y: number }) => { expect(a.x).toBeCloseTo(b.x, 6); expect(a.y).toBeCloseTo(b.y, 6); };
  it('🔴 ecranVersCanvas : annule zoom + pan → MÊME point du document quels que soient le zoom ET le déplacement', () => {
    const rectLeft = 40, rectTop = 15;
    const U = { x: 123.4, y: 88.2 }; // point naturel du canvas (zoom 1, pan 0)
    for (const [zoom, pan] of [[1, { x: 0, y: 0 }], [2, { x: 30, y: -10 }], [3.75, { x: -120, y: 200 }]] as [number, { x: number; y: number }][]) {
      const clientX = rectLeft + pan.x + zoom * U.x, clientY = rectTop + pan.y + zoom * U.y; // U s'affiche là à l'écran
      proche(ecranVersCanvas(clientX, clientY, rectLeft, rectTop, pan, zoom), U);            // on retombe TOUJOURS sur U → même PDF point
    }
  });
  it('estClic : petit tremblement → clic (point posé) ; vrai glissement → déplacement (pas de point)', () => {
    expect(estClic(0, 0)).toBe(true);
    expect(estClic(3, 3)).toBe(true);   // ~4,24 px < 5 → clic
    expect(estClic(4, 4)).toBe(false);  // ~5,66 px ≥ 5 → glissement
    expect(estClic(20, 0)).toBe(false); // glissement franc
  });
});

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

  // ── PROJ (correctif plausibilité) : les 3 situations + niveaux inconnu. Le nombre de niveaux est TOUJOURS celui du bâtiment. ──
  it('(a) PERMIS MONO-BÂTIMENT, niveaux du bâtiment connus → contrôle chiffré (plancher ÷ niveaux DU bâtiment)', () => {
    const bats = [{ corpsId: 1, nbEtages: 3, empriseM2: null }];
    const ok = verdictVraisemblance({ aireM2: 300, corpsId: 1, surfacePlancherM2: 900, surfaceTerrainM2: 2886.5, batiments: bats });
    expect(ok.empriseVsPlancher).toBe('coherent');
    expect(ok.empriseAttendueM2).toBeCloseTo(300, 6);           // 900 / 3, jamais un max du permis
    expect(ok.depasseTerrain).toBe(false);
    expect(ok.messages.join(' ')).toMatch(/niveaux du bâtiment/); // le texte explicite la déduction
    const petite = verdictVraisemblance({ aireM2: 120, corpsId: 1, surfacePlancherM2: 900, surfaceTerrainM2: 2886.5, batiments: bats });
    expect(petite.empriseVsPlancher).toBe('petite');
    expect(petite.messages.join(' ')).toMatch(/écart à vérifier/); // formulé comme un écart, pas une faute
    expect(petite.messages.join(' ')).not.toMatch(/faute|erreur|invalide/i);
  });

  it('🔴 dépassement du terrain signalé, jamais bloquant, quel que soit le nombre de bâtiments', () => {
    const trop = verdictVraisemblance({ aireM2: 3000, corpsId: 1, surfacePlancherM2: 900, surfaceTerrainM2: 2886.5, batiments: [{ corpsId: 1, nbEtages: 3, empriseM2: null }] });
    expect(trop.depasseTerrain).toBe(true);
    expect(trop.messages.join(' ')).toMatch(/SUPÉRIEURE au terrain/);
  });

  it('(b) PERMIS MULTI-BÂTIMENTS non tous tracés → AUCUN verdict par bâtiment, repère NEUTRE (plancher global)', () => {
    // cas mesuré 11434 : plancher 13032 du permis entier ÷ étages → l'ancien code criait « PETITE » à tort sur 2D2 (709 m²)
    const v = verdictVraisemblance({ aireM2: 709, corpsId: 2, surfacePlancherM2: 13032, surfaceTerrainM2: 2885, batiments: [
      { corpsId: 1, nbEtages: 7, empriseM2: null }, // 2D1 pas encore tracé
      { corpsId: 2, nbEtages: 7, empriseM2: null }, // 2D2 (courant)
    ] });
    expect(v.empriseVsPlancher).toBe('inconnu');                 // pas de petit/grand par bâtiment
    expect(v.empriseAttendueM2).toBeNull();
    expect(v.messages.join(' ')).toMatch(/ensemble du permis \(2 bâtiments\)/);
    expect(v.messages.join(' ')).not.toMatch(/PETITE|INFÉRIEURE|SUPÉRIEURE à l'attendu/); // aucun verdict de surface par bâtiment
  });

  it('(c) PERMIS MULTI-BÂTIMENTS TOUS tracés, niveaux communs → contrôle chiffré à l’ÉCHELLE DU PERMIS (somme des emprises)', () => {
    // 2D2 courant (aire en cours 900) + 2D1 déjà enregistré 900 → Σ=1800 ; attendu 12600/7=1800 → cohérent
    const v = verdictVraisemblance({ aireM2: 900, corpsId: 2, surfacePlancherM2: 12600, surfaceTerrainM2: 5000, batiments: [
      { corpsId: 1, nbEtages: 7, empriseM2: 900 },
      { corpsId: 2, nbEtages: 7, empriseM2: null }, // le courant : son aire vient de aireM2 (900), pas de empriseM2
    ] });
    expect(v.empriseVsPlancher).toBe('coherent');
    expect(v.empriseAttendueM2).toBeCloseTo(1800, 6);            // 12600 / 7
    expect(v.messages.join(' ')).toMatch(/à l'échelle du permis \(2 bâtiments\)/);
    expect(v.messages.join(' ')).toMatch(/somme des emprises/);
  });

  it('niveaux inconnus ou nuls → AUCUN contrôle chiffré (mono : repère neutre ; multi : repère neutre)', () => {
    // mono-bâtiment sans niveaux → pas de chiffre, repère neutre
    const mono = verdictVraisemblance({ aireM2: 300, corpsId: 1, surfacePlancherM2: 900, surfaceTerrainM2: null, batiments: [{ corpsId: 1, nbEtages: null, empriseM2: null }] });
    expect(mono.empriseVsPlancher).toBe('inconnu');
    expect(mono.empriseAttendueM2).toBeNull();
    expect(mono.messages.join(' ')).toMatch(/niveaux du bâtiment inconnu/);
    // multi tous tracés MAIS niveaux hétérogènes → pas de niveaux communs → repère neutre, pas de chiffre
    const multi = verdictVraisemblance({ aireM2: 900, corpsId: 2, surfacePlancherM2: 12600, surfaceTerrainM2: null, batiments: [
      { corpsId: 1, nbEtages: 5, empriseM2: 900 }, { corpsId: 2, nbEtages: 8, empriseM2: null },
    ] });
    expect(multi.empriseVsPlancher).toBe('inconnu');
    expect(multi.messages.join(' ')).toMatch(/ensemble du permis/);
    // plancher absent → 'inconnu', aucun message plancher inventé
    expect(verdictVraisemblance({ aireM2: 300, corpsId: 1, surfacePlancherM2: null, surfaceTerrainM2: null, batiments: [{ corpsId: 1, nbEtages: 3, empriseM2: null }] }).empriseVsPlancher).toBe('inconnu');
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

describe('PROJ — deriverDebordement : repère indicatif, aucun arrondi, jamais une valeur inventée', () => {
  it('emprise ENTIÈREMENT dans la parcelle → 0 % hors, décalage 0', () => {
    const d = deriverDebordement(709.46, true, 0, 0);
    expect(d.parcelleRattachee).toBe(true);
    expect(d.aireHorsM2).toBe(0);
    expect(d.pctHors).toBe(0);
    expect(d.decalageLateralM).toBe(0);
  });
  it('emprise DÉBORDANTE → % et m² hors bruts, décalage latéral = 2·aireHors/périmètre (cas mesuré 2D2)', () => {
    // 49,63 m² hors sur un bandeau ~60,3 m (périmètre ≈ 120,6) → largeur ≈ 2×49,63/120,6 ≈ 0,82 m
    const d = deriverDebordement(709.457904947168, true, 49.62504953238064, 120.6);
    expect(d.pctHors).toBeCloseTo(6.994784212895069, 9);   // aucun arrondi dans le calcul
    expect(d.aireHorsM2).toBeCloseTo(49.62504953238064, 9);
    expect(d.decalageLateralM).toBeCloseTo(0.8229, 3);
  });
  it('AUCUNE parcelle rattachée → part hors INDISPONIBLE (null), jamais 0 inventé', () => {
    const d = deriverDebordement(709.46, false, null, null);
    expect(d.parcelleRattachee).toBe(false);
    expect(d.aireHorsM2).toBeNull();
    expect(d.pctHors).toBeNull();
    expect(d.decalageLateralM).toBeNull();
  });
  it('périmètre nul avec une aire hors > 0 (dégénéré) → décalage null, jamais une division par zéro', () => {
    const d = deriverDebordement(100, true, 5, 0);
    expect(d.pctHors).toBeCloseTo(5, 9);
    expect(d.decalageLateralM).toBeNull();
  });
});
