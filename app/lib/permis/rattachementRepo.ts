/**
 * FUS-2 — ADAPTATEUR IMPUR : construit les entrées MESURÉES du moteur PUR `detectionRattachement` à partir de la base (PostGIS).
 * Toute la géométrie vit ICI ; le moteur ne reçoit que des nombres. LECTURE SEULE — aucune écriture (le rejeu à blanc ne persiste
 * rien). Module PROPRE : n'importe que `db/client`, le moteur pur et le lecteur de seuils.
 *
 * MESURES (définies et justifiées ici) :
 *  · SURFACE  ratioSurface = ST_Area(candidate ∩ empreinte) / ST_Area(empreinte) ∈ [0,1] — part de l'empreinte recouverte par la
 *             parcelle candidate. Tolère qu'une voie/un trottoir prélevé fasse descendre le ratio sous 1 ; rejette une parcelle
 *             sans rapport (recouvrement faible).
 *  · BORDURE  partBordure = ST_Length(frontière_candidate ∩ buffer(τ, frontière_empreinte)) / ST_Perimeter(candidate) ∈ [0,1] —
 *             part du PÉRIMÈTRE CANDIDAT longeant le contour de l'empreinte, à τ près. Rapporté au périmètre candidat (et non de
 *             l'empreinte) pour rester ≤ 1 et pénaliser une candidate débordant hors empreinte. À la fusion, le contour extérieur
 *             de la nouvelle parcelle épouse les anciennes limites séparatives ; la part non coïncidente = la voie prélevée.
 *  · BÂTI     un bâtiment courant intersectant l'empreinte est 'nouveau' si son cleabs est absent du snapshot FUS-1b, 'modifie' si
 *             présent mais que la différence symétrique d'emprise dépasse MODIF_SURF_REL (bruit de réimport toléré en deçà).
 *
 * Le régime (avec/sans fusion) se lit sur la persistance des parcelles d'origine au cadastre COURANT : si toutes les parcelles
 * d'origine rattachées existent encore → SANS fusion (la surface n'a pas bougé) ; si au moins une a disparu → AVEC fusion.
 */
import { query } from '../db/client';
import { detecterRattachement, type EntreesRattachement, type ResultatRattachement, type CorpsPermis, type PolygoneEmpreinte, type ParcelleCandidate } from './detectionRattachement';
import { lireSeuilsRattachement } from './rattachementConfig';

// τ — tolérance de distance pour qu'un tronçon du contour candidat soit réputé « longer » le contour de l'empreinte (Lambert-93).
export const TOLERANCE_BORDURE_M = 0.5;
// Seuil relatif de différence d'emprise au-delà duquel un bâtiment déjà présent (même cleabs) est réputé 'modifie' (sinon = bruit de réimport).
export const MODIF_SURF_REL = 0.02;

export interface ContexteRejeu {
  empreinteMillesime: string | null;
  empreinteSurfaceM2: number | null;
  nbParcellesOrigine: number;      // parcelles d'origine rattachées (avec idu)
  nbOrigineEncore: number;         // combien existent encore au cadastre courant
  candidatIdu: string | null;      // meilleure parcelle candidate (régime avec fusion) ; null sinon
  nbBatimentsEmpreinte: number;    // bâtiments courants intersectant l'empreinte
  nbSnapshot: number;              // bâtiments figés au snapshot FUS-1b
  seuilsProvenance: 'base' | 'defaut';
  seuilsBrut: { surfacePct: number; bordurePct: number; margeAltitudeCm: number };
}

export interface Rejeu { entrees: EntreesRattachement; contexte: ContexteRejeu; resultat: ResultatRattachement }

