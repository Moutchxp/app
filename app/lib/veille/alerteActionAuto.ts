/**
 * T7-B (cas ③) — ORCHESTRATION de l'alerte « ce message de mairie appelle une réponse ». Branchée dans le CORPS d'executerVeille
 * (aucun nouveau job, aucune nouvelle clé), sous le MÊME verrou, APRÈS les alertes GED. Testable PAR INJECTION (aucun SMTP,
 * aucune base dans les tests). Idempotence AU GRAIN MESSAGE via demande_reponse.alerte_action_le (une alerte par message).
 *
 * INVARIANTS : armée UNIQUEMENT sur nature='autre' ET nature_classee_le IS NOT NULL (ancre T7-A anti-rétroactif — un message
 * classé par le backfill historique, nature_classee_le NULL, ne déclenche JAMAIS d'alerte) ; l'alerte part pour TOUT `autre`,
 * rattaché ou non (un mail non rattaché appelant une réponse ne doit pas passer sous le radar) ; ne pose NI satisfait_le NI
 * demande.statut NI bascule Archives ; on ne SUIT JAMAIS un lien. ISOLATION : un échec (SMTP…) n'interrompt ni les autres
 * alertes ni la veille — sans marquage, l'alerte est retentée à la passe suivante.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { sujetAction, composerCorpsAction, type ContexteAction } from './alerteAction';

/** Un message `autre` candidat à l'alerte ③ (ancre déjà filtrée côté requête). */
export interface CandidatAction {
  reponseId: number;
  numDau: string | null;      // permis principal de la demande rattachée, ou null (message non rattaché)
  autresPermis: string[];     // autres n° de permis de la même demande
  communeNom: string | null;
  recuLe: Date;
  deAdresse: string; deNom: string | null; objet: string | null; corpsTexte: string | null;
}

/** I/O de l'alerte ③, injectables pour les tests. */
export interface DepsAlerteAction {
  lireConfig(): Promise<{ active: boolean; email: string }>;
  chargerCandidats(): Promise<CandidatAction[]>;                 // nature='autre' ∧ nature_classee_le IS NOT NULL ∧ alerte_action_le IS NULL
  envoyer(mail: { to: string; sujet: string; corps: string }): Promise<void>;
  marquerEnvoyee(reponseId: number): Promise<void>;             // pose alerte_action_le=now() (idempotence)
}

export interface BilanAlerteAction { examinees: number; envoyees: number; erreurs: number }

/**
 * Une passe d'alertes ③. Pour chaque message `autre` candidat (jamais encore alerté), compose le forward et l'envoie à
 * l'adresse pro, puis MARQUE l'envoi (idempotence). Le marquage APRÈS l'envoi garantit qu'un échec est retenté (jamais un
 * doublon, jamais un silence). Un échec est ISOLÉ (compté, on continue).
 */
export async function executerAlerteActionAuto(deps: DepsAlerteAction): Promise<BilanAlerteAction> {
  const config = await deps.lireConfig();
  if (!config.active || config.email.trim() === '') return { examinees: 0, envoyees: 0, erreurs: 0 };

  const candidats = await deps.chargerCandidats();
  let examinees = 0, envoyees = 0, erreurs = 0;

  for (const c of candidats) {
    examinees += 1;
    try {
      const ctx: ContexteAction = { numDau: c.numDau, autresPermis: c.autresPermis, communeNom: c.communeNom };
      const sujet = sujetAction(ctx);
      const corps = composerCorpsAction({ ctx, deAdresse: c.deAdresse, deNom: c.deNom, objet: c.objet, recuLe: c.recuLe.toISOString(), corpsTexte: c.corpsTexte });
      await deps.envoyer({ to: config.email, sujet, corps });
      await deps.marquerEnvoyee(c.reponseId);
      envoyees += 1;
    } catch {
      erreurs += 1; // ISOLATION : pas de marquage → retenté à la passe suivante (jamais un doublon, jamais un silence).
    }
  }
  return { examinees, envoyees, erreurs };
}

// ── Implémentation RÉELLE (production) ────────────────────────────────────────

export function depsReellesAlerteAction(): DepsAlerteAction {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { active: c.alerteActive, email: c.alerteEmail }; // même opt-in / destinataire que le récap quotidien et G1
    },
    chargerCandidats: async () => {
      // Candidats = messages `autre` ANCRÉS (nature_classee_le IS NOT NULL → jamais un rétro-classé) et JAMAIS encore alertés.
      //   num_daus = permis ACTIFS de la demande rattachée (vide si non rattaché → numDau null, sujet « à identifier »).
      const { rows } = await query<{
        reponse_id: number; de_adresse: string; de_nom: string | null; objet: string | null; recu_le: string;
        corps_texte: string | null; commune_nom: string | null; num_daus: string[];
      }>(
        `SELECT r.id::int AS reponse_id, r.de_adresse, r.de_nom, r.objet, r.recu_le::text AS recu_le, r.corps_texte,
                c.nom AS commune_nom,
                coalesce((SELECT array_agg(s.num_dau ORDER BY s.num_dau)
                            FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
                           WHERE dd.demande_id = r.demande_id AND dd.actif), '{}') AS num_daus
           FROM demande_reponse r
           LEFT JOIN demande d ON d.id = r.demande_id
           LEFT JOIN commune c ON c.code_insee = d.code_insee
          WHERE r.nature = 'autre' AND r.nature_classee_le IS NOT NULL AND r.alerte_action_le IS NULL
          ORDER BY r.id`,
      );
      return rows.map((b) => {
        const permis = b.num_daus ?? [];
        return {
          reponseId: b.reponse_id,
          numDau: permis.length > 0 ? permis[0] : null,
          autresPermis: permis.slice(1),
          communeNom: b.commune_nom,
          recuLe: new Date(b.recu_le),
          deAdresse: b.de_adresse, deNom: b.de_nom, objet: b.objet, corpsTexte: b.corps_texte,
        };
      });
    },
    envoyer: async (mail) => {
      // Forward interne à l'exploitant (aucune pièce : un `autre` n'en a pas). Réutilise envoyerAlerte (R8), pas un 2e sender.
      const { lireConfigEmail, obtenirTransporteur, envoyerAlerte } = await import('../email');
      const cfg = lireConfigEmail();
      if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
      await envoyerAlerte(obtenirTransporteur(cfg), cfg.from, mail);
    },
    marquerEnvoyee: async (reponseId) => {
      // Idempotence défensive : ne pose l'ancre que si elle est encore nulle (le WHERE candidat le garantit déjà).
      await query(`UPDATE demande_reponse SET alerte_action_le = now(), maj_le = now() WHERE id = $1 AND alerte_action_le IS NULL`, [reponseId]);
    },
  };
}
