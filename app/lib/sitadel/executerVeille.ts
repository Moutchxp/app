/**
 * Point d'entrée UNIQUE et idempotent du moteur de veille Sitadel (chantier S11a). Réutilisable par le CLI planifié
 * (`veille-run.ts`) et, plus tard, par une route HTTP à secret. NE crée AUCUN déclencheur.
 *
 * ⚠️ INVARIANT RÉVISÉ (RELANCE lot 6) — l'ordonnanceur peut désormais écrire à un TIERS (mairie, CADA), mais UNIQUEMENT si
 * l'interrupteur correspondant est EXPLICITEMENT activé (relance_auto_active / saisine_cada_auto_active, défauts false). Choix
 * ASSUMÉ, pas un effet de bord : désactivés, la veille prépare la cascade et n'envoie rien à un tiers ; les seuls e-mails qui
 * partent alors sont INTERNES (alertes, propositions, compte rendu). Hors envoi auto, la seule requête sortante reste le
 * téléchargement Sitadel + la lecture bon marché du millésime.
 *
 * Séquence (cf. étape 4 du chantier) :
 *   1) verrou `pg_try_advisory_lock` dédié — si un run tourne déjà → 'rien_a_faire' immédiat, SANS réseau ni écriture ;
 *   2) (déclencheur 'planifie', sans --forcer) garde `doitSExecuter` (auto_active + intervalle depuis le dernier succès) ;
 *   3) ligne `veille_run` 'en_cours' ;
 *   4) millésime distant par MÉTADONNÉES (bon marché) ; identique à la base et !forcer → 'rien_a_faire', AUCUN téléchargement ;
 *   5) sinon délégation à l'ingestion EXISTANTE (`ingererMillesime`, non réécrite) → compteurs réels ;
 *   6) purge des CSV selon `csv_retention_jours` UNIQUEMENT sur 'succes' (jamais sur 'rien_a_faire' ni 'echec') ;
 *   7) `finally` libère le verrou. Toute erreur est ÉCRITE en base (statut 'echec' + motif) AVANT d'être relancée.
 *
 * Les I/O sont injectables (`DepsVeille`) → concurrence et échec testables sans réseau ni base.
 */
import { readdir, stat } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { pool, query, withTransaction } from '../db/client';
import { chargerConfigVeille } from './veilleConfig';
import { executerReleveAuto, depsReellesReleveAuto } from '../veille/releveAuto';
import { executerApprofondieAuto, depsReellesApprofondie } from '../veille/releveApprofondie';
import { executerRelanceAuto, depsReellesRelance } from '../veille/relanceAuto';
import { executerDiagnosticsVague, depsReellesDiagnosticsVague } from '../veille/diagnosticsVague';
import { executerRelanceReponsePartielle, depsReellesRelanceReponsePartielle } from '../veille/relanceReponsePartielleAuto';
import { executerCascadePartielleAuto, depsReellesCascadePartielleAuto } from '../veille/cascadePartielleAuto';
import { executerAlerteAuto, depsReellesAlerte } from '../veille/alerteAuto';
import { executerPropositionAuto, depsReellesProposition } from '../veille/propositionAuto';
import { executerPreparationSaisinePartielle, depsReellesPreparationSaisinePartielle } from '../veille/preparerSaisinePartielleAuto';
import { executerAlerteGedAuto, depsReellesAlerteGed } from '../veille/alerteGedAuto';
import { executerAlerteLienPeremption, depsReellesAlerteLienPeremption } from '../veille/alerteLienPeremptionAuto';
import { executerAlerteActionAuto, depsReellesAlerteAction } from '../veille/alerteActionAuto';
import { executerPreCochageAuto, depsReellesPreCochage } from '../veille/preCochageReponduAuto';
import { executerCaptureSortantsAuto, depsReellesCaptureSortants } from '../veille/captureSortantsAuto';
import { executerEnvoiAuto, depsReellesEnvoiAuto } from '../veille/envoiAuto';
import { executerDetection } from '../veille/detectionSources';
import { depsReellesDetection } from '../veille/detectionRepo';
import { executerIngestionAuto } from '../veille/ingestionAuto';
import { depsReellesIngestionAuto } from '../veille/ingestionAutoRepo';
import { executerSuiviRattachementAuto, depsReellesSuiviRattachementAuto } from '../veille/suiviRattachementAuto';
import { executerAlerteAttenteBati, depsReellesAlerteAttenteBati } from '../veille/alerteAttenteBatiAuto';
import { executerAlerteObstacleDisparu, depsReellesAlerteObstacleDisparu } from '../veille/alerteObstacleDisparuAuto';
import { executerSurveillancePolygones, depsReellesSurveillancePolygones } from '../veille/surveillancePolygonesAuto';
import { executerVersementRattache, depsReellesVersementRattache } from './versementRattacheRepo';
import { creerBudgetRun, type BudgetEnvoiRun } from '../veille/plafondEnvoiRun';
import { executerAlerteMisesAJour } from '../veille/alerteMisesAJour';
import { depsReellesAlerteMisesAJour } from '../veille/alerteMisesAJourRepo';
import { ingererMillesime, millesimeDistantDido, DiDoIndisponibleError, DOSSIER_LOCAL, type CompteursIngestion, type MillesimeDistant } from './ingestionMillesime';
import {
  doitSExecuter, millesimeEstNouveau, fichiersCsvAPurger,
  type Declencheur, type StatutRun, type ConfigAuto, type RunVeille, type FichierCsv,
} from './planification';

/** Clé du verrou consultatif dédié à la veille Sitadel (constante fixe : un seul run à la fois, tous déclencheurs confondus). */
const CLE_VERROU = 776_920_011;

/**
 * FAMILLE de veille (H1) — deux métiers dans le même moteur : « mairies » (permis / relances / saisines / relève / échéances +
 * cœur Sitadel) et « donnees » (détection d'éditions, ingestion auto, alerte e-mail des sources). `famille` filtre les étapes.
 * OMISE → TOUT (comportement historique, strictement inchangé). La classification de CHAQUE étape est portée EXPLICITEMENT au
 * point d'appel (garde `faitMairies` / `faitDonnees`), jamais déduite de sa position — une insertion future ne change pas de camp.
 */
export type FamilleVeille = 'mairies' | 'donnees';
export interface OptionsVeille { declencheur: Declencheur; forcer?: boolean; famille?: FamilleVeille }

/**
 * Lit `--famille=<valeur>` dans les arguments CLI. Absent → undefined (TOUT, comportement historique). Valeur inconnue (ou vide)
 * → LÈVE : JAMAIS un repli silencieux sur « tout » — un repli ferait croire à une passe « donnees » alors qu'elle enverrait du
 * courrier mairie. PUR (testable sans exécuter le CLI).
 */
export function parserFamille(args: string[]): FamilleVeille | undefined {
  const arg = args.find((a) => a.startsWith('--famille'));
  if (arg === undefined) return undefined;
  const valeur = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : '';
  if (valeur === 'mairies' || valeur === 'donnees') return valeur;
  throw new Error(`--famille invalide : « ${valeur || '(vide)'} ». Valeurs acceptées : mairies | donnees. (Omettre --famille lance TOUT.)`);
}
export interface ResultatVeille { statut: StatutRun; raison: string; runId: number | null; compteurs?: CompteursIngestion }

