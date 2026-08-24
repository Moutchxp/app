/**
 * FUS-3b — ADAPTATEUR IMPUR du SUIVI de rattachement : persiste les dossiers RÉELS (verdict ≠ RIEN), les réévalue EN PLACE avec
 * historique append-only, et sert la liste + le détail à la page (lecture seule). Module PROPRE (n'importe que db/client, les
 * modules purs FUS-2/3a/3b et les readers existants). NE TOUCHE PAS au moteur de verdict SVAV.
 *
 * ⚠️ « suivi, aucun signal » N'EST PAS un état stocké : c'est l'ABSENCE de dossier. On ne persiste rien pour un verdict RIEN
 * (cohérent avec FUS-3a). L'UNIVERS des permis SUIVIS = ceux qui ont une ligne dans `permis_empreinte` (parcelles analysées) —
 * PAS tout Sitadel. La page DÉRIVE « aucun signal » par différence entre cet univers et les dossiers existants.
 */
import { query, withTransaction } from '../db/client';
import { rejouerRattachement } from './rattachementRepo';
import { etatInitialDepuisResultat } from './preseanceAltitude';
import { resoudreEtatSuivi, MOTIF_DAACT } from './etatSuiviRattachement';
import { lireDaactDeclencheurActif } from './rattachementConfig';
import { lirePermisCaracteristiques } from './caracteristiquesRepo';
import { lireParcellesPermis } from './parcellesRepo';
import { construireComparatif, type LigneComparative } from './comparatifRattachement';
import type { ResultatRattachement } from './detectionRattachement';
import { listerPiecesDossier } from '../sitadel/demandeRepo';
import type { PieceArchive } from '../sitadel/demandeRepo';
import { libelleNatureProjet } from '../sitadel/priorite';
import { estAFaire } from './rattachementGroupes'; // L6 — coupure en deux (source unique) ; le tri ci-dessous s'appuie dessus
import { millesimeEditionCourante, MILLESIME_INCONNU } from './editionBdTopo'; // L8 — millésime bâti AFFICHÉ = registre (autorité), plus le proxy

export type EtatSuivi = 'suivi_aucun_signal' | 'en_attente_bati' | 'arbitrage_demande' | 'valide' | 'refuse' | 'annule_par_lidar';

// Énumération des états (jadis « ordre d'urgence » du tri L1 ; L6 trie par deux groupes — cf. `trierLignesSuivi`). Sert encore à
// initialiser les compteurs par état et l'export `ETATS_SUIVI_ORDONNES`.
const ORDRE_URGENCE: Record<EtatSuivi, number> = {
  arbitrage_demande: 0, en_attente_bati: 1, annule_par_lidar: 2, valide: 3, refuse: 4, suivi_aucun_signal: 5,
};
export const ETATS_SUIVI_ORDONNES: EtatSuivi[] = (Object.keys(ORDRE_URGENCE) as EtatSuivi[]).sort((a, b) => ORDRE_URGENCE[a] - ORDRE_URGENCE[b]);

export interface ResultatSuivi { dossierId: number; persiste: boolean; action: 'cree' | 'reevalue' | 'preserve' | 'aucun_signal'; verdict: string; etat: EtatSuivi | null }

/** Millésime/état de la couche bâti figé au snapshot FUS-1b (best-effort ; null si non capturé). */
async function lireMillesimeBati(dossierId: number): Promise<string | null> {
  try {
    const { rows } = await query<{ m: string | null }>(`SELECT source_millesime AS m FROM permis_bati_capture WHERE dossier_id = $1`, [dossierId]);
    return rows[0]?.m ?? null;
  } catch { return null; }
}

/**
 * Rejoue le moteur sur un permis et PERSISTE le dossier si (et seulement si) le verdict n'est pas RIEN. Réévaluation EN PLACE
 * (upsert par dossier_id, jamais de doublon) + une ligne d'ÉVÉNEMENT append-only à chaque passage. Les décisions terminales
 * (refuse, annule_par_lidar, valide HUMAIN) sont PRÉSERVÉES à la réévaluation — seuls les faits mesurés sont rafraîchis.
 */
