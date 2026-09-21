import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyser, type EntreeComplete } from './analyse';
import type { ProfilDegagement } from './profilDegagement';

/**
 * GARDE GOLDEN RAPIDE — SANS BASE (item G2 de l'audit du 21/09, docs/AUDIT_2026-09-21_diagnostic_code_et_dette.md).
 *
 * Le golden de non-régression (note Couche 1 = 29.107259068449615) était scellé UNIQUEMENT dans
 * app/lib/db/pipeline.itest.ts, qui exige une base PostGIS et tourne HORS du `npm test` quotidien (suite
 * d'intégration `test:integration`). Une modif du moteur de score pouvait donc décaler la note certifiée sans
 * que `npm test` (vert) ne le voie. Ce garde COMPLÉMENTAIRE rejoue la note en PUR : entrée FIGÉE (fixture
 * capturée une fois du cas Asnières) → `analyser(entree, profil)` (fonction pure, AUCUNE I/O) → égalité STRICTE.
 *
 * ⚠️ On AJOUTE un garde, on n'en RETIRE aucun : le `.itest.ts` géométrique complet reste la référence sur la
 * chaîne DB/LiDAR ; ici on verrouille la MATH de score au quotidien. La fixture (entree + profil gelé) est un
 * snapshot des rasters LiDAR locaux, comme le `.itest` — à RECAPTURER volontairement si le golden est rescellé
 * (jamais pour « faire passer » ce test : un écart = ALERTE de régression, pas un ajustement).
 */
const GOLDEN = 29.107259068449615; // identique à pipeline.itest.ts (NON modifié) — la valeur scellée, en dur ici aussi.

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./__fixtures__/asnieres-golden.json', import.meta.url)), 'utf8'),
) as { golden: number; entree: EntreeComplete; profil: ProfilDegagement };

describe('Garde golden Couche 1 (pur, sans base) — cas Asnières', () => {
  it('analyser(entree figée, profil gelé).score.total vaut EXACTEMENT 29.107259068449615 (égalité stricte, aucune tolérance)', () => {
    const score = analyser(fixture.entree, fixture.profil).score.total;
    expect(score).toBe(GOLDEN);          // égalité STRICTE (toBe), pas toBeCloseTo : aucun arrondi, aucune tolérance.
    expect(score).toBe(fixture.golden);  // cohérence : la fixture porte aussi la valeur scellée.
  });
});
