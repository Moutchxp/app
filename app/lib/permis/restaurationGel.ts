/**
 * RATT-EDIT (lot C1) — RESTAURATION de la validation d'origine (ou d'une version de gel choisie). Réécrit les tables de TRAVAIL
 * (permis_corps_batiment + permis_emprise_reconstruite) depuis un snapshot de gel (B1/226), PUIS appende une version 'restauration:<par>'
 * (audit, restaurable) et un événement. IMPUR (base), atomique pour la réécriture (withTransaction).
 *
 * 🔴 RIEN N'EST EFFACÉ DE L'HISTORIQUE : les tables de gel sont append-only (trigger). Toutes les versions (origine, revalidations,
 *    restaurations antérieures) restent en base et consultables ; la restauration AJOUTE une version, elle ne « gomme » rien (rule ①).
 * 🔴 RECRÉE LES SUPPRIMÉS : supprimerCorps / supprimerEmprise sont des DELETE durs. Les id serial ne sont JAMAIS réattribués par Postgres →
 *    un `corps_id`/`emprise_id` figé qui n'existe plus a été supprimé → on le RECRÉE (nouvel id) ; sinon on le remet à l'état figé (UPDATE).
 *    Les liens corps ↔ emprises sont reconstitués via un remap old→new (corpsRemap, empriseRemap). La géométrie ne quitte jamais le SQL.
 * 🔴 APRÈS RESTAURATION → « À REVALIDER » (rule ③) : la réécriture pose maj_le=now() sur les corps → le marqueur B3 (maj_le > dernière
 *    validation) s'allume, et la version 'restauration:' n'est PAS une référence de validation (PREFIXE distinct).
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import { figerVersionValidation, PREFIXE_GEL_RESTAURATION } from './gelRepo';

export interface VersionRestaurable {
  gelId: number;
  version: number;
  type: 'validation_initiale' | 'revalidation' | 'restauration' | 'autre';
  dateIso: string;
  auteurNom: string | null; // nom résolu si l'auteur est un compte ; sinon libellé générique (« un administrateur », « automatique »)
}

export interface ResultatRestauration {
  ok: boolean;
  motif?: string;
  versionGel?: number; // n° de la version 'restauration:' appendée (audit)
  nbCorps?: number;    // corps restaurés (recréés ou remis à l'état figé)
  nbEmprises?: number; // emprises réécrites depuis le gel
}

/** Libellé d'auteur lisible pour une version dont le suffixe `gele_par` n'est pas un id de compte (validations génériques). */
function libelleAuteurGenerique(gelePar: string): string | null {
  const suffixe = gelePar.replace(/^[a-z]+:/, ''); // retire le préfixe 'validation:' / 'restauration:'
  if (suffixe === 'admin:decision') return 'un administrateur';
  if (suffixe === 'moteur:auto') return 'validation automatique';
  return null;
}

/**
 * Versions de gel RESTAURABLES d'un dossier : uniquement celles qui PORTENT un snapshot de corps (B1+) — les versions d'origine
 * antérieures à B1 (migration:169, sans détail) ne sont PAS restaurables. Chacune : type (validation initiale / revalidation /
 * restauration), date et auteur EN CLAIR. Vide = aucune version restaurable (cas majoritaire du stock actuel) → bouton désactivé côté écran.
 */
export async function versionsRestaurables(dossierId: number): Promise<VersionRestaurable[]> {
  if (!Number.isInteger(dossierId) || dossierId <= 0) return [];
  try {
    const { rows } = await query<{ id: string | number; version: string | number; gele_par: string | null; gele_le: string | Date; auteur_nom: string | null }>(
      `SELECT g.id, g.version, g.gele_par, g.gele_le,
              (SELECT nullif(btrim(concat_ws(' ', u.prenom, u.nom)), '')
                 FROM admin_utilisateur u WHERE u.id::text = regexp_replace(g.gele_par, '^[a-z]+:', '') LIMIT 1) AS auteur_nom
         FROM permis_gel g
        WHERE g.dossier_id = $1
          AND (g.gele_par LIKE 'validation:%' OR g.gele_par LIKE 'restauration:%')
          AND EXISTS (SELECT 1 FROM permis_gel_corps gc WHERE gc.gel_id = g.id)
        ORDER BY g.version ASC`, [dossierId]);
    let vuValidation = false;
    return rows.map((r) => {
      const gp = r.gele_par ?? '';
      let type: VersionRestaurable['type'];
      if (gp.startsWith('validation:')) { type = vuValidation ? 'revalidation' : 'validation_initiale'; vuValidation = true; }
      else if (gp.startsWith('restauration:')) type = 'restauration';
      else type = 'autre';
      return {
        gelId: Number(r.id), version: Number(r.version), type,
        dateIso: r.gele_le instanceof Date ? r.gele_le.toISOString() : new Date(r.gele_le).toISOString(),
        auteurNom: r.auteur_nom ?? libelleAuteurGenerique(gp),
      };
    });
  } catch { return []; } // registre de gel / colonnes de détail absents → aucune version restaurable
}

