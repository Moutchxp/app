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
    p1M: null,
    p2M: null,
    ...o,
  };
}

const misEnEvidence = (e: EtapeCalcul[]) => e.filter((x) => x.misEnEvidence);

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

  it("cumul séquentiel : deux lectures (P1, P2) + combinaison au libellé du mode réel", () => {
    const e = construireEtapesCalcul(ligne({ famille: "mh", natureTraverseeM: 40, p1M: 150, p2M: 200, diviseurCumulNature: 1.7, modeCombinaison: "sequentiel", coeffApplique: 2, valeurAvantCapM: 267.6, seuilBorneM: 400, distancePercueM: 267.6, familleLibelle: "Monument Historique" }), P);
    expect(e.some((x) => x.libelle.includes("Lecture dégagement"))).toBe(true);
    expect(e.some((x) => x.libelle === "Lecture patrimoine")).toBe(true);
    expect(e.some((x) => x.libelle.includes("patrimoine atténué"))).toBe(true); // mode sequentiel
    // L'opération de combinaison COMPOSE le diviseur réel (jamais figé).
    expect(e.find((x) => x.libelle.includes("patrimoine atténué"))!.operation).toContain("÷ 1.700");
  });

  it("cumul mode 'max' : libellé « meilleure des deux », pas de division affichée", () => {
    const e = construireEtapesCalcul(ligne({ famille: "inventaire", natureTraverseeM: 40, p1M: 150, p2M: 120, diviseurCumulNature: 1.5, modeCombinaison: "max", coeffApplique: 2, valeurAvantCapM: 150, seuilBorneM: 400, distancePercueM: 150, familleLibelle: "Inventaire" }), P);
    const combi = e.find((x) => x.libelle.includes("meilleure des deux"));
    expect(combi).toBeDefined();
    expect(combi!.operation).toBeNull();
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
});
