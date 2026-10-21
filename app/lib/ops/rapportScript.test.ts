import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cheminRapport, dossierRapports, horodatage, optionLigne, RACINE_PROJET } from './rapportScript';

/** 🔴 Arno (21/10/2026) — un script n'écrit JAMAIS son rapport sur le Bureau ; `--rapport` accepte un dossier. */
const QUAND = new Date(2026, 9, 21, 1, 5, 7);

describe('cheminRapport', () => {
  it('par défaut : `.captures/<nom-du-script>/rapport-<date>.txt` du PROJET', () => {
    const racine = mkdtempSync(join(tmpdir(), 'rapport-'));
    const c = cheminRapport({ nomScript: 'reprendre-digicodes-immeubles', maintenant: QUAND, racine });
    expect(c).toBe(join(racine, '.captures', 'reprendre-digicodes-immeubles', 'rapport-2026-10-21-010507.txt'));
    expect(statSync(join(racine, '.captures', 'reprendre-digicodes-immeubles')).isDirectory()).toBe(true);
    expect(dossierRapports('x')).toBe(join(RACINE_PROJET, '.captures', 'x'));
    expect(readdirSync(RACINE_PROJET)).toContain('package.json');
  });
  it('🔴 `--rapport` = un DOSSIER existant : le fichier est créé dans SON sous-dossier de script (plus d’EISDIR)', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'rapport-dossier-'));
    const c = cheminRapport({ nomScript: 's', demande: dossier, maintenant: QUAND });
    expect(c).toBe(join(dossier, 's', 'rapport-2026-10-21-010507.txt'));
    writeFileSync(c, 'ok');
    expect(readFileSync(c, 'utf8')).toBe('ok');
  });
  it('`--rapport` = un dossier à créer (terminé par « / ») ; ou un FICHIER, pris tel quel', () => {
    const base = mkdtempSync(join(tmpdir(), 'rapport-neuf-'));
    expect(cheminRapport({ nomScript: 's', demande: `${base}/sous/`, prefixe: 'audit', extension: 'md', maintenant: QUAND })).toBe(join(base, 'sous', 's', 'audit-2026-10-21-010507.md'));
    expect(statSync(join(base, 'sous', 's')).isDirectory()).toBe(true);
    // un dossier qui porte déjà le nom du script n'est pas redoublé
    expect(cheminRapport({ nomScript: 's', demande: `${base}/s/`, maintenant: QUAND })).toBe(join(base, 's', 'rapport-2026-10-21-010507.txt'));
    expect(cheminRapport({ nomScript: 's', demande: join(base, 'a', 'mon-rapport.txt') })).toBe(join(base, 'a', 'mon-rapport.txt'));
  });
  it('l’option de la ligne de commande et l’horodatage', () => {
    expect(optionLigne(['node', 'x', '--reel', '--rapport=/tmp/r'], 'rapport')).toBe('/tmp/r');
    expect(optionLigne(['node', 'x'], 'rapport')).toBeNull();
    expect(horodatage(QUAND)).toBe('2026-10-21-010507');
  });
});

describe('🔴 Arno (22/10/2026) — aucun rapport n’en écrase un autre', () => {
  it('deux scripts, la même seconde, le même dossier `rapports/` : deux sous-dossiers, deux fichiers', () => {
    const rapports = mkdtempSync(join(tmpdir(), 'rapports-'));
    const a = cheminRapport({ nomScript: 'ranger-dossiers-statut', demande: `${rapports}/`, maintenant: QUAND });
    const b = cheminRapport({ nomScript: 'archiver-fins-gestion', demande: `${rapports}/`, maintenant: QUAND });
    expect(a).toBe(join(rapports, 'ranger-dossiers-statut', 'rapport-2026-10-21-010507.txt'));
    expect(b).toBe(join(rapports, 'archiver-fins-gestion', 'rapport-2026-10-21-010507.txt'));
  });
  it('le même script deux fois la même seconde : « -2 », « -3 » — le premier fichier reste intact', () => {
    const racine = mkdtempSync(join(tmpdir(), 'rapport-meme-seconde-'));
    const premier = cheminRapport({ nomScript: 'x', maintenant: QUAND, racine });
    writeFileSync(premier, 'premier');
    const second = cheminRapport({ nomScript: 'x', maintenant: QUAND, racine });
    expect(second).toBe(premier.replace(/\.txt$/, '-2.txt'));
    writeFileSync(second, 'second');
    expect(cheminRapport({ nomScript: 'x', maintenant: QUAND, racine })).toBe(premier.replace(/\.txt$/, '-3.txt'));
    expect(readFileSync(premier, 'utf8')).toBe('premier');
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
