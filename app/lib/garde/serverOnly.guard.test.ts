import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { build, type Metafile } from 'esbuild';
import {
  violationsServerOnly, importeursNonAutorises, messageViolationsServerOnly, messageImporteursNonAutorises,
  type GrapheImports,
} from './grapheImports';

/**
 * F2 — GARDE-FOU D'INTÉGRATION (le contrôle qui aurait attrapé 0d57224). Il construit le graphe d'imports RÉEL avec esbuild
 * (`--metafile`, `write:false`, `treeShaking:false`, imports statiques ET dynamiques) SANS jamais exécuter le code des scripts
 * — indispensable, car chaque CLI a un `void principal()` en tête de module. La logique de détection est PURE (grapheImports.ts,
 * testée à part sur données fabriquées). Ici : découverte automatique des scripts + scan du dépôt + assertions.
 *
 * ⚠️ vitest aliase `server-only` → empty.js (nécessaire aux tests unitaires) : AUCUN test ne peut donc démontrer que le CLI ne
 * meurt plus au chargement. La preuve, c'est le GRAPHE — exactement ce que ce fichier vérifie.
 */

// Motif d'un VRAI import (début de ligne), jamais une simple mention en commentaire (`// … server-only …`, ` * server-only`).
const RE_SERVER_ONLY = /^\s*import\s+['"]server-only['"]/m;
// Import (statique / dynamique / réexport) d'un specifier finissant par `/jetonCada` — évite de matcher le symbole signerJetonCada.
const RE_IMPORT_JETONCADA = /\b(?:from|import)\s*\(?\s*['"][^'"]*\/jetonCada['"]/;

// Importeurs SERVEUR légitimes de jetonCada.ts (module volontairement dé-gardé en F1). VÉRIFIÉ dans le code (grep), pas sur parole.
const AUTORISES_JETONCADA = [
  'app/lib/veille/propositionAuto.ts',        // X5 : signe le lien de confirmation (chemin CLI de la veille)
  'app/lib/internaute/jetonRectification.ts', // réimporte cleSignature + SCOPE_CADA (le vérificateur reste sous server-only)
];

const posix = (p: string): string => p.split(/[\\/]/).join('/');

/** Tous les .ts/.tsx du dépôt sous app/, en chemins repo-relatifs posix. */
function fichiersApp(): string[] {
  return readdirSync('app', { recursive: true })
    .map((p) => 'app/' + posix(String(p)))
    .filter((p) => /\.tsx?$/.test(p));
}

/** Scripts CLI = app/scripts/*.ts (racine), hors *.test.ts — DÉCOUVERTE automatique (jamais de liste en dur). */
function scriptsCli(): string[] {
  return readdirSync('app/scripts')
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => 'app/scripts/' + f)
    .sort();
}

/** metafile.inputs → graphe interne (arêtes vers des fichiers du dépôt ; les paquets externes sont ignorés). */
function grapheDepuisMetafile(inputs: Metafile['inputs']): GrapheImports {
  const g: GrapheImports = {};
  for (const [f, info] of Object.entries(inputs)) {
    g[f] = info.imports.filter((im) => !im.external && inputs[im.path] !== undefined).map((im) => im.path);
  }
  return g;
}

let graphe: GrapheImports;
let scripts: string[];
let vrais: Set<string>;
let contenus: Map<string, string>;
let dureeBuildMs = 0;

beforeAll(async () => {
  scripts = scriptsCli();

  // Graphe réel via esbuild — write:false (rien écrit sur disque), code jamais exécuté.
  const t = process.hrtime.bigint();
  const res = await build({
    entryPoints: scripts, bundle: true, write: false, metafile: true,
    platform: 'node', packages: 'external', treeShaking: false, format: 'esm',
    logLevel: 'silent', outdir: '__f2_guard_dummy__',
  });
  dureeBuildMs = Number(process.hrtime.bigint() - t) / 1e6;
  graphe = grapheDepuisMetafile(res.metafile.inputs);

  // Contenus lus UNE fois ; vrais importeurs de server-only = motif d'import réel.
  contenus = new Map(fichiersApp().map((f) => [f, readFileSync(f, 'utf8')]));
  vrais = new Set([...contenus].filter(([, src]) => RE_SERVER_ONLY.test(src)).map(([f]) => f));
}, 30_000);

describe('F2/A — aucun script CLI n’atteint un module `server-only`', () => {
  it('graphe réel du dépôt : zéro violation (F1 a réparé la seule chaîne connue)', () => {
    const violations = violationsServerOnly(graphe, scripts, vrais);
    console.log(`[F2] scripts=${scripts.length} · fichiers dans le graphe=${Object.keys(graphe).length} · vrais importeurs server-only=${vrais.size} · build esbuild=${dureeBuildMs.toFixed(0)} ms`);
    expect(violations, messageViolationsServerOnly(violations)).toEqual([]);
  });

  it('cohérence du contrôle : la découverte des scripts et la liste des vrais importeurs sont non vides', () => {
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts).toContain('app/scripts/veille-run.ts');
    expect(vrais.size).toBeGreaterThan(0);                                  // sinon le motif ou le scan est cassé
    expect(vrais.has('app/lib/internaute/jetonRectification.ts')).toBe(true); // témoin : ce module PORTE bien server-only
    expect(vrais.has('app/lib/internaute/jetonCada.ts')).toBe(false);         // témoin : celui-ci ne le porte PAS (F1)
  });
});

describe('F2/B — liste blanche des importeurs de jetonCada.ts', () => {
  it('seuls les importeurs serveur attendus (+ fichiers de test) importent le module dé-gardé', () => {
    const cible = 'app/lib/internaute/jetonCada.ts';
    const importeurs = [...contenus]
      .filter(([f, src]) => f !== cible && RE_IMPORT_JETONCADA.test(src))
      .map(([f]) => f)
      .sort();
    // Témoin : les importeurs attendus sont bien détectés (sinon le motif de scan est cassé).
    expect(importeurs).toContain('app/lib/veille/propositionAuto.ts');
    expect(importeurs).toContain('app/lib/internaute/jetonRectification.ts');

    const intrus = importeursNonAutorises(importeurs, AUTORISES_JETONCADA);
    expect(intrus, messageImporteursNonAutorises(cible, intrus, AUTORISES_JETONCADA)).toEqual([]);
  });
});
