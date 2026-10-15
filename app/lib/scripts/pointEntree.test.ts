import { mkdtempSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { estPointEntree } from './pointEntree';

describe('estPointEntree', () => {
  const racine = mkdtempSync(path.join(tmpdir(), 'point-entree-'));
  mkdirSync(path.join(racine, 'app'));
  const script = path.join(racine, 'app', 'script.ts');
  writeFileSync(script, '');
  writeFileSync(path.join(racine, 'app', 'autre.ts'), '');
  symlinkSync(path.join(racine, 'app'), path.join(racine, 'current'));
  const url = pathToFileURL(script).href;
  afterAll(() => rmSync(racine, { recursive: true, force: true }));

  it('lancé par son chemin réel → oui', () => {
    expect(estPointEntree(url, script)).toBe(true);
  });
  it('lancé par un dossier en lien symbolique (current → app) → oui — la garde historique disait non', () => {
    const parLeLien = path.join(racine, 'current', 'script.ts');
    expect(url === pathToFileURL(parLeLien).href).toBe(false); // ce que faisait l'ancienne garde
    expect(estPointEntree(url, parLeLien)).toBe(true);
  });
  it('un autre script lancé (le module est seulement importé) → non', () => {
    expect(estPointEntree(url, path.join(racine, 'current', 'autre.ts'))).toBe(false);
  });
  it('argv[1] absent ou introuvable → non', () => {
    expect(estPointEntree(url, undefined)).toBe(false);
    expect(estPointEntree(url, path.join(racine, 'inexistant.ts'))).toBe(false);
  });
});

describe('les scripts de app/scripts', () => {
  it('n’utilisent plus la garde historique sensible aux liens', () => {
    const dossier = path.join(process.cwd(), 'app/scripts');
    const fautifs = readdirSync(dossier).filter((n) => n.endsWith('.ts'))
      .filter((n) => /pathToFileURL\(process\.argv\[1\]\)/.test(readFileSync(path.join(dossier, n), 'utf8')));
    expect(fautifs).toEqual([]);
  });
});
