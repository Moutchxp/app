// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixBatimentCopro } from '../gestion/DigicodesCopropriete';

/**
 * 🔴 Arno (18/11/2026) — rangée « Bâtiment / cage d'escalier — Étage — N° de porte » : « lorsque l'on retire une ligne cela fait apparaitre une légende qui
 * décale la case de saisie et dénature l'esthétique de la ligne et de la page. ne déplace pas le champ de saisie, mais déplace plutôt l'affichage de la
 * ligne du dessous (on garde tous les champs de saisie sur la même ligne). » ; « Le texte de la légende et son comportement ne changent pas ; aucune
 * légende supprimée ni masquée. »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const AVIS = 'Bâtiment A retiré : choisissez un autre bâtiment (ou aucun).';
const props = { valeur: '', connus: [], nomenclature: 'lettres' as const, escalier: '', desactive: false, onChoix: () => {}, variante: 'location' as const, avis: AVIS, adresse: '3 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine' };

describe('🔴 les légendes du champ Bâtiment, sous la rangée entière', () => {
  it('avec la ligne sous la rangée : les deux légendes y vont (mêmes textes), plus rien SOUS le champ ; la ligne est une case pleine largeur de la rangée', async () => {
    function Rangee() {
      const [zone, setZone] = useState<HTMLDivElement | null>(null);
      return createElement('div', { className: 'loc-grille', 'data-ligne-situation': '' },
        createElement(ChoixBatimentCopro, { ...props, zoneLegendes: zone }),
        createElement('label', { className: 'loc-champ' }, 'Étage', createElement('input')),
        createElement('label', { className: 'loc-champ' }, 'N° de porte', createElement('input')),
        createElement('div', { className: 'loc-legendes-ligne', ref: setZone, 'data-legendes-situation': '' }));
    }
    await act(async () => { root.render(createElement(Rangee)); });
    const ligne = container.querySelector('[data-legendes-situation]')!;
    expect(ligne.querySelector('[data-cbc-avis]')?.textContent).toBe(AVIS);
    expect(ligne.querySelector('[data-cbc-adresse]')?.textContent).toBe('Bâtiments de l’adresse 3 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine');
    expect(container.querySelector('[data-cbc] [data-cbc-avis], [data-cbc] [data-cbc-adresse]')).toBeNull();
    expect(ligne.querySelector('[data-cbc-avis]')?.getAttribute('role')).toBe('status');
  });
  it('sans ligne fournie (fiche Copropriété, fiche du bien Gestion) : les légendes restent sous le champ, comme avant', async () => {
    await act(async () => { root.render(createElement(ChoixBatimentCopro, props)); });
    expect(container.querySelector('[data-cbc] [data-cbc-avis]')?.textContent).toBe(AVIS);
  });
  it('la règle de style : la rangée alignée en haut, la ligne des légendes pleine largeur et sans place quand elle est vide ; au téléphone, juste sous le champ Bâtiment', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/location/commun.tsx', 'utf8');
    expect(css).toContain('.loc-grille[data-ligne-situation]{align-items:start}');
    expect(css).toContain('.loc-legendes-ligne{grid-column:1/-1;');
    expect(css).toContain('.loc-legendes-ligne:empty{display:none}');
    expect(css).toContain('.loc-grille[data-ligne-situation] > [data-cbc]{order:1} .loc-grille[data-ligne-situation] > .loc-legendes-ligne{order:2;');
    const bien = readFileSync('app/(admin)/admin/(protected)/location/CreationBien.tsx', 'utf8');
    expect(bien).toContain('zoneLegendes={zoneLegendesSituation}');
    expect(bien.indexOf('data-legendes-situation')).toBeLessThan(bien.indexOf('data-precision>Précision'));
  });
});
