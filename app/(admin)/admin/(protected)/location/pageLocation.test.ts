import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴🔴 Arno (28/11/2026, 11h59, accord explicite pour CE texte) — « Supprimer la ligne "L'espace de l'équipe location : …", elle n'a aucun intérêt. Garder
 * cette ligne vide, pour ne pas faire remonter tout ce qui suit en dessous. »
 */
describe('page Location : la ligne du sous-titre, vide, à la même hauteur', () => {
  const page = readFileSync('app/(admin)/admin/(protected)/location/page.tsx', 'utf8');
  it('le texte est retiré ; le sous-titre reste (EnTetePage, même place)', () => {
    expect(page).not.toContain('L’espace de l’équipe location');
    expect(page).toContain("const INTRO_LOCATION = '';");
    expect(page).toContain('intro={INTRO_LOCATION}');
    expect(page).toContain('<section className="gst-page loc-accueil-page">');
  });
  it('la ligne vide garde la hauteur du texte retiré à chaque largeur (1, 2 ou 3 lignes, mesuré au Chrome) : rien ne remonte', () => {
    expect(page).toContain("'.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:1.45em}'");
    expect(page).toContain("'@media (max-width:999.98px){.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:2.9em}}'");
    expect(page).toContain("'@media (min-width:760px) and (max-width:767.98px){.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:1.45em}}'");
    expect(page).toContain("'@media (max-width:412.98px){.loc-accueil-page > .svv-page-head > .svv-page-sub{min-height:4.35em}}'");
    // une seule chaîne dans <style> (deux enfants texte y font échouer l'hydratation)
    expect(page).toContain('<style>{CSS_TITRE_VACANTS + CSS_INTRO_VIDE}</style>');
  });
});
