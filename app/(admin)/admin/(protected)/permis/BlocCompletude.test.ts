import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BlocCompletude, ContenuCompletude } from './BlocCompletude';

// ② — fixture de complétude : 4 familles PRÉSENTES (aucune manquante → pas de BlocDemandePieces, aucun réseau) + N pièces non classées.
const completude = (noms: string[]) => ({
  diagnostic: {
    lignes: (['masse', 'coupe', 'etage', 'cerfa'] as const).map((famille) => ({ famille, presente: true, pieces: [`${famille}.pdf`] })),
    desaccords: [],
    nonClassees: noms.map((nomFichier) => ({ nomFichier, raison: 'hors_familles' as const, rubriqueAutresPieces: false })),
  },
  calculeLe: '2026-09-10', perime: false,
});

/**
 * Q4 — le bloc « Complétude » demandait 2 clics dans l'encart (un pli DANS le pli de famille). `sansPli` supprime le pli interne :
 * sous la famille de l'encart, le CORPS s'affiche d'un seul geste, sans 2e en-tête ; en « Analyse et projection » (défaut), le bloc
 * reste AUTONOME avec son propre pli. renderToStaticMarkup : useEffect ne tourne pas → état initial « chargement » (« Analyse des
 * pièces… ») pour le corps, et BlocRepliable rend un bouton `aria-expanded` sans monter son enfant (paresseux).
 */
describe('Q4 — BlocCompletude : sansPli (encart, 1 geste) vs pli autonome (Analyse)', () => {
  it('sansPli → corps DIRECT, aucun 2e pli ni titre en doublon', () => {
    const h = renderToStaticMarkup(createElement(BlocCompletude, { dossierId: 1, sansPli: true }));
    expect(h).toContain('Analyse des pièces'); // le corps est monté d'emblée (1 seul geste = l'ouverture de la famille)
    expect(h).not.toContain('Complétude des pièces et relances semi-automatiques'); // pas de 2e en-tête (doublon avec le titre de famille)
    expect(h).not.toContain('aria-expanded'); // aucun BlocRepliable interne → aucun 2e bouton de dépliage
  });

  it('défaut (Analyse) → pli AUTONOME conservé (titre du pli, corps NON monté tant que replié)', () => {
    const h = renderToStaticMarkup(createElement(BlocCompletude, { dossierId: 1 }));
    expect(h).toContain('Complétude des pièces et relances semi-automatiques'); // titre du pli propre
    expect(h).toContain('aria-expanded'); // BlocRepliable présent = le pli subsiste
    expect(h).not.toContain('Analyse des pièces'); // corps paresseux : non monté avant le 1er dépliage
  });
});

describe('② — « N pièces hors des pièces suivies » : dépliant replié par défaut (BlocRepliable), compte dynamique', () => {
  it('la liste des non classées est REPLIÉE par défaut : titre = compte RÉEL (pluriel accordé), lignes NON montées', () => {
    const h = renderToStaticMarkup(createElement(ContenuCompletude, { c: completude(['annexe-A.pdf', 'annexe-B.pdf', 'annexe-C.pdf']), dossierId: 1 }));
    expect(h).toContain('3 pièces hors des pièces suivies'); // compte réel + pluriel
    expect(h).toContain('aria-expanded'); // c'est bien le dépliant EXISTANT (BlocRepliable), pas une liste nue
    expect(h).not.toContain('annexe-A.pdf'); // replié par défaut → corps paresseux non monté (58 lignes ne s'empilent plus)
  });

  it('singulier accordé : « 1 pièce hors des pièces suivies »', () => {
    const h = renderToStaticMarkup(createElement(ContenuCompletude, { c: completude(['unique.pdf']), dossierId: 1 }));
    expect(h).toContain('1 pièce hors des pièces suivies');
    expect(h).not.toContain('pièces hors'); // pas de « s » parasite
  });

  it('aucune pièce non classée → aucune ligne mère (rien à replier)', () => {
    const h = renderToStaticMarkup(createElement(ContenuCompletude, { c: completude([]), dossierId: 1 }));
    expect(h).not.toContain('hors des pièces suivies');
  });
});