interface MajRun {
  statut: StatutRun;
  finiLe?: Date;
  millesimeDetecte?: string | null;
  millesimeIngere?: string | null;
  lignesLues?: number | null;
  dossiersRetenus?: number | null;
  dossiersNouveaux?: number | null;
  message?: string | null;
  erreur?: string | null;
}

/** Toutes les I/O du moteur, injectables pour les tests (concurrence / échec sans réseau ni base). */
export interface DepsVeille {
  maintenant(): Date;
  chargerConfig(): Promise<ConfigAuto & { csvRetentionJours: number }>;
  dernierSucces(): Promise<Date | null>;
  millesimeEnBase(): Promise<string | null>;
  acquerirVerrou(): Promise<boolean>;
  libererVerrou(): Promise<void>;
  insererRun(declencheur: Declencheur, demarreLe: Date): Promise<number>;
  finaliserRun(id: number, maj: MajRun): Promise<void>;
  millesimeDistant(): Promise<MillesimeDistant>;
  ingerer(millesime: string): Promise<CompteursIngestion>;
  listerCsv(): Promise<FichierCsv[]>;
  supprimerFichiers(chemins: string[]): Promise<void>;
  // R7 — relève automatique des réponses CRPA, tentée à chaque tick sous le MÊME verrou. OPTIONNELLE (les tests qui
  //   n'éprouvent pas la relève l'omettent) et ISOLÉE : voir son appel (§1bis) — un échec ici ne touche jamais la veille.
  releveAuto?(): Promise<unknown>;
  // R6 — relève APPROFONDIE des demandes dont l'échéance est proche/dépassée (après la relève courante). OPTIONNELLE et
  //   ISOLÉE de la même façon (§1ter) : un échec ne touche jamais la veille Sitadel.
  echeanceApprofondie?(): Promise<unknown>;
  // PART-C — DIAGNOSTICS DE VAGUE (après les relèves, §1ter-bis). OPTIONNEL et ISOLÉ : pour un dossier partiel dont la GED a
  //   changé et dont la vague est close (relève AUTO → calme du dernier mail), lance UN diagnostic de complétude. Aucun envoi.
  diagnosticVague?(): Promise<unknown>;
  // PART-E — BOUCLE de relance « réponse partielle » (après le diagnostic de vague, §1ter-ter). OPTIONNELLE et ISOLÉE. Mode AUTO
  //   (relance_auto_active) → envoie la relance adaptée sous calme + fenêtre + cap par run ; mode MANUEL → rien (pastille Analyse).
  relanceReponsePartielle?(): Promise<unknown>;
  // AUTO-PARTIEL — ENVOI AUTOMATIQUE de la cascade PARTIELLE (CASC-3 : relances 1..N, annonce CADA) aux dates dérivées de partiel_le.
  //   OPTIONNELLE et ISOLÉE, comme PART-E. Gated par cascade_partiel_auto_active (défaut ON). Anti-doublon par réservation de créneau.
  cascadePartielleAuto?(): Promise<unknown>;
  // R6b — génération des BROUILLONS de relance pour les demandes à l'échéance dépassée (après l'approfondie). OPTIONNELLE et
  //   ISOLÉE (§1quater) : aucun envoi, un échec ne touche jamais la veille Sitadel.
  relanceEcheance?(): Promise<unknown>;
  // R8 — ALERTE e-mail quotidienne (après les relances). OPTIONNELLE et ISOLÉE (§1quinquies) : un échec d'envoi ne touche
  //   jamais la veille ni la relève.
  alerteQuotidienne?(): Promise<unknown>;
  // X5 — PROPOSITIONS de saisine CADA par e-mail (après l'alerte). OPTIONNELLE et ISOLÉE (§1sexies) : un échec d'envoi ne
  //   touche jamais la veille ni la relève. E-mail INTERNE uniquement (jamais la mairie ni la CADA) : la proposition demande un
  //   avis AVANT toute saisine ; l'envoi à un tiers, lui, passe par l'étape d'envoi automatique (§1decies), sous interrupteur.
  propositionCada?(): Promise<unknown>;
  // PART-F — PRÉPARATION AUTO de la saisine CADA sur dossier partiel (avant la proposition X5, §1sexies-part). OPTIONNELLE et
  //   ISOLÉE : prépare le BROUILLON (creerSaisineCada 'auto') quand le butoir est atteint. AUCUN envoi (saisine_cada_auto_active gère l'envoi).
  preparerSaisinePartielle?(): Promise<unknown>;
  // G1 — ALERTES « contenu à classer/télécharger en GED » (après les propositions, §1septies). OPTIONNELLE et ISOLÉE : un
  //   échec n'impacte jamais la veille ni la relève. E-mail interne à l'exploitant ; on ne suit JAMAIS un lien de mairie.
  alerteGed?(): Promise<unknown>;
  // PART-D — ALERTE « lien de téléchargement bientôt périmé » à Arno (après l'alerte GED, §1septies-lien). OPTIONNELLE et ISOLÉE.
  //   E-mail groupé, une seule fois par lien, fenêtre ouvrée ; jamais vers une mairie, aucun interrupteur de relance.
  alerteLienPeremption?(): Promise<unknown>;
  // T7-B — ALERTES « ce message de mairie appelle une réponse » (cas ③, après les alertes GED, §1octies). OPTIONNELLE et
  //   ISOLÉE. Grain message (nature=autre, ancre nature_classee_le) ; idempotence par alerte_action_le. E-mail interne.
  alerteAction?(): Promise<unknown>;
  // T7-C — PRÉ-COCHAGE automatique de « répondu » (après l'alerte action, §1nonies). OPTIONNEL et ISOLÉ. LECTURE STRICTE du
  //   dossier envoyés (en-têtes seuls) ; ancre anti-résurrection repondu_auto_le. N'écrit jamais demande.statut.
  preCochageRepondu?(): Promise<unknown>;
  // FIL-C — CAPTURE des réponses envoyées HORS OUTIL (après le pré-cochage, §1nonies-bis). OPTIONNELLE et ISOLÉE. Passe sœur de
  //   T7-C ; dérogation « en-têtes seuls » bornée aux sortants appariés ; stocke dans demande_sortant_hors_outil (dédié). Repli
  //   propre si migration 176 absente. N'écrit jamais demande.statut ni dans demande_reponse.
  captureSortants?(): Promise<unknown>;
  // RELANCE lot 6 — ENVOI AUTOMATIQUE aux mairies / à la CADA (après le pré-cochage, §1decies). OPTIONNEL et ISOLÉ. ⚠️ SEUL
  //   point où l'ordonnanceur écrit à un TIERS, et UNIQUEMENT sous interrupteur explicite (relance_auto_active /
  //   saisine_cada_auto_active, défauts false). Désactivés → rien ne part à un tiers. APPELLE envoyerRelances/envoyerSaisinesCada
  //   (gardes intactes) ; compte rendu interne à alerte_email. Un échec ne touche jamais la veille ni la relève.
  envoiAuto?(): Promise<unknown>;
  // FRAÎCHEUR lot 2 — DÉTECTION des nouvelles publications (métadonnées seules, JAMAIS de donnée), après l'envoi auto
  //   (§1undecies). OPTIONNELLE et ISOLÉE : un échec de détection ne touche jamais la veille ni la relève. Respecte son
  //   propre interrupteur global + sa cadence + l'activation par source, à l'intérieur (executerDetection).
  detecterEditions?(): Promise<unknown>;
  // FRAÎCHEUR lot 6 — INGESTION AUTOMATIQUE nocturne (métadonnées → téléchargement → ingestion), après la détection (§1duodecies).
  //   OPTIONNELLE et ISOLÉE. ⚠️ Le SEUL point qui EXÉCUTE une ingestion, et UNIQUEMENT sous interrupteur par source (défaut false),
  //   en fenêtre nocturne, avec garde-fou disque. Un échec ne touche jamais la veille ni la relève.
  ingestionAuto?(): Promise<unknown>;
  // FRAÎCHEUR lot 4 (G4) — ALERTE e-mail « bases prêtes à être mises à jour », APRÈS la détection ET l'ingestion (§1terdecies) :
  //   sinon elle alerterait sur un état périmé du tick. OPTIONNELLE et ISOLÉE. ⚠️ Envoie réellement, mais UNIQUEMENT sous
  //   interrupteur dédié (alerte_maj_active, défaut false) et seulement quand une NOUVELLE source apparaît (anti-spam par
  //   empreinte). Un échec d'envoi ne touche jamais la veille ni la relève.
  alerteMisesAJour?(): Promise<unknown>;
  // RATT-AUTO — REJEU AUTOMATIQUE du suivi de rattachement (§1duodecies-bis), JUSTE APRÈS l'ingestion nocturne : une nouvelle
  //   édition BD TOPO est aussitôt suivie d'une re-détection, dans le même passage. SCOPÉ aux `en_attente_bati`. OPTIONNELLE et
  //   ISOLÉE : un échec ne touche jamais la veille ni la relève. Interrupteur `rattachement_suivi_auto_active` (défaut false)
  //   lu DANS la brique. N'injecte aucune altitude ; l'emprise reconstituée n'entre jamais dans la détection.
  suiviRattachementAuto?(): Promise<unknown>;
  // ATT-BATI — RAPPEL e-mail « un permis attend le bâti depuis trop longtemps » (§1septies-bis). OPTIONNELLE et ISOLÉE. Se
  //   déclenche INDÉPENDAMMENT de RATT-AUTO (elle est justement le filet quand celui-ci tourne à vide ou tombe). Interrupteur
  //   dédié `attente_bati_alerte_active` (défaut false) + seuil. Un rappel par dossier (marqueur). Lit l'état/ancienneté SEULEMENT.
  alerteAttenteBati?(): Promise<unknown>;
  // ALERTE obstacle disparu — RAPPEL e-mail « un bâtiment qui fondait un certificat a disparu de BD TOPO » (§1quaterdecies).
  //   OPTIONNELLE et ISOLÉE. Croise les certificats émis (cleabs d'obstacle capturé) avec le bâti COURANT. NE recertifie JAMAIS,
  //   n'écrit sur aucun certificat, ne touche NI le moteur NI le verdict. Interrupteur `obstacle_disparu_alerte_active` (défaut false).
  alerteObstacleDisparu?(): Promise<unknown>;
  // SURVEILLANCE des polygones après validation (SURV-1) — RAPPEL e-mail « les polygones d'un permis validé ont bougé » (§1quindecies).
  //   OPTIONNELLE et ISOLÉE. Compare le bâti courant à la référence figée à la validation (permis_gel « validation »). N'invalide RIEN
  //   (la validation reste active), n'écrit sur aucun certificat, ne touche NI le moteur NI le verdict. Latente tant qu'aucun validé.
  surveillancePolygones?(): Promise<unknown>;
  // VERSEMENT rattaché (PART-1) — verse en GED les pièces des réponses « documents » rattachées (2e voie d'admission), hors signature
  //   citée et sans doublon. OPTIONNELLE et ISOLÉE. Idempotent. N'écrit sur aucun certificat, ne touche NI le moteur NI le verdict.
  versementRattache?(): Promise<unknown>;
}

