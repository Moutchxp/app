import { describe, it, expect } from 'vitest';
import { lireDecompteDescription } from './decompteDescription';

// Texte RÉEL du champ libre du dossier 7424 (mesuré sur la base locale, coupures d'aplatissement pdfjs CONSERVÉES : « consist e »,
// « po ur », « so us-sol », « gri lle »). C'est le SEUL récapitulatif de la base portant à la fois un décompte par bâtiment ET un total.
const DESC_7424 =
  "Le projet concerne la construction d'un projet immobilier en surplomb partiel de la future gare Mairie d'Aubervilliers. Le projet " +
  "consist e en la construction de 67 logements neufs, répartis sur 3 plots de A à C sur un ensemble de parcelles de 3436m² : 40 " +
  "logements po ur le Bat. A, 18 pour le Bat. B et 9 pour le Bat. C. 2 locaux commerciaux à rdc (de 177m² et 69m² en coques brutes) " +
  "sont créés. 1 so us-sol (parking de 49 pl.) est également construit. Les 3 plots à R+5 présentent des façades à l'alignement.";

describe('lireDecompteDescription — CORROBORATION par la somme (le cas concordant)', () => {
  it('lit le décompte par bâtiment malgré les coupures pdfjs, et le RETIENT car 40+18+9 = total structuré 67', () => {
    const d = lireDecompteDescription(DESC_7424, 67);
    expect(d.batiments).toEqual([{ repere: 'A', logements: 40 }, { repere: 'B', logements: 18 }, { repere: 'C', logements: 9 }]);
    expect(d.sommeLogements).toBe(67);
    expect(d.nbBatimentsDeclare).toBe(3);
    expect(d.concordant).toBe(true);
    expect(d.nbBatimentsRetenu).toBe(3);
    expect(d.motifEcart).toBeNull();
    expect(d.extrait).toBe('Bat. A : 40 · Bat. B : 18 · Bat. C : 9');
  });

  it('lit les valeurs INFORMATIVES (locaux commerciaux + surfaces, stationnement) sans les corroborer', () => {
    const d = lireDecompteDescription(DESC_7424, 67);
    expect(d.locauxCommerciaux).toEqual([{ surfaceM2: 177 }, { surfaceM2: 69 }]);
    expect(d.placesStationnement).toBe(49);
  });
});

describe('lireDecompteDescription — la porte arithmétique bloque tout ce qui ne concorde pas (RIEN écrit)', () => {
  it('sans total structuré, un décompte lu n’est JAMAIS retenu (motif explicite)', () => {
    const d = lireDecompteDescription(DESC_7424, null);
    expect(d.concordant).toBe(false);
    expect(d.nbBatimentsRetenu).toBeNull();
    expect(d.sommeLogements).toBe(67);
    expect(d.motifEcart).toMatch(/aucun total structuré/i);
    expect(d.motifEcart).toContain('40+18+9=67');
  });

  it('somme ≠ total structuré → non écrit, motif chiffré', () => {
    const d = lireDecompteDescription(DESC_7424, 65);
    expect(d.concordant).toBe(false);
    expect(d.nbBatimentsRetenu).toBeNull();
    expect(d.motifEcart).toBe('somme 40+18+9=67 ≠ total structuré 65 — non écrit');
  });

  it('nombre de bâtiments déclaré ≠ nombre d’entrées lues → non écrit (garde contre un parse partiel)', () => {
    // « 4 plots » mais seulement 2 décomptes lisibles, somme = total → la cohérence du compte bloque quand même l'écriture.
    const txt = 'Construction de 58 logements sur 4 plots : 40 logements pour le Bat. A, 18 pour le Bat. B.';
    const d = lireDecompteDescription(txt, 58);
    expect(d.batiments).toHaveLength(2);
    expect(d.sommeLogements).toBe(58);
    expect(d.nbBatimentsDeclare).toBe(4);
    expect(d.concordant).toBe(false);
    expect(d.motifEcart).toBe('4 bâtiments déclarés ≠ 2 décompte(s) lu(s) — non écrit');
  });
});

describe('lireDecompteDescription — absence : jamais une invention, jamais un rejet muet', () => {
  it('une prose sans décompte par bâtiment (un seul chiffre global) ne produit AUCUN décompte ni motif d’écart', () => {
    // Cas mesuré (dossier 531) : « 21 logements » sans répartition ni total structuré.
    const d = lireDecompteDescription('Construction d’une résidence sociale de 21 logements R+3+attique sur 1 niveau de sous-sol.', null);
    expect(d.batiments).toEqual([]);
    expect(d.concordant).toBe(false);
    expect(d.motifEcart).toBeNull(); // rien lu ≠ écart : l'absence est portée par `absents` (recapCerfa), pas par un motif de rejet
    expect(d.nbBatimentsRetenu).toBeNull();
  });

  it('une description vide ou nulle → décompte vide, jamais concordant', () => {
    expect(lireDecompteDescription(null, 67).concordant).toBe(false);
    expect(lireDecompteDescription('', 67).batiments).toEqual([]);
  });

  it('« lots » du gabarit Cerfa vierge n’est JAMAIS pris pour un nombre de bâtiments', () => {
    const d = lireDecompteDescription('Nombre maximum de lots projetés : 12. Surface de plancher maximale envisagée.', 12);
    expect(d.nbBatimentsDeclare).toBeNull();
    expect(d.batiments).toEqual([]);
    expect(d.concordant).toBe(false);
  });
});
