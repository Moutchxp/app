'use client';

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * ══ 🔴🔴 LE MINUTEUR DE LA BULLE — LOT FRISE-BULLE-ET-ENREGISTRER (08/10/2026) ═══════════════════════════════════
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ARNO : « La bulle reste ouverte tant que la souris est sur le point OU sur la bulle, avec une tolérance de
 * trajet (petit délai ~300 ms à la sortie + pas de vide entre point et bulle). »
 *
 * 🔴 CE CROCHET NE CONNAÎT AUCUNE RÈGLE : il ne sait que poser et annuler un minuteur. Tout ce qui décide —
 * quand on ferme, ce qu'une entrée annule, ce qu'une sortie demande — vit dans `survolBulle.ts`, module PUR,
 * éprouvé transition par transition. C'est la même séparation que `glisserCarte.ts` / `useGlisserCarte.ts`, et
 * elle a la même raison : une règle enfouie dans des `setTimeout` ne s'éprouve pas, elle se re-teste à la main
 * chaque fois qu'on y touche.
 *
 * ⚠️ UN SEUL MINUTEUR À LA FOIS, et il est reposé à chaque changement d'état : l'effet se nettoie lui-même
 * (`clearTimeout` au retour). Sans cela, deux sorties rapprochées armeraient deux fermetures, et la seconde
 * refermerait une bulle qu'on vient de rouvrir.
 *
 * ⚠️ AUCUNE RÉFÉRENCE PARTAGÉE AVEC L'APPELANT : le compilateur React refuse qu'une `useRef` passe d'un crochet
 * à l'autre pour y être modifiée (défaut rencontré au lot FRISE-POIGNEE-DE-SAISIE). Ce crochet ne rend que des
 * fonctions et une valeur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BULLE_FERMEE, DELAI_FERMETURE_BULLE_MS, type EtatBulle, minuteurArme,
  surDelaiEchu, surEntreeBulle, surEntreeCible, surSortieBulle, surSortieCible,
} from '../../../../lib/gestion/survolBulle';

export interface BulleSurvol {
  /** Ce que la bulle montre, ou `null` si elle est fermée. */
  cible: string | null;
  /** La souris entre sur la cible (un point, le « i » d'un carré). */
  entrerCible: (cle: string) => void;
  /** Elle la quitte : la fermeture est DEMANDÉE, pas faite. */
  quitterCible: () => void;
  /** Elle entre dans la bulle : c'est ce qui rend ses liens atteignables. */
  entrerBulle: () => void;
  /** Elle quitte la bulle. */
  quitterBulle: () => void;
  /** Fermer sur-le-champ — Échap, un clic ailleurs, l'ouverture d'un panneau. */
  fermer: () => void;
}

export function useBulleSurvol(): BulleSurvol {
  const [etat, setEtat] = useState<EtatBulle>(BULLE_FERMEE);

  /**
   * ⚠️ L'EFFET DÉPEND DE L'ÉTAT ENTIER, et c'est voulu : toute transition repose la question « faut-il un
   * minuteur ? » au module pur. Dépendre du seul `fermetureDemandee` aurait laissé courir un minuteur armé
   * avant qu'une entrée ne l'annule — l'annulation n'aurait alors eu aucun effet visible.
   */
  useEffect(() => {
    if (!minuteurArme(etat)) return undefined;
    const t = window.setTimeout(() => { setEtat(surDelaiEchu); }, DELAI_FERMETURE_BULLE_MS);
    return () => { window.clearTimeout(t); };
  }, [etat]);

  const entrerCible = useCallback((cle: string): void => { setEtat(surEntreeCible(cle)); }, []);
  const quitterCible = useCallback((): void => { setEtat(surSortieCible); }, []);
  const entrerBulle = useCallback((): void => { setEtat(surEntreeBulle); }, []);
  const quitterBulle = useCallback((): void => { setEtat(surSortieBulle); }, []);
  const fermer = useCallback((): void => { setEtat(BULLE_FERMEE); }, []);

  /**
   * ⚠️ UN OBJET STABLE, ET C'EST UNE NÉCESSITÉ D'APPELANT : l'écran met ce crochet dans les dépendances de
   * `toutRefermer`, qui est lui-même la dépendance de l'écouteur d'Échap. Un objet neuf à chaque rendu ferait
   * désabonner puis réabonner cet écouteur à chaque frappe, pour rien.
   */
  return useMemo(
    () => ({ cible: etat.cible, entrerCible, quitterCible, entrerBulle, quitterBulle, fermer }),
    [etat.cible, entrerCible, quitterCible, entrerBulle, quitterBulle, fermer]);
}
