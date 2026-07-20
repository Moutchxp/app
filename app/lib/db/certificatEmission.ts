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
 * TROIS REFUS D'ÉMETTRE (réponses PROPRES, jamais une exception, jamais un certificat dégradé) :
 *   • verdict INDETERMINE / validation d'origine KO → aucun certificat. Invariant existant : pas de polygone
 *     bâtiment (ou hors couverture LiDAR) → pas de certification.
 *   • verdict VIS_A_VIS → aucun certificat. DÉCISION PRODUIT : Sans Vis-à-Vis® ne certifie QUE l'absence de
 *     vis-à-vis ; un logement avec vis-à-vis est HORS PÉRIMÈTRE du document (ni échec, ni cas dégradé).
 *   • mode_origine NULL → aucun certificat. Sans le mode réellement employé, le re-jeu N'EST PAS garanti fidèle
 *     (semi_auto snappe la façade, manuel prend le point brut → géométries différentes) ; un document qui fait
 *     foi ne se construit pas sur un calcul dont on SAIT qu'il peut diverger de ce que l'internaute a vu.
 *
 * Fichiers moteur (pipeline, config) : APPELÉS, jamais modifiés. Golden 29.107259068449615 inchangé.
 */
import { query, withTransaction, type RequeteTx } from './client';
import { analyserAdresse } from './pipeline';
import { attribuerNumeroCertificat } from './certificatNumero';
import { genererJetonVerification } from './certificatJeton';
import { genererReference } from './certificatReference';
import { publierCarteOrientation } from '../carte/publierCarteOrientation';
import { publierCertificatPdf } from '../pdf/publierCertificatPdf';
import { publierEnvoiCertificat } from '../email/publierEnvoiCertificat';

/** Nombre de tentatives de tirage d'une référence UNIQUE avant abandon (collision astronomiquement improbable). */
const MAX_TENTATIVES_REFERENCE = 5;

/** Levée si aucune référence unique n'a pu être tirée après MAX_TENTATIVES_REFERENCE (pratiquement inatteignable). */
export class ErreurReferenceCertificat extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurReferenceCertificat';
  }
}
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
  | { statut: 'emis'; numero: string; verdict: string; reference: string }
  | { statut: 'existant'; numero: string; verdict: string; reference: string }
  | { statut: 'projet_absent' } // ownership KO (IDOR) : le projet n'appartient pas au porteur du jeton
  | { statut: 'refus_indetermine' } // verdict INDETERMINE / origine non validable / analyse non rejouable
  | { statut: 'refus_mode_inconnu' } // mode_origine NULL : re-jeu non fidèle → pas de document qui fait foi
  | { statut: 'refus_vis_a_vis' }; // verdict VIS_A_VIS : hors périmètre du document (Sans Vis-à-Vis® ne certifie que l'absence)

