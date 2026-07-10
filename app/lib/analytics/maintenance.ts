import { Pool, type PoolClient } from 'pg';

/**
 * M2 — Analytics, LOT 3. Job de MAINTENANCE : compaction, gestion des partitions, purge. Ne collecte
 * AUCUN événement, n'affiche AUCUNE statistique. Déclenché HORS du chemin de requête (CLI / cron), jamais
 * depuis le writer (recouplage interdit — cf. LOT 1). Vit sous `app/lib/analytics/**` → couvert par la
 * garde anti-couplage (le moteur ne peut pas l'importer).
 *
 * ⚠️ PAS de `import 'server-only'` ici (contrairement à writer/pool/emission du LOT 1) : ce module tourne
 * EXCLUSIVEMENT sous `tsx` (CLI/cron), jamais dans un bundle client ni le runtime Next. Or `server-only`
 * lève sous Node/tsx (la condition d'export `react-server`, posée par Next, ne l'est pas par tsx) → il
 * ferait crasher le CLI à l'import. La non-importation par le moteur/tunnel est déjà garantie par la garde
 * anti-couplage (ESLint + test de graphe), pas par `server-only`. Module VOLONTAIREMENT autonome (seul
 * `pg`) : n'importe PAS `./config` (qui, lui, porte `server-only`) — d'où la constante locale ci-dessous.
 *
 * TROIS MÉCANISMES DISTINCTS, ORDONNÉS, chacun idempotent :
 *  1. COMPACTION — replie chaque session d'un JOUR SCELLÉ (`jour_paris < aujourd'hui_Paris`) en incréments
 *     sur `analytics_compteur_jour`, PUIS la supprime, dans UNE SEULE instruction atomique (CTE). Le
 *     marquage « compactée » n'existe pas : la session est SUPPRIMÉE en même temps qu'elle est comptée →
 *     double comptage et « purge sans comptage » sont STRUCTURELLEMENT impossibles (voir rapport).
 *  2. PARTITIONS — crée les partitions futures (config `partitions_mois_avance`), DROP les partitions
 *     PASSÉES et VIDES (housekeeping). Ne DROP jamais une partition qui contient encore des lignes.
 *  3. PURGE — supprime les lignes de compteurs hors rétention (`analytics_retention`), par lots bornés.
 *
 * CONCURRENCE : verrou consultatif Postgres (`pg_try_advisory_lock`) → une seule exécution à la fois
 * (protège aussi la DDL de partitionnement, non couverte par SKIP LOCKED). La compaction est EN PLUS
 * sûre en concurrence par `FOR UPDATE SKIP LOCKED` (deux compactions traitent des lots disjoints).
 *
 * ISOLATION : pool `pg` DÉDIÉ (jamais le pool applicatif `db/client.ts`, ni le pool d'émission `pool.ts`).
 */

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant — analytics/maintenance.ts');

/** Clé fixe du verrou consultatif de maintenance (arbitraire, stable). */
const VERROU_MAINTENANCE = 728_141_002;

/**
 * Délai d'établissement de connexion du pool de maintenance (ms). Constante LOCALE (le module n'importe
 * pas `./config`, cf. en-tête). La maintenance est un job de fond non latency-sensitive → un budget plus
 * large que celui du chemin de requête est acceptable.
 */
const CONNECT_TIMEOUT_MAINTENANCE_MS = 5_000;

/** Défauts sûrs (repli si la config DB est absente — la maintenance ne crashe jamais faute de config). */
const DEFAUTS = {
  partitions_mois_avance: 3,
  compaction_taille_lot: 1000,
  purge_compteur_taille_lot: 5000,
  session_ephemere_jours: 2,
  compteur_public_jours: 400,
  compteur_interne_jours: 400,
} as const;

/**
 * Pool DÉDIÉ à la maintenance (distinct de l'émission, `max` bas). `statement_timeout` généreux (60 s) :
 * les lots sont bornés donc courts, mais un DROP/purge sur une base chargée peut prendre un peu.
 */
