/**
 * FUS-3d / M1 — ADAPTATEUR IMPUR de l'affectation polygone ↔ bâtiment déclaré. Lit l'empreinte + les polygones BD TOPO (PostGIS) et
 * les bâtiments déclarés, dérive les repères (ordre DÉTERMINISTE), et construit le schéma SVG (module pur). L'affectation vit dans la
 * TABLE DE LIAISON `permis_corps_polygone` (M1, structure 1:N) ; l'écriture pose le lien avec EXCLUSIVITÉ (a) garantie par l'index
 * unique (dossier_id, cleabs). RÉSILIENT : tant que la migration 146 n'est pas appliquée, la table n'existe pas → lecture repliée
 * (aucune affectation) + `colonneManquante`, écriture refusée avec motif clair. L'ancienne colonne `permis_corps_batiment.cleabs_affecte`
 * (117) est DÉPRÉCIÉE : plus jamais lue ni écrite ici. Module PROPRE : n'importe que db/client et le module pur. NE TOUCHE PAS au moteur SVAV.
 */
import { query, withTransaction } from '../db/client';
import {
  construireSchema, geomDepuisGeoJSON, repereDepuisIndex, cadreDe, unionCadre,
  type SchemaEmpreinte, type CorpsAffectation, type PolygoneAffectable, type PolygoneEntreeSchema, type GeomPoly, type Cadre, type ActionAffectation,
} from './affectationSchema';
import { rejouerRattachement } from './rattachementRepo'; // L5 — ensemble NOUVEAU/MODIFIÉ (moteur pur, à froid) ; pas de cycle (rattachementRepo n'importe pas affectationRepo)

export interface AffectationEtat {
  empreinteFigee: boolean;
  motif: string | null;               // pourquoi l'affectation n'est pas possible (empreinte incomplète / non figée)
  colonneManquante: boolean;          // table de liaison (migration 146) absente → écriture impossible (l'écran le dit)
  schema: SchemaEmpreinte;
  polygones: PolygoneAffectable[];    // repère + cleabs + hors-empreinte
  corps: CorpsAffectation[];          // bâtiments déclarés + leurs polygones affectés (0..N ; 0..1 tant que la saisie multi n'est pas ouverte)
}

/** L4 — état du schéma « Configuration d'origine » : AffectationEtat + la PROVENANCE du dessin (snapshot figé vs couche vivante). */
export interface AffectationOrigineEtat extends AffectationEtat {
  figee: boolean;              // true = polygones lus dans le snapshot gelé ; false = repli assumé sur la couche vivante (aucune capture)
  captureVide: boolean;        // capture faite MAIS 0 bâtiment gelé (terrain nu au moment du gel) — distinct de « aucune capture »
  millesimeGel: string | null; // édition de la couche bâti au moment du gel (null = inconnu)
}

/**
 * Corps déclarés du permis + leurs polygones affectés (PLURIEL, M1). Les affectations sont lues dans la TABLE DE LIAISON
 * `permis_corps_polygone` (agrégées par corps). Repli si la table n'existe pas (migration 146 non appliquée) → aucun lien +
 * `colonneManquante` (l'écran le dit, écriture impossible). L'ancienne colonne `cleabs_affecte` n'est PLUS lue.
 */
async function lireCorps(dossierId: number): Promise<{ corps: CorpsAffectation[]; colonneManquante: boolean }> {
  const map = (r: { id: number; repere: string | null; alt: string | number | null; etages: number | null; cleabs?: (string | null)[] | null }): CorpsAffectation => ({
    id: Number(r.id), repere: r.repere, altitudeSommetNgf: r.alt == null ? null : Number(r.alt), nbEtages: r.etages,
    cleabsAffectes: Array.isArray(r.cleabs) ? r.cleabs.filter((x): x is string => x != null) : [],
  });
  try {
    const { rows } = await query<{ id: number; repere: string | null; alt: string | number | null; etages: number | null; cleabs: (string | null)[] | null }>(
      `SELECT c.id, c.repere, c.altitude_sommet_ngf AS alt, c.nb_etages AS etages,
              COALESCE(array_agg(l.cleabs) FILTER (WHERE l.cleabs IS NOT NULL), '{}') AS cleabs
         FROM permis_corps_batiment c
         LEFT JOIN permis_corps_polygone l ON l.corps_id = c.id AND l.dossier_id = c.dossier_id
        WHERE c.dossier_id = $1
        GROUP BY c.id, c.repere, c.altitude_sommet_ngf, c.nb_etages
        ORDER BY c.repere, c.id`, [dossierId]);
    const corps = rows.map(map);
    await enrichirNomsRepli(dossierId, corps);
    return { corps, colonneManquante: false };
  } catch {
    const { rows } = await query<{ id: number; repere: string | null; alt: string | number | null; etages: number | null }>(
      `SELECT id, repere, altitude_sommet_ngf AS alt, nb_etages AS etages
         FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY repere, id`, [dossierId]);
    const corps = rows.map(map);
    await enrichirNomsRepli(dossierId, corps);
    return { corps, colonneManquante: true }; // table de liaison (146) absente → aucun lien, écriture impossible
  }
}

