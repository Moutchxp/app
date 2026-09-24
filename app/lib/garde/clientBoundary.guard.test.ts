import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { build, type Metafile } from 'esbuild';
import { cheminVersServerOnly, type GrapheImports } from './grapheImports';

/**
 * 🔴 GARDE DE LA FRONTIÈRE CLIENT — écrit APRÈS l'incident du 24/09/2026, qui a bloqué TOUTE l'application, page de
 * connexion comprise : « Module not found: Can't resolve 'dns' ».
 *
 * CE QUI S'ÉTAIT PASSÉ. Le lot 5c avait fait importer `decouperTermes` à `BoiteMail.tsx` (un composant CLIENT) depuis
 * `rechercheBoite.ts` — un module qui contient aussi le SQL, et donc importe `db/client` → `pg` → `dns`. Le navigateur
 * n'a pas de `dns` : webpack a refusé de construire la page, et toutes les autres avec.
 *
 * 🔴 POURQUOI `serverOnly.guard` NE POUVAIT PAS L'ATTRAPER, et ce n'est pas un oubli de sa part : il part des SCRIPTS
 * CLI et cherche s'ils atteignent un module marqué `server-only`. Le défaut ici va dans l'AUTRE SENS — un composant
 * client qui atteint un module serveur — et `db/client.ts` ne porte PAS `server-only` (les CLI s'en servent
 * légitimement, c'est même toute la raison du lot F1). Aucun de ses deux critères ne s'appliquait. Il fallait un
 * second garde, dans l'autre direction : celui-ci.
 *
 * ⚠️ ET SURTOUT : `npm test` ne construit AUCUNE page. Les 8 800 tests étaient verts pendant que l'application était
 * inutilisable. Ce garde est la seule chose, dans la suite, qui regarde ce que le navigateur devra charger.
 *
 * COMMENT IL PROCÈDE. Points d'entrée = tous les fichiers marqués `'use client'`. Graphe d'imports RÉEL construit par
 * esbuild (`write:false`, code jamais exécuté), avec l'effacement des types que fait aussi le compilateur : un
 * `import type` ne compte pas, un import de VALEUR compte. Cible interdite = tout module du dépôt qui importe le
 * pilote `pg` ou se déclare `server-only`.
 */

const posix = (p: string): string => p.split(/[\\/]/).join('/');

/** Motif d'un VRAI import (début de ligne), jamais une mention en commentaire. */
const RE_SERVER_ONLY = /^\s*import\s+['"]server-only['"]/m;
/** Import du pilote PostgreSQL — la racine de la chaîne `pg` → `dns` qui a cassé le navigateur. */
const RE_PG = /^\s*import\s[^'"]*['"]pg['"]|require\(['"]pg['"]\)/m;

/** Tous les .ts/.tsx du dépôt sous app/, en chemins repo-relatifs posix. */
function fichiersApp(): string[] {
  return readdirSync('app', { recursive: true })
    .map((p) => 'app/' + posix(String(p)))
    .filter((p) => /\.tsx?$/.test(p));
}

/** metafile.inputs → graphe interne (les paquets externes sont ignorés : seuls les fichiers du dépôt comptent). */
function grapheDepuisMetafile(inputs: Metafile['inputs']): GrapheImports {
  const g: GrapheImports = {};
  for (const [f, info] of Object.entries(inputs)) {
    g[f] = info.imports.filter((im) => !im.external && inputs[im.path] !== undefined).map((im) => im.path);
  }
  return g;
}

let graphe: GrapheImports;
let composantsClient: string[];
let interdits: Set<string>;
let dureeBuildMs = 0;

beforeAll(async () => {
  const contenus = new Map(fichiersApp().map((f) => [f, readFileSync(f, 'utf8')]));

  // Un composant CLIENT est un fichier qui commence par 'use client' — la directive, pas une mention dans un texte.
  composantsClient = [...contenus]
    .filter(([, src]) => /^\s*(['"])use client\1/.test(src))
    .map(([f]) => f)
    .sort();

  // Ce qu'un composant client ne doit JAMAIS atteindre : le pilote de base, ou un module déclaré serveur.
  interdits = new Set(
    [...contenus].filter(([, src]) => RE_PG.test(src) || RE_SERVER_ONLY.test(src)).map(([f]) => f),
  );

  const t = process.hrtime.bigint();
  const res = await build({
    entryPoints: composantsClient,
    bundle: true, write: false, metafile: true,
    // `platform: browser` : c'est bien le navigateur qu'on simule, celui qui n'a ni `dns` ni `net`.
    platform: 'browser', packages: 'external', treeShaking: false, format: 'esm',
    jsx: 'automatic', logLevel: 'silent', outdir: '__garde_client_dummy__',
  });
  dureeBuildMs = Number(process.hrtime.bigint() - t) / 1e6;
  graphe = grapheDepuisMetafile(res.metafile.inputs);
}, 60_000);

describe('🔴 FRONTIÈRE CLIENT — aucun composant du navigateur n’atteint la base de données', () => {
  it('graphe réel du dépôt : zéro composant client ne remonte jusqu’à `pg` ou à un module `server-only`', () => {
    const violations = composantsClient
      .map((c) => ({ composant: c, chemin: cheminVersServerOnly(graphe, c, interdits) }))
      .filter((v): v is { composant: string; chemin: string[] } => v.chemin !== null);

    console.log(`[frontière client] composants='use client'=${composantsClient.length} · fichiers dans le graphe=${Object.keys(graphe).length} · modules serveur=${interdits.size} · build esbuild=${dureeBuildMs.toFixed(0)} ms`);

    const message = violations.length === 0 ? '' : [
      '',
      '🔴 UN COMPOSANT CLIENT ATTEINT UN MODULE SERVEUR — la page ne se construira PAS dans le navigateur.',
      '   Symptôme réel : « Module not found: Can\'t resolve \'dns\' », et TOUTE l\'application tombe, page de connexion comprise.',
      '   Correctif : sortir ce dont le navigateur a besoin (types, constantes, fonctions pures) dans un module SANS',
      '   import de base ; le SQL reste côté serveur, atteint seulement par une route API.',
      '',
      ...violations.map((v) => `   ${v.composant}\n      → ${v.chemin.join('\n      → ')}`),
      '',
    ].join('\n');

    expect(violations, message).toEqual([]);
  });

  it('cohérence du contrôle : les points d’entrée et les cibles interdites sont non vides', () => {
    // Sans ces témoins, le test passerait au vert le jour où la découverte casse — un garde qui ne garde rien.
    expect(composantsClient.length).toBeGreaterThan(50);
    expect(composantsClient).toContain('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx');
    expect(interdits.size).toBeGreaterThan(0);
    expect(interdits.has('app/lib/db/client.ts')).toBe(true); // le module qui importe `pg`
  });

  it('le graphe VOIT bien les imports de valeur (sinon il ne prouverait rien)', () => {
    // Témoin d'outillage : un composant client atteint forcément SES propres dépendances de valeur. Si ce nombre
    //   tombait à zéro, c'est que l'analyse ne suit plus rien et que le test vert ne voudrait plus rien dire.
    const arêtes = composantsClient.reduce((n, c) => n + (graphe[c]?.length ?? 0), 0);
    expect(arêtes).toBeGreaterThan(0);
  });
});
