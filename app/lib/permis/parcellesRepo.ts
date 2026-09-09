/**
 * N3-E — DÉPÔT des parcelles cadastrales (table `permis_parcelle`, migration 112) + RATTACHEMENT à `parcelle` par l'IDU (géométrie).
 * IMPUR (base). Module PROPRE : n'importe que `db/client`. `parcelle.id` (IDU) est indexé (migration 111).
 *
 * 🔒 Invariant « une saisie n'est jamais écrasée » : l'écriture AUTOMATIQUE purge d'abord SES lignes ('extraite'), puis insère en
 * `ON CONFLICT … DO NOTHING` → une parcelle saisie à la main (même dossier/rôle/section/numéro/préfixe) n'est jamais remplacée.
 */
import { query } from '../db/client';
import type { ParcelleDecision } from './decisionParcelles';
import { millesimeEditionCourante, MILLESIME_INCONNU } from './editionBdTopo'; // L8 — millésime bâti = AUTORITÉ (registre), plus le proxy
import { cleabsAppartenantPermis } from './appartenancePermis'; // VOIS-1 — un bâtiment voisin n'entre jamais dans les caractéristiques (filtre à la LECTURE)

export interface ParcelleLigne {
  id: number;                          // LOT 101 — id de la ligne permis_parcelle (cible du geste de correction)
  refRemplacee: string | null;        // LOT 101 — si correction manuelle : « DK 649 » (référence d'origine remplacée), sinon null
  prefixe: string | null; section: string; numero: string; superficieDeclareeM2: number | null;
  role: 'origine' | 'finale'; origine: 'saisie' | 'extraite' | null;
  idu: string | null; confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null; provenance: string | null;
  // ── PL-A : PROVENANCE HONNÊTE de l'ACTEUR (né de l'incident verif-lot101 : ne pas dire « à la main » quand ce n'en est pas une) ──
  majPar: string | null;              // auteur BRUT de la dernière écriture (id admin, 'admin', ou une chaîne d'outil/CLI)
  majLe: string | null;               // horodatage ISO de la dernière écriture
  acteurNom: string | null;           // prénom+nom SI maj_par est un id d'admin résolu (admin_utilisateur) ; null sinon
  // ── rattachement à `parcelle` ──
  communeCadastrale: string | null;   // commune de la parcelle rattachée (arrondissement) ; null si non rattachée
  contenance: number | null;          // contenance cadastrale (m²) ; null si non rattachée
  aireCadastraleM2: number | null;    // ST_Area(geom) ; null si non rattachée
  aGeometrie: boolean;                 // la parcelle a un contour en base
  deptCharge: boolean;                 // le département de l'IDU est chargé dans `parcelle` (sinon : « géométrie non chargée »)
}

