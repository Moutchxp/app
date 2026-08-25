/**
 * PROJ-2c — FILE « Projection » (adaptateur impur). Univers = permis dont les DOCUMENTS sont obtenus (demande_dossier.satisfait_le,
 * MÊME critère que l'entrée en Archives) ET dont la nature CRÉE/ÉTEND une emprise (neuve/extension ; surélévation exclue), et qui
 * n'ont PAS encore de projection validée (permis_projection). VALIDER = quitte la file + marque suivi (permis_rattachement en_attente_bati).
 *
 * 🔴 GARDE INCHANGÉE : une emprise reste une RECONSTITUTION. Ce module ne touche NI batiment, NI permis_polygone_altitude, NI le
 * verdict. Il lit permis_corps_batiment / permis_emprise_reconstruite / permis_projection_ignoree, écrit permis_projection et — pour
 * le marquage suivi — UNE ligne permis_rattachement (en_attente_bati) + son événement, exactement comme l'ouverture manuelle (M5).
 */
import { query, withTransaction } from '../db/client';
import { classer, type DossierClassable } from '../sitadel/priorite';
import type { ConfigVeille } from '../sitadel/veilleConfig';
import { listerEmprises, listerIgnorees } from './empriseReconstruiteRepo';
import { verdictProjectionBatiments } from './projectionBatiments';

export interface LigneProjection {
  dossierId: number;
  numDau: string;
  communeNom: string | null;
  natureLibelle: string;   // classer(...).libelle (neuve / extension / immeuble neuf)
  nbBatiments: number;     // permis_corps_batiment du permis (à tracer ou ignorer)
  satisfaitLe: string | null;
}

// Prédicat SQL de nature CONCERNÉE (miroir EXACT de concerneProjectionEmprise : immeuble neuf/construction neuve = nature '1',
// extension = i_extension OU nature '3'/'5'). Surélévation SEULE (i_surelevation sans neuve ni extension) → exclue.
const CONCERNE_SQL = `(s.nature_projet_completee = '1' OR s.i_extension OR s.nature_projet_completee IN ('3','5'))`;

/** Table absente (149/150/151 pas encore appliquées) ? Détection par code Postgres 42P01. */
function estTableAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01';
}

async function requeteFile(cfg: ConfigVeille, avecJalon: boolean): Promise<LigneProjection[]> {
  const jalon = avecJalon ? `AND NOT EXISTS (SELECT 1 FROM permis_projection pp WHERE pp.dossier_id = s.id)` : '';
  const { rows } = await query<{
    dossier_id: number; num_dau: string; commune_nom: string | null; type: 'PC' | 'PD';
    nature_projet_completee: string | null; i_extension: boolean | null; i_surelevation: boolean | null;
    nb_lgt_tot_crees: number | null; surf_creee: string | number | null; nb_batiments: number; satisfait_le: string | null;
  }>(
    `SELECT s.id::int AS dossier_id, s.num_dau, c.nom AS commune_nom, s.type,
            s.nature_projet_completee, s.i_extension, s.i_surelevation, s.nb_lgt_tot_crees, s.surf_creee,
            (SELECT count(*) FROM permis_corps_batiment b WHERE b.dossier_id = s.id)::int AS nb_batiments,
            max(dd.satisfait_le)::date::text AS satisfait_le
       FROM demande_dossier dd
       JOIN sitadel_dossier s ON s.id = dd.dossier_id
       LEFT JOIN commune c ON c.code_insee = s.code_insee
      WHERE dd.satisfait_le IS NOT NULL AND ${CONCERNE_SQL} ${jalon}
      GROUP BY s.id, s.num_dau, c.nom, s.type, s.nature_projet_completee, s.i_extension, s.i_surelevation, s.nb_lgt_tot_crees, s.surf_creee
      ORDER BY max(dd.satisfait_le) DESC, s.num_dau`,
  );
  return rows.map((r) => {
    const d: DossierClassable = { type: r.type, natureProjetCompletee: r.nature_projet_completee, iExtension: r.i_extension, iSurelevation: r.i_surelevation, nbLgtTotCrees: r.nb_lgt_tot_crees, surfCreee: r.surf_creee === null ? null : Number(r.surf_creee) };
    return { dossierId: r.dossier_id, numDau: r.num_dau, communeNom: r.commune_nom, natureLibelle: classer(d, cfg).libelle, nbBatiments: r.nb_batiments, satisfaitLe: r.satisfait_le };
  });
}

