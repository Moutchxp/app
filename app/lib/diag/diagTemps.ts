/**
 * ══ LOT « CAS INDÉTERMINÉ PÉRIMÉ + ANALYSE DE PLUS DE 60 s » (15/10/2026) — PARTIES PURES DE `scripts/diag-temps.ts` ════
 *
 * Constat d'origine (serveur, 15/10/2026, 4 141 dalles LiDAR chargées) : le cas INDÉTERMINÉ de `pipeline.itest.ts` dépasse
 * 60 s alors que les autres analyses prennent ~3,4 s. La cause n'est pas établie : l'outil MESURE (durée de chaque étape et
 * de chaque requête SQL), il ne corrige rien.
 *
 * Ce module ne contient que du PUR (aucune base, aucun réseau, aucun import) : lecture des arguments, attribution d'une
 * requête à son étape d'après la pile d'appels, longueur du couloir lue dans les paramètres, tuiles LiDAR comptées dans un
 * plan EXPLAIN, classement et rendu du rapport.
 */

/** Le cas mesuré sur le serveur le 15/10/2026 : ancien point FIXE du cas INDÉTERMINÉ de `pipeline.itest.ts`. */
export const CAS_INDETERMINE_SERVEUR = {
  point: { lat: 48.90977883617502, lon: 2.274351016683915 },
  azimutPrincipalDeg: 0,
  etage: 0,
  dernierEtage: false,
} as const;

export interface ArgumentsDiagTemps {
  point: { lat: number; lon: number };
  azimutPrincipalDeg: number;
  etage: number;
  dernierEtage: boolean;
  /** Nombre de requêtes listées dans le classement (défaut 10). */
  top: number;
  /** Rejouer en EXPLAIN (ANALYZE, BUFFERS) les requêtes du classement pour compter les tuiles lues (défaut oui). */
  explain: boolean;
  /** Fichier où écrire le détail complet en JSON (journal + plans), ou null. */
  json: string | null;
}

/** Lit `--lat= --lon= --azimut= --etage= --dernier-etage --top= --sans-explain --json=` ; défaut : le cas du serveur.
 *  Une valeur illisible lève une erreur claire plutôt que de mesurer un autre cas que celui demandé. PUR. */
export function lireArguments(argv: readonly string[]): ArgumentsDiagTemps {
  const valeur = (nom: string): string | undefined => argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
  const nombre = (nom: string, defaut: number): number => {
    const v = valeur(nom);
    if (v === undefined) return defaut;
    const n = Number(v);
    if (v.trim() === '' || !Number.isFinite(n)) throw new Error(`--${nom}=${v} : nombre attendu`);
    return n;
  };
  const top = nombre('top', 10);
  if (!Number.isInteger(top) || top < 1) throw new Error(`--top=${top} : entier ≥ 1 attendu`);
  const json = valeur('json');
  return {
    point: { lat: nombre('lat', CAS_INDETERMINE_SERVEUR.point.lat), lon: nombre('lon', CAS_INDETERMINE_SERVEUR.point.lon) },
    azimutPrincipalDeg: nombre('azimut', CAS_INDETERMINE_SERVEUR.azimutPrincipalDeg),
    etage: nombre('etage', CAS_INDETERMINE_SERVEUR.etage),
    dernierEtage: argv.includes('--dernier-etage'),
    top,
    explain: !argv.includes('--sans-explain'),
    json: json && json.trim() !== '' ? json.trim() : null,
  };
}

/**
 * Longueur du couloir (m) d'une requête du moteur : le paramètre multiplié dans `ST_Translate(o.g, $N * …)`, forme commune
 * à toutes les requêtes d'axe (`obstacles.ts`, `preparateurPaysage.ts`). `null` si la requête n'en construit pas. PUR.
 */
