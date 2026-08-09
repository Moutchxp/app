/**
 * X5 — ENVOI des PROPOSITIONS de saisine CADA. Branché dans le CORPS d'executerVeille APRÈS l'alerte, sous le MÊME verrou
 * (aucun nouveau job). UNE proposition par demande devenue saisissable, JAMAIS de rappel : la trace proposition_cada
 * (unique sur demande_id) l'interdit. L'e-mail part à l'adresse d'ALERTE déjà configurée (jamais à une mairie ni à la CADA).
 *
 * Conditions CUMULATIVES : proposition_cada_active, alerte_email non vide, demande saisissable au sens de X2, aucune trace.
 * ISOLATION À DOUBLE FILET : chaque demande est traitée dans son propre try/catch (un échec d'envoi n'empêche pas les
 * suivantes) et l'appelant (executerVeille) avale aussi (un échec ne touche jamais la veille ni la relève). La trace est
 * écrite APRÈS émission confirmée : un envoi échoué ne laisse AUCUNE ligne → il sera retenté au prochain tick (pas un rappel :
 * il n'a jamais abouti). demande.statut n'est JAMAIS écrit.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { signerJetonCada } from '../internaute/jetonRectification';
import { lireSaisinesEligibles } from './saisineCadaRepo';
import { composerProposition } from './propositionCada';

/** Une demande saisissable, prête pour la composition de la proposition (dates en 'AAAA-MM-JJ'). */
export interface DemandeProposable {
  demandeId: number;
  reference: string;
  communeNom: string | null;
  envoyeLe: string;
  refusTaciteLe: string;
  joursAvantForclusion: number;
  dossiersDusNums: string[];
}

export interface IssueProposition {
  resultat: 'ignore' | 'termine';
  envoyees: number;
  ignorees: number;   // déjà proposées (trace présente)
  echecs: number;     // envoi/trace en échec (isolé, retenté plus tard)
  raison: string;
}

/** I/O de la proposition automatique, injectables pour les tests (sans SMTP ni base). */
export interface DepsPropositionAuto {
  lireConfig(): Promise<{ active: boolean; email: string }>;
  saisissables(): Promise<DemandeProposable[]>;
  dejaProposee(demandeId: number): Promise<boolean>;
  lienConfirmation(demandeId: number): Promise<string>;             // signe le jeton + construit l'URL absolue
  envoyer(destinataire: string, sujet: string, corps: string): Promise<string | null>; // renvoie le message-id (ou null)
  tracer(demandeId: number, destinataire: string, messageId: string | null): Promise<void>; // APRÈS émission
}

/**
 * Tente les propositions du tick. Conditions non réunies → 'ignore', AUCUNE trace. Sinon, pour chaque demande saisissable non
 * encore proposée : compose, envoie, puis trace. Chaque demande est isolée (un échec n'arrête pas les autres).
 */
export async function executerPropositionAuto(deps: DepsPropositionAuto): Promise<IssueProposition> {
  const cfg = await deps.lireConfig();
  if (!cfg.active) return { resultat: 'ignore', envoyees: 0, ignorees: 0, echecs: 0, raison: 'propositions désactivées' };
  if (cfg.email.trim() === '') return { resultat: 'ignore', envoyees: 0, ignorees: 0, echecs: 0, raison: 'aucune adresse d’alerte configurée' };

  const list = await deps.saisissables();
  let envoyees = 0, ignorees = 0, echecs = 0;
  for (const d of list) {
    try {
      if (await deps.dejaProposee(d.demandeId)) { ignorees++; continue; } // une seule proposition par demande, jamais de rappel
      const lien = await deps.lienConfirmation(d.demandeId);
      const { sujet, corps } = composerProposition({
        reference: d.reference, communeNom: d.communeNom, envoyeLe: d.envoyeLe, refusTaciteLe: d.refusTaciteLe,
        joursAvantForclusion: d.joursAvantForclusion, dossiersDusNums: d.dossiersDusNums, lienConfirmation: lien,
      });
      const messageId = await deps.envoyer(cfg.email, sujet, corps);
      await deps.tracer(d.demandeId, cfg.email, messageId); // trace UNIQUEMENT après émission confirmée
      envoyees++;
    } catch {
      echecs++; // ISOLÉ : la demande suivante est tentée ; aucune trace écrite → retenté au prochain tick (pas un rappel)
    }
  }
  return { resultat: 'termine', envoyees, ignorees, echecs, raison: `${envoyees} envoyée(s), ${ignorees} déjà proposée(s), ${echecs} échec(s)` };
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────
/** URL absolue de la page de confirmation (jeton 7 j en query). SITE_URL absente → on lève (proposition retentée plus tard). */
async function lienConfirmationReel(demandeId: number): Promise<string> {
  const base = (process.env.SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (base === '') throw new Error('SITE_URL absente : lien de confirmation CADA impossible');
  return `${base}/cada/confirmer?j=${await signerJetonCada(demandeId)}`;
}

/** Envoi RÉEL de la proposition via le compte SMTP par défaut (from = MAIL_FROM). Renvoie le message-id. Import dynamique : garde nodemailer hors du graphe statique. */
async function envoyerPropositionReelle(destinataire: string, sujet: string, corps: string): Promise<string | null> {
  const { lireConfigEmail, obtenirTransporteur } = await import('../email');
  const cfg = lireConfigEmail();
  if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
  const info = await obtenirTransporteur(cfg).sendMail({ from: cfg.from, to: destinataire, subject: sujet, text: corps });
  return (info as { messageId?: string })?.messageId ?? null;
}

export function depsReellesProposition(): DepsPropositionAuto {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { active: c.propositionCadaActive, email: c.alerteEmail };
    },
    saisissables: async () => {
      const { saisissables } = await lireSaisinesEligibles();
      if (saisissables.length === 0) return [];
      const ids = saisissables.map((s) => s.demandeId);
      const { rows } = await query<{ demande_id: number; nums: string[] }>(
        `SELECT dd.demande_id::int AS demande_id, array_agg(s.num_dau ORDER BY s.num_dau) AS nums
           FROM demande_dossier dd JOIN sitadel_dossier s ON s.id = dd.dossier_id
          WHERE dd.demande_id = ANY($1) AND dd.actif AND dd.satisfait_le IS NULL
          GROUP BY dd.demande_id`, [ids]);
      const parId = new Map(rows.map((r) => [r.demande_id, r.nums]));
      const jour = (d: Date): string => d.toISOString().slice(0, 10);
      return saisissables.map((s) => ({
        demandeId: s.demandeId, reference: s.reference, communeNom: s.communeNom,
        envoyeLe: jour(s.envoyeLe), refusTaciteLe: jour(s.refusTaciteLe), joursAvantForclusion: s.joursAvantForclusion,
        dossiersDusNums: parId.get(s.demandeId) ?? [],
      }));
    },
    dejaProposee: async (demandeId) => {
      const { rows } = await query<{ existe: boolean }>(`SELECT EXISTS (SELECT 1 FROM proposition_cada WHERE demande_id = $1) AS existe`, [demandeId]);
      return rows[0]?.existe === true;
    },
    lienConfirmation: lienConfirmationReel,
    envoyer: envoyerPropositionReelle,
    tracer: async (demandeId, destinataire, messageId) => {
      // ON CONFLICT DO NOTHING : filet ultime (l'unique demande_id tranche) — jamais deux traces pour une même demande.
      await query(
        `INSERT INTO proposition_cada (demande_id, destinataire, message_id) VALUES ($1, $2, $3) ON CONFLICT (demande_id) DO NOTHING`,
        [demandeId, destinataire, messageId]);
    },
  };
}
