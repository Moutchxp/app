/**
 * R8 — ENVOI de l'alerte quotidienne. Branché dans le CORPS d'executerVeille APRÈS la génération des relances, sous le
 * MÊME verrou (aucun nouveau job, aucune nouvelle clé). UN seul récapitulatif par jour, envoyé seulement s'il y a quelque
 * chose à dire. Boîte en LECTURE STRICTE (aucune relève ici), demande.statut jamais écrit.
 *
 * Conditions d'envoi (TOUTES nécessaires) : alerte_active, alerte_email non vide, heure locale ≥ alerte_heure_locale,
 * aucune alerte 'envoyee'/'rien_a_dire' aujourd'hui. Sinon on ne fait RIEN (aucune ligne). composerAlerte null → ligne
 * 'rien_a_dire' (pour ne pas recalculer toute la journée), pas d'envoi. Journal en DEUX TEMPS (en_cours → envoyee/erreur).
 * ISOLATION : un échec d'envoi ne fait JAMAIS échouer la veille ni la relève (l'appelant avale aussi).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { echeanceDe, etatEcheance } from './echeance';
import { composerAlerte, type EntreeAlerte, type DemandeEcheanceAlerte } from './alerte';

export type ResultatAlerte = 'ignore' | 'rien_a_dire' | 'envoyee' | 'erreur';
export interface IssueAlerte { resultat: ResultatAlerte; raison: string; runId: number | null }

export interface MajAlerteRun { resultat: 'envoyee' | 'erreur'; envoyeLe?: Date; erreur?: string }

/** I/O de l'alerte automatique, injectables pour les tests (sans SMTP ni base). */
export interface DepsAlerteAuto {
  maintenant(): Date;
  lireConfig(): Promise<{ active: boolean; email: string; heureLocale: number }>;
  heureLocaleCourante(): number;                         // 0-23, heure locale de la machine
  alerteFaiteAujourdHui(): Promise<boolean>;             // une alerte 'envoyee'/'rien_a_dire' existe déjà aujourd'hui ?
  composer(): Promise<{ sujet: string; corps: string } | null>;
  marquerRienADire(): Promise<void>;
  insererRun(destinataire: string, sujet: string, corps: string): Promise<number>; // ligne 'en_cours'
  finaliserRun(id: number, maj: MajAlerteRun): Promise<void>;
  envoyer(destinataire: string, sujet: string, corps: string): Promise<void>;
}

/**
 * Tente l'alerte du jour. Ne relance JAMAIS sur erreur d'envoi (journalise 'erreur' et retourne). Les cas « conditions non
 * réunies » ne laissent AUCUNE trace.
 */
