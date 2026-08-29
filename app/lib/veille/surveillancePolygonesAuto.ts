/**
 * SURV-1 — ORCHESTRATION « surveiller les polygones après validation d'un rattachement ». Brique de veille OPTIONNELLE et ISOLÉE,
 * calquée sur `alerteObstacleDisparuAuto`. Testable par injection (aucun SMTP, aucune base dans les tests). Elle DÉCIDE via le module
 * PUR `surveillerPolygones` et se contente de COLLECTER les faits, ENVOYER un e-mail et JOURNALISER l'anti-doublon.
 *
 * 🔒 GARDES : n'invalide RIEN (la validation reste active, le dossier ne régresse pas), n'écrit sur AUCUN certificat, ne touche NI le
 * moteur, NI le verdict, NI le golden, NI une altitude. Elle LIT le bâti BD TOPO réel (batiment) — jamais d'écriture dans `batiment`.
 * Un échec n'interrompt pas la veille (l'appelant avale aussi). Scopée aux SEULS dossiers validés ENCORE en fenêtre (jamais un balayage
 * de masse) ; latente tant qu'aucun dossier n'est validé.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import { envoyerAlerteReelle } from './alerteAuto';
import { PREFIXE_GEL_VALIDATION } from '../permis/gelRepo';
import {
  surveillerPolygones, composerAlerteSurveillance, lienFichePermis,
  type FootprintValide, type FootprintCourant, type ChangementSurveille, type DossierSurveille,
} from '../permis/surveillancePolygones';

export interface DepsSurveillancePolygones {
  /** Le marqueur anti-doublon existe-t-il ? (migration 171 appliquée). Absent → brique NO-OP propre. */
  disponible(): Promise<boolean>;
  /** Réglages + destinataire : interrupteur (SURV-2), tolérance (%), fenêtre (jours), adresse d'alerte partagée, base d'URL du lien fiche. */
  lireReglages(): Promise<{ active: boolean; toleranceContourPct: number; fenetreJours: number; email: string; siteUrl: string | null }>;
  /** Les dossiers VALIDÉS encore DANS la fenêtre (scoping serveur : jamais tout l'univers). */
  chargerDossiersEnFenetre(fenetreJours: number): Promise<{ dossierId: number; numDau: string; valideLe: string | null }[]>;
  /** Pour un dossier : footprints figés à la validation (référence) + footprints courants avec écart de contour DÉJÀ mesuré. */
  chargerFootprints(dossierId: number): Promise<{ valides: FootprintValide[]; courants: FootprintCourant[] }>;
  /** Les {cleabs, type} DÉJÀ alertés pour ce dossier (anti-doublon). */
  dejaAlertes(dossierId: number): Promise<ChangementSurveille[]>;
  /** Date du jour (ISO 'YYYY-MM-DD') — injectée pour garder le module de décision PUR. */
  aujourdhui(): Promise<string>;
  envoyer(destinataire: string, sujet: string, corps: string): Promise<void>;
  /** Marque ces changements comme alertés pour ce dossier (anti-doublon). Idempotent (ON CONFLICT DO NOTHING). */
  marquer(dossierId: number, changements: ChangementSurveille[]): Promise<void>;
}

export interface BilanSurveillancePolygones { dossiers: number; aAlerter: number; envoye: boolean }

/**
 * Une passe. Adresse d'alerte vide OU marqueur absent (171 non appliquée) → RIEN. Sinon : pour chaque dossier validé en fenêtre,
 * décide les changements via le module PUR, agrège ceux jamais alertés, envoie UN e-mail récapitulatif (jamais un par changement),
 * puis les marque. L'ENVOI précède le MARQUAGE : un envoi qui échoue laisse les changements non marqués → retentés (jamais perdu, jamais doublé).
 */
