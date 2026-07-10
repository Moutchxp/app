import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * M2 — LOT 2. Garanties propres au lot : (1) la garde anti-couplage distingue ROUTE (autorisée à importer
 * le writer) de MOTEUR (interdit) ; (2) le seuil k-anonymat est POSÉ en config mais lu par AUCUN code
 * (appliqué à l'affichage, lots 4-5). Le sens « moteur → writer INTERDIT » reste prouvé par
 * `gardeImports.test.ts` (inchangé).
 */
const RACINE = path.resolve(__dirname, '../../..'); // racine du repo (app/)

describe('GARDE — un import ROUTE → writer est AUTORISÉ (la garde ne vise que le moteur)', () => {
  it('eslint ne signale PAS no-restricted-imports sur une route qui importe analytics', () => {
    const dir = path.join(RACINE, 'app/api/__garde_tmp_route__');
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, 'route.ts');
    fs.writeFileSync(
      f,
      "import { incrementerCompteur } from '../../lib/analytics/writer';\n" +
        "export function POST() { void incrementerCompteur({ nom: 'session_debut' }); return new Response(null, { status: 204 }); }\n",
    );
    try {
      let sortie = '';
      try {
        execSync(`npx eslint "app/api/__garde_tmp_route__/route.ts"`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' });
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string };
        sortie = `${err.stdout ?? ''}${err.stderr ?? ''}`;
      }
      // La règle de couplage ne doit PAS se déclencher pour une route (elle ne vise que svv/** + db moteur).
      expect(sortie).not.toMatch(/no-restricted-imports|COUPLAGE INTERDIT/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});

describe('SEUIL k — posé en config (020), branché NULLE PART dans le lot 2', () => {
  it('aucun fichier de code du dépôt (hors tests) ne lit le seuil k-anonymat', () => {
    // Marqueur reconstruit → ce fichier de test ne s'auto-matche pas.
    const marqueur = ['k', 'anonymat'].join('_');
    const trouves: string[] = [];
    function walk(dir: string): void {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name !== 'node_modules' && e.name !== 'dist' && !e.name.startsWith('.')) walk(p);
        } else if (
          (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) &&
          !e.name.includes('.test.') &&
          !e.name.includes('.itest.')
        ) {
          if (fs.readFileSync(p, 'utf8').includes(marqueur)) trouves.push(path.relative(RACINE, p));
        }
      }
    }
    walk(RACINE); // repo ENTIER (hors node_modules/tests) : un futur lecteur de k sous db/, scripts/… serait aussi capté
    // Le seuil ne vit QUE dans db/migrations/020 + le rapport — jamais dans le chemin d'écriture.
    expect(trouves).toEqual([]);
  });
});

describe('INSTRUMENTATION câblée — les points d’émission importent bien le canal isolé', () => {
  it('la route /api/analyse et le beacon /api/mesure importent le writer/l’émission', () => {
    const analyse = fs.readFileSync(path.join(RACINE, 'app/api/analyse/route.ts'), 'utf8');
    expect(analyse).toMatch(/from ["'].*analytics\/(writer|commune|contexte)["']/);
    expect(analyse).toMatch(/after\(/); // émission post-réponse
    const mesure = fs.readFileSync(path.join(RACINE, 'app/api/mesure/route.ts'), 'utf8');
    expect(mesure).toMatch(/from ["'].*analytics\/(writer|session)["']/);
  });
});