/** Date de publication en français lisible (Europe/Paris), ex. « 28 août 2026 » — pour les messages « publié le … ». */
function publicationLisible(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }).format(d);
}

export async function executerVeille(opts: OptionsVeille, deps: DepsVeille = depsReelles()): Promise<ResultatVeille> {
  const forcer = opts.forcer ?? false;

  // 1) Verrou : un run déjà en cours → sortie immédiate, sans réseau ni écriture.
  if (!(await deps.acquerirVerrou())) {
    return { statut: 'rien_a_faire', raison: 'un run est déjà en cours (verrou pris) — sortie sans action', runId: null };
  }

  let runId: number | null = null;
  let detecte: string | null = null; // millésime distant détecté (pour le message si la ceinture d'indisponibilité se déclenche)
  try {
    // H1 — GARDE PAR FAMILLE. `famille` omise → les deux true (comportement historique). Chaque étape ci-dessous porte SA famille
    //   explicitement dans son `if` (jamais déduite d'un numéro d'ordre) : (A) mairies = faitMairies, (B) données = faitDonnees.
    const faitMairies = opts.famille === undefined || opts.famille === 'mairies';
    const faitDonnees = opts.famille === undefined || opts.famille === 'donnees';

    // 1bis) RELÈVE AUTOMATIQUE des réponses CRPA (R7) — sous le MÊME verrou, à CHAQUE tick, AVANT la garde d'intervalle
    //   Sitadel (§2) et le contrôle de millésime (§4) : la relève doit tourner même quand la veille Sitadel n'a « rien à
    //   faire ». ISOLÉE À DOUBLE FILET : un échec de relève ne DOIT JAMAIS faire échouer la veille → try/catch qui avale
    //   ici (executerReleveAuto journalise déjà son propre « erreur » sans relancer). N'affecte ni le verrou, ni le run
    //   Sitadel, ni son statut ; la séquence Sitadel continue exactement comme si de rien n'était.
    if (faitMairies && deps.releveAuto) {
      try { await deps.releveAuto(); } catch { /* relève isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1ter) RELÈVE APPROFONDIE (R6) — APRÈS la relève courante (qui vient, si elle a réussi, de rafraîchir la fraîcheur) :
    //   pour les demandes dont l'échéance d'un mois est proche/dépassée, on regarde dans TOUS les dossiers (indésirables
    //   compris) « pour être sûr de ne pas avoir loupé le mail ». Garde 1/jour/demande à l'intérieur. MÊME ISOLATION à
    //   double filet que §1bis : un échec n'impacte jamais la veille Sitadel.
    if (faitMairies && deps.echeanceApprofondie) {
      try { await deps.echeanceApprofondie(); } catch { /* approfondie isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1ter-bis) DIAGNOSTICS DE VAGUE (PART-C) — APRÈS les relèves (qui viennent de verser en GED les pièces reçues) : pour chaque
    //   dossier PARTIEL dont la GED a changé, si la VAGUE est close (dernier mail de la mairie calme depuis N minutes — relève
    //   AUTO ici), on lance UN SEUL diagnostic de complétude (qui peut lever le marqueur partiel). Jamais un diagnostic par mail.
    //   MÊME ISOLATION à double filet : un échec n'impacte jamais la veille Sitadel. AUCUN envoi (le diagnostic ne réclame rien).
    if (faitMairies && deps.diagnosticVague) {
      try { await deps.diagnosticVague(); } catch { /* diagnostics de vague isolés : n'impactent jamais la veille Sitadel */ }
    }

    // 1ter-bis) AUTO-PARTIEL — ENVOI AUTOMATIQUE de la cascade PARTIELLE (relances 1..N, annonce CADA) aux dates dérivées de partiel_le.
    //   ⚠️ ORDRE VOLONTAIRE — la cascade passe AVANT PART-E (§1ter-ter) : décision Arno du 31/08, la cascade GAGNE en cas de conflit
    //   (elle porte l'échéance légale et le rang). Son envoi journalise un sortant → l'idempotence propre de PART-E le supersède ensuite
    //   pour la même réponse (une seule relance à la mairie) ; le PLAFOND ANTI-CUMUL (budget partagé du run, cf. depsReelles) est le filet
    //   EXPLICITE. Anti-doublon par réservation de créneau (auto ⇄ manuel) ; gated par cascade_partiel_auto_active. MÊME ISOLATION.
    if (faitMairies && deps.cascadePartielleAuto) {
      try { await deps.cascadePartielleAuto(); } catch { /* cascade partielle auto isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1ter-ter) BOUCLE DE RELANCE « la mairie a répondu partiellement » (PART-E) — APRÈS la cascade partielle (ordre ci-dessus) :
    //   pour chaque dossier partiel encore INCOMPLET dont la mairie a répondu depuis le dernier sortant, envoie (mode AUTO,
    //   relance_auto_active) la relance adaptée, sous délai de calme (vagueCloseeEnvoi), fenêtre ouvrée, cap par run ET plafond
    //   anti-cumul par demande/run ; mode MANUEL → rien ici (pastille Analyse). Échange de suivi : PAS de plafond quotidien. MÊME ISOLATION.
    if (faitMairies && deps.relanceReponsePartielle) {
      try { await deps.relanceReponsePartielle(); } catch { /* boucle partielle isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1quater) BROUILLONS DE RELANCE (R6b) — APRÈS l'approfondie (qui vient de regarder au mieux) : pour les demandes dont
    //   l'échéance d'un mois est DÉPASSÉE et sans relance vivante, on PRÉPARE un texte de relance (aucun envoi). MÊME
    //   ISOLATION que §1bis/§1ter : un échec n'impacte jamais la veille Sitadel.
    if (faitMairies && deps.relanceEcheance) {
      try { await deps.relanceEcheance(); } catch { /* relance isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1quinquies) ALERTE e-mail quotidienne (R8) — APRÈS les relances : un seul récapitulatif par jour, uniquement s'il y a
    //   quelque chose à dire. MÊME ISOLATION : un échec d'envoi n'impacte jamais la veille ni la relève.
    if (faitMairies && deps.alerteQuotidienne) {
      try { await deps.alerteQuotidienne(); } catch { /* alerte isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1sexies-part) PRÉPARATION AUTO de la saisine CADA sur DOSSIER PARTIEL (PART-F) — AVANT la proposition X5 : pour une demande
    //   partielle dont le butoir CASC-2 est ATTEINT, on PRÉPARE la saisine en BROUILLON (jamais d'envoi ; l'envoi reste sous
    //   saisine_cada_auto_active). Le brouillon crée une saisine vivante → la demande n'est plus « saisissable » → la proposition X5
    //   ci-dessous ne la double pas ; elle est signalée par la pastille « Saisines CADA ». MÊME ISOLATION : un échec n'impacte rien.
    if (faitMairies && deps.preparerSaisinePartielle) {
      try { await deps.preparerSaisinePartielle(); } catch { /* préparation isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1sexies) PROPOSITIONS de saisine CADA (X5) — DERNIÈRE étape auto, APRÈS l'alerte : pour chaque demande devenue
    //   saisissable et jamais encore proposée, un e-mail interne (à l'adresse d'alerte) avec le détail + un lien de
    //   confirmation. MÊME ISOLATION à double filet : un échec d'envoi n'impacte jamais la veille ni la relève. AUCUN envoi
    //   vers une mairie ou la CADA (invariant executerVeille).
    if (faitMairies && deps.propositionCada) {
      try { await deps.propositionCada(); } catch { /* proposition isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1septies) ALERTES « contenu à classer/télécharger en GED » (G1) — DERNIÈRE étape auto : pour chaque réponse porteuse de
    //   pièces et/ou d'un lien dont le contenu n'est pas encore en GED, un compte à rebours (J-3 puis 24 h) envoie le mail de
    //   mairie forwardé à l'exploitant. Idempotence par (réponse × permis × type). MÊME ISOLATION : un échec n'impacte rien.
    if (faitMairies && deps.alerteGed) {
      try { await deps.alerteGed(); } catch { /* alerte GED isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1septies-lien) ALERTE « lien de téléchargement bientôt périmé » (PART-D) — pour chaque lien fort en attente (GED vide) ayant
    //   atteint le seuil : UN e-mail groupé à Arno (jamais à une mairie ; aucun interrupteur de relance), une seule fois par lien,
    //   dans la fenêtre d'envoi ouvrée. MÊME ISOLATION : un échec n'impacte jamais la veille ni la relève.
    if (faitMairies && deps.alerteLienPeremption) {
      try { await deps.alerteLienPeremption(); } catch { /* alerte lien isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1septies-bis) RAPPEL « un permis attend le bâti depuis trop longtemps » (ATT-BATI) — un simple FILET, INDÉPENDANT de
    //   RATT-AUTO : il alerte même quand le rejeu automatique tourne (son rôle est de couvrir le cas où celui-ci tourne à vide
    //   trop longtemps ou tombe). Un rappel par dossier au-delà du seuil (marqueur anti-doublon). Ne lit QUE l'état/l'ancienneté.
    //   MÊME ISOLATION : un échec n'impacte jamais la veille ni la relève.
    if (faitMairies && deps.alerteAttenteBati) {
      try { await deps.alerteAttenteBati(); } catch { /* rappel « attente bâti » isolé : n'impacte jamais la veille Sitadel */ }
    }

    // 1octies) ALERTES « ce message de mairie appelle une réponse » (T7-B, cas ③) — APRÈS les alertes GED : pour chaque message
    //   de nature `autre` ANCRÉ (nature_classee_le IS NOT NULL, jamais un rétro-classé) et jamais encore alerté, on forwarde le
    //   mail de mairie à l'exploitant pour qu'il y réponde. Idempotence par message (alerte_action_le). MÊME ISOLATION : un
    //   échec n'impacte rien. On ne suit JAMAIS un lien ; aucune bascule statut/satisfait_le/Archives.
    if (faitMairies && deps.alerteAction) {
      try { await deps.alerteAction(); } catch { /* alerte action isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1nonies) PRÉ-COCHAGE automatique de « répondu » (T7-C) — APRÈS l'alerte action : on lit le dossier ENVOYÉS (en-têtes seuls,
    //   lecture stricte) pour cocher les messages `autre` auxquels le fondateur a déjà répondu. Ancre anti-résurrection
    //   (repondu_auto_le). MÊME ISOLATION : un échec n'impacte rien. Ne remplace jamais le bouton manuel ; jamais demande.statut.
    if (faitMairies && deps.preCochageRepondu) {
      try { await deps.preCochageRepondu(); } catch { /* pré-cochage isolé : n'impacte jamais la veille Sitadel */ }
    }

    // 1nonies-bis) CAPTURE des réponses envoyées HORS OUTIL (FIL-C) — passe SŒUR de T7-C, MÊME verrou, JUSTE APRÈS. Lit le dossier
    //   ENVOYÉS (⚠️ dérogation assumée : CORPS des sortants APPARIÉS à un fil suivi) et stocke les réponses d'Arno dans la table
    //   DÉDIÉE demande_sortant_hors_outil, pour compléter le fil. NE MODIFIE PAS le pré-cochage. MÊME ISOLATION : un échec n'impacte
    //   rien. Migration 176 absente OU aucun fil → aucune connexion IMAP (repli propre).
    if (faitMairies && deps.captureSortants) {
      try { await deps.captureSortants(); } catch { /* capture isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1decies) ENVOI AUTOMATIQUE aux mairies / à la CADA (RELANCE lot 6) — DERNIÈRE étape auto, APRÈS que la cascade a préparé
    //   ses brouillons (§1quater) : si relance_auto_active, les relances dont la variante correspond à la fenêtre du JOUR
    //   partent (la garde d'obsolescence du lot 3 s'applique telle quelle) ; si saisine_cada_auto_active, la saisine part
    //   (ou va en file de dépôt si cada_email est vide). Interrupteurs à false (défaut) → rien ne part à un tiers. MÊME
    //   ISOLATION à double filet : un échec d'envoi n'impacte jamais la veille ni la relève ; les deux étapes sont isolées l'une
    //   de l'autre (dans executerEnvoiAuto). Un compte rendu INTERNE (alerte_email) récapitule tout envoi effectué.
    if (faitMairies && deps.envoiAuto) {
      try { await deps.envoiAuto(); } catch { /* envoi auto isolé : n'impacte jamais la veille Sitadel */ }
    }

    // 1undecies) DÉTECTION des nouvelles publications (FRAÎCHEUR lot 2) — DERNIÈRE étape auto : interroge les MÉTADONNÉES
    //   (index de diffusion IGN, listing cadastre, en-tête DILA, page annuaire PRADA), quelques Ko chacune, JAMAIS de
    //   téléchargement de donnée (lot 3). MÊME ISOLATION à double filet : un échec de détection n'impacte jamais la veille
    //   ni la relève. Interrupteur global + cadence + activation par source sont gérés DANS executerDetection.
    if (faitDonnees && deps.detecterEditions) {
      try { await deps.detecterEditions(); } catch { /* détection isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1duodecies) INGESTION AUTOMATIQUE nocturne (FRAÎCHEUR lot 6) — APRÈS la détection (qui vient de rafraîchir « mise à jour
    //   disponible ») : si un interrupteur de source est activé ET qu'on est dans la fenêtre nocturne ET que le disque a la marge,
    //   UNE ingestion part (une par tick, une tentative par source et par nuit). Défauts tout-false → rien. MÊME ISOLATION à
    //   double filet : un échec d'ingestion n'impacte jamais la veille ni la relève.
    if (faitDonnees && deps.ingestionAuto) {
      try { await deps.ingestionAuto(); } catch { /* ingestion auto isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1duodecies-bis) REJEU AUTOMATIQUE du suivi de rattachement (RATT-AUTO) — JUSTE APRÈS l'ingestion nocturne : si une édition
    //   BD TOPO vient d'être ingérée, on rejoue AUSSITÔT le suivi des permis `en_attente_bati` pour que le bâti neuf éventuel les
    //   fasse basculer en `arbitrage_demande` dans le MÊME passage. SCOPÉ à ces dossiers (jamais tout l'univers). Interrupteur
    //   `rattachement_suivi_auto_active` (défaut false) lu dans la brique. MÊME ISOLATION : un échec n'impacte jamais la veille.
    if (faitDonnees && deps.suiviRattachementAuto) {
      try { await deps.suiviRattachementAuto(); } catch { /* rejeu suivi isolé : n'impacte jamais la veille Sitadel */ }
    }

    // 1terdecies) ALERTE e-mail « bases prêtes à être mises à jour » (FRAÎCHEUR lot 4 / G4) — DERNIÈRE étape auto, APRÈS la
    //   détection (§1undecies) et l'ingestion nocturne (§1duodecies) : le jeu en attente est ainsi le plus frais du tick. Envoie
    //   un e-mail SEULEMENT si une nouvelle source apparaît (anti-spam par empreinte) ET sous l'interrupteur dédié (défaut off).
    //   MÊME ISOLATION à double filet : un échec d'envoi n'impacte jamais la veille ni la relève.
    if (faitDonnees && deps.alerteMisesAJour) {
      try { await deps.alerteMisesAJour(); } catch { /* alerte isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1quaterdecies) ALERTE « un bâtiment qui fondait un certificat a disparu » (à revérifier) — APRÈS la détection/ingestion des
    //   éditions BD TOPO : on croise les certificats émis (cleabs d'obstacle capturé) avec le bâti COURANT. SIGNAL seulement (jamais
    //   de recertification, aucune écriture de certificat). Un rappel par certificat (marqueur anti-doublon). MÊME ISOLATION.
    if (faitDonnees && deps.alerteObstacleDisparu) {
      try { await deps.alerteObstacleDisparu(); } catch { /* alerte obstacle disparu isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1quindecies) SURVEILLANCE des polygones APRÈS validation (SURV-1) — APRÈS l'ingestion d'une nouvelle édition BD TOPO : pour les
    //   rattachements VALIDÉS encore en fenêtre, on compare le bâti courant à la référence figée à la validation et on ALERTE si un
    //   polygone apparaît / disparaît / change de contour. SIGNAL seulement (n'invalide RIEN). Latente tant qu'aucun dossier n'est
    //   validé (0 aujourd'hui) → coût nul. MÊME ISOLATION à double filet : un échec n'impacte jamais la veille.
    if (faitDonnees && deps.surveillancePolygones) {
      try { await deps.surveillancePolygones(); } catch { /* surveillance isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1sexdecies) VERSEMENT en GED des pièces d'une réponse RATTACHÉE (PART-1) — 2e voie d'admission (le rattachement, pas
    //   l'expéditeur). Passe ISOLÉE et IDEMPOTENTE : verse les pièces des réponses « documents » rattachées, hors signature citée
    //   et sans doublon. MÊME ISOLATION : un échec n'impacte jamais la veille. Latente quand tout est déjà versé.
    if (faitDonnees && deps.versementRattache) {
      try { await deps.versementRattache(); } catch { /* versement isolé : n'impacte jamais la veille Sitadel */ }
    }

    // Le CŒUR SITADEL (§2-7 : garde d'intervalle, run journal, millésime distant, ingestion, purge) appartient à la famille
    // MAIRIES/PERMIS (classé C→A en H0 : Sitadel = la donnée des permis qui nourrit la veille mairies). Famille « donnees » →
    // on s'arrête ici, cœur non exécuté (aucun contact DiDo, aucun run journalisé). Le verrou est libéré par le `finally`.
    if (!faitMairies) {
      return { statut: 'rien_a_faire', raison: 'famille « donnees » : étapes sources exécutées, cœur Sitadel (mairies) non exécuté', runId: null };
    }

    const config = await deps.chargerConfig();

    // 2) Garde d'automatisation pour les runs PLANIFIÉS (les 'manuel'/'api' et --forcer passent outre). Le drapeau de
    //    demande manuelle est prioritaire (cf. doitSExecuter) : s'il est posé, le run devient 'manuel'.
    let declencheur = opts.declencheur;
    if (opts.declencheur === 'planifie' && !forcer) {
      const decision = doitSExecuter(await deps.dernierSucces(), deps.maintenant(), config);
      if (!decision.executer) return { statut: 'rien_a_faire', raison: decision.raison, runId: null };
      declencheur = decision.declencheur; // 'manuel' si demande en attente, sinon 'planifie'
    }

    // 3) Ligne 'en_cours' + REMISE À NULL du drapeau, dans la MÊME transaction (un plantage ne doit pas laisser une
    //    demande manuelle qui se rejoue indéfiniment).
    runId = await deps.insererRun(declencheur, deps.maintenant());

    // 4) Millésime distant (bon marché) vs base. ⚠️ Si l'appel DiDo échoue (réseau/format/champ absent), l'exception
    //    remonte au catch → statut 'echec' : SURTOUT PAS de repli vers l'ingestion complète « au cas où ». Un moteur qui,
    //    en panne réseau, lance le travail lourd (880 Mo + UPSERT) serait dangereux (re-téléchargements en boucle).
    const distant = await deps.millesimeDistant();
    detecte = distant.millesime;
    const nouveau = millesimeEstNouveau(await deps.millesimeEnBase(), distant.millesime);
    if (!nouveau.nouveau && !forcer) {
      await deps.finaliserRun(runId, { statut: 'rien_a_faire', finiLe: deps.maintenant(), millesimeDetecte: distant.millesime, message: nouveau.raison });
      return { statut: 'rien_a_faire', raison: nouveau.raison, runId };
    }

    // 4bis) MILLÉSIME ANNONCÉ MAIS PAS ENCORE PUBLIÉ : DiDo publie ses métadonnées AVANT les CSV. Si la date de publication
    //   (`published`) est dans le FUTUR, il n'y a rien à télécharger → « rien_a_faire », pas une panne. (Si `publieLe` est absent,
    //   on ne sait pas : on tente comme avant, la ceinture du téléchargement rattrapera un 400 daté.)
    if (distant.publieLe !== null && distant.publieLe.getTime() > deps.maintenant().getTime()) {
      const message = `millésime ${distant.millesime} annoncé, publié le ${publicationLisible(distant.publieLe)} — rien à faire d'ici là`;
      await deps.finaliserRun(runId, { statut: 'rien_a_faire', finiLe: deps.maintenant(), millesimeDetecte: distant.millesime, message });
      return { statut: 'rien_a_faire', raison: message, runId };
    }

    // 5) Ingestion du millésime DÉTECTÉ (non plus une constante figée) → compteurs réels ; base = distant après succès.
    const c = await deps.ingerer(distant.millesime);

    // 6) Purge des CSV — UNIQUEMENT ici (chemin de succès) et JAMAIS le millésime qu'on vient d'ingérer (= le cache
    //    courant, ce qui rend le prochain re-run gratuit). Ne vise que les millésimes ANTÉRIEURS au-delà de la rétention.
    const aPurger = fichiersCsvAPurger(await deps.listerCsv(), deps.maintenant(), config.csvRetentionJours, c.millesime);
    if (aPurger.length > 0) await deps.supprimerFichiers(aPurger);

    const message = `millésime ${c.millesime} ingéré : ${c.lignesLues} lues, ${c.dossiersRetenus} retenus, ${c.dossiersNouveaux} nouveaux`
      + (aPurger.length > 0 ? ` · ${aPurger.length} CSV purgé(s)` : ` · CSV conservés (rétention ${config.csvRetentionJours} j)`);
    await deps.finaliserRun(runId, {
      statut: 'succes', finiLe: deps.maintenant(), millesimeDetecte: distant.millesime, millesimeIngere: c.millesime,
      lignesLues: c.lignesLues, dossiersRetenus: c.dossiersRetenus, dossiersNouveaux: c.dossiersNouveaux, message,
    });
    return { statut: 'succes', raison: message, runId, compteurs: c };
  } catch (e) {
    // CEINTURE : un « pas encore publié » remonté du téléchargement (DiDoIndisponibleError) est classé « rien_a_faire », JAMAIS
    //   « echec » — toute AUTRE erreur (400 pour une autre raison, troncature, base, parsing, réseau) RESTE un echec.
    if (e instanceof DiDoIndisponibleError && runId !== null) {
      const message = `millésime ${detecte ?? 'à venir'} annoncé, publié le ${publicationLisible(e.disponibleLe)} — rien à faire d'ici là`;
      await deps.finaliserRun(runId, { statut: 'rien_a_faire', finiLe: deps.maintenant(), millesimeDetecte: detecte, message });
      return { statut: 'rien_a_faire', raison: message, runId };
    }
    // Trace lisible AVANT de relancer ; les CSV ne sont PAS purgés (on n'atteint pas l'étape 6).
    const motif = e instanceof Error ? e.message : String(e);
    if (runId !== null) await deps.finaliserRun(runId, { statut: 'echec', finiLe: deps.maintenant(), erreur: motif });
    throw e;
  } finally {
    // 7) Le verrou est TOUJOURS libéré, même sur plantage.
    await deps.libererVerrou();
  }
}