export async function executerSurveillancePolygones(deps: DepsSurveillancePolygones): Promise<BilanSurveillancePolygones> {
  const reglages = await deps.lireReglages();
  if (!reglages.active) return { dossiers: 0, aAlerter: 0, envoye: false };             // SURV-2 : interrupteur éteint → on ne calcule/écrit/envoie RIEN
  if (reglages.email.trim() === '') return { dossiers: 0, aAlerter: 0, envoye: false }; // pas de destinataire → surveillance au repos
  if (!(await deps.disponible())) return { dossiers: 0, aAlerter: 0, envoye: false };   // 171 non appliquée → NO-OP propre

  const dossiers = await deps.chargerDossiersEnFenetre(reglages.fenetreJours);
  const aujourdhui = await deps.aujourdhui();

  const aSignaler: DossierSurveille[] = [];
  const marquages: { dossierId: number; changements: ChangementSurveille[] }[] = [];
  for (const d of dossiers) {
    const { valides, courants } = await deps.chargerFootprints(d.dossierId);
    const deja = await deps.dejaAlertes(d.dossierId);
    const changements = surveillerPolygones({
      footprintsValides: valides, footprintsCourants: courants,
      toleranceContourPct: reglages.toleranceContourPct, fenetreJours: reglages.fenetreJours,
      dateValidation: d.valideLe, aujourdhui, dejaAlertes: deja,
    });
    if (changements.length > 0) {
      aSignaler.push({ dossierId: d.dossierId, numDau: d.numDau, changements, lienFiche: lienFichePermis(reglages.siteUrl, d.numDau) });
      marquages.push({ dossierId: d.dossierId, changements });
    }
  }

  const mail = composerAlerteSurveillance(aSignaler);
  if (mail === null) return { dossiers: dossiers.length, aAlerter: 0, envoye: false };

  await deps.envoyer(reglages.email, mail.sujet, mail.corps); // AVANT le marquage
  for (const m of marquages) await deps.marquer(m.dossierId, m.changements);
  return { dossiers: dossiers.length, aAlerter: marquages.reduce((s, m) => s + m.changements.length, 0), envoye: true };
}

/**
 * SURV-1 — COMPTE les dossiers VALIDÉS encore en fenêtre ayant au moins une alerte de surveillance (pastille tuile + onglet). Borné
 * par la fenêtre (un dossier sort du compteur quand sa fenêtre se ferme) → jamais un cumul monotone. RÉSILIENT : table absente
 * (migration 171 non appliquée) → 0, sans casser le comptage global des actions.
 */
