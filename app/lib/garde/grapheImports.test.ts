import { describe, it, expect } from 'vitest';
import {
  violationsServerOnly, cheminVersServerOnly, importeursNonAutorises,
  messageViolationsServerOnly, messageImporteursNonAutorises, estFichierTest,
  type GrapheImports,
} from './grapheImports';

/**
 * F2 — tests PURS de la détection, sur données FABRIQUÉES (aucun esbuild, aucune I/O). Le cas central reproduit la chaîne du
 * commit 0d57224 : c'est la preuve que le garde-fou MORDRAIT vraiment, sans casser le dépôt exprès.
 */
describe('F2/A — violationsServerOnly (détection pure)', () => {
  // La chaîne EXACTE de 0d57224 : veille-run → executerVeille → propositionAuto → jetonRectification (server-only).
  const graphe0d57224: GrapheImports = {
    'app/scripts/veille-run.ts': ['app/lib/sitadel/executerVeille.ts', 'app/lib/db/client.ts'],
    'app/lib/sitadel/executerVeille.ts': ['app/lib/veille/propositionAuto.ts'],
    'app/lib/veille/propositionAuto.ts': ['app/lib/internaute/jetonRectification.ts'],
    'app/lib/internaute/jetonRectification.ts': [], // jose est externe → pas dans le graphe interne
    'app/lib/db/client.ts': [],
  };
  const vrais = new Set(['app/lib/internaute/jetonRectification.ts']);

  it('reproduit 0d57224 : une violation, avec le chemin d’import COMPLET', () => {
    const v = violationsServerOnly(graphe0d57224, ['app/scripts/veille-run.ts'], vrais);
    expect(v).toHaveLength(1);
    expect(v[0].script).toBe('app/scripts/veille-run.ts');
    expect(v[0].moduleFautif).toBe('app/lib/internaute/jetonRectification.ts');
    expect(v[0].chemin).toEqual([
      'app/scripts/veille-run.ts',
      'app/lib/sitadel/executerVeille.ts',
      'app/lib/veille/propositionAuto.ts',
      'app/lib/internaute/jetonRectification.ts',
    ]);
  });

  it('état APRÈS F1 (propositionAuto → jetonCada, sans server-only) : aucune violation', () => {
    const grapheF1: GrapheImports = {
      ...graphe0d57224,
      'app/lib/veille/propositionAuto.ts': ['app/lib/internaute/jetonCada.ts'],
      'app/lib/internaute/jetonCada.ts': [], // pas de server-only
    };
    expect(violationsServerOnly(grapheF1, ['app/scripts/veille-run.ts'], vrais)).toEqual([]);
  });

  it('un script qui importe DIRECTEMENT server-only → violation de chemin [script]', () => {
    const g: GrapheImports = { 'app/scripts/x.ts': [] };
    const v = violationsServerOnly(g, ['app/scripts/x.ts'], new Set(['app/scripts/x.ts']));
    expect(v).toHaveLength(1);
    expect(v[0].chemin).toEqual(['app/scripts/x.ts']);
  });

  it('BFS = plus court chemin quand plusieurs routes mènent au module fautif', () => {
    const g: GrapheImports = {
      'app/scripts/s.ts': ['app/a.ts', 'app/court.ts'],
      'app/a.ts': ['app/b.ts'],
      'app/b.ts': ['app/so.ts'],
      'app/court.ts': ['app/so.ts'],
      'app/so.ts': [],
    };
    const chemin = cheminVersServerOnly(g, 'app/scripts/s.ts', new Set(['app/so.ts']));
    expect(chemin).toEqual(['app/scripts/s.ts', 'app/court.ts', 'app/so.ts']);
  });

  it('graphe sain (aucun vrai importeur atteignable) → []', () => {
    const g: GrapheImports = { 'app/scripts/s.ts': ['app/pur.ts'], 'app/pur.ts': [] };
    expect(violationsServerOnly(g, ['app/scripts/s.ts'], new Set(['app/ailleurs.ts']))).toEqual([]);
  });

  it('le message d’échec nomme script, module, chemin complet et dit quoi faire', () => {
    const v = violationsServerOnly(graphe0d57224, ['app/scripts/veille-run.ts'], vrais);
    const msg = messageViolationsServerOnly(v);
    expect(msg).toContain('app/scripts/veille-run.ts');
    expect(msg).toContain('app/lib/internaute/jetonRectification.ts');
    expect(msg).toContain('veille-run.ts → app/lib/sitadel/executerVeille.ts → app/lib/veille/propositionAuto.ts → app/lib/internaute/jetonRectification.ts');
    expect(msg).toContain('server-only'); // explique la cause
    expect(msg).toMatch(/extraire/i);     // dit quoi faire (motif F1)
    expect(msg).toMatch(/NE JAMAIS/);     // dit quoi ne pas faire
  });
});

describe('F2/B — importeursNonAutorises (liste blanche pure)', () => {
  const autorises = ['app/lib/veille/propositionAuto.ts', 'app/lib/internaute/jetonRectification.ts'];

  it('les importeurs attendus + les fichiers de test passent ; un importeur inconnu échoue', () => {
    const constate = [
      'app/lib/veille/propositionAuto.ts',        // autorisé
      'app/lib/internaute/jetonRectification.ts', // autorisé
      'app/lib/internaute/jetonCada.test.ts',     // test → toléré
      'app/espace/ClientTruc.tsx',                // ✗ intrus (composant client)
    ];
    expect(importeursNonAutorises(constate, autorises)).toEqual(['app/espace/ClientTruc.tsx']);
  });

  it('estFichierTest reconnaît .test.ts et .test.tsx', () => {
    expect(estFichierTest('app/x.test.ts')).toBe(true);
    expect(estFichierTest('app/x.test.tsx')).toBe(true);
    expect(estFichierTest('app/x.ts')).toBe(false);
  });

  it('le message (B) nomme les intrus, la liste attendue et dit quoi faire', () => {
    const msg = messageImporteursNonAutorises('app/lib/internaute/jetonCada.ts', ['app/espace/ClientTruc.tsx'], autorises);
    expect(msg).toContain('app/espace/ClientTruc.tsx');
    expect(msg).toContain('app/lib/veille/propositionAuto.ts');
    expect(msg).toMatch(/liste blanche|autoris/i);
  });
});
