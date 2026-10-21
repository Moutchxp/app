import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cheminRapport, dossierRapports, horodatage, optionLigne, RACINE_PROJET } from './rapportScript';

/** 🔴 Arno (21/10/2026) — un script n'écrit JAMAIS son rapport sur le Bureau ; `--rapport` accepte un dossier. */
const QUAND = new Date(2026, 9, 21, 1, 5);

describe('cheminRapport', () => {
  it('par défaut : `.captures/<nom-du-script>/rapport-<date>.txt` du PROJET', () => {
    const racine = mkdtempSync(join(tmpdir(), 'rapport-'));
    const c = cheminRapport({ nomScript: 'reprendre-digicodes-immeubles', maintenant: QUAND, racine });
    expect(c).toBe(join(racine, '.captures', 'reprendre-digicodes-immeubles', 'rapport-2026-10-21-0105.txt'));
    expect(statSync(join(racine, '.captures', 'reprendre-digicodes-immeubles')).isDirectory()).toBe(true);
    expect(dossierRapports('x')).toBe(join(RACINE_PROJET, '.captures', 'x'));
    expect(readdirSync(RACINE_PROJET)).toContain('package.json');
  });
  it('🔴 `--rapport` = un DOSSIER existant : le fichier est créé DEDANS (plus d’EISDIR)', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'rapport-dossier-'));
    const c = cheminRapport({ nomScript: 's', demande: dossier, maintenant: QUAND });
    expect(c).toBe(join(dossier, 'rapport-2026-10-21-0105.txt'));
    writeFileSync(c, 'ok');
    expect(readFileSync(c, 'utf8')).toBe('ok');
  });
  it('`--rapport` = un dossier à créer (terminé par « / ») ; ou un FICHIER, pris tel quel', () => {
    const base = mkdtempSync(join(tmpdir(), 'rapport-neuf-'));
    expect(cheminRapport({ nomScript: 's', demande: `${base}/sous/`, prefixe: 'audit', extension: 'md', maintenant: QUAND })).toBe(join(base, 'sous', 'audit-2026-10-21-0105.md'));
    expect(statSync(join(base, 'sous')).isDirectory()).toBe(true);
    expect(cheminRapport({ nomScript: 's', demande: join(base, 'a', 'mon-rapport.txt') })).toBe(join(base, 'a', 'mon-rapport.txt'));
  });
  it('l’option de la ligne de commande et l’horodatage', () => {
    expect(optionLigne(['node', 'x', '--reel', '--rapport=/tmp/r'], 'rapport')).toBe('/tmp/r');
    expect(optionLigne(['node', 'x'], 'rapport')).toBeNull();
    expect(horodatage(QUAND)).toBe('2026-10-21-0105');
  });
});

describe('🔴 garde : aucun script n’écrit un RAPPORT sur le Bureau', () => {
  it('AUCUN script n’écrit sur le Bureau — la sauvegarde avant réparation va dans `.captures/sauvegardes/` (Arno, 21/10/2026)', () => {
    const scripts = readdirSync('app/scripts').filter((f) => f.endsWith('.ts') && !/\.(test|itest)\.ts$/.test(f));
    const fautifs = scripts.filter((f) => {
      const src = readFileSync(join('app/scripts', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      return /'Desktop'|~\/Desktop/.test(src);
    });
    expect(fautifs).toEqual([]);
    expect(readFileSync('app/scripts/reparer-mails-contraires-aux-regles.ts', 'utf8')).toContain("cheminRapport({ nomScript: 'sauvegardes', prefixe: 'sauvegarde-avant-reparation-14-mails', extension: 'sql' })");
  });
});
