// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChampNombreBatiments } from './CaracteristiquesRendu';

/**
 * POINT 2 — le message « Nouvelle valeur enregistrée. » ne doit plus PARTAGER la ligne du bouton (il l'écrasait : « re de bâtiment(s) du perm »).
 * Exception voulue par Arno : il passe sur une 2e ligne, SOUS le champ. La MISE EN PAGE (2e ligne visuelle) n'est PAS testable en jsdom
 * (pas de layout) — SIGNALÉ, non couvert. On teste la STRUCTURE sanctionnée par Arno : message présent, APRÈS le champ dans l'ordre DOM,
 * HORS du groupe libellé/champ/bouton (donc il ne peut plus se superposer au bouton). Aucune assertion de couleur/classe/pixel.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; });

function rendre(succes: boolean): HTMLElement {
  const container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(createElement(ChampNombreBatiments, { valeur: '2', nbActuel: 2, edition: false, succes, onValeur: () => {}, onBouton: () => {} })); });
  return container;
}
const APRES = 4; // Node.DOCUMENT_POSITION_FOLLOWING

describe('POINT 2 — placement du message de confirmation', () => {
  it('succès → message présent, APRÈS le champ ET le bouton dans l’ordre DOM', () => {
    const c = rendre(true);
    const message = c.querySelector('[role="status"]')!;
    expect(message.textContent).toContain('Nouvelle valeur enregistrée.');
    const input = c.querySelector('input')!;
    const bouton = c.querySelector('button')!;
    expect(!!(input.compareDocumentPosition(message) & APRES)).toBe(true); // message après le champ
    expect(!!(bouton.compareDocumentPosition(message) & APRES)).toBe(true); // message après le bouton
  });

  it('le message est HORS du groupe champ/bouton (il ne peut plus se superposer au bouton)', () => {
    const c = rendre(true);
    const message = c.querySelector('[role="status"]')!;
    const input = c.querySelector('input')!;
    const bouton = c.querySelector('button')!;
    // le groupe SOLIDAIRE champ+bouton (leur parent commun immédiat) ne contient PAS le message :
    const groupe = input.parentElement!;
    expect(groupe.contains(bouton)).toBe(true);   // champ et bouton sont bien dans le même groupe
    expect(groupe.contains(message)).toBe(false); // le message est en dehors
  });

  it('le message n’est plus CO-ENFANT de la rangée de commande (il a quitté la ligne du libellé/champ/bouton)', () => {
    const c = rendre(true);
    const message = c.querySelector('[role="status"]')!;
    const libelle = [...c.querySelectorAll('span')].find((s) => s.textContent === 'Changer le nombre :')!;
    // Avant le correctif, libellé et message étaient enfants du MÊME conteneur (même ligne nowrap) → superposition.
    //   Désormais le libellé vit dans la RANGÉE de commande et le message dans une rangée SŒUR distincte.
    expect(libelle.parentElement).not.toBe(message.parentElement);
  });

  it('sans succès → aucun message (role=status absent)', () => {
    const c = rendre(false);
    expect(c.querySelector('[role="status"]')).toBeNull();
  });
});
