import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cumuler } from './cumul';

/**
 * 🔴 MON ESPACE, LOT 8 — LE CUMUL EXTRAIT, PROUVÉ IDENTIQUE AU CENTIME. Le calcul était recopié dans cinq écrans du Suivi CA ; il vit dans `cumul.ts`.
 *   ① l'ANCIENNE expression (gardée ici, mot pour mot) et la fonction partagée rendent EXACTEMENT les mêmes nombres (Object.is, élément par
 *      élément) sur des séries de centimes, d'euros à virgule, négatives, vides, avec NaN — les mêmes additions dans le même ordre ;
 *   ② les cinq écrans utilisent la fonction partagée et n'ont plus de copie locale (une copie qui divergerait serait une deuxième vérité) ;
 *   ③ les montants affichés par chaque écran, mode et unité restent éprouvés par leurs tests existants (EcransTransaction, EcranLocationCA,
 *      EcranFusionLG, OngletCompromis : CRITERIMMO, MACJ, FUSION, Location, Gestion, FUSION Location & Gestion, CA global ; Mois, Période,
 *      Année ; HT et TTC), inchangés et verts.
 */
const ancienCumuler = (xs: readonly number[]): number[] => xs.reduce<number[]>((t, x) => [...t, (t.at(-1) ?? 0) + x], []);

/** Un générateur déterministe (graine fixe) : les mêmes séries à chaque exécution. */
function series(): number[][] {
  let g = 20261102;
  const hasard = (): number => { g = (g * 1103515245 + 12345) % 2147483648; return g / 2147483648; };
  const out: number[][] = [[], [0], [-0], [Number.NaN, 1], [0.1, 0.2, 0.3], [1e15, 1, -1e15], [-50, 25.25, 1999.99]];
  for (let k = 0; k < 2000; k++) {
    const n = Math.floor(hasard() * 14);
    const centimes = hasard() < 0.5;
    out.push(Array.from({ length: n }, () => { const x = (hasard() - 0.3) * 5_000_000; return centimes ? Math.round(x) : Math.round(x) / 100; }));
  }
  return out;
}

describe('🔴 le cumul partagé = l’ancien, au centime', () => {
  it('① mêmes nombres, élément par élément (Object.is), sur 2 007 séries', () => {
    for (const xs of series()) {
      const a = ancienCumuler(xs);
      const b = cumuler(xs);
      expect(b.length).toBe(a.length);
      a.forEach((x, i) => expect(Object.is(b[i], x), `${JSON.stringify(xs)} [${i}]`).toBe(true));
    }
  });
  it('② les cinq écrans du Suivi CA importent la fonction partagée et n’en ont plus de copie', () => {
    const T = 'app/(admin)/admin/(protected)/transaction/';
    for (const f of ['EcransTransaction.tsx', 'GrapheGlobal.tsx', 'GrapheNegociateurs.tsx', 'EcranLocationCA.tsx', 'EcranFusionLG.tsx']) {
      const src = readFileSync(T + f, 'utf8');
      expect(src, f).toContain("import { cumuler } from '../../../../lib/transaction/cumul';");
      expect(src, f).not.toMatch(/const cumuler\s*=/);
      expect(src, f).not.toContain('(t.at(-1) ?? 0) + x');
    }
  });
});
