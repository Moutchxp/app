/**
 * ALERTE (démolitions) — ORCHESTRATION « un bâtiment qui fondait un certificat a disparu ». Brique de veille OPTIONNELLE et
 * ISOLÉE, calquée sur `alerteAttenteBatiAuto`. Testable par injection (aucun SMTP, aucune base dans les tests).
 *
 * 🔴 GARDES : ne recertifie JAMAIS, n'écrit sur AUCUN certificat, ne touche NI le moteur, NI le verdict, NI le golden, NI une
 * altitude. Le croisement lit le bâti BD TOPO RÉEL (bdtopo_batiment / batiment) via `cleabsObstacleAxe`, JAMAIS l'emprise projetée.
 * Un échec n'interrompt pas la veille (l'appelant avale aussi).
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { cleabsObstacleAxe } from '../db/obstacleIdentite';
import { envoyerAlerteReelle } from './alerteAuto';
import { disparitionsAAlerter, composerAlerteObstacleDisparu, type CandidatObstacleDisparu, type ObstacleDisparu } from './alerteObstacleDisparu';

export interface DepsAlerteObstacleDisparu {
  /** Interrupteur dédié + destinataire (l'adresse d'alerte partagée). Migration absente → { active: false }. */
  lireConfig(): Promise<{ active: boolean; email: string }>;
  /** Certificats avec un obstacle capturé, enrichis des deux faits mesurés (present / couvert) + s'ils ont déjà été alertés. */
  chargerCandidats(): Promise<CandidatObstacleDisparu[]>;
  envoyer(destinataire: string, sujet: string, corps: string): Promise<void>;
  /** Marque ces certificats comme alertés (anti-doublon). Idempotent (ON CONFLICT DO NOTHING). */
  marquerAlertes(disparus: ObstacleDisparu[]): Promise<void>;
}

export interface BilanAlerteObstacleDisparu { examines: number; aAlerter: number; envoye: boolean }

/**
 * Une passe. Interrupteur OFF / adresse vide → RIEN. Sinon : sélectionne les certificats dont l'obstacle a RÉELLEMENT disparu et
 * jamais alertés, envoie UN e-mail récapitulatif (jamais un par certificat ni un par tick), puis les marque. L'ENVOI précède le
 * MARQUAGE : un envoi qui échoue laisse les certificats non marqués → retentés (jamais un rappel perdu, jamais un doublon).
 */
export async function executerAlerteObstacleDisparu(deps: DepsAlerteObstacleDisparu): Promise<BilanAlerteObstacleDisparu> {
  const config = await deps.lireConfig();
  if (!config.active || config.email.trim() === '') return { examines: 0, aAlerter: 0, envoye: false };

  const candidats = await deps.chargerCandidats();
  const aAlerter = disparitionsAAlerter(candidats);
  if (aAlerter.length === 0) return { examines: candidats.length, aAlerter: 0, envoye: false };

  const mail = composerAlerteObstacleDisparu(aAlerter);
  if (mail === null) return { examines: candidats.length, aAlerter: 0, envoye: false }; // défensif

  await deps.envoyer(config.email, mail.sujet, mail.corps); // AVANT le marquage
  await deps.marquerAlertes(aAlerter);
  return { examines: candidats.length, aAlerter: aAlerter.length, envoye: true };
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────

interface LigneCertifObstacle {
  certificat_id: number | string; numero: string; adresse: string | null;
  lat: string | number | null; lon: string | number | null; azimut_deg: string | number | null; distance_obstacle_m: string | number | null;
  cleabs: string; present: boolean; deja_alerte: boolean;
}

export function depsReellesAlerteObstacleDisparu(): DepsAlerteObstacleDisparu {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { active: c.obstacleDisparuAlerteActive, email: c.alerteEmail }; // interrupteur DÉDIÉ + adresse d'alerte PARTAGÉE
    },
    chargerCandidats: async () => {
      // Certificats portant un cleabs d'obstacle capturé (chantier précédent). `present` = ce cleabs existe-t-il encore dans le
      //   bâti courant ? `deja_alerte` = marqueur anti-doublon. `couvert` (emplacement encore bâti ?) est calculé PAR LIGNE ci-dessous.
      const { rows } = await query<LigneCertifObstacle>(
        `SELECT c.id AS certificat_id, c.numero, c.adresse,
                c.lat, c.lon, c.azimut_deg, c.distance_obstacle_m,
                (c.resultat->'resultat'->'verdict'->'obstacle'->>'cleabs') AS cleabs,
                EXISTS (SELECT 1 FROM bdtopo_batiment b WHERE b.cleabs = (c.resultat->'resultat'->'verdict'->'obstacle'->>'cleabs')) AS present,
                EXISTS (SELECT 1 FROM alerte_obstacle_disparu a WHERE a.certificat_id = c.id
                          AND a.cleabs = (c.resultat->'resultat'->'verdict'->'obstacle'->>'cleabs')) AS deja_alerte
           FROM certificat c
          WHERE (c.resultat->'resultat'->'verdict'->'obstacle'->>'cleabs') IS NOT NULL`);
      const out: CandidatObstacleDisparu[] = [];
      for (const r of rows) {
        const lat = r.lat === null ? null : Number(r.lat);
        const lon = r.lon === null ? null : Number(r.lon);
        const azimut = r.azimut_deg === null ? null : Number(r.azimut_deg);
        const dist = r.distance_obstacle_m === null ? null : Number(r.distance_obstacle_m);
        // « couvert » : l'emplacement de l'obstacle est-il encore couvert par du bâti (édition courante) ? Lecture SEULE du bâti
        //   RÉEL. Si un bâtiment (même re-numéroté) couvre le point → couvert=true → NON alerté. Point sans géométrie → couvert=false
        //   par prudence (ne bloque pas ; le filet `present` évite l'alerte quand le bâtiment existe encore).
        const couvert = (lat !== null && lon !== null && azimut !== null && dist !== null)
          ? (await cleabsObstacleAxe({ point: { lat, lon }, azimutDeg: azimut }, dist)) !== null
          : false;
        out.push({
          certificatId: Number(r.certificat_id), numero: r.numero, adresse: r.adresse, cleabs: r.cleabs,
          present: r.present === true, couvert, dejaAlerte: r.deja_alerte === true,
        });
      }
      return out;
    },
    envoyer: (destinataire, sujet, corps) => envoyerAlerteReelle(destinataire, sujet, corps),
    marquerAlertes: async (disparus) => {
      for (const d of disparus) {
        await query(
          `INSERT INTO alerte_obstacle_disparu (certificat_id, cleabs, alerte_le) VALUES ($1, $2, now())
           ON CONFLICT (certificat_id, cleabs) DO NOTHING`,
          [d.certificatId, d.cleabs]);
      }
    },
  };
}
