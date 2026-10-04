import type { SortieLevee, TraceSuivi } from '../../../../lib/gestion/interneLevee';

/**
 * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — L'« ANNULER » D'UNE LEVÉE, ÉCRIT UNE SEULE FOIS ═════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026) : « “Annuler” REJOUE AUSSI LA DÉCISION DE SUIVI D'AVANT. Après Annuler, l'état est
 * exactement celui d'avant le geste : liens, interventions, marque Interne, ET décision de suivi (fenêtre,
 * personnes, en-tête du bandeau). Aucune “décision vide” ni fausse exception ne doit rester. »
 *
 * 🔴 DEUX ÉCRANS OFFRENT CETTE SORTIE — le bloc « Classer ce mail » et « Visualiser / Modifier » — et l'ordre des
 * deux appels est la FONCTIONNALITÉ. Écrit deux fois, il aurait divergé au premier ajustement ; il est donc écrit
 * ICI, et les deux écrans l'appellent.
 *
 * ═══ 🔴🔴 L'ORDRE, ET CE QU'IL GARANTIT ════════════════════════════════════════════════════════════════════════
 *
 *   ① LA DÉCISION DE SUIVI D'ABORD. Le serveur retire ce que le geste a créé, rouvre ce qu'il a fermé, puis
 *      REPROJETTE : les liens et les interventions reviennent d'eux-mêmes, parce que la projection est un diff
 *      vers la décision vivante (voir `annulerClassement`). C'est ce qui évite un second chemin de restauration.
 *   ② LA MARQUE « INTERNE » ENSUITE, avec les liens que la projection n'aurait pas pu reprendre (le chemin
 *      direct, sans périodes). 🔴 JAMAIS AVANT : reposer « interne » sur un mail qui porte encore son bien
 *      reconstruirait, le temps d'une requête, l'état même que ce lot ferme.
 *
 * ⚠️ UNE TRACE ABSENTE N'EST PAS UNE ERREUR : le geste n'est pas passé par les périodes (migration 290 absente,
 * ou conversation sans suivi). On saute l'étape ①, et l'étape ② retire les liens par leur identifiant — le
 * comportement du lot précédent, inchangé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** ① Défait la décision de suivi, à l'identifiant près. Rend `true` si le serveur a accepté. */
export async function defaireLaDecisionDeSuivi(trace: TraceSuivi | null): Promise<boolean> {
  if (trace === null) return false;
  try {
    const res = await fetch('/api/admin/gestion/suivi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annuler: trace }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return d.ok === true;
  } catch { return false; }
}

/** Ce que l'annulation a pu faire, pour le mot qu'on affiche. */
export interface IssueAnnulationLevee {
  /** La décision de suivi a-t-elle été défaite ? `false` aussi quand il n'y en avait pas. */
  suivi: boolean;
  /** Combien de rattachements l'étape ② a retirés elle-même. */
  liens: number;
  /** Le serveur a-t-il accepté de remettre la marque ? */
  ok: boolean;
}

/** ①+② L'annulation complète, dans l'ordre. */
export async function annulerLaLevee(fait: SortieLevee): Promise<IssueAnnulationLevee> {
  const suivi = await defaireLaDecisionDeSuivi(fait.trace);
  try {
    const res = await fetch('/api/admin/gestion/interne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ remettreLevee: true, remettre: fait.liens, marques: fait.mails }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; liens?: number };
    return { suivi, liens: typeof d.liens === 'number' ? d.liens : 0, ok: d.ok === true };
  } catch {
    return { suivi, liens: 0, ok: false };
  }
}
