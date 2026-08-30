/**
 * PART-D — ALERTE « lien de téléchargement bientôt périmé » à Arno. Branché dans le CORPS d'executerVeille (aucun nouveau job),
 * APRÈS les alertes GED. Testable PAR INJECTION (aucun SMTP, aucune base dans les tests).
 *
 * RÈGLES (Arno, 30/08) :
 *  - Ce courrier va à ARNO (adresse d'alerte), JAMAIS à une mairie → il n'est bridé par AUCUN interrupteur de relance
 *    (relance_auto_active ne le concerne pas). Il suit l'opt-in général des alertes e-mail (alerte_active + alerte_email).
 *  - UNE SEULE alerte par lien (colonne demande_reponse_lien.alerte_peremption_le) → jamais de répétition à chaque tic (15 min).
 *  - GROUPE tous les liens dus dans un seul e-mail.
 *  - Respecte la FENÊTRE d'envoi jour/heure ouvrés (envoiOuvre.ts) : hors fenêtre → on REPORTE (rien envoyé, rien marqué → retenté).
 *  - On ne SUIT JAMAIS un lien : on ne fait que prévenir Arno de télécharger avant péremption présumée.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { seuilAlerteAtteint, ilYaEnJours } from './lienPeremption';
import { fenetreEnvoiOuverte } from './envoiOuvre';

/** Un lien fort EN ATTENTE (contenu pas encore en GED), non encore alerté, avec son permis et sa date de réception (envoi du mail). */
export interface LienPerissableCandidat {
  lienId: number;
  recuLe: Date;
  url: string;
  numDau: string | null;
  communeNom: string | null;
}

export interface DepsAlerteLienPeremption {
  maintenant(): Date;
  lireConfig(): Promise<{ active: boolean; email: string; validiteJours: number; alerteAvantJours: number; envoiHeureDebut: number; envoiHeureFin: number }>;
  candidats(): Promise<LienPerissableCandidat[]>;   // liens forts en attente (GED vide), non encore alertés
  envoyer(to: string, sujet: string, corps: string): Promise<void>;
  marquerAlertes(lienIds: number[]): Promise<void>; // pose alerte_peremption_le (idempotence) sur les liens alertés
}

export interface BilanAlerteLien { candidats: number; dus: number; envoyes: number; reporte: boolean; raison: string }

/**
 * COMPOSE l'e-mail groupé (PUR, testable). Honnêteté : chaque ligne dit le FAIT mesuré (« reçu il y a N jours »), jamais « expire
 * dans N jours ». La validité présumée est nommée comme HYPOTHÈSE. Une ligne par (lien × permis).
 */
export function composerAlerteLiens(dus: LienPerissableCandidat[], maintenant: Date, validiteJours: number): { sujet: string; corps: string } {
  const sujet = `Liens de téléchargement à récupérer avant péremption (${dus.length})`;
  const lignes: string[] = [
    `${dus.length} lien(s) de téléchargement reçus d'une mairie sont encore EN ATTENTE (pièces pas encore récupérées).`,
    `La durée de validité réelle n'est pas connue ; par précaution (validité présumée : ${validiteJours} jours, hypothèse), pensez à les télécharger sans tarder, puis à vous les renvoyer par e-mail (objet « permis ») pour les verser en GED.`,
    '',
  ];
  for (const d of dus) {
    lignes.push(`• ${d.communeNom ?? 'commune inconnue'} — permis ${d.numDau ?? '(n° inconnu)'} — reçu ${ilYaEnJours(d.recuLe, maintenant)}`);
    lignes.push(`  ${d.url}`);
  }
  lignes.push('');
  lignes.push('On ne suit jamais un lien automatiquement : le téléchargement reste un geste humain.');
  return { sujet, corps: lignes.join('\n') };
}

/**
 * Une passe d'alerte. Sélectionne les liens en attente ayant atteint le seuil, et — SI la fenêtre d'envoi est ouverte — envoie UN
 * e-mail groupé puis marque ces liens (idempotence). Hors fenêtre / bornes incohérentes → REPORTE (rien envoyé, rien marqué). Aucun
 * interrupteur de relance ne s'applique. Un échec d'envoi remonte (aucun marquage → retenté à la passe suivante).
 */
