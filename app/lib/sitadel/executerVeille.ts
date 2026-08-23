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
import { executerAlerteAuto, depsReellesAlerte } from '../veille/alerteAuto';
import { executerPropositionAuto, depsReellesProposition } from '../veille/propositionAuto';
import { executerAlerteGedAuto, depsReellesAlerteGed } from '../veille/alerteGedAuto';
import { executerAlerteActionAuto, depsReellesAlerteAction } from '../veille/alerteActionAuto';
import { executerPreCochageAuto, depsReellesPreCochage } from '../veille/preCochageReponduAuto';
import { executerEnvoiAuto, depsReellesEnvoiAuto } from '../veille/envoiAuto';
import { executerDetection } from '../veille/detectionSources';
import { depsReellesDetection } from '../veille/detectionRepo';
import { ingererMillesime, millesimeDistantDido, DOSSIER_LOCAL, type CompteursIngestion } from './ingestionMillesime';
import {
  doitSExecuter, millesimeEstNouveau, fichiersCsvAPurger,
  type Declencheur, type StatutRun, type ConfigAuto, type RunVeille, type FichierCsv,
} from './planification';

/** Clé du verrou consultatif dédié à la veille Sitadel (constante fixe : un seul run à la fois, tous déclencheurs confondus). */
const CLE_VERROU = 776_920_011;

export interface OptionsVeille { declencheur: Declencheur; forcer?: boolean }
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
  millesimeDistant(): Promise<string>;
  ingerer(millesime: string): Promise<CompteursIngestion>;
  listerCsv(): Promise<FichierCsv[]>;
  supprimerFichiers(chemins: string[]): Promise<void>;
  // R7 — relève automatique des réponses CRPA, tentée à chaque tick sous le MÊME verrou. OPTIONNELLE (les tests qui
  //   n'éprouvent pas la relève l'omettent) et ISOLÉE : voir son appel (§1bis) — un échec ici ne touche jamais la veille.
  releveAuto?(): Promise<unknown>;
  // R6 — relève APPROFONDIE des demandes dont l'échéance est proche/dépassée (après la relève courante). OPTIONNELLE et
  //   ISOLÉE de la même façon (§1ter) : un échec ne touche jamais la veille Sitadel.
  echeanceApprofondie?(): Promise<unknown>;
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
  // G1 — ALERTES « contenu à classer/télécharger en GED » (après les propositions, §1septies). OPTIONNELLE et ISOLÉE : un
  //   échec n'impacte jamais la veille ni la relève. E-mail interne à l'exploitant ; on ne suit JAMAIS un lien de mairie.
  alerteGed?(): Promise<unknown>;
  // T7-B — ALERTES « ce message de mairie appelle une réponse » (cas ③, après les alertes GED, §1octies). OPTIONNELLE et
  //   ISOLÉE. Grain message (nature=autre, ancre nature_classee_le) ; idempotence par alerte_action_le. E-mail interne.
  alerteAction?(): Promise<unknown>;
  // T7-C — PRÉ-COCHAGE automatique de « répondu » (après l'alerte action, §1nonies). OPTIONNEL et ISOLÉ. LECTURE STRICTE du
  //   dossier envoyés (en-têtes seuls) ; ancre anti-résurrection repondu_auto_le. N'écrit jamais demande.statut.
  preCochageRepondu?(): Promise<unknown>;
  // RELANCE lot 6 — ENVOI AUTOMATIQUE aux mairies / à la CADA (après le pré-cochage, §1decies). OPTIONNEL et ISOLÉ. ⚠️ SEUL
  //   point où l'ordonnanceur écrit à un TIERS, et UNIQUEMENT sous interrupteur explicite (relance_auto_active /
  //   saisine_cada_auto_active, défauts false). Désactivés → rien ne part à un tiers. APPELLE envoyerRelances/envoyerSaisinesCada
  //   (gardes intactes) ; compte rendu interne à alerte_email. Un échec ne touche jamais la veille ni la relève.
  envoiAuto?(): Promise<unknown>;
  // FRAÎCHEUR lot 2 — DÉTECTION des nouvelles publications (métadonnées seules, JAMAIS de donnée), après l'envoi auto
  //   (§1undecies). OPTIONNELLE et ISOLÉE : un échec de détection ne touche jamais la veille ni la relève. Respecte son
  //   propre interrupteur global + sa cadence + l'activation par source, à l'intérieur (executerDetection).
  detecterEditions?(): Promise<unknown>;
}