export function longueurCouloir(sql: string, params: readonly unknown[]): number | null {
  const m = /ST_Translate\(\s*o\.g\s*,\s*\$(\d+)\s*\*/.exec(sql);
  if (!m) return null;
  const v = Number(params[Number(m[1]) - 1]);
  return Number.isFinite(v) ? v : null;
}

/** Nom de fonction d'une ligne de pile V8 (« at async obstaclesSurAxe (…) » → « obstaclesSurAxe »), ou null. */
function fonctionDeLigne(ligne: string): string | null {
  const m = /^\s*at (?:async )?([^\s(]+) \(/.exec(ligne);
  return m ? m[1] : null;
}

/**
 * Étape du pipeline qui a émis une requête : la fonction appelée DIRECTEMENT par `construireEntree` (validerOrigine,
 * obstaclesSurAxe, faisceauxAmplitude, resoudreVueNature…), ou `chargerProfilDegagement`. Lu sur la pile d'appels, le moteur
 * n'est pas instrumenté.
 * Une requête lancée dans un `Promise.all` après un premier `await` (les 61 faisceaux) n'a plus `construireEntree` dans sa
 * pile : elle reçoit l'étape PRÉCÉDENTE (`precedente`) — exact, car `construireEntree` attend chaque étape avant la suivante
 * et les requêtes sont journalisées dans l'ordre d'émission. « (hors étape) » si rien ne permet de la situer. PUR.
 */
export function etapeDepuisPile(pile: string, precedente: string | null = null): string {
  const fonctions = pile.split('\n').map(fonctionDeLigne).filter((f): f is string => f !== null)
    .map((f) => f.replace(/^Object\./, ''));
  if (fonctions.includes('chargerProfilDegagement')) return 'chargerProfilDegagement';
  const i = fonctions.indexOf('construireEntree');
  for (let k = i - 1; k >= 0; k--) {
    if (!fonctions[k].startsWith('Promise.') && !fonctions[k].startsWith('process.')) return fonctions[k];
  }
  return precedente ?? '(hors étape)';
}

/** Tuiles lues dans un plan `EXPLAIN (ANALYZE, FORMAT JSON)` : lignes effectivement rendues (× boucles) par les nœuds qui
 *  parcourent `mns_lidar_brut` / `mnt_lidar_brut` (1 ligne = 1 tuile raster). PUR. */
export function tuilesLues(plan: unknown): { mns: number; mnt: number } {
  const total = { mns: 0, mnt: 0 };
  const visiter = (n: unknown): void => {
    if (Array.isArray(n)) { n.forEach(visiter); return; }
    if (n === null || typeof n !== 'object') return;
    const noeud = n as Record<string, unknown>;
    const lignes = Number(noeud['Actual Rows'] ?? 0) * Number(noeud['Actual Loops'] ?? 1);
    if (noeud['Relation Name'] === 'mns_lidar_brut') total.mns += lignes;
    if (noeud['Relation Name'] === 'mnt_lidar_brut') total.mnt += lignes;
    for (const v of Object.values(noeud)) if (typeof v === 'object') visiter(v);
  };
  visiter(plan);
  return total;
}

export interface MesureRequete {
  n: number;
  etape: string;
  appelant: string;
  sql: string;
  params: unknown[];
  /** Durée d'exécution SEULE (attente de la file exclue), en millisecondes. */
  dureeMs: number;
  nbLignes: number | null;
  couloirM: number | null;
  tuiles: { mns: number; mnt: number } | null;
  erreur: string | null;
}

export interface MesureEtape {
  etape: string;
  nbRequetes: number;
  sqlMs: number;
}

/** Cumul par étape, dans l'ordre de première apparition. PUR. */
export function cumulParEtape(journal: readonly MesureRequete[]): MesureEtape[] {
  const parEtape = new Map<string, MesureEtape>();
  for (const r of journal) {
    const e = parEtape.get(r.etape) ?? { etape: r.etape, nbRequetes: 0, sqlMs: 0 };
    e.nbRequetes += 1;
    e.sqlMs += r.dureeMs;
    parEtape.set(r.etape, e);
  }
  return [...parEtape.values()];
}

/** Les `n` requêtes les plus lentes, de la plus lente à la plus rapide (à durée égale, ordre d'émission). PUR. */
export function plusLentes(journal: readonly MesureRequete[], n: number): MesureRequete[] {
  return [...journal].sort((a, b) => b.dureeMs - a.dureeMs || a.n - b.n).slice(0, n);
}

const ms = (v: number): string => `${v.toFixed(1)} ms`;

export interface RapportDiagTemps {
  cas: ArgumentsDiagTemps;
  machine: string;
  totalMs: number;
  construireEntreeMs: number;
  analyserMs: number | null;
  verdict: string | null;
  distanceM: number | null;
  validationValide: boolean;
  journal: MesureRequete[];
}

/** Rapport lisible : cas, verdict, total, temps par étape, puis les requêtes les plus lentes. PUR. */
export function rendreRapport(r: RapportDiagTemps): string {
  const sqlTotal = r.journal.reduce((s, q) => s + q.dureeMs, 0);
  const l: string[] = [];
  l.push(`diag:temps — ${r.machine}`);
  l.push(`Cas : lat ${r.cas.point.lat}, lon ${r.cas.point.lon}, azimut ${r.cas.azimutPrincipalDeg}°, étage ${r.cas.etage}${r.cas.dernierEtage ? ' (dernier étage)' : ''}`);
  l.push(`Origine valide : ${r.validationValide ? 'oui' : 'non'} · verdict : ${r.verdict ?? '—'}${r.distanceM === null ? '' : ` (distance ${r.distanceM} m)`}`);
  l.push('');
  l.push(`TOTAL : ${ms(r.totalMs)}  (construireEntree ${ms(r.construireEntreeMs)}, analyser ${r.analyserMs === null ? '—' : ms(r.analyserMs)})`);
  l.push(`SQL : ${r.journal.length} requêtes, ${ms(sqlTotal)} cumulées (exécutées UNE PAR UNE, en lecture seule ; en production, certaines partent en parallèle)`);
  l.push('');
  l.push('Par étape :');
  for (const e of cumulParEtape(r.journal)) l.push(`  ${e.etape.padEnd(28)} ${String(e.nbRequetes).padStart(4)} requête(s)  ${ms(e.sqlMs).padStart(12)}`);
  l.push('');
  const top = plusLentes(r.journal, r.cas.top);
  l.push(`Les ${top.length} requêtes les plus lentes :`);
  top.forEach((q, i) => {
    const tuiles = q.tuiles === null ? 'tuiles —' : `tuiles lues : MNS ${q.tuiles.mns}, MNT ${q.tuiles.mnt}`;
    l.push(`${String(i + 1).padStart(2)}. ${ms(q.dureeMs).padStart(12)}  n°${q.n}  ${q.appelant}  [${q.etape}]`);
    l.push(`      ${q.nbLignes ?? '—'} ligne(s) · couloir ${q.couloirM === null ? '—' : `${q.couloirM} m`} · ${tuiles}${q.erreur ? ` · ERREUR : ${q.erreur}` : ''}`);
    l.push(`      ${q.sql.length > 160 ? `${q.sql.slice(0, 160)}…` : q.sql}`);
  });
  return `${l.join('\n')}\n`;
}
