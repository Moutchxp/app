import { describe, it, expect } from 'vitest';
import {
  dernierEchangeDe, estNouveau, motTri, rangUrgence, TRI_DEFAUT, TRIS_EVENEMENT,
  trierEvenements, trierParNouveaute, trierParUrgence, triValide, type EvenementARanger,
} from './triEvenements';

/**
 * ══ 🔴🔴 LOT FILTRES-EVENEMENTS-NEW — LES DEUX ORDRES, AU MOT PRÈS ══════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (08/10/2026), recopiée pour que l'épreuve puisse être relue contre elle :
 *
 *   A. « New » actif :
 *      1) toutes les cartes « New », de l'activité la plus RÉCENTE à la plus ancienne ;
 *      2) puis les autres par urgence : Urgent, puis Intermédiaire, puis Normal, puis sans niveau. Dans chaque
 *         niveau, du dernier échange le plus RÉCENT au plus ancien.
 *
 *   B. « Urgent » actif, groupes dans cet ordre : 1) Urgent ; 2) New (les « New » qui ne sont pas Urgent) ;
 *      3) Intermédiaire ; 4) Normal ; 5) sans niveau d'urgence.
 *      · Un événement Urgent ET New va dans le groupe Urgent, et garde sa pastille New.
 *      · Chaque événement n'apparaît qu'une seule fois.
 *      · Dans CHAQUE groupe : du dernier échange le plus ANCIEN (en premier) au plus RÉCENT (en dernier).
 *
 * 🔒 Module PUR : aucun réseau, aucune base, aucun événement réel. Les cartes sont fabriquées ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Une carte d'épreuve, nommée par ce qu'elle est — on lit l'ordre attendu dans les noms, pas dans des numéros.
 *
 * ⚠️ `ouvertLe` EST VOLONTAIREMENT TRÈS ANCIEN ET IDENTIQUE PARTOUT : il ne sert que de repli quand il n'y a
 * aucun échange, et le faire varier ici brouillerait ce que chaque cas démontre.
 */
const ev = (nom: string, o: Partial<EvenementARanger> = {}): EvenementARanger & { nom: string } => ({
  nom,
  urgence: null,
  nouveauteLe: null,
  dernierEchangeLe: null,
  ouvertLe: '2020-01-01T00:00:00Z',
  ...o,
});

const noms = (l: readonly { nom: string }[]): string[] => l.map((x) => x.nom);

describe('🔴🔴 ① le statut « New », et ce qui le porte', () => {
  /** 🔴 C'EST LA DATE D'ACTIVITÉ QUI PORTE LE STATUT, et elle seule — jamais un second drapeau. */
  it('🔴 « New » = une date d’activité, rien d’autre', () => {
    expect(estNouveau({ nouveauteLe: '2026-10-08T09:00:00Z' })).toBe(true);
    expect(estNouveau({ nouveauteLe: null })).toBe(false);
    /* ⚠️ UNE CHAÎNE VIDE N'EST PAS UNE DATE : elle vaut « pas New », jamais « New le 1er janvier 1970 ». */
    expect(estNouveau({ nouveauteLe: '' })).toBe(false);
  });

  /**
   * 🔴🔴 « DERNIER ÉCHANGE » A UN REPLI, ET IL EST ÉCRIT UNE SEULE FOIS. Arno : « Événement sans aucun échange :
   * date d'ouverture. » Deux écritures de ce repli auraient rangé ces événements à deux endroits différents selon
   * le bouton choisi.
   */
  it('🔴🔴 sans aucun échange, « dernier échange » vaut la date d’ouverture', () => {
    expect(dernierEchangeDe({ dernierEchangeLe: null, ouvertLe: '2026-01-02T00:00:00Z' }))
      .toBe('2026-01-02T00:00:00Z');
    expect(dernierEchangeDe({ dernierEchangeLe: '', ouvertLe: '2026-01-02T00:00:00Z' }))
      .toBe('2026-01-02T00:00:00Z');
    expect(dernierEchangeDe({ dernierEchangeLe: '2026-05-05T00:00:00Z', ouvertLe: '2026-01-02T00:00:00Z' }))
      .toBe('2026-05-05T00:00:00Z');
  });

  /**
   * 🔴🔴 L'ORDRE DE GRAVITÉ EST CELUI D'ARNO, et il est l'INVERSE de l'ordre du sélecteur d'urgence (qui va du
   * plus calme au plus pressant). C'est pour cela qu'il est déclaré à part et non dérivé : deux décisions.
   */
  it('🔴🔴 Urgent < Intermédiaire < Normal < sans niveau', () => {
    expect(rangUrgence('urgent')).toBeLessThan(rangUrgence('haute'));
    expect(rangUrgence('haute')).toBeLessThan(rangUrgence('normale'));
    expect(rangUrgence('normale')).toBeLessThan(rangUrgence(null));
  });

  /** ⚠️ UN NIVEAU INCONNU TOMBE AVEC « SANS NIVEAU », en dernier — `critique` d'avant la migration 319 compris. */
  it.each([null, undefined, '', 'critique', 'inconnu'])('⚠️ « %s » se range avec « sans niveau »', (u) => {
    expect(rangUrgence(u)).toBe(rangUrgence(null));
  });
});

