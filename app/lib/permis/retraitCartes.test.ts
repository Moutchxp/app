import { describe, it, expect } from 'vitest';
import { planRetraitCartes, selectionRetraitValide, type CartePourPlan } from './retraitCartes';

/**
 * BAT-3 — DÉCISION PURE du changement de nombre + retrait non destructif. On éprouve : augmentation (crée, aucune confirmation) ;
 * diminution sur cartes VIDES (retrait direct, ordre déterministe : vides d'abord, plus récentes en tête) ; diminution qui touche une
 * carte porteuse de valeur / à ALTITUDE VALIDÉE (confirmation EXIGÉE, cartes nommées) ; validation d'une sélection explicite (choix réel).
 */
const carte = (id: number, o: Partial<CartePourPlan> = {}): CartePourPlan => ({ id, vide: false, valideeAltitude: false, nom: `bât ${id}`, ...o });

describe('BAT-3 — planRetraitCartes', () => {
  it('AUGMENTATION → crée les cartes manquantes, ne retire rien, aucune confirmation', () => {
    expect(planRetraitCartes([carte(1), carte(2)], 4)).toMatchObject({ aCreer: 2, aRetirer: [], besoinConfirmation: false, actuel: 2, cible: 4 });
  });
  it('ÉGALITÉ → no-op (rien créé, rien retiré)', () => {
    expect(planRetraitCartes([carte(1)], 1)).toMatchObject({ aCreer: 0, aRetirer: [], besoinConfirmation: false });
  });
  it('DIMINUTION sur cartes VIDES → retrait direct, ordre déterministe (plus récentes d’abord), SANS confirmation', () => {
    const p = planRetraitCartes([carte(1, { vide: true }), carte(2, { vide: true }), carte(3, { vide: true })], 1);
    expect(p.besoinConfirmation).toBe(false);
    expect(p.aRetirer.map((c) => c.id)).toEqual([3, 2]); // 2 à retirer, les plus récentes (id DESC)
    expect(p.aCreer).toBe(0);
  });
  it('les cartes VIDES partent AVANT les porteuses de valeur (on ne franchit pas sans nécessité)', () => {
    const p = planRetraitCartes([carte(1, { valideeAltitude: true }), carte(2, { vide: true }), carte(3, { vide: true })], 2);
    expect(p.aRetirer.map((c) => c.id)).toEqual([3]); // 1 à retirer → une VIDE (la plus récente), jamais la validée
    expect(p.besoinConfirmation).toBe(false);
  });
  it('DIMINUTION qui touche une ALTITUDE VALIDÉE → confirmation EXIGÉE, carte validée nommée', () => {
    const p = planRetraitCartes([carte(1, { valideeAltitude: true, nom: 'A1' }), carte(2, { vide: true })], 0);
    expect(p.aRetirer.map((c) => c.id)).toEqual([2, 1]); // vide d'abord, puis la validée
    expect(p.besoinConfirmation).toBe(true);
    expect(p.aRetirer.find((c) => c.valideeAltitude)?.nom).toBe('A1');
  });
  it('une carte porteuse de valeur NON validée déclenche AUSSI la confirmation (jamais franchir une valeur sans confirmation)', () => {
    expect(planRetraitCartes([carte(1, { vide: false, valideeAltitude: false })], 0).besoinConfirmation).toBe(true);
  });
  it('cible négative bornée à 0', () => {
    const p = planRetraitCartes([carte(1, { vide: true })], -3);
    expect(p.cible).toBe(0); expect(p.aRetirer.map((c) => c.id)).toEqual([1]);
  });
});

describe('BAT-3 — selectionRetraitValide (choix réel de l’écran)', () => {
  const cartes = [carte(1, { vide: true }), carte(2), carte(3, { valideeAltitude: true, nom: 'A3' })];
  it('sélection au bon cardinal et sur des cartes actives → ok (ordre stable vides→récentes)', () => {
    const r = selectionRetraitValide(cartes, [3, 2], 1); // actuel 3, cible 1 → 2 à retirer
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.aRetirer.map((c) => c.id)).toEqual([3, 2]); expect(r.besoinConfirmation).toBe(true); }
  });
  it('mauvais cardinal → refus (rien retiré)', () => {
    expect(selectionRetraitValide(cartes, [3], 1).ok).toBe(false); // il en faut 2
  });
  it('id inconnu (non actif du dossier) → refus', () => {
    expect(selectionRetraitValide(cartes, [99, 2], 1).ok).toBe(false);
  });
  it('doublons neutralisés → un id répété ne compte qu’une fois (refus si le compte ne suffit plus)', () => {
    expect(selectionRetraitValide(cartes, [2, 2], 1).ok).toBe(false);
  });
});