// ── Implémentations RÉELLES (production) ─────────────────────────────────────
function depsReelles(): DepsVeille {
  // Le verrou consultatif est SESSION-scoped : il doit être pris ET rendu sur la MÊME connexion → client dédié tenu
  // pendant tout le run (les autres requêtes passent par le pool).
  let clientVerrou: PoolClient | null = null;
  // PLAFOND ANTI-CUMUL — UN SEUL budget par RUN, PARTAGÉ par tous les émetteurs auto (cascade partielle, PART-E, ordinaire, saisine).
  //   Créé PARESSEUSEMENT au 1er émetteur (une seule lecture config), donc PER-RUN : `depsReelles()` est évalué une fois par run
  //   (défaut du paramètre `deps` d'executerVeille). C'est le « point d'étranglement unique », sans exclusion croisée entre exécuteurs.
  let budgetEnvoi: BudgetEnvoiRun | null = null;
  const obtenirBudgetEnvoi = async (): Promise<BudgetEnvoiRun> => {
    if (budgetEnvoi === null) budgetEnvoi = creerBudgetRun((await chargerConfigVeille()).envoisAutoMaxParDemandeRun);
    return budgetEnvoi;
  };
  return {
    maintenant: () => new Date(),
    chargerConfig: async () => {
      const c = await chargerConfigVeille();
      return { autoActive: c.autoActive, autoIntervalleHeures: c.autoIntervalleHeures, csvRetentionJours: c.csvRetentionJours, runDemandeLe: c.runDemandeLe };
    },
    dernierSucces: async () => {
      const { rows } = await query<{ fini_le: Date | null }>(`SELECT max(fini_le) AS fini_le FROM veille_run WHERE statut = 'succes'`);
      return rows[0]?.fini_le ?? null;
    },
    millesimeEnBase: async () => {
      const { rows } = await query<{ code: string }>(`SELECT code FROM sitadel_millesime ORDER BY code DESC LIMIT 1`);
      return rows[0]?.code ?? null;
    },
    acquerirVerrou: async () => {
      clientVerrou = await pool.connect();
      const { rows } = await clientVerrou.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [CLE_VERROU]);
      if (!rows[0]?.ok) { clientVerrou.release(); clientVerrou = null; return false; }
      return true;
    },
    libererVerrou: async () => {
      if (clientVerrou === null) return;
      try { await clientVerrou.query('SELECT pg_advisory_unlock($1)', [CLE_VERROU]); }
      finally { clientVerrou.release(); clientVerrou = null; }
    },
    insererRun: async (declencheur, demarreLe) => {
      // Transaction ATOMIQUE : consommer le drapeau (run_demande_le → NULL) ET créer la ligne 'en_cours' ensemble, pour
      // qu'un plantage ne laisse jamais une demande manuelle armée qui se rejouerait indéfiniment.
      return withTransaction(async (q) => {
        await q(`UPDATE config_veille SET run_demande_le = NULL WHERE id = 1`);
        const { rows } = await q<{ id: number }>(
          `INSERT INTO veille_run (declencheur, demarre_le, statut) VALUES ($1, $2, 'en_cours') RETURNING id`,
          [declencheur, demarreLe],
        );
        return rows[0].id;
      });
    },
    finaliserRun: async (id, m) => {
      await query(
        `UPDATE veille_run SET statut = $2, fini_le = $3, millesime_detecte = $4, millesime_ingere = $5,
           lignes_lues = $6, dossiers_retenus = $7, dossiers_nouveaux = $8, message = $9, erreur = $10 WHERE id = $1`,
        [id, m.statut, m.finiLe ?? null, m.millesimeDetecte ?? null, m.millesimeIngere ?? null,
          m.lignesLues ?? null, m.dossiersRetenus ?? null, m.dossiersNouveaux ?? null, m.message ?? null, m.erreur ?? null],
      );
    },
    millesimeDistant: () => millesimeDistantDido(),
    ingerer: (millesime) => ingererMillesime(millesime),
    listerCsv: async () => {
      // Tous les CSV du dossier local, TOUS MILLÉSIMES confondus (nom `X.AAAA-MM.csv`) — la purge distinguera ensuite
      // le millésime courant (protégé) des antérieurs.
      let noms: string[];
      try { noms = await readdir(DOSSIER_LOCAL); } catch { return []; }
      const out: FichierCsv[] = [];
      for (const nom of noms) {
        const m = /\.(\d{4}-\d{2})\.csv$/.exec(nom);
        if (!m) continue;
        const chemin = `${DOSSIER_LOCAL}/${nom}`;
        try { const s = await stat(chemin); out.push({ chemin, mtime: s.mtime, millesime: m[1] }); } catch { /* disparu entre-temps → ignoré */ }
      }
      return out;
    },
    supprimerFichiers: async (chemins) => {
      const { rm } = await import('node:fs/promises');
      for (const chemin of chemins) await rm(chemin, { force: true });
    },
    // R7 — relève réelle : orchestrateur pur + ses I/O de production (base + IMAP en lecture stricte). Son propre journal
    //   (releve_run) et son isolation sont dans releveAuto.ts ; ici on se contente de la brancher dans le corps de veille.
    releveAuto: () => executerReleveAuto(depsReellesReleveAuto()),
    // R6 — relève approfondie réelle : sélection par échéance + garde 1/jour + journal, dans releveApprofondie.ts.
    echeanceApprofondie: () => executerApprofondieAuto(depsReellesApprofondie()),
    // PART-C — diagnostics de vague réels (relève AUTO) : dossiers partiels à GED changée + vague close → 1 diagnostic, dans diagnosticsVague.ts.
    diagnosticVague: () => executerDiagnosticsVague('auto', depsReellesDiagnosticsVague()),
    // PART-E — boucle réelle : relance auto « réponse partielle » (mode auto), gardes calme/fenêtre/cap/régime + PLAFOND ANTI-CUMUL (budget partagé).
    relanceReponsePartielle: async () => executerRelanceReponsePartielle(depsReellesRelanceReponsePartielle(await obtenirBudgetEnvoi())),
    cascadePartielleAuto: async () => executerCascadePartielleAuto(depsReellesCascadePartielleAuto(await obtenirBudgetEnvoi())),
    // R6b — brouillons de relance réels : sélection 'depassee' + garde relance vivante + journal, dans relanceAuto.ts.
    relanceEcheance: () => executerRelanceAuto(depsReellesRelance()),
    // R8 — alerte quotidienne réelle : conditions + composition + envoi SMTP + journal, dans alerteAuto.ts.
    alerteQuotidienne: () => executerAlerteAuto(depsReellesAlerte()),
    // X5 — propositions de saisine CADA réelles : conditions + composition + envoi SMTP interne + trace, dans propositionAuto.ts.
    // PART-F — préparation réelle de la saisine partielle (brouillon 'auto' quand le butoir est atteint), dans preparerSaisinePartielleAuto.ts.
    preparerSaisinePartielle: () => executerPreparationSaisinePartielle(depsReellesPreparationSaisinePartielle()),
    propositionCada: () => executerPropositionAuto(depsReellesProposition()),
    // G1 — alertes GED réelles : candidats (réponse × permis non classé) + compte à rebours J-3/24 h + forward SMTP + journal, dans alerteGedAuto.ts.
    alerteGed: () => executerAlerteGedAuto(depsReellesAlerteGed()),
    // PART-D — alerte réelle « lien bientôt périmé » : liens forts en attente au seuil → e-mail groupé à Arno, idempotent, fenêtre ouvrée.
    alerteLienPeremption: () => executerAlerteLienPeremption(depsReellesAlerteLienPeremption()),
    // T7-B — alertes « ce message appelle une réponse » réelles (cas ③) : candidats `autre` ancrés + forward SMTP + idempotence, dans alerteActionAuto.ts.
    alerteAction: () => executerAlerteActionAuto(depsReellesAlerteAction()),
    // T7-C — pré-cochage « répondu » réel : dossier envoyés (en-têtes seuls) + match fil/destinataire + ancre repondu_auto_le, dans preCochageReponduAuto.ts.
    preCochageRepondu: () => executerPreCochageAuto(depsReellesPreCochage()),
    // FIL-C — capture des réponses hors outil : dossier envoyés (CORPS des sortants appariés) → demande_sortant_hors_outil, dans captureSortantsAuto.ts.
    captureSortants: () => executerCaptureSortantsAuto(depsReellesCaptureSortants()),
    // RELANCE lot 6 — envoi automatique réel : DEUX interrupteurs + plafond auto + PLAFOND ANTI-CUMUL (budget partagé) + appels envoyerRelances/envoyerSaisinesCada (gardes intactes) + compte rendu interne, dans envoiAuto.ts.
    envoiAuto: async () => executerEnvoiAuto(depsReellesEnvoiAuto(await obtenirBudgetEnvoi())),
    // FRAÎCHEUR lot 2 — détection des nouvelles publications (métadonnées seules), interrupteur + cadence + activation par source dans executerDetection.
    detecterEditions: () => executerDetection(depsReellesDetection()),
    // FRAÎCHEUR lot 6 — ingestion automatique nocturne : interrupteurs par source (défaut false), fenêtre nocturne, garde-fou disque, une par tick/nuit.
    ingestionAuto: () => executerIngestionAuto(depsReellesIngestionAuto()),
    // FRAÎCHEUR lot 4 (G4) — alerte e-mail « bases prêtes à mettre à jour » : interrupteur dédié (défaut false), anti-spam par empreinte, isolée.
    alerteMisesAJour: () => executerAlerteMisesAJour(depsReellesAlerteMisesAJour()),
    // RATT-AUTO — rejeu automatique du suivi de rattachement sur les `en_attente_bati` : interrupteur (défaut false), scopé, journalisé, isolé.
    suiviRattachementAuto: () => executerSuiviRattachementAuto(depsReellesSuiviRattachementAuto()),
    // ATT-BATI — rappel e-mail « attente de bâti trop longue » : interrupteur + seuil (défaut false / 365 j), un rappel par dossier, isolé.
    alerteAttenteBati: () => executerAlerteAttenteBati(depsReellesAlerteAttenteBati()),
    // ALERTE obstacle disparu — rappel « à revérifier » : croise certificats × bâti courant, interrupteur (défaut false), un rappel par certificat, isolé.
    alerteObstacleDisparu: () => executerAlerteObstacleDisparu(depsReellesAlerteObstacleDisparu()),
    surveillancePolygones: () => executerSurveillancePolygones(depsReellesSurveillancePolygones()),
    versementRattache: () => executerVersementRattache(depsReellesVersementRattache(), { appliquer: true }),
  };
}

