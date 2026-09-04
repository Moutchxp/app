import { describe, it, expect } from 'vitest';
import { lireDeclarationsRecapCerfa } from './recapCerfa';

/** LOT 67 — lecture DÉTERMINISTE des déclarations d'un récapitulatif (régime ①) + champ libre VERBATIM (régime ②). Aucune I/O, aucune IA. */

// Extrait fidèle à la forme pdfjs mesurée sur le dossier 7424 (récapitulatif télé-service).
const RECAP = [
  "Superficie totale du terrain (m²) : 5015 Situation du terrain",
  "Références cadastrales Préfixe Section Numéro Surface (m²) Observation Partielle 0 Z 1 600 Non 0 AB 157 1320 Non Situation juridique du terrain",
  "Nature du projet envisagé Nouvelle construction Travaux sur construction existante Le terrain doit être divisé",
  "Courte description de votre projet ou de vos travaux : Le projet consist e en la construction de 67 logements neufs sur 3 plots de A à C.",
  "Votre projet porte sur une installation agrivoltaïque : Non",
  "Nombre total de logements créés : 67 dont individuels : 0 dont collectifs : 67",
  "Nombre de niveaux du bâtiment le plus élevé Au dessus du sol : 5 Au dessous du sol : 1 Les travaux comprennent",
  "Emprise au sol avant travaux (en m²) : 0 Emprise au sol créée (en m²) : 1354 Emprise au sol supprimée (en m²) :",
  "Stationnement Nombre de places avant réalisation du projet : 0 Nombre de places après réalisation du projet : 49",
  "Surfaces totales (m²) 0 4994 0 0 0 4994 À remplir lorsque",
  "Déposé le : 04/11/2025 À Aubervilliers",
].join(' ');

describe('lireDeclarationsRecapCerfa — régime ① : champs structurés déterministes', () => {
  const d = lireDeclarationsRecapCerfa(RECAP);
  it('lit tous les scalaires étiquetés, sans dérivation', () => {
    expect(d.present).toBe(true);
    expect(d.dateDepot).toBe('04/11/2025');
    expect(d.superficieTerrainM2).toBe(5015);
    expect({ t: d.logementsTotal, i: d.logementsIndividuels, c: d.logementsCollectifs }).toEqual({ t: 67, i: 0, c: 67 });
    expect({ dessus: d.niveauxDessusSol, dessous: d.niveauxDessousSol }).toEqual({ dessus: 5, dessous: 1 });
    expect({ av: d.stationnementAvant, ap: d.stationnementApres }).toEqual({ av: 0, ap: 49 });
    expect(d.empriseAuSolCreeeM2).toBe(1354);
    expect(d.surfacePlancherTotaleM2).toBe(4994); // dernière colonne de « Surfaces totales » = Surface totale
  });
  it('un ZÉRO déclaré est lu comme 0, jamais confondu avec l’absence', () => {
    expect(d.logementsIndividuels).toBe(0);
    expect(d.stationnementAvant).toBe(0);
  });
});

describe('lireDeclarationsRecapCerfa — régime ② : champ libre VERBATIM', () => {
  it('extrait le texte tel quel (y compris les coupures d’aplatissement PDF), jamais résumé ni interprété', () => {
    const d = lireDeclarationsRecapCerfa(RECAP);
    expect(d.descriptionProjet).toBe('Le projet consist e en la construction de 67 logements neufs sur 3 plots de A à C.');
    expect(d.descriptionProjet).toContain('consist e'); // coupure conservée : aucune recomposition (pas d’inférence)
  });
});

describe('lireDeclarationsRecapCerfa — N10-R / ambiguïté : jamais un vide muet, jamais deviné', () => {
  const d = lireDeclarationsRecapCerfa(RECAP);
  it('les champs ABSENTS du formulaire sont dits avec un motif', () => {
    expect(d.absents.map((a) => a.champ)).toEqual(['surface habitable', 'nombre de bâtiments', 'noms des bâtiments']);
    expect(d.absents.find((a) => a.champ === 'surface habitable')!.motif).toMatch(/surface de PLANCHER/i);
  });
  it('la nature du projet est signalée AMBIGUË, pas écrite (deux libellés sans marque de sélection)', () => {
    expect(d.ambigus.map((a) => a.champ)).toContain('nature du projet');
  });
  it('un texte qui n’est pas un récapitulatif → present=false, aucune valeur', () => {
    const v = lireDeclarationsRecapCerfa('un plan de masse quelconque');
    expect(v.present).toBe(false);
    expect(v.dateDepot).toBeNull();
    expect(v.superficieTerrainM2).toBeNull();
  });
});