export async function executerVeille(opts: OptionsVeille, deps: DepsVeille = depsReelles()): Promise<ResultatVeille> {
  const forcer = opts.forcer ?? false;

  // 1) Verrou : un run déjà en cours → sortie immédiate, sans réseau ni écriture.
  if (!(await deps.acquerirVerrou())) {
    return { statut: 'rien_a_faire', raison: 'un run est déjà en cours (verrou pris) — sortie sans action', runId: null };
  }

  let runId: number | null = null;
  try {
    // 1bis) RELÈVE AUTOMATIQUE des réponses CRPA (R7) — sous le MÊME verrou, à CHAQUE tick, AVANT la garde d'intervalle
    //   Sitadel (§2) et le contrôle de millésime (§4) : la relève doit tourner même quand la veille Sitadel n'a « rien à
    //   faire ». ISOLÉE À DOUBLE FILET : un échec de relève ne DOIT JAMAIS faire échouer la veille → try/catch qui avale
    //   ici (executerReleveAuto journalise déjà son propre « erreur » sans relancer). N'affecte ni le verrou, ni le run
    //   Sitadel, ni son statut ; la séquence Sitadel continue exactement comme si de rien n'était.
    if (deps.releveAuto) {
      try { await deps.releveAuto(); } catch { /* relève isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1ter) RELÈVE APPROFONDIE (R6) — APRÈS la relève courante (qui vient, si elle a réussi, de rafraîchir la fraîcheur) :
    //   pour les demandes dont l'échéance d'un mois est proche/dépassée, on regarde dans TOUS les dossiers (indésirables
    //   compris) « pour être sûr de ne pas avoir loupé le mail ». Garde 1/jour/demande à l'intérieur. MÊME ISOLATION à
    //   double filet que §1bis : un échec n'impacte jamais la veille Sitadel.
    if (deps.echeanceApprofondie) {
      try { await deps.echeanceApprofondie(); } catch { /* approfondie isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1quater) BROUILLONS DE RELANCE (R6b) — APRÈS l'approfondie (qui vient de regarder au mieux) : pour les demandes dont
    //   l'échéance d'un mois est DÉPASSÉE et sans relance vivante, on PRÉPARE un texte de relance (aucun envoi). MÊME
    //   ISOLATION que §1bis/§1ter : un échec n'impacte jamais la veille Sitadel.
    if (deps.relanceEcheance) {
      try { await deps.relanceEcheance(); } catch { /* relance isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1quinquies) ALERTE e-mail quotidienne (R8) — APRÈS les relances : un seul récapitulatif par jour, uniquement s'il y a
    //   quelque chose à dire. MÊME ISOLATION : un échec d'envoi n'impacte jamais la veille ni la relève.
    if (deps.alerteQuotidienne) {
      try { await deps.alerteQuotidienne(); } catch { /* alerte isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1sexies) PROPOSITIONS de saisine CADA (X5) — DERNIÈRE étape auto, APRÈS l'alerte : pour chaque demande devenue
    //   saisissable et jamais encore proposée, un e-mail interne (à l'adresse d'alerte) avec le détail + un lien de
    //   confirmation. MÊME ISOLATION à double filet : un échec d'envoi n'impacte jamais la veille ni la relève. AUCUN envoi
    //   vers une mairie ou la CADA (invariant executerVeille).
    if (deps.propositionCada) {
      try { await deps.propositionCada(); } catch { /* proposition isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1septies) ALERTES « contenu à classer/télécharger en GED » (G1) — DERNIÈRE étape auto : pour chaque réponse porteuse de
    //   pièces et/ou d'un lien dont le contenu n'est pas encore en GED, un compte à rebours (J-3 puis 24 h) envoie le mail de
    //   mairie forwardé à l'exploitant. Idempotence par (réponse × permis × type). MÊME ISOLATION : un échec n'impacte rien.
    if (deps.alerteGed) {
      try { await deps.alerteGed(); } catch { /* alerte GED isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1octies) ALERTES « ce message de mairie appelle une réponse » (T7-B, cas ③) — APRÈS les alertes GED : pour chaque message
    //   de nature `autre` ANCRÉ (nature_classee_le IS NOT NULL, jamais un rétro-classé) et jamais encore alerté, on forwarde le
    //   mail de mairie à l'exploitant pour qu'il y réponde. Idempotence par message (alerte_action_le). MÊME ISOLATION : un
    //   échec n'impacte rien. On ne suit JAMAIS un lien ; aucune bascule statut/satisfait_le/Archives.
    if (deps.alerteAction) {
      try { await deps.alerteAction(); } catch { /* alerte action isolée : n'impacte jamais la veille Sitadel */ }
    }

    // 1nonies) PRÉ-COCHAGE automatique de « répondu » (T7-C) — APRÈS l'alerte action : on lit le dossier ENVOYÉS (en-têtes seuls,
    //   lecture stricte) pour cocher les messages `autre` auxquels le fondateur a déjà répondu. Ancre anti-résurrection
    //   (repondu_auto_le). MÊME ISOLATION : un échec n'impacte rien. Ne remplace jamais le bouton manuel ; jamais demande.statut.
    if (deps.preCochageRepondu) {
      try { await deps.preCochageRepondu(); } catch { /* pré-cochage isolé : n'impacte jamais la veille Sitadel */ }
    }

    // 1decies) ENVOI AUTOMATIQUE aux mairies / à la CADA (RELANCE lot 6) — DERNIÈRE étape auto, APRÈS que la cascade a préparé
    //   ses brouillons (§1quater) : si relance_auto_active, les relances dont la variante correspond à la fenêtre du JOUR
    //   partent (la garde d'obsolescence du lot 3 s'applique telle quelle) ; si saisine_cada_auto_active, la saisine part
    //   (ou va en file de dépôt si cada_email est vide). Interrupteurs à false (défaut) → rien ne part à un tiers. MÊME
    //   ISOLATION à double filet : un échec d'envoi n'impacte jamais la veille ni la relève ; les deux étapes sont isolées l'une
    //   de l'autre (dans executerEnvoiAuto). Un compte rendu INTERNE (alerte_email) récapitule tout envoi effectué.
    if (deps.envoiAuto) {
      try { await deps.envoiAuto(); } catch { /* envoi auto isolé : n'impacte jamais la veille Sitadel */ }
    }

    // 1undecies) DÉTECTION des nouvelles publications (FRAÎCHEUR lot 2) — DERNIÈRE étape auto : interroge les MÉTADONNÉES
    //   (index de diffusion IGN, listing cadastre, en-tête DILA, page annuaire PRADA), quelques Ko chacune, JAMAIS de
    //   téléchargement de donnée (lot 3). MÊME ISOLATION à double filet : un échec de détection n'impacte jamais la veille
    //   ni la relève. Interrupteur global + cadence + activation par source sont gérés DANS executerDetection.
    if (deps.detecterEditions) {
      try { await deps.detecterEditions(); } catch { /* détection isolée : n'impacte jamais la veille Sitadel */ }
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
    const nouveau = millesimeEstNouveau(await deps.millesimeEnBase(), distant);
    if (!nouveau.nouveau && !forcer) {
      await deps.finaliserRun(runId, { statut: 'rien_a_faire', finiLe: deps.maintenant(), millesimeDetecte: distant, message: nouveau.raison });
      return { statut: 'rien_a_faire', raison: nouveau.raison, runId };
    }

    // 5) Ingestion du millésime DÉTECTÉ (non plus une constante figée) → compteurs réels ; base = distant après succès.
    const c = await deps.ingerer(distant);

    // 6) Purge des CSV — UNIQUEMENT ici (chemin de succès) et JAMAIS le millésime qu'on vient d'ingérer (= le cache
    //    courant, ce qui rend le prochain re-run gratuit). Ne vise que les millésimes ANTÉRIEURS au-delà de la rétention.
    const aPurger = fichiersCsvAPurger(await deps.listerCsv(), deps.maintenant(), config.csvRetentionJours, c.millesime);
    if (aPurger.length > 0) await deps.supprimerFichiers(aPurger);

    const message = `millésime ${c.millesime} ingéré : ${c.lignesLues} lues, ${c.dossiersRetenus} retenus, ${c.dossiersNouveaux} nouveaux`
      + (aPurger.length > 0 ? ` · ${aPurger.length} CSV purgé(s)` : ` · CSV conservés (rétention ${config.csvRetentionJours} j)`);
    await deps.finaliserRun(runId, {
      statut: 'succes', finiLe: deps.maintenant(), millesimeDetecte: distant, millesimeIngere: c.millesime,
      lignesLues: c.lignesLues, dossiersRetenus: c.dossiersRetenus, dossiersNouveaux: c.dossiersNouveaux, message,
    });
    return { statut: 'succes', raison: message, runId, compteurs: c };
  } catch (e) {
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
    // R6b — brouillons de relance réels : sélection 'depassee' + garde relance vivante + journal, dans relanceAuto.ts.
    relanceEcheance: () => executerRelanceAuto(depsReellesRelance()),
    // R8 — alerte quotidienne réelle : conditions + composition + envoi SMTP + journal, dans alerteAuto.ts.
    alerteQuotidienne: () => executerAlerteAuto(depsReellesAlerte()),
    // X5 — propositions de saisine CADA réelles : conditions + composition + envoi SMTP interne + trace, dans propositionAuto.ts.
    propositionCada: () => executerPropositionAuto(depsReellesProposition()),
    // G1 — alertes GED réelles : candidats (réponse × permis non classé) + compte à rebours J-3/24 h + forward SMTP + journal, dans alerteGedAuto.ts.
    alerteGed: () => executerAlerteGedAuto(depsReellesAlerteGed()),
    // T7-B — alertes « ce message appelle une réponse » réelles (cas ③) : candidats `autre` ancrés + forward SMTP + idempotence, dans alerteActionAuto.ts.
    alerteAction: () => executerAlerteActionAuto(depsReellesAlerteAction()),
    // T7-C — pré-cochage « répondu » réel : dossier envoyés (en-têtes seuls) + match fil/destinataire + ancre repondu_auto_le, dans preCochageReponduAuto.ts.
    preCochageRepondu: () => executerPreCochageAuto(depsReellesPreCochage()),
    // RELANCE lot 6 — envoi automatique réel : DEUX interrupteurs + plafond auto + appels envoyerRelances/envoyerSaisinesCada (gardes intactes) + compte rendu interne, dans envoiAuto.ts.
    envoiAuto: () => executerEnvoiAuto(depsReellesEnvoiAuto()),
    // FRAÎCHEUR lot 2 — détection des nouvelles publications (métadonnées seules), interrupteur + cadence + activation par source dans executerDetection.
    detecterEditions: () => executerDetection(depsReellesDetection()),
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
