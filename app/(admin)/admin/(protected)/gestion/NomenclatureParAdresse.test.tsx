// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixBatimentCopro, DigicodesCopropriete, digicodesBienEnvoi, digicodesModifies, refusDigicodes, saisieDigicodesInitiale, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
import {
  avertissementApresSaisie, avertissementBatiment, nomenclatureDeLAdresse, refusDesBatiments, selonOrdreDeCreation, type BatimentConnu,
} from '../../../../lib/gestion/batimentsCopropriete';
import { validerDigicodesBien } from '../../../../lib/gestion/digicodes';

/**
 * 🔴🔴 Arno (18/11/2026) — « dans une copropriété, la nomenclature des bâtiments est commune à une même adresse, en lettres OU en chiffres. Un nom qui
 * sort de la numérotation n'est JAMAIS interdit. Il est seulement signalé par une fenêtre d'avertissement qui demande une confirmation. Aucune fenêtre
 * ne s'affiche quand le nom suit la numérotation. » ; « deux adresses différentes de la même copropriété → numérotations indépendantes ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const L = (x: string, adresseCle?: string): BatimentConnu => ({ cle: x.toLowerCase(), libelle: x, sorte: /^\d+$/.test(x) ? 'chiffre' : 'lettre', ...(adresseCle ? { adresseCle } : {}) });

describe('🔴 la règle (pure)', () => {
  it('LA CAUSE : l’ancien calcul du champ (la seule règle de la base, aucune ici) ne disait rien pour « 3 », même A et B connus du champ', () => {
    expect(avertissementBatiment('3', null, [L('A'), L('B')])).toBeNull();
  });
  it('désormais : après A et B créés pendant la saisie, « 3 » est averti ; « C » ne l’est pas ; le premier créé fixe la règle', () => {
    expect(avertissementApresSaisie('3', null, [], ['A', 'B'])).toMatchObject({ libelle: '3', raison: 'autre_numerotation', reference: 'lettres' });
    expect(avertissementApresSaisie('C', null, [], ['A', 'B'])).toBeNull();
    expect(avertissementApresSaisie('A', null, [], [])).toBeNull();
    expect(avertissementApresSaisie('1', null, [], ['2', '3'])).toBeNull();
    // le nom lui-même, déjà en attente, ne se juge pas contre lui-même
    expect(avertissementApresSaisie('B', null, [], ['A', 'B'])).toBeNull();
  });
  it('🔴 deux adresses indépendantes : chacune sa référence ; une seule adresse (ou sans rangement par adresse) : la règle de la copropriété', () => {
    const connus = [L('A', 'a1'), L('B', 'a1'), L('1', 'a2'), L('2', 'a2')];
    expect(nomenclatureDeLAdresse('lettres', connus, 'a1', true)).toBe('lettres');
    expect(nomenclatureDeLAdresse('lettres', connus, 'a2', true)).toBe('chiffres');
    expect(nomenclatureDeLAdresse('lettres', connus, 'a2', false)).toBe('lettres');
    expect(nomenclatureDeLAdresse(null, [L('A', 'a1')], 'a3', true)).toBeNull();
  });
  it('le serveur juge dans l’ordre de création : A, B puis « 3 » confirmé → permis ; « 3 » non confirmé → le motif ; sans ordre : l’ordre d’avant', () => {
    const recus = [{ libelle: '3', confirme: true }, { libelle: 'A', confirme: false }, { libelle: 'B', confirme: false }];
    const ordonnes = selonOrdreDeCreation(recus, ['A', 'B', '3']);
    expect(ordonnes.map((x) => x.libelle)).toEqual(['A', 'B', '3']);
    expect(refusDesBatiments(ordonnes, null, [])).toBeNull();
    expect(refusDesBatiments(selonOrdreDeCreation([{ libelle: '3', confirme: false }, ...recus.slice(1)], ['A', 'B']), null, []))
      .toBe('Cette copropriété nomme ses bâtiments par des LETTRES (A, B, C…) : utilisez une lettre, ou un intitulé libre (« Côté cour »).');
    expect(selonOrdreDeCreation(recus, undefined)).toEqual(recus);
  });
  it('la saisie lue au serveur garde l’ordre (bornée, noms nettoyés) ; absent : rien', () => {
    expect(validerDigicodesBien({ batiment: '3', autres: [], ordre: [' A ', 'B', '', 3, '3'] })?.ordre).toEqual(['A', 'B', '3']);
    expect(validerDigicodesBien({ batiment: '3', autres: [] })?.ordre).toBeUndefined();
  });
});

describe('🔴 l’envoi du formulaire du bien', () => {
  const S: DigicodesAdresseSaisis = { cle: '43 avenue marceau', voie: '43 Avenue Marceau', codePostal: '92400', commune: 'Courbevoie',
    commun: { code: '', aucun: false }, communInitial: { code: '', aucun: false }, batiments: [] };
  it('l’ordre des bâtiments créés part ; un bâtiment créé et CONFIRMÉ, puis rechoisi au menu, garde sa confirmation', () => {
    const e = digicodesBienEnvoi(S, '3', false, [{ libelle: 'A', confirme: false }, { libelle: '3', confirme: true }, { libelle: 'B', confirme: false }], []);
    expect(e).toMatchObject({ batiment: '3', batimentConfirme: true, ordre: ['A', '3', 'B'] });
    expect(digicodesBienEnvoi(S, 'A', false, [], []).ordre).toBeUndefined();
  });
});

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; });
const $ = (s: string, i = 0) => container.querySelectorAll(s)[i] as HTMLElement;
const saisir = async (el: HTMLElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const clic = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const entree = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); };
const fenetre = () => document.querySelector('[data-dcp-avertissement] [role="alertdialog"]');

describe('🔴 le champ « Bâtiment / cage d’escalier » partagé (« Nouveau bien », « Modifier le bien », fiche du bien côté Gestion)', () => {
  function Hote({ enAttente }: { enAttente?: string[] }) {
    const [v, setV] = useState('');
    return createElement(ChoixBatimentCopro, { valeur: v, connus: [], nomenclature: null, escalier: '', desactive: false, onChoix: (l) => setV(l),
      ...(enAttente ? { enAttente } : {}) });
  }
  it('avec les bâtiments créés pendant la saisie (A, B) : « 3 » ouvre la fenêtre ; « C » non', async () => {
    await act(async () => { root.render(createElement(Hote, { enAttente: ['A', 'B'] })); });
    await saisir($('[data-cbc-champ]'), '3'); await entree($('[data-cbc-champ]'));
    expect(fenetre()?.textContent).toContain('« 3 » est un chiffre');
    await clic(document.querySelector('[data-dcp-corriger]') as HTMLElement);
    await saisir($('[data-cbc-champ]'), 'C'); await entree($('[data-cbc-champ]'));
    expect(fenetre()).toBeNull();
  });
});

describe('🔴 la fiche Copropriété : deux adresses, deux numérotations indépendantes', () => {
  const FICHE = { batimentsParAdresse: true, digicodes: [
    { cle: 'a1', voie: '1 rue Une', codePostal: '92400', commune: 'Courbevoie', commun: { digicode: null, code: null }, batiments: [{ cle: 'a', libelle: 'A', digicode: null, code: null }, { cle: 'b', libelle: 'B', digicode: null, code: null }] },
    { cle: 'a2', voie: '2 rue Deux', codePostal: '92400', commune: 'Courbevoie', commun: { digicode: null, code: null }, batiments: [{ cle: '1', libelle: '1', digicode: null, code: null }, { cle: '2', libelle: '2', digicode: null, code: null }] }],
    batimentsConnus: [L('A', 'a1'), L('B', 'a1'), L('1', 'a2'), L('2', 'a2')] };
  let dernier: DigicodesAdresseSaisis[] = [];
  function Hote() {
    const [s, setS] = useState(saisieDigicodesInitiale(FICHE));
    dernier = s;
    // la règle « de la copropriété » enregistrée : lettres (fixée par le premier bâtiment, à la première adresse)
    return createElement(DigicodesCopropriete, { parAdresse: true, s, onChange: setS, connus: FICHE.batimentsConnus, nomenclature: 'lettres', desactive: false });
  }
  const ajouter = async (adresse: string, nom: string) => {
    await clic($(`[data-dcp-adresse="${adresse}"] [data-dcp-plus]`));
    const champ = $(`[data-dcp-adresse="${adresse}"] [data-dcp-nom-batiment]`);
    await saisir(champ, nom); await entree(champ);
  };
  it('« 3 » à l’adresse en chiffres : aucune fenêtre ; « C » à l’adresse en lettres : aucune fenêtre', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await ajouter('a2', '3');
    expect(fenetre()).toBeNull();
    await ajouter('a1', 'C');
    expect(fenetre()).toBeNull();
    expect(refusDigicodes(dernier, 'lettres', FICHE.batimentsConnus, true)).toBeNull();
  });
  it('« 3 » à l’adresse en lettres : la fenêtre ; « Confirmer » l’accepte (confirmé) ; « D » à l’adresse en chiffres : la fenêtre', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await ajouter('a1', '3');
    expect(fenetre()?.textContent).toContain('« 3 » est un chiffre');
    await clic(document.querySelector('[data-dcp-confirmer]') as HTMLElement);
    expect(digicodesModifies(dernier).find((d) => d.cle === 'a1')?.batiments).toEqual([{ libelle: '3', code: '', aucun: false, confirme: true }]);
    await ajouter('a2', 'D');
    expect(fenetre()?.textContent).toContain('« D » est une lettre');
  });
  it('« Corriger » : rien n’est confirmé, la saisie reste ; l’enregistrement le demande encore (jamais en silence)', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await ajouter('a1', '3');
    await clic(document.querySelector('[data-dcp-corriger]') as HTMLElement);
    expect(fenetre()).toBeNull();
    expect(($('[data-dcp-adresse="a1"] [data-dcp-nom-batiment]') as HTMLInputElement).value).toBe('3');
    expect(refusDigicodes(dernier, 'lettres', FICHE.batimentsConnus, true)).toContain('« 3 »');
  });
});