/** Écrit les parcelles décidées (mode 'extraite'). Recompute idempotent + invariant saisie. Renvoie le nb écrit / ignoré. */
export async function ecrireParcelles(dossierId: number, parcelles: ParcelleDecision[], majPar: string): Promise<{ ecrites: number; ignorees: number }> {
  await query(`DELETE FROM permis_parcelle WHERE dossier_id = $1 AND origine = 'extraite'`, [dossierId]); // ciblé : jamais la saisie
  // LOT 101 — DURABILITÉ des corrections manuelles : une référence corrigée à la main (ex. DK 649 → DI 649) ne doit pas être RÉ-AJOUTÉE
  //   par une ré-extraction (qui recasserait l'empreinte). On saute les refs d'origine que porte une correction. Résilient : colonne
  //   `correction` absente (migration 197) → pas de filtrage (comportement d'avant).
  const cleRef = (s: string | null, n: string | null, p: string | null) => `${s ?? ''}|${n ?? ''}|${p ?? ''}`;
  let refsCorrigees = new Set<string>();
  try {
    const { rows } = await query<{ section: string | null; numero: string | null; prefixe: string | null }>(
      `SELECT correction->'refOrigine'->>'section' AS section, correction->'refOrigine'->>'numero' AS numero, correction->'refOrigine'->>'prefixe' AS prefixe
         FROM permis_parcelle WHERE dossier_id = $1 AND correction IS NOT NULL`, [dossierId]);
    refsCorrigees = new Set(rows.map((r) => cleRef(r.section, r.numero, r.prefixe)));
  } catch { /* colonne `correction` absente → aucun filtrage (comportement d'avant) */ }
  let ecrites = 0, ignorees = 0;
  for (const p of parcelles) {
    if (refsCorrigees.has(cleRef(p.section, p.numero, p.prefixe))) { ignorees++; continue; } // corrigée à la main → ne pas ré-ajouter
    const res = await query(
      `INSERT INTO permis_parcelle (dossier_id, prefixe, section, numero, superficie_declaree_m2, role, origine, idu, confiance, reserve, provenance, maj_le, maj_par)
         VALUES ($1, $2, $3, $4, $5, $6, 'extraite', $7, $8, $9, $10, now(), $11)
         ON CONFLICT (dossier_id, role, section, numero, prefixe) DO NOTHING`,
      [dossierId, p.prefixe, p.section, p.numero, p.superficieDeclareeM2, p.role, p.idu, p.confiance, p.reserve, p.provenance, majPar]);
    if ((res.rowCount ?? 0) > 0) ecrites++; else ignorees++; // ignoré = une saisie occupe déjà la clé
  }
  return { ecrites, ignorees };
}

/**
 * Lit les parcelles d'un permis, RATTACHÉES par l'IDU à `parcelle` : contenance cadastrale, ST_Area(geom), présence du contour, et si
 * le DÉPARTEMENT de l'IDU est chargé (pour distinguer « géométrie non chargée » de « référence introuvable au cadastre »).
 */