export async function executerAlerteLienPeremption(deps: DepsAlerteLienPeremption): Promise<BilanAlerteLien> {
  const cfg = await deps.lireConfig();
  if (!cfg.active || cfg.email.trim() === '') return { candidats: 0, dus: 0, envoyes: 0, reporte: false, raison: 'alertes e-mail désactivées ou adresse absente' };

  const maintenant = deps.maintenant();
  const candidats = await deps.candidats();
  const dus = candidats.filter((c) => seuilAlerteAtteint(c.recuLe, maintenant, cfg.validiteJours, cfg.alerteAvantJours));
  if (dus.length === 0) return { candidats: candidats.length, dus: 0, envoyes: 0, reporte: false, raison: 'aucun lien au seuil d’alerte' };

  const fen = fenetreEnvoiOuverte(maintenant, cfg.envoiHeureDebut, cfg.envoiHeureFin);
  if (!fen.ouverte) return { candidats: candidats.length, dus: dus.length, envoyes: 0, reporte: true, raison: fen.coherente ? 'hors fenêtre d’envoi (jour/heure ouvrés) — reporté' : 'fenêtre d’envoi mal réglée — reporté' };

  const { sujet, corps } = composerAlerteLiens(dus, maintenant, cfg.validiteJours);
  await deps.envoyer(cfg.email, sujet, corps);      // échec → remonte (aucun marquage → retenté)
  await deps.marquerAlertes(dus.map((d) => d.lienId));
  return { candidats: candidats.length, dus: dus.length, envoyes: dus.length, reporte: false, raison: `alerte groupée envoyée (${dus.length} lien(s))` };
}

// ── Implémentation RÉELLE (production) ─────────────────────────────────────────
/** Candidats réels : liens FORTS d'une réponse rattachée (hors rebond), dont le permis a une GED VIDE, non encore alertés. RÉSILIENT. */
export async function candidatsLienPeremptionReels(): Promise<LienPerissableCandidat[]> {
  try {
    const { rows } = await query<{ lien_id: number; recu_le: string; url: string; num_dau: string | null; commune_nom: string | null }>(
      `SELECT l.id::int AS lien_id, r.recu_le::text AS recu_le, l.url, s.num_dau, c.nom AS commune_nom
         FROM demande_reponse_lien l
         JOIN demande_reponse r ON r.id = l.reponse_id
         JOIN demande d ON d.id = r.demande_id
         JOIN demande_dossier dd ON dd.demande_id = d.id AND dd.actif
         JOIN sitadel_dossier s ON s.id = dd.dossier_id
         LEFT JOIN commune c ON c.code_insee = d.code_insee
        WHERE l.fort AND l.alerte_peremption_le IS NULL
          AND r.demande_id IS NOT NULL AND r.nature <> 'rebond' AND d.statut IN ('envoyee', 'close')
          AND NOT EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = s.id)
        ORDER BY r.recu_le ASC, l.id`);
    return rows.map((r) => ({ lienId: r.lien_id, recuLe: new Date(r.recu_le), url: r.url, numDau: r.num_dau, communeNom: r.commune_nom }));
  } catch { return []; } // 181 / colonnes absentes → aucun candidat (résilient)
}

export function depsReellesAlerteLienPeremption(): DepsAlerteLienPeremption {
  return {
    maintenant: () => new Date(),
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { active: c.alerteActive, email: c.alerteEmail, validiteJours: c.lienValiditePresumeeJours, alerteAvantJours: c.lienAlerteAvantJours, envoiHeureDebut: c.envoiHeureDebut, envoiHeureFin: c.envoiHeureFin };
    },
    candidats: () => candidatsLienPeremptionReels(),
    envoyer: async (to, sujet, corps) => {
      const { lireConfigEmail, obtenirTransporteur } = await import('../email'); // import dynamique : nodemailer hors du graphe statique
      const cfg = lireConfigEmail();
      if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
      await obtenirTransporteur(cfg).sendMail({ from: cfg.from, to, subject: sujet, text: corps });
    },
    marquerAlertes: async (lienIds) => {
      if (lienIds.length === 0) return;
      await query(`UPDATE demande_reponse_lien SET alerte_peremption_le = now() WHERE id = ANY($1::bigint[]) AND alerte_peremption_le IS NULL`, [lienIds]);
    },
  };
}
