'use client';

import {
  useCallback, useEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type RefObject,
} from 'react';
/**
 * 🔴 DEPUIS LE MODULE **PUR**, JAMAIS DEPUIS LE DÉPÔT. Ce crochet vit dans le navigateur : importer un dépôt le
 * ferait remonter jusqu'à `pg`, donc jusqu'à `dns`, et webpack refuserait de construire TOUTE l'application
 * (incident du 24/09/2026). Le garde `clientBoundary.guard.test.ts` le vérifie.
 */
import {
  glisserAbandonne, glisserSArme, MAINTIEN_MS, placesPermises, placeVisee, rangeeApresGlisser,
  sequenceReordonnee, type CarteGlissable,
} from '../../../../lib/gestion/glisserCarte';

/**
 * ══ 🔴🔴 LOT FRISE-POIGNEE-DE-SAISIE — DÉPLACER UNE CARTE, PAR LA POIGNÉE OU AU CLIC MAINTENU ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (08/10/2026, après a32de37a) : « je n'arrive PAS à déplacer les carrés de la frise entre eux
 * par clic maintenu. Le geste ne prend pas. »
 *
 * ═══ 🔴🔴 CE QUI NE PRENAIT PAS, MESURÉ DANS CHROME AVEC UN VRAI GLISSER ════════════════════════════════════════
 *
 * Deux gestes se disputaient le même appui. Le DÉFILEMENT de la frise démarre à 4 px, SANS DÉLAI, et prend la
 * CAPTURE DU POINTEUR (`useDefilementFrise`, ligne 199) ; le glisser de carte attendait 220 ms ET 6 px AU MÊME
 * INSTANT. Comme c'est le mouvement qui produit les `pointermove`, les 220 ms n'arrivaient jamais avant que la
 * main n'ait dépassé 4 px. Relevé au mouchard : `pointerdown` à t+0, `gotpointercapture` sur `.fav-piste` à
 * **t+5 ms**. La carte ne partait pas, la frise défilait à sa place.
 *
 * ═══ 🔴🔴 CE QUI LE RÉPARE, ET CE QU'ARNO AJOUTE ════════════════════════════════════════════════════════════════
 *
 * ① UNE POIGNÉE (⠿), demandée par Arno : « Saisir la poignée démarre le glisser IMMÉDIATEMENT, sans délai de
 *   maintien. » C'est le chemin sûr — il ne dépend d'aucun seuil, donc d'aucune course.
 * ② LE CLIC MAINTENU EST RÉPARÉ, ET CONSERVÉ (Arno : « garde-le s'il fonctionne une fois le diagnostic
 *   corrigé ») : il s'arme désormais sur l'IMMOBILITÉ — appuyer et ne pas bouger pendant 220 ms —, et il est
 *   abandonné dès que la main part avant. Les deux gestes deviennent exclusifs.
 * ③ TANT QU'UNE CARTE EST SAISIE, LA PISTE NE DÉFILE PLUS D'ELLE-MÊME (`gesteDeCarte`) : sans cela, les deux
 *   continueraient de se marcher dessus.
 *
 * ═══ 🔴 CE QUI PROTÈGE LES TROIS GESTES QUI EXISTAIENT DÉJÀ ═════════════════════════════════════════════════════
 *
 * Le clic sur la carte, le crayon et le menu « … » doivent continuer de répondre :
 *   · tant que le geste n'est pas armé, ce crochet n'a RIEN fait — ni `preventDefault`, ni capture, ni état ;
 *   · la poignée est un élément à part : la saisir ne saisit rien d'autre ;
 *   · le clic qui suit un glisser est annulé, une fois, en capture — sans quoi déposer une carte ouvrirait sa
 *     bulle. Même procédé que `useDefilementFrise` pour le glisser de la piste.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ══ 🔴🔴 LE DRAPEAU PARTAGÉ — « UNE CARTE EST EN TRAIN D'ÊTRE DÉPLACÉE » ════════════════════════════════════════
 *
 * Deux crochets doivent le voir : celui qui le POSE (le glisser de carte) et celui qui le LIT (le défilement de
 * la piste, qui doit alors se taire). Il est donc créé à part, et chacun ne reçoit que ce dont il a besoin —
 * une fonction pour écrire, une référence pour lire.
 *
 * 🔴 POURQUOI PAS UN SIMPLE `useRef` PASSÉ AUX DEUX. Parce qu'une référence REÇUE EN PARAMÈTRE puis mutée est
 * refusée par le compilateur React (« This value cannot be modified ») : il ne peut pas prouver que c'est une
 * référence. En la créant ICI, et en ne laissant sortir qu'un écrivain et un lecteur, la mutation reste là où
 * elle se voit — et l'épreuve de lint reste verte.
 */
