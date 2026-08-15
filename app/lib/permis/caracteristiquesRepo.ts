/**
 * N3-B — DÉPÔT des caractéristiques physiques d'un permis (tables `permis_caracteristique` + `permis_corps_batiment`, migration
 * 103). Lecture, écriture À LA MAIN (origine 'saisie') et écriture AUTOMATIQUE (origine 'extraite').
 *
 * 🔒 INVARIANT CENTRAL, porté ICI (jamais par l'écran) : une écriture AUTOMATIQUE n'écrase JAMAIS un champ dont l'origine est
 * déjà 'saisie' — elle le laisse tel quel et le signale (liste des champs ignorés). Une écriture À LA MAIN écrase tout, y compris
 * une valeur 'extraite'. Corollaire : valeur et origine se posent TOUJOURS ENSEMBLE (jamais l'une sans l'autre ; une valeur NULL
 * ⇒ origine NULL). Les BORNES ne sont PAS revérifiées ici : ce sont les CHECK de la base qui les portent (source unique).
 *
 * La traçabilité « quelle pièce, quelle page » n'est PAS ici (propositions N5). Module PROPRE : n'importe que `db/client`.
 */
import { query } from '../db/client';

export type OrigineValeur = 'saisie' | 'extraite';

// ── Champs PHYSIQUES d'un corps (nom logique → colonne SQL) : chacun porte une valeur ET une colonne `_origine`. ────────────────
const COLONNE_CORPS = {
  nbEtages: 'nb_etages',
  nbNiveauxSousSol: 'nb_niveaux_sous_sol',
  altitudeDernierPlancherNgf: 'altitude_dernier_plancher_ngf',
  altitudeSommetNgf: 'altitude_sommet_ngf',
  hauteurRelativeM: 'hauteur_relative_m',
  altitudeTerrainNaturelNgf: 'altitude_terrain_naturel_ngf',
  emprise: 'emprise',
} as const;
export type ChampCorps = keyof typeof COLONNE_CORPS;
export const CHAMPS_CORPS = Object.keys(COLONNE_CORPS) as ChampCorps[];

/** Valeurs à écrire sur un corps : nombres (ou null) pour les mesures, WKT (Polygon L93) ou null pour l'emprise. */
export type ValeursCorps = { [K in Exclude<ChampCorps, 'emprise'>]?: number | null } & { emprise?: string | null };

// ── Types de lecture ──────────────────────────────────────────────────────────
export interface GlobalPermis {
  parking: boolean | null; parkingOrigine: OrigineValeur | null;
  commentaire: string | null; majLe: string | null; majPar: string | null;
  // N7-C/E — caractéristiques DÉCLARÉES (migration 106), niveau permis.
  natureProjet: string | null; natureProjetOrigine: OrigineValeur | null;
  surfacePlancherM2: number | null; surfacePlancherM2Origine: OrigineValeur | null;
  nbLogements: number | null; nbLogementsOrigine: OrigineValeur | null;
  nbPlacesStationnement: number | null; nbPlacesStationnementOrigine: OrigineValeur | null;
  adresseTerrain: string | null; adresseTerrainOrigine: OrigineValeur | null;
  // N8-B/C — point le plus haut relevé sur les planches du permis (acrotère max), NON rattaché à un corps (attribution par lot non
  // établie, cf. P4/P5). Niveau PERMIS, DISTINCT de CorpsBatiment.altitudeSommetNgf (valeur par corps). Migration 108.
  altitudeSommetNgf: number | null; altitudeSommetNgfOrigine: OrigineValeur | null;
}
export interface CorpsBatiment {
  id: number; repere: string | null;
  nbEtages: number | null; nbEtagesOrigine: OrigineValeur | null;
  nbNiveauxSousSol: number | null; nbNiveauxSousSolOrigine: OrigineValeur | null;
  altitudeDernierPlancherNgf: number | null; altitudeDernierPlancherNgfOrigine: OrigineValeur | null;
  altitudeSommetNgf: number | null; altitudeSommetNgfOrigine: OrigineValeur | null;
  hauteurRelativeM: number | null; hauteurRelativeMOrigine: OrigineValeur | null;
  altitudeTerrainNaturelNgf: number | null; altitudeTerrainNaturelNgfOrigine: OrigineValeur | null;
  empriseWkt: string | null; empriseOrigine: OrigineValeur | null;
  adresse: string | null; adresseOrigine: OrigineValeur | null; // N7-C/E — adresse déclarée du corps
  majLe: string | null; majPar: string | null;
}
export interface PermisCaracteristiques { global: GlobalPermis | null; corps: CorpsBatiment[] }

