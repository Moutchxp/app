/**
 * MODULE « GESTION » — LOT 3 : LA PASSE DE RELÈVE, coquille d'orchestration testable PAR INJECTION.
 *
 * Elle ajoute à la capture les trois garanties d'exploitation, recopiées du module Permis qui les a éprouvées — mais avec
 * ses PROPRES objets, jamais les siens :
 *   ① UN VERROU À SOI (`CLE_VERROU_GESTION`, jamais `CLE_VERROU_VEILLE`) → deux passes ne se superposent pas, et une
 *      passe de gestion lente ne retarde JAMAIS la veille Sitadel ;
 *   ② UN JOURNAL EN DEUX TEMPS (`gestion_releve_run`, jamais `releve_run`) : ligne « en_cours » AVANT la connexion, mise
 *      à jour « ok »/« erreur » après — un plantage brutal laisse quand même une trace datée. Sans ce journal, « rien
 *      n'est arrivé » et « on n'a pas relevé depuis dix jours » seraient indiscernables ;
 *   ③ L'ISOLATION : un échec est journalisé puis RENDU à l'appelant, jamais relancé — la relève n'aggrave rien.
 *
 * ⚠️ AUCUN BRANCHEMENT dans `executerVeille` : cette passe ne se déclenche que par un geste explicite (bouton ou CLI).
 * L'automatiser est une question d'hébergement, pas de ce lot.
 */
import type { ConfigGestion } from './config';
import type { RapportCapture } from './capture';
import type { ClientDossier, MajRun } from './captureRepo';

export type ResultatReleve = 'ok' | 'erreur' | 'occupe' | 'inactif';

export interface IssueReleve {
  resultat: ResultatReleve;
  raison: string;
  runId: number | null;          // null en simulation (aucune ligne écrite) et pour les cas sans passe réelle
  rapport: RapportCapture | null;
}

export interface DepsReleveGestion {
  maintenant(): Date;
  config(): Promise<ConfigGestion>;
  /** `null` = aucun compte IMAP configuré. Ce n'est PAS une erreur : il n'y a simplement rien à relever. */
  creerClient(): Promise<ClientDossier | null>;
  acquerirVerrou(): Promise<boolean>;
  libererVerrou(): Promise<void>;
  insererRun(dossier: string): Promise<number>;
  finaliserRun(id: number, maj: MajRun): Promise<void>;
  capturer(client: ClientDossier, appliquer: boolean): Promise<RapportCapture>;
}

/**
 * UNE passe. `appliquer = false` = SIMULATION : la boîte est lue, tout est compté, et RIEN n'est écrit — pas même la
 * ligne de journal, qui serait déjà une écriture. Le verrou, lui, est pris dans les DEUX modes : une simulation lancée
 * pendant une vraie passe lirait une boîte à moitié capturée et donnerait des compteurs faux.
 */
export async function executerReleveGestion(deps: DepsReleveGestion, appliquer: boolean): Promise<IssueReleve> {
  const config = await deps.config();

  const client = await deps.creerClient();
  if (client === null) {
    return { resultat: 'inactif', raison: 'aucun compte IMAP configuré : rien à relever (ce n’est pas une erreur).', runId: null, rapport: null };
  }

  if (!await deps.acquerirVerrou()) {
    return { resultat: 'occupe', raison: 'une relève de gestion est déjà en cours.', runId: null, rapport: null };
  }

  try {
    if (!appliquer) {
      // SIMULATION : aucune ligne de journal (ce serait une écriture), aucune écriture en base ni sur le stockage.
      const rapport = await deps.capturer(client, false);
      return { resultat: 'ok', raison: resume(rapport), runId: null, rapport };
    }

    const runId = await deps.insererRun(config.dossierImap); // « en_cours » AVANT la connexion
    try {
      const rapport = await deps.capturer(client, true);
      await deps.finaliserRun(runId, { resultat: 'ok', termineLe: deps.maintenant(), rapport });
      return { resultat: 'ok', raison: resume(rapport), runId, rapport };
    } catch (e) {
      const motif = e instanceof Error ? e.message : String(e);
      await deps.finaliserRun(runId, { resultat: 'erreur', termineLe: deps.maintenant(), erreur: motif });
      return { resultat: 'erreur', raison: motif, runId, rapport: null };
    }
  } finally {
    await deps.libererVerrou(); // rendu quoi qu'il arrive : un verrou oublié bloquerait toutes les passes suivantes
  }
}

/** Résumé d'une passe, en une phrase lisible (écran, CLI, journal). PUR. */
export function resume(r: RapportCapture): string {
  const reste = r.plafondAtteint ? `, plafond atteint (${r.uidsServeur - r.vus} message(s) pour la passe suivante)` : '';
  return `${r.captures} capturé(s), ${r.exclus} tenu(s) hors de la file, ${r.dejaConnus} déjà connu(s)${reste}`;
}
