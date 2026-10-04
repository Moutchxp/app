'use client';

import { useEffect, useState } from 'react';
import {
  heureCourteParis, infobulleHeureParis, msAvantProchaineMinute,
} from '../../../lib/admin/heureParis';

/**
 * ══ 🔴🔴 LOT REINTEGRER-PARTOUT-ET-BANDEAU, POINT 2b — L'HEURE DE PARIS DANS LE BANDEAU ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : « l'heure en heure française (Europe/Paris, quel que soit le fuseau de l'ordinateur), au format
 * “10:58”, mise à jour chaque minute. Au survol : “dimanche 4 octobre 2026, 10:58”. Discret, même style que le
 * bandeau. »
 *
 * ═══ 🔴🔴 RIEN N'EST RENDU AU PREMIER PASSAGE, ET C'EST LA SEULE FAÇON JUSTE ═════════════════════════════════════
 *
 * Ce bandeau est rendu par le SERVEUR. Une horloge rendue là-bas serait l'heure du serveur à l'instant de la
 * requête — donc une heure FAUSSE dès la seconde suivante, et surtout DIFFÉRENTE de celle que le navigateur
 * calculerait en reprenant la page. React appelle cela un écart d'hydratation : il le signale, puis remplace le
 * texte en silence. On rend donc `null` tant qu'on n'est pas dans le navigateur, et l'heure apparaît au montage.
 *
 * ⚠️ LE SEUL COÛT EST UN BANDEAU SANS HEURE PENDANT UN RENDU, et c'est le bon compromis : mieux vaut une heure qui
 * arrive un battement plus tard qu'une heure fausse affichée tout de suite. C'est la même règle que le thème admin
 * (`snapshotThemeServeur`), pour la même raison.
 *
 * ═══ 🔴 LA MISE À JOUR SE RECALE SUR LA MINUTE, elle ne compte pas 60 secondes ════════════════════════════════════
 *
 * Voir `msAvantProchaineMinute` : un intervalle d'une minute posé à 10:58:59 afficherait « 10:58 » jusqu'à
 * 10:59:59. On attend donc la seconde 0, puis on repart.
 *
 * ⚠️ ET ON SE REMET À L'HEURE EN REVENANT SUR L'ONGLET. Un onglet en arrière-plan voit ses minuteries BRIDÉES par
 * le navigateur (jusqu'à une par minute, et bien moins quand la machine dort) : sans ce réveil, on retrouverait
 * une horloge arrêtée sur l'heure du moment où l'on a changé d'onglet. C'est exactement le piège mesuré sur
 * l'onglet piloté de ce dépôt — `requestAnimationFrame` ne s'y déclenche jamais, `setTimeout` y est bridé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export function HeureParis() {
  /** `null` = pas encore dans le navigateur. Voir l'encadré : aucune heure n'est rendue par le serveur. */
  const [instant, setInstant] = useState<Date | null>(null);

  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout> | undefined;

    /**
     * 🔴 ON RELIT L'HORLOGE, PUIS ON SE REPROGRAMME. Chaque passage recalcule son propre délai : une minuterie
     * posée une fois pour toutes dériverait de quelques millisecondes à chaque tour, et finirait par changer de
     * minute une seconde trop tôt.
     */
    const battre = (): void => {
      const d = new Date();
      setInstant(d);
      minuterie = setTimeout(battre, msAvantProchaineMinute(d));
    };
    battre();

    /* ⚠️ AU RETOUR SUR L'ONGLET : on relit tout de suite, et la minuterie repart du bon pied. */
    const reveil = (): void => {
      if (document.visibilityState !== 'visible') return;
      if (minuterie !== undefined) clearTimeout(minuterie);
      battre();
    };
    document.addEventListener('visibilitychange', reveil);

    return () => {
      if (minuterie !== undefined) clearTimeout(minuterie);
      document.removeEventListener('visibilitychange', reveil);
    };
  }, []);

  if (instant === null) return null;

  /**
   * ⚠️ `<time>` ET NON UN `<span>` : c'est l'élément que HTML prévoit pour une heure, et son `dateTime` donne la
   * valeur lisible par une machine. L'infobulle, elle, est pour l'œil.
   * ⚠️ `aria-label` EN PLUS DU `title` : un lecteur d'écran annoncerait « 10:58 » sans dire de quoi il s'agit, et
   * `title` n'est pas annoncé de façon fiable. La phrase complète lève les deux ambiguïtés.
   */
  const court = heureCourteParis(instant);
  const complet = infobulleHeureParis(instant);
  return (
    <time className="svv-adm-heure" dateTime={instant.toISOString()} title={complet} aria-label={complet}>
      {court}
    </time>
  );
}