/** Résultat d'une écriture : champs réellement écrits + champs IGNORÉS (protégés par une saisie manuelle, invariant). */
export interface ResultatEcriture<C extends string = string> { ecrits: C[]; ignores: C[] }

/**
 * 🔒 CŒUR de l'invariant, PUR (testable sans base). `saisie` → on écrit TOUT (la main écrase, y compris une valeur 'extraite').
 * `extraite` → on écarte les champs dont l'origine ACTUELLE est déjà 'saisie' (jamais écrasés), les autres sont écrits.
 */
export function repartirEcriture<C extends string>(mode: OrigineValeur, champs: readonly C[], origineActuelle: Partial<Record<C, OrigineValeur | null>>): ResultatEcriture<C> {
  if (mode === 'saisie') return { ecrits: [...champs], ignores: [] };
  const ecrits: C[] = []; const ignores: C[] = [];
  for (const c of champs) (origineActuelle[c] === 'saisie' ? ignores : ecrits).push(c);
  return { ecrits, ignores };
}

// ── LECTURE (une seule requête : global + tous les corps, ordre stable par id) ──────────────────────────────────────────────
export async function lirePermisCaracteristiques(dossierId: number): Promise<PermisCaracteristiques> {
  const { rows } = await query<{ global: GlobalPermis | null; corps: CorpsBatiment[] | null }>(
    `SELECT
       (SELECT json_build_object('parking', parking, 'parkingOrigine', parking_origine, 'commentaire', commentaire,
                                 'natureProjet', nature_projet, 'natureProjetOrigine', nature_projet_origine,
                                 'surfacePlancherM2', surface_plancher_m2, 'surfacePlancherM2Origine', surface_plancher_m2_origine,
                                 'nbLogements', nb_logements, 'nbLogementsOrigine', nb_logements_origine,
                                 'nbPlacesStationnement', nb_places_stationnement, 'nbPlacesStationnementOrigine', nb_places_stationnement_origine,
                                 'adresseTerrain', adresse_terrain, 'adresseTerrainOrigine', adresse_terrain_origine,
                                 'altitudeSommetNgf', altitude_sommet_ngf, 'altitudeSommetNgfOrigine', altitude_sommet_ngf_origine,
                                 'majLe', maj_le::text, 'majPar', maj_par)
          FROM permis_caracteristique WHERE dossier_id = $1) AS global,
       COALESCE((
         SELECT json_agg(json_build_object(
           'id', id::int, 'repere', repere,
           'nbEtages', nb_etages, 'nbEtagesOrigine', nb_etages_origine,
           'nbNiveauxSousSol', nb_niveaux_sous_sol, 'nbNiveauxSousSolOrigine', nb_niveaux_sous_sol_origine,
           'altitudeDernierPlancherNgf', altitude_dernier_plancher_ngf, 'altitudeDernierPlancherNgfOrigine', altitude_dernier_plancher_ngf_origine,
           'altitudeSommetNgf', altitude_sommet_ngf, 'altitudeSommetNgfOrigine', altitude_sommet_ngf_origine,
           'hauteurRelativeM', hauteur_relative_m, 'hauteurRelativeMOrigine', hauteur_relative_m_origine,
           'altitudeTerrainNaturelNgf', altitude_terrain_naturel_ngf, 'altitudeTerrainNaturelNgfOrigine', altitude_terrain_naturel_ngf_origine,
           'empriseWkt', ST_AsText(emprise), 'empriseOrigine', emprise_origine,
           'adresse', adresse, 'adresseOrigine', adresse_origine,
           'majLe', maj_le::text, 'majPar', maj_par
         ) ORDER BY id)
         FROM permis_corps_batiment WHERE dossier_id = $1), '[]'::json) AS corps
     `,
    [dossierId],
  );
  const r = rows[0];
  return { global: r?.global ?? null, corps: r?.corps ?? [] };
}

// ── ÉCRITURE d'un CORPS (invariant appliqué au grain champ) ─────────────────────────────────────────────────────────────────
/**
 * Pose les `valeurs` sur un corps avec l'`origine` = `mode`. AUTOMATIQUE : ne touche pas un champ déjà 'saisie' (rendu dans
 * `ignores`). Valeur et origine posées ENSEMBLE (valeur null ⇒ origine null). `mode` non consulté pour le calcul des bornes
 * (CHECK de la base). Aucune écriture si tous les champs fournis sont protégés.
 */
