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

/**
 * 🔴🔴 Arno (17/11/2026) — « MÈRE / FILLE : « Digicode commun » devient « Digicode copropriété » partout (écrans, récapitulatifs, mails, fenêtres). Les lignes
 * « Digicode bâtiment X » sont légèrement décalées vers la droite sous la ligne copropriété (retrait régulier, avec un trait vertical discret à gauche qui
 * les rattache), et restent alignées entre elles. Au téléphone 390 px, retrait réduit, rien ne déborde. »
 */
describe('🔴 « Digicode copropriété » et les lignes de bâtiment en retrait', () => {
  it('l’intitulé « Digicode copropriété », plus aucun « commun » à l’écran ; chaque ligne de bâtiment porte le retrait (le même pour toutes)', async () => {
    const s = saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [{ cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières', commun: { digicode: null, code: null }, batiments: [] }] });
    await act(async () => { root.render(createElement(DigicodesCopropriete, { s, onChange: () => {}, connus: [A, B], nomenclature: 'lettres', desactive: false })); });
    expect($('[data-dcp-commun]')!.textContent).toContain('Digicode copropriété');
    expect(container.textContent).not.toMatch(/[Dd]igicode commun|[Cc]ode commun/);
    expect([...container.querySelectorAll('[data-dcp-batiment]')].every((x) => x.classList.contains('dcp-ligne--batiment'))).toBe(true);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.dcp-ligne.dcp-ligne--batiment{margin-left:22px;padding-left:16px;border-left:2px solid var(--color-svv-line)');
    expect(css).toContain('@media (max-width:640px){.dcp-ligne.dcp-ligne--batiment{margin-left:8px;padding-left:10px');
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — « « MODIFIER » INTROUVABLE […] rends la différence visible : un code DÉJÀ ENREGISTRÉ s'affiche en lecture (le code en clair, pas un
 * champ), avec « Modifier » (changement daté, fenêtre existante) et « Corriger » ; un code EN COURS DE SAISIE reste un champ, avec la mention discrète
 * « nouveau — enregistré avec le bien » (ou « …avec la copropriété »). »
 */
describe('🔴 enregistré (lu, « Modifier ») ou en cours de saisie (champ, « nouveau — … »)', () => {
  const CONNU = ETAT({ connu: true, valeur: { digicode: true, code: 'A1' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z' });
  const fiche = () => saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [{ cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières',
    commun: { digicode: null, code: null, etat: ETAT() }, batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', etat: CONNU }] }] } as never);
  function Hote({ modeBien }: { modeBien: boolean }) {
    const [s, setS] = useState(fiche);
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: [A, B], nomenclature: 'lettres', desactive: false, modeBien, onPlanifier: async () => null, onCorriger: async () => null });
  }
  it('fiche Copropriété : A enregistré se lit (pas de champ) avec « Modifier » et « Corriger » ; B en saisie : la mention « …avec la copropriété » dès qu’on tape', async () => {
    await act(async () => { root.render(createElement(Hote, { modeBien: false })); });
    const a = $('[data-dcp-batiment="A"]')!;
    expect(a.querySelector('input')).toBeNull();
    expect(a.textContent).toContain('A1');
    expect(a.querySelector('[data-dcp-modifier]')).not.toBeNull();
    expect(a.textContent).toContain('Corriger');
    expect(container.querySelector('[data-dcp-nouveau]')).toBeNull(); // rien saisi : pas de mention
    await saisir($('[data-dcp-batiment="B"] [data-dcp-code-batiment]')!, 'B7');
    expect($('[data-dcp-batiment="B"] [data-dcp-nouveau]')?.textContent).toBe('nouveau — enregistré avec la copropriété');
    expect(a.querySelector('[data-dcp-nouveau]')).toBeNull();
  });
  it('la fiche du bien : « …avec le bien » (le code copropriété en saisie, « pas de digicode » compris)', async () => {
    await act(async () => { root.render(createElement(Hote, { modeBien: true })); });
    await clic($('[data-dcp-commun] .dcp-aucun input')!);
    expect($('[data-dcp-commun] [data-dcp-nouveau]')?.textContent).toBe('nouveau — enregistré avec le bien');
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — « BOUTON ROND « − » au bout de chaque ligne de bâtiment (même colonne que « + », même taille) : ligne en cours de saisie : fenêtre de
 * confirmation (« Retirer la ligne Digicode bâtiment X et son code ? »), puis retrait de l'écran ; code déjà enregistré : fenêtre de confirmation qui dit
 * clairement que le code est RETIRÉ […] ; la ligne copropriété n'a pas de « − » (on utilise « pas de digicode »). »
 */
describe('🔴 le « − » des lignes de bâtiment', () => {
  const CONNU = ETAT({ connu: true, valeur: { digicode: true, code: 'A1' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z' });
  let retraits: [string, string][] = [];
  let reponse: string | null = null;
  function Hote() {
    const [s, setS] = useState(() => saisieDigicodesInitiale({ batimentsConnus: [A, B], digicodes: [{ cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières',
      commun: { digicode: null, code: null, etat: ETAT() }, batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', etat: CONNU }] }] } as never));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: [A, B], nomenclature: 'lettres', desactive: false, onPlanifier: async () => null,
      onRetirer: async (a: string, b: string) => { retraits.push([a, b]); return reponse; } });
  }
  beforeEach(() => { retraits = []; reponse = null; });
  const fenetre = () => document.querySelector('[data-dcp-fenetre-retirer]');
  it('la ligne copropriété n’a pas de « − » ; chaque ligne de bâtiment en a un, rond, de la classe du « + »', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    expect($('[data-dcp-commun] [data-dcp-moins]')).toBeNull();
    expect($('[data-dcp-batiment="A"] [data-dcp-moins]')?.getAttribute('data-dcp-moins')).toBe('enregistre');
    expect($('[data-dcp-batiment="B"] [data-dcp-moins]')?.getAttribute('data-dcp-moins')).toBe('saisie');
    expect($('[data-dcp-batiment="A"] [data-dcp-moins]')?.classList.contains('dcp-plus')).toBe(true);
  });
  it('code enregistré : la fenêtre dit qu’il est RETIRÉ ; « Annuler » ne fait rien ; « Retirer le code » appelle le retrait (place, bâtiment) ; un refus est dit', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await clic($('[data-dcp-batiment="A"] [data-dcp-moins]')!);
    expect(fenetre()?.textContent).toContain('Retirer le digicode du bâtiment A ?');
    expect(fenetre()?.textContent).toContain('Le bâtiment A n’aura plus de digicode à partir de maintenant ; l’ancien code reste dans l’historique.');
    await clic(document.querySelector('[data-dcp-retirer-non]')!);
    expect([fenetre(), retraits]).toEqual([null, []]);
    reponse = 'Refus d’essai.';
    await clic($('[data-dcp-batiment="A"] [data-dcp-moins]')!);
    await clic(document.querySelector('[data-dcp-retirer-oui]')!);
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('[data-dcp-retirer-erreur]')?.textContent).toBe('Refus d’essai.');
    reponse = null;
    await clic(document.querySelector('[data-dcp-retirer-oui]')!);
    await act(async () => { await Promise.resolve(); });
    expect(retraits).toEqual([['7 rue x', 'A'], ['7 rue x', 'A']]);
    expect(fenetre()).toBeNull();
  });
  it('ligne en cours de saisie : « Retirer la ligne Digicode bâtiment B et son code ? », puis elle quitte l’écran ; aucun retrait en base', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await saisir($('[data-dcp-batiment="B"] [data-dcp-code-batiment]')!, 'B7');
    await clic($('[data-dcp-batiment="B"] [data-dcp-moins]')!);
    expect(fenetre()?.textContent).toContain('Retirer la ligne Digicode bâtiment B et son code ?');
    await clic(document.querySelector('[data-dcp-retirer-oui]')!);
    await act(async () => { await Promise.resolve(); });
    expect($('[data-dcp-batiment="B"]')).toBeNull();
    expect(retraits).toEqual([]);
  });
});

/** 🔴🔴 Arno (17/11/2026) — « « pas de digicode » : cocher vide le champ, mais la valeur tapée est gardée en mémoire ; décocher la fait réapparaître. Même chose pour le
 *  copropriété et chaque bâtiment. » */
describe('🔴 « pas de digicode » garde la valeur tapée', () => {
  function Hote() {
    const [s, setS] = useState(() => saisieDigicodesInitiale({ batimentsConnus: [A], digicodes: [{ cle: '7 rue x', voie: '7 rue X', codePostal: '92600', commune: 'Asnières',
      commun: { digicode: null, code: null }, batiments: [] }] }));
    return createElement(DigicodesCopropriete, { s, onChange: setS, connus: [A], nomenclature: 'lettres', desactive: false });
  }
  const val = (sel: string) => ($(sel) as HTMLInputElement).value;
  it('copropriété et bâtiment : cocher vide le champ ; décocher rend la valeur ; vidée puis cochée : rien ne revient', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    await saisir($('[data-dcp-code-commun]')!, 'C123');
    await saisir($('[data-dcp-batiment="A"] [data-dcp-code-batiment]')!, 'A456');
    await clic($('[data-dcp-aucun-commun]')!);
    await clic($('[data-dcp-aucun-batiment]')!);
    expect([val('[data-dcp-code-commun]'), val('[data-dcp-code-batiment]')]).toEqual(['', '']);
    expect(($('[data-dcp-code-commun]') as HTMLInputElement).placeholder).toBe('pas de digicode');
    await clic($('[data-dcp-aucun-commun]')!);
    await clic($('[data-dcp-aucun-batiment]')!);
    expect([val('[data-dcp-code-commun]'), val('[data-dcp-code-batiment]')]).toEqual(['C123', 'A456']);
    await saisir($('[data-dcp-code-commun]')!, '');
    await clic($('[data-dcp-aucun-commun]')!);
    await clic($('[data-dcp-aucun-commun]')!);
    expect(val('[data-dcp-code-commun]')).toBe('');
  });
});
