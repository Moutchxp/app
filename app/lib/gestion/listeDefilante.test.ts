import { describe, it, expect } from 'vitest';
import { hauteurDesPremiers, hauteurEntiereDans, type PositionLigne } from './listeDefilante';
import { CAPSULES_VISIBLES, compteCacheesEnBas, motCacheesEnBas } from './historiqueBien';

/**
 * ══ 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 1 — PLUS DE FAUX « ↓ 1 autre » ════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026, fiche du bien 315) : l'encart « Propriétaire » compte trois contacts, les trois sont
 * visibles, et la pastille affiche pourtant « ↓ 1 autre ». Même chose côté Locataire / Anciens locataires.
 *
 * 🔴 LA CAUSE N'ÉTAIT PAS LE COMPTEUR, ET C'EST TOUT L'INTÉRÊT DE CE FICHIER. Le plafond de l'encart était une
 * valeur ÉCRITE (« trois capsules de 44 px plus deux interlignes ») ; une capsule dont le nom passe à la ligne
 * dépasse ces 44 px, la troisième était rognée de quelques pixels, et le compteur la voyait — à juste titre —
 * « pas entièrement visible ».
 *
 * 🔴 ON NE RELÂCHE DONC PAS LE COMPTEUR, ce qui l'aurait rendu faux pour de bon : on MESURE la hauteur qu'il faut
 * pour que les trois premières tiennent entièrement. Les cas ci-dessous rejouent les deux situations d'Arno avec
 * les DEUX fonctions enchaînées — la hauteur, puis le compte — parce que c'est leur accord qui se voit à l'écran.
 *
 * 🔒 Module PUR : aucune base, aucun réseau, aucun DOM.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Des capsules posées les unes sous les autres, avec 2 px d'interligne — comme la feuille les pose. */
const empiler = (hauteurs: readonly number[]): PositionLigne[] => {
  let haut = 0;
  return hauteurs.map((hauteur) => {
    const p = { haut, hauteur };
    haut += hauteur + 2;
    return p;
  });
};

describe('🔴🔴 ① la hauteur contient les trois premières, entièrement', () => {
  it('🔴 trois capsules de même hauteur : la boîte s’arrête au bas de la troisième', () => {
    /* 44 + 2 + 44 + 2 + 44 = 136 */
    expect(hauteurDesPremiers(empiler([44, 44, 44]), 3)).toBe(136);
  });

  /**
   * 🔴🔴 LE CAS D'ARNO : une capsule dont le nom passe à la ligne fait 62 px au lieu de 44. L'ancien plafond
   * écrit (8,75 rem = 140 px) rognait la troisième ; la hauteur mesurée, elle, la contient.
   */
  it('🔴🔴 une capsule plus haute que prévu ne fait plus rogner la troisième', () => {
    const positions = empiler([62, 44, 44]);
    const h = hauteurDesPremiers(positions, 3);
    expect(h).toBe(154);
    /* 🔴 ET LA PASTILLE SE TAIT : plus rien ne dépasse. C'est exactement ce qu'Arno attend. */
    expect(compteCacheesEnBas(positions, 0, h ?? 0)).toBe(0);
    expect(motCacheesEnBas(compteCacheesEnBas(positions, 0, h ?? 0))).toBeNull();
  });

  /** ⚠️ MOINS DE TROIS CONTACTS : la boîte prend la hauteur de ce qu'il y a, sans blanc au bas de l'encart. */
  it('⚠️ deux capsules pour trois places : la hauteur est celle des deux', () => {
    expect(hauteurDesPremiers(empiler([44, 44]), 3)).toBe(90);
  });

  /** ⚠️ AUCUNE CAPSULE ⇒ `null` : la feuille garde la main, et l'encart ne se replie pas à zéro. */
  it('⚠️ aucune capsule : rien à imposer', () => {
    expect(hauteurDesPremiers([], 3)).toBeNull();
    expect(hauteurDesPremiers(empiler([44]), 0)).toBeNull();
  });

  /**
   * ⚠️ LA MESURE PART DU HAUT DE LA PREMIÈRE, et non de zéro : les positions rendues par le navigateur sont
   * relatives à un parent qui n'est pas forcément la boîte. Une origine supposée aurait ajouté un décalage
   * invisible — le genre d'erreur de quelques pixels qu'on répare ici.
   */
  it('⚠️ une origine décalée ne change pas la hauteur', () => {
    const decalees = empiler([44, 44, 44]).map((p) => ({ ...p, haut: p.haut + 17 }));
    expect(hauteurDesPremiers(decalees, 3)).toBe(136);
  });
});

