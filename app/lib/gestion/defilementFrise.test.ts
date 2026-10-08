import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  bordsVisibles, clicAAvaler, COMPORTEMENT_CONTINU, COMPORTEMENT_SAUT, defilementMolette,
  glisserCommence, PAS_MINIMAL, pasDUnEcran, peutDefiler, RECOUVREMENT, restePossible, SEUIL_GLISSER,
  type EtatDefilement,
} from './defilementFrise';

/**
 * ══ 🔴🔴 LOT FRISES-REPARATION, B — CE QUE LE DÉFILEMENT DES FRISES DOIT TENIR ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026), point B.2, mot pour mot : « trackpad fluide avec inertie ; molette verticale
 * convertie en horizontal UNIQUEMENT tant que la frise peut défiler, puis la page reprend la main ;
 * cliquer-tirer sans déclencher de clic sur un carré ; flèches qui avancent d'environ un écran ; positionnement
 * sur la dernière étape UNE SEULE FOIS à l'ouverture, puis plus jamais ; un seul conteneur qui défile. »
 * Et B.3 : « Applique les MÊMES règles de défilement à la frise des mails (A) : même code, pas de second chemin. »
 *
 * ═══ 🔴🔴 CE QUI A ÉTÉ MESURÉ À L'ÉCRAN AVANT D'ÉCRIRE UNE LIGNE (lot-237, 82 px à défiler) ══════════════════════
 *
 *   molette verticale 0 · Maj+molette 0 · trackpad horizontal 0 · `scrollLeft = 9999` → 0 (immédiat ET à 600 ms)
 *   `scrollBy({behavior:'smooth'})` → 0 après 1 200 ms.
 *   Les MÊMES gestes, `scroll-behavior` forcé à `auto` → **82 à chaque fois**, le maximum.
 *
 * Une seule cause : `scroll-behavior: smooth` dans la feuille. Elle transforme toute affectation de `scrollLeft`
 * en animation, et une animation est annulée par l'affectation suivante — un geste continu se bat contre
 * lui-même. D'où `COMPORTEMENT_CONTINU`, éprouvé plus bas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const CROCHET = readFileSync('app/(admin)/admin/(protected)/gestion/useDefilementFrise.ts', 'utf8');
const AVANCEMENT = readFileSync('app/(admin)/admin/(protected)/gestion/FriseAvancement.tsx', 'utf8');
const MAILS = readFileSync('app/(admin)/admin/(protected)/gestion/FriseDuBien.tsx', 'utf8');

/**
 * La feuille d'un composant, SANS ses commentaires — ce sont les DÉCLARATIONS qui s'appliquent, pas les
 * explications. Sans ce découpage, l'encadré qui raconte pourquoi `scroll-behavior:smooth` a été retiré ferait
 * échouer l'épreuve qui vérifie qu'il l'a bien été. (Même découpage que `frisesGeometrie.test.ts`.)
 */
