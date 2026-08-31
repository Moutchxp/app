import { describe, it, expect } from 'vitest';
import { MAX_DOCS_CACHE, voisinsAPrecharger, toucher, rangerEtEvincer } from './prechargeLiseuse';

/**
 * LOT 23 — logique PURE du préchargement + cache LRU de la liseuse. On prouve le COMPORTEMENT (pas la forme du composant) :
 *   1. le bon VOISIN est désigné (suivant puis précédent, dédup, sans la pièce courante) ;
 *   2. le cache est BORNÉ (≤ MAX_DOCS_CACHE) et évince le plus ANCIEN ;
 *   3. la pièce COURANTE (fraîchement rangée/touchée) n'est JAMAIS évincée sous les pieds de l'affichage.
 */

describe('LOT 23 — voisinsAPrecharger : quelles pièces précharger autour du plan courant', () => {
  it('désigne la pièce SUIVANTE puis la PRÉCÉDENTE (ordre de priorité)', () => {
    // bande de pièces distinctes : [10, 11, 12, 13], plan courant à l'index 1 (pièce 11) → suivant 12 puis précédent 10.
    expect(voisinsAPrecharger([10, 11, 12, 13], 1)).toEqual([12, 10]);
  });

  it('exclut la pièce COURANTE et DÉDUPLIQUE quand des planches voisines partagent la même pièce (même PDF)', () => {
    // planches consécutives de la même pièce : bande [10, 10, 10] (3 planches d'un seul PDF) → aucun voisin à précharger (tout est la pièce courante).
    expect(voisinsAPrecharger([10, 10, 10], 1)).toEqual([]);
    // voisins suivant ET précédent = la même pièce 20 (différente de la courante 10) → un seul document, pas deux.
    expect(voisinsAPrecharger([20, 10, 20], 1)).toEqual([20]);
  });

  it('aux BORNES de la bande, ne déborde pas (un seul voisin, ou aucun si bande d’un seul plan)', () => {
    expect(voisinsAPrecharger([10, 11, 12], 0)).toEqual([11]);   // premier plan → seulement le suivant
    expect(voisinsAPrecharger([10, 11, 12], 2)).toEqual([11]);   // dernier plan → seulement le précédent
    expect(voisinsAPrecharger([10], 0)).toEqual([]);             // un seul plan → rien à précharger
  });
});

describe('LOT 23 — rangerEtEvincer : cache LRU borné, éviction du plus ancien, courant préservé', () => {
  it('sous la borne : range en tête de fraîcheur, n’évince rien', () => {
    const r = rangerEtEvincer([10, 11], 12, MAX_DOCS_CACHE);
    expect(r.ordre).toEqual([10, 11, 12]);
    expect(r.evincees).toEqual([]);
  });

  it('AU-DELÀ de la borne (4) : évince le plus ANCIEN, garde exactement MAX_DOCS_CACHE documents', () => {
    // cache plein [10,11,12,13] (10 = le plus ancien), on range 14 → 10 évincé, il reste [11,12,13,14].
    const r = rangerEtEvincer([10, 11, 12, 13], 14, MAX_DOCS_CACHE);
    expect(r.ordre).toEqual([11, 12, 13, 14]);
    expect(r.ordre.length).toBe(MAX_DOCS_CACHE);
    expect(r.evincees).toEqual([10]);
  });

  it('la pièce qu’on RANGE n’est jamais dans les évincés (le document COURANT ne peut pas être libéré sous l’affichage)', () => {
    // même si 12 était déjà présent, le ranger le remonte en frais → jamais évincé, et sa 1re position ancienne est libérée pour de la place.
    const r = rangerEtEvincer([12, 10, 11, 13], 12, MAX_DOCS_CACHE);
    expect(r.evincees).not.toContain(12);
    expect(r.ordre[r.ordre.length - 1]).toBe(12); // le plus frais
    expect(r.ordre.length).toBeLessThanOrEqual(MAX_DOCS_CACHE);
  });
});

describe('LOT 23 — toucher : un accès cache remonte la pièce en frais (survit à l’éviction suivante)', () => {
  it('remonte la clé accédée en fin d’ordre (la plus fraîche) ; clé absente → ordre inchangé', () => {
    expect(toucher([10, 11, 12], 10)).toEqual([11, 12, 10]); // 10 touché → devient le plus frais
    expect(toucher([10, 11, 12], 99)).toEqual([10, 11, 12]); // absente → inchangé (pas de faux positif)
  });

  it('une pièce TOUCHÉE survit à l’éviction que subirait le plus ancien non touché', () => {
    // [10,11,12,13], on TOUCHE 10 (→ [11,12,13,10]) puis on range 14 → c'est 11 (désormais le plus ancien) qui saute, pas 10.
    const apresTouch = toucher([10, 11, 12, 13], 10);
    const r = rangerEtEvincer(apresTouch, 14, MAX_DOCS_CACHE);
    expect(r.evincees).toEqual([11]);
    expect(r.ordre).toContain(10);
  });
});
