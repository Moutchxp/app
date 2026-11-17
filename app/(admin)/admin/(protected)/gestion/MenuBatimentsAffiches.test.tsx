// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixBatimentCopro, DigicodesBien, saisieDigicodesBien, useRetraitsBatiment, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
import type { BatimentConnu } from '../../../../lib/gestion/batimentsCopropriete';

/**
 * 🔴🔴 Arno (17/11/2026) — « MENU « Bâtiment / cage d'escalier » : il ne propose QUE les bâtiments qui ont une ligne de digicode affichée à l'écran. Un bâtiment
 * dont la ligne a été retirée par « − » (ligne en saisie retirée, bâtiment retiré, code retiré dont la ligne a quitté l'écran) n'apparaît plus dans le menu ;
 * s'il est recréé, il revient. Si la valeur du champ désigne un bâtiment retiré, le champ est vidé avec un message court. Test qui reproduit d'abord le défaut
 * (création A et B, retrait des deux par « − », A et B encore proposés). »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; });
const $ = (s: string) => container.querySelector(s) as HTMLElement | null;
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); await Promise.resolve(); }); };
const saisir = async (el: Element, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const ETAT = { connu: false, valeur: null, depuis: null, source: null, aVenir: [], aArbitrer: [], historique: [] };
const DONNEES = { adresseCle: '7 rue x', connus: [], nomenclature: null, batiment: null, batimentLie: false, escalier: null,
  copropriete: { cle: '7 rue x', libelle: '7 rue X', codePostal: '92600', commune: 'Asnières' },
  adresse: { cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières', commun: { digicode: null, code: null, etat: ETAT }, batiments: [] } };

/** l'écran de la fiche du bien, câblé comme « Nouveau bien » / « Modifier le bien » (le même hook) */
let retraitServeur: string | null = null;
function Hote({ connus = [] as BatimentConnu[] }: { connus?: BatimentConnu[] }) {
  const [bat, setBat] = useState('');
  const [crees, setCrees] = useState<string[]>([]);
  const donnees = { ...DONNEES, connus };
  const [s, setS] = useState<DigicodesAdresseSaisis>(() => saisieDigicodesBien(donnees as never));
  const r = useRetraitsBatiment(bat, () => setBat(''));
  return createElement('div', null,
    createElement(ChoixBatimentCopro, { valeur: bat, connus, nomenclature: null, escalier: '', desactive: false, onChoix: (l: string) => { r.effacerAvis(); setBat(l); },
      onCree: (l: string) => { setCrees((x) => [...x.filter((y) => y !== l), l]); r.reprendre(l); }, retires: r.retires, avis: r.avis }),
    createElement(DigicodesBien, { donnees: donnees as never, s, onChange: setS, batiment: bat, desactive: false, enAttente: crees, retires: r.retires,
      onRetirerEnAttente: (l: string) => { setCrees((x) => x.filter((y) => y !== l)); r.retirer(l); },
      onRetirerBatiment: async () => retraitServeur }));
}
const creer = async (nom: string) => {
  await saisir($('[data-cbc-champ]')!, nom);
  await act(async () => { $('[data-cbc-champ]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
};
const retirerLigne = async (nom: string) => {
  await clic($(`[data-digicodes-bien] [data-dcp-batiment="${nom}"] [data-dcp-moins]`)!);
  await clic(document.querySelector('[data-dcp-retirer-oui]')!);
};
const menu = async () => { await clic($('[data-cbc-champ]')!); return [...container.querySelectorAll('[data-cbc-menu] [data-cbc-option]')].map((b) => b.textContent); };

describe('🔴 le menu ne propose que les bâtiments dont la ligne est affichée', () => {
  it('A et B créés au menu, puis retirés par « − » : ni A ni B ne sont plus proposés', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await creer('A'); await creer('B');
    expect([...container.querySelectorAll('[data-digicodes-bien] [data-dcp-batiment]')].map((x) => x.getAttribute('data-dcp-batiment'))).toEqual(['A', 'B']);
    await retirerLigne('A'); await retirerLigne('B');
    expect(container.querySelectorAll('[data-digicodes-bien] [data-dcp-batiment]')).toHaveLength(0);
    expect(await menu()).toEqual([]);
  });
  it('recréé (« + Ajouter le bâtiment »), il revient : sa ligne et le menu', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await creer('A'); await creer('B');
    await retirerLigne('A');
    expect(await menu()).toEqual(['B']);
    await clic($('[data-cbc-champ]')!);
    await creer('A');
    expect([...container.querySelectorAll('[data-digicodes-bien] [data-dcp-batiment]')].map((x) => x.getAttribute('data-dcp-batiment'))).toEqual(['A', 'B']);
    expect(await menu()).toEqual(['A', 'B']);
  });
  it('le champ désignait le bâtiment retiré : il est vidé, avec un message court ; choisir autre chose l’efface', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await creer('A'); await creer('B');
    expect(($('[data-cbc-champ]') as HTMLInputElement).value).toBe('B');
    await retirerLigne('B');
    expect(($('[data-cbc-champ]') as HTMLInputElement).value).toBe('');
    expect($('[data-cbc-avis]')?.textContent).toBe('Bâtiment B retiré : choisissez un autre bâtiment (ou aucun).');
    expect($('[data-cb-message]')).toBeNull(); // la bulle « Bâtiment B ajouté » se tait
    await clic($('[data-cbc-champ]')!);
    await clic($('[data-cbc-option="A"]')!);
    expect($('[data-cbc-avis]')).toBeNull();
  });
  it('un bâtiment enregistré sans code, retiré de la copropriété (« − » confirmé au serveur) : plus de ligne, plus dans le menu', async () => {
    retraitServeur = null;
    await act(async () => { root.render(createElement(Hote, { connus: [{ cle: 'c', libelle: 'C', sorte: 'lettre' }, { cle: 'd', libelle: 'D', sorte: 'lettre' }] })); });
    expect(await menu()).toEqual(['C', 'D']);
    await clic($('[data-cbc-champ]')!);
    await clic($('[data-digicodes-bien] [data-dcp-batiment="C"] [data-dcp-moins]')!);
    expect(document.querySelector('[data-dcp-fenetre-retirer]')?.getAttribute('data-dcp-fenetre-retirer')).toBe('batiment');
    await clic(document.querySelector('[data-dcp-retirer-oui]')!);
    await act(async () => { await Promise.resolve(); });
    expect([...container.querySelectorAll('[data-digicodes-bien] [data-dcp-batiment]')].map((x) => x.getAttribute('data-dcp-batiment'))).toEqual(['D']);
    expect(await menu()).toEqual(['D']);
  });
});
