import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { purgerCacheNext, serveurDevVivant, tailleDossier } from './purgeCacheNext';

/**
 * 🔴 Arno (23/10/2026) — `.next` avait rempli le disque (119 Go). Au lancement de `npm run dev`, au-delà du seuil, SEULS les dossiers
 * de cache sont vidés (jamais sous un serveur vivant), et c'est noté dans `.captures/surveiller-next/`. Projet simulé dans un dossier
 * temporaire, effacé après chaque épreuve.
 */
let racine: string;
const ecrire = (chemin: string, octets: number) => { mkdirSync(join(racine, chemin, '..'), { recursive: true }); writeFileSync(join(racine, chemin), Buffer.alloc(octets)); };
beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'purge-next-'));
  ecrire('.next/dev/cache/turbopack/a.sst', 6000);
  ecrire('.next/cache/webpack/b.pack', 3000);
  ecrire('.next/dev/server/app/page.js', 500);
});
afterEach(() => { rmSync(racine, { recursive: true, force: true }); });
const notes = () => (existsSync(join(racine, '.captures/surveiller-next')) ? readdirSync(join(racine, '.captures/surveiller-next')) : []);
const MORT = () => false;

describe('🔴 la purge du cache .next au lancement', () => {
  it('sous le seuil : rien n’est touché, rien n’est noté', () => {
    const r = purgerCacheNext({ racine, seuil: 20_000, vivant: MORT });
    expect(r).toMatchObject({ geste: 'sous-le-seuil', avant: 9500, apres: 9500, vides: [], rapport: null });
    expect(existsSync(join(racine, '.next/dev/cache/turbopack/a.sst'))).toBe(true);
    expect(notes()).toEqual([]);
  });

  it('au-delà : SEULS les caches sont vidés (le reste de .next reste) ; la note dit la date, la taille avant / après', () => {
    const r = purgerCacheNext({ racine, seuil: 5000, vivant: MORT, maintenant: new Date('2026-10-23T15:00:00Z') });
    expect(r).toMatchObject({ geste: 'vide', avant: 9500, apres: 500, vides: ['.next/cache', '.next/dev/cache'] });
    expect(existsSync(join(racine, '.next/dev/cache'))).toBe(false);
    expect(existsSync(join(racine, '.next/cache'))).toBe(false);
    expect(existsSync(join(racine, '.next/dev/server/app/page.js'))).toBe(true);
    expect(notes()).toHaveLength(1);
    expect(r.rapport).toBe(join(racine, '.captures/surveiller-next/purge-cache-2026-10-23-170000.txt'));
    expect(readFileSync(r.rapport!, 'utf8')).toBe('23/10/2026 17:00:00 — .next : 0 Mo avant, 0 Mo après (seuil 0 Mo).\nVidé : .next/cache, .next/dev/cache.\n');
  });

  it('jamais sous un serveur next dev vivant : rien n’est vidé, la note le dit ; un verrou périmé n’empêche rien', () => {
    writeFileSync(join(racine, '.next/dev/lock'), JSON.stringify({ pid: 4242, port: 3000 }));
    const r = purgerCacheNext({ racine, seuil: 5000, vivant: (pid) => pid === 4242 });
    expect(r).toMatchObject({ geste: 'differe', vides: [], serveur: { pid: 4242, port: 3000 } });
    expect(existsSync(join(racine, '.next/dev/cache/turbopack/a.sst'))).toBe(true);
    expect(readFileSync(r.rapport!, 'utf8')).toContain('NON vidé, un serveur next dev est en marche (pid 4242, port 3000)');
    expect(serveurDevVivant(racine, MORT)).toBeNull();
    expect(purgerCacheNext({ racine, seuil: 5000, vivant: MORT }).geste).toBe('vide');
  });

  it('la taille ne suit pas les liens symboliques (.next/dev/node_modules en porte)', () => {
    const ailleurs = mkdtempSync(join(tmpdir(), 'purge-next-ailleurs-'));
    writeFileSync(join(ailleurs, 'gros'), Buffer.alloc(50_000));
    symlinkSync(ailleurs, join(racine, '.next/dev/lien'));
    expect(tailleDossier(join(racine, '.next'))).toBe(9500);
    rmSync(ailleurs, { recursive: true, force: true });
  });

  it('npm run dev la lance avant de démarrer (predev), et jamais au-delà de ce qui est permis', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.predev).toBe('tsx app/scripts/purger-cache-next.ts');
    expect(pkg.scripts['predev:https']).toBe('tsx app/scripts/purger-cache-next.ts');
  });
});
