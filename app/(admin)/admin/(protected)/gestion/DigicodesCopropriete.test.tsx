// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChoixBatimentCopro, DigicodesBien, DigicodesCopropriete, digicodesBienEnvoi, digicodesModifies, mentionNb, refusDigicodes, saisieDigicodesBien, saisieDigicodesInitiale, type DigicodesAdresseSaisis } from './DigicodesCopropriete';
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
    // 🔴 (Arno, 17/11/2026) une ligne par bâtiment : le nom dans l'intitulé « Digicode bâtiment A » (plus de ligne au nom seul)
    expect($('[data-dcp-intitule-batiment="A"]').textContent).toBe('Digicode bâtiment A');
    expect(container.querySelector('[data-dcp-nom-existant]')).toBeNull();
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
    // 🔴 (Arno, 17/11/2026) le nom validé : le menu devient l'intitulé « Digicode bâtiment C »
    expect(container.querySelector('[data-dcp-adresse="12 rue des lilas"] [data-dcp-nom-batiment]')).toBeNull();
    expect($('[data-dcp-adresse="12 rue des lilas"] [data-dcp-intitule-batiment="C"]').textContent).toBe('Digicode bâtiment C');
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
  // 🔴 Arno (18/11/2026) — « S'il annule, rien n'est ajouté et le champ garde sa saisie » (avant : le champ était vidé)
  it('« Corriger » : rien n’est confirmé ni ajouté, le champ garde sa saisie, la main revient au champ', async () => {
    await ajouterChiffre();
    await clic($('[data-dcp-corriger]'));
    expect(container.querySelector('[data-dcp-avertissement]')).toBeNull();
    expect(($('[data-dcp-nom-batiment]') as HTMLInputElement).value).toBe('2');
    expect(digicodesModifies(dernier)[0].batiments[0]).toMatchObject({ libelle: '2', confirme: false });
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
    // 🔴 (Arno, 17/11/2026) un nom validé devient l'intitulé : le changer = « × » puis une nouvelle ligne (jamais confirmée d'office)
    // (17/11/2026) le « × » est devenu le « − » rond : retirer la ligne se confirme
    await clic($('[data-dcp-adresse="residence les tilleuls"] [data-dcp-batiment="nouveau"] [data-dcp-moins]'));
    await act(async () => { (document.querySelector('[data-dcp-retirer-oui]') as HTMLElement).click(); await Promise.resolve(); });
    await clic($('[data-dcp-adresse="residence les tilleuls"] [data-dcp-plus]'));
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
    expect($('[data-dcp-historique-ligne="saisie"]').textContent).toContain('Résidence Les Tilleuls, digicode copropriété : code 1234 — saisi');
  });
  it('un changement prévu se lit sous le code', async () => {
    FICHE_U.digicodes[0].commun.etat = ETAT({ aVenir: [{ digicode: true, code: '9876', appliqueLe: '2026-11-20T08:00:00.000Z' }] });
    await act(async () => { root.render(createElement(HoteU)); });
    expect($('[data-dcp-a-venir]').textContent).toBe('Changement prévu : code 9876 à partir du 20/11/2026 à 09:00');
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 4) la fiche du BIEN : le menu du bâtiment et le même composant', () => {
  const ETAT = (o: Record<string, unknown> = {}) => ({ connu: false, valeur: null, depuis: null, source: null, aVenir: [], aArbitrer: [], historique: [], ...o });
  const DONNEES = { adresseCle: 'residence les tilleuls', connus: CONNUS, nomenclature: 'lettres' as const, batiment: null, batimentLie: false, escalier: null,
    copropriete: { cle: 'residence les tilleuls', libelle: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris' },
    adresse: { cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris',
      commun: { digicode: true, code: '1234', nbBiens: 4, etat: ETAT({ connu: true, valeur: { digicode: true, code: '1234' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z' }) },
      batiments: [{ cle: 'a', libelle: 'A', digicode: null, code: null, nbBiens: 2, etat: ETAT() }] } };
  let choix: [string, boolean][] = [];
  let derniereSaisie: DigicodesAdresseSaisis | null = null;
  function HoteBien({ escalier = '', batimentDepart = '' }: { escalier?: string; batimentDepart?: string }) {
    const [bat, setBat] = useState(batimentDepart);
    const [s, setS] = useState(() => saisieDigicodesBien(DONNEES as never));
    derniereSaisie = s;
    return createElement('div', null,
      createElement(ChoixBatimentCopro, { valeur: bat, connus: CONNUS, nomenclature: 'lettres', escalier, desactive: false, onChoix: (l: string, c: boolean) => { choix.push([l, c]); setBat(l); } }),
      createElement(DigicodesBien, { donnees: DONNEES as never, s, onChange: setS, batiment: bat, desactive: false }));
  }
  beforeEach(() => { choix = []; derniereSaisie = null; });
  it('le menu : les bâtiments de TOUTE la copropriété, « Aucun bâtiment (digicode copropriété) », « Ajouter nouveau bâtiment » ; choisir A montre SA ligne', async () => {
    await act(async () => { root.render(createElement(HoteBien)); });
    await clic($('[data-cbc-champ]'));
    expect([...container.querySelectorAll('[data-cbc-menu] button')].map((b) => b.textContent)).toEqual(['Aucun bâtiment (digicode copropriété)', 'A', 'C', 'Côté cour', 'Ajouter nouveau bâtiment']); // (Arno, 17/11/2026) « Aucun » en tête
    await clic($('[data-cbc-option="A"]'));
    expect(choix.at(-1)).toEqual(['A', false]);
    expect($('[data-digicodes-bien] [data-dcp-commun] [data-dcp-lue-valeur]').textContent).toContain('code 1234');
    expect($('[data-digicodes-bien] [data-dcp-batiment="A"] [data-dcp-code-batiment]')).not.toBeNull(); // A n'a pas de code : à saisir
    expect(container.querySelector('[data-digicodes-bien] [data-dcp-plus]')).toBeNull(); // pas de « + » ici
    expect($('[data-dcp-mention-commun]').textContent).toBe('Commun aux 4 biens du portefeuille de cette adresse.');
  });
  it('🔴 un NOUVEAU bâtiment hors numérotation : la MÊME fenêtre d’avertissement ; « Confirmer » le garde (confirmé), « Corriger » n’ajoute rien et garde la saisie', async () => {
    await act(async () => { root.render(createElement(HoteBien)); });
    await saisir($('[data-cbc-champ]'), '3');
    await act(async () => { $('[data-cbc-champ]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(document.querySelector('[data-dcp-avertissement] [role="alertdialog"]')?.textContent).toContain('« 3 » est un chiffre');
    await clic($('[data-dcp-confirmer]'));
    expect(choix.at(-1)).toEqual(['3', true]);
    await saisir($('[data-cbc-champ]'), '4');
    await act(async () => { $('[data-cbc-champ]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    const avant = choix.length;
    await clic($('[data-dcp-corriger]'));
    // 🔴 (18/11/2026) rien de choisi ni d'ajouté par « Corriger » ; le champ garde « 4 » (non confirmé)
    expect(choix.length).toBe(avant);
    expect(choix.at(-1)).toEqual(['4', false]);
    expect(($('[data-cbc-champ]') as HTMLInputElement).value).toBe('4');
  });
  it('l’« Escalier » du bien propose le bon bâtiment (rien n’est écrasé)', async () => {
    await act(async () => { root.render(createElement(HoteBien, { escalier: 'c' })); });
    // (Arno, 17/11/2026 : le champ « Escalier » est retiré ; l'escalier noté est proposé)
    expect($('[data-cbc-escalier]').textContent).toBe('Escalier noté : c — choisir ce bâtiment ?');
    expect(choix).toEqual([]);
    await clic($('[data-cbc-escalier]'));
    expect(choix.at(-1)).toEqual(['C', false]);
  });
  it('ce qui part : le bâtiment choisi et la PREMIÈRE valeur des places sans code (jamais un code connu)', async () => {
    await act(async () => { root.render(createElement(HoteBien, { batimentDepart: 'A' })); });
    await saisir($('[data-digicodes-bien] [data-dcp-code-batiment]'), 'A77');
    expect(digicodesBienEnvoi(derniereSaisie!, 'A', false)).toEqual({ batiment: 'A', batimentConfirme: false, commun: null, codeBatiment: { code: 'A77', aucun: false }, autres: [] });
    // (17/11/2026) sans bâtiment choisi, la ligne de A reste, et le code saisi dessus part avec elle (jamais perdu)
    expect(digicodesBienEnvoi(derniereSaisie!, '', false)).toEqual({ batiment: null, batimentConfirme: false, commun: null, codeBatiment: null,
      autres: [{ libelle: 'A', confirme: false, code: { code: 'A77', aucun: false } }] });
  });
  it('les mentions reprises de l’ancienne saisie par adresse (« commun aux N biens »)', () => {
    expect([mentionNb(3, null), mentionNb(1, 'B'), mentionNb(0, 'C')]).toEqual(['Commun aux 3 biens du portefeuille de cette adresse.', 'Le seul bien du portefeuille du bâtiment B le lit.', 'Aucun bien du portefeuille du bâtiment C pour l’instant.']);
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 5) « Modifier » : la fenêtre datée', () => {
  const E = (o: Record<string, unknown> = {}) => ({ connu: true, valeur: { digicode: true, code: '1234' }, depuis: '2026-11-01T10:00:00.000Z', source: 'unifie', aVenir: [], aArbitrer: [], historique: [], ...o });
  const F = () => ({ digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234', etat: E() },
    batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', etat: E({ valeur: { digicode: true, code: 'A1' } }) },
      { cle: 'c', libelle: 'C', digicode: true, code: 'C3', etat: E({ valeur: { digicode: true, code: 'C3' }, aVenir: [{ id: 9, digicode: true, code: 'C4', appliqueLe: '2099-01-10T08:00:00.000Z' }] }) }] }] });
  let planifies: unknown[] = []; let annules: unknown[] = [];
  function HoteM() {
    const [s, setS] = useState(saisieDigicodesInitiale(F() as never));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false,
      onPlanifier: async (...a: unknown[]) => { planifies.push(a); return null; }, onAnnulerChangement: async (...a: unknown[]) => { annules.push(a); return null; } });
  }
  beforeEach(() => { planifies = []; annules = []; });
  it('« Modifier » sur le bâtiment A : la fenêtre liste les codes de l’adresse, A coché ; C a déjà un changement prévu (non cochable) ; rien ne part sans nouveau code', async () => {
    await act(async () => { root.render(createElement(HoteM)); });
    await clic($('[data-dcp-batiment="A"] [data-dcp-modifier]'));
    const f = $('[data-dcp-fenetre-modifier]');
    expect([...f.querySelectorAll('[data-dcp-modifier-place]')].map((x) => x.getAttribute('data-dcp-modifier-place'))).toEqual(['commun', 'A', 'C']);
    expect([...f.querySelectorAll('[data-dcp-modifier-coche]')].map((x) => [(x as HTMLInputElement).checked, (x as HTMLInputElement).disabled])).toEqual([[false, false], [true, false], [false, true]]);
    expect(f.textContent).toContain('Un changement est déjà prévu le 10/01/2099 à 09:00 : annulez-le d’abord.');
    expect(($('[data-dcp-modifier-valider]') as HTMLButtonElement).disabled).toBe(true);
    expect($('[data-dcp-modifier-manque]').textContent).toContain('Saisissez le nouveau code');
  });
  it('🔴 (Arno, 17/11/2026) le commun ET A, CHACUN sa date (l’heure facultative) : un seul envoi, nouveau code en face de chaque actuel', async () => {
    await act(async () => { root.render(createElement(HoteM)); });
    await clic($('[data-dcp-batiment="A"] [data-dcp-modifier]'));
    await clic($('[data-dcp-modifier-place="commun"] [data-dcp-modifier-coche]'));
    await saisir($('[data-dcp-modifier-place="commun"] [data-dcp-modifier-code]'), 'Z7Z6');
    await saisir($('[data-dcp-modifier-place="A"] [data-dcp-modifier-code]'), 'A9');
    await act(async () => { const d = $('[data-dcp-modifier-place="commun"] [data-dcp-modifier-date]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '2099-06-01'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { const d = $('[data-dcp-modifier-place="commun"] [data-dcp-modifier-heure]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '09:00'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { const d = $('[data-dcp-modifier-place="A"] [data-dcp-modifier-date]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '2099-06-05'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    await clic($('[data-dcp-modifier-valider]'));
    // le premier instant en tête ; A sans heure : le début de sa journée (Paris), « avecHeure: false » (le mail n'affichera que la date)
    expect(planifies).toEqual([['residence les tilleuls', '2099-06-01T07:00:00.000Z', [
      { batiment: null, digicode: true, code: 'Z7Z6', appliqueLe: '2099-06-01T07:00:00.000Z', avecHeure: true },
      { batiment: 'A', digicode: true, code: 'A9', appliqueLe: '2099-06-04T22:00:00.000Z', avecHeure: false }]]]);
    expect(container.querySelector('[data-dcp-fenetre-modifier]')).toBeNull();
  });
  it('une date passée : refusée à l’écran', async () => {
    await act(async () => { root.render(createElement(HoteM)); });
    await clic($('[data-dcp-commun] [data-dcp-modifier]'));
    await saisir($('[data-dcp-modifier-place="commun"] [data-dcp-modifier-code]'), '1');
    await act(async () => { const d = $('[data-dcp-modifier-date]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '2020-01-01'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    expect($('[data-dcp-modifier-manque]').textContent).toBe('La date (et l’heure) d’activation de chaque code doivent être à venir.');
  });
  it('« Annuler ce changement » demande confirmation, puis part', async () => {
    await act(async () => { root.render(createElement(HoteM)); });
    await clic($('[data-dcp-batiment="C"] [data-dcp-annuler-changement]'));
    expect(annules).toEqual([]);
    await clic($('[data-dcp-annuler-changement-oui]'));
    expect(annules).toEqual([['residence les tilleuls', 9]]);
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 6) « Modifier » → l’écran des destinataires → l’envoi', () => {
  const E = { connu: true, valeur: { digicode: true, code: '1234' }, depuis: '2026-11-01T10:00:00.000Z', source: 'unifie', aVenir: [], aArbitrer: [], historique: [] };
  const F = { digicodes: [{ cle: 'residence les tilleuls', voie: 'Résidence Les Tilleuls', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234', etat: E }, batiments: [] }] };
  const p = { id: 9, nom: 'PROPRIO', prenom: 'Jean', emails: ['j@exemple.test'] };
  const APERCU = { adresse: 'Résidence Les Tilleuls', adresseCle: 'residence les tilleuls', appliqueLe: '2099-06-01T07:00:00.000Z', logements: [
    { lotId: 1, libelle: 'Résidence Les Tilleuls — lot 1', batiment: 'A', proprietaires: [p], codes: { commun: { digicode: true, code: 'Z7' }, batiment: { digicode: true, code: 'A1' }, communChange: true, batimentChange: false },
      locataires: [{ id: 1, occupationId: 11, nom: 'MARTIN', prenom: 'Léa', emails: ['l@exemple.test'], depart: null, inclus: true, raison: null },
        { id: 2, occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: [], depart: null, inclus: true, raison: null }] },
    { lotId: 2, libelle: 'Résidence Les Tilleuls — lot 2', batiment: 'B', proprietaires: [p], codes: { commun: { digicode: true, code: 'Z7' }, batiment: null, communChange: true, batimentChange: false },
      locataires: [{ id: 3, occupationId: 13, nom: 'DURAND', prenom: 'Zoé', emails: ['z@exemple.test'], depart: '2099-05-01', inclus: false, raison: 'parti le 01/05' }] }] };
  let envois: unknown[] = [];
  function HoteE() {
    const [s, setS] = useState(saisieDigicodesInitiale(F as never));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false, onPlanifier: async () => null,
      onApercu: async () => APERCU as never,
      onEnvoyer: async (...a: unknown[]) => { envois.push(a); return { enregistre: true, envois: [{ pour: 'Léa MARTIN', objet: 'x', a: ['l@exemple.test'], envoye: true, motif: null }], sansEmail: ['Paul MARTIN'], exclus: ['Zoé DURAND — parti le 01/05'] }; } });
  }
  beforeEach(() => { envois = []; });
  it('« Suivant » : l’écran des destinataires — bâtiment par bâtiment, une ligne par logement, les exclus avec la raison, « pas d’e-mail — à prévenir autrement », le total', async () => {
    await act(async () => { root.render(createElement(HoteE)); });
    await clic($('[data-dcp-commun] [data-dcp-modifier]'));
    await saisir($('[data-dcp-modifier-place="commun"] [data-dcp-modifier-code]'), 'Z7');
    await act(async () => { const d = $('[data-dcp-modifier-date]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '2099-06-01'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    await clic($('[data-dcp-modifier-suivant]'));
    const z = $('[data-dcp-destinataires]');
    expect([...z.querySelectorAll('[data-dcp-dest-batiment]')].map((x) => x.getAttribute('data-dcp-dest-batiment'))).toEqual(['A', 'B']);
    // 🔴 (Arno, 17/11/2026) B : un bloc par logement (adresse, bâtiment), une case par locataire, le total en direct
    expect($('[data-dcp-total]').textContent).toBe('1 logement · 1 locataire sélectionné');
    expect($('[data-dcp-dest-logement="1"] .dcp-dest-entete').textContent).toBe('Résidence Les Tilleuls — lot 1 · bâtiment A');
    expect(($('[data-dcp-dest-locataire="11"]') as HTMLInputElement).checked).toBe(true);
    expect($('[data-dcp-sans-email]').textContent).toBe('Paul MARTIN — pas d’e-mail — à prévenir autrement');
    expect($('[data-dcp-exclu]').textContent).toBe('Zoé DURAND — parti le 01/05 : non prévenu');
    expect(($('[data-dcp-proprietaires]') as HTMLInputElement).checked).toBe(false); // décochée par défaut
    expect($('[data-dcp-envoyer]').textContent).toBe('Valider la mise à jour et envoyer');
    expect($('[data-dcp-bilan]').textContent).toBe('1 mail aux locataires · 1 à prévenir autrement · puis 1 mail à la Gestion');
    await clic($('[data-dcp-proprietaires]'));
    expect($('[data-dcp-liste-proprietaires]').textContent).toContain('Jean PROPRIO — 2 logements (un seul mail)');
    expect($('[data-dcp-bilan]').textContent).toBe('1 mail aux locataires · 1 aux propriétaires · 1 à prévenir autrement · puis 1 mail à la Gestion');
  });
  it('« Enregistrer et envoyer » : le changement et la case propriétaires partent ; le compte rendu dit chaque mail et qui prévenir autrement', async () => {
    await act(async () => { root.render(createElement(HoteE)); });
    await clic($('[data-dcp-commun] [data-dcp-modifier]'));
    await saisir($('[data-dcp-modifier-place="commun"] [data-dcp-modifier-code]'), 'Z7');
    await act(async () => { const d = $('[data-dcp-modifier-date]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '2099-06-01'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { const d = $('[data-dcp-modifier-heure]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '09:00'); d.dispatchEvent(new Event('input', { bubbles: true })); });
    await clic($('[data-dcp-modifier-suivant]'));
    await clic($('[data-dcp-envoyer]'));
    expect(envois).toEqual([['residence les tilleuls', '2099-06-01T07:00:00.000Z', [{ batiment: null, digicode: true, code: 'Z7', appliqueLe: '2099-06-01T07:00:00.000Z', avecHeure: true }], false, { mode: 'locataires', decoches: [] }]]);
    expect($('[data-dcp-compte-rendu]').textContent).toContain('1 mail parti sur 1');
    expect($('[data-dcp-cr-sans-email]').textContent).toBe('À prévenir autrement (pas d’e-mail) : Paul MARTIN.');
  });
});

/** 🔴🔴 Arno (17/11/2026) : « DEUX CHOIX, obligatoires, après la saisie : A. « Prévenir la Gestion seulement » […] B. « Écrire maintenant aux locataires » : […] une case cochée par défaut, décochable une à une ; total « N logements · M locataires sélectionnés » mis à jour en direct […] « Valider la mise à jour et envoyer ». » */
describe('🔴🔴 les deux choix (A / B)', () => {
  const E = { connu: true, valeur: { digicode: true, code: '1234' }, depuis: '2026-11-01T10:00:00.000Z', source: 'unifie', aVenir: [], aArbitrer: [], historique: [] };
  const F = { digicodes: [{ cle: 'residence test', voie: 'Résidence _TEST CHANGEMENT DIGICODE', codePostal: '75011', commune: 'Paris', commun: { digicode: true, code: '1234', etat: E }, batiments: [] }] };
  const APERCU = { adresse: 'Résidence _TEST', adresseCle: 'residence test', appliqueLe: '2099-06-01T07:00:00.000Z', adresseGestion: 'gestion@exemple.test', logements: [
    { lotId: 1, libelle: 'Résidence _TEST — lot 1', batiment: 'A', etage: '2', porte: '21', proprietaires: [], codes: { commun: { digicode: true, code: 'Z7' }, batiment: null, communChange: true, batimentChange: false },
      locataires: [{ id: 1, occupationId: 11, nom: 'MARTIN', prenom: 'Léa', emails: ['l@exemple.test'], depart: null, inclus: true, raison: null },
        { id: 2, occupationId: 12, nom: 'MARTIN', prenom: 'Paul', emails: ['p@exemple.test'], depart: null, inclus: true, raison: null }] }] };
  let envois: unknown[][] = [];
  function H() {
    const [s, setS] = useState(saisieDigicodesInitiale(F as never));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: CONNUS, nomenclature: 'lettres', desactive: false, onPlanifier: async () => null,
      onApercu: async () => APERCU as never,
      onEnvoyer: async (...a: unknown[]) => { envois.push(a); return { enregistre: true, envois: [], sansEmail: [], exclus: [], gestion: { pour: 'la Gestion', objet: 'x', a: ['gestion@exemple.test'], envoye: true, motif: null } }; } });
  }
  const saisirChangement = async () => {
    await act(async () => { root.render(createElement(H)); });
    await clic($('[data-dcp-commun] [data-dcp-modifier]'));
    await saisir($('[data-dcp-modifier-place="commun"] [data-dcp-modifier-code]'), 'Z7');
    await act(async () => { const d = $('[data-dcp-modifier-date]') as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(d, '2099-06-01'); d.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  beforeEach(() => { envois = []; });
  it('les deux choix, obligatoires, après la saisie (désactivés tant qu’il manque quelque chose)', async () => {
    await act(async () => { root.render(createElement(H)); });
    await clic($('[data-dcp-commun] [data-dcp-modifier]'));
    expect([...container.querySelectorAll('[data-dcp-choix-prevenir]')].map((b) => [b.textContent, (b as HTMLButtonElement).disabled]))
      .toEqual([['A. Prévenir la Gestion seulement', true], ['B. Prévenir la Gestion et les locataires', true]]); // CE QU’IL DISAIT : « B. Écrire maintenant aux locataires » (Arno, 17/11/2026)
  });
  it('A : la liste des logements (en-tête : adresse, bâtiment, étage, porte), l’adresse de la Gestion, aucune case ; « Valider la mise à jour et prévenir la Gestion » part en mode « gestion »', async () => {
    await saisirChangement();
    await clic($('[data-dcp-choix-prevenir="gestion"]'));
    expect($('[data-dcp-destinataires]').getAttribute('data-dcp-mode')).toBe('gestion');
    expect($('.dcp-dest-entete').textContent).toBe('Résidence _TEST — lot 1 · bâtiment A · étage 2 · porte 21');
    expect($('[data-dcp-destinataires]').textContent).toContain('gestion@exemple.test');
    expect(container.querySelector('[data-dcp-dest-locataire]')).toBeNull();
    expect($('[data-dcp-envoyer]').textContent).toBe('Valider la mise à jour et prévenir la Gestion');
    await clic($('[data-dcp-envoyer]'));
    expect(envois[0].slice(3)).toEqual([false, { mode: 'gestion', decoches: [] }]);
    expect($('[data-dcp-cr-gestion]').textContent).toBe('Mail à la Gestion — envoyé (gestion@exemple.test)');
  });
  it('B : décocher un locataire met le total à jour en direct ; seuls les cochés partent (les décochés sont envoyés au serveur)', async () => {
    await saisirChangement();
    await clic($('[data-dcp-choix-prevenir="locataires"]'));
    expect($('[data-dcp-total]').textContent).toBe('1 logement · 2 locataires sélectionnés');
    await clic($('[data-dcp-dest-locataire="12"]'));
    expect($('[data-dcp-total]').textContent).toBe('1 logement · 1 locataire sélectionné');
    await clic($('[data-dcp-envoyer]'));
    expect(envois[0].slice(3)).toEqual([false, { mode: 'locataires', decoches: [12] }]);
  });
});
