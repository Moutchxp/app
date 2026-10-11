import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChampClassement } from './ChampClassement';
import { motBiensAChoisir, prenomNom } from '../../../../lib/gestion/contexteClients';

/**
 * ══ 🔴🔴 LOT RATTACHER-LIGNE-SUPPRIMEE-BOUTON-PULSE — LE BOUTON QUI OUVRE LA MODALE PULSE ═══════════════════════════
 * Le bouton « Rattacher » (ou la case verte « Rattaché ») pulse, avec la mention, quand des biens attendent un choix ;
 * sans `aChoisir`, il est celui d'avant. Moins d'animations demandées : un contour épais, et la mention.
 */
const rendre = (o: Record<string, unknown>) => renderToStaticMarkup(createElement(ChampClassement as never, {
  cibles: [], interne: false, onRattacher: () => {}, onInterne: () => {}, onReinitialiser: () => {}, ...o,
}));

describe('le bouton de rattachement', () => {
  it('🔴 « Rattacher » pulse avec la mention ; sans biens à choisir : immobile, sans mention', () => {
    const avec = rendre({ aChoisir: '6 biens à choisir pour Cédric JULLIEN' });
    expect(avec).toMatch(/class="ccl-case ccl-case--rouge[^"]*ccl-case--pulse"/);
    expect(avec).toContain('<span class="ccl-case-a-choisir">6 biens à choisir pour Cédric JULLIEN</span>');
    const sans = rendre({});
    expect(sans).not.toContain('ccl-case--pulse');
    expect(sans).not.toContain('ccl-case-a-choisir');
  });
  it('la case verte « Rattaché » pulse aussi (un autre bien est déjà rattaché)', () => {
    const html = rendre({ cibles: [{ sorte: 'lot', cle: '219', id: 176, libelle: 'lot 219' }], aChoisir: '2 biens à choisir' });
    expect(html).toMatch(/class="ccl-case ccl-case--verte ccl-case--pleine[^"]*ccl-case--pulse"/);
    expect(html).toContain('2 biens à choisir');
  });
  it('la pulsation : halo en surimpression (ombre, rien ne bouge autour), 1,6 s, échelle 1 → 1,02 ; moins d’animations : contour épais', () => {
    const css = readFileSync(join(__dirname, 'ChampClassement.tsx'), 'utf8');
    expect(css).toContain('.ccl-case--pulse{position:relative;z-index:1;animation:ccl-pulse-echelle 1.6s ease-in-out infinite}');
    expect(css).toContain('@keyframes ccl-pulse-echelle{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}');
    expect(css).toContain('animation:ccl-pulse-halo 1.6s ease-out infinite');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\{\s*\.ccl-case--pulse\{animation:none\}\s*\.ccl-case--pulse::after\{animation:none;box-shadow:0 0 0 3px var\(--ccl-pulse\)\}/);
  });
});

describe('la mention', () => {
  const b = (cle: string, nom: string | null) => ({ lotId: 1, cle, libelle: cle, categorie: 'logement' as const, role: 'proprietaire' as const, nom });
  it('« N biens à choisir pour Prénom NOM » (l’annuaire écrit NOM Prénom) ; plusieurs clients : le total', () => {
    expect(motBiensAChoisir([{ adresse: 'c@x.fr', biens: [b('1', 'JULLIEN - GARRIDO Cédric'), b('2', 'JULLIEN - GARRIDO Cédric')] }]))
      .toBe('2 biens à choisir pour Cédric JULLIEN - GARRIDO');
    expect(motBiensAChoisir([{ adresse: 'a@x.fr', biens: [b('1', null), b('2', null)] }, { adresse: 'z@x.fr', biens: [b('2', null), b('3', null)] }]))
      .toBe('3 biens à choisir');
    expect(motBiensAChoisir([])).toBeNull();
    expect(prenomNom('LATHAM Lionel')).toBe('Lionel LATHAM');
    expect(prenomNom('SCI DU PARC')).toBe('SCI DU PARC');
  });
});