// Colonnes COPIÉES d'un corps figé vers le corps de travail (toutes sauf id/dossier_id/emprise_validee_id — ce dernier remappé en phase 5).
const COLS_CORPS = `repere, nb_etages, nb_etages_origine, nb_niveaux_sous_sol, nb_niveaux_sous_sol_origine,
  altitude_dernier_plancher_ngf, altitude_dernier_plancher_ngf_origine, altitude_sommet_ngf, altitude_sommet_ngf_origine,
  hauteur_relative_m, hauteur_relative_m_origine, altitude_terrain_naturel_ngf, altitude_terrain_naturel_ngf_origine,
  emprise, emprise_origine, adresse, adresse_origine, cleabs_affecte,
  altitude_sommet_ngf_confirme_le, altitude_sommet_ngf_confirme_par,
  hauteur_max_plu_ngf, hauteur_max_plu_ngf_origine, altitude_plateau_nivellement_ngf, altitude_plateau_nivellement_ngf_origine,
  nom_repli, actif, desactive_le, desactive_par, emprise_validee_le, emprise_validee_par`;
const COLS_CORPS_GC = COLS_CORPS.split(',').map((c) => `gc.${c.trim()}`).join(', ');
const SETS_CORPS = COLS_CORPS.split(',').map((c) => { const n = c.trim(); return `${n}=gc.${n}`; }).join(', ');

/**
 * RESTAURE le dossier depuis la version de gel `gelId` (qui doit lui appartenir et porter un snapshot). Réécriture ATOMIQUE puis version
 * 'restauration:<par>' + événement (best-effort, la réécriture étant acquise). La CAPACITÉ (peutModifierPermis) est vérifiée par la ROUTE.
 */
