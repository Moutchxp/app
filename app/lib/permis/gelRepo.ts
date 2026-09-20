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
import { cleabsAppartenantPermis } from './appartenancePermis'; // VOIS-1 — le gel fige le bâti DU PERMIS seul (voisins exclus), même critère que la projection

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
  nbCorps?: number;         // B1 (RATT-EDIT) — corps de bâtiment figés en détail (permis_gel_corps) ; renseigné par figerVersionValidation
  nbEmprises?: number;      // B1 (RATT-EDIT) — emprises reconstruites figées en détail (permis_gel_emprise) ; renseigné par figerVersionValidation
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
  // VOIS-1 — bâti figé DU PERMIS seul (jugé sur le footprint FIGÉ du snapshot) : le gel copie la même sélection que « Bâti au moment de l'analyse ».
  const permisCleabs = [...await cleabsAppartenantPermis(dossierId, 'snapshot')];
  return withTransaction(async (q) => {
    if (!(await gelActif(q))) return { enregistre: false, raison: 'registre de gel indisponible (migration 169 non appliquée)' };

    const { rows: v } = await q<{ prochaine: string | number }>(
      `SELECT COALESCE(max(version), 0) + 1 AS prochaine FROM permis_gel WHERE dossier_id = $1`, [dossierId]);
    const version = Number(v[0]?.prochaine ?? 1);

    // EN-TÊTE : copie de l'empreinte + du résumé bâti COURANTS. VOIS-1 : le COMPTE bâti suit le filtre (capture=true → nb permis ; sinon inchangé).
    const { rows: h } = await q<{ id: string | number }>(
      `INSERT INTO permis_gel (dossier_id, version, gele_par,
                               empreinte_geom, empreinte_surface_m2, empreinte_nb_parcelles, empreinte_complete, empreinte_motif, empreinte_millesime,
                               bati_capture, bati_nb_batiments, bati_motif, bati_source_millesime)
         SELECT $1, $2, $3,
                pe.geom, pe.surface_m2, pe.nb_parcelles, pe.complete, pe.motif, pe.millesime,
                pbc.capture, CASE WHEN pbc.capture IS TRUE THEN $4::int ELSE pbc.nb_batiments END, pbc.motif, pbc.source_millesime
           FROM (SELECT $1::bigint AS dossier_id) d
           LEFT JOIN permis_empreinte    pe  ON pe.dossier_id  = d.dossier_id
           LEFT JOIN permis_bati_capture pbc ON pbc.dossier_id = d.dossier_id
         RETURNING id`,
      [dossierId, version, gelePar, permisCleabs.length]);
    const gelId = Number(h[0].id);

    // DÉTAIL parcelles d'origine (copie du geom_snapshot cadastral figé).
    const rp = await q(
      `INSERT INTO permis_gel_parcelle (gel_id, prefixe, section, numero, idu, geom_snapshot, snapshot_millesime)
         SELECT $2, pp.prefixe, pp.section, pp.numero, pp.idu, pp.geom_snapshot, pp.snapshot_millesime
           FROM permis_parcelle pp WHERE pp.dossier_id = $1 AND pp.role = 'origine'`,
      [dossierId, gelId]);

    // DÉTAIL bâti (copie des footprints figés) — VOIS-1 : bâti DU PERMIS seul.
    const rb = await q(
      `INSERT INTO permis_gel_bati (gel_id, cleabs, geom, nombre_d_etages, altitude_max_toit, hauteur, date_modification, etat_de_l_objet, usage_1, usage_2)
         SELECT $2, pbs.cleabs, pbs.geom, pbs.nombre_d_etages, pbs.altitude_max_toit, pbs.hauteur, pbs.date_modification, pbs.etat_de_l_objet, pbs.usage_1, pbs.usage_2
           FROM permis_bati_snapshot pbs WHERE pbs.dossier_id = $1 AND pbs.cleabs = ANY($3)`,
      [dossierId, gelId, permisCleabs]);

    return { enregistre: true, version, gelId, nbParcelles: rp.rowCount ?? 0, nbBati: rb.rowCount ?? 0 };
  });
}

