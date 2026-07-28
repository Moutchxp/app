/**
 * Décisions PURES de la planification de la veille Sitadel (chantier S11a). AUCUN accès base, réseau ou fichier :
 * entièrement testable. Toutes les « raisons » sont des phrases CHIFFRÉES (jamais un libellé figé), pour que le journal
 * et l'écran d'admin expliquent toujours POURQUOI un run a (ou n'a pas) tourné.
 */

export type Declencheur = 'manuel' | 'planifie' | 'api';
export type StatutRun = 'en_cours' | 'succes' | 'rien_a_faire' | 'echec';

/** Réglages d'automatisation lus depuis config_veille (sous-ensemble utile à la décision). */
export interface ConfigAuto {
  autoActive: boolean;
  autoIntervalleHeures: number;
  /** Drapeau « demande d'exécution immédiate » (config_veille.run_demande_le) ; null = aucune demande en attente. */
  runDemandeLe: Date | null;
}

/** Heures écoulées entre deux instants, arrondi à 1 décimale POUR L'AFFICHAGE seulement (jamais réinjecté dans un calcul). */
function heuresEcoulees(depuis: Date, jusqua: Date): number {
  return Math.floor(((jusqua.getTime() - depuis.getTime()) / 3_600_000) * 10) / 10;
}

/**
 * Un run doit-il s'exécuter ? DANS CET ORDRE (chantier S11b) :
 *   1. demande manuelle en attente (`runDemandeLe`) → exécuter, déclencheur 'manuel' (passe outre auto_active ET l'intervalle) ;
 *   2. sinon `auto_active` false → ne pas exécuter ;
 *   3. sinon aucun run réussi antérieur → exécuter ;
 *   4. sinon intervalle non écoulé → ne pas exécuter (heures restantes chiffrées) ;
 *   5. sinon exécuter.
 * `dernierSucces` = fini_le du dernier 'succes' (null s'il n'y en a jamais eu — un échec ne compte pas, donc n'empêche pas
 * de réessayer). La raison est toujours chiffrée ; le `declencheur` distingue une exécution manuelle d'une planifiée.
 */
export function doitSExecuter(
  dernierSucces: Date | null, maintenant: Date, config: ConfigAuto,
): { executer: boolean; raison: string; declencheur: Declencheur } {
  if (config.runDemandeLe !== null) {
    return { executer: true, raison: `demande manuelle du ${config.runDemandeLe.toISOString()}`, declencheur: 'manuel' };
  }
  if (!config.autoActive) return { executer: false, raison: 'automatisation désactivée (auto_active = false)', declencheur: 'planifie' };
  if (dernierSucces === null) return { executer: true, raison: 'aucun run réussi antérieur — exécution', declencheur: 'planifie' };
  const h = heuresEcoulees(dernierSucces, maintenant);
  if (h >= config.autoIntervalleHeures) {
    return { executer: true, raison: `dernier succès il y a ${h} h (≥ intervalle ${config.autoIntervalleHeures} h)`, declencheur: 'planifie' };
  }
  const restant = Math.max(0, Math.ceil(config.autoIntervalleHeures - h));
  return { executer: false, raison: `dernier succès il y a ${h} h ; prochain dans ~${restant} h (intervalle ${config.autoIntervalleHeures} h)`, declencheur: 'planifie' };
}

/**
 * Prochain passage attendu de l'ordonnanceur (pour l'écran). Fondé sur le dernier run RÉUSSI + l'intervalle. Retourne la
 * date attendue (ou null si non planifiable) et une phrase lisible chiffrée.
 */
export function prochainPassage(dernierSucces: Date | null, config: ConfigAuto, maintenant: Date): { date: Date | null; phrase: string } {
  if (config.runDemandeLe !== null) return { date: maintenant, phrase: 'demande manuelle en attente — au prochain passage de l’ordonnanceur (un quart d’heure au plus)' };
  if (!config.autoActive) return { date: null, phrase: 'automatisation éteinte — aucun passage planifié' };
  if (dernierSucces === null) return { date: maintenant, phrase: 'dès le prochain passage de l’ordonnanceur' };
  const date = new Date(dernierSucces.getTime() + config.autoIntervalleHeures * 3_600_000);
  if (date.getTime() <= maintenant.getTime()) return { date, phrase: 'attendu dès le prochain passage de l’ordonnanceur (échéance atteinte)' };
  const restant = Math.max(0, Math.ceil((date.getTime() - maintenant.getTime()) / 3_600_000));
  return { date, phrase: `prévu dans ~${restant} h` };
}

/**
 * L'ordonnanceur semble-t-il absent ? Vrai si l'automatisation est active MAIS aucun passage récent : soit jamais aucun
 * run, soit le dernier remonte à PLUS DE DEUX intervalles. Un écran affichant « actif » alors que rien ne tourne est pire
 * que pas d'écran — d'où cet avertissement chiffré.
 */