export async function restaurerVersionGel(dossierId: number, gelId: number, par: string): Promise<ResultatRestauration> {
  if (!Number.isInteger(dossierId) || dossierId <= 0 || !Number.isInteger(gelId) || gelId <= 0) return { ok: false, motif: 'requête invalide' };
  let nbCorps = 0, nbEmprises = 0;
  const rewrite = await withTransaction(async (q: RequeteTx) => {
    // 1. La version appartient-elle au dossier ET porte-t-elle un snapshot de corps ? (le cas « aucune version » est géré côté liste/écran.)
    const { rows: gv } = await q<{ n: string | number }>(
      `SELECT (SELECT count(*) FROM permis_gel_corps gc WHERE gc.gel_id = g.id) AS n FROM permis_gel g WHERE g.id = $1 AND g.dossier_id = $2`, [gelId, dossierId]);
    if (gv.length === 0) return { ok: false as const, motif: 'version de gel introuvable pour ce permis' };
    if (Number(gv[0].n) === 0) return { ok: false as const, motif: 'cette version ne contient aucun état de bâtiment restaurable' };

    // 2. CORPS : recréer les supprimés (INSERT, nouvel id), remettre les existants à l'état figé (UPDATE). Remap corps_id figé → id courant.
    const { rows: gcorps } = await q<{ id: number; corps_id: number | null; emprise_validee_id: number | null }>(
      `SELECT id, corps_id, emprise_validee_id FROM permis_gel_corps WHERE gel_id = $1 ORDER BY id`, [gelId]);
    const corpsRemap = new Map<number, number>();
    const idsRestaures: number[] = [];
    const empriseValideeSource: { curId: number; oldEmpriseValideeId: number | null }[] = [];
    for (const gc of gcorps) {
      const oldId = gc.corps_id;
      const existe = oldId != null && (await q<{ e: boolean }>(`SELECT EXISTS(SELECT 1 FROM permis_corps_batiment WHERE id = $1 AND dossier_id = $2) AS e`, [oldId, dossierId])).rows[0]?.e === true;
      let curId: number;
      if (existe) {
        await q(`UPDATE permis_corps_batiment cb SET ${SETS_CORPS}, emprise_validee_id = NULL, maj_le = now(), maj_par = $3
                   FROM permis_gel_corps gc WHERE gc.id = $1 AND cb.id = $2`, [gc.id, oldId, par]);
        curId = oldId as number;
      } else {
        const { rows: ins } = await q<{ id: number }>(
          `INSERT INTO permis_corps_batiment (dossier_id, ${COLS_CORPS}, maj_le, maj_par)
             SELECT $2, ${COLS_CORPS_GC}, now(), $3 FROM permis_gel_corps gc WHERE gc.id = $1
             RETURNING id::int AS id`, [gc.id, dossierId, par]);
        curId = ins[0].id;
      }
      if (oldId != null) corpsRemap.set(oldId, curId);
      idsRestaures.push(curId);
      empriseValideeSource.push({ curId, oldEmpriseValideeId: gc.emprise_validee_id });
    }
    // 3. Corps AJOUTÉS APRÈS la version (présents en base, absents du gel) : désactivés en SOFT (jamais de DELETE dur).
    await q(`UPDATE permis_corps_batiment SET actif = false, desactive_le = now(), desactive_par = $2, maj_le = now(), maj_par = $2
              WHERE dossier_id = $1 AND actif AND NOT (id = ANY($3::bigint[]))`, [dossierId, par, idsRestaures.length ? idsRestaures : [-1]]);

    // 4. EMPRISES : réécriture complète = DELETE des courantes + INSERT des figées (corps_id remappé) → lien corps ↔ emprises reconstitué.
    await q(`DELETE FROM permis_emprise_reconstruite WHERE dossier_id = $1`, [dossierId]);
    const { rows: gempr } = await q<{ id: number; emprise_id: number | null; corps_id: number | null }>(
      `SELECT id, emprise_id, corps_id FROM permis_gel_emprise WHERE gel_id = $1 ORDER BY id`, [gelId]);
    const empriseRemap = new Map<number, number>();
    for (const ge of gempr) {
      const corpsCourant = ge.corps_id == null ? null : (corpsRemap.get(ge.corps_id) ?? null);
      const { rows: ins } = await q<{ id: number }>(
        `INSERT INTO permis_emprise_reconstruite
           (dossier_id, libelle, geom, surface_m2, piece_id, page, calage, residu_m, reconstitution, cree_par, cree_le, corps_id, provenance, ajustement, validee_le, validee_par)
         SELECT $2, ge.libelle, ge.geom, ge.surface_m2, ge.piece_id, ge.page, ge.calage, ge.residu_m, ge.reconstitution, ge.cree_par, COALESCE(ge.cree_le, now()), $3, ge.provenance, ge.ajustement, ge.validee_le, ge.validee_par
           FROM permis_gel_emprise ge WHERE ge.id = $1
         RETURNING id::int AS id`, [ge.id, dossierId, corpsCourant]);
      if (ge.emprise_id != null) empriseRemap.set(ge.emprise_id, ins[0].id);
    }

    // 5. Répare le pointeur legacy corps.emprise_validee_id via le remap d'emprises (null si l'emprise pointée n'existe plus dans la version).
    for (const { curId, oldEmpriseValideeId } of empriseValideeSource) {
      if (oldEmpriseValideeId == null) continue;
      await q(`UPDATE permis_corps_batiment SET emprise_validee_id = $2 WHERE id = $1`, [curId, empriseRemap.get(oldEmpriseValideeId) ?? null]);
    }
    nbCorps = gcorps.length; nbEmprises = gempr.length;
    return { ok: true as const };
  });
  if (!rewrite.ok) return rewrite;

  // 6. APPENDE la version 'restauration:<par>' (état restauré, restaurable + audit) puis l'événement. Best-effort : la réécriture est acquise.
  let versionGel: number | undefined;
  try { const v = await figerVersionValidation(dossierId, par, PREFIXE_GEL_RESTAURATION); if (v.enregistre) versionGel = v.version; } catch { /* isolé : la réécriture reste acquise */ }
  try {
    await withTransaction(async (q: RequeteTx) => {
      const rid = (await q<{ id: number }>(`SELECT id FROM permis_rattachement WHERE dossier_id = $1`, [dossierId])).rows[0]?.id;
      if (rid != null) await q(
        `INSERT INTO permis_rattachement_evenement (rattachement_id, type, details, par) VALUES ($1, 'restauration', $2::jsonb, $3)`,
        [rid, JSON.stringify({ gelIdSource: gelId, versionRestauration: versionGel ?? null }), par]);
    });
  } catch { /* événement best-effort */ }
  return { ok: true, versionGel, nbCorps, nbEmprises };
}
