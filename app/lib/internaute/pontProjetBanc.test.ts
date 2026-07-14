import { describe, it, expect } from "vitest";
import { HAUTEUR_SOUS_PLAFOND_DEFAUT_M } from "../svv/config";
import {
  projetVersSaisieBanc,
  parseHandoff,
  CLE_HANDOFF_BANC,
  type SaisieBanc,
} from "./pontProjetBanc";

// Forme d'une ligne `internaute_projet` telle que renvoyée BRUTE par `lireProfilComplet` (driver pg) :
// lat/lon = double precision → number ; etage = integer → number ; dernier_etage = boolean ; azimut_deg
// et hauteur_sous_plafond_m = numeric → CHAÎNES ; colonnes pré-026 absentes/NULL.
const projetComplet = (): Record<string, unknown> => ({
  id: "42",
  lat: 48.90693182287072,
  lon: 2.269431435588249,
  azimut_deg: "90", //                       numeric pg → chaîne
  etage: 2,
  hauteur_sous_plafond_m: "2.8", //          numeric pg → chaîne
  dernier_etage: false,
  verdict: "SANS_VIS_A_VIS",
  score: "29.1",
});

describe("projetVersSaisieBanc — mapping PUR internaute_projet → intrants du banc", () => {
  it("coerce azimut_deg et hauteur_sous_plafond_m (chaînes numeric pg) en number", () => {
    const s = projetVersSaisieBanc(projetComplet());
    expect(s).not.toBeNull();
    expect(typeof s!.azimutPrincipalDeg).toBe("number");
    expect(s!.azimutPrincipalDeg).toBe(90);
    expect(typeof s!.hauteurSousPlafondM).toBe("number");
    expect(s!.hauteurSousPlafondM).toBe(2.8);
    expect(typeof s!.etage).toBe("number");
    expect(s!.etage).toBe(2);
  });

  it("préserve lat/lon en pleine précision (aucun arrondi)", () => {
    const s = projetVersSaisieBanc(projetComplet())!;
    expect(s.point.lat).toBe(48.90693182287072);
    expect(s.point.lon).toBe(2.269431435588249);
  });

  it("force TOUJOURS le mode semi_auto (rejeu fidèle : point brut + snap façade)", () => {
    expect(projetVersSaisieBanc(projetComplet())!.mode).toBe("semi_auto");
    // Même si le projet portait par erreur un 'mode', le pont l'ignore et impose semi_auto.
    expect(projetVersSaisieBanc({ ...projetComplet(), mode: "manuel" })!.mode).toBe("semi_auto");
  });

  it("azimut_deg NULL (dossier pré-026) → null = NON REJOUABLE (aucun 400 possible)", () => {
    expect(projetVersSaisieBanc({ ...projetComplet(), azimut_deg: null })).toBeNull();
    expect(projetVersSaisieBanc({ ...projetComplet(), azimut_deg: undefined })).toBeNull();
    expect(projetVersSaisieBanc({ ...projetComplet(), azimut_deg: "" })).toBeNull();
  });

  it("lat ou lon manquant → null (point indispensable)", () => {
    expect(projetVersSaisieBanc({ ...projetComplet(), lat: null })).toBeNull();
    expect(projetVersSaisieBanc({ ...projetComplet(), lon: null })).toBeNull();
  });

  it("azimut = 0 est REJOUABLE (0 est un azimut valide, pas une absence)", () => {
    const s = projetVersSaisieBanc({ ...projetComplet(), azimut_deg: "0" });
    expect(s).not.toBeNull();
    expect(s!.azimutPrincipalDeg).toBe(0);
  });

  it("hauteur_sous_plafond_m NULL/≤0 → repli au défaut moteur 2,50 m (jamais 0 m)", () => {
    expect(projetVersSaisieBanc({ ...projetComplet(), hauteur_sous_plafond_m: null })!.hauteurSousPlafondM).toBe(
      HAUTEUR_SOUS_PLAFOND_DEFAUT_M,
    );
    expect(projetVersSaisieBanc({ ...projetComplet(), hauteur_sous_plafond_m: "0" })!.hauteurSousPlafondM).toBe(
      HAUTEUR_SOUS_PLAFOND_DEFAUT_M,
    );
  });

  it("etage NULL → 0 (rez-de-chaussée), reste rejouable si l'axe est présent", () => {
    const s = projetVersSaisieBanc({ ...projetComplet(), etage: null });
    expect(s).not.toBeNull();
    expect(s!.etage).toBe(0);
  });

  it("dernier_etage : seul `true` strict compte (null/absent → false)", () => {
    expect(projetVersSaisieBanc({ ...projetComplet(), dernier_etage: true })!.dernierEtage).toBe(true);
    expect(projetVersSaisieBanc({ ...projetComplet(), dernier_etage: null })!.dernierEtage).toBe(false);
    expect(projetVersSaisieBanc({ ...projetComplet(), dernier_etage: undefined })!.dernierEtage).toBe(false);
  });

  it("champ INCONNU (ex. future colonne paysage/photo) ignoré sans erreur (compat ascendante)", () => {
    const s = projetVersSaisieBanc({ ...projetComplet(), paysage: "URBAIN", photo_url: "x", champ_futur: 123 });
    expect(s).not.toBeNull();
    // La forme reste strictement géométrique : aucune clé parasite ne fuite dans les intrants du banc.
    expect(Object.keys(s!).sort()).toEqual(
      ["azimutPrincipalDeg", "dernierEtage", "etage", "hauteurSousPlafondM", "mode", "point"].sort(),
    );
  });
});

describe("parseHandoff — désérialisation défensive du transport sessionStorage", () => {
  const valide: SaisieBanc = {
    point: { lat: 48.9, lon: 2.26 },
    azimutPrincipalDeg: 90,
    etage: 2,
    hauteurSousPlafondM: 2.8,
    dernierEtage: false,
    mode: "semi_auto",
  };

  it("round-trip d'un handoff valide", () => {
    expect(parseHandoff(JSON.stringify(valide))).toEqual(valide);
  });

  it("null / chaîne vide / JSON invalide → null", () => {
    expect(parseHandoff(null)).toBeNull();
    expect(parseHandoff("")).toBeNull();
    expect(parseHandoff("{pas du json")).toBeNull();
  });

  it("point absent ou azimut non numérique → null (jamais d'intrant partiel)", () => {
    expect(parseHandoff(JSON.stringify({ ...valide, point: undefined }))).toBeNull();
    expect(parseHandoff(JSON.stringify({ ...valide, azimutPrincipalDeg: "abc" }))).toBeNull();
  });

  it("la clé de handoff est versionnée (stabilité du contrat de transport)", () => {
    expect(CLE_HANDOFF_BANC).toBe("svv.banc.rejeu.v1");
  });
});