export function ordonnanceurSuspect(dernierPassage: Date | null, config: ConfigAuto, maintenant: Date): { suspect: boolean; message: string } {
  if (!config.autoActive) return { suspect: false, message: '' };
  if (dernierPassage === null) {
    return { suspect: true, message: 'aucun passage automatique détecté — l’ordonnanceur n’est peut-être pas installé.' };
  }
  const seuilMs = 2 * config.autoIntervalleHeures * 3_600_000;
  if (maintenant.getTime() - dernierPassage.getTime() > seuilMs) {
    const h = heuresEcoulees(dernierPassage, maintenant);
    return { suspect: true, message: `aucun passage automatique depuis ${h} h (plus de 2× l’intervalle de ${config.autoIntervalleHeures} h) — l’ordonnanceur n’est peut-être pas installé.` };
  }
  return { suspect: false, message: '' };
}

/** Durée lisible d'un run à partir de ses horodatages ISO (— si indisponible/incohérent). */
export function dureeRun(demarreLe: string | null, finiLe: string | null): string {
  if (!demarreLe || !finiLe) return '—';
  const a = Date.parse(demarreLe), b = Date.parse(finiLe);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '—';
  const s = Math.round((b - a) / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Traduction française des statuts de run (pour l'écran). */
export const STATUT_FR: Record<string, string> = { succes: 'succès', rien_a_faire: 'rien à faire', en_cours: 'en cours', echec: 'échec' };
export function traduireStatut(statut: string): string { return STATUT_FR[statut] ?? statut; }

/**
 * Message de retour du bouton « Lancer maintenant » — dit la VÉRITÉ : le travail ne démarre PAS à l'instant, il sera pris
 * au prochain passage de l'ordonnanceur. Si une demande est déjà en attente, on l'indique au lieu d'en poser une seconde.
 */
export function messageDemandeManuelle(dejaEnAttente: boolean): string {
  return dejaEnAttente
    ? 'Une demande est déjà en attente : elle sera exécutée au prochain passage de l’ordonnanceur (dans un quart d’heure au plus).'
    : 'Demande enregistrée : elle sera exécutée au prochain passage de l’ordonnanceur, dans un quart d’heure au plus. Le travail ne démarre pas à l’instant.';
}

/** Le millésime distant est-il nouveau vs celui en base ? Raison chiffrée (aucun libellé figé). */
export function millesimeEstNouveau(base: string | null, distant: string): { nouveau: boolean; raison: string } {
  if (base === null || base.trim() === '') return { nouveau: true, raison: `aucun millésime en base ; distant « ${distant} »` };
  if (base !== distant) return { nouveau: true, raison: `millésime distant « ${distant} » ≠ base « ${base} »` };
  return { nouveau: false, raison: `millésime déjà à jour (« ${base} »)` };
}

/** Un run tel que journalisé dans veille_run (champs utiles au résumé). */
export interface RunVeille {
  declencheur: string;
  statut: string;
  demarreLe: string | null;
  finiLe: string | null;
  millesimeDetecte: string | null;
  millesimeIngere: string | null;
  lignesLues: number | null;
  dossiersRetenus: number | null;
  dossiersNouveaux: number | null;
  message: string | null;
  erreur: string | null;
}

/** Phrase lisible d'un run — pour l'écran d'admin et le journal. Robuste aux champs nuls. */
export function resumeRun(run: RunVeille): string {
  const parts: string[] = [`[${run.statut}] ${run.declencheur}`];
  const mil = run.millesimeIngere ?? run.millesimeDetecte;
  if (mil) parts.push(`millésime ${mil}`);
  if (run.lignesLues !== null || run.dossiersRetenus !== null || run.dossiersNouveaux !== null) {
    parts.push(`${run.lignesLues ?? 0} lues, ${run.dossiersRetenus ?? 0} retenus, ${run.dossiersNouveaux ?? 0} nouveaux`);
  }
  if (run.demarreLe) parts.push(`démarré ${run.demarreLe}`);
  if (run.statut === 'echec' && run.erreur) parts.push(`échec : ${run.erreur}`);
  else if (run.message) parts.push(run.message);
  return parts.join(' · ');
}

/** Un fichier CSV local candidat à la purge (chemin + date de dernière modification + millésime parsé du nom). */
export interface FichierCsv { chemin: string; mtime: Date; millesime: string }

/**
 * Fichiers CSV à SUPPRIMER selon la rétention (jours). ⚠️ RÈGLE CENTRALE (S11a-FIX) : le millésime ACTUELLEMENT EN BASE
 * (`millesimeCourant`) n'est JAMAIS proposé à la suppression — c'est le cache qui rend un re-run gratuit ; le supprimer
 * garantirait un re-téléchargement de ~880 Mo. La purge ne vise donc que les fichiers de millésimes ANTÉRIEURS :
 * `retentionJours <= 0` → tous les antérieurs ; sinon seulement ceux plus vieux que la rétention. Un fichier daté dans
 * le FUTUR n'est jamais purgé par ancienneté. PURE ; le CALLER ne l'appelle QUE sur un succès.
 */
export function fichiersCsvAPurger(fichiers: FichierCsv[], maintenant: Date, retentionJours: number, millesimeCourant: string): string[] {
  const anterieurs = fichiers.filter((f) => f.millesime !== millesimeCourant); // jamais le millésime en base
  if (retentionJours <= 0) return anterieurs.map((f) => f.chemin);
  const seuilMs = retentionJours * 86_400_000;
  return anterieurs.filter((f) => maintenant.getTime() - f.mtime.getTime() > seuilMs).map((f) => f.chemin);
}