/** Dernier run journalisé (pour l'option `--statut` du CLI et l'écran d'admin). `null` si aucun run. */
export async function dernierRun(): Promise<RunVeille | null> {
  const { rows } = await query<{
    declencheur: string; statut: string; demarre_le: string | null; fini_le: string | null;
    millesime_detecte: string | null; millesime_ingere: string | null; lignes_lues: number | null;
    dossiers_retenus: number | null; dossiers_nouveaux: number | null; message: string | null; erreur: string | null;
  }>(
    `SELECT declencheur, statut, demarre_le::text AS demarre_le, fini_le::text AS fini_le,
            millesime_detecte, millesime_ingere, lignes_lues, dossiers_retenus, dossiers_nouveaux, message, erreur
     FROM veille_run ORDER BY demarre_le DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    declencheur: r.declencheur, statut: r.statut, demarreLe: r.demarre_le, finiLe: r.fini_le,
    millesimeDetecte: r.millesime_detecte, millesimeIngere: r.millesime_ingere, lignesLues: r.lignes_lues,
    dossiersRetenus: r.dossiers_retenus, dossiersNouveaux: r.dossiers_nouveaux, message: r.message, erreur: r.erreur,
  };
}

/** Les `limite` derniers runs (récent → ancien), pour l'historique de l'écran d'administration. */
export async function historiqueRuns(limite: number): Promise<RunVeille[]> {
  const n = Math.max(1, Math.min(200, Math.trunc(limite)));
  const { rows } = await query<{
    declencheur: string; statut: string; demarre_le: string | null; fini_le: string | null;
    millesime_detecte: string | null; millesime_ingere: string | null; lignes_lues: number | null;
    dossiers_retenus: number | null; dossiers_nouveaux: number | null; message: string | null; erreur: string | null;
  }>(
    `SELECT declencheur, statut, demarre_le::text AS demarre_le, fini_le::text AS fini_le,
            millesime_detecte, millesime_ingere, lignes_lues, dossiers_retenus, dossiers_nouveaux, message, erreur
     FROM veille_run ORDER BY demarre_le DESC LIMIT $1`, [n],
  );
  return rows.map((r) => ({
    declencheur: r.declencheur, statut: r.statut, demarreLe: r.demarre_le, finiLe: r.fini_le,
    millesimeDetecte: r.millesime_detecte, millesimeIngere: r.millesime_ingere, lignesLues: r.lignes_lues,
    dossiersRetenus: r.dossiers_retenus, dossiersNouveaux: r.dossiers_nouveaux, message: r.message, erreur: r.erreur,
  }));
}

/** Date (fini_le) du dernier run RÉUSSI — pour calculer le prochain passage. `null` si aucun succès. */
export async function dernierSuccesLe(): Promise<Date | null> {
  const { rows } = await query<{ fini_le: Date | null }>(`SELECT max(fini_le) AS fini_le FROM veille_run WHERE statut = 'succes'`);
  return rows[0]?.fini_le ?? null;
}

/** Date (demarre_le) du dernier passage QUEL QUE SOIT le statut — pour détecter un ordonnanceur absent. `null` si aucun. */
export async function dernierPassageLe(): Promise<Date | null> {
  const { rows } = await query<{ d: Date | null }>(`SELECT max(demarre_le) AS d FROM veille_run`);
  return rows[0]?.d ?? null;
}

/**
 * Date d'ARRIVÉE d'un millésime = min(fini_le) d'un run 'succes' l'ayant ingéré. `sitadel_millesime.telecharge_a` n'est
 * PAS utilisable (réécrit à chaque ré-ingestion via ON CONFLICT). `null` si ce millésime n'a jamais été ingéré via un run.
 */
export async function dateArriveeMillesime(code: string): Promise<Date | null> {
  const { rows } = await query<{ d: Date | null }>(
    `SELECT min(fini_le) AS d FROM veille_run WHERE statut = 'succes' AND millesime_ingere = $1`, [code],
  );
  return rows[0]?.d ?? null;
}
