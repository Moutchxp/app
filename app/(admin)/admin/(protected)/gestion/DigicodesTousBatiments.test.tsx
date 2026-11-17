// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixBatimentCopro, DigicodesBien, DigicodesCopropriete, digicodesBienEnvoi, saisieDigicodesBien, saisieDigicodesInitiale, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
import type { BatimentConnu } from '../../../../lib/gestion/batimentsCopropriete';

/**
 * 🔴🔴 Arno (17/11/2026) — « BUG : après la création des bâtiments A puis B, une seule ligne de bâtiment reste affichée, comme si un seul bâtiment
 * existait. Chaque bâtiment créé dans la copropriété doit avoir SA ligne, visible et persistante (créé, connu en base ou en attente d'enregistrement). »
 * LA CAUSE, double : ① la fiche du bien (« Nouveau bien », « Modifier le bien », fiche du bien Gestion) ne montrait QUE la ligne du bâtiment choisi —
 * un bâtiment créé au menu puis remplacé par un autre disparaissait, les autres bâtiments de la copropriété n'avaient pas de ligne ; ② partout (fiche
 * Copropriété comprise), un bâtiment du registre de la copropriété sans code, sans bien ni valeur d'avant n'avait pas de ligne.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; });
const $ = (s: string) => container.querySelector(s) as HTMLElement | null;
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const saisir = async (el: Element, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const lignes = () => [...container.querySelectorAll('[data-digicodes-bien] [data-dcp-batiment]')].map((x) => x.getAttribute('data-dcp-batiment'));

const A: BatimentConnu = { cle: 'a', libelle: 'A', sorte: 'lettre' };
const B: BatimentConnu = { cle: 'b', libelle: 'B', sorte: 'lettre' };
const ETAT = (o: Record<string, unknown> = {}) => ({ connu: false, valeur: null, depuis: null, source: null, aVenir: [], aArbitrer: [], historique: [], ...o });

describe('🔴 fiche Copropriété : un bâtiment du registre sans code a sa ligne', () => {
  it('A a un code, B est au registre seulement : deux lignes (A lue, B à saisir) ; rien n’est inventé pour B', () => {
    const s = saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [
      { cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières', commun: { digicode: true, code: '1' }, batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1' }] }] });
    expect(s[0].batiments.map((b) => [b.libelle, b.code, b.nouveau])).toEqual([['A', 'A1', false], ['B', '', false]]);
  });
  it('un bâtiment déjà présent à une autre adresse de la copropriété n’est pas répété', () => {
    const s = saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [
      { cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières', commun: { digicode: null, code: null }, batiments: [] },
      { cle: '9 rue y', voie: '9 rue Y', codePostal: '92600', commune: 'Asnières', commun: { digicode: null, code: null }, batiments: [{ cle: 'b', libelle: 'B', digicode: true, code: 'B1' }] }] });
    expect(s.map((d) => d.batiments.map((b) => b.libelle))).toEqual([['A'], ['B']]);
  });
});

describe('🔴 la fiche du bien : chaque bâtiment de la copropriété a sa ligne, le bâtiment choisi compris', () => {
  const DONNEES = (connus: BatimentConnu[]) => ({ adresseCle: '7 rue x', connus, nomenclature: 'lettres' as const, batiment: null, batimentLie: false, escalier: null,
    copropriete: { cle: '7 rue x', libelle: '7 rue X', codePostal: '92600', commune: 'Asnières' },
    adresse: { cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières', commun: { digicode: null, code: null, etat: ETAT() },
      batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', etat: ETAT({ connu: true, valeur: { digicode: true, code: 'A1' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z' }) }] } });
  let envoi: ReturnType<typeof digicodesBienEnvoi> | null = null;
  function Hote({ connus }: { connus: BatimentConnu[] }) {
    const d = DONNEES(connus);
    const [bat, setBat] = useState('');
    const [crees, setCrees] = useState<{ libelle: string; confirme: boolean }[]>([]);
    const [s, setS] = useState<DigicodesAdresseSaisis>(() => saisieDigicodesBien(d as never));
    envoi = digicodesBienEnvoi(s, bat, false, crees, connus);
    return createElement('div', null,
      createElement(ChoixBatimentCopro, { valeur: bat, connus, nomenclature: 'lettres', escalier: '', desactive: false, onChoix: (l: string) => setBat(l),
        onCree: (l: string, c: boolean) => setCrees((x) => [...x.filter((y) => y.libelle !== l), { libelle: l, confirme: c }]) }),
      createElement(DigicodesBien, { donnees: d as never, s, onChange: setS, batiment: bat, desactive: false, enAttente: crees.map((x) => x.libelle) }));
  }
  beforeEach(() => { envoi = null; });
  it('A (code connu) et B (au registre, sans code) : deux lignes, avant comme après le choix du bâtiment', async () => {
    await act(async () => { root.render(createElement(Hote, { connus: [A, B] })); });
    expect(lignes()).toEqual(['A', 'B']);
    await clic($('[data-cbc-champ]')!);
    await clic($('[data-cbc-option="B"]')!);
    expect(lignes()).toEqual(['A', 'B']);
    await clic($('[data-cbc-champ]')!);
    await clic($('[data-cbc-option="A"]')!);
    expect(lignes()).toEqual(['A', 'B']);
  });
  it('C puis D créés au menu (en attente d’enregistrement) : leurs deux lignes restent, et les deux partent à l’enregistrement', async () => {
    await act(async () => { root.render(createElement(Hote, { connus: [A] })); });
    for (const nom of ['C', 'D']) {
      await saisir($('[data-cbc-champ]')!, nom);
      await act(async () => { $('[data-cbc-champ]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    }
    expect(lignes()).toEqual(['A', 'C', 'D']);
    // un code saisi pour C (le bâtiment qui n'est plus celui du bien) part avec lui
    const c = container.querySelector('[data-digicodes-bien] [data-dcp-batiment="C"] [data-dcp-code-batiment]')!;
    await saisir(c, 'C1');
    expect(envoi?.batiment).toBe('D');
    expect(envoi?.autres).toEqual([{ libelle: 'C', confirme: false, code: { code: 'C1', aucun: false } }]);
  });
  it('une frappe abandonnée n’est pas un bâtiment créé : la ligne suit le champ (comme avant), puis disparaît ; rien ne part pour elle', async () => {
    await act(async () => { root.render(createElement(Hote, { connus: [A] })); });
    await saisir($('[data-cbc-champ]')!, 'Côt');
    expect(lignes()).toEqual(['A', 'CÔT']);
    await saisir($('[data-cbc-champ]')!, '');
    expect(lignes()).toEqual(['A']);
    expect(envoi?.autres).toEqual([]);
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — « LISERÉ : quand on choisit le bâtiment du logement dans « Bâtiment / cage d'escalier » (lettre, chiffre ou intitulé
 * personnalisé), la ligne « Digicode bâtiment X » correspondante est entourée d'un liseré rouge […], ainsi que la ligne du digicode copropriété […]. Le
 * liseré suit le choix en direct ; sans bâtiment choisi, seule la ligne copropriété est entourée. »
 */