/** SURV-1 — préfixe de provenance d'une version figée AU MOMENT DE LA VALIDATION d'un rattachement (par opposition aux versions
 *  d'origine posées à l'extraction). Sert de marqueur : la surveillance retrouve sa RÉFÉRENCE par `gele_par LIKE 'validation:%'`. */
export const PREFIXE_GEL_VALIDATION = 'validation:';

/** RATT-EDIT (lot C1) — préfixe d'une version figée AU MOMENT D'UNE RESTAURATION de la validation d'origine. DISTINCT de `validation:`
 *  À DESSEIN : une restauration n'est PAS une validation → `versionValidationCourante` (LIKE 'validation:%') l'IGNORE, donc la référence
 *  de surveillance reste la dernière validation ET le marqueur B3 « à revalider » s'allume après restauration (rule ③). C'est bien une
 *  entrée d'historique append-only (audit : quand/qui a restauré), restaurable elle-même plus tard. */
export const PREFIXE_GEL_RESTAURATION = 'restauration:';

/** SURV-1 — version de VALIDATION la plus récente d'un dossier (gele_par préfixé 'validation:') : { id, version } ; null si aucune ou
 *  registre absent. C'est la RÉFÉRENCE géométrique de la surveillance des polygones (permis_gel_bati de cette version). */
export async function versionValidationCourante(q: RequeteTx, dossierId: number): Promise<VersionGel | null> {
  if (!(await gelActif(q))) return null;
  const { rows } = await q<{ id: string | number; version: string | number }>(
    `SELECT id, version FROM permis_gel WHERE dossier_id = $1 AND gele_par LIKE $2 ORDER BY version DESC LIMIT 1`,
    [dossierId, `${PREFIXE_GEL_VALIDATION}%`]);
  const r = rows[0];
  return r ? { id: Number(r.id), version: Number(r.version) } : null;
}

/**
 * SURV-1 — FIGE une nouvelle VERSION de gel AU MOMENT DE LA VALIDATION d'un rattachement, pour servir de RÉFÉRENCE à la surveillance
 * des polygones. RÉEMPLOI des tables FIG-1 (permis_gel / permis_gel_bati), mais — contrairement à `figerVersionGel` — le détail bâti est
 * copié du BÂTI COURANT ∩ empreinte (l'état validé, où le bâtiment neuf est APPARU), JAMAIS du snapshot d'ORIGINE : la référence doit
 * refléter ce qui a été validé, pas l'état d'avant-travaux. Ne MUTE PAS `permis_bati_snapshot` (baseline de la détection pré-validation).
 *
 * `gele_par` est préfixé `PREFIXE_GEL_VALIDATION` (ex. 'validation:admin:decision', 'validation:moteur:auto') → repérable par la
 * surveillance. Atomique (withTransaction). NO-OP propre si le registre est absent (migration 169 non appliquée). L'UNIQUE (dossier_id,
 * version) EN BASE protège contre deux appends concurrents.
 *
 * 🔴 B1 (RATT-EDIT) — CAPTURE DÉTAIL CORPS/EMPRISE : en plus de l'en-tête + parcelles + bâti, cette validation fige DEUX snapshots COMPLETS
 * (tables 225/226, append-only), suffisants à eux seuls pour RESTAURER l'état de travail au lot C1 — y compris RECRÉER un corps ou une
 * emprise SUPPRIMÉS depuis (supprimerCorps / supprimerEmprise = DELETE dur) :
 *   · permis_gel_corps   — une ligne par corps du dossier (permis_corps_batiment), actif OU inactif : sommet + marqueurs (225) + les 7 autres
 *                          mesures + origines + repère, adresse, emprise, cleabs_affecte, actif, desactive_le/_par, maj_le/_par (226). Toutes colonnes sauf id (→ corps_id) et dossier_id.
 *   · permis_gel_emprise — une ligne par emprise reconstruite du dossier (permis_emprise_reconstruite) : geom + ajustement + surface + validee
 *                          (225) + libelle, calage, provenance, reconstitution, piece_id, page, residu_m, cree_le/_par (226). Toutes colonnes sauf id (→ emprise_id) et dossier_id.
 * Géométries copiées TELLES QUELLES (miroir exact : POLYGON/2154 pour corps.emprise, GEOMETRY/2154 pour emprise.geom). Aucun backfill : les
 * permis déjà validés restent sans détail (C1 verra `versionValidationCourante` = null → rien à restaurer).
 */