export async function compterSurveillanceDossiers(): Promise<number> {
  try {
    const c = await chargerConfigVeille();
    const { rows } = await query<{ n: string | number }>(
      `SELECT count(DISTINCT a.dossier_id) AS n
         FROM permis_surveillance_alerte a
         JOIN permis_rattachement r ON r.dossier_id = a.dossier_id
        WHERE r.etat = 'valide' AND r.valide_le IS NOT NULL
          AND r.valide_le >= current_date - make_interval(days => $1)`,
      [c.surveillanceFenetreJours]);
    return Number(rows[0]?.n ?? 0);
  } catch { return 0; } // 171 non appliquée → 0
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────

export function depsReellesSurveillancePolygones(): DepsSurveillancePolygones {
  return {
    disponible: async () => {
      const { rows } = await query<{ t: string | null }>(`SELECT to_regclass('public.permis_surveillance_alerte') AS t`);
      return rows[0]?.t != null;
    },
    lireReglages: async () => {
      const c = await chargerConfigVeille();
      const siteUrl = (process.env.SITE_URL ?? '').trim();
      return {
        active: c.surveillanceActive,                          // SURV-2 : interrupteur dédié (opt-OUT, défaut true) — EN AND avec l'adresse
        toleranceContourPct: c.surveillanceToleranceContourPct,
        fenetreJours: c.surveillanceFenetreJours,
        email: c.alerteEmail,                                  // adresse d'alerte PARTAGÉE (comme obstacle disparu / superstructures)
        siteUrl: siteUrl === '' ? null : siteUrl,
      };
    },
    chargerDossiersEnFenetre: async (fenetreJours) => {
      // SCOPING serveur : uniquement les rattachements VALIDÉS dont la validation est encore DANS la fenêtre (jamais tout l'univers).
      const { rows } = await query<{ dossier_id: number | string; num_dau: string; valide_le: string | null }>(
        `SELECT r.dossier_id, s.num_dau, to_char(r.valide_le, 'YYYY-MM-DD') AS valide_le
           FROM permis_rattachement r
           JOIN sitadel_dossier s ON s.id = r.dossier_id
          WHERE r.etat = 'valide' AND r.valide_le IS NOT NULL
            AND r.valide_le >= current_date - make_interval(days => $1)`,
        [fenetreJours]);
      return rows.map((r) => ({ dossierId: Number(r.dossier_id), numDau: r.num_dau, valideLe: r.valide_le }));
    },
    chargerFootprints: async (dossierId) => {
      try {
        // RÉFÉRENCE : footprints figés dans la version de gel « validation » la plus récente du dossier (permis_gel_bati).
        const { rows: vRows } = await query<{ cleabs: string | null }>(
          `SELECT b.cleabs FROM permis_gel_bati b
             WHERE b.gel_id = (SELECT id FROM permis_gel WHERE dossier_id = $1 AND gele_par LIKE $2 ORDER BY version DESC LIMIT 1)
               AND b.cleabs IS NOT NULL`,
          [dossierId, `${PREFIXE_GEL_VALIDATION}%`]);
        const valides: FootprintValide[] = vRows.filter((r) => r.cleabs != null).map((r) => ({ cleabs: r.cleabs as string }));

        // COURANTS : bâti BD TOPO courant ∩ empreinte ; pour un cleabs apparié à la référence, écart de contour = différence
        //   symétrique relative à l'aire de la référence (même primitive que rattachementRepo). Non apparié → null.
        const { rows: cRows } = await query<{ cleabs: string | null; chg_rel: string | number | null }>(
          `WITH ref AS (
             SELECT b.cleabs, b.geom FROM permis_gel_bati b
              WHERE b.gel_id = (SELECT id FROM permis_gel WHERE dossier_id = $1 AND gele_par LIKE $2 ORDER BY version DESC LIMIT 1)
           ), emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
           SELECT b.cleabs,
                  CASE WHEN r.cleabs IS NULL THEN NULL
                       ELSE ST_Area(ST_SymDifference(ST_Force2D(b.geom), r.geom)) / NULLIF(ST_Area(r.geom), 0) END AS chg_rel
             FROM batiment b
             CROSS JOIN emp
             LEFT JOIN ref r ON r.cleabs = b.cleabs
            WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom) AND b.cleabs IS NOT NULL`,
          [dossierId, `${PREFIXE_GEL_VALIDATION}%`]);
        const courants: FootprintCourant[] = cRows
          .filter((r) => r.cleabs != null)
          .map((r) => ({ cleabs: r.cleabs as string, changementRelatif: r.chg_rel == null ? null : Number(r.chg_rel) }));

        return { valides, courants };
      } catch {
        return { valides: [], courants: [] }; // registre de gel / empreinte absents → aucune surveillance pour ce dossier (résilient)
      }
    },
    dejaAlertes: async (dossierId) => {
      try {
        const { rows } = await query<{ cleabs: string; type: ChangementSurveille['type'] }>(
          `SELECT cleabs, type FROM permis_surveillance_alerte WHERE dossier_id = $1`, [dossierId]);
        return rows.map((r) => ({ cleabs: r.cleabs, type: r.type }));
      } catch { return []; }
    },
    aujourdhui: async () => {
      const { rows } = await query<{ d: string }>(`SELECT to_char(current_date, 'YYYY-MM-DD') AS d`);
      return rows[0].d;
    },
    envoyer: (destinataire, sujet, corps) => envoyerAlerteReelle(destinataire, sujet, corps),
    marquer: async (dossierId, changements) => {
      for (const c of changements) {
        await query(
          `INSERT INTO permis_surveillance_alerte (dossier_id, cleabs, type, alerte_le) VALUES ($1, $2, $3, now())
           ON CONFLICT (dossier_id, cleabs, type) DO NOTHING`,
          [dossierId, c.cleabs, c.type]);
      }
    },
  };
}