export interface DrapeauGeste {
  /** Pour `useDefilementFrise`, qui le LIT et ne l'écrit jamais. */
  lire: () => boolean;
  /** Pour `useGlisserCarte`, qui le POSE. */
  poser: (valeur: boolean) => void;
}

export function useDrapeauGeste(): DrapeauGeste {
  const drapeau = useRef(false);
  /* ⚠️ DEUX FONCTIONS, ET AUCUNE RÉFÉRENCE QUI SORTE : une référence lue pendant le rendu, ou mutée depuis un
     autre crochet, fait rougir le compilateur React — et il a raison sur le principe, une référence qui
     voyage est une référence dont plus personne ne sait qui l'écrit. Ici, un écrivain, un lecteur. */
  const lire = useCallback((): boolean => drapeau.current, []);
  const poser = useCallback((valeur: boolean): void => { drapeau.current = valeur; }, []);
  return { lire, poser };
}

/** À quelle distance d'un bord la piste se met à défiler toute seule, et de combien par image. */
const BORD_PX = 48;
const PAS_PX = 14;

export interface GlisserCarte {
  /** L'identifiant de la carte saisie, ou `null`. L'écran s'en sert pour la mettre en relief. */
  saisie: number | null;
  /** À brancher sur le `pointerdown` d'une carte déplaçable — s'arme après un maintien immobile. */
  commencer: (id: number, ev: ReactPointerEvent) => void;
  /** À brancher sur le `pointerdown` de la POIGNÉE — s'arme sur-le-champ (Arno). */
  commencerParLaPoignee: (id: number, ev: ReactPointerEvent) => void;
  /**
   * Le repère vertical qui montre où la carte va tomber. À poser dans la piste : `ref={glisserCarte.repere}`.
   *
   * ⚠️ UNE FONCTION, ET NON UNE RÉFÉRENCE : passer un objet de référence lu pendant le rendu fait rougir le
   * compilateur React (« Cannot access refs during render »). Un rappel de référence est la forme qu'il
   * attend, et c'est aussi la plus explicite — le crochet dit ce qu'il veut recevoir.
   */
  repere: (el: HTMLElement | null) => void;
}