export async function suivreRattachement(dossierId: number, majPar: string): Promise<ResultatSuivi> {
  const { entrees, contexte, resultat } = await rejouerRattachement(dossierId);
  const initial = etatInitialDepuisResultat(resultat);

  // DAACT — déclencheur DISTINCT (repli quand la géométrie = RIEN) : achèvement déclaré (etat_dau='6') + réglage d'activation.
  // + dossier existant (pour la préservation d'un terminal). Trois lectures indépendantes.
  const [{ rows: etatRows }, daactActif, { rows: before }] = await Promise.all([
    query<{ e: string | null }>(`SELECT etat_dau AS e FROM sitadel_dossier WHERE id = $1`, [dossierId]),
    lireDaactDeclencheurActif(),
    query<{ id: number; etat: EtatSuivi; valide_par: string | null }>(
      `SELECT id, etat, valide_par FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]),
  ]);
  const existing = before[0];
  const existant = existing ? { etat: existing.etat, valideParHumain: !!existing.valide_par && existing.valide_par !== 'moteur:auto' } : null;

  // DÉCISION PURE : géométrie → DAACT (en_attente_bati, jamais d'injection) → préservation d'un terminal. Cf. etatSuiviRattachement.
  const decision = resoudreEtatSuivi({ initialGeom: initial, daactActif, acheveDaact: etatRows[0]?.e === '6', existant });
  if (!decision.persister) {
    // Ni géométrie, ni DAACT active/achevée → aucun dossier (les permis sans signal sont DÉRIVÉS à l'affichage). On n'écrit rien.
    return { dossierId, persiste: false, action: 'aucun_signal', verdict: resultat.verdict, etat: null };
  }

  const millesimeBati = await lireMillesimeBati(dossierId);
  const criteresJson = JSON.stringify(resultat.criteres);
  const seuilsJson = JSON.stringify(entrees.seuils);
  const polysJson = JSON.stringify(entrees.polygones.map((p) => ({ cleabs: p.cleabs, etat: p.etat })));
  const idu = entrees.parcelleCandidate?.idu ?? null;

  const nouvelEtat: EtatSuivi = decision.etat;
  const valPar = decision.auto ? 'moteur:auto' : (existing?.valide_par ?? null);
  // MOTIF : la DAACT porte son propre motif (traçabilité) ; sinon le motif géométrique du moteur.
  const motif = decision.origineDaact ? MOTIF_DAACT : resultat.motif;

  let rattId: number; let action: ResultatSuivi['action'];
  if (!existing) {
    const { rows } = await query<{ id: number }>(
      `INSERT INTO permis_rattachement
         (dossier_id, parcelle_candidate_idu, regime, verdict, etat, motif, criteres, seuils_utilises, seuils_provenance,
          polygones_concernes, millesime_cadastre, millesime_bati, valide_par, valide_le, detecte_le, reevalue_le)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12,$13, CASE WHEN $13 IS NOT NULL THEN now() END, now(), now())
       RETURNING id`,
      [dossierId, idu, resultat.regime, resultat.verdict, nouvelEtat, motif, criteresJson, seuilsJson, contexte.seuilsProvenance,
       polysJson, contexte.empreinteMillesime, millesimeBati, valPar]);
    rattId = rows[0].id; action = 'cree';
  } else {
    // Réévaluation EN PLACE : rafraîchit les faits mesurés + reevalue_le ; l'état ne change que si non préservé.
    await query(
      `UPDATE permis_rattachement
          SET parcelle_candidate_idu=$2, regime=$3, verdict=$4, etat=$5, motif=$6, criteres=$7::jsonb, seuils_utilises=$8::jsonb,
              seuils_provenance=$9, polygones_concernes=$10::jsonb, millesime_cadastre=$11, millesime_bati=$12,
              valide_par=$13, valide_le = CASE WHEN $13 = 'moteur:auto' THEN now() ELSE valide_le END, reevalue_le=now()
        WHERE id=$1`,
      [existing.id, idu, resultat.regime, resultat.verdict, nouvelEtat, motif, criteresJson, seuilsJson, contexte.seuilsProvenance,
       polysJson, contexte.empreinteMillesime, millesimeBati, valPar]);
    rattId = existing.id; action = decision.preserve ? 'preserve' : 'reevalue';
  }

  // ÉVÉNEMENT append-only — l'historique n'est jamais écrasé.
  const details = JSON.stringify({
    verdict: resultat.verdict, regime: resultat.regime, motif, criteres: resultat.criteres,
    // TRAÇABILITÉ (SPEC C) : d'où vient ce dossier — un signal DAACT (achèvement) ou la géométrie (cadastre/BD TOPO) ?
    declencheur: decision.origineDaact ? 'daact' : 'geometrie',
    seuils: entrees.seuils, provenance: contexte.seuilsProvenance,
    millesimeCadastre: contexte.empreinteMillesime, millesimeBati, nbPolygones: entrees.polygones.length,
  });
  await query(
    `INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
    [rattId, action === 'cree' ? 'detection' : 'reevaluation', existing?.etat ?? null, nouvelEtat, details, majPar]);

  return { dossierId, persiste: true, action, verdict: resultat.verdict, etat: nouvelEtat };
}

export type ResultatOuvertureManuelle = { ok: true; rattId: number } | { ok: false; motif: string };

/**
 * M5 — OUVRE l'arbitrage À LA MAIN (sans attendre un delta BD TOPO). HONNÊTE : le dossier porte `origine_ouverture='manuelle'` et
 * `verdict='OUVERTURE_MANUELLE'` (pas un verdict de détection), et un événement append-only `ouverture_manuelle` trace le motif +
 * l'auteur. NE TOUCHE NI le snapshot, NI la capture, NI l'empreinte (lecture seule) ; NE modifie PAS le moteur de détection.
 * Refuse si un dossier existe déjà (on n'écrase pas une détection ni un terminal), si le permis n'a pas d'empreinte, ou sans motif.
 * Réversibilité : refermer = `refuserRattachement` (état terminal + trace, rien d'effacé).
 */
export async function ouvrirRattachementManuel(dossierId: number, motif: string, par: string): Promise<ResultatOuvertureManuelle> {
  const m = (motif ?? '').trim();
  if (!m) return { ok: false, motif: 'un motif d’ouverture manuelle est obligatoire' };
  const { rows: existant } = await query<{ etat: EtatSuivi }>(`SELECT etat FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
  if (existant.length > 0) return { ok: false, motif: `un dossier de rattachement existe déjà pour ce permis (état : ${existant[0].etat}) — rien à ouvrir` };
  const { rows: emp } = await query(`SELECT 1 FROM permis_empreinte WHERE dossier_id = $1`, [dossierId]);
  if (emp.length === 0) return { ok: false, motif: 'ce permis n’a pas de parcelle figée (empreinte) : il n’y a rien à arbitrer' };

  return withTransaction(async (q) => {
    // Dossier ouvert MANUELLEMENT : régime/verdict SENTINELLES (jamais un verdict de détection), état arbitrable, motif conservé.
    const { rows } = await q<{ id: number }>(
      `INSERT INTO permis_rattachement (dossier_id, regime, verdict, etat, motif, origine_ouverture, detecte_le, reevalue_le)
         VALUES ($1, 'indetermine', 'OUVERTURE_MANUELLE', 'arbitrage_demande', $2, 'manuelle', now(), now())
       RETURNING id`, [dossierId, m]);
    const rattId = rows[0].id;
    // Journal d'événements append-only : trace l'ouverture manuelle (distincte d'une 'detection'), avec le motif et l'auteur.
    await q(
      `INSERT INTO permis_rattachement_evenement (rattachement_id, type, ancien_etat, nouvel_etat, details, par)
         VALUES ($1, 'ouverture_manuelle', NULL, 'arbitrage_demande', $2::jsonb, $3)`,
      [rattId, JSON.stringify({ origine: 'manuelle', motif: m }), par]);
    return { ok: true, rattId };
  });
}

export interface LigneSuivi {
  dossierId: number; numDau: string; commune: string | null; codeInsee: string;
  type: string; adresse: string | null; natureTravaux: string | null;    // FUS-3c-ter — ligne repliée : adresse + type + nature
  etat: EtatSuivi; verdict: string | null; joursAnciennete: number; derniereEvalIso: string | null;
  dateAutorisationIso: string | null;   // L1 — date_reelle_autorisation du permis (ISO 'YYYY-MM-DD') ; null = inconnue. À NE PAS confondre avec joursAnciennete (date d'ENTRÉE en suivi).
  dateDeclenchementIso: string | null;  // L6 — permis_rattachement.detecte_le (date où le déclencheur a ouvert le dossier) ; null = pas de dossier / pas de déclencheur.
  origineOuverture: 'detection' | 'manuelle' | null; // M7-ter — 'manuelle' = ouvert à la main (M5) ; null = pas de dossier / données < migration 147 → affichage 'detection'
}

/** Tri décroissant d'une date ISO 'YYYY-MM-DD' (comparable lexicographiquement) ; une date ABSENTE va en FIN (jamais en tête). */
function parDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;          // égales, ou toutes deux absentes
  if (a === null) return 1;       // a sans date → après b
  if (b === null) return -1;      // b sans date → après a
  return a < b ? 1 : -1;          // plus récent en haut
}

/**
 * L6 (règle Arno, 23/08/2026) — tri du suivi en DEUX GROUPES (remplace l'échelle d'urgence multi-états de L1) :
 *   ① COUPURE : le GROUPE 1 « rattachement à faire » (arbitrage OUVERT, cf. `estAFaire` → `arbitrage_demande`) passe AVANT le
 *      GROUPE 2 « en attente d'une mise à jour » (tout le reste), QUELLE QUE SOIT la date du permis ;
 *   ② tri INTERNE : groupe 1 → DATE DE DÉCLENCHEMENT (`detecte_le`) DÉCROISSANTE (le plus récemment déclenché en haut) ;
 *                   groupe 2 → DATE D'AUTORISATION du permis DÉCROISSANTE (le permis le plus récent en haut, comme en L1) ;
 *   ③ dans chaque groupe, une date ABSENTE va en FIN ; tiebreaker STABLE sur `dossierId`.
 * ⚠️ NE PAS réinverser : priorité absolue au rattachement À FAIRE, date de déclenchement en haut / date de permis en bas.
 * Pur (aucune I/O) → testable sans base. Ne mute pas l'entrée. La composition du groupe 1 vit dans `rattachementGroupes` (source unique).
 */
export function trierLignesSuivi(lignes: LigneSuivi[]): LigneSuivi[] {
  return [...lignes].sort((a, b) => {
    const gA = estAFaire(a.etat), gB = estAFaire(b.etat);
    if (gA !== gB) return gA ? -1 : 1;                             // ① groupe 1 (à faire) toujours au-dessus du groupe 2
    const parDate = gA                                            // ② tri interne selon le groupe
      ? parDateDesc(a.dateDeclenchementIso, b.dateDeclenchementIso)  // groupe 1 : date de DÉCLENCHEMENT
      : parDateDesc(a.dateAutorisationIso, b.dateAutorisationIso);   // groupe 2 : date de PERMIS
    if (parDate !== 0) return parDate;
    return a.dossierId - b.dossierId;                              // ③ tiebreaker STABLE
  });
}

/** Liste l'UNIVERS des permis suivis (ceux qui ont une empreinte) LEFT JOIN leur dossier ; « aucun signal » si pas de dossier. */
export async function listerSuivi(): Promise<{ lignes: LigneSuivi[]; compteurs: Record<EtatSuivi, number> }> {
  const { rows } = await query<{ dossier_id: number; num_dau: string; code_insee: string; commune: string | null; type: string; adresse: string | null; nature: string | null; ratt_etat: EtatSuivi | null; verdict: string | null; origine_ouverture: 'detection' | 'manuelle' | null; jours: number; reevalue: string | null; date_autorisation: string | null; date_declenchement: string | null }>(
    `SELECT e.dossier_id, s.num_dau, s.code_insee, c.nom AS commune, s.type,
            nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
            s.nature_projet_completee AS nature, r.etat AS ratt_etat, r.verdict, r.origine_ouverture,
            GREATEST(0, floor(EXTRACT(EPOCH FROM (now() - COALESCE(r.detecte_le, e.maj_le))) / 86400))::int AS jours,
            to_char(r.reevalue_le, 'YYYY-MM-DD') AS reevalue,
            to_char(s.date_reelle_autorisation, 'YYYY-MM-DD') AS date_autorisation,
            to_char(r.detecte_le, 'YYYY-MM-DD') AS date_declenchement
       FROM permis_empreinte e
       JOIN sitadel_dossier s ON s.id = e.dossier_id
       LEFT JOIN commune c ON c.code_insee = s.code_insee
       LEFT JOIN permis_rattachement r ON r.dossier_id = e.dossier_id`);
  const lignes: LigneSuivi[] = trierLignesSuivi(rows.map((r) => ({
    // `dossier_id` est un bigint → le pilote `pg` le renvoie en CHAÎNE. On honore le type `number` de LigneSuivi (sinon le POST,
    // qui reçoit ce dossierId via le front, le rejette). Number() est sûr que la valeur soit déjà un nombre ou une chaîne numérique.
    dossierId: Number(r.dossier_id), numDau: r.num_dau, commune: r.commune, codeInsee: r.code_insee,
    type: r.type, adresse: r.adresse, natureTravaux: r.nature ? libelleNatureProjet(r.nature) : null,
    etat: r.ratt_etat ?? 'suivi_aucun_signal', verdict: r.verdict, joursAnciennete: r.jours, derniereEvalIso: r.reevalue,
    dateAutorisationIso: r.date_autorisation, dateDeclenchementIso: r.date_declenchement,
    origineOuverture: r.origine_ouverture ?? null,
  })));
  const compteurs = Object.fromEntries((Object.keys(ORDRE_URGENCE) as EtatSuivi[]).map((e) => [e, 0])) as Record<EtatSuivi, number>;
  for (const l of lignes) compteurs[l.etat] += 1;
  return { lignes, compteurs };
}

export interface DetailSuivi {
  dossierId: number; numDau: string; commune: string | null; codeInsee: string;
  type: string; adresse: string | null; natureTravaux: string | null;    // FUS-3c-ter — en-tête : adresse + type + nature
  etat: EtatSuivi; persiste: boolean;
  origineOuverture: 'detection' | 'manuelle'; // M5 — 'manuelle' = arbitrage ouvert à la main (aucune détection) ; l'écran le DIT
  motifOuverture: string | null;              // M5 — motif saisi à l'ouverture manuelle (null en détection)
  verdict: string; regime: string; motif: string;
  criteres: ResultatRattachement['criteres']; // { surface, bordure, bati } (forme du moteur FUS-2)
  seuils: { seuilSurface: number; seuilBordure: number; margeAltitudeM: number };
  seuilsProvenance: 'base' | 'defaut'; seuilsBrut: { surfacePct: number; bordurePct: number; margeAltitudeCm: number };
  millesimeCadastre: string | null; millesimeBati: string | null;
  comparatif: LigneComparative[];
  nbParcellesOrigine: number;                                  // FUS-3c — libellé du régime (« fusion attendue (N parcelles) »)
  nbContoursEmpreinte: number;                                 // FUS-3c-bis — nb de contours de l'empreinte (>1 = parcelles disjointes)
  streetView: { lat: number; lng: number } | null;            // FUS-3c — centroïde WGS84 de l'empreinte, null si pas de point fiable
  streetViewMotif: string | null;                             // pourquoi il n'y a pas de lien (empreinte incomplète/absente)
  pieces: PieceArchive[];                                      // FUS-3c — pièces jointes consultables (rapatriées d'Archives)
}

/** BD TOPO : les bâtiments COURANTS présents dans l'empreinte (étages, altitude toit, usages) — pour la colonne BD TOPO du comparatif. */
async function lireBatimentsEmpreinte(dossierId: number): Promise<{ etages: (number | null)[]; altitudes: (number | null)[]; usages: string[] }> {
  const { rows } = await query<{ etages: number | null; alt: string | number | null; u1: string | null; u2: string | null }>(
    `WITH emp AS (SELECT geom FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL)
     SELECT b.nombre_d_etages AS etages, b.altitude_maximale_toit AS alt, b.usage_1 AS u1, b.usage_2 AS u2
       FROM batiment b, emp
      WHERE b.geom && emp.geom AND ST_Intersects(b.geom, emp.geom)`, [dossierId]);
  const usages = rows.flatMap((r) => [r.u1, r.u2]).filter((u): u is string => !!u && u.trim() !== '');
  return { etages: rows.map((r) => r.etages), altitudes: rows.map((r) => (r.alt == null ? null : Number(r.alt))), usages };
}

/** Détail d'un dossier : verdict/critères/seuils/millésimes (recalculés au runtime) + tableau comparatif « trois sources ». Lecture seule. */
export async function lireDetailSuivi(dossierId: number): Promise<DetailSuivi | null> {
  const { rows: base } = await query<{ num_dau: string; code_insee: string; commune: string | null; type: string; adresse: string | null; nature: string | null }>(
    `SELECT s.num_dau, s.code_insee, c.nom AS commune, s.type,
            nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
            s.nature_projet_completee AS nature
       FROM sitadel_dossier s LEFT JOIN commune c ON c.code_insee = s.code_insee
      WHERE s.id = $1`, [dossierId]);
  const b = base[0];
  if (!b) return null;

  const { entrees, contexte, resultat } = await rejouerRattachement(dossierId);
  const { rows: rr } = await query<{ etat: EtatSuivi; origine_ouverture: 'detection' | 'manuelle'; motif: string | null }>(
    `SELECT etat, origine_ouverture, motif FROM permis_rattachement WHERE dossier_id = $1`, [dossierId]);
  const etat: EtatSuivi = rr[0]?.etat ?? 'suivi_aucun_signal';
  const origineOuverture = rr[0]?.origine_ouverture ?? 'detection';
  const motifOuverture = origineOuverture === 'manuelle' ? (rr[0]?.motif ?? null) : null;

  // Données du comparatif : EN BASE (permis) + CADASTRE (parcelles rattachées) + BD TOPO (bâtiments de l'empreinte).
  const carac = await lirePermisCaracteristiques(dossierId);
  const parcelles = (await lireParcellesPermis(dossierId)).filter((p) => p.role === 'origine');
  const rattachees = parcelles.filter((p) => p.aGeometrie);

  // FUS-3c — Street View : centroïde WGS84 de l'empreinte (jamais un point au hasard : null + motif si empreinte incomplète/absente).
  let streetView: { lat: number; lng: number } | null = null;
  let streetViewMotif: string | null = null;
  let nbContoursEmpreinte = 0;
  if (entrees.empreinteComplete) {
    const { rows } = await query<{ lat: number; lng: number; ncontours: number }>(
      `SELECT ST_Y(ST_Centroid(ST_Transform(geom, 4326))) AS lat, ST_X(ST_Centroid(ST_Transform(geom, 4326))) AS lng,
              ST_NumGeometries(geom) AS ncontours
         FROM permis_empreinte WHERE dossier_id = $1 AND geom IS NOT NULL`, [dossierId]);
    if (rows[0]) { streetView = { lat: Number(rows[0].lat), lng: Number(rows[0].lng) }; nbContoursEmpreinte = Number(rows[0].ncontours) || 0; }
    else streetViewMotif = 'parcelle du permis figée sans géométrie exploitable';
  } else {
    streetViewMotif = 'parcelle du permis incomplète ou non figée (au moins une parcelle d’origine non rattachée) : aucun centroïde fiable';
  }
  const pieces = await listerPiecesDossier(dossierId);
  const sumOuNull = (xs: (number | null)[]): number | null => (xs.some((x) => x !== null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : null);
  const bd = await lireBatimentsEmpreinte(dossierId);

  const comparatif = construireComparatif({
    surfaceParcelleDeclareeM2: sumOuNull(parcelles.map((p) => p.superficieDeclareeM2)),
    nbCorps: carac.corps.length,
    etagesCorps: carac.corps.map((c) => c.nbEtages),
    altitudesCorps: carac.corps.map((c) => c.altitudeSommetNgf),
    destinationsPermis: carac.global?.destinations ?? null,
    sousSolsCorps: carac.corps.map((c) => c.nbNiveauxSousSol),
    stationnementPermis: carac.global?.nbPlacesStationnement ?? null,
    nbParcellesCadastre: rattachees.length,
    surfaceCadastraleM2: rattachees.length > 0 ? sumOuNull(rattachees.map((p) => p.contenance)) : null,
    surfaceCadastralePostgisM2: rattachees.length > 0 ? sumOuNull(rattachees.map((p) => p.aireCadastraleM2)) : null,
    empreinteFigee: entrees.empreinteComplete,
    nbBatimentsBdTopo: contexte.nbBatimentsEmpreinte,
    etagesBdTopo: bd.etages, altitudesToitBdTopo: bd.altitudes, usagesBdTopo: bd.usages,
  });

  // L8 — millésime BÂTI affiché = AUTORITÉ (registre bdtopo_edition.courante), plus le proxy `permis_bati_capture.source_millesime`.
  //   MILLESIME_INCONNU → null (l'écran dira « non renseigné » ; jamais un repli muet sur le proxy). Le cadastre garde sa source.
  const mEditionBati = await millesimeEditionCourante(query);

  return {
    dossierId, numDau: b.num_dau, commune: b.commune, codeInsee: b.code_insee,
    type: b.type, adresse: b.adresse, natureTravaux: b.nature ? libelleNatureProjet(b.nature) : null,
    etat, persiste: rr.length > 0, origineOuverture, motifOuverture,
    verdict: resultat.verdict, regime: resultat.regime, motif: resultat.motif,
    criteres: resultat.criteres, seuils: entrees.seuils, seuilsProvenance: contexte.seuilsProvenance, seuilsBrut: contexte.seuilsBrut,
    millesimeCadastre: contexte.empreinteMillesime, millesimeBati: mEditionBati === MILLESIME_INCONNU ? null : mEditionBati,
    comparatif,
    nbParcellesOrigine: parcelles.length, nbContoursEmpreinte, streetView, streetViewMotif, pieces,
  };
}