export const poolMaintenance = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: 'svav_analytics_maintenance',
  max: 2,
  connectionTimeoutMillis: CONNECT_TIMEOUT_MAINTENANCE_MS,
  idleTimeoutMillis: 10_000,
  statement_timeout: 60_000,
  idle_in_transaction_session_timeout: 60_000,
});

export async function fermerPoolMaintenance(): Promise<void> {
  await poolMaintenance.end();
}

/** Fonction de requête minimale (compatible `pg.Pool` et `pg.PoolClient`). */
export type Requete = (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }>;

/** Résultat OBSERVABLE d'un run (ce qui s'est passé — pour la CLI / les logs). */
export interface ResultatMaintenance {
  demarre: boolean; // false = un autre run détenait le verrou → no-op
  sessionsCompactees: number;
  partitionsCreees: string[];
  partitionsSupprimees: string[];
  partitionsEnConflit: string[]; // création impossible (rows en _default) → à traiter manuellement
  compteursPublicsPurges: number;
  compteursInternesPurges: number;
  erreurs: string[];
}

/** Jour courant Europe/Paris `YYYY-MM-DD` (identique à `writer.jourParis` ; dupliqué pour ne pas charger le pool d'émission). */
export function jourParis(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant);
}

/**
 * Lit un entier de config (table `cle→valeur`). Repli sur `defaut` UNIQUEMENT si la table est absente
 * (`42P01` — ex. 019 non appliquée) ou si la clé/valeur est absente ou invalide (≤ 0). Toute AUTRE erreur
 * (timeout, permission, colonne manquante…) est RE-LEVÉE, pour ne pas masquer silencieusement un défaut
 * réel derrière une valeur par défaut. Exporté pour test.
 */