/** NOM-1 — attache `nomRepli` à chaque corps depuis une requête SÉPARÉE et RÉSILIENTE (jamais couplée à la migration 146 ci-dessus).
 *  Colonne/table absente (migration 168 non appliquée) → `nomRepli` reste undefined (l'affichage retombe sur « bâtiment {id} »). PUR d'effet de bord. */
async function enrichirNomsRepli(dossierId: number, corps: CorpsAffectation[]): Promise<void> {
  try {
    const { rows } = await query<{ id: number; nom_repli: string | null }>(
      `SELECT id::int AS id, nom_repli FROM permis_corps_batiment WHERE dossier_id = $1`, [dossierId]);
    const parId = new Map(rows.map((r) => [r.id, r.nom_repli]));
    for (const c of corps) c.nomRepli = parId.get(c.id) ?? null;
  } catch { /* 168 non appliquée / indisponible : nomRepli laissé tel quel (undefined). */ }
}

/** Empreinte (parcelle du permis) : sa géométrie + si elle est figée+complète ; sinon le motif à afficher. Lecture seule. */
async function lireEmpreinte(dossierId: number): Promise<{ gj: unknown; empreinteFigee: boolean; motif: string | null }> {
  const { rows } = await query<{ gj: unknown; complete: boolean; a_geom: boolean }>(
    `SELECT ST_AsGeoJSON(geom)::json AS gj, complete, (geom IS NOT NULL) AS a_geom FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
  const emp = rows[0];
  const empreinteFigee = emp?.complete === true && emp?.a_geom === true;
  const motif = empreinteFigee ? null : (!emp
    ? 'parcelle du permis non figée : affectation impossible (lancer d’abord la parcelle du permis)'
    : 'parcelle du permis incomplète (au moins une parcelle d’origine non rattachée) : affectation impossible');
  return { gj: emp?.gj ?? null, empreinteFigee, motif };
}

// L11 — la lecture porte aussi les attributs de la bulle (étages, hauteur, altitude toit) + la surface ST_Area (Lambert-93, calculée
// à la lecture : le client n'a que le path projeté, jamais les coordonnées réelles).
type LigneGeom = { cleabs: string | null; gj: unknown; hors: boolean; etages: number | null; hauteur: string | number | null; alt_toit: string | number | null; surface_m2: string | number | null; etat: string | null };
const nbOuNull = (v: string | number | null): number | null => (v === null || v === undefined ? null : Number(v));

/** Lignes {cleabs, gj, hors, attributs} DÉJÀ ORDONNÉES → entrées de schéma (l'ordre fixe les repères A/B/C…). */
function rowsToEntrees(rows: LigneGeom[]): PolygoneEntreeSchema[] {
  return rows.map((r, i) => ({
    repere: repereDepuisIndex(i), cleabs: r.cleabs, geom: geomDepuisGeoJSON(r.gj), horsEmpreinte: r.hors === true,
    attributs: { nombreEtages: r.etages, hauteurM: nbOuNull(r.hauteur), altitudeToitNgf: nbOuNull(r.alt_toit), surfaceM2: nbOuNull(r.surface_m2), etatDeLObjet: r.etat ?? null },
  }));
}

/** Entrées → {polygones, schéma}. `cadre` (L5) FORCE la bbox de projection (échelle/cadrage COMMUNS entre deux schémas). */
function entreesVersAffect(entrees: PolygoneEntreeSchema[], empGeom: GeomPoly | null, cadre: Cadre | null): { polygones: PolygoneAffectable[]; schema: SchemaEmpreinte } {
  return {
    polygones: entrees.map((e) => ({ repere: e.repere, cleabs: e.cleabs, horsEmpreinte: e.horsEmpreinte })),
    schema: construireSchema(empGeom, entrees, 320, 240, 12, cadre),
  };
}

/** Idem, à partir de lignes brutes + geojson d'empreinte (sans cadre commun — usage mono-schéma). */
function construireDepuisRows(rows: LigneGeom[], empGj: unknown): { polygones: PolygoneAffectable[]; schema: SchemaEmpreinte } {
  return entreesVersAffect(rowsToEntrees(rows), geomDepuisGeoJSON(empGj), null);
}

/** Lignes de la couche bâti VIVANTE intersectant l'empreinte, ORDRE DÉTERMINISTE : haut→bas, gauche→droite, puis cleabs. */
async function lireLiveRows(dossierId: number): Promise<LigneGeom[]> {
  const { rows } = await query<LigneGeom>(
    `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
     SELECT b.cleabs, ST_AsGeoJSON(ST_Force2D(b.geom))::json AS gj,
            NOT ST_Covers(emp.geom, ST_Force2D(b.geom)) AS hors,
            b.nombre_d_etages AS etages, b.hauteur, b.altitude_maximale_toit AS alt_toit, ST_Area(b.geom) AS surface_m2, b.etat_de_l_objet AS etat
       FROM batiment b, emp
      WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)
      ORDER BY ST_Y(ST_Centroid(b.geom)) DESC, ST_X(ST_Centroid(b.geom)), b.cleabs`, [dossierId]);
  return rows;
}

/** Lignes du SNAPSHOT gelé (permis_bati_snapshot), MÊME expression d'ordre que le live → repères identiques sur le même jeu. */
async function lireSnapshotRows(dossierId: number): Promise<LigneGeom[]> {
  const { rows } = await query<LigneGeom>(
    `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
     SELECT s.cleabs, ST_AsGeoJSON(ST_Force2D(s.geom))::json AS gj,
            NOT ST_Covers(emp.geom, ST_Force2D(s.geom)) AS hors,
            s.nombre_d_etages AS etages, s.hauteur, s.altitude_max_toit AS alt_toit, ST_Area(s.geom) AS surface_m2, s.etat_de_l_objet AS etat
       FROM permis_bati_snapshot s, emp
      WHERE s.dossier_id = $1
      ORDER BY ST_Y(ST_Centroid(s.geom)) DESC, ST_X(ST_Centroid(s.geom)), s.cleabs`, [dossierId]);
  return rows;
}

/** État complet de l'affectation d'un permis (couche bâti VIVANTE) : empreinte + polygones (repères déterministes) + corps + schéma. Lecture seule. */
export async function lireAffectation(dossierId: number): Promise<AffectationEtat> {
  const { corps, colonneManquante } = await lireCorps(dossierId);
  const { gj, empreinteFigee, motif } = await lireEmpreinte(dossierId);
  if (!empreinteFigee) return { empreinteFigee: false, motif, colonneManquante, schema: construireSchema(null, []), polygones: [], corps };
  const { polygones, schema } = construireDepuisRows(await lireLiveRows(dossierId), gj);
  return { empreinteFigee: true, motif: null, colonneManquante, schema, polygones, corps };
}

/**
 * L4 — État de l'affectation pour le schéma « Configuration d'origine », lu depuis le SNAPSHOT FIGÉ (permis_bati_snapshot) et NON la
 * couche vivante : c'est la référence de comparaison, elle ne doit pas bouger au réimport BD TOPO. Les repères A/B/C… sont calculés
 * par le MÊME ordre déterministe que le live (mêmes centroïdes → mêmes repères sur le même jeu). Lecture seule.
 *
 * Trois cas HONNÊTES (jamais un repli muet sur le vivant sous le nom « origine ») :
 *  · capture VALIDE (permis_bati_capture.capture=true) → schéma depuis le snapshot ; `figee=true` ; `captureVide` si 0 bâtiment gelé
 *    (terrain nu au moment du gel — information juste, distincte de « aucune capture ») ;
 *  · AUCUNE capture (ligne absente) OU capture=false → repli ASSUMÉ sur le vivant, `figee=false` (l'écran le nomme « état courant »).
 * `millesimeGel` = édition de la couche bâti au moment du gel (best-effort ; null = inconnu, dit tel quel à l'écran).
 */
export async function lireAffectationOrigine(dossierId: number): Promise<AffectationOrigineEtat> {
  const { corps, colonneManquante } = await lireCorps(dossierId);
  const { gj, empreinteFigee, motif } = await lireEmpreinte(dossierId);
  if (!empreinteFigee) {
    return { empreinteFigee: false, motif, colonneManquante, schema: construireSchema(null, []), polygones: [], corps, figee: false, captureVide: false, millesimeGel: null };
  }

  const { rows: capRows } = await query<{ capture: boolean; mill: string | null }>(
    `SELECT capture, source_millesime AS mill FROM permis_bati_capture WHERE dossier_id = $1`, [dossierId]);
  const cap = capRows[0];

  // Aucune capture (ligne absente) OU capture=false (empreinte incomplète au gel) → repli HONNÊTE sur le vivant.
  if (cap?.capture !== true) {
    const { polygones, schema } = construireDepuisRows(await lireLiveRows(dossierId), gj);
    return { empreinteFigee: true, motif: null, colonneManquante, schema, polygones, corps, figee: false, captureVide: false, millesimeGel: null };
  }

  // Capture VALIDE → schéma depuis le SNAPSHOT gelé (repères identiques au live, cf. lireSnapshotRows).
  const snap = await lireSnapshotRows(dossierId);
  const { polygones, schema } = construireDepuisRows(snap, gj);
  return { empreinteFigee: true, motif: null, colonneManquante, schema, polygones, corps, figee: true, captureVide: snap.length === 0, millesimeGel: cap.mill ?? null };
}

/** L5 — les deux schémas COMPARÉS d'un permis + l'ensemble ROUGE (nouveau/modifié) + s'il y a réellement de quoi comparer. */
export interface ComparaisonRattachement {
  origine: AffectationOrigineEtat;    // « Configuration d'origine » (snapshot figé, cf. L4)
  nouvelle: AffectationEtat;          // « Nouvelle configuration » (couche bâti VIVANTE)
  polygonesModifies: string[];        // cleabs NOUVEAUX/MODIFIÉS (moteur, à froid) → rouge dans « Nouvelle configuration »
  aChange: boolean;                   // y a-t-il quelque chose à comparer ? (origine figée ET un changement réel)
}

/** Deux ensembles de polygones portent-ils EXACTEMENT les mêmes cleabs ? (détecte aussi une disparition, pas seulement un ajout.) */
function memeEnsembleCleabs(a: PolygoneAffectable[], b: PolygoneAffectable[]): boolean {
  const sa = new Set(a.map((p) => p.cleabs)), sb = new Set(b.map((p) => p.cleabs));
  if (sa.size !== sb.size) return false;
  for (const c of sa) if (!sb.has(c)) return false;
  return true;
}

/**
 * L5 — construit les DEUX schémas (origine figée + nouvelle vivante) avec un CADRE COMMUN (même échelle/cadrage : l'œil compare
 * des formes qui se correspondent). L'ensemble ROUGE vient du MOTEUR (rejouerRattachement, à froid, lecture seule) — aucun second
 * calcul, aucune persistance, aucun déclencheur. `aChange` : le second schéma n'a de sens que si l'origine est figée ET qu'un
 * changement existe (bâti nouveau/modifié OU jeu de cleabs différent) — sinon un jumeau sans intérêt.
 */
export async function lireComparaison(dossierId: number): Promise<ComparaisonRattachement> {
  const { corps, colonneManquante } = await lireCorps(dossierId);
  const { gj, empreinteFigee, motif } = await lireEmpreinte(dossierId);

  if (!empreinteFigee) {
    const vide: AffectationEtat = { empreinteFigee: false, motif, colonneManquante, schema: construireSchema(null, []), polygones: [], corps };
    return { origine: { ...vide, figee: false, captureVide: false, millesimeGel: null }, nouvelle: vide, polygonesModifies: [], aChange: false };
  }

  const { rows: capRows } = await query<{ capture: boolean; mill: string | null }>(
    `SELECT capture, source_millesime AS mill FROM permis_bati_capture WHERE dossier_id = $1`, [dossierId]);
  const cap = capRows[0];
  const figee = cap?.capture === true;

  const liveRows = await lireLiveRows(dossierId);
  const origineRows = figee ? await lireSnapshotRows(dossierId) : liveRows; // aucune capture → origine = vivant (assumé, non figé)

  const origineEntrees = rowsToEntrees(origineRows);
  const liveEntrees = rowsToEntrees(liveRows);
  const empGeom = geomDepuisGeoJSON(gj);
  const cadre = unionCadre(cadreDe(empGeom, origineEntrees), cadreDe(empGeom, liveEntrees)); // MÊME cadre pour les deux schémas

  const origAff = entreesVersAffect(origineEntrees, empGeom, cadre);
  const nouvAff = entreesVersAffect(liveEntrees, empGeom, cadre);

  const origine: AffectationOrigineEtat = {
    empreinteFigee: true, motif: null, colonneManquante, schema: origAff.schema, polygones: origAff.polygones, corps,
    figee, captureVide: figee && origineRows.length === 0, millesimeGel: figee ? (cap?.mill ?? null) : null,
  };
  const nouvelle: AffectationEtat = { empreinteFigee: true, motif: null, colonneManquante, schema: nouvAff.schema, polygones: nouvAff.polygones, corps };

  // Rouge = ensemble NOUVEAU/MODIFIÉ du moteur (jamais un second calcul). Sans origine figée, aucune référence → pas de rouge.
  let polygonesModifies: string[] = [];
  if (figee) {
    const { entrees } = await rejouerRattachement(dossierId);
    polygonesModifies = entrees.polygones.map((p) => p.cleabs).filter((c): c is string => c !== null);
  }
  const aChange = figee && (polygonesModifies.length > 0 || !memeEnsembleCleabs(origine.polygones, nouvelle.polygones));

  return { origine, nouvelle, polygonesModifies, aChange };
}

export type ResultatAffecter = { ok: true } | { ok: false; motif: string };

/**
 * Affecte ('ajout') ou désaffecte ('retrait') UN polygone d'un bâtiment, dans la TABLE DE LIAISON `permis_corps_polygone`.
 * M2 — ADDITIF : 'ajout' AJOUTE le polygone SANS toucher aux autres polygones du bâtiment (un bâtiment peut en porter plusieurs) ;
 * 'retrait' retire CE seul polygone. Une seule instruction (INSERT ou DELETE), exécutée en transaction (ATOMIQUE, cohérent avec la
 * garde de persistance). EXCLUSIVITÉ (a) garantie EN BASE par l'index unique (dossier_id, cleabs) : un 'ajout' d'un polygone déjà
 * pris par un AUTRE bâtiment du permis lève 23505 → refus explicite (l'écran l'empêche déjà en amont). NE FAIT AUCUNE injection (FUS-3e).
 */
export async function affecterPolygone(dossierId: number, corpsId: number, cleabs: string, action: ActionAffectation, majPar: string): Promise<ResultatAffecter> {
  // GARDE DE PERSISTANCE : tant qu'aucun dossier de rattachement n'existe pour ce permis (« aucun signal » = rien de mesuré à
  // arbitrer), on n'écrit AUCUN appariement — sinon on stockerait une donnée morte, relue plus tard sans être revérifiée. Message
  // EXPLICATIF (jamais technique) : l'affectation s'ouvrira quand un changement sera détecté. Même intention que validerRattachement.
  const { rows: dossier } = await query(`SELECT 1 FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
  if (dossier.length === 0) {
    return { ok: false, motif: 'aucun signal de mise à jour n’a encore été détecté pour ce permis : il n’y a rien à arbitrer. L’affectation des polygones aux bâtiments s’ouvrira dès qu’un changement (parcelle ou bâti) sera détecté.' };
  }
  const { rows } = await query(`SELECT 1 FROM permis_corps_batiment WHERE id = $1 AND dossier_id = $2`, [corpsId, dossierId]);
  if (rows.length === 0) return { ok: false, motif: 'corps inconnu pour ce permis' };
  try {
    return await withTransaction(async (q) => {
      if (action === 'retrait') {
        // RETRAIT : on enlève CE seul polygone de CE bâtiment (les autres restent affectés).
        await q(`DELETE FROM permis_corps_polygone WHERE dossier_id = $1 AND corps_id = $2 AND cleabs = $3`, [dossierId, corpsId, cleabs]);
      } else {
        // AJOUT : on ajoute CE polygone SANS retirer les autres → un bâtiment peut en porter plusieurs (M2).
        await q(`INSERT INTO permis_corps_polygone (dossier_id, corps_id, cleabs, maj_le, maj_par) VALUES ($1, $2, $3, now(), $4)`,
          [dossierId, corpsId, cleabs, majPar]);
      }
      return { ok: true } as ResultatAffecter;
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === '23505') return { ok: false, motif: 'ce polygone est déjà affecté à un autre bâtiment — désaffectez-le d’abord' };
    if (code === '42P01') return { ok: false, motif: 'affectation indisponible : migration 146 (table de liaison) non appliquée' };
    throw e;
  }
}
