import 'server-only';
import { lireGrandLivre } from './requete';
import { expressionBucket, filtreFenetre, type Fenetre } from './fenetre';
import { lireSeuilK, ventilerSous_k, type VentilationSure } from './kAnonymat';

/**
 * M2 — LOT 4. MÉTRIQUES lues sur le GRAND LIVRE agrégé (`analytics_compteur_jour`) — JAMAIS sur les
 * sessions brutes (`analytics_session`, éphémères). Chaque fonction correspond à une fiche MESURABLE de
 * `SPEC_M2_statistiques.md` §4. Les métriques REFUSÉES par l'étude (visiteur unique M-3, durée moyenne
 * stricte / page de sortie M-6) NE SONT PAS produites ici — elles n'ont aucune fonction (test de non-existence).
 *
 * Provenance des données par nom d'événement :
 *  - `session_fin`  (synthétisé par la compaction du Lot 3) → VISITES, provenance, étape la plus loin.
 *  - `resultat`     (émis par /api/analyse au Lot 2)        → verdicts, carte communale.
 *  - `analyse_lancee` / `resultat`                          → analyses lancées / résultats produits.
 * ⚠️ INCOHÉRENCE CROISÉE À BADGER AU LOT 5 (constat R3). `session_fin` n'existe qu'APRÈS compaction d'un
 * jour scellé (Lot 3), tandis que `resultat`/`analyse_lancee` sont écrits en TEMPS RÉEL. Donc, pour les
 * jours RÉCENTS (non encore compactés — a fortiori si le cron de maintenance n'est pas branché, cf.
 * RAPPORT lot 3 §B-0), les VISITES / PROVENANCE / ENTONNOIR (source session_fin) sous-comptent face aux
 * ANALYSES / VERDICTS (temps réel) : on peut voir « 0 visite / N analyses », logiquement impossible. Ces
 * métriques restent JUSTES (elles reflètent fidèlement le grand livre permanent), mais le Lot 5 DOIT
 * badger les métriques session_fin (« jusqu'à J-1 / après compaction ») et ne jamais présenter visites et
 * analyses comme comparables au jour même.
 */