/** Ligne projet lue pour l'émission (colonnes numeric → CHAÎNES via driver pg). */
interface LigneProjet {
  internaute_id: string; // sujet RGPD → scope de dépôt (photos/cartes/certificats). NON NULL sur internaute_projet.
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
 * Émet (ou renvoie l'existant) le certificat d'un projet. L'OWNERSHIP est prouvée EN AMONT par le jeton d'émission
 * (scope `emit-certificate`, `sub === projetId`) : la route ne nous appelle qu'après cette vérification. On lit donc
 * le projet par son seul `id`, et on en tire `internaute_id` pour le SCOPE de dépôt (photos/cartes/certificats). Ne
 * throw jamais pour les cas métier (absent / refus / existant) : ce sont des statuts.
 */
export async function emettreCertificat(projetId: number): Promise<ResultatEmission> {
  // 1) Lecture du projet (ownership déjà prouvée par le jeton d'émission borné à CE projetId). `internaute_id` sert
  //    UNIQUEMENT de scope de dépôt en aval, plus de contrôle d'ownership ici.
  const pr = await query<LigneProjet>(
    `SELECT internaute_id, lat, lon, azimut_deg, etage, dernier_etage, hauteur_sous_plafond_m, hauteur_vision_m,
            adresse_saisie, adresse_normalisee, payload, mode_origine, photo_cle
       FROM internaute_projet WHERE id = $1`,
    [projetId],
  );
  if (pr.rows.length === 0) return { statut: 'projet_absent' };
  const projet = pr.rows[0];
  const internauteId = projet.internaute_id; // scope de dépôt (aval)

  // 2) IDEMPOTENCE — pré-contrôle : un certificat existe déjà pour ce projet. L'ÉMISSION reste idempotente (on ne frappe
  //    JAMAIS un 2e certificat). MAIS on SÉPARE émettre de (r)envoyer : si son acheminement n'est pas 'envoye' (PDF absent
  //    / mail jamais parti — ex. fire-and-forget coupé), on ACHÈVE l'acheminement (PDF si manquant, puis (r)envoi) plutôt
  //    que de rendre 'existant' sans rien faire. Sur le certificat DU projet demandé uniquement (id lu en base).
  const existant = await lireCertificatExistant(projetId);
  if (existant) {
    await acheminerSiNonEnvoye(internauteId, existant.id, nombreFini(projet.lat), nombreFini(projet.lon), nombreFini(projet.azimut_deg));
    return { statut: 'existant', numero: existant.numero, verdict: existant.verdict, reference: existant.reference };
  }

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
  // ── TROIS REFUS D'ÉMETTRE, groupés autour du verdict re-dérivé (le 3e, mode_inconnu, est en amont car il
  //    conditionne la FIDÉLITÉ même du re-jeu). Seul SANS_VIS_A_VIS produit un document. ──
  // 4-bis) REFUS INDETERMINE — origine non validable (resultat null) OU verdict INDETERMINE : pas de polygone
  //   bâtiment / hors couverture LiDAR → l'analyse ne tranche pas, donc aucune certification (invariant existant).
  if (resultat === null || resultat.verdict.verdict === 'INDETERMINE') return { statut: 'refus_indetermine' };
  // 4-ter) REFUS VIS_A_VIS — DÉCISION PRODUIT : un certificat Sans Vis-à-Vis® n'atteste QUE l'absence de vis-à-vis.
  //   Un logement AVEC vis-à-vis n'est ni un échec de certification ni un cas dégradé : il est simplement HORS du
  //   périmètre de ce que ce document certifie. Le document dit une seule chose, et il la dit ou il n'existe pas.
  //   (La colonne `verdict` garde ses 3 valeurs : c'est l'instantané de l'analyse, pas la liste de ce qu'on émet.)
  if (resultat.verdict.verdict === 'VIS_A_VIS') return { statut: 'refus_vis_a_vis' };

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
  // Boucle de tentatives : le SEUL motif de re-tentative est une COLLISION DE RÉFÉRENCE (voir plus bas). Toute autre
  // issue (succès, idempotence, refus, incident) sort de la boucle immédiatement.
  for (let tentative = 1; ; tentative += 1) {
    try {
      const res = await withTransaction(async (q) => {
        const numero = await attribuerNumeroCertificat(q);
        // Jeton + référence frappés ICI, dans la transaction, AVANT l'INSERT : un de chaque par certificat, à vie
        // (table immuable). Les chemins idempotents (pré-contrôle / 23505 projet) n'entrent pas dans la transaction.
        const jetonVerification = genererJetonVerification();
        const reference = genererReference();
        const certificatId = await insererCertificat(q, {
          numero,
          jetonVerification,
          reference,
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
        return { numero, certificatId, reference };
      });
      // APRÈS COMMIT — carte d'orientation best-effort, HORS transaction (réseau IGN, lent). Ne throw jamais ; un échec
      // laisse carte_orientation_cle NULL, le certificat existe déjà (carte re-fabricable, cf. publierCarteOrientation).
      await publierCarteOrientation(internauteId, res.certificatId, lat, lon, azimut);
      // PUIS le PDF (après la carte : il relit la carte déposée pour l'embarquer, sans la régénérer). Best-effort,
      // ne throw jamais ; un échec laisse le PDF absent (re-fabricable). Le chemin idempotent ci-dessous ne l'atteint pas.
      await publierCertificatPdf(internauteId, res.certificatId);
      // PUIS l'envoi e-mail (après le PDF : il relit le PDF déposé pour le joindre). Best-effort, ne throw jamais ;
      // sur échec le statut RESTE 'genere' (retentable). Le chemin idempotent ci-dessous ne l'atteint pas.
      await publierEnvoiCertificat(res.certificatId);
      return { statut: 'emis', numero: res.numero, verdict, reference: res.reference };
    } catch (e) {
      const err = e as { code?: string; constraint?: string };
      // IDEMPOTENCE (sémantique DISTINCTE) : course sur certificat_projet_unique → un certificat existe DÉJÀ pour ce
      // projet. On RELIT et on renvoie l'existant. Ce N'EST PAS une collision de référence.
      if (err.code === '23505' && err.constraint === 'certificat_projet_unique') {
        const relu = await lireCertificatExistant(projetId);
        // COURSE : l'AUTRE transaction a émis ET s'occupe de son acheminement (carte/PDF/envoi) → on NE (re)déclenche PAS
        // l'acheminement ici (éviter un double envoi concurrent) ; on renvoie simplement l'existant.
        if (relu) return { statut: 'existant', numero: relu.numero, verdict: relu.verdict, reference: relu.reference };
        throw e; // contrainte violée mais rien à relire (improbable) → on remonte
      }
      // COLLISION DE RÉFÉRENCE (sémantique DISTINCTE) : la référence tirée existe déjà sur un AUTRE certificat. Toute
      // la transaction a rollback (numéro/jeton/référence libérés) → on re-tire une référence et on RETENTE, quelques
      // fois. À NE PAS confondre avec le 23505 de projet_unique ci-dessus, dont le sens est l'idempotence.
      if (err.code === '23505' && err.constraint === 'certificat_reference_unique') {
        if (tentative < MAX_TENTATIVES_REFERENCE) continue;
        throw new ErreurReferenceCertificat(
          `référence unique introuvable après ${MAX_TENTATIVES_REFERENCE} tentatives (collisions répétées)`,
        );
      }
      throw e; // incident non lié → remonte (la route répond proprement)
    }
  }
}

/** Relit le certificat existant d'un projet (id + numéro + verdict + référence PUBLIQUE), ou null. `id` sert le
 *  (r)acheminement d'un certificat déjà émis (séparation émission / envoi), jamais un 2e certificat. */
async function lireCertificatExistant(
  projetId: number,
): Promise<{ id: number; numero: string; verdict: string; reference: string } | null> {
  const r = await query<{ id: string; numero: string; verdict: string; reference: string }>(
    `SELECT id, numero, verdict, reference FROM certificat WHERE projet_id = $1 LIMIT 1`,
    [projetId],
  );
  const row = r.rows[0];
  return row ? { id: Number(row.id), numero: row.numero, verdict: row.verdict, reference: row.reference } : null;
}

/**
 * (R)ACHEMINEMENT d'un certificat DÉJÀ ÉMIS — SÉPARE « émettre » (idempotent, une seule fois : jamais un 2e certificat)
 * de « (r)envoyer le mail ». Si l'acheminement est déjà `'envoye'` → on ne (re)fait RIEN (jamais un 2e mail) ; sinon on
 * (re)génère le PDF s'il MANQUE (pdf_cle NULL) puis on (r)envoie le mail. Best-effort (les `publier*` ne throw jamais).
 * SÛR : agit UNIQUEMENT sur le certificat passé (dont l'id a été lu en base POUR le projet demandé) → aucun accès à un
 * certificat d'autrui. Le certificat lui-même reste IMMUABLE : on ne touche que son acheminement (table mutable).
 */
async function acheminerSiNonEnvoye(
  internauteId: string,
  certificatId: number,
  lat: number | null,
  lon: number | null,
  azimut: number | null,
): Promise<void> {
  const r = await query<{ statut: string; pdf_cle: string | null; carte_orientation_cle: string | null }>(
    `SELECT statut, pdf_cle, carte_orientation_cle FROM certificat_acheminement WHERE certificat_id = $1`,
    [certificatId],
  );
  const ach = r.rows[0];
  if (!ach || ach.statut === 'envoye') return; // pas d'acheminement, ou DÉJÀ envoyé → on ne (re)fait rien
  // Carte best-effort si absente ET géométrie disponible (le PDF l'embarque si présente).
  if (!ach.carte_orientation_cle && lat !== null && lon !== null && azimut !== null) {
    await publierCarteOrientation(internauteId, certificatId, lat, lon, azimut);
  }
  // PDF best-effort UNIQUEMENT s'il manque (pdf_cle NULL / statut 'en_attente') — sinon on ne le régénère pas.
  if (!ach.pdf_cle) {
    await publierCertificatPdf(internauteId, certificatId);
  }
  // (R)envoi du mail : publierEnvoiCertificat re-vérifie pdf_cle + destinataire ; sur succès → statut 'envoye'.
  await publierEnvoiCertificat(certificatId);
}

/** Données prêtes à l'INSERT (numeric recopiés en chaînes, re-dérivés en nombres JS). */
interface DonneesCertificat {
  numero: string;
  jetonVerification: string; // 16 car. Crockford Base32 (038), tiré par CSPRNG en amont ; conforme au CHECK par construction
  reference: string; // SVAV-XXXX-XXXX (039), référence PUBLIQUE tirée par CSPRNG ; conforme au CHECK par construction
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
        resultat, photo_cle,
        jeton_verification, reference)
     VALUES ($1, $2, $3, $4,
             $5, $6, $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16,
             $17, $18, $19, $20, $21,
             $22, $23, $24,
             $25, $26,
             $27::jsonb, $28,
             $29, $30)
     RETURNING id`,
    [
      d.numero, d.projetId, d.configGeneration, d.configEmpreinte,
      d.lat, d.lon, d.azimutDeg, d.etage, d.dernierEtage, d.hauteurSousPlafondM, d.hauteurVisionM,
      d.adresse, d.typeBien, d.surfaceM2, d.nbPieces, d.epoque,
      d.verdict, d.score, d.distanceObstacleM, d.profondeurMoyenneM, d.faisceauxDegagesPct,
      d.altitudeTerrainM, d.altitudeSolM, d.toleranceM,
      d.referenceCadastrale, d.anneeBatiment,
      d.resultat, d.photoCle,
      d.jetonVerification, // $29 — colonne d'identité placée EN FIN de liste : l'ordre des colonnes d'un INSERT est
      // cosmétique, cela garde stables les positions ($1..$28) des paramètres existants.
      d.reference, // $30 — référence publique, même logique de placement en fin de liste
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
