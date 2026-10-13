import { describe, it, expect } from 'vitest';
import {
  biensDuBoutonHistorique, ficheHistoriqueDuBien, gesteHistorique, sousLibelleHistorique, type LienPourHistorique,
} from './boutonHistoriqueMail';

/**
 * 🔴🔴 LOT BOUTON-HISTORIQUE-SUR-LES-MAILS-RATTACHES — la règle du bouton « Historique », sans écran.
 * 🔒 Données inventées.
 */
const lien = (cle: string | null, o: Partial<LienPourHistorique> = {}): LienPourHistorique => ({
  statut: 'confirme', cible: { sorte: 'lot', cle }, libelle: `Libellé figé ${cle}`,
  bien: { adresse: `${cle} rue Inventée`, commune: 'VILLEFICTIVE' }, ...o,
});

describe('biensDuBoutonHistorique — la même règle que le bouton vert', () => {
  it('aucun lien, ou liens absents (migration 257) ⇒ aucun bien, donc pas de bouton', () => {
    expect(biensDuBoutonHistorique([])).toEqual([]);
    expect(biensDuBoutonHistorique(null)).toEqual([]);
    expect(biensDuBoutonHistorique(undefined)).toEqual([]);
  });

  it('un mail « À classer » (propositions seulement) n’a pas de bouton', () => {
    expect(biensDuBoutonHistorique([lien('12', { statut: 'propose' })])).toEqual([]);
  });

  it('un lien retiré ou un ancien lien « personne » ne comptent pas', () => {
    expect(biensDuBoutonHistorique([
      lien('12', { statut: 'retire' }),
      lien('34', { cible: { sorte: 'proprietaire', cle: '34' } }),
      lien(null),
    ])).toEqual([]);
  });

  it('un lien confirmé vers un lot ⇒ un bien, avec son adresse', () => {
    expect(biensDuBoutonHistorique([lien('396')])).toEqual([{ cle: '396', adresse: '396 rue Inventée, VILLEFICTIVE' }]);
  });

  it('sans faits d’annuaire, l’adresse retombe sur le libellé figé', () => {
    expect(biensDuBoutonHistorique([lien('7', { bien: null })])[0].adresse).toBe('Libellé figé 7');
  });

  it('un même lot (mail entier + une pièce) n’est compté qu’une fois, dans l’ordre des liens', () => {
    expect(biensDuBoutonHistorique([lien('2'), lien('1'), lien('2')]).map((b) => b.cle)).toEqual(['2', '1']);
  });

  it('la fiche courante est exclue ; seule, elle fait disparaître le bouton', () => {
    expect(biensDuBoutonHistorique([lien('5'), lien('6')], '5').map((b) => b.cle)).toEqual(['6']);
    expect(biensDuBoutonHistorique([lien('5')], '5')).toEqual([]);
  });
});

describe('sous-libellé, geste et adresse de la fiche', () => {
  it('un bien ⇒ son adresse et un lien direct ; plusieurs ⇒ « N biens » et une liste', () => {
    const un = biensDuBoutonHistorique([lien('1')]);
    const trois = biensDuBoutonHistorique([lien('1'), lien('2'), lien('3')]);
    expect(sousLibelleHistorique(un)).toBe('1 rue Inventée, VILLEFICTIVE');
    expect(gesteHistorique(un)).toBe('direct');
    expect(sousLibelleHistorique(trois)).toBe('3 biens');
    expect(gesteHistorique(trois)).toBe('liste');
    expect(gesteHistorique([])).toBe('aucun');
  });

  it('la fiche est désignée par la clé WIPPIMMO (bien-<n>) ; une clé non numérique ne mène nulle part', () => {
    expect(ficheHistoriqueDuBien('396')).toEqual({ sorte: 'bien', id: 396 });
    expect(ficheHistoriqueDuBien('abc')).toBeNull();
    expect(ficheHistoriqueDuBien('0')).toBeNull();
    expect(ficheHistoriqueDuBien('12a')).toBeNull();
  });
});
