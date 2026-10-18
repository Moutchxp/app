import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴 CORRECTIF DU 19/10/2026 — « Hydration failed » sur toute fiche commune qui monte `Annuaire`. Un commentaire de la feuille
 * de style `CSS_PIECES` (`PiecesJointes.tsx`) contenait la balise style LITTÉRALE : rendue dans une balise style, React
 * l'échappe côté serveur (`<\73 tyle>`) mais pas côté client — les deux textes diffèrent, l'arbre est régénéré. Cette épreuve
 * échoue si un commentaire du fichier contient de nouveau une balise style ou script littérale.
 */
const SOURCE = readFileSync('app/(admin)/admin/(protected)/gestion/PiecesJointes.tsx', 'utf8');
const BALISE = /<\/?\s*(?:style|script)\b/i;

/** Les commentaires du fichier : blocs (y compris ceux écrits DANS une feuille de style en gabarit) et lignes. */
function commentaires(src: string): string[] {
  return [...src.matchAll(/\/\*[\s\S]*?\*\//g), ...src.matchAll(/(?:^|[^:'"`\\])\/\/[^\n]*/g)].map((m) => m[0]);
}

describe('PiecesJointes.tsx : aucun commentaire ne contient une balise style ou script littérale', () => {
  it('les commentaires sont bien lus', () => {
    expect(commentaires(SOURCE).length).toBeGreaterThan(10);
  });
  it('aucune balise style / script littérale dans un commentaire', () => {
    expect(commentaires(SOURCE).filter((c) => BALISE.test(c))).toEqual([]);
  });
  it('le détecteur attrape bien le cas qui a cassé l’hydratation', () => {
    const fautif = '/* la fenêtre porte le sien, dans son propre <style>. */\n// un <script> ici\n/* et </Style> */';
    expect(commentaires(fautif).filter((c) => BALISE.test(c))).toHaveLength(3);
  });
});
