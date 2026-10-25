// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CSS_LOCATION_CREATION } from './commun';

/**
 * 🔴 Arno (25/10/2026) — LES CARTES DU BLOC 1 : 10 % plus étroites, en RANGÉE QUI DÉFILE (la 3ᵉ se voit coupée par le bord droit).
 * jsdom ne calcule pas de largeur : on éprouve la règle (90 % de la colonne d'avant) et le composant ; les mesures au pixel sont dans
 * `.captures/suivi-location/cartes-cascade/mesures.txt` (banc Chrome).
 */
describe('🔴 les cartes du bloc 1 (Nouveau locataire, Fiche locataire, Nouveau propriétaire — SaisieCartes)', () => {
  it('la rangée qui défile (Rangee : accroche, fondu, flèches seulement s’il reste du contenu)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/SaisieCartes.tsx', 'utf8');
    expect(src).toContain('<Rangee nb={cartes.length + 1} classe="loc-cartes-creation">');
    expect(src).not.toContain('<div className="loc-cartes-creation">');
  });
  it('−10 % : 90 % de la colonne d’avant (1 colonne sous 780 px, 2 au-delà, écart 20 px) ; l’ancienne grille qui passait à la ligne a disparu', () => {
    expect(CSS_LOCATION_CREATION).toContain('.loc-cartes-creation>*{flex:0 0 calc(100cqw * .9);min-width:0;box-sizing:border-box}');
    expect(CSS_LOCATION_CREATION).toContain('@container (min-width:780px){ .loc-cartes-creation>*{flex-basis:calc((100cqw - 20px) / 2 * .9)} }');
    expect(CSS_LOCATION_CREATION).not.toContain('.loc-cartes-creation{display:grid');
  });
});

describe('🔴 les cartes du Dossier de location', () => {
  it('même rangée ; 90 % de la colonne de leur grille d’avant (au moins 280 px, écart 12 px)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/ModaleDossierLocation.tsx', 'utf8');
    expect(src).toContain('<Rangee nb={l.locataires.length} classe="mdl-cartes">');
    expect(src).toContain('@container (min-width:864px){ .mdl-cartes>*{flex-basis:calc((100cqw - 24px) / 3 * .9)} }');
  });
});
