import { describe, it, expect } from 'vitest';
import { CachePages, DUREE_CACHE_MS, PAGES_GARDEES_MAX, cleDePage, pagesAPrecharger } from './cachePages';

/**
 * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — LE CACHE COURT DES PAGES ═══════════════════════════════════════════════════
 *
 * Ce fichier garde trois choses, et chacune répare ou prévient un défaut nommé :
 *   ① UNE PAGE GARDÉE N'EST JAMAIS LA MAUVAISE. La clé porte TOUT ce qui décide du contenu ; en oublier un
 *      servirait la page de « Réception » sous « Spam ». Un cache qui se trompe est pire que pas de cache ;
 *   ② UNE PAGE GARDÉE N'EST JAMAIS PÉRIMÉE. Une boîte mail bouge : durée de vie courte, ET vidage à chaque
 *      événement. Les deux, pas l'un ou l'autre ;
 *   ③ LE PRÉCHARGEMENT NE DISPUTE RIEN À LA PAGE AFFICHÉE, et il ne va jamais au-delà de ce que le serveur dit.
 *
 * MESURÉ à l'écran le 30/09/2026, clic sur « › » jusqu'à la liste affichée :
 *   · Réception            AVANT 727–955 ms   →  APRÈS  89–153 ms
 *   · Courrier automatique AVANT 739–1 044 ms →  APRÈS  74–181 ms
 * Tout le temps d'avant était de l'ATTENTE SERVEUR (625–1 022 ms pour 1 ms de transfert).
 */

describe('① la clé : ce qui fait qu’une page est « la même »', () => {
  const base = { etiquette: 'reception', page: 0, auto: false, filtre: null, etoile: false, recherche: '' };

  it('deux pages identiques ont la même clé', () => {
    expect(cleDePage(base)).toBe(cleDePage({ ...base }));
  });

  /**
   * 🔴 L'ÉPREUVE QUI COMPTE. Chaque champ, pris SÉPARÉMENT, doit suffire à distinguer deux pages. Une boucle
   * plutôt que six assertions : on ne peut pas ajouter un champ à la clé sans venir ici, et on ne peut pas en
   * oublier un en cours de route.
   */
  it('🔴 chacun des critères, à lui seul, distingue deux pages', () => {
    const variantes: Parameters<typeof cleDePage>[0][] = [
      { ...base, etiquette: 'spam' },
      { ...base, page: 1 },
      { ...base, auto: true },
      { ...base, filtre: 'non-lus' },
      { ...base, etoile: true },
      { ...base, recherche: '{"q":"facture"}' },
    ];
    for (const v of variantes) expect(cleDePage(v)).not.toBe(cleDePage(base));
    // …et toutes les variantes diffèrent aussi ENTRE ELLES : aucune collision.
    expect(new Set(variantes.map(cleDePage)).size).toBe(variantes.length);
  });

  /** ⚠️ DEUX RECHERCHES DIFFÉRENTES NE PARTAGENT JAMAIS UNE PAGE. */
  it('⚠️ le critère de recherche entre ENTIER dans la clé', () => {
    expect(cleDePage({ ...base, recherche: '{"q":"bail"}' }))
      .not.toBe(cleDePage({ ...base, recherche: '{"q":"bailleur"}' }));
  });
});