export async function ecrireCorps(corpsId: number, valeurs: ValeursCorps, mode: OrigineValeur, majPar: string): Promise<ResultatEcriture<ChampCorps>> {
  const champs = (Object.keys(valeurs) as ChampCorps[]).filter((c) => c in COLONNE_CORPS);
  if (champs.length === 0) return { ecrits: [], ignores: [] };

  // Origines actuelles (invariant) — lecture ciblée des seules colonnes `_origine` concernées.
  const selOrig = champs.map((c) => `${COLONNE_CORPS[c]}_origine AS "${c}"`).join(', ');
  const { rows } = await query<Partial<Record<ChampCorps, OrigineValeur | null>>>(
    `SELECT ${selOrig} FROM permis_corps_batiment WHERE id = $1`, [corpsId]);
  const origineActuelle = rows[0] ?? {};

  const { ecrits, ignores } = repartirEcriture(mode, champs, origineActuelle);
  if (ecrits.length === 0) return { ecrits, ignores };

  const params: unknown[] = [];
  const sets: string[] = [];
  for (const c of ecrits) {
    const col = COLONNE_CORPS[c];
    const v = valeurs[c] ?? null;
    // VALEUR + ORIGINE ENSEMBLE : v null ⇒ origine null (jamais l'une sans l'autre).
    if (c === 'emprise') {
      if (v === null) sets.push(`${col} = NULL`);
      else { params.push(v); sets.push(`${col} = ST_GeomFromText($${params.length}, 2154)`); }
    } else {
      params.push(v); sets.push(`${col} = $${params.length}`);
    }
    params.push(v === null ? null : mode); sets.push(`${col}_origine = $${params.length}`);
  }
  params.push(majPar); const pMajPar = params.length;
  params.push(corpsId); const pId = params.length;
  await query(`UPDATE permis_corps_batiment SET ${sets.join(', ')}, maj_le = now(), maj_par = $${pMajPar} WHERE id = $${pId}`, params);
  return { ecrits, ignores };
}

/** Crée un corps (vide, éventuellement nommé) sur un permis. Renvoie son id. */
export async function creerCorps(dossierId: number, repere: string | null, majPar: string): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO permis_corps_batiment (dossier_id, repere, maj_le, maj_par) VALUES ($1, $2, now(), $3) RETURNING id::int AS id`,
    [dossierId, repere, majPar]);
  return rows[0].id;
}

/** Supprime un corps par son id. `false` si l'id est inconnu. */
export async function supprimerCorps(corpsId: number): Promise<boolean> {
  const res = await query(`DELETE FROM permis_corps_batiment WHERE id = $1`, [corpsId]);
  return (res.rowCount ?? 0) > 0;
}

/** N3-C — renomme un corps (le `repere` n'a PAS d'origine : c'est un libellé humain, comme le commentaire du global). `null` = anonyme. */
export async function definirRepere(corpsId: number, repere: string | null, majPar: string): Promise<void> {
  await query(`UPDATE permis_corps_batiment SET repere = $2, maj_le = now(), maj_par = $3 WHERE id = $1`, [corpsId, repere, majPar]);
}

/** N7-E — écrit À LA MAIN l'adresse déclarée d'un corps (origine 'saisie' ; NULL = vide → origine null). La saisie écrase tout. */
export async function definirAdresseCorps(corpsId: number, adresse: string | null, majPar: string): Promise<void> {
  const v = adresse && adresse.trim() !== '' ? adresse.trim() : null;
  await query(`UPDATE permis_corps_batiment SET adresse = $2, adresse_origine = $3, maj_le = now(), maj_par = $4 WHERE id = $1`,
    [corpsId, v, v === null ? null : 'saisie', majPar]);
}

// ── ÉCRITURE du GLOBAL (parking porte l'invariant ; commentaire = note humaine sans origine) ───────────────────────────────────
/**
 * Upsert du global d'un permis. `parking` suit l'invariant (AUTOMATIQUE ne l'écrase pas s'il est déjà 'saisie') ; `commentaire`
 * n'a pas d'origine (note humaine) → écrit tel quel quand fourni. Valeur+origine du parking posées ensemble (null ⇒ null).
 */
export async function ecrireGlobal(dossierId: number, valeurs: { parking?: boolean | null; commentaire?: string | null }, mode: OrigineValeur, majPar: string): Promise<ResultatEcriture<'parking' | 'commentaire'>> {
  const ecrits: ('parking' | 'commentaire')[] = [];
  const ignores: ('parking' | 'commentaire')[] = [];

  let parkingOrigineActuelle: OrigineValeur | null = null;
  if ('parking' in valeurs) {
    const { rows } = await query<{ o: OrigineValeur | null }>(`SELECT parking_origine AS o FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
    parkingOrigineActuelle = rows[0]?.o ?? null;
  }

  const cols: string[] = ['dossier_id']; const insVals: string[] = ['$1']; const updSets: string[] = []; const params: unknown[] = [dossierId];
  const ajoute = (col: string, val: unknown) => { params.push(val); cols.push(col); insVals.push(`$${params.length}`); updSets.push(`${col} = $${params.length}`); };

  if ('parking' in valeurs) {
    const { ecrits: e } = repartirEcriture(mode, ['parking'] as const, { parking: parkingOrigineActuelle });
    if (e.length === 0) ignores.push('parking');
    else {
      const v = valeurs.parking ?? null;
      ajoute('parking', v);
      ajoute('parking_origine', v === null ? null : mode); // valeur + origine ensemble
      ecrits.push('parking');
    }
  }
  if ('commentaire' in valeurs) { ajoute('commentaire', valeurs.commentaire ?? null); ecrits.push('commentaire'); }

  if (cols.length === 1) return { ecrits, ignores }; // rien à poser (ex. AUTOMATIQUE sur un parking déjà 'saisie')
  ajoute('maj_par', majPar);
  await query(
    `INSERT INTO permis_caracteristique (${cols.join(', ')}, maj_le) VALUES (${insVals.join(', ')}, now())
       ON CONFLICT (dossier_id) DO UPDATE SET ${[...updSets, 'maj_le = now()'].join(', ')}`,
    params);
  return { ecrits, ignores };
}

