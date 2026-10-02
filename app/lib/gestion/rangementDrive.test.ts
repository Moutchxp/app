import { describe, expect, it } from 'vitest';
import {
  arbreARestaurer, bandeauParents, COLONNES_COMPACTES, colonnesVisibles, grilleColonnes, MIME_PIECE,
  motColonnes, motRangee,
  PARENTS_VISIBLES, resumeARanger, signatureSession, titreFenetre,
} from './rangementDrive';
import { COLONNES, type Chemin } from './finderDrive';

/**
 * LOT DRIVE-UNIQUE — LES RÈGLES DE LA FENÊTRE UNIQUE, REJOUÉES SANS ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI SE JOUE ICI. Arno veut « le même système que la fenêtre Drive façon Finder, partout où on y fait
 * appel ». Une seule fenêtre, deux usages — et ce sont ces règles-là qui les distinguent sans les séparer : le
 * titre, ce qu'on dit de ce qui reste à ranger, combien de parents tient le bandeau, quelles colonnes on montre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const chemin = (...noms: string[]): Chemin => noms.map((nom, i) => ({ id: `d${i}`, nom }));

describe('le titre dit ce qu’on fait', () => {
  /**
   * ⚠️ LES DEUX TITRES NE RÉPONDENT PAS À LA MÊME QUESTION, et c'est délibéré : on vient CHERCHER (où suis-je ?)
   * ou l'on vient POSER (que dois-je poser ?). Un titre unique trahirait l'un des deux usages.
   */
  it('en mode joindre : le dossier où l’on est, comme une fenêtre du Finder', () => {
    expect(titreFenetre('joindre', 'CHARPENTIER', 3)).toBe('CHARPENTIER');
  });

  it('en mode ranger : ce qu’on tient, et combien', () => {
    expect(titreFenetre('ranger', 'CHARPENTIER', 3)).toBe('Ranger 3 pièces dans le Drive');
    expect(titreFenetre('ranger', 'CHARPENTIER', 1)).toBe('Ranger une pièce dans le Drive');
  });
});

describe('ce qu’il reste à ranger', () => {
  it('compte CE QUI RESTE, pas ce qui est fait', () => {
    expect(resumeARanger(3, 0)).toBe('3 pièces à ranger');
    expect(resumeARanger(3, 2)).toBe('1 pièce à ranger');
  });

  /** ⚠️ QUAND TOUT EST RANGÉ, ON LE DIT : un panneau qui se vide sans rien dire se lit comme une perte. */
  it('quand tout est rangé, il le dit — et rappelle qu’on peut ranger ailleurs', () => {
    expect(resumeARanger(3, 3)).toContain('Les 3 pièces sont rangées');
    expect(resumeARanger(3, 3)).toContain('ailleurs');
    expect(resumeARanger(1, 1)).toContain('La pièce est rangée');
  });

  it('plus de rangements que de pièces (une pièce rangée deux fois) ne passe jamais sous zéro', () => {
    expect(resumeARanger(2, 5)).toContain('rangées');
  });

  it('aucune pièce : on le dit plutôt que d’afficher « 0 »', () => {
    expect(resumeARanger(0, 0)).toBe('Aucune pièce à ranger dans ce message.');
  });

  it('le mot d’une pièce rangée nomme le dossier — sans lui, « rangée » n’apprend rien', () => {
    expect(motRangee('CHARPENTIER')).toBe('✓ Rangée dans « CHARPENTIER »');
  });
});

describe('🔴 le bandeau des parents — deux crans, et pas plus', () => {
  it('un chemin court tient entier, et rien n’est compté au-dessus', () => {
    const b = bandeauParents(chemin('GESTION LOCATIVE', 'Base de données locative'));
    expect(b.caches).toBe(0);
    expect(b.pas.map((p) => p.nom)).toEqual(['GESTION LOCATIVE', 'Base de données locative']);
  });

  it('un chemin long ne montre que les 2 parents et le dossier courant', () => {
    const b = bandeauParents(chemin('Drives partagés', 'GESTION LOCATIVE', 'Base de données locative', '1 Propriétaires', 'CHARPENTIER'));
    expect(b.pas.map((p) => p.nom)).toEqual(['Base de données locative', '1 Propriétaires', 'CHARPENTIER']);
  });

  /** ⚠️ CE QUI EST MASQUÉ EST COMPTÉ : masquer sans compter ferait croire qu'on est à la racine. */
  it('ce qui est au-dessus est COMPTÉ, jamais silencieusement perdu', () => {
    const b = bandeauParents(chemin('a', 'b', 'c', 'd', 'e'));
    expect(b.caches).toBe(2);
    expect(b.caches + b.pas.length).toBe(5);
  });

  /**
   * 🔴 L'INDICE EST CELUI DU CHEMIN COMPLET, et c'est capital : le bandeau n'affiche que la fin, mais cliquer sur
   * « 1 Propriétaires » doit remonter au VRAI cran, pas au deuxième de ce qu'on voit. Une erreur ici enverrait
   * l'utilisateur trois niveaux trop haut, sans que rien ne le signale.
   */
  it('🔴 chaque pas garde son indice dans le chemin COMPLET', () => {
    const b = bandeauParents(chemin('a', 'b', 'c', 'd', 'e'));
    expect(b.pas.map((p) => p.index)).toEqual([3, 4, 5]);
  });

  it('déplié, il rend le chemin entier, et ne compte plus rien', () => {
    const b = bandeauParents(chemin('a', 'b', 'c', 'd', 'e'), 99);
    expect(b.caches).toBe(0);
    expect(b.pas).toHaveLength(5);
  });

  it('la racine (aucun dossier ouvert) ne produit aucun pas', () => {
    expect(bandeauParents([])).toEqual({ caches: 0, pas: [] });
  });

  it('deux parents : c’est ce qu’Arno a demandé, et c’est écrit une seule fois', () => {
    expect(PARENTS_VISIBLES).toBe(2);
  });
});

