/**
 * ÉMISSION DU CERTIFICAT (Lot 4) — re-dérivation serveur + insertion IMMUABLE.
 *
 * Le certificat FAIT FOI : son résultat est RE-DÉRIVÉ CÔTÉ SERVEUR (déterministe, cf. golden), JAMAIS reçu du
 * front. Ce module lit le projet, REJOUE l'analyse avec le mode RÉELLEMENT employé (mode_origine, migration 033),
 * fige un instantané complet et l'insère dans `certificat` (table immuable, 031).
 *
 * DÉCOUPAGE POOL / TRANSACTION (décision de recon) : toutes les LECTURES (projet, pré-contrôle d'idempotence,
 * re-jeu du pipeline, cadastre/année/empreinte) passent par le POOL, HORS transaction — elles n'ont pas à tenir
 * un verrou pendant le re-jeu (lent : LiDAR/raster). La transaction ne couvre que le geste atomique final :
 * `attribuerNumeroCertificat(q)` PUIS `INSERT certificat`. Si l'INSERT échoue (course : violation de
 * `certificat_projet_unique`, 034), la transaction rollback → le numéro attribué est LIBÉRÉ (série non trouée).
 *
 * IDEMPOTENCE (un projet, un certificat, à vie — 034) : deux chemins couverts.
 *   • Pré-contrôle (confort) : si un certificat existe déjà pour le projet, on le RENVOIE sans rien réémettre.
 *   • Filet (course concurrente) : deux requêtes lisent toutes deux « rien » puis insèrent ; la seconde viole la
 *     contrainte (23505) → on RELIT et on renvoie l'existant. Jamais un doublon, jamais une erreur à l'appelant.
 *
 * DEUX REFUS D'ÉMETTRE (réponses PROPRES, jamais une exception, jamais un certificat dégradé) :
 *   • verdict INDETERMINE / validation d'origine KO → aucun certificat. Invariant existant : pas de polygone
 *     bâtiment (ou hors couverture LiDAR) → pas de certification.
 *   • mode_origine NULL → aucun certificat. Sans le mode réellement employé, le re-jeu N'EST PAS garanti fidèle
 *     (semi_auto snappe la façade, manuel prend le point brut → géométries différentes) ; un document qui fait
 *     foi ne se construit pas sur un calcul dont on SAIT qu'il peut diverger de ce que l'internaute a vu.
 *
 * Fichiers moteur (pipeline, config) : APPELÉS, jamais modifiés. Golden 29.107259068449615 inchangé.
 */
import { query, withTransaction, type RequeteTx } from './client';
import { analyserAdresse } from './pipeline';
import { attribuerNumeroCertificat } from './certificatNumero';
import { publierCarteOrientation } from '../carte/publierCarteOrientation';
import { THRESHOLD_M, type ModeOrigine } from '../svv/config';

/**
 * Empreinte SHA-256 (hex) du singleton config_scoring + génération de barème, calculées EN SQL (jamais en JS —
 * une sérialisation JS dériverait au moindre changement de casse/format de nombre). L'ordre des 39 colonnes est
 * écrit EN TOUTES LETTRES (jamais `SELECT *`) : sans ordre explicite, le hash dériverait au premier ALTER TABLE
 * qui réordonnerait les colonnes. `sha256` est un built-in PostgreSQL (≥ 11) → aucune extension requise.
 * config_generation = max(config_edit_log.id) : marqueur MONOTONE du barème (NULL si le log est vide).
 * ⚠️ Toute évolution du schéma config_scoring (ajout/retrait de colonne) DOIT être répercutée ICI, sans quoi
 * l'empreinte cesserait de couvrir la totalité du barème.
 */
export const SQL_EMPREINTE_BAREME = `
  SELECT
    encode(sha256(convert_to(concat_ws('|',
      id::text, boost_f2::text, boost_f4::text, forfait_cone_central::text, forfait_extremites::text,
      cone_f3_demi_angle_deg::text, distance_max_m::text, plafond_couche1::text, plafond_degagement::text,
      mode_combinaison::text, couloir_seuil_lateral_m::text, couloir_fenetre_condition_n::text,
      couloir_tolerance_bord_n::text, couloir_malus_pct::text, natures_remarquables::text,
      cone_famille_demi_angle_deg::text, mondial_faisceau_m::text, mh_cone::text, mh_flanc::text,
      mh_distmax_m::text, inv_cone::text, inv_flanc::text, inv_distmax_m::text,
      cumul_seuil_min_m::text, cumul_base_m::text, cumul_pas_m::text, cumul_increment::text,
      cumul_plafond::text, cumul_cap_p1_m::text, orientation_n::text, orientation_ne::text,
      orientation_e::text, orientation_se::text, orientation_s::text, orientation_so::text,
      orientation_o::text, orientation_no::text, analysis_range_m::text, mode_combinaison_repli::text
    ), 'UTF8')), 'hex') AS empreinte,
    (SELECT max(id) FROM config_edit_log) AS generation
  FROM config_scoring WHERE id = 1
`;