/** Parse un `SUM(n)` (bigint → string côté pg) en nombre (les comptes tiennent < 2^53). */
function nombre(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// ── M-2 : trafic (VISITES) par tranche ────────────────────────────────────────────────────────────────
export interface PointTrafic {
  bucket: string; // 'YYYY-MM-DD' (jour, lundi ISO de la semaine, ou 1er du mois selon le grain)
  visites: number;
}
/** Nombre de VISITES (sessions) par bucket de la fenêtre. Source : compteur `session_fin`. Libellé « visites »,
 *  jamais « visiteurs » (M-3 refusée). Pas de k : un compte temporel nu n'isole personne (aucune géo/identité). */
export async function traficParTranche(fenetre: Fenetre): Promise<PointTrafic[]> {
  const { clause, params } = filtreFenetre(fenetre);
  const rows = await lireGrandLivre<{ bucket: string; n: string }>(
    `SELECT ${expressionBucket(fenetre.grain)} AS bucket, SUM(n)::bigint AS n
       FROM analytics_compteur_jour
      WHERE nom = 'session_fin' AND ${clause}
      GROUP BY bucket ORDER BY bucket`,
    params,
  );
  return rows.map((r) => ({ bucket: r.bucket, visites: nombre(r.n) }));
}

// ── M-5 : répartition des verdicts (3 buckets) ────────────────────────────────────────────────────────
export interface RepartitionVerdicts {
  sans_vis_a_vis: number;
  vis_a_vis: number;
  indetermine: number;
  total: number; // dénominateur = analyses ayant produit un `resultat` (« sur les analyses réalisées »)
}
/** Ratio SANS / VIS / INDÉTERMINÉ sur les `resultat` de la fenêtre (M-5). 3 buckets toujours renvoyés (même 0).
 *  Pas de k : global, sans géo → n'isole personne (le k s'applique à la VENTILATION par commune, pas au ratio). */
export async function repartitionVerdicts(fenetre: Fenetre): Promise<RepartitionVerdicts> {
  const { clause, params } = filtreFenetre(fenetre);
  const rows = await lireGrandLivre<{ verdict: string | null; n: string }>(
    `SELECT verdict, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'resultat' AND ${clause} GROUP BY verdict`,
    params,
  );
  const parV: Record<string, number> = {};
  for (const r of rows) if (r.verdict) parV[r.verdict] = nombre(r.n);
  const sans = parV['SANS_VIS_A_VIS'] ?? 0;
  const vis = parV['VIS_A_VIS'] ?? 0;
  const ind = parV['INDETERMINE'] ?? 0;
  return { sans_vis_a_vis: sans, vis_a_vis: vis, indetermine: ind, total: sans + vis + ind };
}

// ── M-4 : analyses lancées / résultats produits + conversions (Chantier A) ────────────────────────────
export interface ComptesAnalyses {
  lancees: number; //          événements `analyse_lancee` (re-runs inclus — note fiche M-4)
  resultats: number; //        événements `resultat` produits
  certificats: number; //      `clic_certificat` — clics « Obtenir mon certificat »
  plusvalue: number; //        `clic_plusvalue` — clics « Calculer la plus-value de ma vue » (résultat certifié)
  estimationImmo: number; //   `clic_estimation` — clics « Estimation immobilière » (résultat vis-à-vis)
  totalEstimations: number; // = plusvalue + estimationImmo (SOMMÉ à la lecture ; les 2 CTA d'estimation)
}
/** Compte GLOBAL des analyses et conversions de la fenêtre. Tous ces événements sont des lignes NEUTRES
 *  (ni commune, ni verdict, ni acquisition) → comptes temporels globaux, AUCUN k-anonymat (comme trafic). */
export async function comptesAnalyses(fenetre: Fenetre): Promise<ComptesAnalyses> {
  const { clause, params } = filtreFenetre(fenetre);
  const rows = await lireGrandLivre<{ nom: string; n: string }>(
    `SELECT nom, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom IN ('analyse_lancee', 'resultat', 'clic_certificat', 'clic_plusvalue', 'clic_estimation')
        AND ${clause} GROUP BY nom`,
    params,
  );
  const parNom: Record<string, number> = {};
  for (const r of rows) parNom[r.nom] = nombre(r.n);
  const plusvalue = parNom['clic_plusvalue'] ?? 0;
  const estimationImmo = parNom['clic_estimation'] ?? 0;
  return {
    lancees: parNom['analyse_lancee'] ?? 0,
    resultats: parNom['resultat'] ?? 0,
    certificats: parNom['clic_certificat'] ?? 0,
    plusvalue,
    estimationImmo,
    totalEstimations: plusvalue + estimationImmo,
  };
}

// ── M-6 (remplacement) : étape la plus loin atteinte / entonnoir ──────────────────────────────────────
const ORDRE_ETAPES = ['intro', 'photo', 'localisation', 'axe', 'infos_logement', 'analyse', 'resultat'] as const;
export interface PointEntonnoir {
  etape: string;
  atteinte_max: number; // nb de visites dont l'étape LA PLUS LOIN atteinte = cette étape (source session_fin)
}
/** Entonnoir : pour chaque étape, nb de visites dont c'est l'étape la plus loin atteinte (M-6 remplacement :
 *  « étape la plus loin », depuis les compteurs `session_fin` du Lot 3 — jamais les sessions brutes).
 *  Le taux d'abandon par étape se dérive côté lecture (Lot 5) de ces comptes cumulés. Pas de k (étape ≠ identité). */
export async function entonnoir(fenetre: Fenetre): Promise<PointEntonnoir[]> {
  const { clause, params } = filtreFenetre(fenetre);
  const rows = await lireGrandLivre<{ etape: string | null; n: string }>(
    `SELECT etape, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'session_fin' AND ${clause} GROUP BY etape`,
    params,
  );
  const parEtape: Record<string, number> = {};
  for (const r of rows) if (r.etape) parEtape[r.etape] = nombre(r.n);
  return ORDRE_ETAPES.map((e) => ({ etape: e, atteinte_max: parEtape[e] ?? 0 }));
}

// ── M-7 : répartition géographique au grain COMMUNE (k-supprimée) + verdict dominant (Chantier B) ──────
export type VerdictType = 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';
export type DominantVerdict = VerdictType; //          couleur de bulle ; `null` = indéterminable sous k

export interface CelluleCommune {
  commune_insee: string;
  n: number;
  dominant?: DominantVerdict | null; //                Chantier B : verdict dominant k-safe (couleur) ; null = indéterminable
}

/**
 * Densité d'analyses par commune (M-7), depuis les `resultat`. k-ANONYMISÉE : communes < k masquées + suppression
 * secondaire (anti-soustraction). N'expose jamais le grand total incluant les masquées.
 *
 * ⚠️ NON FILTRÉE CÔTÉ SERVEUR (Chantier B, révision post-revue adverse) : une version filtrée par verdict/score aurait
 * exposé, PAR COMMUNE, des comptes REDÉFINIS par chaque filtre → différenciation inter-vues (`Tous − verdict` isole
 * une cellule < k). Le serveur ne publie donc qu'UNE vue par période (non filtrée, k-safe). Tout filtrage de la carte
 * est CLIENT-only, appliqué à ce seul payload k-safe (verdict via le `dominant` déjà anonymisé, département par
 * préfixe) → aucune nouvelle vue serveur, aucune différenciation possible. Cf. rapport, écart C.
 */
export async function repartitionCommune(fenetre: Fenetre, k: number): Promise<VentilationSure<CelluleCommune>> {
  const { clause, params } = filtreFenetre(fenetre);
  const rows = await lireGrandLivre<{ commune_insee: string; n: string }>(
    `SELECT commune_insee, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'resultat' AND commune_insee IS NOT NULL AND ${clause}
      GROUP BY commune_insee`,
    params,
  );
  return ventilerSous_k(rows.map((r) => ({ commune_insee: r.commune_insee, n: nombre(r.n) })), k);
}

// ── M-8 (Lot 6) : SÉRIE temporelle GLOBALE par bucket (activité dans le temps) ─────────────────────────
export interface SeriePoint {
  bucket: string; //          'YYYY-MM-DD' (jour / lundi ISO / 1er du mois selon le grain)
  visites: number; //         session_fin (post-compaction)
  analysesLancees: number; // analyse_lancee (temps réel)
  resultats: number; //       resultat (temps réel) — total, tous verdicts
  sans: number; //            resultat verdict SANS_VIS_A_VIS
  vis: number; //             resultat verdict VIS_A_VIS
  ind: number; //             resultat verdict INDETERMINE
  certificats: number; //     clic_certificat (temps réel)
  plusvalue: number; //       clic_plusvalue (temps réel)
  estimationImmo: number; //  clic_estimation (temps réel)
  totalEstimations: number; //= plusvalue + estimationImmo (dérivé au read, par bucket)
}
/**
 * Série temporelle GLOBALE (jamais scindée par commune — décision Lot 6 §A) : par bucket de la fenêtre, les
 * volumes { visites, analyses lancées, résultats + détail verdicts }. PAS de k : ce sont des comptes GLOBAUX
 * (sur tout le périmètre) par tranche de temps — aucune géo, aucune identité isolée — EXACTEMENT la même
 * politique que `traficParTranche` / `repartitionVerdicts` (0.3). Un bucket global ne ré-identifie personne ;
 * c'est la ventilation jour × commune qui le ferait, d'où le maintien d'une série GLOBALE (pas de masquage massif).
 */
export async function serieParTranche(fenetre: Fenetre): Promise<SeriePoint[]> {
  const { clause, params } = filtreFenetre(fenetre);
  const b = expressionBucket(fenetre.grain);
  const vis = await lireGrandLivre<{ bucket: string; n: string }>(
    `SELECT ${b} AS bucket, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'session_fin' AND ${clause} GROUP BY bucket`,
    params,
  );
  const lan = await lireGrandLivre<{ bucket: string; n: string }>(
    `SELECT ${b} AS bucket, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'analyse_lancee' AND ${clause} GROUP BY bucket`,
    params,
  );
  const res = await lireGrandLivre<{ bucket: string; verdict: string | null; n: string }>(
    // `verdict IS NOT NULL` : cohérent avec repartitionVerdicts / verdictsCommune → `resultats` = sans+vis+ind
    // par construction (jamais un résiduel de verdict inconnu qui gonflerait le total sans sous-courbe).
    `SELECT ${b} AS bucket, verdict, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'resultat' AND verdict IS NOT NULL AND ${clause} GROUP BY bucket, verdict`,
    params,
  );
  // Conversions (Chantier A) — événements NEUTRES, comptés par bucket comme session_fin/analyse_lancee (sans k).
  // Appelés APRÈS `res` : l'ordre des lireGrandLivre est session_fin, analyse_lancee, resultat, PUIS ces 3.
  const cert = await lireGrandLivre<{ bucket: string; n: string }>(
    `SELECT ${b} AS bucket, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'clic_certificat' AND ${clause} GROUP BY bucket`,
    params,
  );
  const plv = await lireGrandLivre<{ bucket: string; n: string }>(
    `SELECT ${b} AS bucket, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'clic_plusvalue' AND ${clause} GROUP BY bucket`,
    params,
  );
  const est = await lireGrandLivre<{ bucket: string; n: string }>(
    `SELECT ${b} AS bucket, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'clic_estimation' AND ${clause} GROUP BY bucket`,
    params,
  );
  const parBucket = new Map<string, SeriePoint>();
  const obtenir = (bucket: string): SeriePoint => {
    let p = parBucket.get(bucket);
    if (!p) {
      p = { bucket, visites: 0, analysesLancees: 0, resultats: 0, sans: 0, vis: 0, ind: 0, certificats: 0, plusvalue: 0, estimationImmo: 0, totalEstimations: 0 };
      parBucket.set(bucket, p);
    }
    return p;
  };
  for (const r of vis) obtenir(r.bucket).visites = nombre(r.n);
  for (const r of lan) obtenir(r.bucket).analysesLancees = nombre(r.n);
  for (const r of res) {
    const p = obtenir(r.bucket);
    const n = nombre(r.n);
    p.resultats += n;
    if (r.verdict === 'SANS_VIS_A_VIS') p.sans += n;
    else if (r.verdict === 'VIS_A_VIS') p.vis += n;
    else if (r.verdict === 'INDETERMINE') p.ind += n;
  }
  for (const r of cert) obtenir(r.bucket).certificats = nombre(r.n);
  for (const r of plv) obtenir(r.bucket).plusvalue = nombre(r.n);
  for (const r of est) obtenir(r.bucket).estimationImmo = nombre(r.n);
  for (const p of parBucket.values()) p.totalEstimations = p.plusvalue + p.estimationImmo; // total = les 2 CTA d'estimation
  return [...parBucket.values()].sort((a, b2) => a.bucket.localeCompare(b2.bucket));
}

// ── M-7bis (Lot 6) : verdicts d'UNE commune (filtre carte), k-ventilé ──────────────────────────────────
export interface CelluleVerdict {
  verdict: 'SANS_VIS_A_VIS' | 'VIS_A_VIS' | 'INDETERMINE';
  n: number;
}
/**
 * Répartition des verdicts SCOPÉE à une commune (sélection sur la carte). Possible car les lignes `resultat`
 * portent verdict ET commune sur la MÊME ligne (émission `/api/analyse`, groupe géo/résultat de la XOR). k
 * RE-APPLIQUÉ : scindé par commune, un verdict rare (< k) ré-identifierait → `ventilerSous_k` (suppression
 * primaire + secondaire, MÊME politique 0.3).
 *
 * ⚠️ N'appeler QUE pour une commune déjà k-VISIBLE dans la fenêtre (garde de `statistiques()`). Pour une telle
 * commune, `ventilerSous_k` préserve le total (≥ k) → renvoie des cellules visibles et/ou un agrégat masqué SÛR
 * (jamais une valeur isolée). `commune` est validé en amont (route) et passé en paramètre LIÉ (index DÉRIVÉ de
 * la longueur des params fenêtre → robuste si la clause évolue), jamais interpolé.
 */
export async function verdictsCommune(fenetre: Fenetre, commune: string, k: number): Promise<VentilationSure<CelluleVerdict>> {
  const { clause, params } = filtreFenetre(fenetre);
  const pCommune = params.length + 1; // $3 aujourd'hui (fenêtre = $1,$2) mais dérivé → pas de couplage positionnel figé
  const rows = await lireGrandLivre<{ verdict: string | null; n: string }>(
    `SELECT verdict, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'resultat' AND commune_insee = $${pCommune} AND verdict IS NOT NULL AND ${clause}
      GROUP BY verdict`,
    [...params, commune],
  );
  const cells: CelluleVerdict[] = rows
    .filter((r): r is { verdict: string; n: string } => r.verdict !== null)
    .map((r) => ({ verdict: r.verdict as CelluleVerdict['verdict'], n: nombre(r.n) }));
  return ventilerSous_k(cells, k);
}

/**
 * Verdict DOMINANT k-safe d'une commune, à partir de ses cellules verdict. `ventilerSous_k` d'abord (suppression
 * primaire + secondaire, MÊME politique 0.3), puis argmax des cellules VISIBLES. `null` si le split est `insuffisant`
 * ou sans cellule visible → la commune ne sera PAS colorée (bulle neutre) : aucune couleur ne révèle un verdict que
 * `ventilerSous_k` n'aurait pas déjà déclaré restituable. PUR & déterministe (testé unitairement).
 */
export function dominantKSafe(cells: CelluleVerdict[], k: number): DominantVerdict | null {
  const v = ventilerSous_k(cells, k);
  if (v.insuffisant || v.visibles.length === 0) return null;
  return v.visibles.reduce((a, b) => (b.n > a.n ? b : a)).verdict;
}

/**
 * M-7ter (Chantier B) — verdict DOMINANT par commune, pour COLORER la carte, SEULEMENT quand il est k-safe.
 *
 * UNE seule requête `GROUP BY commune, verdict` (fenêtre seule, NON filtrée : invariant aux filtres d'affichage
 * client → pas de différenciation), puis `ventilerSous_k` PAR commune : le dominant = l'argmax des cellules VISIBLES
 * (donc déjà k-approuvées par la même politique 0.3). Si le split de la commune est `insuffisant` (résidu non
 * sécurisable) ou sans cellule visible → `null` (bulle NEUTRE) : on ne colore JAMAIS une commune dont on ne pourrait
 * pas révéler le verdict sans oracle « quel verdict domine à faible volume ».
 *
 * ⚠️ ÉTANCHÉITÉ : le dominant n'est calculé QUE pour les communes k-visibles passées en `autorisees` (issues de
 * `repartitionCommune.visibles`). Une commune masquée n'a jamais de couleur — ni même d'entrée. Aucune couleur ne
 * révèle une cellule que `ventilerSous_k` n'aurait pas déjà déclarée restituable.
 */
async function communesDominant(fenetre: Fenetre, k: number, autorisees: string[]): Promise<Map<string, DominantVerdict | null>> {
  const out = new Map<string, DominantVerdict | null>();
  if (autorisees.length === 0) return out;
  const permis = new Set(autorisees);
  const { clause, params } = filtreFenetre(fenetre);
  const rows = await lireGrandLivre<{ commune_insee: string; verdict: string | null; n: string }>(
    `SELECT commune_insee, verdict, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'resultat' AND commune_insee IS NOT NULL AND verdict IS NOT NULL AND ${clause}
      GROUP BY commune_insee, verdict`,
    params,
  );
  const parCommune = new Map<string, CelluleVerdict[]>();
  for (const r of rows) {
    if (!r.verdict || !permis.has(r.commune_insee)) continue; // JAMAIS de dominant hors des k-visibles autorisées
    const arr = parCommune.get(r.commune_insee) ?? [];
    arr.push({ verdict: r.verdict as CelluleVerdict['verdict'], n: nombre(r.n) });
    parCommune.set(r.commune_insee, arr);
  }
  for (const insee of autorisees) out.set(insee, dominantKSafe(parCommune.get(insee) ?? [], k)); // null si non restituable
  return out;
}

// ── M-1 : provenance (buckets référent / UTM, déjà anonymisés au Lot 2) ───────────────────────────────
export interface CelluleSource {
  source: string | null;
  medium: string | null;
  n: number;
}
export interface CelluleReferer {
  referer_hote: string | null;
  n: number;
}
export interface Provenance {
  par_source_medium: VentilationSure<CelluleSource>;
  par_referer: VentilationSure<CelluleReferer>;
}
/** Provenance des VISITES (source/medium/campagne bucketés + referer host), depuis `session_fin`. k-ANONYMISÉE :
 *  une provenance rare (ex. campagne mono-destinataire, constat Lot 2 R3-1) < k est masquée + suppression secondaire. */
export async function provenance(fenetre: Fenetre, k: number): Promise<Provenance> {
  const { clause, params } = filtreFenetre(fenetre);
  const parSM = await lireGrandLivre<{ source: string | null; medium: string | null; n: string }>(
    `SELECT source, medium, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'session_fin' AND ${clause} GROUP BY source, medium`,
    params,
  );
  const parRef = await lireGrandLivre<{ referer_hote: string | null; n: string }>(
    `SELECT referer_hote, SUM(n)::bigint AS n FROM analytics_compteur_jour
      WHERE nom = 'session_fin' AND ${clause} GROUP BY referer_hote`,
    params,
  );
  return {
    par_source_medium: ventilerSous_k(parSM.map((r) => ({ source: r.source, medium: r.medium, n: nombre(r.n) })), k),
    par_referer: ventilerSous_k(parRef.map((r) => ({ referer_hote: r.referer_hote, n: nombre(r.n) })), k),
  };
}

// ── Orchestrateur : le payload complet d'une fenêtre (ce que la route renvoie) ────────────────────────
export interface FiltreCommune {
  commune: string; //                            code INSEE scopé (validé en amont)
  verdicts: VentilationSure<CelluleVerdict>; //  verdicts de CETTE commune, k-ventilé (souvent `insuffisant`)
}
export interface Statistiques {
  fenetre: Fenetre;
  k: number;
  trafic: PointTrafic[];
  verdicts: RepartitionVerdicts; //           GLOBAL (jamais scopé — le scope commune passe par `filtreCommune`)
  analyses: ComptesAnalyses; //               GLOBAL
  entonnoir: PointEntonnoir[]; //             GLOBAL (session, sans géo)
  communes: VentilationSure<CelluleCommune>;
  provenance: Provenance; //                  GLOBAL (session/acquisition, non ventilable par commune — XOR)
  serie: SeriePoint[]; //                     Lot 6 : activité dans le temps (GLOBALE)
  filtreCommune: FiltreCommune | null; //     Lot 6 : présent ssi ?commune=INSEE (verdicts scopés k-safe)
}
/**
 * Lit le seuil k UNE fois (runtime) puis assemble toutes les métriques MESURABLES de la fenêtre. Si `commune`
 * est fourni (filtre carte, validé par la route), ajoute `filtreCommune` (verdicts de cette commune, k-ventilé) ;
 * les métriques de session (trafic/entonnoir/provenance) restent GLOBALES — elles n'ont pas de dimension
 * commune (anti-fingerprint : la géo ne croise jamais l'acquisition) → non scopables, jamais fabriquées.
 *
 * ⚠️ Lectures SÉQUENTIELLES (pas `Promise.all`) : chaque métrique ouvre sa transaction READ ONLY tour à
 * tour → UNE SEULE connexion du pool applicatif détenue à la fois par requête (jamais 8 en parallèle).
 * Réduit fortement la pression sur le pool PARTAGÉ avec le tunnel LiDAR public (constat R4 : éviter
 * d'affamer une certification). Coût : quelques ms séquentiels sur une table agrégée minuscule + index.
 */
export async function statistiques(fenetre: Fenetre, commune?: string | null): Promise<Statistiques> {
  const k = await lireSeuilK();
  const trafic = await traficParTranche(fenetre);
  const verdicts = await repartitionVerdicts(fenetre); //  GLOBAL, NON filtré (vue d'ensemble des verdicts)
  const analyses = await comptesAnalyses(fenetre); //      GLOBAL
  const ent = await entonnoir(fenetre);
  // Carte : UNE vue k-safe par période (Chantier B, post-revue) + verdict dominant k-safe par commune (couleur).
  // Le filtrage verdict/département est CLIENT-only sur ce payload → aucune vue serveur supplémentaire (anti-différenciation).
  const communesBrutes = await repartitionCommune(fenetre, k);
  const dominants = await communesDominant(fenetre, k, communesBrutes.visibles.map((c) => c.commune_insee));
  const communes: VentilationSure<CelluleCommune> = {
    ...communesBrutes,
    visibles: communesBrutes.visibles.map((c) => ({ ...c, dominant: dominants.get(c.commune_insee) ?? null })),
  };
  const prov = await provenance(fenetre, k); //            GLOBAL (acquisition, XOR : jamais filtré par la géo)
  const serie = await serieParTranche(fenetre);
  // ⚠️ GARDE k-ANONYMAT — LE SERVEUR EST LA FRONTIÈRE DE CONFIANCE (constat revue R1). On ne scope les
  // verdicts QUE si la commune est k-VISIBLE dans CETTE fenêtre (présente dans `communes.visibles`). Une
  // commune masquée (suppression primaire OU tirée par la suppression secondaire), sous k, ou à 0 activité
  // → `filtreCommune: null`, INDISTINGUABLE de « pas de filtre ». Sans cette garde, `?commune=X` :
  //   (1) recouvrerait le TOTAL EXACT d'une commune que la suppression secondaire de M-7 vient de cacher
  //       (`ventilerSous_k` préserve la somme) → soustraction de la voisine < k ;
  //   (2) distinguerait « 0 activité » de « 1..k-1 » (retour `masque:null` vs `insuffisant`) → oracle de
  //       présence datée sur une commune mono-foyer. La garde côté client (sélection depuis `visibles`) ne
  //   suffit pas : un appel API direct la contourne.
  const filtreCommune: FiltreCommune | null =
    commune && communes.visibles.some((c) => c.commune_insee === commune)
      ? { commune, verdicts: await verdictsCommune(fenetre, commune, k) }
      : null;
  return { fenetre, k, trafic, verdicts, analyses, entonnoir: ent, communes, provenance: prov, serie, filtreCommune };
}