describe('🔴🔴 ② au-delà de trois, le défilement et la pastille disent le bon nombre', () => {
  /** 🔴🔴 CINQ CONTACTS, TROIS MONTRÉS : « ↓ 2 autres », et pas un de plus. */
  it('🔴🔴 cinq capsules dont deux hors de vue : « ↓ 2 autres »', () => {
    const positions = empiler([44, 44, 44, 44, 44]);
    const h = hauteurDesPremiers(positions, 3) ?? 0;
    expect(compteCacheesEnBas(positions, 0, h)).toBe(2);
    expect(motCacheesEnBas(compteCacheesEnBas(positions, 0, h))).toBe('↓ 2 autres');
  });

  /** 🔴 ET APRÈS AVOIR DÉFILÉ D'UN PLEIN ENCART, il n'en reste plus rien à annoncer. */
  it('🔴 défiler d’un encart épuise la liste, et la pastille disparaît', () => {
    const positions = empiler([44, 44, 44, 44, 44]);
    const h = hauteurDesPremiers(positions, 3) ?? 0;
    expect(motCacheesEnBas(compteCacheesEnBas(positions, h, h))).toBeNull();
  });

  /** ⚠️ QUATRE CONTACTS : « ↓ 1 autre » — au singulier, et cette fois il est vrai. */
  it('⚠️ quatre capsules : « ↓ 1 autre », au singulier', () => {
    const positions = empiler([44, 44, 44, 44]);
    const h = hauteurDesPremiers(positions, 3) ?? 0;
    expect(motCacheesEnBas(compteCacheesEnBas(positions, 0, h))).toBe('↓ 1 autre');
  });

  /** 🔴 LE NOMBRE MONTRÉ D'ORIGINE EST UN NOMBRE DE LIGNES, et non une hauteur écrite à la main. */
  it('🔴 l’encart montre trois contacts', () => {
    expect(CAPSULES_VISIBLES).toBe(3);
  });
});

describe('🔴🔴 ③ une liste bornée par une PLACE ne coupe pas sa dernière ligne', () => {
  /**
   * Arno, point 2 : « la liste doit montrer le dernier élément visible en entier (pas de ligne coupée par le
   * bord) ». C'est le cas de la liste de suggestions de l'Annuaire, plafonnée par `min(60vh, 380px)` : le budget
   * tombe au milieu d'une suggestion, et « ALEJO FERNANDEZ Paula » apparaissait à moitié coupée.
   */
  it('🔴🔴 le budget tombe au milieu d’une ligne : on s’arrête à la ligne d’avant', () => {
    /* Bas des lignes : 40, 82, 124, 166… Un budget de 100 coupe la troisième. */
    expect(hauteurEntiereDans(empiler([40, 40, 40, 40]), 100)).toBe(82);
  });

  it('🔴 un budget qui tombe juste garde la ligne entière', () => {
    expect(hauteurEntiereDans(empiler([40, 40, 40]), 124)).toBe(124);
  });

  /** ⚠️ DES LIGNES DE HAUTEURS DIFFÉRENTES — une mention « + Propriétaire de X biens » en ajoute une. */
  it('⚠️ des lignes inégales : on garde la dernière qui tient', () => {
    /* Bas : 60, 102, 164. Budget 150 ⇒ la troisième déborde. */
    expect(hauteurEntiereDans(empiler([60, 40, 60]), 150)).toBe(102);
  });

  /**
   * ⚠️ AUCUNE LIGNE NE TIENT (une seule, plus haute que le budget) ⇒ ON REND LE BUDGET : mieux vaut une ligne
   * coupée qu'une liste invisible. Le cas est théorique, le repli ne l'est pas.
   */
  it('⚠️ une ligne plus haute que le budget : on garde le budget', () => {
    expect(hauteurEntiereDans(empiler([500]), 380)).toBe(380);
  });

  it('⚠️ aucune ligne, ou aucun budget : rien à imposer', () => {
    expect(hauteurEntiereDans([], 380)).toBeNull();
    expect(hauteurEntiereDans(empiler([40]), 0)).toBeNull();
  });
});