export async function figerVersionValidation(dossierId: number, valPar: string, prefixe: string = PREFIXE_GEL_VALIDATION): Promise<ResultatFigerGel> {
  // VOIS-1 — bâti figé DU PERMIS seul (bâti COURANT ∩ empreinte, filtré par batimentAppartientPermis) : jamais les voisins.
  // RATT-EDIT (lot C1) — `prefixe` optionnel (défaut PREFIXE_GEL_VALIDATION, callers inchangés) : la RESTAURATION passe PREFIXE_GEL_RESTAURATION
  //   pour figer l'état RESTAURÉ sans en faire une référence de validation (cf. PREFIXE_GEL_RESTAURATION).
  const permisCleabs = [...await cleabsAppartenantPermis(dossierId, 'batiment')];
  return withTransaction(async (q) => {
    if (!(await gelActif(q))) return { enregistre: false, raison: 'registre de gel indisponible (migration 169 non appliquée)' };

    const { rows: v } = await q<{ prochaine: string | number }>(
      `SELECT COALESCE(max(version), 0) + 1 AS prochaine FROM permis_gel WHERE dossier_id = $1`, [dossierId]);
    const version = Number(v[0]?.prochaine ?? 1);
    const gelePar = `${prefixe}${valPar}`;

    // EN-TÊTE : copie de l'empreinte COURANTE ; VOIS-1 : le résumé bâti = COMPTE du bâti DU PERMIS ∩ empreinte (pas la capture d'origine, pas les voisins).
    const { rows: h } = await q<{ id: string | number }>(
      `INSERT INTO permis_gel (dossier_id, version, gele_par,
                               empreinte_geom, empreinte_surface_m2, empreinte_nb_parcelles, empreinte_complete, empreinte_motif, empreinte_millesime,
                               bati_capture, bati_nb_batiments, bati_motif, bati_source_millesime)
         SELECT $1, $2, $3,
                pe.geom, pe.surface_m2, pe.nb_parcelles, pe.complete, pe.motif, pe.millesime,
                (pe.geom IS NOT NULL AND pe.complete IS TRUE),
                CASE WHEN pe.geom IS NOT NULL THEN $4::int ELSE NULL END,
                'SURV-1 — gel de référence à la validation (bâti courant ∩ empreinte)', NULL
           FROM (SELECT $1::bigint AS dossier_id) d
           LEFT JOIN permis_empreinte pe ON pe.dossier_id = d.dossier_id
         RETURNING id`,
      [dossierId, version, gelePar, permisCleabs.length]);
    const gelId = Number(h[0].id);

    // DÉTAIL parcelles d'origine (copie du geom_snapshot cadastral figé — identique à figerVersionGel).
    const rp = await q(
      `INSERT INTO permis_gel_parcelle (gel_id, prefixe, section, numero, idu, geom_snapshot, snapshot_millesime)
         SELECT $2, pp.prefixe, pp.section, pp.numero, pp.idu, pp.geom_snapshot, pp.snapshot_millesime
           FROM permis_parcelle pp WHERE pp.dossier_id = $1 AND pp.role = 'origine'`,
      [dossierId, gelId]);

    // DÉTAIL bâti = BÂTI COURANT ∩ empreinte (footprint 2D figé). VOIS-1 : bâti DU PERMIS seul. Même primitive que figerBatiSnapshot, sans toucher le snapshot.
    const rb = await q(
      `INSERT INTO permis_gel_bati (gel_id, cleabs, geom, nombre_d_etages, altitude_max_toit, hauteur, date_modification, etat_de_l_objet, usage_1, usage_2)
         SELECT $2, b.cleabs, ST_Multi(ST_Force2D(b.geom)), b.nombre_d_etages, b.altitude_maximale_toit, b.hauteur, b.date_modification, b.etat_de_l_objet, b.usage_1, b.usage_2
           FROM batiment b
           JOIN permis_empreinte pe ON pe.dossier_id = $1
          WHERE pe.geom IS NOT NULL AND b.geom && pe.geom AND ST_Intersects(b.geom, pe.geom) AND b.cleabs = ANY($3)`,
      [dossierId, gelId, permisCleabs]);

    // B1 (RATT-EDIT) — DÉTAIL CORPS : snapshot COMPLET de CHAQUE corps du dossier (actif OU inactif → un corps désactivé/supprimé reste
    //   restaurable). Copie de TOUTES les colonnes de permis_corps_batiment sauf id (→ corps_id, référence historique) et dossier_id (porté par le gel).
    const rc = await q(
      `INSERT INTO permis_gel_corps (gel_id, corps_id,
              altitude_sommet_ngf, altitude_sommet_ngf_origine, altitude_sommet_ngf_confirme_le, altitude_sommet_ngf_confirme_par,
              repere, nb_etages, nb_etages_origine, nb_niveaux_sous_sol, nb_niveaux_sous_sol_origine,
              altitude_dernier_plancher_ngf, altitude_dernier_plancher_ngf_origine, hauteur_relative_m, hauteur_relative_m_origine,
              altitude_terrain_naturel_ngf, altitude_terrain_naturel_ngf_origine, hauteur_max_plu_ngf, hauteur_max_plu_ngf_origine,
              altitude_plateau_nivellement_ngf, altitude_plateau_nivellement_ngf_origine, adresse, adresse_origine,
              emprise, emprise_origine, cleabs_affecte, nom_repli,
              emprise_validee_id, emprise_validee_le, emprise_validee_par, actif, desactive_le, desactive_par, maj_le, maj_par)
         SELECT $2, c.id,
              c.altitude_sommet_ngf, c.altitude_sommet_ngf_origine, c.altitude_sommet_ngf_confirme_le, c.altitude_sommet_ngf_confirme_par,
              c.repere, c.nb_etages, c.nb_etages_origine, c.nb_niveaux_sous_sol, c.nb_niveaux_sous_sol_origine,
              c.altitude_dernier_plancher_ngf, c.altitude_dernier_plancher_ngf_origine, c.hauteur_relative_m, c.hauteur_relative_m_origine,
              c.altitude_terrain_naturel_ngf, c.altitude_terrain_naturel_ngf_origine, c.hauteur_max_plu_ngf, c.hauteur_max_plu_ngf_origine,
              c.altitude_plateau_nivellement_ngf, c.altitude_plateau_nivellement_ngf_origine, c.adresse, c.adresse_origine,
              c.emprise, c.emprise_origine, c.cleabs_affecte, c.nom_repli,
              c.emprise_validee_id, c.emprise_validee_le, c.emprise_validee_par, c.actif, c.desactive_le, c.desactive_par, c.maj_le, c.maj_par
           FROM permis_corps_batiment c WHERE c.dossier_id = $1`,
      [dossierId, gelId]);

    // B1 (RATT-EDIT) — DÉTAIL EMPRISE : snapshot COMPLET de CHAQUE emprise reconstruite du dossier (l'ENSEMBLE → restaure aussi
    //   suppressions/ajouts). Copie de TOUTES les colonnes de permis_emprise_reconstruite sauf id (→ emprise_id) et dossier_id. geom copié tel quel.
    const re = await q(
      `INSERT INTO permis_gel_emprise (gel_id, emprise_id, corps_id,
              geom, ajustement, surface_m2, validee_le, validee_par,
              libelle, calage, provenance, reconstitution, piece_id, page, residu_m, cree_par, cree_le)
         SELECT $2, e.id, e.corps_id,
              e.geom, e.ajustement, e.surface_m2, e.validee_le, e.validee_par,
              e.libelle, e.calage, e.provenance, e.reconstitution, e.piece_id, e.page, e.residu_m, e.cree_par, e.cree_le
           FROM permis_emprise_reconstruite e WHERE e.dossier_id = $1`,
      [dossierId, gelId]);

    return { enregistre: true, version, gelId, nbParcelles: rp.rowCount ?? 0, nbBati: rb.rowCount ?? 0, nbCorps: rc.rowCount ?? 0, nbEmprises: re.rowCount ?? 0 };
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
