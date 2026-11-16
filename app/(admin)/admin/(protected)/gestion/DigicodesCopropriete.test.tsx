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
  it('🔴 un intitulé dont le mélange est DÉJÀ accepté dans la copropriété : le rechoisir dans le menu n’ouvre pas la fenêtre', async () => {
    const CONNUS_CH: BatimentConnu[] = [...CONNUS, { cle: '9', libelle: '9', sorte: 'chiffre' }];
    function H() { const [s, setS] = useState(saisieDigicodesInitiale(FICHE)); dernier = s; return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS_CH, nomenclature: 'lettres', desactive: false }); }
    await act(async () => { root.render(createElement(H)); });
    await clic($('[data-dcp-plus]')); await clic($('[data-dcp-nom-batiment]'));
    await clic($('[data-dcp-option="9"]'));
    expect(document.querySelector('[data-dcp-avertissement]')).toBeNull();
    expect(refusDigicodes(dernier, 'lettres', CONNUS_CH)).toBeNull();
  });
  it('🔴 confirmé pour une adresse, rechoisi pour une autre : pas de seconde fenêtre ; un nouvel intitulé hors numérotation l’ouvre toujours ; changer l’intitulé retire la confirmation', async () => {
    await ajouterChiffre(); await clic($('[data-dcp-confirmer]'));
    await clic($('[data-dcp-adresse="12 rue des lilas"] [data-dcp-plus]'));
    await clic($('[data-dcp-adresse="12 rue des lilas"] [data-dcp-nom-batiment]'));
    await clic($('[data-dcp-adresse="12 rue des lilas"] [data-dcp-option="2"]'));
    expect(document.querySelector('[data-dcp-avertissement]')).toBeNull();
    expect(refusDigicodes(dernier, 'lettres', CONNUS)).toBeNull();
    await saisir($('[data-dcp-adresse="residence les tilleuls"] [data-dcp-nom-batiment]'), '8');
    expect(refusDigicodes(dernier, 'lettres', CONNUS)).toContain('« 8 »');
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 3) le composant unique avec la base unique (478)', () => {
  const ETAT = (o: Record<string, unknown> = {}) => ({ connu: true, valeur: { digicode: true, code: '1234' }, depuis: '2026-11-01T10:00:00.000Z', source: 'unifie', aVenir: [], aArbitrer: [],
    historique: [{ id: 1, digicode: true, code: '1234', appliqueLe: '2026-11-01T10:00:00.000Z', nature: 'saisie', par: 'arno', creeLe: '2026-11-01T10:00:00.000Z', annule: false }], ...o });
  const FICHE_U = { digicodes: [
    { cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234', etat: ETAT() },
      batiments: [{ cle: 'a', libelle: 'A', digicode: null, code: null, etat: ETAT({ connu: false, valeur: null, source: 'ancien', historique: [],
        aArbitrer: [{ digicode: true, code: 'A1', origines: ['bien W1'], lots: [1] }, { digicode: true, code: 'A2', origines: ['adresse 12 rue X'], lots: [] }] }) },
      { cle: 'c', libelle: 'C', digicode: null, code: null, etat: ETAT({ connu: false, valeur: null, source: null, historique: [] }) }] }] };
  let corrige: unknown[] = []; let arbitre: unknown[] = []; let reponse: string | null = null;
  function HoteU() {
    const [s, setS] = useState(saisieDigicodesInitiale(FICHE_U as never));
    dernier = s;
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false,
      onCorriger: async (...a: unknown[]) => { corrige.push(a); return reponse; }, onArbitrer: async (...a: unknown[]) => { arbitre.push(a); return null; } });
  }
  beforeEach(() => { corrige = []; arbitre = []; reponse = null; });
  it('un code CONNU se LIT (en vigueur, depuis quand) — plus de champ à taper ; une place sans code se saisit comme avant ; rien ne part tant qu’on n’a rien saisi', async () => {
    await act(async () => { root.render(createElement(HoteU)); });
    expect(container.querySelector('[data-dcp-code-commun]')).toBeNull();
    expect($('[data-dcp-commun] [data-dcp-lue-valeur]').textContent).toBe('code 1234 · en vigueur depuis le 01/11/2026 à 11:00');
    expect(container.querySelector('[data-dcp-batiment="C"] [data-dcp-code-batiment]')).not.toBeNull();
    expect(digicodesModifies(dernier)).toEqual([]);
  });
  it('« Corriger une erreur » : confirmé, immédiat (le geste part tout de suite), sans date ; « Annuler » ; un refus s’affiche', async () => {
    await act(async () => { root.render(createElement(HoteU)); });
    await clic($('[data-dcp-commun] [data-dcp-corriger-erreur]'));
    expect($('[data-dcp-correction]').textContent).toContain('remplace code 1234 tout de suite, sans date ni mail ; l’ancienne valeur reste dans l’historique');
    expect(($('[data-dcp-correction-confirmer]') as HTMLButtonElement).disabled).toBe(true);
    await saisir($('[data-dcp-correction-code]'), '1243');
    reponse = 'Refus du serveur.';
    await clic($('[data-dcp-correction-confirmer]'));
    expect(corrige).toEqual([['residence les tilleuls', null, { digicode: true, code: '1243' }]]);
    expect($('[data-dcp-correction-erreur]').textContent).toBe('Refus du serveur.');
    reponse = null;
    await clic($('[data-dcp-correction-confirmer]'));
    expect(container.querySelector('[data-dcp-correction]')).toBeNull();
    await clic($('[data-dcp-commun] [data-dcp-corriger-erreur]'));
    await clic($('[data-dcp-correction-annuler]'));
    expect([container.querySelector('[data-dcp-correction]'), corrige.length]).toEqual([null, 2]);
  });
  it('« À arbitrer » : les valeurs différentes, d’où elles viennent ; « Garder ce code » demande confirmation, puis part ; rien n’est choisi seul', async () => {
    await act(async () => { root.render(createElement(HoteU)); });
    expect($('[data-dcp-batiment="A"] [data-dcp-lue-a-arbitrer]').textContent).toContain('à arbitrer');
    const z = $('[data-dcp-a-arbitrer]');
    expect([...z.querySelectorAll('[data-dcp-candidat]')].map((x) => x.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['code A1 — bien W1 Garder ce code', 'code A2 — adresse 12 rue X Garder ce code']);
    await clic(z.querySelectorAll('[data-dcp-garder]')[1] as HTMLElement);
    expect(arbitre).toEqual([]);
    await clic($('[data-dcp-garder-oui]'));
    expect(arbitre).toEqual([['residence les tilleuls', 'A', { digicode: true, code: 'A2' }]]);
  });
  it('l’historique se déplie (saisies, corrections, changements…)', async () => {
    await act(async () => { root.render(createElement(HoteU)); });
    expect($('[data-dcp-historique] summary').textContent).toBe('Historique des digicodes (1)');
    expect($('[data-dcp-historique-ligne="saisie"]').textContent).toContain('Résidence Les Tilleuls, digicode commun : code 1234 — saisi');
  });
  it('un changement prévu se lit sous le code', async () => {
    FICHE_U.digicodes[0].commun.etat = ETAT({ aVenir: [{ digicode: true, code: '9876', appliqueLe: '2026-11-20T08:00:00.000Z' }] });
    await act(async () => { root.render(createElement(HoteU)); });
    expect($('[data-dcp-a-venir]').textContent).toBe('Changement prévu : code 9876 à partir du 20/11/2026 à 09:00');
  });
});