/** File « Projection » : permis éligibles NON encore validés. Résilient : si permis_projection (151) n'existe pas → jalon ignoré (tous éligibles). */
export async function listerFileProjection(cfg: ConfigVeille): Promise<LigneProjection[]> {
  try { return await requeteFile(cfg, true); }
  catch (e) { if (estTableAbsente(e)) return requeteFile(cfg, false); throw e; }
}

/** Compteur de la file (pastille). Même critère que la liste. `0` si les tables amont manquent. */
export async function compterFileProjection(cfg: ConfigVeille): Promise<number> {
  try { return (await listerFileProjection(cfg)).length; }
  catch { return 0; }
}

export type ResultatValidationProjection =
  | { ok: true; marqueSuivi: boolean }
  | { ok: false; motif: string };

/**
 * VALIDER la projection d'un dossier. 🔴 Condition VÉRIFIÉE CÔTÉ SERVEUR (jamais la confiance au client) : chaque bâtiment a une
 * emprise tracée OU une projection ignorée (verdictProjectionBatiments). Si OK : jalon permis_projection + marquage suivi
 * (permis_rattachement en_attente_bati, idempotent via UNIQUE(dossier_id)) + événement. Sinon : refus explicite.
 */
export async function validerProjection(dossierId: number, par: string | null): Promise<ResultatValidationProjection> {
  if (!Number.isInteger(dossierId) || dossierId <= 0) return { ok: false, motif: 'dossier invalide' };
  // Bâtiments déclarés + emprises + projections ignorées → verdict (pur).
  const [{ rows: bats }, emprises, ignores] = await Promise.all([
    query<{ id: number; repere: string | null }>(`SELECT id::int AS id, repere FROM permis_corps_batiment WHERE dossier_id = $1`, [dossierId]),
    listerEmprises(dossierId),
    listerIgnorees(dossierId),
  ]);
  const verdict = verdictProjectionBatiments(
    bats.map((b) => ({ corpsId: b.id, repere: b.repere })),
    emprises.map((e) => e.corpsId).filter((c): c is number => c !== null),
    ignores.map((i) => i.corpsId),
  );
  if (!verdict.peutValider) return { ok: false, motif: `projection incomplète — ${verdict.libelle}` };

  try {
    return await withTransaction(async (q) => {
      await q(`INSERT INTO permis_projection (dossier_id, validee_par) VALUES ($1, $2) ON CONFLICT (dossier_id) DO NOTHING`, [dossierId, par]);
      // Marquage SUIVI : crée le dossier de rattachement en « en_attente_bati » S'IL N'EXISTE PAS (idempotent). Le détecteur de
      // delta l'ouvrira en 'arbitrage_demande' quand BD TOPO livrera le bâti. Verdict SENTINELLE (jamais un verdict de détection).
      const { rows: r } = await q<{ id: number }>(
        `INSERT INTO permis_rattachement (dossier_id, regime, verdict, etat, motif, detecte_le, reevalue_le)
           VALUES ($1, 'indetermine', 'SUIVI_APRES_PROJECTION', 'en_attente_bati', 'projection validée : en attente d’une mise à jour BD TOPO', now(), now())
         ON CONFLICT (dossier_id) DO NOTHING RETURNING id`, [dossierId]);
      const marqueSuivi = r.length > 0;
      if (marqueSuivi) {
        await q(`INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
                 VALUES ($1, 'suivi_apres_projection', NULL, 'en_attente_bati', $2::jsonb, $3)`,
          [r[0].id, JSON.stringify({ origine: 'projection' }), par]);
      }
      return { ok: true, marqueSuivi } as const;
    });
  } catch (e) {
    if (estTableAbsente(e)) return { ok: false, motif: 'file de projection indisponible (migration 151 non appliquée)' };
    throw e;
  }
}
