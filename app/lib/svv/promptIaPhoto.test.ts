import { describe, it, expect } from 'vitest';
import { construirePromptIaPhoto } from './promptIaPhoto';
import type { MonumentCandidatGeo } from './preparateurPaysage';

function cand(id: MonumentCandidatGeo['id'], ecartDeg: number): MonumentCandidatGeo {
  return { id, distanceM: 1000, courbe: 'AUTRES', ecartDeg };
}

describe('construirePromptIaPhoto', () => {
  it('liste 2 candidats avec noms lisibles + positions, sans repère {{...}}', () => {
    const p = construirePromptIaPhoto(90, [cand('EIFFEL', -10), cand('LOUVRE', 50)]);
    expect(p).toContain('Tour Eiffel');
    expect(p).toContain('Louvre (Pyramide)');
    expect(p).toContain("(id: EIFFEL) : dans l'axe");
    expect(p).toContain('(id: LOUVRE) : nettement à droite');
    expect(p).not.toContain('{{');
    expect(p).not.toContain('}}');
  });

  it('sans candidat : message dédié + aucun repère restant', () => {
    const p = construirePromptIaPhoto(0, []);
    expect(p).toContain('(aucun monument candidat sur cet axe)');
    expect(p).not.toContain('{{');
    expect(p).not.toContain('}}');
  });

  it("injecte l'orientation cardinale (azimut 225 → sud-ouest)", () => {
    const p = construirePromptIaPhoto(225, []);
    expect(p).toContain("vers le sud-ouest, champ de -60° à +60° autour de l'axe");
  });

  it("rend les 5 libellés de position selon l'écart signé", () => {
    const cas: Array<[number, string]> = [
      [-50, 'nettement à gauche'],
      [-25, 'légèrement à gauche'],
      [0, "dans l'axe"],
      [25, 'légèrement à droite'],
      [50, 'nettement à droite'],
    ];
    for (const [ecart, label] of cas) {
      const p = construirePromptIaPhoto(90, [cand('EIFFEL', ecart)]);
      expect(p).toContain(`(id: EIFFEL) : ${label}`);
    }
  });
});
