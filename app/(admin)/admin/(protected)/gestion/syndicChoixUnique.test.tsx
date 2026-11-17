// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FicheSyndic } from './FicheSyndic';
import { PiedDoublonSyndic } from './PropositionsSyndic';
import { BlocSyndic, type SyndicChoisi } from '../location/BlocSyndicBien';
import { EcranSyndics } from './EcranSyndics';

/**
 * 🔴🔴 Arno (17/11/2026) — « choix du syndic par UN SEUL bouton, recherche d'abord, création seulement si rien ne correspond (pour éviter les syndics en
 * double). […] un seul bouton « Choisir le syndic » (« Changer de syndic » s'il y en a déjà un). Il ouvre la recherche des syndics existants […] Un résultat
 * choisi → le syndic est rattaché, comme aujourd'hui. Aucun résultat (ou aucun ne convient) → sous la liste, un bouton « Créer le syndic « <texte tapé> » »
 * qui ouvre la création existante avec le nom pré-rempli. La création n'est JAMAIS accessible sans être passé par la recherche. Garde-fou de doublon […]
 * « Ce syndic existe peut-être déjà : … » avec « Choisir celui-ci » ou « Non, c'est un autre syndic — créer quand même ». » Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const EXISTANT = { id: 41, nom: '_TEST SYNDIC Élysée', email: 'contact@test-syndic.invalid', telephone: '0140000001', ville: 'Asnières', nbCoproprietes: 1, nbBiens: 2, cherchable: '' };
const COMPARABLE = { id: 41, nom: '_TEST SYNDIC Élysée', adresse: '1 rue _TEST', codePostal: '92600', ville: 'Asnières', emails: ['contact@test-syndic.invalid'], telephones: ['0140000001'] };

let hote: HTMLDivElement; let racine: Root; let ecritures: string[]; let recherches: string[];
beforeEach(() => {
  hote = document.createElement('div'); hote.className = 'svv-adm-root'; document.body.appendChild(hote); racine = createRoot(hote);
  ecritures = []; recherches = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method !== undefined && init.method !== 'GET') { ecritures.push(`${init.method} ${u}`); return reponse({ ok: true }); }
    if (u.includes('/syndics/connus')) return reponse({ etat: 'ok', syndics: [] });
    if (u.includes('/syndics/comparables')) return reponse({ etat: 'ok', syndics: [COMPARABLE] });
    if (u.includes('/syndics/41')) return reponse({ etat: 'ok', fiche: { ...EXISTANT, adresse: '1 rue _TEST', codePostal: '92600', telephone2: '', note: null, contacts: [], coproprietes: [], historique: [] } });
    if (u.includes('/syndics/immeubles')) return reponse({ etat: 'ok', disponible: true, immeubles: [] });
    if (u.includes('/api/admin/gestion/syndics?q=')) {
      const q = decodeURIComponent(u.split('q=')[1] ?? ''); recherches.push(q);
      return reponse({ syndics: q === '' || 'test syndic elysee'.includes(q.toLowerCase().replace(/[_é]/g, (c) => (c === 'é' ? 'e' : ' ')).trim()) ? [EXISTANT] : [] });
    }
    return reponse({ etat: 'ok', data: [] });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const bouton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const taper = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
  await calmer();
};
const IMMEUBLE = { libelle: '7 rue _TEST SYNDIC', codePostal: '92600', commune: 'Asnières-sur-Seine' };

describe('🔴 la ligne « Syndic » du bien : un seul bouton, la recherche d’abord', () => {
  function Hote() {
    const [choisi, setChoisi] = useState<SyndicChoisi | null>(null);
    return createElement(BlocSyndic, { adresse: { libelle: IMMEUBLE.libelle, codePostal: IMMEUBLE.codePostal, commune: IMMEUBLE.commune }, choisi, onChoisi: setChoisi });
  }
  it('« Choisir / créer le syndic » (avant : « Choisir le syndic » ; plus de loupe ni de « + ») ouvre la RECHERCHE ; un résultat choisi est rattaché sans écriture ; le bouton dit alors « Changer de syndic »', async () => {
    await act(async () => { racine.render(createElement(Hote)); });
    expect(document.querySelector('[data-loupe]')).toBeNull();
    expect(document.querySelector('[data-creer-syndic]')).toBeNull();
    const b = document.querySelector('[data-choisir-syndic]') as HTMLButtonElement;
    expect(b.textContent).toBe('Choisir / créer le syndic'); // CE QU’IL DISAIT AVANT : « Choisir le syndic » (Arno, 17/11/2026)
    await act(async () => { b.click(); });
    await calmer();
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Syndic de la copropriété');
    expect(document.body.textContent).not.toContain('Nom du cabinet'); // jamais la création d'emblée
    await taper(document.querySelector('input[type="search"]') as HTMLInputElement, 'élysée');
    expect(recherches.at(-1)).toBe('élysée');
    await act(async () => { bouton('Rattacher cet immeuble à ce syndic')!.click(); });
    await calmer();
    expect(document.querySelector('[data-syndic-choisi]')?.textContent).toContain('_TEST SYNDIC Élysée');
    expect(document.querySelector('[data-choisir-syndic]')?.textContent).toBe('Changer de syndic');
    expect(ecritures).toEqual([]);
  });
});

/** 🔴 Arno (17/11/2026) — « Le second bouton « Changer de syndic » du bloc du syndic choisi (celui qui vide le choix) est RENOMMÉ « Retirer le syndic », avec
 *  une fenêtre de confirmation (« Retirer le syndic de ce bien ? Le syndic reste dans l'annuaire. »). Le bouton du haut garde « Changer de syndic ». » */