export async function lireParcellesPermis(dossierId: number): Promise<ParcelleLigne[]> {
  const { rows } = await query<{
    id: number; prefixe: string | null; section: string; numero: string; superficie: string | number | null;
    role: 'origine' | 'finale'; origine: 'saisie' | 'extraite' | null; idu: string | null;
    confiance: 'confirmee' | 'a_verifier' | null; reserve: string | null; provenance: string | null;
    maj_par: string | null; maj_le: string | null; prenom: string | null; nom: string | null;
    commune: string | null; contenance: number | null; aire: string | number | null; a_geometrie: boolean; dept_charge: boolean;
  }>(
    // PL-A — l'AUTEUR (maj_par) est résolu en nom quand c'est un id d'admin numérique (LEFT JOIN admin_utilisateur, garde regex pour
    //   ne jamais caster une chaîne d'outil comme 'verif-lot101' en bigint) → l'écran peut nommer QUI, jamais mentir sur « à la main ».
    `SELECT pp.id, pp.prefixe, pp.section, pp.numero, pp.superficie_declaree_m2 AS superficie, pp.role, pp.origine, pp.idu,
            pp.confiance, pp.reserve, pp.provenance,
            pp.maj_par, pp.maj_le::text AS maj_le, au.prenom, au.nom,
            par.commune, par.contenance,
            CASE WHEN par.id IS NOT NULL THEN round(ST_Area(par.geom)::numeric, 1) END AS aire,
            (par.id IS NOT NULL) AS a_geometrie,
            (pp.idu IS NOT NULL AND EXISTS (SELECT 1 FROM parcelle p2 WHERE p2.commune LIKE left(pp.idu, 2) || '%')) AS dept_charge
       FROM permis_parcelle pp
       LEFT JOIN parcelle par ON par.id = pp.idu
       LEFT JOIN admin_utilisateur au ON au.id = CASE WHEN pp.maj_par ~ '^[0-9]+$' THEN pp.maj_par::bigint ELSE NULL END
      WHERE pp.dossier_id = $1
      ORDER BY pp.role, pp.section, pp.numero`,
    [dossierId]);
  // LOT 101 — trace des corrections manuelles (référence d'origine remplacée), lue à part et RÉSILIENTE : colonne `correction` absente
  //   (migration 197) → aucune correction connue (comportement d'avant), jamais une erreur qui ferait tomber la lecture des parcelles.
  const refRemplaceeParId = new Map<number, string>();
  try {
    const { rows: corr } = await query<{ id: number; section: string | null; numero: string | null }>(
      `SELECT id, correction->'refOrigine'->>'section' AS section, correction->'refOrigine'->>'numero' AS numero
         FROM permis_parcelle WHERE dossier_id = $1 AND correction IS NOT NULL`, [dossierId]);
    for (const c of corr) if (c.section || c.numero) refRemplaceeParId.set(c.id, `${c.section ?? ''} ${c.numero ?? ''}`.trim());
  } catch { /* colonne `correction` absente → aucune correction affichée */ }
  return rows.map((r) => ({
    id: r.id, refRemplacee: refRemplaceeParId.get(r.id) ?? null,
    prefixe: r.prefixe, section: r.section, numero: r.numero,
    superficieDeclareeM2: r.superficie === null ? null : Number(r.superficie),
    role: r.role, origine: r.origine, idu: r.idu, confiance: r.confiance, reserve: r.reserve, provenance: r.provenance,
    majPar: r.maj_par, majLe: r.maj_le, acteurNom: r.prenom || r.nom ? `${r.prenom ?? ''} ${r.nom ?? ''}`.trim() : null,
    communeCadastrale: r.commune, contenance: r.contenance,
    aireCadastraleM2: r.aire === null ? null : Number(r.aire), aGeometrie: r.a_geometrie === true, deptCharge: r.dept_charge === true,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// FUS-1 — figer l'état géométrique d'origine + calculer l'EMPREINTE ATTENDUE de la future parcelle fusionnée.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface EmpreinteLigne {
  surfaceM2: number | null;      // ST_Area de l'union ; null si incomplète
  nbParcelles: number | null;    // nb de parcelles d'origine (union si complète, total sinon)
  complete: boolean;             // toutes les parcelles d'origine étaient rattachées
  motif: string | null;          // si incomplète : pourquoi (jamais une union muette sur un sous-ensemble)
  millesime: string | null;      // millésime cadastral de l'union
  aGeometrie: boolean;           // une empreinte géométrique existe en base
}

/**
 * Fige le SNAPSHOT géométrique des parcelles d'origine RATTACHÉES (copie de parcelle.geom + millésime cadastral courant), puis
 * calcule l'EMPREINTE ATTENDUE du permis = ST_Union de ces snapshots. À lancer APRÈS `ecrireParcelles`, dans le même run CLI.
 * Requiert la migration 113. Renvoie l'état de l'empreinte pour le log.
 *
 * ⚠️ Le snapshot est copié SUR `permis_parcelle` pour SURVIVRE au réimport DELETE+append du cadastre (`cadastre:ingest`) : sans lui,
 * la disparition d'une parcelle à la fusion serait invisible. Complète SEULEMENT si TOUTES les parcelles d'origine sont rattachées ;
 * sinon on marque l'empreinte incomplète avec le motif — jamais une union silencieuse sur un sous-ensemble.
 */
export async function figerEmpreinte(dossierId: number, majPar: string): Promise<EmpreinteLigne> {
  // PL-C — 🔴 GARDE « SÉLECTION D'ABORD » : si une sélection validée à la main existe pour ce dossier, l'empreinte EFFECTIVE est
  //   l'union des geom_snapshot GELÉS de la SÉLECTION (jamais re-snapshotés, `permis_parcelle` jamais touché). Une ré-analyse
  //   automatique (executerExtraction → figerEmpreinte) passe donc ici SANS JAMAIS écraser la sélection. 0 ligne (ou table 202
  //   absente) → chemin automatique inchangé ci-dessous. RÉSILIENT : migration 202 non appliquée → aucune sélection (comportement d'avant).
  try {
    const { rows: sel } = await query<{ total: number; avec: number }>(
      `SELECT count(*)::int AS total, count(geom_snapshot)::int AS avec FROM permis_parcelle_selection WHERE dossier_id = $1`, [dossierId]);
    const t = sel[0]?.total ?? 0, a = sel[0]?.avec ?? 0;
    if (t > 0) return empreinteDepuisSelection(dossierId, majPar, t, a);
  } catch (e) { if (!estTableAbsente(e)) throw e; } // 202 non appliquée → on ignore la superposition (aucune sélection possible)

  // 1) Snapshot : copie de la géométrie + du millésime cadastral courant du département, pour chaque parcelle d'origine rattachée.
  await query(
    `UPDATE permis_parcelle pp
        SET geom_snapshot = par.geom,
            snapshot_millesime = (SELECT cm.millesime FROM cadastre_millesime cm
                                   WHERE cm.departement = left(pp.idu, 2) ORDER BY cm.charge_le DESC LIMIT 1)
       FROM parcelle par
      WHERE par.id = pp.idu AND pp.dossier_id = $1 AND pp.role = 'origine'`,
    [dossierId]);

  // 2) Complétude : combien de parcelles d'origine, combien ont un snapshot ?
  const { rows: cnt } = await query<{ total: number; avec: number }>(
    `SELECT count(*)::int AS total, count(geom_snapshot)::int AS avec
       FROM permis_parcelle WHERE dossier_id = $1 AND role = 'origine'`, [dossierId]);
  const total = cnt[0]?.total ?? 0, avec = cnt[0]?.avec ?? 0;

  if (total > 0 && avec === total) {
    // ⚠️ LIMITE À NE JAMAIS OUBLIER : l'union des parcelles d'origine est une EMPREINTE ATTENDUE, PAS une prédiction de la future
    // parcelle. Le projet peut n'occuper qu'une partie des parcelles, un document d'arpentage peut redécouper, et le contour du
    // millésime suivant diffère toujours un peu. Ne JAMAIS traiter cette géométrie comme la vraie parcelle fusionnée : elle sert
    // de RÉFÉRENCE À COMPARER (FUS-2/3), rien de plus.
    const { rows } = await query<{ surface: string | number | null; nb: number; mill: string | null }>(
      `INSERT INTO permis_empreinte (dossier_id, geom, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par)
         SELECT $1, ST_Multi(ST_Union(geom_snapshot)), ST_Area(ST_Union(geom_snapshot)), count(*)::int, true, NULL,
                max(snapshot_millesime), now(), $2
           FROM permis_parcelle WHERE dossier_id = $1 AND role = 'origine' AND geom_snapshot IS NOT NULL
         ON CONFLICT (dossier_id) DO UPDATE
           SET geom = EXCLUDED.geom, surface_m2 = EXCLUDED.surface_m2, nb_parcelles = EXCLUDED.nb_parcelles,
               complete = EXCLUDED.complete, motif = EXCLUDED.motif, millesime = EXCLUDED.millesime,
               maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par
         RETURNING surface_m2 AS surface, nb_parcelles AS nb, millesime AS mill`,
      [dossierId, majPar]);
    const r = rows[0];
    return { surfaceM2: r?.surface == null ? null : Number(r.surface), nbParcelles: r?.nb ?? total,
             complete: true, motif: null, millesime: r?.mill ?? null, aGeometrie: true };
  }

  // Incomplète : au moins une parcelle d'origine non rattachée → on NE calcule PAS l'union (pas de sous-ensemble muet).
  const motif = total === 0
    ? 'aucune parcelle d’origine rattachée → empreinte attendue non calculable'
    : `${total - avec} parcelle(s) d’origine non rattachée(s) au cadastre → empreinte attendue incomplète (pas d’union sur un sous-ensemble)`;
  await query(
    `INSERT INTO permis_empreinte (dossier_id, geom, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par)
       VALUES ($1, NULL, NULL, $3, false, $4, NULL, now(), $2)
       ON CONFLICT (dossier_id) DO UPDATE
         SET geom = NULL, surface_m2 = NULL, nb_parcelles = EXCLUDED.nb_parcelles, complete = false,
             motif = EXCLUDED.motif, millesime = NULL, maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par`,
    [dossierId, majPar, total, motif]);
  return { surfaceM2: null, nbParcelles: total, complete: false, motif, millesime: null, aGeometrie: false };
}

/** Une erreur SQL est-elle « relation absente » (migration 202 non appliquée) ? → on ignore la superposition (comportement d'avant). */
function estTableAbsente(e: unknown): boolean {
  return (e as { code?: string })?.code === '42P01';
}

/**
 * PL-C — Empreinte EFFECTIVE issue de la SÉLECTION validée (superposition). Union des geom_snapshot GELÉS de `permis_parcelle_selection`
 * (jamais re-snapshotés). NE TOUCHE JAMAIS `permis_parcelle`. `complete` seulement si toutes les parcelles sélectionnées ont un contour ;
 * sinon empreinte incomplète + motif (jamais une union muette sur un sous-ensemble). motif=NULL quand complète → structure identique au
 * chemin automatique (seule la géométrie diffère, c'est le but). Le retrait (DELETE + figerEmpreinte) redonne l'empreinte automatique.
 */
async function empreinteDepuisSelection(dossierId: number, majPar: string, total: number, avec: number): Promise<EmpreinteLigne> {
  if (total > 0 && avec === total) {
    const { rows } = await query<{ surface: string | number | null; nb: number; mill: string | null }>(
      `INSERT INTO permis_empreinte (dossier_id, geom, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par)
         SELECT $1, ST_Multi(ST_Union(geom_snapshot)), ST_Area(ST_Union(geom_snapshot)), count(*)::int, true, NULL,
                max(snapshot_millesime), now(), $2
           FROM permis_parcelle_selection WHERE dossier_id = $1 AND geom_snapshot IS NOT NULL
         ON CONFLICT (dossier_id) DO UPDATE
           SET geom = EXCLUDED.geom, surface_m2 = EXCLUDED.surface_m2, nb_parcelles = EXCLUDED.nb_parcelles,
               complete = EXCLUDED.complete, motif = EXCLUDED.motif, millesime = EXCLUDED.millesime,
               maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par
         RETURNING surface_m2 AS surface, nb_parcelles AS nb, millesime AS mill`,
      [dossierId, majPar]);
    const r = rows[0];
    return { surfaceM2: r?.surface == null ? null : Number(r.surface), nbParcelles: r?.nb ?? total,
             complete: true, motif: null, millesime: r?.mill ?? null, aGeometrie: true };
  }
  const motif = `${total - avec} parcelle(s) sélectionnée(s) sans contour cadastral → empreinte de sélection incomplète (pas d’union sur un sous-ensemble)`;
  await query(
    `INSERT INTO permis_empreinte (dossier_id, geom, surface_m2, nb_parcelles, complete, motif, millesime, maj_le, maj_par)
       VALUES ($1, NULL, NULL, $3, false, $4, NULL, now(), $2)
       ON CONFLICT (dossier_id) DO UPDATE
         SET geom = NULL, surface_m2 = NULL, nb_parcelles = EXCLUDED.nb_parcelles, complete = false,
             motif = EXCLUDED.motif, millesime = NULL, maj_le = EXCLUDED.maj_le, maj_par = EXCLUDED.maj_par`,
    [dossierId, majPar, total, motif]);
  return { surfaceM2: null, nbParcelles: total, complete: false, motif, millesime: null, aGeometrie: false };
}

/** Lit l'empreinte attendue d'un permis (table permis_empreinte). null si jamais calculée. */
export async function lireEmpreintePermis(dossierId: number): Promise<EmpreinteLigne | null> {
  const { rows } = await query<{
    surface: string | number | null; nb: number | null; complete: boolean; motif: string | null; mill: string | null; a_geom: boolean;
  }>(
    `SELECT surface_m2 AS surface, nb_parcelles AS nb, complete, motif, millesime AS mill, (geom IS NOT NULL) AS a_geom
       FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
  const r = rows[0];
  if (!r) return null;
  return { surfaceM2: r.surface == null ? null : Number(r.surface), nbParcelles: r.nb, complete: r.complete === true,
           motif: r.motif, millesime: r.mill, aGeometrie: r.a_geom === true };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// FUS-1b — PHOTOGRAPHIER le bâti d'origine présent dans l'empreinte d'un permis. On ne FAIT QUE photographier : aucune détection de
// changement, aucune comparaison de millésimes, aucune alerte (chantiers suivants). Le signal porteur est la GÉOMÉTRIE (footprint 2D)
// + le cleabs ; étages/altitude sont OPPORTUNISTES (NULL fréquent sur le bâti récent, cf. recon), jamais supposés.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface BatimentSnapshot {
  cleabs: string | null;             // identité BD TOPO du bâtiment
  nombreEtages: number | null;       // si présent en BD TOPO ; NULL fréquent sur le bâti récent
  altitudeMaxToit: number | null;    // altitude_maximale_toit si présente
  hauteur: number | null;            // hauteur BD TOPO si présente
  dateModification: string | null;   // horodatage BD TOPO (proxy de millésime par objet), ISO
}

export interface BatiSnapshotResume {
  capture: boolean;                  // la photo a été prise (empreinte complète disponible)
  nbBatiments: number | null;        // NULL si non capturé ; 0 = TERRAIN NU (information valable)
  motif: string | null;              // si non capturé : pourquoi (jamais un vide muet)
  sourceMillesime: string | null;    // best-effort : état de la couche bâti au moment du snapshot
  batiments: BatimentSnapshot[];     // détail (vide si terrain nu OU non capturé)
}

/**
 * Fige la PHOTO du bâti d'origine : capture tous les bâtiments dont la géométrie intersecte l'EMPREINTE COMPLÈTE du permis. À lancer
 * APRÈS `figerEmpreinte`, dans le même run CLI. Requiert la migration 114.
 *
 * ⚠️ Un permis sans empreinte COMPLÈTE ne capture RIEN en silence : on enregistre `capture=false` + un motif. 0 bâtiment dans une
 * empreinte complète = TERRAIN NU (`capture=true`, `nb=0`) — information valable, pas un vide. Intersection via l'index GiST
 * (`b.geom && e.geom`). Footprint 2D figé (`ST_Force2D`) car le signal est le contour, pas la 3D.
 */
export async function figerBatiSnapshot(dossierId: number, majPar: string): Promise<BatiSnapshotResume> {
  await query(`DELETE FROM permis_bati_snapshot WHERE dossier_id = $1`, [dossierId]); // recompute idempotent

  // L'empreinte est-elle figée ET complète ? (sinon on ne photographie pas — pas de capture muette).
  const { rows: emp } = await query<{ a_geom: boolean; complete: boolean; motif: string | null }>(
    `SELECT (geom IS NOT NULL) AS a_geom, complete, motif FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
  const e = emp[0];
  if (!e || !e.complete || e.a_geom !== true) {
    const motif = !e
      ? 'empreinte non figée → bâti non photographié (lancer d’abord figerEmpreinte)'
      : (e.motif ?? 'empreinte incomplète → bâti non photographié');
    await query(
      `INSERT INTO permis_bati_capture (dossier_id, capture, nb_batiments, motif, source_millesime, capture_le, capture_par)
         VALUES ($1, false, NULL, $3, NULL, now(), $2)
         ON CONFLICT (dossier_id) DO UPDATE
           SET capture = false, nb_batiments = NULL, motif = EXCLUDED.motif, source_millesime = NULL,
               capture_le = EXCLUDED.capture_le, capture_par = EXCLUDED.capture_par`,
      [dossierId, majPar, motif]);
    return { capture: false, nbBatiments: null, motif, sourceMillesime: null, batiments: [] };
  }

  // L8 — millésime bâti = AUTORITÉ : registre `bdtopo_edition.courante` (helper défensif), plus le proxy max(date_modification).
  //   MILLESIME_INCONNU (table/édition absente) → NULL : honnête (« non renseigné » à l'affichage), jamais une date supposée.
  //   N'affecte QUE les captures FUTURES ; les `source_millesime` déjà écrits ne sont pas réécrits (aucun backfill).
  const mEdition = await millesimeEditionCourante(query);
  const sourceMillesime = mEdition === MILLESIME_INCONNU ? null : mEdition;

  // Capture : bâtiments dont le footprint intersecte l'empreinte. `b.geom && e.geom` d'abord → index GiST ; ST_Intersects (2D) affine.
  // L9 — on fige AUSSI etat_de_l_objet + usage_1/usage_2 (copie BRUTE de la source, aucune interprétation). Donnée périssable :
  //   perdue au remplacement d'édition BD TOPO si non capturée. NULL propagé tel quel quand la source est vide (pas de défaut).
  const { rows } = await query<{ cleabs: string | null; etages: number | null; alt: number | null; hauteur: number | null; dmod: string | null }>(
    `INSERT INTO permis_bati_snapshot (dossier_id, cleabs, geom, nombre_d_etages, altitude_max_toit, hauteur, date_modification, etat_de_l_objet, usage_1, usage_2, snapshot_le, snapshot_par)
       SELECT $1, b.cleabs, ST_Multi(ST_Force2D(b.geom)), b.nombre_d_etages, b.altitude_maximale_toit, b.hauteur, b.date_modification, b.etat_de_l_objet, b.usage_1, b.usage_2, now(), $2
         FROM batiment b
         JOIN permis_empreinte pe ON pe.dossier_id = $1
        WHERE pe.geom IS NOT NULL AND b.geom && pe.geom AND ST_Intersects(b.geom, pe.geom)
       RETURNING cleabs, nombre_d_etages AS etages, altitude_max_toit AS alt, hauteur, to_char(date_modification, 'YYYY-MM-DD') AS dmod`,
    [dossierId, majPar]);
  const batiments: BatimentSnapshot[] = rows.map((r) => ({
    cleabs: r.cleabs, nombreEtages: r.etages, altitudeMaxToit: r.alt == null ? null : Number(r.alt),
    hauteur: r.hauteur == null ? null : Number(r.hauteur), dateModification: r.dmod,
  }));

  await query(
    `INSERT INTO permis_bati_capture (dossier_id, capture, nb_batiments, motif, source_millesime, capture_le, capture_par)
       VALUES ($1, true, $3, NULL, $4, now(), $2)
       ON CONFLICT (dossier_id) DO UPDATE
         SET capture = true, nb_batiments = EXCLUDED.nb_batiments, motif = NULL, source_millesime = EXCLUDED.source_millesime,
             capture_le = EXCLUDED.capture_le, capture_par = EXCLUDED.capture_par`,
    [dossierId, majPar, batiments.length, sourceMillesime]);

  return { capture: true, nbBatiments: batiments.length, motif: null, sourceMillesime, batiments };
}

/** Lit la photo du bâti d'un permis (résumé permis_bati_capture + détail permis_bati_snapshot). null si jamais capturé. */
export async function lireBatiSnapshotPermis(dossierId: number): Promise<BatiSnapshotResume | null> {
  const { rows: cap } = await query<{ capture: boolean; nb: number | null; motif: string | null; mill: string | null }>(
    `SELECT capture, nb_batiments AS nb, motif, source_millesime AS mill FROM permis_bati_capture WHERE dossier_id = $1`, [dossierId]);
  const c = cap[0];
  if (!c) return null;
  const { rows } = await query<{ cleabs: string | null; etages: number | null; alt: number | null; hauteur: number | null; dmod: string | null }>(
    `SELECT cleabs, nombre_d_etages AS etages, altitude_max_toit AS alt, hauteur, to_char(date_modification, 'YYYY-MM-DD') AS dmod
       FROM permis_bati_snapshot WHERE dossier_id = $1 ORDER BY cleabs`, [dossierId]);
  const bruts: BatimentSnapshot[] = rows.map((r) => ({
    cleabs: r.cleabs, nombreEtages: r.etages, altitudeMaxToit: r.alt == null ? null : Number(r.alt),
    hauteur: r.hauteur == null ? null : Number(r.hauteur), dateModification: r.dmod,
  }));
  // VOIS-1 — FILTRE À LA LECTURE : ne montrer que le bâti DU PERMIS (batimentAppartientPermis, jugé sur le footprint FIGÉ), jamais les
  //   voisins. Les lignes figées ne sont PAS réécrites (état des lieux daté). Le COMPTE affiché suit le filtre (capture=true → compte filtré ;
  //   capture=false → inchangé, il n'y a de toute façon aucune ligne). 0 après filtre = « terrain nu » du point de vue du permis.
  if (c.capture !== true) return { capture: false, nbBatiments: c.nb, motif: c.motif, sourceMillesime: c.mill, batiments: bruts };
  const appartenant = await cleabsAppartenantPermis(dossierId, 'snapshot');
  const batiments = bruts.filter((b) => b.cleabs != null && appartenant.has(b.cleabs));
  return { capture: true, nbBatiments: batiments.length, motif: c.motif, sourceMillesime: c.mill, batiments };
}

/** GeoJSON (FeatureCollection WGS84, une Feature) de l'empreinte attendue d'un permis — pour export, jamais déversé à l'écran. */
export async function geojsonEmpreintePermis(dossierId: number): Promise<unknown> {
  const { rows } = await query<{ fc: unknown }>(
    `SELECT jsonb_build_object(
              'type', 'FeatureCollection',
              'features', COALESCE(jsonb_agg(jsonb_build_object(
                'type', 'Feature',
                'properties', jsonb_build_object('dossier_id', dossier_id, 'surface_m2', round(surface_m2::numeric, 1),
                                                 'nb_parcelles', nb_parcelles, 'millesime', millesime,
                                                 'note', 'empreinte ATTENDUE (union des parcelles d''origine), pas la parcelle fusionnée réelle'),
                'geometry', ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb)), '[]'::jsonb)) AS fc
       FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL`,
    [dossierId]);
  return rows[0]?.fc ?? { type: 'FeatureCollection', features: [] };
}

/** GeoJSON (FeatureCollection, WGS84) des parcelles RATTACHÉES d'un permis — pour export/téléchargement, jamais déversé à l'écran. */
export async function geojsonParcellesPermis(dossierId: number): Promise<unknown> {
  const { rows } = await query<{ fc: unknown }>(
    `SELECT jsonb_build_object(
              'type', 'FeatureCollection',
              'features', COALESCE(jsonb_agg(jsonb_build_object(
                'type', 'Feature',
                'properties', jsonb_build_object('idu', par.id, 'section', par.section, 'numero', par.numero,
                                                 'contenance_m2', par.contenance, 'aire_postgis_m2', round(ST_Area(par.geom)::numeric, 1)),
                'geometry', ST_AsGeoJSON(ST_Transform(par.geom, 4326))::jsonb)), '[]'::jsonb)) AS fc
       FROM permis_parcelle pp
       JOIN parcelle par ON par.id = pp.idu
      WHERE pp.dossier_id = $1`,
    [dossierId]);
  return rows[0]?.fc ?? { type: 'FeatureCollection', features: [] };
}