export async function executerAlerteAuto(deps: DepsAlerteAuto): Promise<IssueAlerte> {
  const config = await deps.lireConfig();
  if (!config.active) return { resultat: 'ignore', raison: 'alertes désactivées', runId: null };
  if (config.email.trim() === '') return { resultat: 'ignore', raison: 'aucune adresse d’alerte configurée', runId: null };
  if (deps.heureLocaleCourante() < config.heureLocale) return { resultat: 'ignore', raison: `heure d’envoi non atteinte (avant ${config.heureLocale} h)`, runId: null };
  if (await deps.alerteFaiteAujourdHui()) return { resultat: 'ignore', raison: 'alerte déjà traitée aujourd’hui', runId: null };

  const compose = await deps.composer();
  if (compose === null) {
    // Rien à dire : on grave 'rien_a_dire' pour ne pas recomposer toute la journée (anti-doublon quotidien).
    await deps.marquerRienADire();
    return { resultat: 'rien_a_dire', raison: 'rien de nouveau à signaler', runId: null };
  }

  const runId = await deps.insererRun(config.email, compose.sujet, compose.corps); // 'en_cours' AVANT l'envoi
  try {
    await deps.envoyer(config.email, compose.sujet, compose.corps);
    await deps.finaliserRun(runId, { resultat: 'envoyee', envoyeLe: deps.maintenant() });
    return { resultat: 'envoyee', raison: `alerte envoyée à ${config.email}`, runId };
  } catch (e) {
    // On ABSORBE : la ligne passe 'erreur', on RETOURNE sans relancer (l'appelant continue la veille).
    const motif = e instanceof Error ? e.message : String(e);
    await deps.finaliserRun(runId, { resultat: 'erreur', erreur: motif });
    return { resultat: 'erreur', raison: motif, runId };
  }
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────
const MS_HEURE = 3_600_000;

/** Durée lisible depuis un delta en ms (« 12 minutes », « 3 heures », « 3 jours »). */
function dureeRelative(deltaMs: number): string {
  const min = Math.floor(deltaMs / 60_000);
  if (min < 1) return 'moins d’une minute';
  if (min < 60) return `${min} minute${min > 1 ? 's' : ''}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} heure${h > 1 ? 's' : ''}`;
  const j = Math.floor(h / 24);
  return `${j} jour${j > 1 ? 's' : ''}`;
}

/**
 * Construit l'ENTRÉE d'alerte depuis la base (LECTURE SEULE) : santé de la relève + ce qui a changé DEPUIS LA BORNE (la
 * dernière alerte réellement envoyée). Utilisé par la relève auto ET par le script de simulation.
 */
export async function chargerEntreeAlerte(maintenant: Date = new Date()): Promise<EntreeAlerte> {
  const cfg = await chargerConfigVeille();
  const reg = { echeanceAlerteJours: cfg.echeanceAlerteJours, releveFraicheurHeures: cfg.releveFraicheurHeures };

  const b = await query<{ t: Date | null }>(`SELECT max(demarre_le) AS t FROM alerte_run WHERE resultat = 'envoyee'`);
  const borne = b.rows[0]?.t ?? null;
  const depuis = borne ?? new Date(0); // aucune alerte antérieure → on rapporte tout (premier récapitulatif)

  const ro = await query<{ t: Date | null }>(`SELECT max(termine_le) AS t FROM releve_run WHERE resultat = 'ok'`);
  const derniereReleveOk = ro.rows[0]?.t ?? null;
  const releveFraiche = derniereReleveOk !== null && (maintenant.getTime() - derniereReleveOk.getTime()) <= reg.releveFraicheurHeures * MS_HEURE;
  const releveDetail = derniereReleveOk === null
    ? 'aucune relève réussie à ce jour'
    : `dernière relève réussie il y a ${dureeRelative(maintenant.getTime() - derniereReleveOk.getTime())}`;

  const rep = await query<{ reference: string; commune_nom: string | null; nb_pieces: number; dossiers: string[]; nature: string }>(
    `SELECT d.reference, c.nom AS commune_nom, r.nature,
            (SELECT count(*)::int FROM demande_reponse_piece p WHERE p.reponse_id = r.id) AS nb_pieces,
            coalesce(array_agg(s.num_dau) FILTER (WHERE s.num_dau IS NOT NULL), '{}') AS dossiers
       FROM demande_reponse r
       JOIN demande d ON d.id = r.demande_id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
       LEFT JOIN demande_dossier dd ON dd.reponse_id = r.id
       LEFT JOIN sitadel_dossier s ON s.id = dd.dossier_id
      WHERE r.demande_id IS NOT NULL AND r.cree_le > $1
      GROUP BY r.id, d.reference, c.nom, r.nature
      ORDER BY d.reference`,
    [depuis]);
  // J1 DEFAUT 2 — T3 : « la mairie a RÉPONDU » ≠ « la mairie a ÉCRIT ». On réutilise la MÊME définition que l'écran
  //   (nb_reponses_reelles = nature NOT IN ('accuse','rebond')) : un ACCUSÉ est listé À PART (il n'entre pas dans « Réponses »),
  //   un rebond (nature 'rebond') n'est pas une réponse (déjà signalé via rebondsAppliques). AUCUN filtre de process (garde axe-F).
  const reponsesRattachees = rep.rows
    .filter((r) => r.nature !== 'accuse' && r.nature !== 'rebond')
    .map((r) => ({ reference: r.reference, communeNom: r.commune_nom, nbPieces: r.nb_pieces, dossiersSatisfaits: r.dossiers }));
  const accusesRecus = rep.rows
    .filter((r) => r.nature === 'accuse')
    .map((r) => ({ reference: r.reference, communeNom: r.commune_nom }));

  const ar = await query<{ n: number }>(`SELECT count(*)::int AS n FROM demande_reponse WHERE demande_id IS NULL AND cree_le > $1`, [depuis]);
  const nbAReattacher = ar.rows[0]?.n ?? 0;

  const reb = await query<{ reference: string; commune_nom: string | null; motif: string | null }>(
    `SELECT d.reference, c.nom AS commune_nom, a.rebond_motif AS motif
       FROM demande_acheminement a
       JOIN demande d ON d.id = a.demande_id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE a.statut = 'rebond' AND a.canal = 'email' AND a.rebond_le > $1
      ORDER BY a.rebond_le DESC`, [depuis]);
  const rebondsAppliques = reb.rows.map((r) => ({ reference: r.reference, communeNom: r.commune_nom, motif: r.motif }));

  // Demandes passées à proche/dépassée DEPUIS la borne : on réutilise etatEcheance (jamais recopié) et on ne garde que
  // celles dont la bascule (échéance, ou échéance − alerte) est survenue après la borne (sinon déjà signalées).
  const dem = await query<{ reference: string; commune_nom: string | null; envoye_le: Date | null; statut_acheminement: string; dossiers_actifs: number; dossiers_satisfaits: number }>(
    `SELECT d.reference, c.nom AS commune_nom, min(a.envoye_le) AS envoye_le,
            CASE WHEN bool_or(a.statut = 'envoye') THEN 'envoye'
                 WHEN bool_or(a.statut = 'rebond') THEN 'rebond'
                 WHEN bool_or(a.statut = 'echec')  THEN 'echec'
                 ELSE 'en_attente' END AS statut_acheminement,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif) AS dossiers_actifs,
            (SELECT count(*)::int FROM demande_dossier dd WHERE dd.demande_id = d.id AND dd.actif AND dd.satisfait_le IS NOT NULL) AS dossiers_satisfaits
       FROM demande d
       LEFT JOIN commune c ON c.code_insee = d.code_insee
       -- B2 — ancre d'échéance agnostique au canal (téléservice = 'formulaire').
       LEFT JOIN demande_acheminement a ON a.demande_id = d.id
      WHERE d.statut = 'envoyee'
      GROUP BY d.id, d.reference, c.nom`);
  const demandesEcheance: DemandeEcheanceAlerte[] = [];
  for (const r of dem.rows) {
    const envoye = r.envoye_le ? new Date(r.envoye_le) : null;
    if (envoye === null) continue;
    const etat = etatEcheance({ envoyeLe: envoye, statutAcheminement: r.statut_acheminement, dossiersActifs: r.dossiers_actifs, dossiersSatisfaits: r.dossiers_satisfaits, derniereReleveOkLe: derniereReleveOk }, maintenant, reg);
    if (etat.etat !== 'proche' && etat.etat !== 'depassee') continue;
    const echeance = echeanceDe(envoye);
    const bascule = etat.etat === 'depassee' ? echeance : new Date(echeance.getTime() - reg.echeanceAlerteJours * 86_400_000);
    if (borne !== null && bascule.getTime() <= borne.getTime()) continue; // déjà signalé lors d'une alerte précédente
    demandesEcheance.push({ reference: r.reference, communeNom: r.commune_nom, etat: etat.etat, echeanceLe: echeance.toISOString().slice(0, 10) });
  }

  const rel = await query<{ reference: string; commune_nom: string | null }>(
    `SELECT d.reference, c.nom AS commune_nom
       FROM demande_relance rl
       JOIN demande d ON d.id = rl.demande_id
       LEFT JOIN commune c ON c.code_insee = d.code_insee
      WHERE rl.statut = 'brouillon' AND rl.generee_le > $1
      ORDER BY rl.generee_le DESC`, [depuis]);
  const relancesPreparees = rel.rows.map((r) => ({ reference: r.reference, communeNom: r.commune_nom }));

  return { releveFraiche, releveDetail, reponsesRattachees, accusesRecus, nbAReattacher, rebondsAppliques, demandesEcheance, relancesPreparees };
}

/** Envoi RÉEL du récapitulatif via le compte SMTP par défaut (from = MAIL_FROM). Import dynamique : garde nodemailer hors du graphe statique. */
export async function envoyerAlerteReelle(destinataire: string, sujet: string, corps: string): Promise<void> {
  const { lireConfigEmail, obtenirTransporteur, envoyerAlerte } = await import('../email');
  const cfg = lireConfigEmail();
  if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
  await envoyerAlerte(obtenirTransporteur(cfg), cfg.from, { to: destinataire, sujet, corps });
}

export function depsReellesAlerte(): DepsAlerteAuto {
  return {
    maintenant: () => new Date(),
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { active: c.alerteActive, email: c.alerteEmail, heureLocale: c.alerteHeureLocale };
    },
    heureLocaleCourante: () => new Date().getHours(),
    alerteFaiteAujourdHui: async () => {
      const { rows } = await query<{ fait: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM alerte_run WHERE resultat IN ('envoyee','rien_a_dire') AND demarre_le >= date_trunc('day', now())) AS fait`);
      return rows[0]?.fait === true;
    },
    composer: async () => composerAlerte(await chargerEntreeAlerte()),
    marquerRienADire: async () => {
      await query(`INSERT INTO alerte_run (resultat) VALUES ('rien_a_dire')`);
    },
    insererRun: async (destinataire, sujet, corps) => {
      const { rows } = await query<{ id: number }>(
        `INSERT INTO alerte_run (destinataire, sujet, corps, resultat) VALUES ($1, $2, $3, 'en_cours') RETURNING id`,
        [destinataire, sujet, corps]);
      return rows[0].id;
    },
    finaliserRun: async (id, m) => {
      await query(
        `UPDATE alerte_run SET resultat = $2, envoye_le = $3, erreur = $4 WHERE id = $1`,
        [id, m.resultat, m.envoyeLe ?? null, m.erreur ?? null]);
    },
    envoyer: (destinataire, sujet, corps) => envoyerAlerteReelle(destinataire, sujet, corps),
  };
}