const nb = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/** Construit les entrées mesurées + le contexte pour un permis, puis exécute le moteur PUR. LECTURE SEULE. */
export async function rejouerRattachement(dossierId: number): Promise<Rejeu> {
  const src = await lireSeuilsRattachement();

  // 1) Empreinte attendue (FUS-1).
  const { rows: empRows } = await query<{ complete: boolean; a_geom: boolean; surface: string | number | null; millesime: string | null }>(
    `SELECT complete, (geom IS NOT NULL) AS a_geom, surface_m2 AS surface, millesime FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
  const emp = empRows[0];
  const empreinteComplete = emp?.complete === true && emp?.a_geom === true;

  // 2) Corps déclarés au permis.
  const { rows: corpsRows } = await query<{ repere: string | null; alt: string | number | null; etages: number | null }>(
    `SELECT repere, altitude_sommet_ngf AS alt, nb_etages AS etages FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY repere`, [dossierId]);
  const corpsPermis: CorpsPermis[] = corpsRows.map((r) => ({
    repere: r.repere, altitudeSommetNgf: r.alt === null || r.alt === undefined ? null : Number(r.alt), nbEtages: r.etages,
  }));

  // 3) Régime : les parcelles d'origine rattachées existent-elles encore au cadastre COURANT ?
  const { rows: origRows } = await query<{ origine_idu: number; encore: number }>(
    `SELECT count(*) FILTER (WHERE pp.idu IS NOT NULL)::int AS origine_idu,
            count(*) FILTER (WHERE pp.idu IS NOT NULL AND par.id IS NOT NULL)::int AS encore
       FROM permis_parcelle pp LEFT JOIN parcelle par ON par.id = pp.idu
      WHERE pp.dossier_id = $1 AND pp.role = 'origine'`, [dossierId]);
  const nbParcellesOrigine = nb(origRows[0]?.origine_idu);
  const nbOrigineEncore = nb(origRows[0]?.encore);
  // Toutes encore là (ou aucune référence exploitable) → SANS fusion ; au moins une disparue → AVEC fusion.
  const parcellesOrigineToujoursLa = nbParcellesOrigine === 0 ? true : nbOrigineEncore === nbParcellesOrigine;

  // 4) Parcelle candidate (régime AVEC fusion uniquement) : meilleure parcelle courante recouvrant l'empreinte, hors parcelles d'origine.
  let parcelleCandidate: ParcelleCandidate | null = null;
  if (empreinteComplete && !parcellesOrigineToujoursLa) {
    const { rows } = await query<{ idu: string | null; ratio: string | number | null; part: string | number | null }>(
      `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
       SELECT par.id AS idu,
              ST_Area(ST_Intersection(par.geom, emp.geom)) / NULLIF(ST_Area(emp.geom), 0) AS ratio,
              ST_Length(ST_Intersection(ST_Boundary(par.geom), ST_Buffer(ST_Boundary(emp.geom), $2)))
                / NULLIF(ST_Perimeter(par.geom), 0) AS part
         FROM parcelle par, emp
        WHERE par.geom && emp.geom AND ST_Intersects(par.geom, emp.geom)
          AND par.id NOT IN (SELECT idu FROM permis_parcelle WHERE dossier_id = $1 AND role = 'origine' AND idu IS NOT NULL)
        ORDER BY ratio DESC NULLS LAST
        LIMIT 1`,
      [dossierId, TOLERANCE_BORDURE_M]);
    const r = rows[0];
    if (r) {
      const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
      parcelleCandidate = { idu: r.idu, ratioSurface: clamp01(nb(r.ratio)), partBordure: clamp01(nb(r.part)) };
    }
  }

  // 5) Bâti : polygones NOUVEAUX / MODIFIÉS dans l'empreinte, par comparaison au snapshot FUS-1b.
  let polygones: PolygoneEmpreinte[] = [];
  let nbBatimentsEmpreinte = 0;
  if (empreinteComplete) {
    const { rows } = await query<{ cleabs: string | null; etat: 'nouveau' | 'modifie'; nb_etages: number | null; alt_toit: string | number | null; chg_rel: string | number | null }>(
      `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL),
            snap AS (SELECT cleabs, geom FROM permis_bati_snapshot WHERE dossier_id = $1)
       SELECT b.cleabs,
              CASE WHEN s.cleabs IS NULL THEN 'nouveau' ELSE 'modifie' END AS etat,
              b.nombre_d_etages AS nb_etages,
              b.altitude_maximale_toit AS alt_toit,
              CASE WHEN s.cleabs IS NULL THEN NULL
                   ELSE ST_Area(ST_SymDifference(ST_Force2D(b.geom), s.geom)) / NULLIF(ST_Area(s.geom), 0) END AS chg_rel
         FROM batiment b
         CROSS JOIN emp
         LEFT JOIN snap s ON s.cleabs = b.cleabs
        WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)`,
      [dossierId]);
    nbBatimentsEmpreinte = rows.length;
    polygones = rows
      .filter((r) => r.cleabs !== null) // sans cleabs, impossible de comparer au snapshot → non compté (pas un faux « nouveau »)
      .filter((r) => r.etat === 'nouveau' || nb(r.chg_rel) > MODIF_SURF_REL) // 'modifie' seulement si l'emprise a réellement changé
      .map((r) => ({ cleabs: r.cleabs, etat: r.etat, nbEtages: r.nb_etages, altitudeMaxToit: r.alt_toit === null || r.alt_toit === undefined ? null : Number(r.alt_toit) }));
  }

  // 6) Bâtiments figés au snapshot (contexte).
  const { rows: snapRows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM permis_bati_snapshot WHERE dossier_id = $1`, [dossierId]);

  const entrees: EntreesRattachement = { empreinteComplete, parcellesOrigineToujoursLa, parcelleCandidate, polygones, corpsPermis, seuils: src.seuils };
  const contexte: ContexteRejeu = {
    empreinteMillesime: emp?.millesime ?? null,
    empreinteSurfaceM2: emp?.surface === null || emp?.surface === undefined ? null : Number(emp.surface),
    nbParcellesOrigine, nbOrigineEncore,
    candidatIdu: parcelleCandidate?.idu ?? null,
    nbBatimentsEmpreinte, nbSnapshot: nb(snapRows[0]?.n),
    seuilsProvenance: src.provenance, seuilsBrut: src.brut,
  };
  return { entrees, contexte, resultat: detecterRattachement(entrees) };
}
