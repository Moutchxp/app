import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * PART-2b — GARDE-FOU d'unicité des clés React des enfants de `renderDetail` (fiche « Analyse et projection »).
 *
 * ⚠️ HONNÊTETÉ : ce dépôt n'a AUCUNE infra de rendu DOM (ni jsdom ni testing-library) — on ne peut pas monter le composant pour
 * observer l'avertissement React « two children with the same key ». Ce test fait donc ce qui est RÉELLEMENT vérifiable en node
 * pur : il SCANNE LE SOURCE de ProjectionVue.tsx, extrait toutes les clés `key={…}` explicites, et prouve qu'elles sont DISTINCTES.
 * C'est exactement le défaut corrigé (BlocCompletude et CaracteristiquesBloc partageaient `${ouvert}-${vAnalyse}`), et ce garde-fou
 * le fait revenir en ROUGE s'il réapparaît. Il ne prouve PAS le rendu — seulement l'absence de clés en collision dans la source.
 */
const SRC = readFileSync(fileURLToPath(new URL('./ProjectionVue.tsx', import.meta.url)), 'utf8');

/** Extrait le contenu de chaque `key={…}` (gère les template literals `…${x}…` dont les accolades internes ne ferment pas la clé). */
function clesExplicites(source: string): string[] {
  const cles: string[] = [];
  for (const m of source.matchAll(/key=\{(`[^`]*`|[^}]*)\}/g)) cles.push(m[1].trim());
  return cles;
}

describe('PART-2b — clés React de la fiche « Analyse et projection »', () => {
  it('chaque enfant de renderDetail a une clé DISTINCTE (aucune collision)', () => {
    const cles = clesExplicites(SRC);
    expect(cles.length).toBeGreaterThanOrEqual(3); // au moins complétude + caractéristiques + pièces
    expect(new Set(cles).size).toBe(cles.length);  // toutes distinctes
  });

  it('les frères remontés sur (ouvert, vAnalyse) sont préfixés par leur rôle → jamais la clé nue « ${ouvert}-${vAnalyse} »', () => {
    const cles = clesExplicites(SRC);
    // La clé nue partagée (le défaut) ne doit plus exister ; chaque occurrence de vAnalyse est préfixée.
    expect(cles).not.toContain('`${ouvert}-${vAnalyse}`');
    expect(cles.filter((c) => c.includes('vAnalyse')).every((c) => /^`[a-z]+-/.test(c))).toBe(true);
  });
});