describe('les colonnes — le moins de place possible, par défaut', () => {
  const toutes = COLONNES.map((c) => c.cle);

  it('à l’ouverture : Nom et Taille', () => {
    expect(colonnesVisibles(true, toutes)).toEqual(COLONNES_COMPACTES);
  });

  it('dépliées : les quatre, dans l’ordre du Finder', () => {
    expect(colonnesVisibles(false, toutes)).toEqual(['nom', 'modifie', 'taille', 'type']);
  });

  it('le bouton dit ce qu’il va faire, dans les deux sens', () => {
    expect(motColonnes(true)).toBe('Afficher les colonnes');
    expect(motColonnes(false)).toBe('Masquer les colonnes');
  });

  /**
   * 🔴 UNE SEULE SOURCE POUR LA GRILLE. L'en-tête et les lignes doivent porter EXACTEMENT la même : deux grilles
   * écrites séparément se désalignent au premier changement de largeur, et la colonne « Taille » se retrouve sous
   * « Type » sans que personne ne sache pourquoi.
   */
  it('🔴 la grille suit les colonnes montrées, et le nom prend toute la place restante', () => {
    expect(grilleColonnes(['nom', 'taille'])).toBe('minmax(0,1fr) 5.5rem');
    expect(grilleColonnes(['nom', 'modifie', 'taille', 'type'])).toBe('minmax(0,1fr) 11rem 5.5rem 8rem');
  });

  it('une seule colonne reste une grille valide', () => {
    expect(grilleColonnes(['nom'])).toBe('minmax(0,1fr)');
  });
});

/**
 * 🔴🔴 DEUX TYPES MIME, ET PAS UN SEUL AVEC UN CHAMP « SORTE ». Ce qui les sépare n'est pas une nuance : déposer un
 * fichier du Drive le DÉPLACE, déposer une pièce reçue la COPIE depuis la boîte mail, par une autre route et avec
 * un autre journal. Deux types rendent la confusion impossible, même par erreur de programmation.
 */
describe('🔴 le type MIME du glisser d’une pièce', () => {
  it('est à nous, et distinct de celui des fichiers du Drive', () => {
    expect(MIME_PIECE).toBe('application/x-svv-piece');
    expect(MIME_PIECE).not.toBe('application/x-svv-drive');
  });

  it('n’est ni text/plain ni text/uri-list — un nom de document du cabinet ne fuit pas dans un autre onglet', () => {
    expect(MIME_PIECE.startsWith('application/')).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-FERME — CE QUI FAIT UNE SESSION DE CLASSEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO (02/10/2026, option « b ») : « La mémorisation de l'arbre est gardée, mais restaurée uniquement
   si l'on rouvre la fenêtre pour les MÊMES pièces. Dès que les pièces changent, l'arbre repart entièrement
   fermé. »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la signature d’une session de classement', () => {
  const p = (pieceId: number, nom = 'x.pdf') => ({ pieceId, nom, tailleOctets: 1, typeMime: 'application/pdf' });

  it('🔴 les MÊMES pièces donnent la MÊME signature, quel que soit leur ordre', () => {
    const a = signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11), p(12)] });
    const b = signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(12), p(11)] });
    expect(a).toBe(b);
  });

  it('🔴🔴 une pièce différente, en plus ou en moins, change la signature', () => {
    const deux = signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11), p(12)] });
    expect(signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11)] })).not.toBe(deux);
    expect(signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11), p(12), p(13)] })).not.toBe(deux);
    expect(signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11), p(99)] })).not.toBe(deux);
  });

  /** ⚠️ LE NOM NE COMPTE PAS : il peut changer avant le dépôt (lot RENOMMER-AVANT-RANGER). L'identifiant, non. */
  it('⚠️ renommer une pièce avant de la ranger ne change pas la session', () => {
    expect(signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11, 'scan.pdf')] }))
      .toBe(signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11, 'bail signé.pdf')] }));
  });

  it('🔴 un doublon d’identifiant ne fabrique pas une session différente', () => {
    expect(signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11), p(11)] }))
      .toBe(signatureSession({ mode: 'ranger', messageId: 900, pieces: [p(11)] }));
  });

  /**
   * ⚠️ LE MODE « JOINDRE » N'EST PAS CONCERNÉ. Il ne range aucune pièce : sa signature est constante, et son
   * arbre se retrouve d'une ouverture à l'autre exactement comme avant ce lot. Arno n'a rien demandé là-dessus.
   */
  it('⚠️ « joindre » garde une signature constante — son arbre se retrouve, comme avant', () => {
    expect(signatureSession({ mode: 'joindre' })).toBe('joindre');
    expect(signatureSession({ mode: 'joindre', messageId: 900, pieces: [p(11)] })).toBe('joindre');
  });
});

describe('🔴🔴 faut-il restaurer l’arbre mémorisé ?', () => {
  it('🔴 oui pour la même session, non pour une autre', () => {
    expect(arbreARestaurer('ranger:900:11,12', 'ranger:900:11,12')).toBe(true);
    expect(arbreARestaurer('ranger:900:11,12', 'ranger:900:99')).toBe(false);
  });

  /** 🔴 PAS DE SIGNATURE ⇒ FERMÉ. C'est ce qu'a écrit une version d'avant ce lot : dans le doute, on ne restaure pas. */
  it('🔴🔴 sans signature retenue, on ne restaure rien', () => {
    expect(arbreARestaurer(null, 'ranger:900:11,12')).toBe(false);
  });
});
