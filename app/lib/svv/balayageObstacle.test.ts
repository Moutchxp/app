import { describe, it, expect } from "vitest";
import { balayerObstacle, type CelluleCouloir } from "./balayageObstacle";

const N = 200;

/** Cellule : altitude toit (null = pas de bâti), couverte par défaut, non-origine par défaut. */
function cell(altM: number | null, couvert = true, origine = false): CelluleCouloir {
  return { altM, couvert, origine };
}

/** Colonne dégagée (couverte, sans bâti) de N cellules. */
function colonneVide(n = N): CelluleCouloir[] {
  return Array.from({ length: n }, () => cell(null));
}

/** 4 colonnes dégagées indépendantes. */
function quatreColonnes(n = N): CelluleCouloir[][] {
  return [colonneVide(n), colonneVide(n), colonneVide(n), colonneVide(n)];
}

describe("balayerObstacle", () => {
  it("1) mur perpendiculaire (4 colonnes bloquées ligne 46) → OBSTACLE ~23,25 m", () => {
    const cols = quatreColonnes();
    for (const c of cols) c[46] = cell(60);
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("OBSTACLE");
    expect(r.ligne).toBe(46);
    expect(r.distanceCelluleM).toBeCloseTo(23.25, 6);
    expect(r.degrade).toBe(false);
  });

  it("2a) Belfort — œil RDC 43,24 : muret (ligne 46, 44,6) bloque → OBSTACLE ligne 46 (~23 m)", () => {
    const cols = quatreColonnes();
    for (const c of cols) {
      c[46] = cell(44.6); // muret
      c[56] = cell(56); // immeuble
    }
    const r = balayerObstacle({ colonnes: cols, hOeilM: 43.24 });
    expect(r.statut).toBe("OBSTACLE");
    expect(r.ligne).toBe(46);
    expect(r.distanceCelluleM).toBeCloseTo(23.25, 6);
  });

  it("2b) Belfort — œil étage 1 = 46,14 : muret dégagé → OBSTACLE ligne 56 (~28 m)", () => {
    const cols = quatreColonnes();
    for (const c of cols) {
      c[46] = cell(44.6); // muret désormais sous l'œil
      c[56] = cell(56); // immeuble
    }
    const r = balayerObstacle({ colonnes: cols, hOeilM: 46.14 });
    expect(r.statut).toBe("OBSTACLE");
    expect(r.ligne).toBe(56);
    expect(r.distanceCelluleM).toBeCloseTo(28.25, 6);
  });

  it("3) mur en biais (col0 i, col1 i+1, col2 i+2, col3 i+3) → OBSTACLE", () => {
    const cols = quatreColonnes();
    const i = 46;
    cols[0][i] = cell(60);
    cols[1][i + 1] = cell(60);
    cols[2][i + 2] = cell(60);
    cols[3][i + 3] = cell(60);
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("OBSTACLE");
    expect(r.ligne).toBe(i); // cellule retenue = la plus proche
  });

  it("4) façades en quinconce (col0/1 ligne i, col2/3 ligne i+4, prof 6) → OBSTACLE", () => {
    const cols = quatreColonnes();
    const i = 46;
    cols[0][i] = cell(60);
    cols[1][i] = cell(60);
    cols[2][i + 4] = cell(60);
    cols[3][i + 4] = cell(60);
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50, profondeurFenetre: 6 });
    expect(r.statut).toBe("OBSTACLE");
    expect(r.ligne).toBe(i);
  });

  it("5) une colonne toujours libre → pas d'obstacle → DEGAGE", () => {
    const cols = quatreColonnes();
    for (let l = 0; l < N; l++) {
      cols[0][l] = cell(60);
      cols[1][l] = cell(60);
      cols[2][l] = cell(60);
      // col3 reste dégagée
    }
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("DEGAGE");
    expect(r.ligne).toBeNull();
  });

  it("6) cellules bloquées dispersées (jamais les 4 colonnes dans une fenêtre) → DEGAGE", () => {
    const cols = quatreColonnes();
    cols[0][10] = cell(60);
    cols[1][20] = cell(60);
    cols[2][30] = cell(60);
    cols[3][40] = cell(60);
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("DEGAGE");
  });

  it("7) cellules origine=true à altM élevée près de l'origine → ignorées → DEGAGE", () => {
    const cols = quatreColonnes();
    for (const c of cols) {
      for (let l = 0; l < 6; l++) c[l] = cell(80, true, true); // origine → forcées dégagées
    }
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("DEGAGE");
  });

  it("8) trou SANS_DONNÉE < 40 m avant l'obstacle → INDETERMINE", () => {
    const cols = quatreColonnes();
    for (const c of cols) c[60] = cell(60); // obstacle plein-couloir ligne 60 (~30 m)
    cols[0][20] = cell(null, false); // trou à ~10,25 m, avant l'obstacle
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("INDETERMINE");
  });

  it("9) trou SANS_DONNÉE ≥ 40 m, sinon dégagé → DEGAGE + degrade=true", () => {
    const cols = quatreColonnes();
    cols[0][100] = cell(null, false); // trou à ~50,25 m
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("DEGAGE");
    expect(r.degrade).toBe(true);
  });

  it("10) aucun bâti partout → DEGAGE (degrade=false)", () => {
    const cols = quatreColonnes();
    const r = balayerObstacle({ colonnes: cols, hOeilM: 50 });
    expect(r.statut).toBe("DEGAGE");
    expect(r.degrade).toBe(false);
  });
});
