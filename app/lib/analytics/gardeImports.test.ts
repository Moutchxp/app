import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * M2 — LOT 1. GARDE ANTI-COUPLAGE (le cœur du lot). Le golden ne prouve RIEN sur le couplage : un
 * writer branché par erreur dans `analyserAdresse` ne bougerait pas le score. Ce fichier apporte les
 * DEUX preuves indépendantes exigées :
 *   1. TEST DE GRAPHE D'IMPORTS transitif : aucun fichier moteur n'atteint `app/lib/analytics/**`,
 *      même indirectement (détection prouvée sur une chaîne INDIRECTE, contrôle positif).
 *   2. RÈGLE ESLint RÉELLE : un import interdit fait réellement échouer le lint (invocation réelle,
 *      pas une simulation).
 * + preuve d'ISOLATION du pool au niveau source (le writer n'importe jamais le pool applicatif).
 */

const RACINE = path.resolve(__dirname, '../../..'); // racine du repo (app/)
// Points d'entrée du MOTEUR — ALIGNÉS sur CLAUDE.md §14 (moteur pur + accès données). Toute divergence
// avec la liste ESLint est verrouillée par le test de complétude ci-dessous (constat R2-C1).
const MOTEUR_REL = [
  'app/lib/svv/verdict.ts',
  'app/lib/svv/scoreTotal.ts',
  'app/lib/svv/coucheDegagement.ts',
  'app/lib/svv/analyse.ts',
  'app/lib/svv/scoreDegagement.ts',
  'app/lib/svv/profilDegagement.ts',
  'app/lib/db/pipeline.ts',
  'app/lib/db/obstacles.ts',
  'app/lib/db/faisceaux.ts',
  'app/lib/db/profilConfig.ts',
  'app/lib/db/origine.ts',
  'app/lib/db/hauteurLidar.ts',
];
const MOTEUR = MOTEUR_REL.map((p) => path.join(RACINE, p));

/** Extrait tous les spécifiers d'import/export/require/import() d'un fichier. */
function specifiers(contenu: string): string[] {
  const out: string[] = [];
  const regexes = [
    /(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]/g, // import/export … from '…'
    /\bimport\s*['"]([^'"]+)['"]/g, //                       import '…' (effet de bord)
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, //             import('…') dynamique
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, //            require('…')
  ];
  for (const re of regexes) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(contenu))) out.push(m[1]);
  }
  return out;
}

/** Vrai si un spécifier RÉFÈRE au module analytics (toute forme : relative, alias `@/…`, dynamique). */
function specifierVersAnalytics(spec: string): boolean {
  return /(^|\/)analytics(\/|$)/.test(spec);
}