describe('🔴 le liseré des lignes qui concernent le logement', () => {
  const DONNEES = { adresseCle: '7 rue x', connus: [A, B, { cle: 'cote cour', libelle: 'Côté cour', sorte: 'libre' }], nomenclature: 'lettres' as const, batiment: null, batimentLie: false, escalier: null,
    copropriete: { cle: '7 rue x', libelle: '7 rue X', codePostal: '92600', commune: 'Asnières' },
    adresse: { cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières', commun: { digicode: null, code: null, etat: ETAT() }, batiments: [] } };
  function Hote() {
    const [bat, setBat] = useState('');
    const [s, setS] = useState<DigicodesAdresseSaisis>(() => saisieDigicodesBien(DONNEES as never));
    return createElement('div', null,
      createElement(ChoixBatimentCopro, { valeur: bat, connus: DONNEES.connus as BatimentConnu[], nomenclature: 'lettres', escalier: '', desactive: false, onChoix: (l: string) => setBat(l) }),
      createElement(DigicodesBien, { donnees: DONNEES as never, s, onChange: setS, batiment: bat, desactive: false }));
  }
  const entourees = () => [...container.querySelectorAll('[data-digicodes-bien] [data-dcp-concerne]')].map((x) => x.getAttribute('data-dcp-batiment') ?? 'copropriété');
  it('sans bâtiment : la copropriété seule ; puis B, A, « Côté cour » : la copropriété et ce bâtiment, en direct', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    expect(entourees()).toEqual(['copropriété']);
    for (const [option, attendu] of [['B', 'B'], ['A', 'A'], ['Côté cour', 'Côté cour']]) {
      await clic($('[data-cbc-champ]')!);
      await clic($(`[data-cbc-option="${option}"]`)!);
      expect(entourees()).toEqual(['copropriété', attendu]);
    }
    expect(container.querySelector('[data-dcp-concerne]')?.classList.contains('dcp-ligne--concerne')).toBe(true);
  });
  it('la fiche Copropriété (aucun logement) : aucun liseré', async () => {
    const s = saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [{ cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières', commun: { digicode: null, code: null }, batiments: [] }] });
    await act(async () => { root.render(createElement(DigicodesCopropriete, { s, onChange: () => {}, connus: [A, B], nomenclature: 'lettres', desactive: false })); });
    expect(container.querySelectorAll('[data-dcp-batiment]')).toHaveLength(2);
    expect(container.querySelector('[data-dcp-concerne]')).toBeNull();
  });
});
