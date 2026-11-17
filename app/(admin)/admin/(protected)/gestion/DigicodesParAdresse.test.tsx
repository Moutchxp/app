// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixBatimentCopro, DigicodesCopropriete, ModifierDigicodesLus, saisieDigicodesInitiale } from './DigicodesCopropriete';
import type { BatimentConnu } from '../../../../lib/gestion/batimentsCopropriete';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses multiples d'une copropriété », lot 4) — « les écrans et mails (bâtiments sous leur adresse, menu du bien limité à
 * l'adresse du bien, adresse affichée quand il y en a plusieurs, « − », historique, mails de changement de digicode, choix de l'adresse pour un bâtiment
 * « à préciser ») » ; le modèle : « un bâtiment est identifié par (adresse, nom) et toujours affiché avec son adresse quand il y a plusieurs adresses. Le
 * menu d'un bien ne propose QUE les bâtiments de l'adresse de ce bien. »
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; });
const $ = (s: string) => container.querySelector(s) as HTMLElement | null;
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

const UN = '1 rue test deux adresses'; const TROIS = '3 rue test deux adresses';
const connus: BatimentConnu[] = [
  { cle: 'a', libelle: 'A', sorte: 'lettre', adresseCle: UN }, { cle: 'b', libelle: 'B', sorte: 'lettre', adresseCle: UN },
  { cle: 'a', libelle: 'A', sorte: 'lettre', adresseCle: TROIS }, { cle: 'c', libelle: 'C', sorte: 'lettre', adresseCle: TROIS },
  { cle: 'd', libelle: 'D', sorte: 'lettre', adresseCle: null }];
const adresse = (cle: string, voie: string) => ({ cle, voie, codePostal: '92600', commune: 'Asnières-sur-Seine', commun: { digicode: null, code: null }, batiments: [] });
const FICHE = { digicodes: [adresse(UN, '1 rue _TEST Deux Adresses'), adresse(TROIS, '3 rue _TEST Deux Adresses')], batimentsConnus: connus };
const lignes = (s: ReturnType<typeof saisieDigicodesInitiale>) => s.map((d) => [d.cle, d.batiments.map((b) => b.libelle)]);

describe('🔴 chaque bâtiment sous SON adresse', () => {
  it('par adresse : A et B au 1 rue, A et C au 3 rue — deux « A » distincts ; « D » (à préciser) sous aucune adresse', () => {
    expect(lignes(saisieDigicodesInitiale({ ...FICHE, batimentsParAdresse: true } as never))).toEqual([[UN, ['A', 'B']], [TROIS, ['A', 'C']]]);
  });
  it('sans la 490 : comme avant (le registre à la première adresse, sans répéter un nom déjà ailleurs)', () => {
    expect(lignes(saisieDigicodesInitiale({ ...FICHE, batimentsParAdresse: false } as never))[0][1]).toEqual(['A', 'B', 'C', 'D']);
  });
  it('le menu d’un bloc ne propose QUE les bâtiments de SON adresse (le 3 rue : A, C — jamais B ni D)', async () => {
    function Hote() {
      const [s, setS] = useState(() => saisieDigicodesInitiale({ ...FICHE, batimentsParAdresse: true } as never));
      return createElement(DigicodesCopropriete, { parAdresse: true, s, onChange: setS, connus, nomenclature: 'lettres', desactive: false });
    }
    await act(async () => { root.render(createElement(Hote)); });
    await clic($(`[data-dcp-adresse="${TROIS}"] [data-dcp-commun] .dcp-plus`)!);
    const champ = $(`[data-dcp-adresse="${TROIS}"] [data-dcp-batiment="nouveau"] [data-dcp-nom-batiment]`)!;
    await act(async () => { champ.focus(); champ.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); champ.click(); });
    const options = [...document.querySelectorAll(`[data-dcp-adresse="${TROIS}"] [role="option"], [data-dcp-adresse="${TROIS}"] .dcp-option`)].map((o) => o.textContent?.trim());
    expect(options.filter((o) => o === 'A' || o === 'B' || o === 'C' || o === 'D')).toEqual(['A', 'C']);
  });
});

describe('🔴 l’adresse dite quand la copropriété en a plusieurs', () => {
  it('le menu du bien : « Bâtiments de l’adresse … » ; une seule adresse : rien', async () => {
    await act(async () => { root.render(createElement(ChoixBatimentCopro, { valeur: '', connus: connus.filter((c) => c.adresseCle === TROIS), nomenclature: 'lettres', escalier: '', desactive: false,
      onChoix: () => {}, adresse: '3 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine' })); });
    expect($('[data-cbc-adresse]')?.textContent).toBe('Bâtiments de l’adresse 3 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine');
    await act(async () => { root.render(createElement(ChoixBatimentCopro, { valeur: '', connus: [], nomenclature: null, escalier: '', desactive: false, onChoix: () => {} })); });
    expect($('[data-cbc-adresse]')).toBeNull();
  });
  it('la fiche du bien Gestion (hors édition) : « Code du bâtiment A — 3 rue … » quand il y a plusieurs adresses', async () => {
    const etat = { connu: true, valeur: { digicode: true, code: 'TA3' }, depuis: null, source: 'unifie', aVenir: [], aArbitrer: [], historique: [] };
    const s = saisieDigicodesInitiale({ digicodes: [{ ...adresse(TROIS, '3 rue _TEST Deux Adresses'), batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'TA3', etat }] }] } as never)[0];
    await act(async () => { root.render(createElement(ModifierDigicodesLus, { donnees: { adresseCle: TROIS, plusieursAdresses: true } as never, s, batiment: 'A', onPlanifier: async () => null })); });
    expect($('[data-dcp-lu-place="A"]')?.textContent).toContain('Code du bâtiment A — 3 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine');
  });
  it('le « − » d’un bâtiment, plusieurs adresses : « Retirer le bâtiment A du 3 rue … ? »', async () => {
    function Hote() {
      const [s, setS] = useState(() => saisieDigicodesInitiale({ ...FICHE, batimentsParAdresse: true } as never));
      return createElement(DigicodesCopropriete, { parAdresse: true, s, onChange: setS, connus, nomenclature: 'lettres', desactive: false, onRetirerBatiment: async () => null });
    }
    await act(async () => { root.render(createElement(Hote)); });
    await clic($(`[data-dcp-adresse="${TROIS}"] [data-dcp-batiment="A"] [data-dcp-moins]`)!);
    expect(document.querySelector('#dcp-retirer-titre')?.textContent).toBe('Retirer le bâtiment A du 3 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine ?');
  });
});