describe('🔴🔴 ② le tri « New » (A)', () => {
  /**
   * 🔴🔴 L'ORDRE COMPLET D'ARNO, EN UN SEUL CAS. Le jeu mélange exprès les deux moitiés de la règle : des « New »
   * de toutes urgences (qui doivent TOUS passer devant), et des non-« New » de chaque niveau.
   */
  it('🔴🔴 les « New » d’abord (du plus récent), puis les autres par urgence (du plus récent)', () => {
    const liste = [
      ev('normal-vieux', { urgence: 'normale', dernierEchangeLe: '2026-01-01T00:00:00Z' }),
      ev('new-ancien', { nouveauteLe: '2026-10-01T00:00:00Z' }),
      ev('sans-niveau', { dernierEchangeLe: '2026-09-09T00:00:00Z' }),
      ev('new-recent-urgent', { urgence: 'urgent', nouveauteLe: '2026-10-08T00:00:00Z' }),
      ev('urgent-vieux', { urgence: 'urgent', dernierEchangeLe: '2026-02-02T00:00:00Z' }),
      ev('new-milieu', { urgence: 'haute', nouveauteLe: '2026-10-05T00:00:00Z' }),
      ev('inter-recent', { urgence: 'haute', dernierEchangeLe: '2026-08-08T00:00:00Z' }),
      ev('normal-recent', { urgence: 'normale', dernierEchangeLe: '2026-07-07T00:00:00Z' }),
    ];
    expect(noms(trierParNouveaute(liste))).toEqual([
      /* ① les « New », de l'activité la plus RÉCENTE à la plus ancienne — leur urgence ne compte pas ici. */
      'new-recent-urgent', 'new-milieu', 'new-ancien',
      /* ② les autres, par gravité, et dans chaque niveau du dernier échange le plus RÉCENT au plus ancien. */
      'urgent-vieux', 'inter-recent', 'normal-recent', 'normal-vieux', 'sans-niveau',
    ]);
  });

  /** 🔴 DANS UN MÊME NIVEAU : du dernier échange le plus RÉCENT au plus ancien (Arno). */
  it('🔴 à urgence égale, le dernier échange le plus récent passe devant', () => {
    const liste = [
      ev('vieux', { urgence: 'haute', dernierEchangeLe: '2026-01-01T00:00:00Z' }),
      ev('recent', { urgence: 'haute', dernierEchangeLe: '2026-06-01T00:00:00Z' }),
      ev('milieu', { urgence: 'haute', dernierEchangeLe: '2026-03-01T00:00:00Z' }),
    ];
    expect(noms(trierParNouveaute(liste))).toEqual(['recent', 'milieu', 'vieux']);
  });

  /** ⚠️ ET LE REPLI SUR L'OUVERTURE JOUE AUSSI DANS LE TRI, pas seulement à l'affichage. */
  it('⚠️ un événement sans échange se range sur sa date d’ouverture', () => {
    const liste = [
      ev('sans-echange', { urgence: 'normale', ouvertLe: '2026-09-01T00:00:00Z' }),
      ev('avec-echange', { urgence: 'normale', dernierEchangeLe: '2026-03-01T00:00:00Z' }),
    ];
    expect(noms(trierParNouveaute(liste))).toEqual(['sans-echange', 'avec-echange']);
  });
});

