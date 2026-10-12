import { describe, it, expect } from 'vitest';
import {
  etatBoutonPortee, MENTION_ORIGINE_BIENS_COCHES, MOT_SELECTIONNER_UN_BIEN, MOT_VALIDER_MAINTIEN,
  MOT_VALIDER_MODIFICATION, type PositionPortee,
} from '../../../../lib/gestion/porteeSuivi';

/**
 * ══ 🔴🔴 LOT BOUTON-DE-VALIDATION-DU-PREMIER-RATTACHEMENT — CHAQUE COMBINAISON DU BOUTON DE LA PORTÉE ══════════════════
 *
 * Biens cochés (0 / 1 / 2) × position (Origine, One shot, Ce mail + futurs échanges, Toute la conversation) × premier
 * rattachement ou modification. Règle d'Arno du 12/10/2026 ; la modification garde ses libellés (décocher tout y est le
 * geste existant qui retire le mail du suivi de ses biens).
 */
const POSITIONS: PositionPortee[] = ['origine', 'one_shot', 'suite', 'conversation'];
const MOTS: Record<Exclude<PositionPortee, 'origine'>, string> = {
  one_shot: 'Valider le rattachement one shot',
  suite: 'Valider le rattachement de fond',
  conversation: 'Valider le rattachement toute la conversation',
};

describe('🔴🔴 premier rattachement (mail jamais classé)', () => {
  for (const position of POSITIONS) {
    for (const nbCoches of [0, 1, 2]) {
      it(`${position}, ${nbCoches} bien(s) coché(s)`, () => {
        const e = etatBoutonPortee({ premier: true, position, modification: nbCoches > 0, nbCoches });
        if (position === 'origine') {
          expect(e).toEqual({
            mot: MOT_VALIDER_MAINTIEN, aspect: 'plein', inactif: false,
            mention: nbCoches > 0 ? MENTION_ORIGINE_BIENS_COCHES : null,
          });
        } else if (nbCoches === 0) {
          expect(e).toEqual({ mot: MOT_SELECTIONNER_UN_BIEN, aspect: 'vide', inactif: true, mention: null });
        } else {
          expect(e).toEqual({ mot: MOTS[position], aspect: 'plein', inactif: false, mention: null });
        }
      });
    }
  }

  it('les libellés, mot pour mot', () => {
    expect(MOT_SELECTIONNER_UN_BIEN).toBe('Sélectionner minimum un bien');
    expect(MENTION_ORIGINE_BIENS_COCHES).toBe('Les biens cochés ne seront pas rattachés en position Origine.');
  });
});

describe('🔴🔴 modification (mail déjà classé) : les libellés de modification, jamais le bouton blanc', () => {
  for (const position of POSITIONS) {
    for (const nbCoches of [0, 1, 2]) {
      for (const modification of [false, true]) {
        it(`${position}, ${nbCoches} coché(s), ${modification ? 'modifié' : 'inchangé'}`, () => {
          const e = etatBoutonPortee({ premier: false, position, modification, nbCoches });
          expect(e).toEqual({
            mot: modification ? MOT_VALIDER_MODIFICATION : MOT_VALIDER_MAINTIEN,
            aspect: 'plein', inactif: false, mention: null,
          });
        });
      }
    }
  }
});
