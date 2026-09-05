import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * LOT 101 → PL-C5 — le chemin MUTANT « rattacher à la main » (candidats/corriger, qui gelait la ligne) est RETIRÉ : ne subsiste que
 * l'AFFICHAGE d'une correction héritée + son ANNULATION (dégel). Garde par LECTURE DE SOURCE des points d'honnêteté et de câblage.
 */
const SRC = readFileSync(fileURLToPath(new URL('./CorrectionParcelle.tsx', import.meta.url)), 'utf8');
const RENDU = readFileSync(fileURLToPath(new URL('./CaracteristiquesRendu.tsx', import.meta.url)), 'utf8');
const BLOC = readFileSync(fileURLToPath(new URL('./CaracteristiquesBloc.tsx', import.meta.url)), 'utf8');

describe('CorrectionParcelle — chemin mutant RETIRÉ, annulation conservée', () => {
  it('🔴 le chemin MUTANT est retiré : plus aucune correction/candidate/saisie (jamais un origine=saisie posé depuis l’écran)', () => {
    expect(SRC).not.toContain("action: 'candidats_parcelle'");
    expect(SRC).not.toContain("action: 'corriger_parcelle'");
    expect(SRC).not.toContain('rattacher à celle-ci');
    expect(SRC).not.toContain('rattacher à la main…');   // l'entrée « rattacher à la main » (proposition) a disparu
    expect(SRC).not.toMatch(/aria-label="section cadastrale"/);
  });
  it('ANNULATION conservée (dégeler une ligne héritée) : « en remplacement de X » + annuler', () => {
    expect(SRC).toContain('en remplacement de {refRemplacee}');
    expect(SRC).toContain("action: 'annuler_correction_parcelle'");
    expect(SRC).toContain('annuler la correction');
  });
  it('PROVENANCE HONNÊTE : « à la main » CONDITIONNÉ à un acteur admin identifiable ; sinon la valeur BRUTE (né de verif-lot101)', () => {
    expect(SRC).toContain('descriptionActeurParcelle');
    expect(SRC).toContain('d.aLaMain');
    expect(SRC).toContain('référence corrigée par');
    expect(SRC).toContain('pas un geste manuel identifié');
    expect(SRC).toMatch(/majPar|acteurNom/);
    expect(SRC).toContain('majLe');
  });
  it('toute parcelle NON corrigée → aucun geste ici (la composition se fait dans la planche) : return null', () => {
    expect(SRC).toMatch(/return null;/);
    expect(SRC).toContain('planche cadastrale'); // le commentaire renvoie explicitement à la planche
  });
  it('câblé dans le bloc « Parcelles cadastrales » et rafraîchit après annulation', () => {
    expect(RENDU).toContain('<CorrectionParcelle');
    expect(RENDU).toMatch(/dossierId !== undefined && onParcelleChange &&/);
    expect(BLOC).toContain('onParcelleChange={() => void rafraichir()}');
  });
});
