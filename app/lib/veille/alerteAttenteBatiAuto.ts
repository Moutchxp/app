/**
 * ATT-BATI (alerte) — ORCHESTRATION de l'alerte « un permis attend le bâti depuis trop longtemps ». Brique de veille OPTIONNELLE
 * et ISOLÉE, calquée sur `alerteGedAuto` : branchée dans le corps d'executerVeille, sous le MÊME verrou. Testable par injection
 * (aucun SMTP, aucune base dans les tests).
 *
 * RÔLE : un FILET. RATT-AUTO ferme la boucle le jour où une édition BD TOPO livrera le bâti ; en attendant (calendrier IGN de 1 à
 * 3 ans), rien ne dit à l'exploitant qu'un dossier attend — et si RATT-AUTO reste OFF ou tombe, il n'a aucun signal. Cette alerte
 * couvre ce trou. Elle se déclenche INDÉPENDAMMENT de RATT-AUTO (elle ne lit jamais son état).
 *
 * INVARIANTS : n'alerte QU'une fois par dossier et par franchissement de seuil (marqueur `alerte_attente_bati`) — jamais à chaque
 * tick ; ne lit QUE l'état et l'ancienneté du dossier ; ne touche NI suivreRattachement, NI RATT-AUTO, NI le moteur/verdict/
 * altitude/certificat, NI l'emprise. Un échec n'interrompt pas la veille (l'appelant avale aussi).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { envoyerAlerteReelle } from './alerteAuto';
import { dossiersAAlerter, composerAlerteAttenteBati, type CandidatAttenteBati, type DossierAAlerter } from './alerteAttenteBati';

/** I/O de l'alerte, injectables pour les tests (sans SMTP ni base). */
export interface DepsAlerteAttenteBati {
  maintenant(): Date;
  /** Interrupteur dédié + destinataire (l'adresse d'alerte partagée) + seuil en jours. Migration absente → { active: false }. */
  lireConfig(): Promise<{ active: boolean; email: string; seuilJours: number }>;
  /** TOUS les dossiers actuellement « en attente de bâti », avec leur date d'entrée et s'ils ont déjà été alertés. */
  chargerCandidats(): Promise<CandidatAttenteBati[]>;
  envoyer(destinataire: string, sujet: string, corps: string): Promise<void>;
  /** Marque ces dossiers comme alertés (anti-doublon). Idempotent (ON CONFLICT DO NOTHING). */
  marquerAlertes(dossiers: DossierAAlerter[]): Promise<void>;
}

export interface BilanAlerteAttenteBati { examines: number; aAlerter: number; envoye: boolean }

/**
 * Une passe d'alerte. Interrupteur OFF ou adresse vide → RIEN. Sinon : sélectionne les dossiers au-delà du seuil ET jamais
 * alertés, envoie UN e-mail récapitulatif (jamais un par dossier ni un par tick), puis les marque. L'ENVOI précède le MARQUAGE :
 * un envoi qui échoue laisse les dossiers non marqués → retentés à la passe suivante (jamais un rappel perdu, jamais un doublon).
 */
export async function executerAlerteAttenteBati(deps: DepsAlerteAttenteBati): Promise<BilanAlerteAttenteBati> {
  const config = await deps.lireConfig();
  if (!config.active || config.email.trim() === '') return { examines: 0, aAlerter: 0, envoye: false };

  const maintenant = deps.maintenant();
  const candidats = await deps.chargerCandidats();
  const aAlerter = dossiersAAlerter(candidats, config.seuilJours, maintenant);
  if (aAlerter.length === 0) return { examines: candidats.length, aAlerter: 0, envoye: false }; // sous le seuil (ou tous déjà alertés) : rien, jamais un échec

  const mail = composerAlerteAttenteBati(aAlerter, config.seuilJours);
  if (mail === null) return { examines: candidats.length, aAlerter: 0, envoye: false }; // défensif (aAlerter non vide ⇒ mail non null)

  await deps.envoyer(config.email, mail.sujet, mail.corps); // AVANT le marquage : un échec d'envoi ne consomme pas l'anti-doublon
  await deps.marquerAlertes(aAlerter);
  return { examines: candidats.length, aAlerter: aAlerter.length, envoye: true };
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────

export function depsReellesAlerteAttenteBati(): DepsAlerteAttenteBati {
  return {
    maintenant: () => new Date(),
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      // Interrupteur DÉDIÉ (opt-in) + adresse d'alerte PARTAGÉE (comme alerteGed) + seuil éditable.
      return { active: c.attenteBatiAlerteActive, email: c.alerteEmail, seuilJours: c.attenteBatiAlerteJours };
    },
    chargerCandidats: async () => {
      const { rows } = await query<{ dossier_id: number | string; num_dau: string | null; commune_nom: string | null; detecte_le: string; deja_alerte: boolean }>(
        `SELECT r.dossier_id, s.num_dau, c.nom AS commune_nom, r.detecte_le::text AS detecte_le,
                EXISTS (SELECT 1 FROM alerte_attente_bati a WHERE a.dossier_id = r.dossier_id) AS deja_alerte
           FROM permis_rattachement r
           JOIN sitadel_dossier s ON s.id = r.dossier_id
           LEFT JOIN commune c ON c.code_insee = s.code_insee
          WHERE r.etat = 'en_attente_bati'`);
      return rows.map((r) => ({
        dossierId: Number(r.dossier_id), numDau: r.num_dau, communeNom: r.commune_nom,
        detecteLe: new Date(r.detecte_le), dejaAlerte: r.deja_alerte === true,
      }));
    },
    envoyer: (destinataire, sujet, corps) => envoyerAlerteReelle(destinataire, sujet, corps),
    marquerAlertes: async (dossiers) => {
      for (const d of dossiers) {
        await query(
          `INSERT INTO alerte_attente_bati (dossier_id, alerte_le, jours_au_seuil) VALUES ($1, now(), $2)
           ON CONFLICT (dossier_id) DO NOTHING`,
          [d.dossierId, d.joursAttente]);
      }
    },
  };
}
