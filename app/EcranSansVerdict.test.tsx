// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EcranSansVerdict, MESSAGE_PAS_DE_LIDAR, type ReponseSansVerdict } from './EcranSansVerdict';

/**
 * Lot ZONE SANS LiDAR (15/10/2026) — l'écran « sans verdict » du tunnel. Une zone sans relevés a son PROPRE message (sans
 * jargon, sans score, sans certificat, sans dire pourquoi les relevés manquent) ; les quatre cas d'avant restent mot pour mot.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let racine: Root | null = null;
let hote: HTMLElement | null = null;
afterEach(() => { act(() => racine?.unmount()); hote?.remove(); racine = null; hote = null; });

function rendre(analyse: ReponseSansVerdict): string {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  racine = createRoot(hote);
  act(() => racine!.render(createElement(EcranSansVerdict, { analyse, onModifierPoint: () => {} })));
  return hote.textContent ?? '';
}

describe('EcranSansVerdict', () => {
  it('ZONE SANS LiDAR (motif pas_de_lidar) : le message clair, et rien d’autre', () => {
    const texte = rendre({ validation: { valide: true, altitudeTerrainOrigineM: null }, resultat: null, motif: 'pas_de_lidar' });
    expect(MESSAGE_PAS_DE_LIDAR).toBe('Nous ne disposons pas encore des relevés aériens nécessaires pour certifier cette adresse.');
    expect(texte).toContain('Adresse pas encore couverte');
    expect(texte).toContain(MESSAGE_PAS_DE_LIDAR);
    expect(texte).toContain('Choisir un autre point');
    // Ni l'ancien conseil trompeur, ni verdict, score, certificat, ni jargon ou motif de l'absence (zone militaire / IGN).
    expect(texte).not.toMatch(/Déplacez légèrement|Altitude du sol/);
    expect(texte).not.toMatch(/score|certificat|vis-à-vis|LiDAR|MNT|militaire|interdit|IGN|livraison/i);
  });

  it('les quatre cas d’avant sont inchangés, mot pour mot', () => {
    expect(rendre({ validation: { valide: true }, resultat: { verdict: { verdict: 'INDETERMINE' } } })).toBe(
      'Zone non couverte par nos donnéesCette zone n\'est pas encore couverte par les données de relief nécessaires à l\'analyse. Nous ne pouvons donc pas certifier la vue depuis ce point. Notre couverture s\'étend régulièrement.Essayer un autre point');
    act(() => racine?.unmount()); hote?.remove();
    expect(rendre({ validation: { valide: false }, resultat: null, motif: 'origine_invalide' })).toBe(
      'Point en dehors d\'un bâtimentLe repère doit être posé à l\'intérieur de votre bâtiment, à l\'emplacement de votre fenêtre. Là, il est tombé sur une rue ou un espace extérieur.Repositionner le point');
    act(() => racine?.unmount()); hote?.remove();
    expect(rendre({ validation: { valide: true, altitudeTerrainOrigineM: null }, resultat: null, motif: 'altitude_indisponible' })).toBe(
      'Altitude du sol indisponibleNous n\'avons pas l\'altitude du terrain exactement à cet emplacement. Déplacez légèrement le repère sur votre bâtiment et réessayez.Ajuster le point');
    act(() => racine?.unmount()); hote?.remove();
    expect(rendre({ validation: { valide: true, altitudeTerrainOrigineM: 41 }, resultat: null })).toBe(
      'Analyse indéterminéeL\'analyse n\'a pas pu aboutir pour ce point. Réessayez ou déplacez légèrement le repère.Modifier le point');
  });

  it('réponse SANS motif (ancien serveur) : le cas C d’avant s’applique, aucun « pas de LiDAR » supposé', () => {
    expect(rendre({ validation: { valide: true, altitudeTerrainOrigineM: null }, resultat: null })).toContain('Altitude du sol indisponible');
  });
});