describe('🔴 « Retirer le syndic » (le bouton qui vide le choix), avec sa fenêtre', () => {
  function Hote() {
    const [choisi, setChoisi] = useState<SyndicChoisi | null>({ id: 41, nom: '_TEST SYNDIC Élysée', ville: 'Asnières', contactsIds: [], nouveauxContacts: [] });
    return createElement(BlocSyndic, { adresse: { libelle: IMMEUBLE.libelle, codePostal: IMMEUBLE.codePostal, commune: IMMEUBLE.commune }, choisi, onChoisi: setChoisi });
  }
  it('le haut dit « Changer de syndic » ; le bloc dit « Retirer le syndic » ; « Annuler » garde le syndic ; « Retirer le syndic » le retire du bien, rien n’est écrit', async () => {
    await act(async () => { racine.render(createElement(Hote)); });
    await calmer();
    expect(document.querySelector('[data-choisir-syndic]')?.textContent).toBe('Changer de syndic');
    const bloc = document.querySelector('[data-syndic-choisi]')!;
    expect([...bloc.querySelectorAll('button')].map((b) => b.textContent)).toContain('Retirer le syndic');
    expect([...bloc.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Changer de syndic');
    await act(async () => { (bloc.querySelector('[data-retirer-syndic]') as HTMLButtonElement).click(); });
    const f = document.querySelector('[data-fenetre-retirer-syndic]') as HTMLElement;
    expect(f.getAttribute('role')).toBe('alertdialog');
    expect(f.textContent).toContain('Retirer le syndic de ce bien ?');
    expect(f.textContent).toContain('Le syndic reste dans l’annuaire.');
    await act(async () => { (f.querySelector('[data-retirer-syndic-non]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-fenetre-retirer-syndic]')).toBeNull();
    expect(document.querySelector('[data-syndic-choisi]')?.textContent).toContain('_TEST SYNDIC Élysée');
    await act(async () => { (document.querySelector('[data-retirer-syndic]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector('[data-retirer-syndic-oui]') as HTMLButtonElement).click(); });
    expect(document.querySelector('[data-syndic-choisi]')).toBeNull();
    expect(document.querySelector('[data-choisir-syndic]')?.textContent).toBe('Choisir / créer le syndic');
    expect(ecritures).toEqual([]);
  });
});

describe('🔴 la fenêtre (variante Location) : créer seulement après la recherche', () => {
  const ouvrir = async (onChoisi: (s: unknown) => void = () => {}) => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onChoisi, onFerme: () => {} })); });
    await calmer();
  };
  it('rien tapé : aucun bouton de création (une invitation à chercher) ; aucun résultat : « Créer le syndic « … » » ouvre la création, le nom pré-rempli', async () => {
    await ouvrir();
    expect(bouton('Créer un nouveau syndic')).toBeUndefined();
    expect(document.querySelector('[data-fsy-creer-recherche]')).toBeNull();
    expect(document.querySelector('[data-fsy-creer-apres-recherche]')).not.toBeNull();
    await taper(document.querySelector('input[type="search"]') as HTMLInputElement, '_TEST SYNDIC NOUVEAU');
    expect(document.body.textContent).toContain('Aucun syndic ne répond à cette recherche.');
    const creer = document.querySelector('[data-fsy-creer-recherche]') as HTMLButtonElement;
    expect(creer.textContent?.trim()).toBe('Créer le syndic « _TEST SYNDIC NOUVEAU »');
    await act(async () => { creer.click(); });
    await calmer();
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Créer un syndic');
    const nom = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes('Nom du cabinet'))!.querySelector('input') as HTMLInputElement;
    expect(nom.value).toBe('_TEST SYNDIC NOUVEAU');
    expect(ecritures).toEqual([]);
  });
  it('des résultats qui ne conviennent pas : le bouton de création est SOUS la liste', async () => {
    await ouvrir();
    await taper(document.querySelector('input[type="search"]') as HTMLInputElement, 'elysee');
    const liste = document.querySelector('.fsy-liste')!;
    const creer = document.querySelector('[data-fsy-creer-recherche]')!;
    expect(liste.compareDocumentPosition(creer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(creer.textContent?.trim()).toBe('Créer le syndic « elysee »');
  });
  it('doublon pendant la création : « Ce syndic existe peut-être déjà : … » ; « Choisir celui-ci » le rattache au bien, sans rien écrire', async () => {
    const choisis: unknown[] = [];
    await ouvrir((s) => choisis.push(s));
    await taper(document.querySelector('input[type="search"]') as HTMLInputElement, 'Cabinet _TEST SYNDIC ELYSEE S.A.S.');
    await act(async () => { (document.querySelector('[data-fsy-creer-recherche]') as HTMLButtonElement).click(); });
    await calmer();
    const bandeau = document.querySelector('.psy-bandeau--doublon') as HTMLElement;
    expect(bandeau.textContent).toContain('Ce syndic existe peut-être déjà :');
    expect(bandeau.textContent).toContain('_TEST SYNDIC Élysée');
    expect(bandeau.querySelector('[data-psy-choisir]')?.textContent?.trim()).toBe('Choisir celui-ci');
    expect(bouton('Voir la fiche')).not.toBeUndefined(); // rien d'autre n'est retiré
    expect(bandeau.querySelector('.psy-note')?.textContent).toContain('« Non, c’est un autre syndic — créer quand même » reste possible au moment de valider');
    await act(async () => { (bandeau.querySelector('[data-psy-choisir]') as HTMLButtonElement).click(); });
    await calmer();
    expect(choisis).toEqual([{ id: 41, nom: '_TEST SYNDIC Élysée', ville: 'Asnières' }]);
    expect(ecritures).toEqual([]);
  });
  it('au « Valider » d’une création qui ressemble : « Choisir celui-ci » ou « Non, c’est un autre syndic — créer quand même » (Location) ; la Gestion inchangée', async () => {
    const d = [{ syndic: { id: 41, nom: '_TEST SYNDIC Élysée', ville: 'Asnières', adresse: '1 rue _TEST', codePostal: '92600' }, criteres: ['nom' as const], email: null, telephone: null }];
    const choix: number[] = []; let cree = 0;
    await act(async () => { racine.render(createElement(PiedDoublonSyndic, { doublons: d, onRevenir: () => {}, onCreer: () => { cree += 1; },
      motCreer: 'Non, c’est un autre syndic — créer quand même', onChoisir: (id: number) => choix.push(id) })); });
    expect(document.body.textContent).toContain('Ce syndic existe peut-être déjà :');
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Revenir', 'Choisir celui-ci', 'Non, c’est un autre syndic — créer quand même']);
    await act(async () => { bouton('Choisir celui-ci')!.click(); bouton('Non, c’est un autre syndic — créer quand même')!.click(); });
    expect([choix, cree]).toEqual([[41], 1]);
    await act(async () => { racine.render(createElement(PiedDoublonSyndic, { doublons: d, onRevenir: () => {}, onCreer: () => {} })); });
    expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Revenir', 'Créer quand même']);
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — « MÊME RÈGLE PARTOUT, recherche d'abord, création seulement depuis les résultats : le bouton « Créer un nouveau syndic » de la
 * fenêtre côté Gestion (fiche du bien Gestion, cartes de l'annuaire, BoutonSyndic) et « + Créer un syndic » de l'écran « Syndics » ouvrent désormais la
 * recherche des syndics existants ; « Créer le syndic « <texte tapé> » » n'apparaît que sous les résultats, avec le nom pré-rempli et le même garde-fou de
 * doublon. Les boutons restent à leur place, seul leur parcours change ; libellé possible « Ajouter un syndic ». »
 */
describe('🔴 la Gestion : la recherche d’abord, partout', () => {
  it('la fenêtre (depuis un bien) : « Ajouter un syndic » en tête, à sa place ; il garde la recherche (le curseur dans le champ), jamais le formulaire ; la création vient des résultats, le nom pré-rempli', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, onFerme: () => {} })); });
    await calmer();
    expect([...document.querySelectorAll('.fsy-tete button')].map((b) => b.textContent)).toEqual(['Ajouter un syndic', '×']);
    expect(document.querySelector('[data-fsy-creer-recherche]')).toBeNull();
    (document.querySelector('.fsy input[type="search"]') as HTMLInputElement).blur();
    await act(async () => { bouton('Ajouter un syndic')!.click(); });
    await calmer();
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Syndic de la copropriété');
    expect(document.body.textContent).not.toContain('Nom du cabinet');
    expect(document.activeElement).toBe(document.querySelector('.fsy input[type="search"]'));
    await taper(document.querySelector('.fsy input[type="search"]') as HTMLInputElement, '_TEST SYNDIC GESTION');
    await act(async () => { (document.querySelector('[data-fsy-creer-recherche]') as HTMLButtonElement).click(); });
    await calmer();
    const nom = [...document.querySelectorAll('label')].find((l) => l.textContent?.includes('Nom du cabinet'))!.querySelector('input') as HTMLInputElement;
    expect(nom.value).toBe('_TEST SYNDIC GESTION');
    expect(ecritures).toEqual([]);
  });
  it('le même garde-fou : « Ce syndic existe peut-être déjà : … », « Choisir celui-ci », la note qui cite « Non, c’est un autre syndic — créer quand même »', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, onFerme: () => {} })); });
    await calmer();
    await taper(document.querySelector('.fsy input[type="search"]') as HTMLInputElement, 'Cabinet _TEST SYNDIC ELYSEE S.A.S.');
    await act(async () => { (document.querySelector('[data-fsy-creer-recherche]') as HTMLButtonElement).click(); });
    await calmer();
    const bandeau = document.querySelector('.psy-bandeau--doublon') as HTMLElement;
    expect(bandeau.textContent).toContain('Ce syndic existe peut-être déjà :');
    expect(bandeau.querySelector('[data-psy-choisir]')?.textContent?.trim()).toBe('Choisir celui-ci');
    expect(bandeau.querySelector('.psy-note')?.textContent).toContain('« Non, c’est un autre syndic — créer quand même »');
  });
  it('l’écran « Syndics » : « + Ajouter un syndic » (avant : « + Créer un syndic »), à sa place, ouvre la fenêtre sur la RECHERCHE, jamais sur le formulaire', async () => {
    await act(async () => { racine.render(createElement(EcranSyndics, {})); });
    await act(async () => { await new Promise((r) => setTimeout(r, 260)); }); await calmer();
    const b = document.querySelector('[data-esy-ajouter]') as HTMLButtonElement;
    expect(b.textContent).toBe('+ Ajouter un syndic');
    expect(b.closest('.esy-tete')).not.toBeNull();
    await act(async () => { b.click(); });
    await calmer();
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Syndic de la copropriété');
    expect(document.querySelector('.fsy input[type="search"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('Nom du cabinet');
    expect(document.querySelector('[data-fsy-creer-apres-recherche]')).not.toBeNull();
    await taper(document.querySelector('.fsy input[type="search"]') as HTMLInputElement, '_TEST SYNDIC ECRAN');
    expect(document.querySelector('[data-fsy-creer-recherche]')?.textContent?.trim()).toBe('Créer le syndic « _TEST SYNDIC ECRAN »');
    expect(ecritures).toEqual([]);
  });
});