describe('② ce qui est gardé, et ce qui ne l’est plus', () => {
  it('une page rangée se relit', () => {
    const c = new CachePages<string>();
    c.ranger('a', 'page A', 1_000);
    expect(c.lire('a', 1_000)).toBe('page A');
  });

  it('une page jamais rangée rend `null`, pas une erreur', () => {
    expect(new CachePages<string>().lire('inconnue', 0)).toBeNull();
  });

  /**
   * 🔴 LA DURÉE EST COURTE, ET C'EST ESSENTIEL. Une page gardée trop longtemps montrerait un état révolu — du
   * courrier est arrivé, un mail a été classé — et RIEN ne le dirait. C'est pire qu'une page lente.
   */
  it('🔴 une page périmée n’est jamais servie', () => {
    const c = new CachePages<string>(1_000);
    c.ranger('a', 'page A', 0);
    expect(c.lire('a', 999)).toBe('page A');
    expect(c.lire('a', 1_001)).toBeNull();
  });

  /** ⚠️ ET ELLE EST RETIRÉE AU PASSAGE : la laisser ferait grossir le cache de pages mortes. */
  it('⚠️ une page périmée est retirée, pas seulement ignorée', () => {
    const c = new CachePages<string>(1_000);
    c.ranger('a', 'page A', 0);
    expect(c.taille).toBe(1);
    c.lire('a', 5_000);
    expect(c.taille).toBe(0);
  });

  /**
   * 🔴 VIDER TOUT — appelé à la relève et après chaque geste (classer, corbeille, lu). On ne devine pas quelles
   * pages sont touchées : un mail classé change la page où il était, toutes celles qui la suivaient (les lignes
   * remontent d'un cran) et les totaux.
   */
  it('🔴 vider retire TOUT, pas seulement la page courante', () => {
    const c = new CachePages<string>();
    c.ranger('a', 'A', 0); c.ranger('b', 'B', 0); c.ranger('c', 'C', 0);
    expect(c.taille).toBe(3);
    c.vider();
    expect(c.taille).toBe(0);
    expect(c.lire('a', 0)).toBeNull();
  });

  it('le cache est BORNÉ : la plus ancienne sort quand il déborde', () => {
    const c = new CachePages<string>(DUREE_CACHE_MS, 3);
    c.ranger('a', 'A', 0); c.ranger('b', 'B', 0); c.ranger('c', 'C', 0); c.ranger('d', 'D', 0);
    expect(c.taille).toBe(3);
    expect(c.lire('a', 0)).toBeNull();   // la première posée est la première sortie
    expect(c.lire('d', 0)).toBe('D');
  });

  /** ⚠️ RELIRE UNE PAGE NE LA REND PAS PLUS ANCIENNE — mais la RANGER de nouveau la rajeunit. */
  it('⚠️ ranger de nouveau une clé la remet à neuf, date comprise', () => {
    const c = new CachePages<string>(1_000, 3);
    c.ranger('a', 'A', 0);
    c.ranger('a', 'A bis', 900);
    expect(c.lire('a', 1_500)).toBe('A bis');   // 900 + 1 000 > 1 500 : encore valide
  });

  it('les réglages par défaut sont ceux annoncés', () => {
    expect(DUREE_CACHE_MS).toBe(30_000);
    expect(PAGES_GARDEES_MAX).toBe(50);
  });
});

describe('③ quelles pages précharger', () => {
  /** Demande d'Arno : « les 2 pages suivantes (et la précédente si on vient de reculer) ». */
  it('en avançant : les DEUX pages suivantes, la plus proche d’abord', () => {
    expect(pagesAPrecharger({ page: 3, versLArriere: false, suite: true })).toEqual([4, 5]);
  });

  it('en reculant : les deux suivantes ET la précédente', () => {
    expect(pagesAPrecharger({ page: 3, versLArriere: true, suite: true })).toEqual([4, 5, 2]);
  });

  /**
   * 🔴 ON NE PRÉCHARGE JAMAIS AU-DELÀ DE CE QUE LE SERVEUR DIT. `suite` vient de lui (il lit une ligne de plus) :
   * le déduire d'un total ferait demander une page vide dès que le total et la liste s'écartent d'une unité.
   */
  it('🔴 sans suite annoncée par le serveur, on ne précharge rien en avant', () => {
    expect(pagesAPrecharger({ page: 3, versLArriere: false, suite: false })).toEqual([]);
    expect(pagesAPrecharger({ page: 3, versLArriere: true, suite: false })).toEqual([2]);
  });

  /** ⚠️ JAMAIS LA PAGE −1 : depuis la première page, il n'y a rien derrière. */
  it('⚠️ depuis la première page, aucune page précédente', () => {
    expect(pagesAPrecharger({ page: 0, versLArriere: true, suite: true })).toEqual([1, 2]);
  });
});
