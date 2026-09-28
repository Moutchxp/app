import { describe, it, expect } from 'vitest';
import {
  classerResultats, grouperResultats, messageAucunBien, motRaison, rangDuBien, rangRaison, raisonsTriees,
  sansLesProposes, titreGroupe, type RaisonCorrespondance,
} from './rechercheBien';

/**
 * 🔴 LOT BIEN-RATTACHE — LA RECHERCHE D'UN BIEN, ET POURQUOI IL RÉPOND. Module PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce qui est protégé ici :
 *   ① les résultats sont classés par PERTINENCE : l'adresse d'abord, puis les noms, puis téléphone et e-mail ;
 *   ② chaque résultat DIT pourquoi il est là — sans le motif, on ne peut pas trancher ;
 *   ③ un bien déjà proposé par l'automatisation n'est pas répété dans les résultats ;
 *   ④ « aucun bien trouvé » dit CE QU'ON A CHERCHÉ, jamais « aucun résultat » tout court ;
 *   ⑤ 🔴 LES DEUX GROUPES TITRÉS : « Par adresse » d'abord, « Par nom ou coordonnée » ensuite, et un bien qui
 *      répond aux deux titres n'est QUE dans le premier.
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

describe('🔴 ⑤ les deux groupes titrés', () => {
  const b = (adresse: string, raisons: RaisonCorrespondance[]) => ({ adresse, raisons });

  it('les titres sont écrits en toutes lettres', () => {
    expect(titreGroupe('adresse')).toBe('Par adresse');
    expect(titreGroupe('nom_ou_coordonnee')).toBe('Par nom ou coordonnée');
  });

  it('🔴 « Par adresse » vient EN PREMIER, « Par nom ou coordonnée » ensuite', () => {
    const g = grouperResultats([
      b('9 rue Zola', [r('telephone_proprietaire', 'X')]),
      b('2 rue Alpha', [r('adresse')]),
    ]);
    expect(g.map((x) => x.titre)).toEqual(['Par adresse', 'Par nom ou coordonnée']);
    expect(g[0].biens.map((x) => x.adresse)).toEqual(['2 rue Alpha']);
    expect(g[1].biens.map((x) => x.adresse)).toEqual(['9 rue Zola']);
  });

  it('🔴 un bien trouvé par l’adresse ET par un nom n’apparaît QUE dans le premier groupe', () => {
    const g = grouperResultats([b('2 rue Alpha', [r('adresse'), r('locataire', 'DUPONT')])]);
    expect(g).toHaveLength(1);
    expect(g[0].sorte).toBe('adresse');
    // …et il garde ses DEUX raisons : le groupe dit d'où il vient, la raison dit pourquoi.
    expect(g[0].biens[0].raisons.map((x) => x.sorte)).toEqual(['adresse', 'locataire']);
  });

  it('le n° de lot est une ADRESSE, pas un nom : il désigne le bien, pas une personne', () => {
    const g = grouperResultats([b('2 rue Alpha', [r('lot')])]);
    expect(g[0].sorte).toBe('adresse');
  });

  it('propriétaire, locataire, téléphone et e-mail vont TOUS dans le second groupe', () => {
    const g = grouperResultats([
      b('1 rue A', [r('proprietaire', 'MARTY')]),
      b('2 rue B', [r('locataire_passe', 'DUPONT')]),
      b('3 rue C', [r('telephone_locataire', 'X')]),
      b('4 rue D', [r('email_proprietaire', 'Y')]),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].titre).toBe('Par nom ou coordonnée');
    expect(g[0].biens).toHaveLength(4);
  });

  it('🔴 un groupe VIDE n’est PAS rendu — un titre suivi de rien se lit comme une panne', () => {
    expect(grouperResultats([b('2 rue Alpha', [r('adresse')])]).map((x) => x.sorte)).toEqual(['adresse']);
    expect(grouperResultats([])).toEqual([]);
  });

  it('dans chaque groupe, l’ordre reste celui de la pertinence puis de l’adresse', () => {
    const g = grouperResultats([
      b('9 rue Zola', [r('email_proprietaire', 'X')]),
      b('12 rue Alpha', [r('locataire', 'D')]),
      b('2 rue Alpha', [r('locataire', 'D')]),
    ]);
    expect(g[0].biens.map((x) => x.adresse)).toEqual(['2 rue Alpha', '12 rue Alpha', '9 rue Zola']);
  });

  it('un bien SANS raison se montre, dans le second groupe, plutôt que de disparaître en silence', () => {
    const g = grouperResultats([b('2 rue Alpha', [])]);
    expect(g).toHaveLength(1);
    expect(g[0].sorte).toBe('nom_ou_coordonnee');
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
