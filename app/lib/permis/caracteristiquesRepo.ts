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
import { actionsNomsRepli, nomAffichageCorps } from './nomCorps'; // NOM-1/NOM-2 — décision pure des codes de repli maison (BP{rang}) + nom d'affichage (source unique)
import { fragmentCorpsActif, colonneCorpsActifDisponible } from './corpsActif'; // BAT-3 — prédicat « carte active » (219), résilient : une carte retirée est invisible de la lecture

export type OrigineValeur = 'saisie' | 'extraite';

// ── Champs PHYSIQUES d'un corps (nom logique → colonne SQL) : chacun porte une valeur ET une colonne `_origine`. ────────────────
const COLONNE_CORPS = {
  nbEtages: 'nb_etages',
  nbNiveauxSousSol: 'nb_niveaux_sous_sol',
  altitudeDernierPlancherNgf: 'altitude_dernier_plancher_ngf',
  altitudeSommetNgf: 'altitude_sommet_ngf',
  hauteurMaxPluNgf: 'hauteur_max_plu_ngf', // N10-E — limite de hauteur du PLU (NGF absolu), saisie humaine, éditée comme les autres mesures
  altitudePlateauNivellementNgf: 'altitude_plateau_nivellement_ngf', // N10-M — plateau de nivellement (plan de réf. du gabarit ; PAS le terrain naturel)
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
  // N10-H — DÉSIGNATION de l'opération (nom du projet, texte libre VERBATIM). Migration 132. Niveau permis, comme les autres déclarés.
  designation: string | null; designationOrigine: OrigineValeur | null;
  // N13 — sous-destinations réelles (tableau ; remplace nature_projet devenue vestigiale). Migration 110.
  destinations: string[] | null; destinationsOrigine: OrigineValeur | null;
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
  // N10-C/D — VALIDATION HUMAINE du sommet (seul champ marqué). « à confirmer » = origine 'extraite' ET confirmeLe null. `…ConfirmeParNom`
  //   = auteur résolu en « prénom nom » (N10-D : l'écran nomme l'auteur, pas son id).
  altitudeSommetNgfConfirmeLe: string | null; altitudeSommetNgfConfirmePar: string | null; altitudeSommetNgfConfirmeParNom: string | null;
  hauteurMaxPluNgf: number | null; hauteurMaxPluNgfOrigine: OrigineValeur | null; // N10-E — limite PLU (NGF), affichée à côté du sommet
  altitudePlateauNivellementNgf: number | null; altitudePlateauNivellementNgfOrigine: OrigineValeur | null; // N10-M — plateau de nivellement (NGF)
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
 * `extraite` → on écarte les champs dont l'origine ACTUELLE est déjà 'saisie', OU qui ont été CONFIRMÉS par un humain (N10-C) :
 * un recompute n'efface JAMAIS une décision humaine (saisie OU confirmation). Les autres sont écrits.
 * ⚠️ `confirmes` fait partie de l'invariant : le RETIRER ferait réécraser une valeur confirmée par une extraction (test ④).
 */
export function repartirEcriture<C extends string>(
  mode: OrigineValeur, champs: readonly C[], origineActuelle: Partial<Record<C, OrigineValeur | null>>, confirmes: ReadonlySet<C> = new Set(),
): ResultatEcriture<C> {
  if (mode === 'saisie') return { ecrits: [...champs], ignores: [] };
  const ecrits: C[] = []; const ignores: C[] = [];
  for (const c of champs) ((origineActuelle[c] === 'saisie' || confirmes.has(c)) ? ignores : ecrits).push(c);
  return { ecrits, ignores };
}

// ── LECTURE (une seule requête : global + tous les corps ACTIFS, ordre stable par id) ──────────────────────────────────────
export async function lirePermisCaracteristiques(dossierId: number): Promise<PermisCaracteristiques> {
  const fa = await fragmentCorpsActif(''); // BAT-3 — n'agrège QUE les cartes actives (retirées invisibles) ; vide si 219 non appliquée
  const { rows } = await query<{ global: GlobalPermis | null; corps: CorpsBatiment[] | null }>(
    `SELECT
       (SELECT json_build_object('parking', parking, 'parkingOrigine', parking_origine, 'commentaire', commentaire,
                                 'natureProjet', nature_projet, 'natureProjetOrigine', nature_projet_origine,
                                 'surfacePlancherM2', surface_plancher_m2, 'surfacePlancherM2Origine', surface_plancher_m2_origine,
                                 'nbLogements', nb_logements, 'nbLogementsOrigine', nb_logements_origine,
                                 'nbPlacesStationnement', nb_places_stationnement, 'nbPlacesStationnementOrigine', nb_places_stationnement_origine,
                                 'adresseTerrain', adresse_terrain, 'adresseTerrainOrigine', adresse_terrain_origine,
                                 'designation', designation, 'designationOrigine', designation_origine,
                                 'destinations', destinations, 'destinationsOrigine', destinations_origine,
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
           'altitudeSommetNgfConfirmeLe', altitude_sommet_ngf_confirme_le::text, 'altitudeSommetNgfConfirmePar', altitude_sommet_ngf_confirme_par,
           -- N10-D — auteur résolu en « prénom nom » (comparaison en TEXTE : pas de cast qui échouerait sur un auteur non numérique).
           'altitudeSommetNgfConfirmeParNom', (SELECT nullif(btrim(concat_ws(' ', u.prenom, u.nom)), '') FROM admin_utilisateur u WHERE u.id::text = altitude_sommet_ngf_confirme_par LIMIT 1),
           'hauteurMaxPluNgf', hauteur_max_plu_ngf, 'hauteurMaxPluNgfOrigine', hauteur_max_plu_ngf_origine,
           'altitudePlateauNivellementNgf', altitude_plateau_nivellement_ngf, 'altitudePlateauNivellementNgfOrigine', altitude_plateau_nivellement_ngf_origine,
           'hauteurRelativeM', hauteur_relative_m, 'hauteurRelativeMOrigine', hauteur_relative_m_origine,
           'altitudeTerrainNaturelNgf', altitude_terrain_naturel_ngf, 'altitudeTerrainNaturelNgfOrigine', altitude_terrain_naturel_ngf_origine,
           'empriseWkt', ST_AsText(emprise), 'empriseOrigine', emprise_origine,
           'adresse', adresse, 'adresseOrigine', adresse_origine,
           'majLe', maj_le::text, 'majPar', maj_par
         ) ORDER BY id)
         FROM permis_corps_batiment WHERE dossier_id = $1${fa}), '[]'::json) AS corps
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

  // Origines actuelles (invariant) — lecture ciblée des seules colonnes `_origine` concernées. N10-C : + le drapeau CONFIRMÉ du sommet
  //   (seul champ marqué) : une valeur confirmée est protégée d'un recompute au même titre qu'une saisie.
  const selOrig = champs.map((c) => `${COLONNE_CORPS[c]}_origine AS "${c}"`).join(', ');
  const litSommet = champs.includes('altitudeSommetNgf' as ChampCorps);
  const selConfirme = litSommet ? `, (altitude_sommet_ngf_confirme_le IS NOT NULL) AS "__sommetConfirme"` : '';
  const { rows } = await query<Partial<Record<ChampCorps, OrigineValeur | null>> & { __sommetConfirme?: boolean }>(
    `SELECT ${selOrig}${selConfirme} FROM permis_corps_batiment WHERE id = $1`, [corpsId]);
  const origineActuelle = rows[0] ?? {};
  const confirmes = new Set<ChampCorps>();
  if (rows[0]?.__sommetConfirme) confirmes.add('altitudeSommetNgf' as ChampCorps);

  const { ecrits, ignores } = repartirEcriture(mode, champs, origineActuelle, confirmes);
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

/**
 * NOM-1 — ATTRIBUE le nom de REPLI MAISON (`nom_repli` = 'BP{rang}' / 'BP') aux corps du dossier qui n'ont NI `repere` (nom lu dans les
 * documents) NI `nom_repli` déjà posé. À appeler au moment où un corps est CRÉÉ ou ADOPTÉ. Règles : le rang suit la POSITION du corps
 * dans le permis (ordre `id`, tous corps confondus) ; un permis à UN SEUL corps → 'BP' (sans numéro). 🔴 STABILITÉ : on n'écrit QUE les
 * `nom_repli` NULL (WHERE nom_repli IS NULL) — un nom déjà attribué n'est JAMAIS recalculé. 🔴 On n'écrit JAMAIS dans `repere`.
 * BEST-EFFORT & RÉSILIENT : colonne absente (migration 168 non appliquée, 42703) ou table absente → no-op silencieux (l'affichage
 * retombe sur « bâtiment {id} »). Ne relève jamais au caller (une attribution ratée ne doit pas faire échouer la création/adoption).
 */
export async function attribuerNomsRepli(dossierId: number): Promise<void> {
  try {
    const { rows } = await query<{ id: number; repere: string | null; nom_repli: string | null }>(
      `SELECT id::int AS id, repere, nom_repli FROM permis_corps_batiment WHERE dossier_id = $1 ORDER BY id`, [dossierId]);
    // NOM-2 — décision PURE partagée avec l'aperçu du rattrapage (mêmes garanties : jamais dans repere, jamais un nom déjà posé).
    for (const a of actionsNomsRepli(rows.map((r) => ({ id: r.id, repere: r.repere, nomRepli: r.nom_repli })))) {
      await query(`UPDATE permis_corps_batiment SET nom_repli = $2 WHERE id = $1 AND nom_repli IS NULL`, [a.corpsId, a.code]);
    }
  } catch { /* colonne/table absente ou indisponible : best-effort, l'affichage retombe sur « bâtiment {id} ». */ }
}

/** Supprime un corps par son id (DELETE PHYSIQUE). `false` si l'id est inconnu. ⚠️ BAT-3 : ce chemin destructif N'EST PLUS appelé par le
 *  changement de nombre de bâtiments (qui passe par le RETRAIT SOFT `retirerCorps`). Conservé pour les rares gestes d'administration explicites. */
export async function supprimerCorps(corpsId: number): Promise<boolean> {
  const res = await query(`DELETE FROM permis_corps_batiment WHERE id = $1`, [corpsId]);
  return (res.rowCount ?? 0) > 0;
}

// ── BAT-3 — RETRAIT NON DESTRUCTIF d'une carte de bâtiment (soft-delete, migration 219) + réactivation + lecture des cartes retirées ──
const estColonneAbsente = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703'; // colonne inexistante

/**
 * BAT-3 — RETIRE une carte (retrait SOFT : actif=false + trace desactive_le/_par ; qui/quand). JAMAIS de DELETE. Idempotent : `false` si la
 * carte est inconnue OU déjà retirée (WHERE … AND actif). Requiert la migration 219 (colonnes actif/desactive_*) : l'appelant SONDE
 * `colonneCorpsActifDisponible()` AVANT (l'écran ne propose le retrait qu'après 219) — ici, colonne absente ⇒ l'UPDATE lève 42703 (remonté au caller).
 */
export async function retirerCorps(corpsId: number, majPar: string): Promise<boolean> {
  const res = await query(
    `UPDATE permis_corps_batiment SET actif = false, desactive_le = now(), desactive_par = $2, maj_le = now(), maj_par = $2 WHERE id = $1 AND actif`,
    [corpsId, majPar]);
  return (res.rowCount ?? 0) > 0;
}

/** BAT-3 — RÉACTIVE une carte retirée : actif=true, trace de retrait effacée (desactive_le/_par NULL). La ligne et ses valeurs (altitude
 *  validée, emprise, repère) étaient INTACTES → elles reviennent telles quelles. Idempotent : `false` si inconnue OU déjà active. */
export async function reactiverCorps(corpsId: number, majPar: string): Promise<boolean> {
  const res = await query(
    `UPDATE permis_corps_batiment SET actif = true, desactive_le = NULL, desactive_par = NULL, maj_le = now(), maj_par = $2 WHERE id = $1 AND NOT actif`,
    [corpsId, majPar]);
  return (res.rowCount ?? 0) > 0;
}

/** BAT-3 — une carte active réduite aux signaux du PLAN de retrait (module pur `retraitCartes`). `vide` = aucune valeur portée. */
export interface CartePlan { id: number; nom: string; vide: boolean; valideeAltitude: boolean }
// « aucune valeur » = toutes les colonnes de mesure + emprise (corps) + repère + adresse à NULL. (L'emprise RECONSTRUITE est ajoutée à part.)
const CORPS_SANS_VALEUR =
  `cb.altitude_sommet_ngf IS NULL AND cb.emprise IS NULL AND cb.repere IS NULL AND cb.nb_etages IS NULL
   AND cb.nb_niveaux_sous_sol IS NULL AND cb.altitude_dernier_plancher_ngf IS NULL AND cb.hauteur_max_plu_ngf IS NULL
   AND cb.altitude_plateau_nivellement_ngf IS NULL AND cb.hauteur_relative_m IS NULL AND cb.altitude_terrain_naturel_ngf IS NULL AND cb.adresse IS NULL`;

/**
 * BAT-3 — cartes ACTIVES d'un dossier, prêtes pour `planRetraitCartes` : nom (source unique `nomAffichageCorps`), `valideeAltitude`
 * (confirme_le posé) et `vide`. Une carte n'est VIDE que si elle n'a AUCUNE valeur de corps ET AUCUNE emprise RECONSTRUITE tracée
 * (lecture séparée, résiliente : table 149 absente → aucune → conservateur). RÉSILIENT à l'absence de nom_repli (168).
 */
export async function lireCartesPourPlan(dossierId: number): Promise<CartePlan[]> {
  const fa = await fragmentCorpsActif('cb');
  const sql = (avecNomRepli: boolean) =>
    `SELECT cb.id::int AS id, cb.repere${avecNomRepli ? ', cb.nom_repli' : ', NULL::text AS nom_repli'},
            (cb.altitude_sommet_ngf_confirme_le IS NOT NULL) AS validee_altitude, (${CORPS_SANS_VALEUR}) AS sans_valeur
       FROM permis_corps_batiment cb WHERE cb.dossier_id = $1${fa} ORDER BY cb.id`;
  type Row = { id: number; repere: string | null; nom_repli: string | null; validee_altitude: boolean; sans_valeur: boolean };
  let rows: Row[];
  try { rows = (await query<Row>(sql(true), [dossierId])).rows; }
  catch (e) { if (!estColonneAbsente(e)) throw e; rows = (await query<Row>(sql(false), [dossierId])).rows; } // 168 absente → sans nom_repli
  // Emprises RECONSTRUITES tracées (par corps) — séparé et résilient (table 149 absente → ensemble vide → aucune n'empêche « vide »).
  const avecEmprise = new Set<number>();
  if (rows.length > 0) {
    try {
      const r = await query<{ id: number }>(`SELECT DISTINCT corps_id::int AS id FROM permis_emprise_reconstruite WHERE corps_id = ANY($1::int[])`, [rows.map((x) => x.id)]);
      for (const x of r.rows) avecEmprise.add(Number(x.id));
    } catch { /* 149 absente → aucune emprise reconstruite (rien à protéger) */ }
  }
  return rows.map((r) => ({
    id: Number(r.id), nom: nomAffichageCorps({ repere: r.repere, nomRepli: r.nom_repli, corpsId: Number(r.id) }),
    valideeAltitude: r.validee_altitude === true, vide: r.sans_valeur === true && !avecEmprise.has(Number(r.id)),
  }));
}

/** BAT-3 — carte RETIRÉE (soft), pour le geste de RÉACTIVATION : nom, altitude validée (préservée), qui/quand du retrait (auteur résolu en nom). */
export interface CorpsRetire { id: number; nom: string; valideeAltitude: boolean; desactiveLe: string | null; desactiveParNom: string | null }

/** BAT-3 — cartes retirées d'un dossier (les plus récemment retirées en tête). `[]` si 219 non appliquée (aucune carte ne peut être retirée). */
export async function lireCorpsRetires(dossierId: number): Promise<CorpsRetire[]> {
  if (!(await colonneCorpsActifDisponible())) return []; // 219 non appliquée → aucune carte retirée possible
  const sql = (avecNomRepli: boolean) =>
    `SELECT cb.id::int AS id, cb.repere${avecNomRepli ? ', cb.nom_repli' : ', NULL::text AS nom_repli'},
            (cb.altitude_sommet_ngf_confirme_le IS NOT NULL) AS validee_altitude, cb.desactive_le::text AS desactive_le,
            (SELECT nullif(btrim(concat_ws(' ', u.prenom, u.nom)), '') FROM admin_utilisateur u WHERE u.id::text = cb.desactive_par LIMIT 1) AS desactive_par_nom
       FROM permis_corps_batiment cb WHERE cb.dossier_id = $1 AND NOT cb.actif ORDER BY cb.desactive_le DESC NULLS LAST, cb.id`;
  type Row = { id: number; repere: string | null; nom_repli: string | null; validee_altitude: boolean; desactive_le: string | null; desactive_par_nom: string | null };
  let rows: Row[];
  try { rows = (await query<Row>(sql(true), [dossierId])).rows; }
  catch (e) { if (!estColonneAbsente(e)) throw e; rows = (await query<Row>(sql(false), [dossierId])).rows; } // 168 absente → sans nom_repli
  return rows.map((r) => ({
    id: Number(r.id), nom: nomAffichageCorps({ repere: r.repere, nomRepli: r.nom_repli, corpsId: Number(r.id) }),
    valideeAltitude: r.validee_altitude === true, desactiveLe: r.desactive_le, desactiveParNom: r.desactive_par_nom ?? null,
  }));
}

/**
 * BAT-3 — TRACE d'audit d'un changement de nombre / retrait / réactivation, dans le journal EXISTANT `permis_extraction_journal` (pas de
 * 2e journal). Ligne INERTE pour tous ses lecteurs : role='candidat' (exclu de lireJournalChamps/proprietairesRetenue qui filtrent
 * 'retenue'/'ecartee') et origine NULL (exclu de lireOrigineExtractionSansIa qui exige origine NOT NULL) → n'affecte ni le journal
 * affiché, ni la précédence, ni la ligne 6 du LOT 99. Le récit (qui/ancien→nouveau/cartes) va dans motif+extrait ; l'ACTEUR est aussi porté
 * par les colonnes de ligne (desactive_par / nb_batiments_valide_par). BEST-EFFORT : table 104 absente → no-op (les colonnes _le/_par tracent déjà).
 */
export async function journalBatiments(dossierId: number, corpsId: number | null, champ: 'nb_batiments_valide' | 'corps_actif', valeur: number | null, recit: string): Promise<void> {
  try {
    await query(
      `INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, valeur, role, methode, motif, extrait, extrait_le)
       VALUES ($1, $2, $3, $4, 'candidat', 'motifs', $5, $5, now())`,
      [dossierId, corpsId, champ, valeur, recit]);
  } catch { /* 104 absente / indisponible : trace best-effort (ne fait jamais échouer l'opération ; les colonnes _le/_par portent déjà qui/quand). */ }
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

/**
 * N10-D — VALIDE la hauteur de sommet : écrit LA VALEUR DU CHAMP (fournie par l'utilisateur, modifiée ou non) en origine 'saisie'
 * — c'est une DÉCISION HUMAINE — et pose la trace nominative (confirme_le/confirme_par). Corrige le piège N10-C où « Confirmer »
 * tamponnait la valeur STOCKÉE, pas celle sous les yeux. `valeur` null (champ vidé) → efface la hauteur (valeur + origine + marqueur,
 * ensemble). Le contrôle des bornes est fait par la route (comme pour une écriture de corps). Le recompute ne réécrit jamais une
 * valeur 'saisie' (invariant), donc la décision est protégée.
 */
export async function validerSommetCorps(corpsId: number, valeur: number | null, majPar: string): Promise<void> {
  if (valeur === null) {
    await query(
      `UPDATE permis_corps_batiment
          SET altitude_sommet_ngf = NULL, altitude_sommet_ngf_origine = NULL,
              altitude_sommet_ngf_confirme_le = NULL, altitude_sommet_ngf_confirme_par = NULL, maj_le = now(), maj_par = $2
        WHERE id = $1`, [corpsId, majPar]);
    return;
  }
  await query(
    `UPDATE permis_corps_batiment
        SET altitude_sommet_ngf = $2, altitude_sommet_ngf_origine = 'saisie',
            altitude_sommet_ngf_confirme_le = now(), altitude_sommet_ngf_confirme_par = $3, maj_le = now(), maj_par = $3
      WHERE id = $1`, [corpsId, valeur, majPar]);
}

/** Lecture SEULE de l'altitude du dernier plancher d'un corps (contrôle de cohérence sommet/plancher côté serveur). `null` si absente
 *  ou corps inconnu → le contrôle ne bloque alors PAS (on ne peut pas prouver l'incohérence sans le plancher). */
export async function lireAltitudeDernierPlancherCorps(corpsId: number): Promise<number | null> {
  const { rows } = await query<{ p: string | number | null }>(
    `SELECT altitude_dernier_plancher_ngf AS p FROM permis_corps_batiment WHERE id = $1`, [corpsId]);
  const v = rows[0]?.p;
  return v == null ? null : Number(v);
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
  designation: 'designation', // N10-H — désignation de l'opération (texte libre VERBATIM, migration 132) : invariant saisie réutilisé
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

// ── N13 — ÉCRITURE du TABLEAU `destinations` (migration 110) ────────────────────────────────────────────────────────────────────
/**
 * Upsert du tableau `destinations` (+ `destinations_origine`), invariant 103 RÉUTILISÉ : mode 'saisie' écrase tout ; 'extraite'
 * n'écrase PAS une valeur déjà 'saisie' (rendu `ignore:true`). Valeur + origine posées ENSEMBLE (tableau vide/null ⇒ origine null).
 * Le driver `pg` sérialise le `string[]` en `text[]` ; la LISTE FERMÉE est garantie par le CHECK de la base (source unique).
 */
export async function ecrireDestinations(dossierId: number, valeurs: string[] | null, mode: OrigineValeur, majPar: string): Promise<{ ecrit: boolean; ignore: boolean }> {
  const { rows } = await query<{ o: OrigineValeur | null }>(`SELECT destinations_origine AS o FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
  if (mode === 'extraite' && (rows[0]?.o ?? null) === 'saisie') return { ecrit: false, ignore: true }; // la main l'emporte
  const v = valeurs && valeurs.length > 0 ? valeurs : null;
  await query(
    `INSERT INTO permis_caracteristique (dossier_id, destinations, destinations_origine, maj_le, maj_par)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (dossier_id) DO UPDATE SET destinations = $2, destinations_origine = $3, maj_le = now(), maj_par = $4`,
    [dossierId, v, v === null ? null : mode, majPar]);
  return { ecrit: true, ignore: false };
}

/**
 * BAT-2c — COMPTES de caractéristiques PAR DOSSIER (batché) pour l'agrégat d'état de la famille « Caractéristiques du permis » de l'encart
 * (Réponses / Suivi). Par dossier : nb de cartes (permis_corps_batiment), nb sans altitude de sommet (altitude_sommet_ngf NULL), nombre
 * VALIDÉ (BAT-1, permis_caracteristique.nb_batiments_valide ; null si 218 absente → RÉSILIENT, lu à part). LECTURE SEULE. Un dossier sans
 * corps → nbCartes 0. L'appelant calcule l'état via les fonctions PURES (etatCaracteristiquesPermis) — aucune logique d'état ici (source unique).
 */
export async function lireCaracteristiquesComptesParDossier(
  dossierIds: readonly number[],
): Promise<Map<number, { nbCartes: number; nbSansAltitude: number; nbBatimentsValide: number | null }>> {
  const m = new Map<number, { nbCartes: number; nbSansAltitude: number; nbBatimentsValide: number | null }>();
  if (dossierIds.length === 0) return m;
  try {
    const fa = await fragmentCorpsActif(''); // BAT-3 — ne compte QUE les cartes actives (une carte retirée sort du compte de la famille)
    const { rows } = await query<{ dossier_id: number | string; nb_cartes: number | string; nb_sans_alt: number | string }>(
      `SELECT dossier_id, count(*)::int AS nb_cartes,
              count(*) FILTER (WHERE altitude_sommet_ngf IS NULL)::int AS nb_sans_alt
         FROM permis_corps_batiment WHERE dossier_id = ANY($1::int[])${fa} GROUP BY dossier_id`, [dossierIds]);
    for (const r of rows) m.set(Number(r.dossier_id), { nbCartes: Number(r.nb_cartes), nbSansAltitude: Number(r.nb_sans_alt), nbBatimentsValide: null });
  } catch { return m; } // lecture des corps indisponible → map vide (défensif)
  // nb_batiments_valide SÉPARÉ + RÉSILIENT (218) : ne jamais faire échouer les comptes de corps si la colonne manque.
  try {
    const { rows } = await query<{ dossier_id: number | string; n: number | null }>(
      `SELECT dossier_id, nb_batiments_valide AS n FROM permis_caracteristique WHERE dossier_id = ANY($1::int[])`, [dossierIds]);
    for (const r of rows) {
      const e = m.get(Number(r.dossier_id)) ?? { nbCartes: 0, nbSansAltitude: 0, nbBatimentsValide: null };
      e.nbBatimentsValide = r.n === null ? null : Number(r.n);
      m.set(Number(r.dossier_id), e);
    }
  } catch { /* 218 absente → nbBatimentsValide reste null (porteur neutre) */ }
  return m;
}
