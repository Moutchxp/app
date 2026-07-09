/**
 * Test unitaire du générateur PUR `construireEtapesCalcul` (modale « détail du calcul », Lot 3/3).
 *
 * Le générateur ASSEMBLE un récit à partir des valeurs DÉJÀ produites par le seam ; il ne recalcule jamais le
 * barème. On vérifie ici : les 4 cas (ordinaire / patrimoine seul / cumul / mondial), l'étape « valeur avant
 * plafond » mise en évidence, l'étape de plafond quand le cap mord, et la PURETÉ (déterminisme).
 */
import { describe, it, expect } from "vitest";
import { construireEtapesCalcul, type EtapeCalcul } from "./EventailFaisceaux";
import type { LigneVentil } from "./EventailFaisceaux";
import { PROFIL_DEGAGEMENT_DEFAUT } from "../../../../lib/svv/profilDegagement";

const P = PROFIL_DEGAGEMENT_DEFAUT;

/** Fabrique une LigneVentil neutre (bâti ordinaire, sans nature) surchargée par `o`. */
function ligne(o: Partial<LigneVentil>): LigneVentil {
  return {
    offsetDeg: 0,
    distanceBruteM: 30,
    distancePercueM: 30,
    seuilBorneM: P.distanceMaxM,
    famille: null,
    coeffApplique: null,
    boostF4AppliqueM: 0,
    natureTraverseeM: 0,
    diviseurCumulNature: null,
    modeCombinaison: null,
    capFamilleApplique: false,
    carteAnnee: null,
    familleLibelle: null,
    dansChaineCouloir: false,
    valeurAvantCapM: 30,
    baseM: 30,
    p1M: null,
    p1AvantCapM: null,
    p2M: null,
    ...o,
  };
}

const misEnEvidence = (e: EtapeCalcul[]) => e.filter((x) => x.misEnEvidence);

/** Toutes les chaînes RÉELLEMENT affichées (libellés, expressions, notes, opérandes + sous-opérandes). */
function textesAffiches(etapes: EtapeCalcul[]): string[] {
  const out: string[] = [];
  for (const e of etapes) {
    out.push(e.libelle);
    if (e.expression) out.push(e.expression);
    if (e.note) out.push(e.note);
    for (const o of e.operandes) {
      out.push(o.libelle);
      if (o.sousCalcul) out.push(o.sousCalcul);
      for (const so of o.sousOperandes ?? []) out.push(so.libelle);
    }
  }
  return out;
}

/** Un faisceau cumul complet (deux lectures + combinaison), famille paramétrable. */
const cumul = (famille: LigneVentil["famille"], extra: Partial<LigneVentil> = {}): LigneVentil =>
  ligne({ famille, natureTraverseeM: 40, baseM: 80, boostF4AppliqueM: 100, p1AvantCapM: 180, p1M: 180, p2M: 120, coeffApplique: 1.5, diviseurCumulNature: 1.5, modeCombinaison: "sequentiel", distanceBruteM: 80, valeurAvantCapM: 260, seuilBorneM: 400, distancePercueM: 260, ...extra });

