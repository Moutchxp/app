/**
 * FIG-1 — REGISTRE APPEND-ONLY VERSIONNÉ de l'état d'origine figé d'un permis (migration 169). Rend le figeage OPPOSABLE : chaque
 * « figer » APPEND une VERSION horodatée (jamais un écrasement) ; aucune capture ne disparaît. La garantie d'immuabilité vit EN BASE
 * (triggers permis_gel_append_only) ; ce module n'écrit QUE des INSERT. Les tables de travail (permis_empreinte / permis_parcelle /
 * permis_bati_snapshot) restent la vue « état courant » ; la PREUVE vit ici.
 *
 * 🔴 RÉSILIENCE : tant que la migration 169 n'est pas appliquée, les tables n'existent pas. `gelActif()` le DÉTECTE par un simple
 * SELECT to_regclass (qui ne POISONNE PAS la transaction, contrairement à un INSERT sur table absente) → figerVersionGel est un NO-OP
 * propre (aucun crash), et `figerEmpreinte`/`figerBatiSnapshot` continuent comme avant. Comportement actuel intégralement préservé.
 *
 * IMPUR (base). Module PROPRE : n'importe que `db/client`. Aucune lecture de table de décision, aucune écriture moteur — hors chemin
 * du verdict/golden (gardes ETAN-1 intactes : ces tables ne sont référencées par aucun fichier de app/lib/db ni app/lib/svv).
 */
import { query, withTransaction, type RequeteTx } from '../db/client';

/** Référence stable d'une version d'état figé : l'id du registre + son numéro de version (croissant par dossier). */
export interface VersionGel {
  id: number;
  version: number;
}

export interface ResultatFigerGel {
  enregistre: boolean;      // false = registre indisponible (migration 169 non appliquée) → NO-OP propre
  version?: number;         // numéro de la version APPENDÉE (1, 2, 3, …)
  gelId?: number;           // permis_gel.id de la version appendée
  nbParcelles?: number;     // parcelles d'origine figées dans cette version
  nbBati?: number;          // footprints de bâti figés dans cette version
  raison?: string;          // si non enregistré : pourquoi
}

/** Une ligne d'HISTORIQUE (audit lisible : « quelles versions, quand, avec combien de parcelles/bâti »). */
export interface LigneHistoriqueGel {
  version: number;
  gelLe: string;                       // ISO
  gelePar: string | null;
  empreinteComplete: boolean | null;
  empreinteSurfaceM2: number | null;
  empreinteMillesime: string | null;
  batiCapture: boolean | null;
  batiNbBatiments: number | null;
  nbParcelles: number;
  nbBati: number;
}

/** Le registre versionné existe-t-il ? (migration 169 appliquée). SELECT to_regclass → ne poisonne PAS la transaction en cours. */
export async function gelActif(q: RequeteTx): Promise<boolean> {
  const { rows } = await q<{ t: string | null }>(`SELECT to_regclass('public.permis_gel') AS t`);
  return rows[0]?.t != null;
}

/** Version d'état figé COURANTE (la plus récente) d'un dossier : { id, version } ; null si aucune version ou registre absent. */
export async function versionGelCourante(q: RequeteTx, dossierId: number): Promise<VersionGel | null> {
  if (!(await gelActif(q))) return null;
  const { rows } = await q<{ id: string | number; version: string | number }>(
    `SELECT id, version FROM permis_gel WHERE dossier_id = $1 ORDER BY version DESC LIMIT 1`, [dossierId]);
  const r = rows[0];
  return r ? { id: Number(r.id), version: Number(r.version) } : null;
}

/**
 * FIGE une NOUVELLE VERSION de l'état d'origine d'un permis : APPEND (jamais écrasement) une ligne d'en-tête + les détails
 * parcelles/bâti, par COPIE de l'état COURANT des tables de travail. À appeler APRÈS `figerEmpreinte` + `figerBatiSnapshot` (l'état
 * courant qu'on photographie est celui qu'elles viennent d'écrire). Atomique (withTransaction). NO-OP propre si le registre est absent.
 *
 * ⚠️ La version est `max(version)+1` PAR dossier : une re-capture crée une version 2 et laisse la version 1 intacte. L'UNIQUE
 * (dossier_id, version) EN BASE protège contre deux appends concurrents (l'un des deux échoue plutôt que de dupliquer).
 */
