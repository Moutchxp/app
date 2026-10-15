import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * AUDIT POINT A (décision d'Arno du 15/10/2026) — la voie de secours web est retirée ; la SEULE corde de rappel est
 * `npm run admin:secours` sur le serveur. Ce test prouve qu'elle ne dépend d'AUCUNE route web : la commande passe par
 * `secours()` (comptes.ts, une écriture en base, éprouvée dans comptes.test.ts), et le script n'importe que la couche
 * comptes / base — jamais la route de connexion ni quoi que ce soit sous `app/(admin)`. (Le garde de graphe
 * `serverOnly.guard.test.ts` interdit en outre à tout script d'atteindre un module `server-only`, ce qu'est la route.)
 */
const script = readFileSync('app/scripts/admin.ts', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

describe('admin:secours — la corde de rappel, sans la route web', () => {
  it('l’entrée npm existe et lance la sous-commande secours du script', () => {
    expect(pkg.scripts['admin:secours']).toBe('tsx app/scripts/admin.ts secours');
    expect(script).toMatch(/case 'secours': \{[\s\S]*?await secours\(identifiant, mdp\)/);
  });

  it('le script n’importe que la couche comptes / base : aucune route, rien de app/(admin), rien de next/', () => {
    const imports = [...script.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const i of imports) {
      expect(i).not.toMatch(/\(admin\)|\/route$|^next\//);
    }
    expect(imports).toContain('../lib/admin/comptes');
  });

  it('la voie navigateur et son outil sont bien retirés : plus de secours-hash, ni dans le script ni dans package.json', () => {
    expect(script).not.toContain("case 'secours-hash'");
    expect(pkg.scripts['admin:secours-hash']).toBeUndefined();
  });

  it('la procédure est documentée là où Arno la cherchera', () => {
    const doc = readFileSync('docs/BASCULE_CHECKLIST.md', 'utf8');
    expect(doc).toContain('## 7. Si je ne peux plus me connecter');
    expect(doc).toContain('npm run admin:secours -- --identifiant');
  });
});
