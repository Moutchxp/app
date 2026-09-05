import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * LOT 101 — geste de correction manuelle de parcelle. Composant client (fetch + état) → garde par LECTURE DE SOURCE : on prouve les
 * points d'HONNÊTETÉ et de comportement sans monter le DOM.
 */
const SRC = readFileSync(fileURLToPath(new URL('./CorrectionParcelle.tsx', import.meta.url)), 'utf8');
const RENDU = readFileSync(fileURLToPath(new URL('./CaracteristiquesRendu.tsx', import.meta.url)), 'utf8');
const BLOC = readFileSync(fileURLToPath(new URL('./CaracteristiquesBloc.tsx', import.meta.url)), 'utf8');

describe('CorrectionParcelle — proposer/choisir/saisir/annuler (garde par lecture de source)', () => {
  it('PROPOSE des candidates AVEC LEUR SURFACE (contenance) — le pouvoir de vérification d’Arno', () => {
    expect(SRC).toContain("action: 'candidats_parcelle'");
    expect(SRC).toContain('cadastre {c.contenance');       // la surface cadastrale est affichée par candidate
    expect(SRC).toContain('{c.section} {c.numero}');
  });
  it('CHOIX EXPLICITE (jamais d’application silencieuse) : chaque candidate a un bouton « rattacher à celle-ci »', () => {
    expect(SRC).toContain('rattacher à celle-ci');
    expect(SRC).toContain("action: 'corriger_parcelle'");
  });
  it('SAISIE LIBRE en repli, validée côté serveur (message d’erreur honnête si inexistante au cadastre)', () => {
    expect(SRC).toMatch(/aria-label="section cadastrale"/);
    expect(SRC).toMatch(/aria-label="numéro cadastral"/);
    expect(SRC).toContain('b.erreur');                      // l'issue vient du serveur (« cette référence n'existe pas au cadastre »)
  });
  it('AUCUNE candidate → message explicite, jamais un écran muet (piège LOT 71)', () => {
    expect(SRC).toContain('Aucune candidate plausible trouvée');
  });
  it('TRAÇABILITÉ + RÉVERSIBILITÉ : « rattachée à la main en remplacement de X » + annuler', () => {
    expect(SRC).toContain('rattachée à la main');
    expect(SRC).toContain('en remplacement de {refRemplacee}');
    expect(SRC).toContain("action: 'annuler_correction_parcelle'");
    expect(SRC).toContain('annuler la correction');
  });
  it('PL-A — PROVENANCE HONNÊTE : « à la main » CONDITIONNÉ à un acteur admin identifiable ; sinon la valeur BRUTE (né de verif-lot101)', () => {
    // la phrase passe par le décideur pur (jamais un « à la main » écrit en dur inconditionnel).
    expect(SRC).toContain('descriptionActeurParcelle');
    expect(SRC).toContain('d.aLaMain');
    // branche NON identifiable : on nomme l'auteur brut, on DIT que ce n'est pas un geste manuel identifié.
    expect(SRC).toContain('référence corrigée par');
    expect(SRC).toContain('pas un geste manuel identifié');
    // l'acteur (majPar/acteurNom) et la date (majLe) sont des entrées du composant.
    expect(SRC).toMatch(/majPar|acteurNom/);
    expect(SRC).toContain('majLe');
  });
  it('une parcelle rattachée AUTOMATIQUEMENT (géométrie, non corrigée) → aucun geste (pas de bruit)', () => {
    expect(SRC).toMatch(/if \(aGeometrie\) return null;/);
  });
  it('câblé dans le bloc « Parcelles cadastrales » et rafraîchit après correction', () => {
    expect(RENDU).toContain('<CorrectionParcelle');
    expect(RENDU).toMatch(/dossierId !== undefined && onParcelleChange &&/); // geste seulement si le parent le fournit
    expect(BLOC).toContain('onParcelleChange={() => void rafraichir()}');     // après correction/annulation → re-fetch (empreinte à jour)
  });
});