export async function figerVersionGel(dossierId: number, gelePar: string): Promise<ResultatFigerGel> {
  return withTransaction(async (q) => {
    if (!(await gelActif(q))) return { enregistre: false, raison: 'registre de gel indisponible (migration 169 non appliquée)' };

    const { rows: v } = await q<{ prochaine: string | number }>(
      `SELECT COALESCE(max(version), 0) + 1 AS prochaine FROM permis_gel WHERE dossier_id = $1`, [dossierId]);
    const version = Number(v[0]?.prochaine ?? 1);

    // EN-TÊTE : copie de l'empreinte + du résumé bâti COURANTS (LEFT JOIN → une ligne même si l'une des tables est vide).
    const { rows: h } = await q<{ id: string | number }>(
      `INSERT INTO permis_gel (dossier_id, version, gele_par,
                               empreinte_geom, empreinte_surface_m2, empreinte_nb_parcelles, empreinte_complete, empreinte_motif, empreinte_millesime,
                               bati_capture, bati_nb_batiments, bati_motif, bati_source_millesime)
         SELECT $1, $2, $3,
                pe.geom, pe.surface_m2, pe.nb_parcelles, pe.complete, pe.motif, pe.millesime,
                pbc.capture, pbc.nb_batiments, pbc.motif, pbc.source_millesime
           FROM (SELECT $1::bigint AS dossier_id) d
           LEFT JOIN permis_empreinte    pe  ON pe.dossier_id  = d.dossier_id
           LEFT JOIN permis_bati_capture pbc ON pbc.dossier_id = d.dossier_id
         RETURNING id`,
      [dossierId, version, gelePar]);
    const gelId = Number(h[0].id);

    // DÉTAIL parcelles d'origine (copie du geom_snapshot cadastral figé).
    const rp = await q(
      `INSERT INTO permis_gel_parcelle (gel_id, prefixe, section, numero, idu, geom_snapshot, snapshot_millesime)
         SELECT $2, pp.prefixe, pp.section, pp.numero, pp.idu, pp.geom_snapshot, pp.snapshot_millesime
           FROM permis_parcelle pp WHERE pp.dossier_id = $1 AND pp.role = 'origine'`,
      [dossierId, gelId]);

    // DÉTAIL bâti (copie des footprints figés).
    const rb = await q(
      `INSERT INTO permis_gel_bati (gel_id, cleabs, geom, nombre_d_etages, altitude_max_toit, hauteur, date_modification, etat_de_l_objet, usage_1, usage_2)
         SELECT $2, pbs.cleabs, pbs.geom, pbs.nombre_d_etages, pbs.altitude_max_toit, pbs.hauteur, pbs.date_modification, pbs.etat_de_l_objet, pbs.usage_1, pbs.usage_2
           FROM permis_bati_snapshot pbs WHERE pbs.dossier_id = $1`,
      [dossierId, gelId]);

    return { enregistre: true, version, gelId, nbParcelles: rp.rowCount ?? 0, nbBati: rb.rowCount ?? 0 };
  });
}

/** HISTORIQUE complet des versions figées d'un dossier (ordre croissant). `[]` si aucune version ou registre absent (42P01). */
export async function historiqueGel(dossierId: number): Promise<LigneHistoriqueGel[]> {
  try {
    const { rows } = await query<{
      version: string | number; gele_le: string | Date; gele_par: string | null;
      empreinte_complete: boolean | null; empreinte_surface_m2: string | number | null; empreinte_millesime: string | null;
      bati_capture: boolean | null; bati_nb_batiments: number | null; nb_parcelles: string | number; nb_bati: string | number;
    }>(
      `SELECT g.version, g.gele_le, g.gele_par, g.empreinte_complete, g.empreinte_surface_m2, g.empreinte_millesime,
              g.bati_capture, g.bati_nb_batiments,
              (SELECT count(*) FROM permis_gel_parcelle p WHERE p.gel_id = g.id) AS nb_parcelles,
              (SELECT count(*) FROM permis_gel_bati     b WHERE b.gel_id = g.id) AS nb_bati
         FROM permis_gel g WHERE g.dossier_id = $1 ORDER BY g.version ASC`, [dossierId]);
    return rows.map((r) => ({
      version: Number(r.version),
      gelLe: r.gele_le instanceof Date ? r.gele_le.toISOString() : new Date(r.gele_le).toISOString(),
      gelePar: r.gele_par,
      empreinteComplete: r.empreinte_complete,
      empreinteSurfaceM2: r.empreinte_surface_m2 == null ? null : Number(r.empreinte_surface_m2),
      empreinteMillesime: r.empreinte_millesime,
      batiCapture: r.bati_capture,
      batiNbBatiments: r.bati_nb_batiments,
      nbParcelles: Number(r.nb_parcelles),
      nbBati: Number(r.nb_bati),
    }));
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01') return []; // migration 169 absente
    throw e;
  }
}