function feuille(src: string): string {
  return src.slice(src.indexOf('const CSS_')).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** L'état mesuré sur lot-237 : 82 px de chemin, et l'on est au début. */
const LOT237: EtatDefilement = { scrollLeft: 0, scrollWidth: 1042, clientWidth: 960 };

describe('ce que la frise peut encore montrer', () => {
  it('🔴 le reste possible est la largeur cachée, jamais négatif', () => {
    expect(restePossible(LOT237)).toBe(82);
    /* ⚠️ UNE FRISE PLUS ÉTROITE QUE SON CADRE : 0, et non un nombre négatif qui ferait apparaître une flèche. */
    expect(restePossible({ scrollLeft: 0, scrollWidth: 400, clientWidth: 960 })).toBe(0);
  });

  /**
   * 🔴 LA MARGE D'UN PIXEL, ET ELLE EST VOULUE. Les navigateurs rendent `scrollLeft` fractionnaire (facteur de
   * zoom, écran à haute densité) : une comparaison stricte ferait clignoter la flèche de droite à chaque pixel,
   * et apprendrait à ne plus regarder les flèches.
   */
  it('🔴 à un demi-pixel du bout, la frise ne « peut plus » défiler', () => {
    expect(peutDefiler({ ...LOT237, scrollLeft: 81.5 }, 1)).toBe(false);
    expect(peutDefiler({ ...LOT237, scrollLeft: 0.5 }, -1)).toBe(false);
    expect(peutDefiler({ ...LOT237, scrollLeft: 40 }, 1)).toBe(true);
    expect(peutDefiler({ ...LOT237, scrollLeft: 40 }, -1)).toBe(true);
  });

  it('🔴 une frise qui tient tout entière ne propose aucune flèche', () => {
    expect(bordsVisibles({ scrollLeft: 0, scrollWidth: 400, clientWidth: 960 }))
      .toEqual({ gauche: false, droite: false });
  });

  it('🔴 au début, seule la flèche de droite ; au bout, seule celle de gauche', () => {
    expect(bordsVisibles(LOT237)).toEqual({ gauche: false, droite: true });
    expect(bordsVisibles({ ...LOT237, scrollLeft: 82 })).toEqual({ gauche: true, droite: false });
    expect(bordsVisibles({ ...LOT237, scrollLeft: 40 })).toEqual({ gauche: true, droite: true });
  });
});

describe('🔴🔴 la molette — convertie, puis rendue à la page', () => {
  /** Le trackpad horizontal : `deltaX` domine. Il va toujours à la frise, et le navigateur garde son inertie. */
  it('🔴 le trackpad horizontal déplace la frise', () => {
    expect(defilementMolette({ deltaX: 30, deltaY: 2, shiftKey: false }, LOT237))
      .toEqual({ dx: 30, prendreLaMain: true });
  });

  /**
   * ⚠️ ET UN GESTE HORIZONTAL NE REND JAMAIS LA MAIN, MÊME EN BUTÉE. La page ne défile pas horizontalement :
   * lui rendre un geste horizontal ne ferait rien du tout, et le relâcher ferait seulement revenir l'historique
   * du navigateur sur certains réglages de trackpad.
   */
  it('⚠️ en butée, un geste horizontal reste pris — la page n’en ferait rien', () => {
    const auBout = { ...LOT237, scrollLeft: 82 };
    expect(defilementMolette({ deltaX: 30, deltaY: 0, shiftKey: false }, auBout).prendreLaMain).toBe(true);
  });

  it('🔴 Maj + molette déplace la frise, c’est le geste conventionnel', () => {
    expect(defilementMolette({ deltaX: 0, deltaY: 40, shiftKey: true }, LOT237))
      .toEqual({ dx: 40, prendreLaMain: true });
  });

  /**
   * ══ 🔴🔴 LA MOLETTE VERTICALE N'EST PLUS INTERCEPTÉE DU TOUT ═════════════════════════════════════════════════
   *
   * ═══ CE QUE CES DEUX CAS EXIGEAIENT, ET POURQUOI C'ÉTAIT JUSTE ═══════════════════════════════════════════════
   * Ils s'appelaient « la molette verticale est convertie tant qu'il reste du chemin » et « au début, remonter
   * la molette rend la main à la page ». C'était le point B d'Arno au lot FRISES-REPARATION : « convertie en
   * horizontal UNIQUEMENT tant que la frise peut défiler, puis la page reprend la main ». La sortie en butée
   * avait même été écrite exprès pour ne pas piéger le lecteur.
   *
   * ═══ 🔴 CE QU'ARNO CONSTATE LE 08/10/2026 ════════════════════════════════════════════════════════════════════
   * « Quand le curseur est posé sur l'un d'eux, le défilement VERTICAL fait défiler le ruban → la page se
   * bloque. Voulu : seul le défilement HORIZONTAL déplace le ruban. »
   *
   * 🔴 LA SORTIE EN BUTÉE NE SUFFISAIT PAS, ET C'EST LA LEÇON : un ruban de quarante mois porte plusieurs
   * écrans de défilement. Pour dépasser la frise en lisant la fiche, il fallait d'abord la dérouler
   * ENTIÈREMENT — et au retour, elle avait perdu l'endroit qu'on regardait. Le garde-fou existait ; il était
   * simplement placé trop loin.
   */
  it('🔴🔴 la molette verticale n’est plus prise, où que la frise en soit', () => {
    /* Au début, au milieu, au bout : toujours rendue à la page. */
    for (const scrollLeft of [0, 40, 82]) {
      const etat = { ...LOT237, scrollLeft };
      expect(defilementMolette({ deltaX: 0, deltaY: 40, shiftKey: false }, etat), `vers le bas, ${scrollLeft}`)
        .toEqual({ dx: 0, prendreLaMain: false });
      expect(defilementMolette({ deltaX: 0, deltaY: -40, shiftKey: false }, etat), `vers le haut, ${scrollLeft}`)
        .toEqual({ dx: 0, prendreLaMain: false });
    }
  });

  /**
   * 🔴 ET LES DEUX GESTES HORIZONTAUX RESTENT, EUX : c'est tout ce que le lot change — ce qui est pris, et ce
   * qui ne l'est plus. Le trackpad horizontal et Maj+molette sont éprouvés juste au-dessus ; ici on tient le
   * cas limite qui distingue les deux familles : un `deltaY` dominant AVEC Maj reste horizontal.
   */
  it('🔴 Maj + molette reste prise, même quand le geste est franchement vertical', () => {
    expect(defilementMolette({ deltaX: 0, deltaY: 120, shiftKey: true }, LOT237))
      .toEqual({ dx: 120, prendreLaMain: true });
    /* ⚠️ MAIS UN MAJ SANS MOUVEMENT NE PREND RIEN : rien à déplacer, rien à empêcher. */
    expect(defilementMolette({ deltaX: 0, deltaY: 0, shiftKey: true }, LOT237))
      .toEqual({ dx: 0, prendreLaMain: false });
  });

  /**
   * 🔴 UNE FRISE QUI TIENT TOUT ENTIÈRE NE PREND RIEN. C'est le cas de lot-146 mesuré à l'écran : la frise des
   * mails y tient dans son cadre. Sans cette sortie, on ne pourrait plus faire défiler la page en passant la
   * souris dessus — pour rien, puisqu'il n'y a rien à montrer de plus.
   */
  it('🔴🔴 une frise sans rien à cacher ne détourne jamais la molette', () => {
    const tient = { scrollLeft: 0, scrollWidth: 400, clientWidth: 960 };
    expect(defilementMolette({ deltaX: 0, deltaY: 40, shiftKey: false }, tient).prendreLaMain).toBe(false);
    expect(defilementMolette({ deltaX: 0, deltaY: -40, shiftKey: false }, tient).prendreLaMain).toBe(false);
  });

  /** ⚠️ UN `deltaY` NUL NE PREND RIEN : un geste de zéro ne doit pas empêcher la page de bouger. */
  it('⚠️ une molette qui n’a pas bougé ne prend pas la main', () => {
    expect(defilementMolette({ deltaX: 0, deltaY: 0, shiftKey: false }, LOT237))
      .toEqual({ dx: 0, prendreLaMain: false });
  });
});

describe('🔴 les flèches : environ un écran', () => {
  /** Arno : « flèches qui avancent d'environ un écran ». Pas tout à fait, pour garder un repère commun. */
  it('🔴 un cran vaut 90 % de ce qu’on voit', () => {
    expect(pasDUnEcran(960)).toBe(864);
    expect(RECOUVREMENT).toBe(0.9);
  });

  /**
   * ⚠️ LE PLANCHER EST NÉCESSAIRE : sur une frise étroite (une carte de bien repliée, un portable), 90 % de
   * presque rien ne déplacerait presque rien, et la flèche paraîtrait morte.
   */
  it('⚠️ sur une frise étroite, le pas ne descend jamais sous le plancher', () => {
    expect(pasDUnEcran(100)).toBe(PAS_MINIMAL);
    expect(pasDUnEcran(0)).toBe(PAS_MINIMAL);
  });

  /**
   * ⚠️ CE QUE LE PAS VALAIT AVANT, ET POURQUOI IL A CHANGÉ : la frise d'avancement avançait de
   * `max(160, clientWidth * 0.6)` et celle des mails de `max(120, clientWidth / 2)` — deux valeurs
   * différentes pour le même geste, et toutes deux loin de « environ un écran ». Une seule, maintenant.
   */
  it('🔴🔴 les deux frises avancent du MÊME pas', () => {
    expect(AVANCEMENT).not.toContain('clientWidth * 0.6');
    expect(MAILS).not.toContain('clientWidth / 2');
  });
});

describe('🔴 le glisser, et le clic qu’il ne doit plus déclencher', () => {
  it('🔴 un clic net, qui tremble d’un pixel, ne commence pas un glisser', () => {
    expect(glisserCommence(0)).toBe(false);
    expect(glisserCommence(3)).toBe(false);
    expect(glisserCommence(-3)).toBe(false);
  });

  it('🔴 au-delà du seuil, le glisser est pris, dans les deux sens', () => {
    expect(glisserCommence(SEUIL_GLISSER)).toBe(true);
    expect(glisserCommence(-SEUIL_GLISSER)).toBe(true);
    expect(glisserCommence(200)).toBe(true);
  });

  /**
   * 🔴🔴 « CLIQUER-TIRER SANS DÉCLENCHER DE CLIC SUR UN CARRÉ » (Arno). Les deux décisions partagent le MÊME
   * seuil, et l'égalité est la règle : tout glisser qui a réellement déplacé la frise avale son clic, et lui
   * seul. Deux seuils différents laisseraient une bande de pixels où la frise bouge ET où le carré qu'on a
   * effleuré en la poussant s'ouvre.
   */
  it('🔴🔴 tout glisser qui a déplacé la frise avale son clic — et lui seul', () => {
    expect(clicAAvaler(3)).toBe(false);
    expect(clicAAvaler(SEUIL_GLISSER)).toBe(true);
    expect(clicAAvaler(-120)).toBe(true);
    /* ⚠️ UN CLIC IMMOBILE PASSE : c'est lui qui ouvre la bulle d'une étape. */
    expect(clicAAvaler(0)).toBe(false);
  });
});

describe('🔴🔴 le comportement de défilement — la correction centrale du point B', () => {
  /**
   * 🔴🔴 `'instant'`, ET LA NUANCE COMPTE. Par la spécification, `behavior:'auto'` signifie « applique le
   * `scroll-behavior` CSS de l'élément » : sur une feuille qui dirait `smooth`, il s'animerait quand même, et
   * l'on retomberait exactement dans la panne mesurée. `'instant'` l'ignore. Le défilement continu ne peut pas
   * dépendre d'une feuille de style qu'un lot futur rouvrirait.
   */
  it('🔴🔴 le continu est instantané, et ne consulte pas la feuille', () => {
    expect(COMPORTEMENT_CONTINU).toBe('instant');
    expect(COMPORTEMENT_CONTINU).not.toBe('auto');
  });

  /** 🔴 LE SAUT, LUI, S'ANIME : une flèche est un geste unique, rien ne vient l'interrompre. */
  it('🔴 une flèche s’anime', () => {
    expect(COMPORTEMENT_SAUT).toBe('smooth');
  });

  /**
   * 🔴🔴 LE GARDE QUI EMPÊCHE LA PANNE DE REVENIR : `scroll-behavior` ne doit réapparaître dans AUCUNE des deux
   * feuilles. Posé en CSS, il s'applique à tout — y compris au continu, qu'il annule.
   */
  it('🔴🔴 « scroll-behavior » n’est dans aucune des deux feuilles', () => {
    for (const [nom, src] of [['avancement', AVANCEMENT], ['mails', MAILS]] as const) {
      /* ⚠️ `(?<!over)` : « overscroll-behavior-x » CONTIENT « scroll-behavior », et il doit RESTER — il empêche
         le bout de la frise d'emporter la page. Deux propriétés différentes, un nom qui se recouvre. */
      expect(feuille(src), `${nom} : scroll-behavior a reparu dans la feuille`)
        .not.toMatch(/(?<!over)scroll-behavior/);
      /* 🔴 ET CELLE QUI DOIT RESTER EST BIEN LÀ, sur les deux frises. */
      expect(feuille(src), `${nom} : overscroll-behavior-x manquant`).toContain('overscroll-behavior-x:contain');
    }
  });

  /**
   * 🔴 TOUT LE CONTINU PASSE PAR UNE SEULE PORTE, `poser` — molette, glisser, calage d'ouverture. Une seule
   * fonction porte `COMPORTEMENT_CONTINU`, et c'est elle qui garantit l'instantané partout à la fois.
   *
   * ⚠️ ET ELLE NE SUPPOSE PAS QUE `scrollTo` EXISTE. Trouvé par la suite : `TypeError: el.scrollTo is not a
   * function` sur les 12 épreuves de rendu de la frise des mails. L'affectation simple est le repli, et elle
   * reste instantanée tant qu'aucune feuille ne dit `smooth` — ce que l'épreuve du dessus vérifie.
   */
  it('🔴 le continu n’a qu’une seule porte, et elle ne suppose rien', () => {
    expect(CROCHET.match(/behavior: COMPORTEMENT_CONTINU/g)).toHaveLength(1);
    expect(CROCHET).toContain("if (typeof el.scrollTo === 'function')");
    expect(CROCHET).toContain('el.scrollLeft = gauche;');
    /* 🔴 ET LES TROIS GESTES CONTINUS L'EMPRUNTENT : molette, glisser à la souris, calage d'ouverture.
       (`(?<!function )` écarte la déclaration elle-même : on compte les APPELS.) */
    expect(CROCHET.match(/(?<!function )\bposer\(/g)).toHaveLength(3);
    expect(CROCHET).toContain('behavior: COMPORTEMENT_SAUT');
  });
});

describe('🔴🔴 B.3 — « même code, pas de second chemin »', () => {
  /**
   * 🔴🔴 L'ÉPREUVE QUI TIENT LA DEMANDE D'ARNO. Les deux frises avaient chacune leur molette, leur glisser, leur
   * flèche et leur calage — quatre paires de chemins qui divergeaient déjà (marge de 1 px contre 4, pas de 0,6
   * écran contre 0,5, et un `tire.bouge` suivi par la frise des mails sans que rien n'en fasse jamais rien).
   */
  it('🔴🔴 aucune des deux frises n’écrit son propre défilement', () => {
    for (const [nom, src] of [['avancement', AVANCEMENT], ['mails', MAILS]] as const) {
      expect(src, `${nom} doit passer par le crochet`)
        .toContain("import { useDefilementFrise } from './useDefilementFrise';");
      expect(src, `${nom} doit étaler les gestes du crochet`).toContain('{...defilement.attaches}');
      /* ⚠️ AUCUN GESTE RÉÉCRIT SUR PLACE : ni molette, ni glisser, ni capture de pointeur. */
      expect(src, `${nom} : molette réécrite`).not.toContain('onWheel');
      expect(src, `${nom} : glisser réécrit`).not.toContain('setPointerCapture');
      expect(src, `${nom} : défilement réécrit`).not.toContain('scrollBy({');
    }
  });

  /**
   * 🔴 UN SEUL CONTENEUR QUI DÉFILE, PAR FRISE (Arno). Deux conteneurs imbriqués et l'on ne sait plus lequel
   * répond — c'était l'un des conflits qu'Arno demandait de chercher.
   */
  it('🔴 chaque frise n’a qu’un seul `overflow-x:auto`', () => {
    expect(feuille(AVANCEMENT).match(/overflow-x:auto/g)).toHaveLength(1);
    expect(feuille(MAILS).match(/overflow-x:auto/g)).toHaveLength(1);
  });

  /**
   * 🔴🔴 LA MOLETTE EN ÉCOUTEUR **NON PASSIF**, et c'est le seul moyen qui existe. React attache `wheel` à la
   * racine en PASSIF (depuis React 17) : un `preventDefault()` dans un `onWheel={…}` de JSX est ignoré. L'ancien
   * code posait donc `scrollLeft` ET laissait la page défiler — les deux à la fois.
   */
  it('🔴🔴 la molette est écoutée en non passif, hors de React', () => {
    expect(CROCHET).toContain("addEventListener('wheel', surMolette, { passive: false })");
    expect(CROCHET).toContain('e.preventDefault();');
  });

  /** 🔴 ET LE CLIC EST ARRÊTÉ À LA CAPTURE : en phase de bulle, le carré l'aurait déjà reçu. */
  it('🔴 le clic d’après-glisser est arrêté en phase de CAPTURE', () => {
    expect(CROCHET).toContain('onClickCapture');
    const i = CROCHET.indexOf('const onClickCapture');
    const f = CROCHET.slice(i, i + 400);
    expect(f).toContain('e.stopPropagation();');
    expect(f).toContain('avaleLeClic.current = false;');
  });

  /**
   * 🔴 LE CLAVIER ← → NE VOLE PAS LES FLÈCHES À LA PAGE : on ne les prend que si la frise peut encore avancer
   * de ce côté — exactement la règle de la molette. En butée, la touche reprend son sens habituel.
   */
  it('🔴 le clavier ← → ne prend la touche que s’il reste du chemin', () => {
    const i = CROCHET.indexOf('const onKeyDown');
    const f = CROCHET.slice(i, CROCHET.indexOf('}, [glisser]);', i));
    expect(f).toContain("e.key === 'ArrowLeft'");
    expect(f).toContain("e.key === 'ArrowRight'");
    expect(f).toContain('!bordsVisibles(el)[');
    expect(f).toContain('e.preventDefault();');
  });

  /** ⚠️ ET LA ZONE QUI DÉFILE PREND LE FOCUS — sinon le clavier ne l'atteint jamais — ET LE MONTRE. */
  it('⚠️ la zone qui défile est focalisable, et le dit', () => {
    expect(CROCHET).toContain('tabIndex: 0');
    expect(AVANCEMENT).toContain('.fav-piste:focus-visible');
    expect(MAILS).toContain('.frs-cadre:focus-visible');
  });

  /**
   * 🔴🔴 « UNE SEULE FOIS À L'OUVERTURE, PUIS PLUS JAMAIS » (Arno) — et le verrou est unique, partagé par les
   * deux calages. La frise des mails se recalait auparavant à CHAQUE changement du nombre de mois (une partie
   * cochée, une période choisie), et ramenait alors le lecteur tout à droite sans qu'il l'ait demandé.
   */
  it('🔴🔴 le verrou de calage est unique, et les deux calages y passent', () => {
    expect(CROCHET.match(/cale\.current = true;/g)).toHaveLength(2);
    expect(CROCHET).toContain('if (cale.current || el === null) return;');
    expect(CROCHET).toContain('if (cale.current || cible === null || ref.current === null) return;');
    expect(MAILS).toContain('calerAuBoutUneFois();');
    expect(AVANCEMENT).toContain('calerSurUneFois(moi.current);');
  });

  /** ⚠️ LE MODULE RESTE PUR : aucune importation de React ni du DOM, sinon il ne s'éprouverait plus ici. */
  it('⚠️ les règles restent dans un module pur', () => {
    const regles = readFileSync('app/lib/gestion/defilementFrise.ts', 'utf8');
    expect(regles).not.toContain("from 'react'");
    expect(regles).not.toContain('document.');
    expect(regles).not.toContain('window.');
  });
});