export function useGlisserCarte(
  piste: RefObject<HTMLElement | null>,
  /** Le nouvel ordre, quand il change. `null` n'est jamais envoyé : le crochet ne l'appelle pas. */
  onDeposer: (ordre: number[]) => void,
  /**
   * 🔴🔴 POSER « UNE CARTE EST SAISIE » : tant que c'est vrai, la piste ne se laisse pas tirer. C'est la
   * correction du conflit qu'Arno a constaté (« le geste ne prend pas »), et elle vient de `useDrapeauGeste`.
   */
  poserGesteDeCarte: (valeur: boolean) => void,
): GlisserCarte {
  const [saisie, setSaisie] = useState<number | null>(null);
  /**
   * ⚠️ TOUT L'ÉTAT DU GESTE EST DANS UNE RÉFÉRENCE, ET NON DANS `useState` : il change à chaque image, et un
   * rendu par mouvement de souris ferait ramer la frise. Seul `saisie` est un état, parce que lui seul se voit.
   */
  const geste = useRef<{
    id: number; debut: number; x0: number; y0: number; arme: boolean; mort: boolean; pointeur: number;
  } | null>(null);
  const repere = useRef<HTMLElement | null>(null);
  const poserRepere = useCallback((el: HTMLElement | null): void => { repere.current = el; }, []);
  /** Le minuteur qui arme un maintien resté IMMOBILE : sans lui, un appui sans le moindre mouvement n'armerait
   *  jamais — il ne produit aucun `pointermove`, donc aucune occasion de vérifier le délai. */
  const minuteur = useRef<number | null>(null);

  /** La rangée telle qu'elle est À L'ÉCRAN : les cartes dans l'ordre, avec leur centre mesuré. */
  const rangee = useCallback((): CarteGlissable[] => {
    const p = piste.current;
    if (p === null) return [];
    const bande = p.getBoundingClientRect();
    return [...p.querySelectorAll<HTMLElement>('li.fav-el--carre')].map((li) => {
      const r = li.getBoundingClientRect();
      const brut = li.dataset.carte;
      return {
        /* ⚠️ L'OUVERTURE DÉRIVÉE N'A PAS DE `data-carte` : elle prend 0, un identifiant qui n'existe pas en
           base. Elle occupe donc une place dans la rangée — ce qu'elle fait à l'écran — sans jamais pouvoir
           être saisie ni figurer dans l'ordre envoyé. */
        id: brut === undefined ? 0 : Number(brut),
        deplacable: li.dataset.fixe !== 'oui' && brut !== undefined,
        centre: r.left + r.width / 2 - bande.left + p.scrollLeft,
      };
    });
  }, [piste]);

  /**
   * ══ 🔴🔴 LA SUITE COMPLÈTE DES PAS, LUE DANS LE DOM — CARRÉS **ET** POINTS ═════════════════════════════════
   *
   * 🔴 DÉFAUT TROUVÉ À L'ÉCRAN LE 08/10/2026 : la rangée ne lisait que les CARRÉS. Les POINTS (messages
   * informatifs) manquaient à l'ordre envoyé, le dépôt le refusait en bloc — à juste titre —, et sur toute
   * frise portant ne serait-ce qu'un point AUCUN déplacement n'aboutissait, sans que rien ne le dise.
   *
   * 🔴 ON LIT DONC TOUT CE QUI PORTE UN `data-carte`, dans l'ordre du document : c'est LITTÉRALEMENT l'ordre
   * qu'on voit. Aucune liste parallèle à tenir d'accord avec l'écran — c'est l'écran qui répond.
   */
  const sequence = useCallback((): number[] => {
    const p = piste.current;
    if (p === null) return [];
    return [...p.querySelectorAll<HTMLElement>('[data-carte]')].map((el) => Number(el.dataset.carte));
  }, [piste]);

  /** Le `<li>` d'une carte, pour la faire suivre la souris. */
  const liDe = useCallback((id: number): HTMLElement | null =>
    piste.current?.querySelector<HTMLElement>(`li.fav-el--carre[data-carte="${id}"]`) ?? null, [piste]);

  /**
   * 🔴 TOUT REMETTRE EN PLACE : le fantôme reprend sa position, le repère disparaît, la piste redevient
   * maîtresse de son défilement. Appelée au dépôt comme à l'annulation — une seule porte de sortie, sans quoi
   * l'une des deux oublierait toujours quelque chose (leçon de `toutRefermer`, dans la frise).
   */
  const ranger = useCallback((): void => {
    const g = geste.current;
    if (g !== null) {
      const li = liDe(g.id);
      if (li !== null) { li.style.transform = ''; li.style.zIndex = ''; }
    }
    if (minuteur.current !== null) { window.clearTimeout(minuteur.current); minuteur.current = null; }
    if (repere.current !== null) repere.current.hidden = true;
    geste.current = null;
    poserGesteDeCarte(false);
    setSaisie(null);
  }, [liDe, poserGesteDeCarte]);

  /** Armer : la carte est prise, et la piste cesse de tirer. */
  const armer = useCallback((): void => {
    const g = geste.current;
    if (g === null || g.arme || g.mort) return;
    g.arme = true;
    poserGesteDeCarte(true);
    setSaisie(g.id);
  }, [poserGesteDeCarte]);

  const commencer = useCallback((id: number, ev: ReactPointerEvent): void => {
    /* ⚠️ LE BOUTON PRINCIPAL SEULEMENT : un clic droit ouvre un menu contextuel, il n'enlève pas une carte. */
    if (ev.button !== 0) return;
    geste.current = {
      id, debut: Date.now(), x0: ev.clientX, y0: ev.clientY, arme: false, mort: false, pointeur: ev.pointerId,
    };
    /* 🔴 LE MINUTEUR ARME UN MAINTIEN IMMOBILE. Une main parfaitement immobile n'envoie aucun `pointermove` :
       sans ce rendez-vous, le geste n'aurait jamais lieu. */
    if (minuteur.current !== null) window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => { armer(); }, MAINTIEN_MS);
  }, [armer]);

  /**
   * 🔴🔴 LA POIGNÉE : AUCUN SEUIL, AUCUN DÉLAI (Arno). Elle annonce ce qu'elle fait — il n'y a donc rien à
   * deviner, donc rien à attendre, et aucune course à perdre contre le défilement de la piste.
   *
   * ⚠️ `stopPropagation` : sans lui, le `pointerdown` remonterait au `<li>` (qui arme le maintien) ET à la
   * piste (qui tire la frise). La poignée prend le geste pour elle, et c'est toute sa raison d'être.
   */
  const commencerParLaPoignee = useCallback((id: number, ev: ReactPointerEvent): void => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    geste.current = {
      id, debut: Date.now(), x0: ev.clientX, y0: ev.clientY, arme: false, mort: false, pointeur: ev.pointerId,
    };
    armer();
  }, [armer]);

  useEffect(() => {
    /** Poser le fantôme sous la souris et le repère à la place visée. */
    const peindre = (x: number, dx: number): void => {
      const g = geste.current;
      const p = piste.current;
      if (g === null || p === null) return;
      const li = liDe(g.id);
      if (li !== null) { li.style.transform = `translateX(${Math.round(dx)}px)`; li.style.zIndex = '4'; }

      const autres = rangee().filter((c) => c.id !== g.id);
      const { min, max } = placesPermises(autres);
      const place = Math.min(Math.max(placeVisee(autres, x), min), max);
      /* Le repère se pose au BORD entre deux cartes : à gauche de celle qui suit, ou à droite de la dernière. */
      const bord = place < autres.length
        ? autres[place].centre - 80
        : (autres.length === 0 ? 0 : autres[autres.length - 1].centre + 80);
      if (repere.current !== null) {
        repere.current.hidden = false;
        repere.current.style.left = `${Math.round(bord)}px`;
      }
    };

    const surMouvement = (ev: PointerEvent): void => {
      const g = geste.current;
      if (g === null || g.mort || ev.pointerId !== g.pointeur) return;
      const dx = ev.clientX - g.x0;
      const dy = ev.clientY - g.y0;
      if (!g.arme) {
        /* 🔴 LA MAIN EST PARTIE AVANT LA FIN DU MAINTIEN : ce n'est pas un glisser de carte, c'est un
           défilement. On se retire, et la piste fait son travail. */
        if (glisserAbandonne(Date.now() - g.debut, dx, dy)) { g.mort = true; ranger(); return; }
        if (!glisserSArme(Date.now() - g.debut, dx, dy)) return;
        armer();
      }
      /* 🔴 LE GESTE EST ENGAGÉ : on empêche la sélection de texte et le défilement tactile de la page. */
      ev.preventDefault();

      const p = piste.current;
      if (p === null) return;
      /* 🔴 LA PISTE DÉFILE TOUTE SEULE AUX BORDS (Arno) — sans cela, on ne peut pas atteindre un carré caché
         sans lâcher. C'est ce défilement-ci qui remplace celui de la piste pendant le geste. */
      const r = p.getBoundingClientRect();
      if (ev.clientX < r.left + BORD_PX) p.scrollLeft -= PAS_PX;
      else if (ev.clientX > r.right - BORD_PX) p.scrollLeft += PAS_PX;
      peindre(ev.clientX - r.left + p.scrollLeft, dx);
    };

    const surRelache = (ev: PointerEvent): void => {
      const g = geste.current;
      if (g === null || ev.pointerId !== g.pointeur) return;
      if (!g.arme) { ranger(); return; } /* ⚠️ SIMPLE CLIC : on n'a rien fait, et on ne fait rien. */

      const p = piste.current;
      const x = p === null ? 0 : ev.clientX - p.getBoundingClientRect().left + p.scrollLeft;
      const cartes = rangee();
      const apres = rangeeApresGlisser(cartes, g.id, x);
      /* 🔴 LES CARRÉS PRENNENT LEUR NOUVEL ORDRE, LES POINTS GARDENT LEUR PLACE : `sequenceReordonnee` tisse
         les deux, et c'est la suite ENTIÈRE qui part — la seule que le dépôt accepte. */
      const avant = cartes.filter((c) => c.id > 0).map((c) => c.id);
      const ordre = apres === null
        ? null
        : sequenceReordonnee(sequence(), avant, apres.filter((id) => id > 0));
      ranger();

      /**
       * 🔴 LE CLIC QUI SUIT EST ANNULÉ, UNE FOIS, EN CAPTURE. Relâcher la carte déclenche un `click` sur ce
       * qu'il y a dessous : sans cela, chaque dépôt ouvrirait la bulle de la carte.
       */
      const avaler = (c: Event): void => { c.stopPropagation(); c.preventDefault(); };
      window.addEventListener('click', avaler, { capture: true, once: true });
      /* ⚠️ ET ON LE RETIRE SI AUCUN CLIC NE VIENT (un relâchement hors de toute cible n'en produit pas) :
         sinon le PROCHAIN clic de l'écran, celui d'après, serait avalé à la place. */
      window.setTimeout(() => window.removeEventListener('click', avaler, { capture: true }), 0);

      if (ordre !== null) onDeposer(ordre);
    };

    /**
     * 🔴 ÉCHAP ANNULE, ET LA CARTE REVIENT À SA PLACE (Arno). Rien n'est envoyé : `ranger` remet le fantôme et
     * efface le repère, et le `pointerup` qui suivra trouvera un geste « mort » qu'il laissera passer.
     */
    const surTouche = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape' || geste.current === null) return;
      geste.current.mort = true;
      ranger();
    };

    /* ⚠️ `passive: false` SUR LE MOUVEMENT : c'est la seule façon d'appeler `preventDefault` (même règle que la
       molette dans `useDefilementFrise`). */
    window.addEventListener('pointermove', surMouvement, { passive: false });
    window.addEventListener('pointerup', surRelache);
    window.addEventListener('pointercancel', surRelache);
    window.addEventListener('keydown', surTouche);
    return () => {
      window.removeEventListener('pointermove', surMouvement);
      window.removeEventListener('pointerup', surRelache);
      window.removeEventListener('pointercancel', surRelache);
      window.removeEventListener('keydown', surTouche);
    };
  }, [piste, rangee, sequence, liDe, onDeposer, armer, ranger]);

  return { saisie, commencer, commencerParLaPoignee, repere: poserRepere };
}
