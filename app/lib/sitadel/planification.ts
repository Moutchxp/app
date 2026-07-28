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
}

/** Heures écoulées entre deux instants, arrondi à 1 décimale POUR L'AFFICHAGE seulement (jamais réinjecté dans un calcul). */
function heuresEcoulees(depuis: Date, jusqua: Date): number {
  return Math.floor(((jusqua.getTime() - depuis.getTime()) / 3_600_000) * 10) / 10;
}

/**
 * Un run PLANIFIÉ doit-il s'exécuter ? Fondé sur `auto_active`, l'intervalle, et la date du dernier run RÉUSSI
 * (`dernierSucces` = fini_le du dernier 'succes', ou null s'il n'y en a jamais eu — un échec ne compte pas, donc n'empêche
 * pas de réessayer). La raison est toujours chiffrée.
 */
export function doitSExecuter(dernierSucces: Date | null, maintenant: Date, config: ConfigAuto): { executer: boolean; raison: string } {
  if (!config.autoActive) return { executer: false, raison: 'automatisation désactivée (auto_active = false)' };
  if (dernierSucces === null) return { executer: true, raison: 'aucun run réussi antérieur — exécution' };
  const h = heuresEcoulees(dernierSucces, maintenant);
  if (h >= config.autoIntervalleHeures) {
    return { executer: true, raison: `dernier succès il y a ${h} h (≥ intervalle ${config.autoIntervalleHeures} h)` };
  }
  const restant = Math.max(0, Math.ceil(config.autoIntervalleHeures - h));
  return { executer: false, raison: `dernier succès il y a ${h} h ; prochain dans ~${restant} h (intervalle ${config.autoIntervalleHeures} h)` };
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
