// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DigicodesCopropriete, digicodesModifies, refusDigicodes, saisieDigicodesInitiale, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
import type { BatimentConnu } from '../../../../lib/gestion/batimentsCopropriete';

/** 🔴🔴 Arno (16/11/2026, fiche Copropriété, lot 3) — la nouvelle saisie des digicodes : commun, « + » bâtiment, menu, lettres OU chiffres. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root; let dernier: DigicodesAdresseSaisis[] = [];
const FICHE = { digicodes: [
  { cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234' }, batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1' }] },
  { cle: '12 rue des lilas', voie: '12 rue des Lilas', codePostal: '75011', commune: 'Paris', commun: { digicode: false, code: null }, batiments: [] }] };
const CONNUS: BatimentConnu[] = [{ cle: 'a', libelle: 'A', sorte: 'lettre' }, { cle: 'c', libelle: 'C', sorte: 'lettre' }, { cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }];
function Hote() {
  const [s, setS] = useState(saisieDigicodesInitiale(FICHE));
  dernier = s;
  return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false });
}
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const $ = (s: string, i = 0) => container.querySelectorAll(s)[i] as HTMLElement;
const saisir = async (el: HTMLElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const clic = async (el: HTMLElement) => { await act(async () => { el.click(); }); };

describe('par adresse : le digicode commun, et « + » pour un bâtiment ou une cage', () => {
  it('lu tel quel : le commun, ses bâtiments ; « Non » d’avant = « pas de digicode » ; la règle de la copropriété est dite', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    expect(($('[data-dcp-code-commun]') as HTMLInputElement).value).toBe('1234');
    expect($('[data-dcp-nom-existant]').textContent).toBe('A');
    expect(($('[data-dcp-adresse="12 rue des lilas"] [data-dcp-code-commun]') as HTMLInputElement).placeholder).toBe('pas de digicode');
    expect($('[data-dcp-regle]').textContent).toContain('bâtiments en lettres (A, B, C…)');
    expect(digicodesModifies(dernier)).toEqual([]); // rien touché : rien ne part
  });
  it('« + » puis clic sur le champ : le menu SOUS LE CHAMP, avec les bâtiments de TOUTE la copropriété, les intitulés libres et « Ajouter nouveau bâtiment »', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await clic($('[data-dcp-adresse="12 rue des lilas"] [data-dcp-plus]'));
    await clic($('[data-dcp-nom-batiment]'));
    expect([...container.querySelectorAll('[data-dcp-menu] button')].map((b) => b.textContent)).toEqual(['A', 'C', 'Côté cour', 'Ajouter nouveau bâtiment']);
    await clic($('[data-dcp-option="C"]'));
    expect(($('[data-dcp-nom-batiment]') as HTMLInputElement).value).toBe('C');
    expect(container.querySelector('[data-dcp-menu]')).toBeNull();
    await saisir($('[data-dcp-adresse="12 rue des lilas"] [data-dcp-code-batiment]'), 'C77');
    expect(digicodesModifies(dernier)).toEqual([{ cle: '12 rue des lilas', batiments: [{ libelle: 'C', code: 'C77', aucun: false, confirme: false }] }]);
  });
  it('« Ajouter nouveau bâtiment » : on écrit ; un intitulé personnalisé parmi des lettres : aucune fenêtre', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await clic($('[data-dcp-plus]'));
    await clic($('[data-dcp-nom-batiment]'));
    await clic($('[data-dcp-ajouter-nouveau]'));
    await saisir($('[data-dcp-nom-batiment]'), 'Côté rue');
    await act(async () => { $('[data-dcp-nom-batiment]').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    expect(document.querySelector('[data-dcp-avertissement]')).toBeNull();
    expect(container.querySelector('[data-dcp-refus]')).toBeNull();
  });
  it('une même adresse : un code commun PUIS un code par bâtiment ; modifier le commun ne part que s’il change', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await saisir($('[data-dcp-code-commun]'), '9999');
    await clic($('[data-dcp-plus]'));
    await saisir($('[data-dcp-nom-batiment]'), 'B');
    expect(digicodesModifies(dernier)).toEqual([{ cle: 'residence les tilleuls', commun: { code: '9999', aucun: false }, batiments: [{ libelle: 'B', code: '', aucun: false, confirme: false }] }]);
  });
});

describe('le menu filtre ce qui est tapé', () => {
  it('« c » : C et « Côté cour » ; « Ajouter nouveau bâtiment » toujours là', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await clic($('[data-dcp-plus]'));
    await saisir($('[data-dcp-nom-batiment]'), 'c');
    expect([...container.querySelectorAll('[data-dcp-menu] button')].map((b) => b.textContent)).toEqual(['C', 'Côté cour', 'Ajouter nouveau bâtiment']);
  });
});

describe('les refus (purs)', () => {
  it('un bâtiment sans nom ; le même bâtiment deux fois à une adresse ; le mélange', () => {
    const s = saisieDigicodesInitiale(FICHE);
    const avec = (libelle: string) => s.map((d, i) => (i === 0 ? { ...d, batiments: [...d.batiments, { k: 'n', libelle, code: '', aucun: false, nouveau: true, initial: { code: '', aucun: false } }] } : d));
    expect(refusDigicodes(avec(''), 'lettres', CONNUS)).toBe('Donnez un nom au bâtiment ou à la cage d’escalier.');
    expect(refusDigicodes(avec('Bât. A'), 'lettres', CONNUS)).toContain('a déjà son digicode à cette adresse');
    expect(refusDigicodes(avec('3'), 'lettres', CONNUS)).toBe('Confirmez ou corrigez l’intitulé « 3 » : il ne suit pas la numérotation des autres bâtiments.');
    expect(refusDigicodes(avec('D'), 'lettres', CONNUS)).toBeNull();
  });
});

describe('🔴 (lot D) la fenêtre d’avertissement', () => {
  const ajouterChiffre = async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await clic($('[data-dcp-plus]'));
    await saisir($('[data-dcp-nom-batiment]'), '2');
    await act(async () => { $('[data-dcp-nom-batiment]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  };
  it('un chiffre parmi des lettres : la fenêtre, au moment de l’ajout, explique et rappelle les intitulés déjà utilisés', async () => {
    await ajouterChiffre();
    const f = container.querySelector('[data-dcp-avertissement] [role="alertdialog"]')!;
    expect(f.textContent).toContain('Intitulé différent des autres bâtiments');
    expect(f.textContent).toContain('« 2 » est un chiffre, alors que les bâtiments de cette copropriété sont nommés par des lettres. Ce nouvel intitulé ne respecte pas la même numérotation que les autres cages d’escalier de la copropriété.');
    expect(f.textContent).toContain('Intitulés déjà utilisés : A, C, Côté cour.');
    expect([...f.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Corriger', 'Confirmer cet intitulé']);
  });
  it('« Confirmer cet intitulé » : gardé, la confirmation part avec « Valider »', async () => {
    await ajouterChiffre();
    await clic($('[data-dcp-confirmer]'));
    expect(container.querySelector('[data-dcp-avertissement]')).toBeNull();
    expect(container.querySelector('[data-dcp-refus]')).toBeNull();
    expect(digicodesModifies(dernier)).toEqual([{ cle: 'residence les tilleuls', batiments: [{ libelle: '2', code: '', aucun: false, confirme: true }] }]);
  });
  it('« Corriger » : rien n’est gardé, la main revient au champ', async () => {
    await ajouterChiffre();
    await clic($('[data-dcp-corriger]'));
    expect(container.querySelector('[data-dcp-avertissement]')).toBeNull();
    expect(($('[data-dcp-nom-batiment]') as HTMLInputElement).value).toBe('');
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(document.activeElement).toBe($('[data-dcp-nom-batiment]'));
  });
  it('choisir un chiffre dans le menu : même fenêtre ; changer l’intitulé après confirmation retire la confirmation', async () => {
    const CONNUS_CH: BatimentConnu[] = [...CONNUS, { cle: '9', libelle: '9', sorte: 'chiffre' }];
    function H() { const [s, setS] = useState(saisieDigicodesInitiale(FICHE)); dernier = s; return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS_CH, nomenclature: 'lettres', desactive: false }); }
    await act(async () => { root.render(createElement(H)); });
    await clic($('[data-dcp-plus]')); await clic($('[data-dcp-nom-batiment]'));
    await clic($('[data-dcp-option="9"]'));
    expect(container.querySelector('[data-dcp-avertissement]')).not.toBeNull();
    await clic($('[data-dcp-confirmer]'));
    await saisir($('[data-dcp-nom-batiment]'), '8');
    expect(refusDigicodes(dernier, 'lettres', CONNUS_CH)).toContain('« 8 »');
  });
});
