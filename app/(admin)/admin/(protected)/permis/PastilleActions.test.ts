import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PastilleActions } from './PastilleActions';
import { OngletsPermis } from './PermisOnglets';

/**
 * PASTILLES — rendu PUR (renderToStaticMarkup). Zéro → RIEN ; libellé accessible ; « 99+ » au-delà de 99 ; pastille à gauche du
 * titre sur les 3 onglets concernés uniquement, et jamais quand le compteur est 0.
 */
const h = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('PASTILLES — PastilleActions', () => {
  it('zéro → ne rend RIEN (pas de « 0 », pas de pastille)', () => {
    expect(h(createElement(PastilleActions, { n: 0 }))).toBe('');
    expect(h(createElement(PastilleActions, { n: -3 }))).toBe('');
  });
  it('N > 0 → affiche N + libellé lecteur d’écran', () => {
    const m = h(createElement(PastilleActions, { n: 3 }));
    expect(m).toContain('>3<');
    expect(m).toContain('aria-label="3 actions en attente"');
  });
  it('singulier « 1 action en attente »', () => {
    expect(h(createElement(PastilleActions, { n: 1 }))).toContain('aria-label="1 action en attente"');
  });
  it('au-delà de 99 → « 99+ » à l’écran, libellé exact au nombre réel', () => {
    const m = h(createElement(PastilleActions, { n: 150 }));
    expect(m).toContain('99+');
    expect(m).toContain('aria-label="150 actions en attente"');
  });
  it('ariaLabel OMIS → libellé HISTORIQUE inchangé (non-régression des appelants Permis)', () => {
    // Rendu STRICTEMENT identique à l'ancien composant : le chiffre + « N actions en attente », rien d'autre.
    expect(h(createElement(PastilleActions, { n: 2 }))).toBe(h(createElement(PastilleActions, { n: 2, ariaLabel: undefined })));
    expect(h(createElement(PastilleActions, { n: 2 }))).toContain('aria-label="2 actions en attente"');
  });
  it('ariaLabel fourni (F7) → libellé sur mesure, chiffre inchangé', () => {
    const m = h(createElement(PastilleActions, { n: 2, ariaLabel: '2 mises à jour de base de données disponibles' }));
    expect(m).toContain('aria-label="2 mises à jour de base de données disponibles"');
    expect(m).toContain('>2<');
    expect(m).not.toContain('en attente');
  });
});

describe('PASTILLES — onglets : pastille à gauche du titre des 3 onglets concernés', () => {
  it('compteurs > 0 → pastilles rendues pour Réponses / Saisines / Rattachement', () => {
    const m = h(createElement(OngletsPermis, { actif: 'dossiers', onChoisir: () => {}, compteurs: { reponses: 2, saisines: 5, rattachement: 1 } }));
    expect(m).toContain('aria-label="2 actions en attente"');
    expect(m).toContain('aria-label="5 actions en attente"');
    expect(m).toContain('aria-label="1 action en attente"');
  });
  it('la pastille précède le libellé de l’onglet', () => {
    const m = h(createElement(OngletsPermis, { actif: 'dossiers', onChoisir: () => {}, compteurs: { reponses: 2 } }));
    expect(m.indexOf('2 actions en attente')).toBeLessThan(m.indexOf('Réponses'));
  });
  it('compteur 0 (ou absent) → aucune pastille ; les onglets sans compteur non plus', () => {
    const m = h(createElement(OngletsPermis, { actif: 'dossiers', onChoisir: () => {}, compteurs: { reponses: 0 } }));
    expect(m).not.toContain('en attente');
    const sans = h(createElement(OngletsPermis, { actif: 'dossiers', onChoisir: () => {} }));
    expect(sans).not.toContain('en attente');
  });
});
