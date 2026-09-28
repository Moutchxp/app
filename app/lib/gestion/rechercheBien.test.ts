import { describe, it, expect } from 'vitest';
import {
  classerResultats, messageAucunBien, motRaison, rangDuBien, rangRaison, raisonsTriees, sansLesProposes,
  type RaisonCorrespondance,
} from './rechercheBien';

/**
 * 🔴 LOT BIEN-RATTACHE — LA RECHERCHE D'UN BIEN, ET POURQUOI IL RÉPOND. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce qui est protégé ici :
 *   ① les résultats sont classés par PERTINENCE : l'adresse d'abord, puis les noms, puis téléphone et e-mail ;
 *   ② chaque résultat DIT pourquoi il est là — sans le motif, on ne peut pas trancher ;
 *   ③ un bien déjà proposé par l'automatisation n'est pas répété dans les résultats ;
 *   ④ « aucun bien trouvé » dit CE QU'ON A CHERCHÉ, jamais « aucun résultat » tout court.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const r = (sorte: RaisonCorrespondance['sorte'], detail = ''): RaisonCorrespondance => ({ sorte, detail });

describe('🔴 ① la pertinence : l’adresse d’abord, puis les noms, puis les coordonnées', () => {
  it('l’ordre des rangs est celui d’Arno', () => {
    expect(rangRaison('adresse')).toBe(0);
    expect(rangRaison('lot')).toBe(0);
    expect(rangRaison('proprietaire')).toBe(1);
    expect(rangRaison('locataire')).toBe(1);
    expect(rangRaison('locataire_passe')).toBe(1);
    expect(rangRaison('telephone_proprietaire')).toBe(2);
    expect(rangRaison('email_locataire')).toBe(2);
  });

  it('🔴 un bien trouvé PAR PLUSIEURS chemins est classé sur le MEILLEUR', () => {
    expect(rangDuBien([r('telephone_proprietaire', 'X'), r('adresse')])).toBe(0);
    expect(rangDuBien([r('telephone_proprietaire', 'X')])).toBe(2);
    expect(rangDuBien([])).toBe(9);
  });

  it('les résultats sont classés par rang, puis par adresse — deux recherches donnent la même liste', () => {
    const l = classerResultats([
      { adresse: '9 rue Zola', raisons: [r('telephone_proprietaire', 'X')] },
      { adresse: '12 rue Alpha', raisons: [r('adresse')] },
      { adresse: '2 rue Alpha', raisons: [r('adresse')] },
      { adresse: '5 rue Beta', raisons: [r('locataire', 'DUPONT')] },
    ]);
    expect(l.map((x) => x.adresse)).toEqual(['2 rue Alpha', '12 rue Alpha', '5 rue Beta', '9 rue Zola']);
  });
});

describe('🔴 ② chaque résultat DIT pourquoi il est là', () => {
  it('le mot de chaque raison nomme la personne quand il y en a une', () => {
    expect(motRaison(r('adresse'))).toBe('adresse');
    expect(motRaison(r('lot'))).toBe('n° de lot');
    expect(motRaison(r('proprietaire', 'MARTY Jean-François'))).toBe('propriétaire MARTY Jean-François');
    expect(motRaison(r('locataire', 'ABIDI Aymen'))).toBe('locataire ABIDI Aymen');
    // 🔴 LE LOCATAIRE PASSÉ EST DIT COMME TEL : un litige de dépôt de garantie se traite avec le locataire SORTI.
    expect(motRaison(r('locataire_passe', 'DUPONT'))).toBe('locataire passé DUPONT');
    expect(motRaison(r('telephone_proprietaire', 'MARS AVENIR'))).toBe('téléphone de MARS AVENIR');
    expect(motRaison(r('email_locataire', 'SARL MACJ'))).toBe('e-mail de SARL MACJ');
  });

  it('sans nom, le mot reste lisible plutôt que de laisser un blanc', () => {
    expect(motRaison(r('proprietaire'))).toBe('propriétaire');
    expect(motRaison(r('telephone_locataire'))).toBe('téléphone du locataire');
  });

  it('les raisons sont dédoublonnées et la meilleure passe en tête', () => {
    const t = raisonsTriees([
      r('telephone_proprietaire', 'X'), r('adresse'), r('telephone_proprietaire', 'X'), r('locataire', 'D'),
    ]);
    expect(t.map((x) => x.sorte)).toEqual(['adresse', 'locataire', 'telephone_proprietaire']);
  });
});

describe('🔴 ③ un bien déjà proposé n’est pas répété', () => {
  it('il disparaît des résultats de recherche', () => {
    const l = sansLesProposes([{ cle: '445' }, { cle: '446' }, { cle: '447' }], ['446']);
    expect(l.map((x) => x.cle)).toEqual(['445', '447']);
  });

  it('sans proposition, tout est gardé', () => {
    expect(sansLesProposes([{ cle: '445' }], []).map((x) => x.cle)).toEqual(['445']);
  });
});

describe('🔴 ④ « aucun bien trouvé » dit ce qu’on a cherché', () => {
  it('il rappelle la requête ET les quatre entrées possibles', () => {
    const m = messageAucunBien('victor hugo');
    expect(m).toContain('victor hugo');
    expect(m).toContain('adresse');
    expect(m).toContain('passé');
    expect(m).toContain('téléphone');
    expect(m).toContain('e-mail');
  });

  it('une requête vide invite à taper, plutôt que d’annoncer un échec', () => {
    expect(messageAucunBien('   ')).toContain('Tapez');
  });
});
