'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  bordsVisibles, clicAAvaler, COMPORTEMENT_CONTINU, COMPORTEMENT_SAUT, defilementMolette,
  glisserCommence, pasDUnEcran,
} from '../../../../lib/gestion/defilementFrise';

/**
 * ══ 🔴🔴 LOT FRISES-REPARATION, B — LE DÉFILEMENT DES FRISES, UN SEUL CHEMIN POUR LES DEUX ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026), point B.3 : « Applique les MÊMES règles de défilement à la frise des mails (A) :
 * même code, pas de second chemin. »
 *
 * C'est donc ce crochet, et lui seul, qui défile — `FriseAvancement` comme `FriseDuBien`. Les règles elles-mêmes
 * (quoi convertir, quand rendre la main, de combien avance une flèche, à partir de quand un glisser avale son
 * clic) vivent dans le module PUR `lib/gestion/defilementFrise.ts`, où elles s'éprouvent sans navigateur. Ici,
 * il n'y a que la plomberie DOM — et deux pièges de plomberie qui valent d'être nommés.
 *
 * ═══ 🔴🔴 PIÈGE 1 — `onWheel` DE REACT EST PASSIF, DONC `preventDefault()` N'Y FAIT RIEN ════════════════════════
 *
 * React attache ses écouteurs à la racine, et `wheel` y est attaché **passif** (depuis React 17). Un
 * `e.preventDefault()` dans un `onWheel={…}` de JSX est donc ignoré : le navigateur a déjà décidé de faire
 * défiler la page. On ne peut PAS détourner la molette depuis le JSX. D'où l'écouteur natif
 * `addEventListener('wheel', …, { passive: false })` posé ici.
 *
 * ⚠️ C'est aussi pourquoi l'ancien code « fonctionnait » en apparence sans jamais empêcher quoi que ce soit : il
 * posait `scrollLeft` ET laissait la page défiler, les deux à la fois.
 *
 * ═══ 🔴🔴 PIÈGE 2 — LA MESURE QUI A TOUT EXPLIQUÉ ═══════════════════════════════════════════════════════════════
 *
 * Sur lot-237 (82 px de défilement disponible), chaque geste rendait **0** — molette, Maj+molette, trackpad, et
 * jusqu'à `scrollLeft = 9999`. La feuille portait `scroll-behavior: smooth` : chaque affectation devenait une
 * ANIMATION que la suivante annulait. Avec `behavior: 'instant'`, les mêmes gestes rendent **82**, le maximum.
 * Le défilement continu passe donc TOUJOURS par `COMPORTEMENT_CONTINU`, et jamais par la feuille.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴 POSER LA POSITION, SANS SUPPOSER QUE `scrollTo` EXISTE ════════════════════════════════════════════════════
 *
 * 🔴 TROUVÉ PAR LA SUITE, ET CE N'EST PAS UN ARTEFACT D'ÉPREUVE : `TypeError: el.scrollTo is not a function`,
 * sur les 12 épreuves de rendu de la frise des mails. L'environnement de rendu des épreuves n'implémente pas
 * `Element.scrollTo` — et il n'est pas le seul endroit où elle peut manquer. L'ancien code posait
 * `el.scrollLeft = …` et ne rencontrait jamais la question.
 *
 * On garde donc `scrollTo` quand elle existe, pour son `behavior: 'instant'` qui ignore la feuille, et l'on
 * retombe sur l'affectation simple sinon. L'affectation est elle aussi instantanée tant qu'aucune feuille ne
 * dit `smooth` — et une épreuve vérifie qu'aucune ne le dit.
 */
function poser(el: HTMLElement, gauche: number): void {
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ left: gauche, behavior: COMPORTEMENT_CONTINU });
    return;
  }
  el.scrollLeft = gauche;
}

/** Ce que le crochet rend au composant. Rien à recâbler : on étale `attaches` sur le conteneur qui défile. */
export interface DefilementFrise<T extends HTMLElement> {
  /** À poser sur LE conteneur qui défile — un seul, jamais deux imbriqués (Arno). */
  ref: React.RefObject<T | null>;
  /** Reste-t-il du chemin de ce côté ? Décide de l'affichage des flèches « ‹ › ». */
  bords: { gauche: boolean; droite: boolean };
  /** Une flèche : environ un écran, en douceur, parce que c'est un saut voulu et unique. */
  glisser: (sens: -1 | 1) => void;
  /** Caler la frise tout à droite (le plus récent), UNE SEULE FOIS dans la vie du composant. */
  calerAuBoutUneFois: () => void;
  /** Caler la frise sur un élément précis, UNE SEULE FOIS dans la vie du composant. */
  calerSurUneFois: (cible: HTMLElement | null) => void;
  /** Les gestes, à étaler tels quels sur le conteneur. */
  attaches: {
    tabIndex: number;
    onKeyDown: (e: React.KeyboardEvent<T>) => void;
    onPointerDown: (e: React.PointerEvent<T>) => void;
    onPointerMove: (e: React.PointerEvent<T>) => void;
    onPointerUp: (e: React.PointerEvent<T>) => void;
    onPointerCancel: (e: React.PointerEvent<T>) => void;
    onClickCapture: (e: React.MouseEvent<T>) => void;
  };
}

