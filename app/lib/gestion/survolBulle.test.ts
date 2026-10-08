/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LA TOLÉRANCE DE TRAJET D'UNE BULLE — LOT FRISE-BULLE-ET-ENREGISTRER (08/10/2026) ════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * DEMANDE D'ARNO : « La bulle reste ouverte tant que la souris est sur le point OU sur la bulle, avec une
 * tolérance de trajet (petit délai ~300 ms à la sortie + pas de vide entre point et bulle). »
 *
 * 🔴 CE QUE CES ÉPREUVES TIENNENT, ET QU'AUCUN ESSAI À L'ÉCRAN NE TIENDRA : les courses. Entrer dans la bulle
 * APRÈS avoir demandé la fermeture, aller d'un point à l'autre pendant qu'un minuteur court, voir échoir un
 * minuteur en retard — trois situations qui durent quelques dizaines de millisecondes à l'écran, et qu'on ne
 * reproduit à la main qu'avec de la chance. Ici, chacune est une ligne.
 *
 * 🔒 Aucun minuteur, aucun navigateur, aucune base : le module ne connaît pas le temps, il dit seulement ce
 * qu'il faut faire quand le délai échoit.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BULLE_FERMEE, DELAI_FERMETURE_BULLE_MS, minuteurArme, surDelaiEchu,
  surEntreeBulle, surEntreeCible, surSortieBulle, surSortieCible,
} from './survolBulle';

describe('🔴🔴 ① le délai, et ce qu’il vaut', () => {
  /** 🔴 LE CHIFFRE EST CELUI D'ARNO (« ~300 ms »), et il est nommé une seule fois pour les deux bulles. */
  it('🔴🔴 le délai de fermeture est de 300 ms', () => {
    expect(DELAI_FERMETURE_BULLE_MS).toBe(300);
  });
});

describe('🔴🔴 ② le trajet du point vers la bulle, qui était impossible', () => {
  /**
   * 🔴🔴 LE DÉFAUT D'ARNO, EN TROIS GESTES. Avant ce lot, la sortie du point FERMAIT : la bulle disparaissait
   * pendant que la souris traversait le vide, et ses liens « Modifier » et « Retirer » étaient inatteignables.
   * Ici, la sortie ne fait que DEMANDER, et l'entrée dans la bulle annule.
   */
  it('🔴🔴 quitter le point n’éteint pas la bulle : on peut encore l’atteindre', () => {
    const surLePoint = surEntreeCible('p12');
    expect(surLePoint.cible).toBe('p12');

    const enRoute = surSortieCible(surLePoint);
    /* 🔴 LA BULLE MONTRE TOUJOURS LE MÊME POINT : c'est tout l'objet du lot. */
    expect(enRoute.cible).toBe('p12');
    expect(enRoute.fermetureDemandee).toBe(true);
    expect(minuteurArme(enRoute)).toBe(true);

    const dansLaBulle = surEntreeBulle(enRoute);
    expect(dansLaBulle.cible).toBe('p12');
    expect(dansLaBulle.fermetureDemandee).toBe(false);
    /* 🔴 ET PLUS AUCUN MINUTEUR : tant que la souris est dessus, la bulle ne s'en va pas. */
    expect(minuteurArme(dansLaBulle)).toBe(false);
  });

  /**
   * 🔴🔴 ET LE MINUTEUR EN RETARD NE FERME RIEN. C'est la course qui compte : la sortie arme un minuteur, la
   * souris entre dans la bulle avant l'échéance, et le minuteur échoit QUAND MÊME (il a été armé, et rien ne
   * garantit que l'annulation arrive avant). La garde est relue À L'ÉCHÉANCE, et non à la sortie.
   */
  it('🔴🔴 un minuteur en retard ne ferme pas une bulle qu’on survole', () => {
    const dansLaBulle = surEntreeBulle(surSortieCible(surEntreeCible('p12')));
    const apres = surDelaiEchu(dansLaBulle);
    expect(apres.cible).toBe('p12');
  });

  /** ⚠️ ET LE CHEMIN DU RETOUR AUSSI : de la bulle vers le point, sans fermer entre les deux. */
  it('⚠️ revenir de la bulle vers le point garde la bulle ouverte', () => {
    const enRetour = surSortieBulle(surEntreeBulle(surSortieCible(surEntreeCible('p12'))));
    expect(enRetour.fermetureDemandee).toBe(true);
    const deNouveauSurLePoint = surEntreeCible('p12');
    expect(minuteurArme(deNouveauSurLePoint)).toBe(false);
    expect(deNouveauSurLePoint.cible).toBe('p12');
  });
});

