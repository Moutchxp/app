import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 🔑 LOT 33 — GARDE : « Basculer une commune de rail » (BasculeRail) est un OUTIL DE PRÉPARATION → réservé à l'onglet « À demander ».
 * Il ne doit PAS être MONTÉ dans « En cours » / « Réponses » (pas de requête, aucune action déclenchable) — pas simplement masqué.
 * En revanche, le commutateur e-mail/téléservice ET son 3e groupe « Hors process » RESTENT sur les trois onglets (inchangés).
 * Ce test lit la source de PermisTuile (comme archivesGlobal.test.ts) car le rendu par onglet n'est pas unitairement montable ici.
 */
const RACINE = process.cwd();
const src = readFileSync(join(RACINE, 'app/(admin)/admin/(protected)/permis/PermisTuile.tsx'), 'utf8');
const compact = src.replace(/\s+/g, ' ');

describe('LOT 33 — BasculeRail réservé à « À demander »', () => {
  it('BasculeRail n’est monté que si onglet === "a_demander" (jamais dans En cours / Réponses)', () => {
    // Le rendu de <BasculeRail …/> est GARDÉ par l'onglet « à demander » (montage conditionnel, pas un display:none).
    expect(compact).toMatch(/onglet === 'a_demander' && <BasculeRail\b/);
  });

  it('le commutateur de process (e-mail/téléservice + « Hors process ») RESTE sur les 3 onglets Demandes', () => {
    // CommutateurProcess demeure sous la garde ONGLETS_DEMANDES (les 3 onglets), NON restreint à « à demander ».
    expect(compact).toMatch(/ONGLETS_DEMANDES\.includes\(onglet\) && \( <> <CommutateurProcess\b/);
    expect(compact).not.toMatch(/onglet === 'a_demander' && <CommutateurProcess\b/); // le commutateur n'est PAS restreint à À demander
  });

  it('ONGLETS_DEMANDES couvre bien les trois onglets Demandes (le commutateur les coiffe tous)', () => {
    const ligne = src.match(/ONGLETS_DEMANDES[^\n]*=\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(ligne).toContain('a_demander');
    expect(ligne).toContain('en_cours');
    expect(ligne).toContain('reponses');
  });
});
