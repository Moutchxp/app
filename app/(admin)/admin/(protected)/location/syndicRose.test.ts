import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 « Toute suggestion ou mention de syndic dans la tuile Location (formulaire et modale) doit utiliser exactement le ROSE
 * transparent associé au syndic dans le module Gestion (même variable de thème), lisible en Clair et Sombre. Plus aucun
 * bleu pour le syndic. » (Arno, 17/10/2026) — Toute règle CSS dont le sélecteur nomme le syndic (`syndic`, `syl-`) dans les
 * composants de la Location et dans la variante « location » de la modale : jamais de variable `blue`.
 */
const LOCATION = 'app/(admin)/admin/(protected)/location';
const MODALE = 'app/(admin)/admin/(protected)/gestion/SyndicConnuLocation.tsx';

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    if (statSync(p).isDirectory()) return fichiers(p);
    return /\.(tsx|ts)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Les règles CSS (sélecteur{déclarations}) d'un source dont le sélecteur parle du syndic. */
function reglesSyndic(source: string): string[] {
  return [...source.matchAll(/([^{}\n]+)\{([^{}]*)\}/g)].filter((m) => /syndic|\.syl-/.test(m[1])).map((m) => `${m[1].trim()}{${m[2]}}`);
}

describe('🔴 tuile Location : le syndic en ROSE (variables de la Gestion), plus aucun bleu', () => {
  const sources = [...fichiers(LOCATION), MODALE].map((p) => ({ p, regles: reglesSyndic(readFileSync(p, 'utf8')) }));
  it('aucune règle du syndic n’emploie le bleu', () => {
    const fautes = sources.flatMap(({ p, regles }) => regles.filter((r) => /blue/i.test(r)).map((r) => `${p}: ${r}`));
    expect(fautes).toEqual([]);
  });
  it('le syndic choisi, la pastille de l’accueil et le détail de la modale portent le rose du syndic', () => {
    const toutes = sources.flatMap((s) => s.regles).join('\n');
    for (const sel of ['.loc-syndic-choisi{', '.loc-res-type--syndics{', '.syl-bloc-titre{']) {
      const r = toutes.split('\n').find((x) => x.startsWith(sel));
      expect(r, sel).toBeDefined();
      expect(r, sel).toContain('var(--color-svv-syndic-');
    }
  });
});