export async function lireEntier(q: Requete, table: string, colVal: string, cle: string, defaut: number): Promise<number> {
  try {
    const r = await q(`SELECT ${colVal} AS v FROM ${table} WHERE cle = $1`, [cle]);
    const v = (r.rows[0] as { v?: number } | undefined)?.v;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.trunc(v) : defaut;
  } catch (e) {
    if ((e as { code?: string })?.code === '42P01') return defaut; // table absente → repli ATTENDU
    throw e; // erreur inattendue → visible (collectée en amont), jamais avalée
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. COMPACTION — atomique par lot (compter + supprimer dans UNE instruction)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un lot atomique : sélectionne ≤ `tailleLot` sessions de jours SCELLÉS (`jour_paris < jourCourant`),
 * les agrège en incréments `session_fin` sur `analytics_compteur_jour` (grain jour × étape max ×
 * dimensions d'ACQUISITION — jamais de géo/verdict, donc l'anti-fingerprint passe), PUIS les SUPPRIME.
 * Tout dans une seule instruction → atomique : soit {compté ET supprimé}, soit {rien}. `FOR UPDATE SKIP
 * LOCKED` → deux compactions concurrentes prennent des lots disjoints (aucun double comptage).
 * Renvoie le nombre de sessions traitées (0 = plus rien à faire).
 */
export async function compacterUnLot(q: Requete, jourCourant: string, tailleLot: number): Promise<number> {
  const sql = `
    WITH lot AS MATERIALIZED (
      -- MATERIALIZED (explicite) : garantit que \`lot\` est évalué UNE seule fois et que le MÊME ensemble
      -- de lignes est vu par l'INSERT (\`ins\`) et par le DELETE final. C'est l'invariant de sûreté du lot
      -- (compter exactement ce qu'on supprime) ; on le fige ici pour qu'aucun refactor futur ne l'affaiblisse.
      SELECT session_id, jour_paris, etape_max, source, medium, campagne, referer_hote, device_type, navigateur_famille
        FROM analytics_session
       WHERE jour_paris < $1::date
       ORDER BY jour_paris, session_id
       LIMIT $2
       FOR UPDATE SKIP LOCKED
    ),
    ins AS (
      INSERT INTO analytics_compteur_jour
        (jour_paris, nom, etape, source, medium, campagne, referer_hote, device_type, navigateur_famille, n)
      SELECT jour_paris, 'session_fin', etape_max, source, medium, campagne, referer_hote, device_type, navigateur_famille, count(*)
        FROM lot
       GROUP BY jour_paris, etape_max, source, medium, campagne, referer_hote, device_type, navigateur_famille
      ON CONFLICT ON CONSTRAINT analytics_compteur_jour_dims_uniq
        DO UPDATE SET n = analytics_compteur_jour.n + EXCLUDED.n
    )
    DELETE FROM analytics_session s USING lot
     WHERE s.session_id = lot.session_id AND s.jour_paris = lot.jour_paris;`;
  const r = await q(sql, [jourCourant, tailleLot]);
  return r.rowCount ?? 0;
}

/** Boucle de compaction : traite les lots jusqu'à épuisement des jours scellés. Idempotente (rejeu → 0). */
export async function compacter(q: Requete, jourCourant: string, tailleLot: number): Promise<number> {
  let total = 0;
  // Borne dure anti-boucle-infinie : au pire (tailleLot=1) beaucoup d'itérations, mais chaque lot
  // supprime ≥1 session → la table décroît strictement. Garde-fou d'itérations quand même.
  for (let i = 0; i < 1_000_000; i++) {
    const traites = await compacterUnLot(q, jourCourant, tailleLot);
    total += traites;
    if (traites === 0) break;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARTITIONS — créer les futures (empty range, jamais de conflit _default), DROP les passées VIDES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée les partitions mensuelles [mois courant … +moisAvance] (IF NOT EXISTS) et DROP les partitions
 * PASSÉES et VIDES dont la fin de plage est antérieure à `today - sessionEphemereJours`.
 * - Créer uniquement des mois COURANT/FUTURS : leur plage n'a pas (encore) de lignes → aucun conflit
 *   avec la partition DEFAULT. Un CREATE qui échoue (edge : DEFAULT peuplée pour le mois courant après un
 *   job longtemps arrêté) est CAPTURÉ (non fatal) et signalé → « rattrape sans casser ».
 * - Ne DROP JAMAIS `analytics_session_default` ni une partition non vide (la compaction les vide d'abord).
 */
export async function gererPartitions(
  q: Requete,
  jourCourant: string,
  moisAvance: number,
  sessionEphemereJours: number,
  parent: string = 'analytics_session',
): Promise<{ creees: string[]; supprimees: string[]; conflits: string[] }> {
  // Garde-fou : `parent` s'interpole dans du DDL (jamais paramétrable). Il n'est JAMAIS une entrée
  // utilisateur (défaut fixe ; surcharge réservée aux tests avec un nom littéral), mais on valide le
  // format d'identifiant par prudence — tout écart = throw, pas d'exécution.
  if (!/^[a-z_][a-z0-9_]*$/.test(parent)) throw new Error(`gererPartitions: nom de table invalide « ${parent} »`);
  const creees: string[] = [];
  const conflits: string[] = [];

  // Création [0 … moisAvance] mois à partir du mois courant.
  for (let m = 0; m <= moisAvance; m++) {
    // ⚠️ Les bornes de partition (FOR VALUES FROM … TO …) NE PEUVENT PAS être des paramètres liés en
    // PostgreSQL : elles DOIVENT être des littéraux. On les calcule côté serveur au format 'YYYY-MM-DD'
    // (texte garanti par to_char) puis on les interpole après re-validation stricte du format.
    const r = await q(
      `SELECT to_char(date_trunc('month', $1::date) + make_interval(months => $2::int),     'YYYY_MM')    AS suffixe,
              to_char(date_trunc('month', $1::date) + make_interval(months => $2::int),     'YYYY-MM-DD') AS deb,
              to_char(date_trunc('month', $1::date) + make_interval(months => $2::int + 1), 'YYYY-MM-DD') AS fin`,
      [jourCourant, m],
    );
    const row = r.rows[0] as { suffixe: string; deb: string; fin: string };
    const nom = `${parent}_${row.suffixe}`;
    // Re-validation stricte AVANT interpolation (les valeurs viennent de to_char, jamais de l'utilisateur ;
    // ceinture + bretelles). Format inattendu = on saute ce mois plutôt que d'interpoler quoi que ce soit.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.deb) || !/^\d{4}-\d{2}-\d{2}$/.test(row.fin)) continue;
    try {
      await q(
        `CREATE TABLE IF NOT EXISTS ${nom} PARTITION OF ${parent} FOR VALUES FROM ('${row.deb}') TO ('${row.fin}')`,
        [],
      );
      creees.push(nom);
    } catch (e) {
      // On ne classe en « conflit » QUE l'erreur attendue : DEFAULT contient des lignes de ce mois (job
      // longtemps arrêté) → l'attache viole la contrainte de la partition par défaut = check_violation
      // (23514). Non fatal : les lignes restent en DEFAULT et seront compactées quand leur jour sera scellé.
      if ((e as { code?: string })?.code === '23514') {
        conflits.push(nom);
      } else {
        throw e; // toute AUTRE erreur (droits, disque, verrou…) remonte → visible dans res.erreurs, jamais masquée en « conflit »
      }
    }
  }

  // DROP des partitions PASSÉES et VIDES (jamais _default, jamais une partition non vide).
  const parts = await q(
    `SELECT c.relname AS nom,
            pg_get_expr(c.relpartbound, c.oid) AS bornes
       FROM pg_inherits i
       JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = $1::regclass
        AND c.relname <> $2`,
    [parent, `${parent}_default`],
  );
  const supprimees: string[] = [];
  for (const p of parts.rows as { nom: string; bornes: string | null }[]) {
    // Sécurité : ne DROP que des partitions du parent attendu (préfixe), jamais _default.
    if (!p.nom.startsWith(`${parent}_`) || p.nom === `${parent}_default`) continue;
    // Fin de plage (borne haute TO ('YYYY-MM-DD')) extraite de l'expression de partition.
    const finMatch = p.bornes?.match(/TO \('(\d{4}-\d{2}-\d{2})'\)/);
    if (!finMatch) continue;
    const fin = finMatch[1];
    // Passée et hors rétention session ? (fin de plage ≤ today - sessionEphemereJours)
    const g = await q(
      `SELECT ($1::date <= ($2::date - ($3 || ' day')::interval)) AS purgeable`,
      [fin, jourCourant, sessionEphemereJours],
    );
    if (!(g.rows[0] as { purgeable: boolean }).purgeable) continue;
    // VIDE ? (la compaction a dû la vider ; on ne DROP jamais une partition avec des lignes)
    const cnt = await q(`SELECT EXISTS (SELECT 1 FROM ${p.nom} LIMIT 1) AS a_lignes`, []);
    if ((cnt.rows[0] as { a_lignes: boolean }).a_lignes) continue;
    await q(`DROP TABLE IF EXISTS ${p.nom}`, []);
    supprimees.push(p.nom);
  }

  return { creees, supprimees, conflits };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PURGE des compteurs (agrégats k-safe) hors rétention — par lots bornés (anti-bloat/verrou long)
// ─────────────────────────────────────────────────────────────────────────────

/** Supprime par lots les lignes `table` dont `jour_paris < today - retentionJours`. Renvoie le total supprimé. */
export async function purgerCompteur(
  q: Requete,
  table: 'analytics_compteur_jour' | 'analytics_admin_jour',
  jourCourant: string,
  retentionJours: number,
  tailleLot: number,
): Promise<number> {
  let total = 0;
  for (let i = 0; i < 1_000_000; i++) {
    const r = await q(
      `DELETE FROM ${table}
        WHERE ctid IN (
          SELECT ctid FROM ${table}
           WHERE jour_paris < ($1::date - ($2 || ' day')::interval)
           LIMIT $3
        )`,
      [jourCourant, retentionJours, tailleLot],
    );
    const n = r.rowCount ?? 0;
    total += n;
    if (n === 0) break;
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrateur : verrou consultatif + les trois mécanismes, dans l'ordre.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exécute UN run de maintenance sous verrou consultatif (une seule exécution à la fois). Si le verrou est
 * déjà pris (un autre run en cours), renvoie `{ demarre: false }` sans rien faire. Ne throw jamais un
 * échec de sous-étape vers l'appelant : chaque étape est isolée, ses erreurs sont collectées dans le
 * résultat OBSERVABLE. La connexion de verrou est TOUJOURS libérée.
 */
export async function executerMaintenance(): Promise<ResultatMaintenance> {
  const res: ResultatMaintenance = {
    demarre: false,
    sessionsCompactees: 0,
    partitionsCreees: [],
    partitionsSupprimees: [],
    partitionsEnConflit: [],
    compteursPublicsPurges: 0,
    compteursInternesPurges: 0,
    erreurs: [],
  };

  const client: PoolClient = await poolMaintenance.connect();
  const q: Requete = (text, params) => client.query(text, params as never);
  try {
    const verrou = await client.query('SELECT pg_try_advisory_lock($1) AS ok', [VERROU_MAINTENANCE]);
    if (!(verrou.rows[0] as { ok: boolean }).ok) {
      return res; // demarre:false — un autre run détient le verrou
    }
    res.demarre = true;
    try {
      const jour = jourParis();
      // Lecture de la config. `lireEntier` retombe SILENCIEUSEMENT sur le défaut si la table est absente
      // (42P01) ou la clé absente/invalide ; il RE-LÈVE toute autre erreur (timeout, permission…). On
      // capture donc ici : sur erreur inattendue, on RECORD (observable) et on poursuit avec TOUS les
      // défauts — le run ne casse pas, mais l'anomalie de config n'est pas avalée.
      let tailleLot: number = DEFAUTS.compaction_taille_lot;
      let moisAvance: number = DEFAUTS.partitions_mois_avance;
      let purgeLot: number = DEFAUTS.purge_compteur_taille_lot;
      let sessJours: number = DEFAUTS.session_ephemere_jours;
      let pubJours: number = DEFAUTS.compteur_public_jours;
      let intJours: number = DEFAUTS.compteur_interne_jours;
      try {
        tailleLot = await lireEntier(q, 'analytics_maintenance_config', 'valeur', 'compaction_taille_lot', DEFAUTS.compaction_taille_lot);
        moisAvance = await lireEntier(q, 'analytics_maintenance_config', 'valeur', 'partitions_mois_avance', DEFAUTS.partitions_mois_avance);
        purgeLot = await lireEntier(q, 'analytics_maintenance_config', 'valeur', 'purge_compteur_taille_lot', DEFAUTS.purge_compteur_taille_lot);
        sessJours = await lireEntier(q, 'analytics_retention', 'jours', 'session_ephemere_jours', DEFAUTS.session_ephemere_jours);
        pubJours = await lireEntier(q, 'analytics_retention', 'jours', 'compteur_public_jours', DEFAUTS.compteur_public_jours);
        intJours = await lireEntier(q, 'analytics_retention', 'jours', 'compteur_interne_jours', DEFAUTS.compteur_interne_jours);
      } catch (e) {
        res.erreurs.push(`config: ${String(e)} (repli sur tous les défauts)`);
      }

      // 1. COMPACTION (avant les partitions : vide les jours scellés → les partitions passées deviennent vides).
      try {
        res.sessionsCompactees = await compacter(q, jour, tailleLot);
      } catch (e) {
        res.erreurs.push(`compaction: ${String(e)}`);
      }
      // 2. PARTITIONS.
      try {
        const p = await gererPartitions(q, jour, moisAvance, sessJours);
        res.partitionsCreees = p.creees;
        res.partitionsSupprimees = p.supprimees;
        res.partitionsEnConflit = p.conflits;
      } catch (e) {
        res.erreurs.push(`partitions: ${String(e)}`);
      }
      // 3. PURGE des compteurs.
      try {
        res.compteursPublicsPurges = await purgerCompteur(q, 'analytics_compteur_jour', jour, pubJours, purgeLot);
      } catch (e) {
        res.erreurs.push(`purge_public: ${String(e)}`);
      }
      try {
        res.compteursInternesPurges = await purgerCompteur(q, 'analytics_admin_jour', jour, intJours, purgeLot);
      } catch (e) {
        res.erreurs.push(`purge_interne: ${String(e)}`);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [VERROU_MAINTENANCE]);
    }
  } finally {
    client.release();
  }
  return res;
}