/** Résultat d'une tentative d'émission. Statuts mappés en HTTP par la route. */
export type ResultatEmission =
  | { statut: 'emis'; numero: string; verdict: string }
  | { statut: 'existant'; numero: string; verdict: string }
  | { statut: 'projet_absent' } // ownership KO (IDOR) : le projet n'appartient pas au porteur du jeton
  | { statut: 'refus_indetermine' } // verdict INDETERMINE / origine non validable / analyse non rejouable
  | { statut: 'refus_mode_inconnu' }; // mode_origine NULL : re-jeu non fidèle → pas de document qui fait foi

/** Ligne projet lue pour l'émission (colonnes numeric → CHAÎNES via driver pg). */
interface LigneProjet {
  lat: string | null;
  lon: string | null;
  azimut_deg: string | null;
  etage: number | null;
  dernier_etage: boolean | null;
  hauteur_sous_plafond_m: string | null;
  hauteur_vision_m: string | null;
  adresse_saisie: string | null;
  adresse_normalisee: string | null;
  payload: Record<string, unknown> | null;
  mode_origine: string | null;
  photo_cle: string | null;
}

/** Coerce number | chaîne numérique pg | '' | null → nombre fini, sinon null. */
function nombreFini(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Entier fini ou null (nb pièces). */
function entierFini(v: unknown): number | null {
  const n = nombreFini(v);
  return n === null ? null : Math.trunc(n);
}
/** Chaîne non vide ou null (type de bien, époque). */
function texteOuNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * Émet (ou renvoie l'existant) le certificat d'un projet POSSÉDÉ par `internauteId`. Ne throw jamais pour les cas
 * métier (absent / refus / existant) : ils sont des statuts. Peut throw sur incident base non lié à l'idempotence.
 */
export async function emettreCertificat(internauteId: string, projetId: number): Promise<ResultatEmission> {
  // 1) OWNERSHIP (IDOR) — le projet doit appartenir au porteur du jeton. internauteId vient du `sub` du jeton signé.
  const pr = await query<LigneProjet>(
    `SELECT lat, lon, azimut_deg, etage, dernier_etage, hauteur_sous_plafond_m, hauteur_vision_m,
            adresse_saisie, adresse_normalisee, payload, mode_origine, photo_cle
       FROM internaute_projet WHERE id = $1 AND internaute_id = $2`,
    [projetId, internauteId],
  );
  if (pr.rows.length === 0) return { statut: 'projet_absent' };
  const projet = pr.rows[0];

  // 2) IDEMPOTENCE — pré-contrôle (confort) : un certificat existe déjà pour ce projet → on le renvoie tel quel.
  const existant = await lireCertificatExistant(projetId);
  if (existant) return { statut: 'existant', ...existant };

  // 3) REFUS mode inconnu — sans le mode réellement employé, le re-jeu n'est pas fidèle (voir en-tête).
  if (projet.mode_origine !== 'semi_auto' && projet.mode_origine !== 'manuel') {
    return { statut: 'refus_mode_inconnu' };
  }
  const mode = projet.mode_origine as ModeOrigine;

  // 4) RE-JEU serveur (POOL, hors transaction) avec le mode LU EN BASE — jamais le défaut.
  const lat = nombreFini(projet.lat);
  const lon = nombreFini(projet.lon);
  const azimut = nombreFini(projet.azimut_deg);
  // Analyse non rejouable (dossier antérieur à la migration 026 : lat/lon/azimut manquants) → même refus que
  // INDETERMINE : on ne fige pas un certificat sur une analyse qu'on ne peut pas reproduire.
  if (lat === null || lon === null || azimut === null) return { statut: 'refus_indetermine' };
  const hsp = nombreFini(projet.hauteur_sous_plafond_m);
  const analyse = await analyserAdresse({
    point: { lat, lon },
    azimutPrincipalDeg: azimut,
    etage: entierFini(projet.etage) ?? 0,
    hauteurSousPlafondM: hsp !== null && hsp > 0 ? hsp : undefined, // undefined → hauteurVision applique le défaut 2,50
    dernierEtage: projet.dernier_etage === true,
    mode,
  });
  const resultat = analyse.resultat;
  // 4-bis) REFUS INDETERMINE — origine non validable (resultat null) OU verdict INDETERMINE.
  if (resultat === null || resultat.verdict.verdict === 'INDETERMINE') return { statut: 'refus_indetermine' };

  // 5) PROVENANCE (POOL, hors transaction) : cadastre (parcelle contenant le point, 92 seulement → NULL ailleurs),
  //    année de construction (BDNB via cleabs du bâtiment d'origine), empreinte + génération de barème.
  const cadastre = await query<{ id: string }>(
    `SELECT id FROM parcelle WHERE ST_Contains(geom, ST_Transform(ST_SetSRID(ST_MakePoint($1, $2), 4326), 2154)) LIMIT 1`,
    [lon, lat],
  );
  const referenceCadastrale = cadastre.rows[0]?.id ?? null;

  const cleabs = analyse.validation.batimentOrigine?.cleabs ?? null;
  let anneeBatiment: number | null = null;
  if (cleabs) {
    const an = await query<{ annee_construction: number | null }>(
      `SELECT annee_construction FROM bdnb_annee_batiment WHERE cleabs = $1 LIMIT 1`,
      [cleabs],
    );
    anneeBatiment = an.rows[0]?.annee_construction ?? null;
  }

  const emp = await query<{ empreinte: string; generation: string | null }>(SQL_EMPREINTE_BAREME);
  const configEmpreinte = emp.rows[0].empreinte;
  const configGeneration = emp.rows[0].generation !== null ? Number(emp.rows[0].generation) : null; // int8 → string → number

  // Grandeurs re-dérivées (moteur). Aucun arrondi : les nombres JS partent en numeric via node-pg (texte exact).
  const verdict = resultat.verdict.verdict;
  const detail = resultat.score.famille1.detail;
  const payload = projet.payload ?? {};
  const adresse = projet.adresse_normalisee ?? projet.adresse_saisie ?? null;

  // 6) TRANSACTION — geste atomique : numéro attribué, INSERT certificat immuable, PUIS ouverture de son
  //    acheminement (le certificat n'est JAMAIS orphelin de suivi : les deux naissent ensemble ou aucun). Course
  //    perdue (23505 sur certificat_projet_unique) → toute la transaction rollback (y compris l'acheminement) →
  //    on relit et on renvoie l'existant.
  try {
    const res = await withTransaction(async (q) => {
      const numero = await attribuerNumeroCertificat(q);
      const certificatId = await insererCertificat(q, {
        numero,
        projetId,
        configGeneration,
        configEmpreinte,
        // Entrées RECOPIÉES du projet (chaînes numeric telles quelles → précision préservée, aucun arrondi).
        lat: projet.lat,
        lon: projet.lon,
        azimutDeg: projet.azimut_deg,
        etage: projet.etage,
        dernierEtage: projet.dernier_etage,
        hauteurSousPlafondM: projet.hauteur_sous_plafond_m,
        hauteurVisionM: projet.hauteur_vision_m,
        adresse,
        typeBien: texteOuNull(payload['typeBien']),
        surfaceM2: nombreFini(payload['surface']),
        nbPieces: entierFini(payload['nbPieces']),
        epoque: texteOuNull(payload['epoque']),
        // Résultat RE-DÉRIVÉ.
        verdict,
        score: resultat.score.total,
        distanceObstacleM: resultat.verdict.distanceM,
        profondeurMoyenneM: detail.moyenneProfondeurM,
        faisceauxDegagesPct: detail.pourcentageFaisceauxDegages,
        altitudeTerrainM: analyse.validation.altitudeTerrainOrigineM,
        altitudeSolM: analyse.validation.altSolBdTopoM ?? null,
        toleranceM: THRESHOLD_M, // seuil de verdict (40 m) figé au certificat, cf. compte rendu
        referenceCadastrale,
        anneeBatiment,
        // Snapshot intégral (audit) : validation + résultat COMPLETS tels que re-dérivés.
        resultat: JSON.stringify({ validation: analyse.validation, resultat }),
        photoCle: projet.photo_cle, // recopiée du projet ; carte_orientation_cle et analyse_photo restent NULL (lots suivants)
      });
      await ouvrirAcheminement(q, certificatId);
      return { numero, certificatId };
    });
    // APRÈS COMMIT — carte d'orientation best-effort, HORS transaction (réseau IGN, lent). Ne throw jamais ; un échec
    // laisse carte_orientation_cle NULL, le certificat existe déjà (carte re-fabricable, cf. publierCarteOrientation).
    await publierCarteOrientation(internauteId, res.certificatId, lat, lon, azimut);
    return { statut: 'emis', numero: res.numero, verdict };
  } catch (e) {
    // COURSE : un autre appel concurrent a inséré le certificat entre notre pré-contrôle et notre INSERT →
    // violation de certificat_projet_unique (23505). On RELIT et on renvoie l'existant : idempotence garantie par
    // la contrainte (le filet), jamais une erreur remontée à l'appelant.
    if ((e as { code?: string }).code === '23505') {
      const relu = await lireCertificatExistant(projetId);
      if (relu) return { statut: 'existant', ...relu };
    }
    throw e; // incident non lié à l'idempotence → remonte (la route répond proprement)
  }
}

/** Relit le certificat existant d'un projet (numéro + verdict), ou null. */
async function lireCertificatExistant(projetId: number): Promise<{ numero: string; verdict: string } | null> {
  const r = await query<{ numero: string; verdict: string }>(
    `SELECT numero, verdict FROM certificat WHERE projet_id = $1 LIMIT 1`,
    [projetId],
  );
  return r.rows[0] ?? null;
}

/** Données prêtes à l'INSERT (numeric recopiés en chaînes, re-dérivés en nombres JS). */
interface DonneesCertificat {
  numero: string;
  projetId: number;
  configGeneration: number | null;
  configEmpreinte: string;
  lat: string | null;
  lon: string | null;
  azimutDeg: string | null;
  etage: number | null;
  dernierEtage: boolean | null;
  hauteurSousPlafondM: string | null;
  hauteurVisionM: string | null;
  adresse: string | null;
  typeBien: string | null;
  surfaceM2: number | null;
  nbPieces: number | null;
  epoque: string | null;
  verdict: string;
  score: number;
  distanceObstacleM: number | null;
  profondeurMoyenneM: number | null;
  faisceauxDegagesPct: number | null;
  altitudeTerrainM: number | null;
  altitudeSolM: number | null;
  toleranceM: number;
  referenceCadastrale: string | null;
  anneeBatiment: number | null;
  resultat: string; // jsonb sérialisé
  photoCle: string | null;
}

/**
 * INSERT de la ligne certificat dans la transaction d'émission. config_id et emis_le prennent leurs DEFAULT
 * (1, now()). Renvoie l'id du certificat créé (bigserial → chaîne pg → number, id < 2^53) pour rattacher son
 * acheminement dans la MÊME transaction.
 */
export async function insererCertificat(q: RequeteTx, d: DonneesCertificat): Promise<number> {
  const r = await q<{ id: string }>(
    `INSERT INTO certificat
       (numero, projet_id, config_generation, config_empreinte,
        lat, lon, azimut_deg, etage, dernier_etage, hauteur_sous_plafond_m, hauteur_vision_m,
        adresse, type_bien, surface_m2, nb_pieces, epoque,
        verdict, score, distance_obstacle_m, profondeur_moyenne_m, faisceaux_degages_pct,
        altitude_terrain_m, altitude_sol_m, tolerance_m,
        reference_cadastrale, annee_batiment,
        resultat, photo_cle)
     VALUES ($1, $2, $3, $4,
             $5, $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21,
             $22, $23, $24,
             $25, $26,
             $27::jsonb, $28)
     RETURNING id`,
    [
      d.numero, d.projetId, d.configGeneration, d.configEmpreinte,
      d.lat, d.lon, d.azimutDeg, d.etage, d.dernierEtage, d.hauteurSousPlafondM, d.hauteurVisionM,
      d.adresse, d.typeBien, d.surfaceM2, d.nbPieces, d.epoque,
      d.verdict, d.score, d.distanceObstacleM, d.profondeurMoyenneM, d.faisceauxDegagesPct,
      d.altitudeTerrainM, d.altitudeSolM, d.toleranceM,
      d.referenceCadastrale, d.anneeBatiment,
      d.resultat, d.photoCle,
    ],
  );
  return Number(r.rows[0].id);
}

/**
 * Ouvre la ligne d'ACHEMINEMENT (suivi mutable) du certificat, dans la MÊME transaction que son INSERT → un
 * certificat émis a TOUJOURS son suivi, dès la seconde zéro (jamais orphelin). Statut initial `'en_attente'` (valeur
 * du CHECK 031, = DEFAULT) : le certificat existe, RIEN n'est encore généré ni envoyé. Toutes les clés
 * (pdf_cle, carte_orientation_cle) et horodatages (genere_le, envoye_le) et derniere_erreur restent NULL (leur
 * défaut) : on ne ment pas par défaut — rien n'est généré, rien n'est envoyé, rien n'a échoué. cree_a/maj_a = now().
 *
 * ⚠️ UNICITÉ : le schéma ne pose AUCUNE contrainte d'unicité sur certificat_acheminement.certificat_id (seul un
 * index NON unique existe, 031:168). L'unicité « un certificat, un acheminement » est garantie ICI par le FLUX :
 * cet INSERT ne s'exécute QUE sur une émission réelle (nouveau certificat), jamais sur un chemin idempotent (qui
 * renvoie l'existant sans entrer dans la transaction). Cf. compte rendu.
 */
export async function ouvrirAcheminement(q: RequeteTx, certificatId: number): Promise<void> {
  await q(
    `INSERT INTO certificat_acheminement (certificat_id, statut) VALUES ($1, 'en_attente')`,
    [certificatId],
  );
}
