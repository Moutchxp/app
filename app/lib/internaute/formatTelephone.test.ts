import { describe, it, expect } from "vitest";
import { formaterTelephone } from "./formatTelephone";

describe("formaterTelephone — reformatage AFFICHAGE d'un E.164 stocké (jamais de mutation)", () => {
  it("FR mobile E.164 → format national par groupes de 2", () => {
    expect(formaterTelephone("+33612345678")).toBe("06 12 34 56 78");
  });

  it("FR fixe E.164 → national", () => {
    expect(formaterTelephone("+33112345678")).toBe("01 12 34 56 78");
  });

  it("BE (autre indicatif) → format national local, PAS le format FR", () => {
    expect(formaterTelephone("+32476123456")).toBe("0476 12 34 56"); // mobile BE
    expect(formaterTelephone("+3222345678")).toBe("02 234 56 78"); //   fixe BE
  });

  it("US → format national US (l'indicatif pilote le format, jamais figé FR)", () => {
    expect(formaterTelephone("+14155552671")).toBe("(415) 555-2671");
  });

  it("null / undefined / chaîne vide → chaîne vide (l'appelant affiche « — »)", () => {
    expect(formaterTelephone(null)).toBe("");
    expect(formaterTelephone(undefined)).toBe("");
    expect(formaterTelephone("   ")).toBe("");
  });

  it("repli : national FR sans indicatif (10 chiffres, 0…) → groupes de 2", () => {
    expect(formaterTelephone("0612345678")).toBe("06 12 34 56 78");
  });

  it("repli : chaîne non téléphonique → rendue inchangée (jamais de perte)", () => {
    expect(formaterTelephone("à préciser")).toBe("à préciser");
  });

  it("ne mute pas l'entrée : la valeur stockée E.164 reste disponible telle quelle", () => {
    const e164 = "+33612345678";
    formaterTelephone(e164);
    expect(e164).toBe("+33612345678"); // aucune mutation (chaîne immuable, mais on scelle l'invariant)
  });
});
