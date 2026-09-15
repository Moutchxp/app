import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { glob } from 'tinyglobby';
import vitestConfig from '../../vitest.config';

/**
 * MÉTA-TEST — GARDE-FOU anti « test fantôme ». Rend IMPOSSIBLE le défaut du 2026-09-15 : un fichier ressemblant à un test mais que la
 * config vitest ne collecte pas (ici `BlocDemandePieces.toutCocher.test.tsx`, alors que le `include` d'alors ne couvrait que les
 * fichiers en `.test.ts` sous `app/`) — il passait pour vert sans jamais tourner. Même FAMILLE que `curation.test.ts` resté rouge et
 * invisible du 14/07 au 03/08/2026.
 *
 * INVARIANT : tout fichier SUIVI PAR GIT dont le nom ressemble à un test (`.test.`/`.spec.` + une extension TS/JS) DOIT être collecté
 * par la config. On calcule l'ensemble « collecté » avec tinyglobby ET le `include` RÉEL de la config (source unique) — c'est
 * exactement le globber qu'utilise vitest, donc aucune divergence de matcher possible. Un fichier non collecté fait ÉCHOUER `npm test`
 * en nommant le coupable. On s'appuie sur `git ls-files` : les expériences gitignorées (p. ex. `sandbox/`, avec sa propre config) sont
 * d'office hors périmètre, sans liste d'exclusion à maintenir.
 *
 * ⚠️ Si ce test échoue : NE PAS renommer ni désactiver le fichier fautif pour le faire disparaître. Élargir `test.include` (ou déplacer
 *   le fichier sous une zone couverte) — sinon on masque un test qui ne tourne pas.
 */

const RE_NOM_TEST = /\.(test|spec)\.[cm]?[jt]sx?$/; // .test./.spec. + ts, tsx, mts, cts, js, jsx, mjs, cjs
const norm = (p: string): string => p.replace(/^\.\//, '').trim();

/** Patterns `include` RÉELS de la config vitest (source unique — jamais recopiés ici). */
function includeConfig(): string[] {
  const inc = (vitestConfig as { test?: { include?: string[] } }).test?.include;
  if (!inc || inc.length === 0) throw new Error('vitest.config: `test.include` introuvable ou vide — le garde-fou ne peut pas vérifier la collecte.');
  return inc;
}

/** Fichiers de test SUIVIS PAR GIT (les gitignorés — sandbox, etc. — sont exclus d'office). */
function testsSuivis(): string[] {
  const sortie = execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return sortie.split('\0').map(norm).filter((f) => f !== '' && RE_NOM_TEST.test(f));
}

describe('méta — collecte des tests (anti test fantôme)', () => {
  it('tout fichier de test suivi par git est bien collecté par la config vitest', async () => {
    const include = includeConfig();
    const suivis = testsSuivis();

    // Sanité : si `git ls-files` n'a rien renvoyé, le garde-fou passerait à vide (faux négatif). On refuse ce cas.
    expect(suivis.length, 'git ls-files n’a renvoyé aucun fichier de test — environnement sans git ? Le garde-fou ne doit pas passer à vide.').toBeGreaterThan(50);

    const collectes = new Set((await glob(include, { cwd: process.cwd() })).map(norm));
    const orphelins = suivis.filter((f) => !collectes.has(f));

    expect(
      orphelins,
      `Fichier(s) ressemblant à un test mais NON collecté(s) par vitest (include actuel : ${include.join(', ')}).\n` +
        'À CORRIGER en élargissant `test.include` ou en déplaçant le fichier — JAMAIS en renommant/désactivant le test :\n  ' +
        orphelins.join('\n  '),
    ).toEqual([]);
  });
});