export function useDefilementFrise<T extends HTMLElement>(
  relecture: unknown,
  /**
   * 🔴🔴 LOT FRISE-POIGNEE-DE-SAISIE — « UNE CARTE EST EN TRAIN D'ÊTRE DÉPLACÉE ». Tant que c'est vrai, la
   * piste ne se laisse pas tirer : les deux gestes se disputaient le même appui, et celui-ci gagnait toujours.
   *
   * ⚠️ FACULTATIF, et la frise des MAILS ne le passe pas : sans lui, ce crochet est EXACTEMENT celui d'avant.
   */
  gesteDeCarte?: () => boolean,
): DefilementFrise<T> {
  const ref = useRef<T | null>(null);
  const [bords, setBords] = useState({ gauche: false, droite: false });

  /**
   * 🔴 « POSITIONNEMENT SUR LA DERNIÈRE ÉTAPE UNE SEULE FOIS À L'OUVERTURE, PUIS PLUS JAMAIS » (Arno). Ce verrou
   * est la phrase entière. Sans lui, chaque relecture — un confirmer, un montant saisi, une partie cochée —
   * ramenait la frise au bout, et le lecteur perdait l'endroit qu'il examinait.
   *
   * ⚠️ IL NE SE FERME QU'APRÈS UN CALAGE RÉUSSI : au premier rendu, le conteneur peut ne pas exister encore
   * (une frise sans mois ne rend rien), et un verrou posé d'avance aurait annulé le calage pour de bon.
   */
  const cale = useRef(false);

  const mesurer = useCallback(() => {
    const el = ref.current;
    if (el === null) return;
    setBords(bordsVisibles(el));
  }, []);

  /**
   * ══ LES DEUX ÉCOUTEURS NATIFS ══════════════════════════════════════════════════════════════════════════════
   *
   * `scroll` en passif (on ne fait que lire), `wheel` en NON passif (voir le piège 1). Le `resize` de la fenêtre
   * compte aussi : une frise qui tient tout entière à 1 600 px ne tient plus à 900, et les flèches doivent
   * apparaître sans qu'on ait à toucher la frise.
   */
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;

    const surMolette = (e: WheelEvent): void => {
      const cible = ref.current;
      if (cible === null) return;
      const { dx, prendreLaMain } = defilementMolette(e, cible);
      /* 🔴 « PUIS LA PAGE REPREND LA MAIN » : on ne gêne pas, on ne corrige pas, on ne fait RIEN. */
      if (!prendreLaMain) return;
      e.preventDefault();
      poser(cible, cible.scrollLeft + dx);
    };

    mesurer();
    el.addEventListener('scroll', mesurer, { passive: true });
    el.addEventListener('wheel', surMolette, { passive: false });
    window.addEventListener('resize', mesurer);
    return () => {
      el.removeEventListener('scroll', mesurer);
      el.removeEventListener('wheel', surMolette);
      window.removeEventListener('resize', mesurer);
    };
    /* `relecture` remet la mesure à jour quand le contenu de la frise a changé de largeur. */
  }, [mesurer, relecture]);

  const glisser = useCallback((sens: -1 | 1): void => {
    const el = ref.current;
    if (el === null) return;
    const pas = sens * pasDUnEcran(el.clientWidth);
    /* ⚠️ MÊME PRUDENCE QUE `poser` : `scrollBy` peut manquer là où `scrollTo` manque. La douceur est alors
       perdue, pas le déplacement — et c'est le bon ordre de priorité. */
    if (typeof el.scrollBy === 'function') {
      el.scrollBy({ left: pas, behavior: COMPORTEMENT_SAUT });
      return;
    }
    el.scrollLeft += pas;
  }, []);

  /**
   * 🔴 LE CLAVIER ← → (Arno). Et il ne vole pas les flèches à la page : on ne les prend que si la frise peut
   * encore avancer de ce côté, exactement la règle de la molette. En butée, la touche reprend son sens habituel.
   *
   * ⚠️ `tabIndex: 0` VA AVEC : une zone qui défile doit pouvoir recevoir le focus, sinon le clavier n'y arrive
   * jamais — et c'est aussi ce que demandent les règles d'accessibilité pour une région défilante.
   */
  const onKeyDown = useCallback((e: React.KeyboardEvent<T>): void => {
    const sens: -1 | 1 | 0 = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (sens === 0) return;
    const el = ref.current;
    if (el === null || !bordsVisibles(el)[sens < 0 ? 'gauche' : 'droite']) return;
    e.preventDefault();
    glisser(sens);
  }, [glisser]);

  /**
   * ══ 🔴 LE GLISSER, ET LE CLIC QU'IL NE DOIT PLUS DÉCLENCHER ════════════════════════════════════════════════
   *
   * Arno : « cliquer-tirer sans déclencher de clic sur un carré ».
   *
   * ⚠️ `onPointerDown` ET NON `onMouseDown` : le même code sert le doigt, le stylet et la souris. La capture du
   * pointeur évite que le glisser ne s'arrête quand le curseur sort du conteneur.
   *
   * 🔴 ET C'EST `onClickCapture` QUI FERME LE DÉFAUT. Un `click` naît à la MONTÉE du pointeur, après notre
   * `pointerup` — trop tard pour l'empêcher depuis le glisser lui-même. On le laisse donc naître et on l'arrête
   * à la DESCENTE de la capture, avant qu'il n'atteigne le carré. Un `stopPropagation` sur la phase de bulle
   * serait arrivé après que le carré l'ait déjà reçu.
   */
  const tire = useRef<{ x: number; depart: number; pris: boolean } | null>(null);
  const avaleLeClic = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent<T>): void => {
    const el = ref.current;
    if (el === null) return;
    /* ⚠️ LE BOUTON PRINCIPAL SEULEMENT : un clic droit ouvre un menu, il ne tire pas la frise. */
    if (e.button !== 0) return;
    tire.current = { x: e.clientX, depart: el.scrollLeft, pris: false };
    avaleLeClic.current = false;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<T>): void => {
    const el = ref.current;
    const t = tire.current;
    if (el === null || t === null) return;
    /**
     * ══ 🔴🔴 LOT FRISE-POIGNEE-DE-SAISIE — LA PISTE NE TIRE PAS PENDANT QU'ON DÉPLACE UNE CARTE ═══════════
     *
     * CONSTAT D'ARNO (08/10/2026) : « je n'arrive PAS à déplacer les carrés par clic maintenu. »
     *
     * 🔴 LA CAUSE ÉTAIT ICI. Ce glisser-ci démarre à 4 px, SANS DÉLAI, et prend la capture du pointeur deux
     * lignes plus bas. Le glisser de CARTE, lui, demande un maintien : il arrivait toujours après, sur une
     * frise déjà en train de défiler sous le curseur. Mesuré au mouchard : capture prise à t+5 ms.
     *
     * 🔴 LES DEUX GESTES SONT DÉSORMAIS EXCLUSIFS. Dès qu'une carte est saisie — par sa poignée, ou par un
     * maintien immobile —, la frise cesse de se laisser tirer : c'est le glisser de carte qui la fait défiler
     * aux bords, et lui seul (`useGlisserCarte`). Arno garde donc ses deux gestes, sans qu'ils se disputent.
     *
     * ⚠️ `gesteDeCarte` EST FACULTATIF, et la frise des MAILS ne le passe pas : sans lui, ce crochet se
     * comporte EXACTEMENT comme avant ce lot. Aucun des deux écrans ne change pour l'autre.
     */
    if (gesteDeCarte?.() === true) return;
    const d = e.clientX - t.x;
    if (!t.pris && !glisserCommence(d)) return;
    if (!t.pris) {
      t.pris = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    /* 🔴 INSTANTANÉ, SANS DISCUSSION : c'est du continu, et c'est là qu'était la panne. */
    poser(el, t.depart - d);
    /* ⚠️ `gesteDeCarte` EST UNE RÉFÉRENCE, et elle ne figure PAS dans les dépendances : sa valeur change sans
       rendu, la lire dans le corps du rappel suffit, et l'y inscrire ferait perdre la mémoïsation (le
       compilateur React le refuse — « Existing memoization could not be preserved »). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finDuGlisser = useCallback((e: React.PointerEvent<T>): void => {
    const t = tire.current;
    tire.current = null;
    if (t === null) return;
    avaleLeClic.current = clicAAvaler(e.clientX - t.x);
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent<T>): void => {
    if (!avaleLeClic.current) return;
    avaleLeClic.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /** Caler tout à droite — le plus récent — une seule fois. */
  const calerAuBoutUneFois = useCallback((): void => {
    const el = ref.current;
    if (cale.current || el === null) return;
    cale.current = true;
    poser(el, el.scrollWidth);
  }, []);

  /**
   * Caler sur un élément précis, une seule fois.
   *
   * ⚠️ `block: 'nearest'` ET `inline: 'center'` : on cale HORIZONTALEMENT sans faire sauter la page
   * verticalement. Un `scrollIntoView` par défaut remonterait la fiche entière sur la frise.
   */
  const calerSurUneFois = useCallback((cible: HTMLElement | null): void => {
    if (cale.current || cible === null || ref.current === null) return;
    /* ⚠️ MÊME PRUDENCE : `scrollIntoView` manque elle aussi dans certains environnements de rendu. */
    if (typeof cible.scrollIntoView !== 'function') return;
    cale.current = true;
    cible.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  return {
    ref,
    bords,
    glisser,
    calerAuBoutUneFois,
    calerSurUneFois,
    attaches: {
      tabIndex: 0,
      onKeyDown,
      onPointerDown,
      onPointerMove,
      onPointerUp: finDuGlisser,
      onPointerCancel: finDuGlisser,
      onClickCapture,
    },
  };
}
