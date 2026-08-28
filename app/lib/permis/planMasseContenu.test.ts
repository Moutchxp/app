import { describe, it, expect } from 'vitest';
import { familleDeContenu } from './planMasseContenu';

/**
 * PROV-2 (a) — reconnaissance de famille par le CONTENU (repli des noms opaques). On éprouve les signaux PRÉCIS ET, surtout, l'ABSENCE
 * de faux positifs sur une NOTICE qui mentionne « plan de masse » / « niveau » en prose (le piège mesuré sur 531).
 */
describe('PROV-2 (a) — familleDeContenu', () => {
  it('CERFA ← n° national 13409 + contexte (LECT-1 A)', () => {
    expect(familleDeContenu(['1 / 23  N° 13409*14  CERFA  Demande de Permis de construire'])).toBe('cerfa');
  });

  it('coupe ← table de nivellement (LECT-1 B : cotes appariées à RDC/R+n)', () => {
    expect(familleDeContenu(['coupe AA — h : 98.95 102.37 105.09 107.81 110.53 113.97 116.91 RDC R+1 R+2 R+3 R+4 Egout Faîtage'])).toBe('coupe');
  });

  it('masse ← cartouche réglementaire « constructions à édifier ou modifier »', () => {
    expect(familleDeContenu(['PLAN DE MASSE DES CONSTRUCTIONS À ÉDIFIER OU MODIFIER — échelle 1:200'])).toBe('masse');
  });

  it('PROV-3 (1) — masse ← VOCABULAIRE DE SITE quand le titre est graphique (planche courte, sans « plan de masse »)', () => {
    // planche réelle 531 : pas de titre-texte, mais « cour commune » + cotes → plan de masse.
    expect(familleDeContenu(['1/100 N PROJET Cour commune S = 123.40m² Cour commune S = 109.10m² 98,95 99.15'])).toBe('masse');
    expect(familleDeContenu(['Limite de propriété 98.95 102.37 Cote de nivellement d’îlot 100.00 RDC R+1'])).toBe('masse');
  });

  it('PROV-3 (1) — masse ← titre « P L A N  D E  M A S S E » ESPACÉ lettre-à-lettre (dé-espacement) + site', () => {
    expect(familleDeContenu(['P L A N   D E   M A S S E   P R O J E T   Cour commune S = 123 m²'])).toBe('masse');
  });

  it('PROV-3 (1) — masse AVANT coupe : une planche avec cour commune ET table de nivellement → masse (marqueur de site)', () => {
    expect(familleDeContenu(['Cour commune S = 123.40m² 98.95 102.37 105.09 107.81 110.53 113.97 116.91 RDC R+1 R+2 R+3 R+4 Egout Faîtage'])).toBe('masse');
  });

  it('PROV-3 (1) — un DOCUMENT long citant « cour commune » en prose → PAS masse (seuil planche)', () => {
    const long = 'La notice décrit la cour commune du projet. '.repeat(120); // ~5000 car > seuil planche
    expect(familleDeContenu([long])).toBeNull();
  });

  it('NOTICE mentionnant « plan de masse » en PROSE (sans cartouche, sans table) → null (0 faux positif)', () => {
    expect(familleDeContenu(['La notice de sécurité décrit le plan de masse et les niveaux R+3 du projet.'])).toBeNull();
  });

  it('NOTICE mentionnant « niveau / R+4 » en prose → null (pas de signal de dessin)', () => {
    expect(familleDeContenu(['Il s’agit de la construction d’un immeuble de R+4 sur 1 niveau de sous-sol.'])).toBeNull();
  });

  it('pièce MUETTE (scan sans texte) → null (aucun signal — reste dans « autres »)', () => {
    expect(familleDeContenu([])).toBeNull();
  });

  it('PRIORITÉ : le Cerfa prime sur une table de nivellement présente plus loin', () => {
    expect(familleDeContenu(['N° 13409 CERFA permis de construire', '98.95 102.37 105.09 RDC R+1 R+2'])).toBe('cerfa');
  });
});
