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
