import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 THÈME SOMBRE ILLISIBLE DANS LA TUILE LOCATION (constat d'Arno, 17/10/2026, /admin/location/honoraires) : le tableau
 * gardait un fond BLANC écrit en dur pendant que le texte passait en gris clair — blanc sur blanc. La règle : AUCUNE
 * couleur écrite en dur dans les composants de la Location ; uniquement les variables du thème (`--color-svv-*`), les
 * mêmes que la Gestion, qui basculent en Clair, Sombre et Système. Pas non plus de valeur de secours en dur dans un
 * `var(--x, #fff)` : c'est exactement ce secours blanc qui s'affiche quand on se trompe de variable.
 */
const RACINE = 'app/(admin)/admin/(protected)/location';

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) return fichiers(p);
    return /\.(tsx|ts)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

const COULEURS_NOMMEES = ['white', 'black', 'red', 'green', 'blue', 'gray', 'grey', 'orange', 'purple', 'yellow', 'silver'];

/** Les couleurs écrites en dur d'un source : hexadécimal, rgb()/rgba()/hsl(), nom de couleur en valeur CSS, secours de var(). */
function couleursEnDur(source: string): string[] {
  const trouvees: string[] = [];
  for (const m of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    // Un « #12 » dans un texte français (n° de cave) n'est pas une couleur : on n'en retient que les formes CSS (3, 4, 6, 8).
    if ([4, 5, 7, 9].includes(m[0].length)) trouvees.push(m[0]);
  }
  for (const m of source.matchAll(/\b(rgba?|hsla?)\s*\(/g)) trouvees.push(m[0]);
  for (const m of source.matchAll(new RegExp(`(?:color|background|border(?:-[a-z]+)?|fill|stroke|outline)\\s*:\\s*(${COULEURS_NOMMEES.join('|')})\\b`, 'g'))) trouvees.push(m[0]);
  for (const m of source.matchAll(/var\(\s*--[a-z0-9-]+\s*,[^)]*\)/g)) trouvees.push(m[0]);
  return trouvees;
}

describe('🔴 tuile Location : aucune couleur écrite en dur (thèmes Clair / Sombre / Système)', () => {
  const liste = fichiers(RACINE);
  it('les composants sont bien trouvés', () => {
    expect(liste.length).toBeGreaterThanOrEqual(8);
  });
  it.each(liste)('%s', (f) => {
    expect(couleursEnDur(readFileSync(f, 'utf8')), f).toEqual([]);
  });
  it('le détecteur attrape bien ce qu’il doit (et pas « white-space » ni « n° 12 »)', () => {
    expect(couleursEnDur('.a{background:#fff}.b{color:rgba(0,0,0,.5)}.c{color: white}.d{border:1px solid var(--x,#d5d8de)}'))
      .toEqual(['#fff', '#d5d8de', 'rgba(', 'color: white', 'var(--x,#d5d8de)']);
    expect(couleursEnDur('.e{white-space:nowrap} Cave n° 12 · lot #27')).toEqual([]);
  });
});
