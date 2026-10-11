import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChampClassement } from './ChampClassement';
import { attenteDuBouton, prenomNom } from '../../../../lib/gestion/contexteClients';

/**
 * ══ 🔴🔴 LOT RATTACHER-LIGNE-SUPPRIMEE-BOUTON-PULSE + LOT BOUTON-RATTACHER-TAILLE-ORIGINE ════════════════════════════
 * Le bouton qui ouvre la modale pulse quand des biens attendent un choix. Il garde EXACTEMENT sa taille d'origine : pas
 * de troisième ligne, le sous-titre est REMPLACÉ par « N propositions en attente » sur une ligne (coupée par « … »),
 * et le nom des clients passe dans l'info-bulle. Hors pulsation, le sous-titre d'origine revient.
 * (La taille mesurée — mêmes hauteur et largeur qu'« Interne », avec et sans pulsation — est relevée dans Chrome : jsdom
 * ne calcule aucune dimension.)
 */
const ATTENTE = { detail: '6 propositions en attente', infobulle: 'Biens à choisir pour Cédric JULLIEN - GARRIDO (6) — cliquer pour choisir' };
const rendre = (o: Record<string, unknown>) => renderToStaticMarkup(createElement(ChampClassement as never, {
  cibles: [], interne: false, onRattacher: () => {}, onInterne: () => {}, onReinitialiser: () => {}, ...o,
}));
const bouton = (html: string, classe: string) => new RegExp(`<button[^>]*class="ccl-case ${classe}[^"]*"[^>]*>(.*?)</button>`).exec(html);

describe('le bouton « Rattacher »', () => {
  it('🔴 en attente : il pulse, le sous-titre « à un logement » est REMPLACÉ (une ligne), pas de troisième ligne', () => {
    const html = rendre({ aChoisir: ATTENTE });
    const b = bouton(html, 'ccl-case--rouge');
    expect(b?.[0]).toContain('ccl-case--pulse');
    expect(b?.[1]).toBe('<span class="ccl-case-mot">Rattacher</span>'
      + '<span class="ccl-case-detail ccl-case-detail--une-ligne">6 propositions en attente</span>');
    expect(html).not.toContain('à un logement');
    expect(html).not.toContain('ccl-case-a-choisir');
  });
  it('le nom du ou des clients est dans l’info-bulle', () => {
    expect(bouton(rendre({ aChoisir: ATTENTE }), 'ccl-case--rouge')?.[0])
      .toContain('title="Biens à choisir pour Cédric JULLIEN - GARRIDO (6) — cliquer pour choisir"');
  });
  it('hors pulsation : le sous-titre d’origine revient, immobile', () => {
    const b = bouton(rendre({}), 'ccl-case--rouge');
    expect(b?.[0]).not.toContain('ccl-case--pulse');
    expect(b?.[1]).toBe('<span class="ccl-case-mot">Rattacher</span><span class="ccl-case-detail">à un logement</span>');
  });
  it('case verte « Rattaché » : « N propositions en attente » à la place de « N logements », puis le résumé revient', () => {
    const cibles = [{ sorte: 'lot', cle: '219', id: 176, libelle: 'lot 219' }];
    expect(bouton(rendre({ cibles, aChoisir: { ...ATTENTE, detail: '1 proposition en attente' } }), 'ccl-case--verte')?.[1])
      .toBe('<span class="ccl-case-mot">Rattaché</span><span class="ccl-case-detail ccl-case-detail--une-ligne">1 proposition en attente</span>');
    expect(bouton(rendre({ cibles }), 'ccl-case--verte')?.[1])
      .toBe('<span class="ccl-case-mot">Rattaché</span><span class="ccl-case-detail">1 logement</span>');
  });
});

describe('la feuille de style', () => {
  const css = readFileSync(join(__dirname, 'ChampClassement.tsx'), 'utf8');
  it('le sous-titre de pulsation tient sur UNE ligne et se coupe par « … » (même police et même taille que le sous-titre)', () => {
    expect(css).toContain('.ccl-case-detail--une-ligne{display:block;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}');
    expect(css).not.toMatch(/\.ccl-case-detail--une-ligne\{[^}]*font-/);
  });
  it('🔴 l’animation est INCHANGÉE (1,6 s, halo, échelle 1 → 1,02) ; moins d’animations : contour épais', () => {
    expect(css).toContain('.ccl-case--pulse{position:relative;z-index:1;animation:ccl-pulse-echelle 1.6s ease-in-out infinite}');
    expect(css).toContain('@keyframes ccl-pulse-echelle{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}');
    expect(css).toContain('animation:ccl-pulse-halo 1.6s ease-out infinite');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\{\s*\.ccl-case--pulse\{animation:none\}\s*\.ccl-case--pulse::after\{animation:none;box-shadow:0 0 0 3px var\(--ccl-pulse\)\}/);
  });
});

describe('ce que porte le bouton', () => {
  const b = (cle: string, nom: string | null) => ({ lotId: 1, cle, libelle: cle, categorie: 'logement' as const, role: 'proprietaire' as const, nom });
  it('« N propositions en attente » (pluriel, singulier, chaque bien une fois) ; l’info-bulle nomme les clients', () => {
    expect(attenteDuBouton([{ adresse: 'c@x.fr', biens: ['1', '2', '3', '4', '5', '6'].map((k) => b(k, 'JULLIEN - GARRIDO Cédric')) }]))
      .toEqual({ detail: '6 propositions en attente', infobulle: 'Biens à choisir pour Cédric JULLIEN - GARRIDO (6) — cliquer pour choisir' });
    expect(attenteDuBouton([{ adresse: 'a@x.fr', biens: [b('1', null)] }])?.detail).toBe('1 proposition en attente');
    expect(attenteDuBouton([{ adresse: 'a@x.fr', biens: [b('1', 'LATHAM Lionel'), b('2', 'LATHAM Lionel')] },
      { adresse: 'z@x.fr', biens: [b('2', null), b('3', null)] }]))
      .toEqual({ detail: '3 propositions en attente', infobulle: 'Biens à choisir pour Lionel LATHAM (2) ; z@x.fr (2) — cliquer pour choisir' });
    expect(attenteDuBouton([])).toBeNull();
    expect(prenomNom('SCI DU PARC')).toBe('SCI DU PARC');
  });
});