// ── N7-C/N7-D — ÉCRITURE des CARACTÉRISTIQUES DÉCLARÉES au niveau PERMIS (colonnes de la migration 106) ──────────────────────────
// Colonnes de permis_caracteristique portant chacune sa valeur ET son `_origine` (invariant 103 réutilisé).
const COLONNE_GLOBAL_DECLARE = {
  natureProjet: 'nature_projet',
  surfacePlancherM2: 'surface_plancher_m2',
  nbLogements: 'nb_logements',
  nbPlacesStationnement: 'nb_places_stationnement',
  adresseTerrain: 'adresse_terrain',
  altitudeSommetNgf: 'altitude_sommet_ngf', // N8-C — sommet du PERMIS (migration 108) : éditable à la main comme les autres déclarés, invariant réutilisé
} as const;
export type ChampGlobalDeclare = keyof typeof COLONNE_GLOBAL_DECLARE;
/** Valeurs à poser : texte (nature/adresse) ou nombre (surface/logements/stationnement), ou null. */
export type ValeursGlobalDeclare = Partial<Record<ChampGlobalDeclare, string | number | null>>;

/**
 * Upsert des caractéristiques DÉCLARÉES d'un permis (niveau PERMIS — jamais soumis à la règle « ≥2 corps »). Chaque champ suit
 * l'invariant : mode 'saisie' écrase tout ; mode automatique ('extraite') n'écrase PAS un champ déjà 'saisie' (rendu dans
 * `ignores`). Valeur + origine posées ENSEMBLE (valeur null ⇒ origine null). Réutilise `repartirEcriture` — pas de réimplémentation.
 */
export async function ecrireCaracteristiquesGlobales(dossierId: number, valeurs: ValeursGlobalDeclare, mode: OrigineValeur, majPar: string): Promise<ResultatEcriture<ChampGlobalDeclare>> {
  const champs = (Object.keys(valeurs) as ChampGlobalDeclare[]).filter((c) => c in COLONNE_GLOBAL_DECLARE);
  if (champs.length === 0) return { ecrits: [], ignores: [] };

  // Origines actuelles (invariant) — lecture ciblée des seules colonnes `_origine` concernées.
  const selOrig = champs.map((c) => `${COLONNE_GLOBAL_DECLARE[c]}_origine AS "${c}"`).join(', ');
  const { rows } = await query<Partial<Record<ChampGlobalDeclare, OrigineValeur | null>>>(
    `SELECT ${selOrig} FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
  const origineActuelle = rows[0] ?? {};

  const { ecrits, ignores } = repartirEcriture(mode, champs, origineActuelle);
  if (ecrits.length === 0) return { ecrits, ignores };

  const cols: string[] = ['dossier_id']; const insVals: string[] = ['$1']; const updSets: string[] = []; const params: unknown[] = [dossierId];
  const ajoute = (col: string, val: unknown) => { params.push(val); cols.push(col); insVals.push(`$${params.length}`); updSets.push(`${col} = $${params.length}`); };
  for (const c of ecrits) {
    const col = COLONNE_GLOBAL_DECLARE[c];
    const v = valeurs[c] ?? null;
    ajoute(col, v);
    ajoute(`${col}_origine`, v === null ? null : mode); // valeur + origine ensemble
  }
  ajoute('maj_par', majPar);
  await query(
    `INSERT INTO permis_caracteristique (${cols.join(', ')}, maj_le) VALUES (${insVals.join(', ')}, now())
       ON CONFLICT (dossier_id) DO UPDATE SET ${[...updSets, 'maj_le = now()'].join(', ')}`,
    params);
  return { ecrits, ignores };
}
