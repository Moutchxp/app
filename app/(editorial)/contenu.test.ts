import { describe, it, expect } from "vitest";
import * as QSN from "./qui-sommes-nous/contenu";
import * as PART from "./partenaires/contenu";

/**
 * Les fichiers de contenu sont des GABARITS VIDES : ce test garantit qu'aucun texte éditorial n'est livré par erreur
 * (pas de faux paragraphe qui se retrouverait en ligne), tout en verrouillant la forme attendue par Arno.
 */
describe("qui-sommes-nous/contenu — gabarit vide", () => {
  it("titre de page = nom de la page (non éditorial)", () => {
    expect(QSN.TITRE_PAGE).toBe("Qui sommes-nous");
  });
  it("3 à 4 sections, TOUTES vides (titre et corps)", () => {
    expect(Array.isArray(QSN.SECTIONS)).toBe(true);
    expect(QSN.SECTIONS.length).toBeGreaterThanOrEqual(3);
    expect(QSN.SECTIONS.length).toBeLessThanOrEqual(4);
    for (const s of QSN.SECTIONS) {
      expect(s.titre).toBe("");
      expect(s.corps).toBe("");
    }
  });
});

describe("partenaires/contenu — gabarit vide", () => {
  it("titre = « Partenaires », introduction vide", () => {
    expect(PART.TITRE_PAGE).toBe("Partenaires");
    expect(PART.INTRO).toBe("");
  });
  it("liste de partenaires VIDE au départ", () => {
    expect(Array.isArray(PART.PARTENAIRES)).toBe(true);
    expect(PART.PARTENAIRES).toHaveLength(0);
  });
});
