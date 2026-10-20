/**
 * ══ 🔴🔴 LA BASE JETABLE DES ÉPREUVES : CRÉÉE NEUVE, PUIS SUPPRIMÉE ENTIÈRE (Arno, 20/10/2026, option B de la 393) ══════════
 *
 * Depuis la migration 393, l'annuaire, les baux, les cartes, les garants et les conditions refusent DELETE et TRUNCATE, SANS
 * EXCEPTION — même sur une base d'essai. Une épreuve ne « vide » donc plus jamais une table : elle repart d'une base
 * `gestion_jetable` NEUVE (supprimée si elle existe, recréée, schéma copié en LECTURE SEULE depuis une base source, migrations
 * listées rejouées), et la SUPPRIME ENTIÈRE à la fin.
 *
 * 🔴 LE GARDE NE BOUGE PAS : `gardeBaseJetable` refuse tout si DATABASE_URL ne vise pas `gestion_jetable`, AVANT la moindre
 *    commande. Et le nom supprimé/recréé est la CONSTANTE `BASE_JETABLE`, jamais une valeur lue (URL, option) : aucune option
 *    ne peut faire supprimer une autre base.
 * 🔒 La base source n'est que LUE (`pg_dump --schema-only`) : aucune donnée n'est copiée, rien n'y est écrit.
 */
import { execFileSync } from 'node:child_process';

/** Le SEUL nom de base que les épreuves acceptent — et le seul qu'elles suppriment. */
export const BASE_JETABLE = 'gestion_jetable';

/** La base visée par une URL de connexion (le chemin), ou `null`. */
export function baseDeLUrl(url: string | undefined): string | null {
  if (url === undefined || url.trim() === '') return null;
  try { return decodeURIComponent(new URL(url).pathname.replace(/^\//, '')) || null; } catch { return null; }
}

/** Refuse (motif) si DATABASE_URL ne vise pas la base jetable ; `null` si elle la vise. */
export function gardeBaseJetable(url: string | undefined): string | null {
  const base = baseDeLUrl(url);
  return base === BASE_JETABLE ? null
    : `Base visée « ${base ?? 'aucune'} », attendue « ${BASE_JETABLE} ». Relancer avec DATABASE_URL=postgresql://localhost:5432/${BASE_JETABLE}`;
}

/** Les options de connexion de `psql`/`pg_dump` (hôte, port, utilisateur) tirées de l'URL — jamais la base. */
function connexion(url: string): string[] {
  const u = new URL(url);
  return [...(u.hostname ? ['-h', u.hostname] : []), ...(u.port ? ['-p', u.port] : []), ...(u.username ? ['-U', decodeURIComponent(u.username)] : [])];
}

function env(url: string): NodeJS.ProcessEnv {
  const u = new URL(url);
  // Les NOTICE (« … does not exist, skipping » des instructions rejouables) ne disent rien d'utile ici : avertissements et erreurs seulement.
  const base = { ...process.env, PGOPTIONS: '-c client_min_messages=warning' };
  return u.password ? { ...base, PGPASSWORD: decodeURIComponent(u.password) } : base;
}

/** Supprime la base jetable ENTIÈRE (si elle existe). */
export function supprimerBaseJetable(url: string): void {
  execFileSync('psql', [...connexion(url), '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q',
    '-c', `DROP DATABASE IF EXISTS ${BASE_JETABLE} WITH (FORCE)`], { env: env(url), stdio: ['ignore', 'ignore', 'inherit'] });
}

/**
 * Recrée la base jetable NEUVE : suppression, création, schéma de `source` (lecture seule), puis chaque migration listée
 * (dans l'ordre, ON_ERROR_STOP). Rend la liste de ce qui a été fait, pour la sortie de l'épreuve.
 */
export function recreerBaseJetable(url: string, o: { source: string; migrations: readonly string[] }): string[] {
  const garde = gardeBaseJetable(url);
  if (garde !== null) throw new Error(garde);
  const fait: string[] = [];
  supprimerBaseJetable(url);
  execFileSync('psql', [...connexion(url), '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-c', `CREATE DATABASE ${BASE_JETABLE}`],
    { env: env(url), stdio: ['ignore', 'ignore', 'inherit'] });
  fait.push(`base « ${BASE_JETABLE} » créée neuve`);
  const schema = execFileSync('pg_dump', [...connexion(url), '--schema-only', '--no-owner', '--no-privileges', o.source],
    { env: env(url), maxBuffer: 512 * 1024 * 1024 });
  execFileSync('psql', [...connexion(url), '-d', BASE_JETABLE, '-q', '-v', 'ON_ERROR_STOP=1'],
    { env: env(url), input: schema, stdio: ['pipe', 'ignore', 'inherit'] });
  fait.push(`schéma copié de « ${o.source} » (lecture seule, aucune donnée)`);
  for (const m of o.migrations) {
    execFileSync('psql', [...connexion(url), '-d', BASE_JETABLE, '-q', '-v', 'ON_ERROR_STOP=1', '-f', m],
      { env: env(url), stdio: ['ignore', 'ignore', 'inherit'] });
    fait.push(`migration rejouée : ${m}`);
  }
  return fait;
}

/** Les options communes : `--schema-de=<base>` (défaut svav_recette), `--migration=<fichier>` (répétable), `--garder-base`. */
export function optionsBaseJetable(args: readonly string[]): { source: string; migrations: string[]; garder: boolean } {
  return {
    source: args.find((a) => a.startsWith('--schema-de='))?.slice('--schema-de='.length) || 'svav_recette',
    migrations: args.filter((a) => a.startsWith('--migration=')).map((a) => a.slice('--migration='.length)),
    garder: args.includes('--garder-base'),
  };
}
