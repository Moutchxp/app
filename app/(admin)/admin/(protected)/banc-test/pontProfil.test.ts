/**
 * Banc M5 · Lot 2b — pont colonne ↔ champ ProfilDegagement (pontProfil.ts).
 * Vérifie la fidélité 1:1 du mapping (mêmes colonnes que M1) + l'immutabilité de la source.
 */
import { describe, it, expect } from "vitest";
import { PONTS, pontParColonne } from "./pontProfil";
import { PROFIL_DEGAGEMENT_DEFAUT } from "../../../../lib/svv/profilDegagement";
import { clonerProfil } from "../../../../lib/svv/profilTest";
import { META } from "../pilotage/mappingConfig";

describe("pontProfil — pont colonne ↔ champ ProfilDegagement", () => {
  it("couvre EXACTEMENT les 38 colonnes pilotables de config_scoring (id exclu)", () => {
    expect(PONTS).toHaveLength(38);
    const colsMeta = META.filter((m) => m.colonne !== "id").map((m) => m.colonne).sort();
    const colsPont = PONTS.map((p) => p.colonne).sort();
    expect(colsPont).toEqual(colsMeta);
  });

  it("lire() sur le profil par défaut renvoie les valeurs attendues (mapping fidèle à chargerProfilDegagement)", () => {
    const d = PROFIL_DEGAGEMENT_DEFAUT;
    expect(pontParColonne("boost_f4")!.lire(d)).toBe(d.boostF4);
    expect(pontParColonne("distance_max_m")!.lire(d)).toBe(d.distanceMaxM);
    expect(pontParColonne("mondial_faisceau_m")!.lire(d)).toBe(d.famillesPonderation.mondialFaisceauM);
    expect(pontParColonne("mh_cone")!.lire(d)).toBe(d.famillesPonderation.mh.cone);
    expect(pontParColonne("inv_distmax_m")!.lire(d)).toBe(d.famillesPonderation.inventaire.distMaxM);
    expect(pontParColonne("cumul_pas_m")!.lire(d)).toBe(d.cumulNature.pasM);
    expect(pontParColonne("orientation_s")!.lire(d)).toBe(d.orientationPts.S);
    expect(pontParColonne("orientation_no")!.lire(d)).toBe(d.orientationPts.NO);
    expect(pontParColonne("mode_combinaison")!.lire(d)).toBe(d.modeCombinaison);
    expect(pontParColonne("mode_combinaison_repli")!.lire(d)).toBe(d.modeCombinaisonRepli);
    expect(pontParColonne("plafond_degagement")!.lire(d)).toBe(d.plafondDegagement);
    expect(pontParColonne("analysis_range_m")!.lire(d)).toBe(d.analysisRangeM);
  });

  it("ecrire() mute un CLONE (round-trip lire==ecrire) SANS toucher la source", () => {
    for (const p of PONTS) {
      const meta = META.find((m) => m.colonne === p.colonne)!;
      if (meta.type === "liste" || !meta.editable) continue; // vestigiales/listes : lecture seule
      const clone = clonerProfil(PROFIL_DEGAGEMENT_DEFAUT);
      const val: number | string = meta.type === "enum" ? meta.optionsEnum![meta.optionsEnum!.length - 1] : 7;
      p.ecrire(clone, val);
      expect(p.lire(clone)).toBe(val);
    }
    // La source de référence n'a pas bougé.
    expect(PROFIL_DEGAGEMENT_DEFAUT.boostF4).toBe(2.5);
    expect(PROFIL_DEGAGEMENT_DEFAUT.orientationPts.S).toBe(10);
    expect(PROFIL_DEGAGEMENT_DEFAUT.famillesPonderation.mh.cone).toBe(2.0);
  });
});
