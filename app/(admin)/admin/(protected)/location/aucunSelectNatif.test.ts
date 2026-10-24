import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * 🔴 Arno (24/10/2026) — PLUS AUCUN <select> NATIF DANS LES ÉCRANS LOCATION : les listes sont la ListeChoix verte (menu juste sous le
 * champ). Ce garde lit chaque composant du dossier Location (tests exclus) et refuse une balise <select> réintroduite. Les composants
 * PARTAGÉS avec la Gestion (hors de ce dossier) ne sont pas concernés.
 */
const DOSSIER = path.join(process.cwd(), 'app/(admin)/admin/(protected)/location');
const fichiers = (d: string): string[] => readdirSync(d).flatMap((f) => {
  const p = path.join(d, f);
  return statSync(p).isDirectory() ? fichiers(p) : /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) ? [p] : [];
});

describe('🔴 aucune liste déroulante native en Location', () => {
  it('aucun composant du dossier Location ne rend de <select>', () => {
    const fautifs = fichiers(DOSSIER).filter((f) => /<select[\s>]/.test(readFileSync(f, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '')));
    expect(fautifs.map((f) => path.relative(DOSSIER, f))).toEqual([]);
  });
  it('« Trier par » de l’annuaire : la liste VERTE (sans teinte rouge)', () => {
    const src = readFileSync(path.join(DOSSIER, 'OngletsSuivi.tsx'), 'utf8');
    const i = src.indexOf('<span>Trier par</span>');
    expect(i).toBeGreaterThan(0);
    const bloc = src.slice(i, src.indexOf('</label>', i));
    expect(bloc).toContain('<ListeChoix');
    expect(bloc).not.toContain("teinte=\"rouge\"");
  });
});