describe("construireEtapesCalcul — récit d'étapes (pur, sans recalcul de barème)", () => {
  it("PURETÉ : deux appels sur les mêmes entrées → sorties identiques", () => {
    const l = ligne({ famille: "mh", distanceBruteM: 300, coeffApplique: 2, valeurAvantCapM: 600, seuilBorneM: 400, distancePercueM: 400, capFamilleApplique: true, familleLibelle: "Monument Historique" });
    expect(construireEtapesCalcul(l, P)).toEqual(construireEtapesCalcul(l, P));
  });

  it("INVARIANT : exactement une étape mise en évidence, dont la valeur == valeurAvantCapM", () => {
    const cas: LigneVentil[] = [
      ligne({}), // ordinaire
      ligne({ famille: "mondial", valeurAvantCapM: 800, seuilBorneM: 800, distancePercueM: 800 }),
      ligne({ famille: "mh", distanceBruteM: 100, coeffApplique: 2, valeurAvantCapM: 200, seuilBorneM: 400, distancePercueM: 200, familleLibelle: "Monument Historique" }),
      ligne({ famille: "mh", natureTraverseeM: 40, p1M: 150, p2M: 200, diviseurCumulNature: 1.5, modeCombinaison: "sequentiel", coeffApplique: 2, valeurAvantCapM: 283.33, seuilBorneM: 400, distancePercueM: 283.33, familleLibelle: "Monument Historique" }),
    ];
    for (const l of cas) {
      const e = construireEtapesCalcul(l, P);
      const surlignees = misEnEvidence(e);
      expect(surlignees).toHaveLength(1);
      expect(surlignees[0].valeur).toBe(l.valeurAvantCapM);
    }
  });

  it("ordinaire sans nature : une seule étape (distance réelle), pas de plafond", () => {
    const e = construireEtapesCalcul(ligne({}), P);
    expect(e).toHaveLength(1);
    expect(e[0].libelle).toContain("Distance réelle");
    expect(e[0].misEnEvidence).toBe(true);
  });

  it("patrimoine seul (cône) : distance réelle → multiplicateur, plafond si le cap mord", () => {
    const sansCap = construireEtapesCalcul(ligne({ famille: "mh", distanceBruteM: 100, coeffApplique: 2, valeurAvantCapM: 200, seuilBorneM: 400, distancePercueM: 200, familleLibelle: "Monument Historique" }), P);
    expect(sansCap.some((x) => x.libelle.includes("dans l’axe"))).toBe(true);
    expect(sansCap.some((x) => x.libelle === "Plafond appliqué")).toBe(false);

    const avecCap = construireEtapesCalcul(ligne({ famille: "mh", distanceBruteM: 300, coeffApplique: 2, valeurAvantCapM: 600, seuilBorneM: 400, distancePercueM: 400, capFamilleApplique: true, familleLibelle: "Monument Historique" }), P);
    const plafond = avecCap.find((x) => x.libelle === "Plafond appliqué");
    expect(plafond).toBeDefined();
    expect(plafond!.valeur).toBe(400); // = distancePercueM (valeur écrêtée)
  });

  it("cumul séquentiel : deux lectures (P1, P2) + combinaison au libellé du mode réel, division PARENTHÉSÉE", () => {
    const e = construireEtapesCalcul(ligne({ famille: "mh", natureTraverseeM: 40, p1M: 150, p2M: 200, diviseurCumulNature: 1.7, modeCombinaison: "sequentiel", coeffApplique: 2, valeurAvantCapM: 267.6, seuilBorneM: 400, distancePercueM: 267.6, familleLibelle: "Monument Historique" }), P);
    expect(e.some((x) => x.libelle.includes("Score dégagement"))).toBe(true);
    expect(e.some((x) => x.libelle.includes("Score patrimoine"))).toBe(true);
    const combi = e.find((x) => x.libelle.includes("patrimoine atténué"))!; // mode sequentiel
    // L'expression COMPOSE le diviseur réel (jamais figé) ET parenthèse le terme divisé (demande 1).
    expect(combi.expression).toContain("÷ 1.7");
    expect(combi.expression).toMatch(/\([^)]*÷[^)]*\)/); // le terme divisé est entre parenthèses
    // La légende du diviseur est humaine (pas de nom technique).
    expect(combi.operandes.some((o) => o.libelle.includes("Atténuation"))).toBe(true);
  });

  it("cumul mode 'max' : libellé « meilleur des deux scores », pas d'expression composée", () => {
    const e = construireEtapesCalcul(ligne({ famille: "inventaire", natureTraverseeM: 40, p1M: 150, p2M: 120, diviseurCumulNature: 1.5, modeCombinaison: "max", coeffApplique: 2, valeurAvantCapM: 150, seuilBorneM: 400, distancePercueM: 150, familleLibelle: "Inventaire" }), P);
    const combi = e.find((x) => x.libelle.includes("meilleur des deux"));
    expect(combi).toBeDefined();
    expect(combi!.expression).toBeNull();
  });

  it("demande 2 — « Lecture dégagement » détaille base + bonus = avant-cap → plafonné à capP1M", () => {
    const e = construireEtapesCalcul(
      ligne({ famille: "mh", natureTraverseeM: 40, baseM: 88.274, boostF4AppliqueM: 154.423, p1AvantCapM: 242.697, p1M: 200, p2M: 105.9, coeffApplique: 1.2, diviseurCumulNature: 1.7, modeCombinaison: "sequentiel", distanceBruteM: 88.274, valeurAvantCapM: 262.3, seuilBorneM: 400, distancePercueM: 262.3, familleLibelle: "Monument Historique" }),
      P, // P.cumulNature.capP1M = 200 → le cap mord (242.697 > 200)
    );
    const lecture = e.find((x) => x.libelle.includes("Score dégagement"))!;
    expect(lecture.expression).toContain("88.274 + 154.423 = 242.697");
    expect(lecture.expression).toContain("plafonné à 200");
    // Légende de chaque nombre, dont la valeur intermédiaire « avant plafond ».
    expect(lecture.operandes.some((o) => o.libelle.includes("avant plafond"))).toBe(true);
    expect(lecture.operandes.every((o) => o.libelle.length > 0)).toBe(true);
  });

  it("demande 2 — « Lecture patrimoine » détaille distance × coeff = résultat", () => {
    const e = construireEtapesCalcul(
      ligne({ famille: "mh", natureTraverseeM: 40, baseM: 88.274, boostF4AppliqueM: 154.423, p1AvantCapM: 242.697, p1M: 200, p2M: 105.9, coeffApplique: 1.2, diviseurCumulNature: 1.7, modeCombinaison: "sequentiel", distanceBruteM: 88.274, valeurAvantCapM: 262.3, seuilBorneM: 400, distancePercueM: 262.3, familleLibelle: "Monument Historique" }),
      P,
    );
    const patri = e.find((x) => x.libelle.includes("Score patrimoine"))!;
    expect(patri.expression).toBe("88.274 × 1.2 = 105.9");
    expect(patri.operandes.some((o) => o.libelle.includes("Multiplicateur patrimoine"))).toBe(true);
  });

  it("chaque étape porte des opérandes légendés (valeur formatée + libellé humain, non vide)", () => {
    const e = construireEtapesCalcul(ligne({ famille: "mh", distanceBruteM: 100, coeffApplique: 2, valeurAvantCapM: 200, seuilBorneM: 400, distancePercueM: 200, familleLibelle: "Monument Historique" }), P);
    for (const etape of e) {
      expect(etape.operandes.length).toBeGreaterThan(0);
      for (const o of etape.operandes) {
        expect(o.valeur.length).toBeGreaterThan(0);
        expect(o.libelle.length).toBeGreaterThan(0);
      }
    }
  });

  it("mondial : une étape « valeur fixe », aucune décomposition", () => {
    const e = construireEtapesCalcul(ligne({ famille: "mondial", valeurAvantCapM: 800, seuilBorneM: 800, distancePercueM: 800 }), P);
    expect(e).toHaveLength(1);
    expect(e[0].libelle).toContain("Valeur fixe patrimoine mondial");
  });

  it("dégagé (brute null) : part de la distance retenue (portée), pas de « distance réelle »", () => {
    const e = construireEtapesCalcul(ligne({ distanceBruteM: null, valeurAvantCapM: 200, distancePercueM: 200 }), P);
    expect(e[0].libelle).toContain("Distance retenue");
    expect(e.some((x) => x.libelle.includes("Distance réelle"))).toBe(false);
  });

  it("(a) VOCABULAIRE — famille 'annee' : jamais « monument » ni « historique » dans les libellés affichés", () => {
    const tous = textesAffiches(construireEtapesCalcul(cumul("annee", { seuilBorneM: 300 }), P)).join(" | ");
    expect(tous).not.toMatch(/monument/i);
    expect(tous).not.toMatch(/historique/i);
    // La carte d'année est bien nommée « époque de construction » / « bâti ».
    expect(tous).toMatch(/époque de construction/i);
    expect(tous).toMatch(/Score bâti/);
  });

  it("(b) VOCABULAIRE — familles mh / inventaire / mondial : « patrimoine historique » présent", () => {
    for (const fam of ["mh", "inventaire"] as const) {
      const tous = textesAffiches(construireEtapesCalcul(cumul(fam, { familleLibelle: fam === "mh" ? "Monument Historique" : "Inventaire" }), P)).join(" | ");
      expect(tous).toMatch(/patrimoine historique/i);
    }
  });

  it("(c) VOCABULAIRE — aucune occurrence du mot « lecture » dans les libellés affichés", () => {
    const cas = [cumul("mh", { familleLibelle: "Monument Historique" }), cumul("annee", { seuilBorneM: 300 }), ligne({ famille: "mondial", valeurAvantCapM: 800, seuilBorneM: 800, distancePercueM: 800 })];
    for (const l of cas) {
      const tous = textesAffiches(construireEtapesCalcul(l, P)).join(" | ");
      expect(tous).not.toMatch(/lecture/i);
    }
  });

  it("(d) DÉCOMPOSITION — le bonus végétation expose son sous-calcul (boostF4 × longueur) + sous-opérandes", () => {
    const e = construireEtapesCalcul(ligne({ natureTraverseeM: 40, boostF4AppliqueM: 100, baseM: 80, valeurAvantCapM: 180, distanceBruteM: 80, distancePercueM: 180, seuilBorneM: 200 }), P);
    const op = e.flatMap((x) => x.operandes).find((o) => o.libelle.includes("Bonus végétation"))!;
    expect(op.sousCalcul).toBe(`${P.boostF4} × 40.0`); // boostF4 × natureTraverseeM (40), valeurs réelles
    expect(op.sousOperandes).toHaveLength(2);
    expect(op.sousOperandes!.some((so) => so.libelle.includes("Longueur de végétation"))).toBe(true);
    expect(op.sousOperandes!.some((so) => so.libelle.includes("coefficient de bonus"))).toBe(true);
    // Une seule profondeur : les sous-opérandes ne sont pas eux-mêmes décomposés.
    for (const so of op.sousOperandes!) expect(so.sousOperandes).toBeUndefined();
  });
});