/** Résout un spécifier RELATIF ou ALIAS `@/…` en chemin absolu (.ts/.tsx/index.*), sinon null (paquet). */
function resoudre(spec: string, depuisDir: string): string | null {
  let base: string;
  if (spec.startsWith('.')) base = path.resolve(depuisDir, spec);
  else if (spec.startsWith('@/')) base = path.join(RACINE, spec.slice(2)); // tsconfig : @/* -> ./*
  else return null; // paquet npm
  for (const c of [base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** Parcourt les imports transitifs depuis `entree` ; renvoie la 1re chaîne atteignant analytics, ou null. */
function chaineVersAnalytics(entree: string): string[] | null {
  const vus = new Set<string>();
  const pile: { f: string; chaine: string[] }[] = [{ f: entree, chaine: [entree] }];
  while (pile.length) {
    const { f, chaine } = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    // On ignore l'entrée elle-même ; on ne « touche » analytics que via un import.
    if (f !== entree && f.replace(/\\/g, '/').includes('/lib/analytics/')) return chaine;
    let contenu: string;
    try {
      contenu = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const spec of specifiers(contenu)) {
      // Détection DIRECTE, indépendante de la résolution : capte relative, alias `@/…`, dynamique,
      // require — même si le fichier n'est pas résolu (constat R2-C2 : alias + import() dynamique).
      if (specifierVersAnalytics(spec)) return [...chaine, `(import) ${spec}`];
      const r = resoudre(spec, path.dirname(f));
      if (r) pile.push({ f: r, chaine: [...chaine, r] });
    }
  }
  return null;
}

describe("garde de graphe — aucun fichier moteur n'atteint le writer analytique", () => {
  it('les fichiers moteur existent (sinon la garde ne garde rien)', () => {
    for (const f of MOTEUR) expect(fs.existsSync(f), f).toBe(true);
  });

  it("AUCUN moteur n'atteint app/lib/analytics/** (même transitivement)", () => {
    for (const entree of MOTEUR) {
      const chaine = chaineVersAnalytics(entree);
      expect(chaine, chaine ? `chaîne interdite : ${chaine.join(' → ')}` : '').toBeNull();
    }
  });

  it('CONTRÔLE POSITIF : la garde DÉTECTE une chaîne INDIRECTE (moteur → intermédiaire → analytics)', () => {
    const dir = path.join(RACINE, 'app/lib/__garde_tmp_graph__');
    fs.mkdirSync(dir, { recursive: true });
    const faux = path.join(dir, 'fauxMoteur.ts');
    const inter = path.join(dir, 'intermediaire.ts');
    try {
      fs.writeFileSync(inter, "import { incrementerCompteur } from '../analytics/writer';\nexport const x = incrementerCompteur;\n");
      fs.writeFileSync(faux, "import './intermediaire';\nexport const y = 1;\n");
      const chaine = chaineVersAnalytics(faux);
      expect(chaine, 'la chaîne indirecte doit être détectée').not.toBeNull();
      expect(chaine!.join(' ')).toMatch(/analytics/);
      expect(chaine!.length).toBeGreaterThanOrEqual(3); // faux → intermédiaire → writer (indirect)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('garde de graphe — robustesse alias & import dynamique (constat R2-C2)', () => {
  it('un spécifier vers analytics est détecté toute forme (relative, alias @/), et seulement lui', () => {
    expect(specifierVersAnalytics('@/app/lib/analytics/writer')).toBe(true);
    expect(specifierVersAnalytics('../analytics')).toBe(true);
    expect(specifierVersAnalytics('../analytics/emission')).toBe(true);
    expect(specifierVersAnalytics('../db/client')).toBe(false); // import légitime, jamais flaggé
    expect(specifierVersAnalytics('../myanalyticsx/x')).toBe(false); // pas de faux positif de sous-chaîne
  });

  it("CONTRÔLE POSITIF : un import() DYNAMIQUE via alias @/ est capté (échappait à ESLint + à l'ancien graphe)", () => {
    const dir = path.join(RACINE, 'app/lib/__garde_tmp_dyn__');
    fs.mkdirSync(dir, { recursive: true });
    const faux = path.join(dir, 'fauxMoteur.ts');
    try {
      fs.writeFileSync(faux, "export async function f() { return import('@/app/lib/analytics/writer'); }\n");
      expect(chaineVersAnalytics(faux), 'import() dynamique via alias doit être détecté').not.toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('complétude — liste ESLint alignée sur MOTEUR / CLAUDE.md §14 (constat R2-C1)', () => {
  it('chaque fichier moteur DB est soumis à la règle ESLint ; svv couvert par le glob', () => {
    const conf = fs.readFileSync(path.join(RACINE, 'eslint.config.mjs'), 'utf8');
    expect(conf).toContain('app/lib/svv/**/*.ts'); // couvre tous les fichiers svv/**
    for (const rel of MOTEUR_REL.filter((r) => r.startsWith('app/lib/db/'))) {
      expect(conf.includes(rel), `${rel} doit figurer dans la liste files d'eslint.config.mjs`).toBe(true);
    }
  });
});

describe('garde ESLint RÉELLE — un import interdit fait échouer le lint', () => {
  it('eslint signale no-restricted-imports sur un moteur qui importe analytics', () => {
    const tmp = path.join(RACINE, 'app/lib/svv/__garde_eslint_tmp__.ts');
    fs.writeFileSync(tmp, "import '../analytics/writer';\nexport const x = 1;\n");
    try {
      let sortie = '';
      let aEchoue = false;
      try {
        execSync(`npx eslint "app/lib/svv/__garde_eslint_tmp__.ts"`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        aEchoue = true;
        const err = e as { stdout?: string; stderr?: string };
        sortie = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      }
      expect(aEchoue, 'eslint doit sortir en erreur').toBe(true);
      expect(sortie).toMatch(/no-restricted-imports|COUPLAGE INTERDIT/);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }, 120000);
});

describe('isolation du pool (source) — le writer ne touche jamais le pool applicatif', () => {
  it("aucun module app/lib/analytics n'importe app/lib/db/client", () => {
    const dir = __dirname;
    const fichiers = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const f of fichiers) {
      const contenu = fs.readFileSync(path.join(dir, f), 'utf8');
      // On teste les SPÉCIFIERS d'import réels, pas une mention en commentaire (pool.ts documente
      // légitimement sa distinction d'avec `db/client`).
      const importeClient = specifiers(contenu).some((s) => s.includes('db/client'));
      expect(importeClient, `${f} ne doit pas importer db/client`).toBe(false);
    }
  });
});