describe('🔴🔴 ③ le tri « Urgent » (B)', () => {
  /**
   * 🔴🔴 LES CINQ GROUPES D'ARNO, DANS L'ORDRE, ET LE PLUS ANCIEN EN PREMIER DANS CHACUN.
   *
   * 🔴 LE CAS QUI COMPTE EST `urgent-et-new` : il est « New » ET « Urgent », et il doit rester dans le groupe
   * URGENT — pas remonter, pas descendre, et surtout pas apparaître deux fois.
   *
   * 🔴 L'AUTRE CAS QUI COMPTE EST `new-sans-niveau` : « New » sans aucune urgence, il passe DEVANT un
   * « Intermédiaire » qui n'a rien de neuf. C'est toute la subtilité du groupe 2.
   */
  it('🔴🔴 Urgent → New → Intermédiaire → Normal → sans niveau, chacun du plus ANCIEN au plus récent', () => {
    const liste = [
      ev('sans-niveau', { dernierEchangeLe: '2026-05-05T00:00:00Z' }),
      ev('normal', { urgence: 'normale', dernierEchangeLe: '2026-05-05T00:00:00Z' }),
      ev('inter-recent', { urgence: 'haute', dernierEchangeLe: '2026-09-09T00:00:00Z' }),
      ev('urgent-recent', { urgence: 'urgent', dernierEchangeLe: '2026-09-09T00:00:00Z' }),
      ev('new-sans-niveau', { nouveauteLe: '2026-10-08T00:00:00Z', dernierEchangeLe: '2026-06-06T00:00:00Z' }),
      ev('urgent-et-new', {
        urgence: 'urgent', nouveauteLe: '2026-10-08T00:00:00Z', dernierEchangeLe: '2026-01-01T00:00:00Z',
      }),
      ev('inter-ancien', { urgence: 'haute', dernierEchangeLe: '2026-02-02T00:00:00Z' }),
      ev('new-normal', {
        urgence: 'normale', nouveauteLe: '2026-10-07T00:00:00Z', dernierEchangeLe: '2026-03-03T00:00:00Z',
      }),
    ];
    expect(noms(trierParUrgence(liste))).toEqual([
      /* ① URGENT — et `urgent-et-new` y reste, le plus ancien en premier. */
      'urgent-et-new', 'urgent-recent',
      /* ② NEW (ceux qui ne sont pas Urgent), du plus ancien échange au plus récent. */
      'new-normal', 'new-sans-niveau',
      /* ③ INTERMÉDIAIRE · ④ NORMAL · ⑤ SANS NIVEAU. */
      'inter-ancien', 'inter-recent',
      'normal',
      'sans-niveau',
    ]);
  });

  /**
   * 🔴🔴 « CHAQUE ÉVÉNEMENT N'APPARAÎT QU'UNE SEULE FOIS » (Arno). C'est le piège qu'il nomme, et il vient de la
   * tentation de construire cinq listes puis de les concaténer : un Urgent-et-New tomberait alors dans deux.
   */
  it('🔴🔴 aucun doublon, et aucune carte perdue', () => {
    const liste = [
      ev('a', { urgence: 'urgent', nouveauteLe: '2026-10-08T00:00:00Z' }),
      ev('b', { urgence: 'haute', nouveauteLe: '2026-10-07T00:00:00Z' }),
      ev('c', { nouveauteLe: '2026-10-06T00:00:00Z' }),
      ev('d', { urgence: 'normale' }),
      ev('e'),
    ];
    const range = trierParUrgence(liste);
    expect(range).toHaveLength(liste.length);
    expect(new Set(noms(range)).size).toBe(liste.length);
    expect([...noms(range)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  /**
   * ⚠️ L'ORDRE INTERNE EST L'INVERSE DE CELUI DU TRI « NEW », et ce n'est pas une étourderie de la demande : quand
   * on trie par urgence, on travaille une pile — et l'on commence par ce qui attend depuis le plus longtemps.
   */
  it('⚠️ dans un groupe, le plus ANCIEN est en premier — l’inverse du tri « New »', () => {
    const liste = [
      ev('recent', { urgence: 'urgent', dernierEchangeLe: '2026-06-01T00:00:00Z' }),
      ev('ancien', { urgence: 'urgent', dernierEchangeLe: '2026-01-01T00:00:00Z' }),
    ];
    expect(noms(trierParUrgence(liste))).toEqual(['ancien', 'recent']);
    expect(noms(trierParNouveaute(liste))).toEqual(['recent', 'ancien']);
  });
});

describe('🔴🔴 ④ ce sont des TRIS : aucune carte masquée', () => {
  const liste = [
    ev('a', { urgence: 'urgent' }), ev('b', { nouveauteLe: '2026-10-08T00:00:00Z' }),
    ev('c', { urgence: 'haute' }), ev('d', { urgence: 'normale' }), ev('e'),
  ];

  it.each(TRIS_EVENEMENT)('🔴🔴 « %s » rend exactement les mêmes cartes', (tri) => {
    const range = trierEvenements(liste, tri);
    expect(range).toHaveLength(liste.length);
    expect([...noms(range)].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  /** ⚠️ ET IL NE TOUCHE PAS AU TABLEAU D'ORIGINE : `sort` trie en place, d'où la copie. */
  it('⚠️ le tableau reçu n’est pas réordonné sous les pieds de l’appelant', () => {
    const avant = noms(liste);
    trierEvenements(liste, 'urgent');
    trierEvenements(liste, 'new');
    expect(noms(liste)).toEqual(avant);
  });

  /** ⚠️ UNE LISTE VIDE RESTE VIDE, sans jeter — l'écran « aucun événement » n'est pas une panne. */
  it.each(TRIS_EVENEMENT)('⚠️ « %s » supporte la liste vide', (tri) => {
    expect(trierEvenements([], tri)).toEqual([]);
  });
});

describe('🔴🔴 ⑤ le nom du tri, et son défaut', () => {
  /** 🔴 « New » actif par défaut (Arno), écrit une seule fois. */
  it('🔴 « New » est le défaut', () => {
    expect(TRI_DEFAUT).toBe('new');
    expect(TRIS_EVENEMENT).toEqual(['new', 'urgent']);
  });

  /** ⚠️ UNE VALEUR INCONNUE RETOMBE SUR LE DÉFAUT, jamais une erreur : c'est une adresse, elle arrive de partout. */
  it.each([null, undefined, '', '   ', 'URGENT', 'nimportequoi', 42])('⚠️ « %s » vaut « new »', (brut) => {
    expect(triValide(brut)).toBe('new');
  });

  it('🔴 et « urgent » est reconnu', () => {
    expect(triValide('urgent')).toBe('urgent');
  });

  /** 🔴 LES MOTS DES BOUTONS SONT CEUX D'ARNO, et pas d'autres. */
  it('🔴 les deux boutons s’appellent « New » et « Urgent »', () => {
    expect(motTri('new')).toBe('New');
    expect(motTri('urgent')).toBe('Urgent');
  });

  /** 🔴 ET `trierEvenements` AIGUILLE VERS LE BON TRI : c'est LA porte des deux écrans. */
  it('🔴 la porte unique rend le même ordre que le tri qu’elle nomme', () => {
    const liste = [
      ev('urgent-vieux', { urgence: 'urgent', dernierEchangeLe: '2026-01-01T00:00:00Z' }),
      ev('new', { nouveauteLe: '2026-10-08T00:00:00Z', dernierEchangeLe: '2026-02-02T00:00:00Z' }),
    ];
    expect(noms(trierEvenements(liste, 'new'))).toEqual(noms(trierParNouveaute(liste)));
    expect(noms(trierEvenements(liste, 'urgent'))).toEqual(noms(trierParUrgence(liste)));
    /* 🔴 ET LES DEUX ORDRES DIFFÈRENT VRAIMENT SUR CE JEU : sans quoi l'épreuve ne dirait rien. */
    expect(noms(trierEvenements(liste, 'new'))).not.toEqual(noms(trierEvenements(liste, 'urgent')));
  });
});
