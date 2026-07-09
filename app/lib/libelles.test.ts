/**
 * assemblerBadges — logique EXTRAITE de page.tsx (cartouches de qualité de vue). Vérifie l'ordre, le filtrage
 * des null (vue nature / immobilier), et le masquage Famille 2 si `scorePartiel`. PUR (aucun accès DB/IA).
 */
import { describe, it, expect } from "vitest";
import { assemblerBadges, libelleOrientation, type EntreeBadges } from "./libelles";

const base: EntreeBadges = {
  contexteDegagement: "Globalement dégagé",
  contexteVueNature: "Vue sur verdure",
  contexteImmobilier: null, // → filtré
  monumentsHistoriques: ["Monument historique : Tour X"],
  score: {
    famille1: { detail: { secteurOrientation: "S" } },
    famille2: { strate1: 30, strate2: 5, malusProprete: 0, scorePartiel: false },
  },
};

describe("assemblerBadges", () => {
  it("assemble dans l'ordre, filtre les null, inclut la Famille 2 quand photo exploitable", () => {
    expect(assemblerBadges(base)).toEqual([
      libelleOrientation("S"),
      "Globalement dégagé",
      "Vue sur verdure",
      // contexteImmobilier null → absent
      "Monument historique : Tour X",
      "Environnement très valorisant", // libelleCouverture(30)
      "Monument remarquable en vue", // libelleMonuments(5)
      "Aucune nuisance visible", // libelleProprete(0)
    ]);
  });

  it("masque les cartouches Famille 2 quand scorePartiel (photo inexploitable)", () => {
    const partiel: EntreeBadges = { ...base, score: { ...base.score, famille2: { ...base.score.famille2, scorePartiel: true } } };
    expect(assemblerBadges(partiel)).toEqual([
      libelleOrientation("S"),
      "Globalement dégagé",
      "Vue sur verdure",
      "Monument historique : Tour X",
    ]);
  });

  it("filtre vue nature ET immobilier null, et 0 monument", () => {
    const minimal: EntreeBadges = {
      contexteDegagement: "Environnement dense",
      contexteVueNature: null,
      contexteImmobilier: null,
      monumentsHistoriques: [],
      score: { famille1: { detail: { secteurOrientation: "N" } }, famille2: { strate1: 0, strate2: 0, malusProprete: 5, scorePartiel: false } },
    };
    // strate1<1 → libelleCouverture null (filtré) ; strate2=0 → libelleMonuments null (filtré) ; propreté toujours présente.
    expect(assemblerBadges(minimal)).toEqual([libelleOrientation("N"), "Environnement dense", "Environnement dégradé"]);
  });
});