describe('🔴🔴 ③ et elle finit par se fermer, sinon elle resterait sur l’écran', () => {
  /** 🔴 PERSONNE DESSUS À L'ÉCHÉANCE ⇒ FERMÉE. Une tolérance qui ne se referme jamais n'est pas une tolérance. */
  it('🔴🔴 le délai écoulé, sans la souris, la bulle se ferme', () => {
    expect(surDelaiEchu(surSortieCible(surEntreeCible('p12')))).toEqual(BULLE_FERMEE);
    expect(surDelaiEchu(surSortieBulle(surEntreeBulle(surSortieCible(surEntreeCible('p12'))))))
      .toEqual(BULLE_FERMEE);
  });

  /**
   * ⚠️ UNE ÉCHÉANCE SANS FERMETURE DEMANDÉE NE FAIT RIEN. Le minuteur peut survivre à l'état qui l'a armé (une
   * entrée l'annule sans le désarmer côté navigateur) : il doit alors être sans effet, pas refermer la bulle
   * qu'on vient de rouvrir.
   */
  it('⚠️ une échéance sans fermeture demandée est sans effet', () => {
    const surLePoint = surEntreeCible('p12');
    expect(surDelaiEchu(surLePoint)).toEqual(surLePoint);
    expect(surDelaiEchu(BULLE_FERMEE)).toEqual(BULLE_FERMEE);
  });
});

describe('🔴🔴 ④ les gardes qui évitent les bulles fantômes', () => {
  /**
   * 🔴 ALLER D'UN POINT À UN AUTRE PENDANT QU'UN MINUTEUR COURT. Le défaut classique des menus à délai : la
   * fermeture armée par le premier point referme la bulle du second, une fraction de seconde après qu'on l'a
   * ouverte. Une entrée efface tout ce qui précède, fermeture demandée comprise.
   */
  it('🔴🔴 passer d’un point à l’autre n’hérite pas de la fermeture du premier', () => {
    const quitte = surSortieCible(surEntreeCible('p12'));
    expect(quitte.fermetureDemandee).toBe(true);
    const voisin = surEntreeCible('p13');
    expect(voisin.cible).toBe('p13');
    expect(voisin.fermetureDemandee).toBe(false);
    /* 🔴 ET L'ÉCHÉANCE DU PREMIER MINUTEUR NE L'EMPORTE PAS : elle ne trouve plus de fermeture à faire. */
    expect(surDelaiEchu(voisin).cible).toBe('p13');
  });

  /**
   * ⚠️ ENTRER DANS UNE BULLE DÉJÀ FERMÉE NE LA RALLUME PAS. Le cas existe : la bulle disparaît sous la souris
   * (le minuteur a échu), et le navigateur envoie encore un `mouseenter` à l'élément qui s'en va. La rallumer
   * ferait réapparaître une bulle que l'on vient de voir partir, sans que rien ne l'ait demandé.
   */
  it('⚠️ aucune transition ne ressuscite une bulle fermée', () => {
    expect(surEntreeBulle(BULLE_FERMEE)).toEqual(BULLE_FERMEE);
    expect(surSortieBulle(BULLE_FERMEE)).toEqual(BULLE_FERMEE);
    expect(surSortieCible(BULLE_FERMEE)).toEqual(BULLE_FERMEE);
    expect(minuteurArme(BULLE_FERMEE)).toBe(false);
  });
});

describe('🔒 ⑤ le module ne connaît ni le temps ni le navigateur', () => {
  /**
   * 🔴 LA SÉPARATION EST LA RAISON D'ÊTRE DU FICHIER : la règle s'éprouve ici, le minuteur vit dans
   * `useBulleSurvol`. Si un `setTimeout` s'installait ici, ces épreuves cesseraient d'être instantanées et
   * sûres — et la règle redeviendrait ce qu'elle était : invérifiable.
   */
  it('🔒 aucun minuteur, aucun `window`, aucun `Date` dans le module pur', () => {
    /* ⚠️ LE CODE, PAS LES COMMENTAIRES : le fichier EXPLIQUE qu'il n'emploie pas `setTimeout`, et ce mot y
       figure donc en toutes lettres. Chercher dans le texte brut aurait rendu l'épreuve rouge pour la phrase
       même qui dit la règle — et la façon de la « réparer » aurait été d'effacer l'explication. */
    const sansCommentaires = readFileSync('app/lib/gestion/survolBulle.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    for (const interdit of ['setTimeout', 'clearTimeout', 'window.', 'document.', 'new Date']) {
      expect(sansCommentaires, interdit).not.toContain(interdit);
    }
    /* ⚠️ ET LE RESTE DU FICHIER EST BIEN LÀ : sans cette ligne, un module vidé passerait l'épreuve. */
    expect(sansCommentaires).toContain('export function surDelaiEchu');
  });
});
