import { describe, it, expect } from 'vitest';
import { etatProjectionTitre, etatAltitudesTitre } from './etatFamilleProjection';

/**
 * RATT-1 — états portés par la ligne de titre des familles « Bâtiments et projection » / « Caractéristiques du permis ». PUR.
 * Règle NON négociable (Arno) : 0 bâtiment déclaré → NEUTRE (ni « renseignées », ni « manquantes » : rien à renseigner).
 */
describe('RATT-1 — etatProjectionTitre', () => {
  it('non validée → rouge ; validée → vert', () => {
    expect(etatProjectionTitre(false)).toEqual({ texte: 'projection non validée', ton: 'rouge' });
    expect(etatProjectionTitre(true)).toEqual({ texte: 'projection validée', ton: 'vert' });
  });
});

describe('RATT-1 — etatAltitudesTitre', () => {
  it('0 bâtiment déclaré → NEUTRE (jamais mentir)', () => {
    expect(etatAltitudesTitre(0, 0)).toEqual({ texte: 'aucun bâtiment déclaré', ton: 'neutre' });
    expect(etatAltitudesTitre(0, 5)).toEqual({ texte: 'aucun bâtiment déclaré', ton: 'neutre' }); // garde-fou : nb sans altitude ignoré si 0 déclaré
  });
  it('≥ 1 bâtiment sans altitude → rouge (avec compte) ; pluriel accordé', () => {
    expect(etatAltitudesTitre(2, 1)).toEqual({ texte: 'altitude manquante (1/2)', ton: 'rouge' });
    expect(etatAltitudesTitre(3, 2)).toEqual({ texte: 'altitudes manquantes (2/3)', ton: 'rouge' });
  });
  it('toutes renseignées → vert (avec compte) ; pluriel accordé', () => {
    expect(etatAltitudesTitre(1, 0)).toEqual({ texte: 'altitudes renseignées (1 bâtiment)', ton: 'vert' });
    expect(etatAltitudesTitre(4, 0)).toEqual({ texte: 'altitudes renseignées (4 bâtiments)', ton: 'vert' });
  });
});
