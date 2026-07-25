import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  SectionEditoriale, ListePartenaires, CartePartenaire,
  MSG_CONTENU_A_VENIR, MSG_AUCUN_PARTENAIRE, type Partenaire,
} from "./gabarit";

/**
 * Rendu SSR PUR (`renderToStaticMarkup`, aucun DOM / aucun jsdom) — comme le reste du dépôt en env node. On PROUVE
 * l'état d'attente honnête (« Contenu à venir »), l'état vide de la liste, et le rendu correct d'un partenaire
 * (alt obligatoire, lien externe sûr).
 */
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe("SectionEditoriale — emplacement vide vs rempli", () => {
  it("titre + corps vides → « Contenu à venir », AUCUN <h2>", () => {
    const out = html(createElement(SectionEditoriale, { titre: "", corps: "" }));
    expect(out).toContain(MSG_CONTENU_A_VENIR);
    expect(out).not.toContain("<h2");
  });
  it("rempli → titre en <h2> et corps affiché, pas de « Contenu à venir »", () => {
    const out = html(createElement(SectionEditoriale, { titre: "Notre mission", corps: "Un texte." }));
    expect(out).toContain("<h2");
    expect(out).toContain("Notre mission");
    expect(out).toContain("Un texte.");
    expect(out).not.toContain(MSG_CONTENU_A_VENIR);
  });
});

describe("ListePartenaires — liste VIDE vs peuplée", () => {
  it("liste vide → état vide explicite, AUCUNE carte (ni <li>, ni <a>)", () => {
    const out = html(createElement(ListePartenaires, { partenaires: [] as Partenaire[] }));
    expect(out).toContain(MSG_AUCUN_PARTENAIRE);
    expect(out).not.toContain("<li");
    expect(out).not.toContain("<a ");
  });
  it("une entrée suffit à l'afficher (nom, description, <li>)", () => {
    const p: Partenaire = { nom: "ACME", logo: "/images/partenaires/acme.png", description: "Desc.", lien: "https://acme.example" };
    const out = html(createElement(ListePartenaires, { partenaires: [p] }));
    expect(out).toContain("<li");
    expect(out).toContain("ACME");
    expect(out).toContain("Desc.");
    expect(out).not.toContain(MSG_AUCUN_PARTENAIRE);
  });
});

describe("CartePartenaire — logo alt obligatoire + lien externe SÛR", () => {
  const p: Partenaire = { nom: "ACME", logo: "/images/partenaires/acme.png", description: "Desc.", lien: "https://acme.example" };
  it("logo porte alt = nom", () => {
    const out = html(createElement(CartePartenaire, { partenaire: p }));
    expect(out).toMatch(/<img[^>]*alt="ACME"/);
    expect(out).toContain('src="/images/partenaires/acme.png"');
  });
  it("lien externe : target _blank + rel noopener noreferrer (anti tab-nabbing)", () => {
    const out = html(createElement(CartePartenaire, { partenaire: p }));
    expect(out).toContain('href="https://acme.example"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});
