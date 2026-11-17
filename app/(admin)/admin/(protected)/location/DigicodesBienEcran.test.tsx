// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location/nouveau-bien', useRouter: () => ({ push: vi.fn() }) }));
import { CreationBien } from './CreationBien';
import { valeursDepuis } from '../../../../lib/location/encartBien';
import { gestesPour } from '../../../../lib/gestion/statutBien';
import type { ComplementsFiche } from '../../../../lib/location/bienComplet';
import type { LectureFiche } from '../../../../lib/location/ficheBienEntiereRepo';

/**
 * 🔴🔴 Arno (16/11/2026, « Digicodes unifiés », lot 4) — la fiche du bien en Location (« Modifier le bien », le même composant que « Nouveau bien ») :
 * avec la base unique, le « Bâtiment » se CHOISIT dans le menu de la copropriété, les codes connus se LISENT, une place sans code se saisit, et ce
 * qui part est le bâtiment choisi et les premières valeurs (le chemin serveur unique). Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const VALEURS = valeursDepuis({ categorie: 'logement', adresse: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE', etage: '2', porte: '21', numLotCopro: '12',
  surfaceCarrezM2: 61.8, surfaceExterieureM2: null },
{ typeLogement: 'appartement', meuble: false, nombrePieces: 3, surfaceHabitableM2: 64.2, batiment: '', ascenseur: true, digicode: true, digicodeCode: '1234', commentaire: '',
  dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false, entretiens: [], syndicId: null, syndicNom: '', precisionAcces: '', escalier: '2' } as unknown as ComplementsFiche);
const LECTURE: LectureFiche = {
  version: 'v1',
  encart: { valeurs: VALEURS, famille: 'logement', annexe: false, avecIdFiscal: false, avecCharges: false, avecAg: false, avecEntretien: true, adresseModifiable: true, avecPno: false,
    digicodesUnifies: true, digicodeImmeuble: null, categorie: 'logement', adresse: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE', nomAnnexe: null },
  annexes: [], statut: { statut: 'en_gestion', depuis: '2019-03-01', gestes: gestesPour('en_gestion'), disponible: true, suitLot: null },
  proprietaires: ['DURAND Léa'], mandat: { sorte: 'gestion', lignes: [] },
};
const ETAT = (o: Record<string, unknown> = {}) => ({ connu: false, valeur: null, depuis: null, source: null, aVenir: [], aArbitrer: [], historique: [], ...o });
const DIGI = { adresseCle: '15 rue fictive', nomenclature: 'chiffres', batiment: null, batimentLie: false, escalier: '2',
  connus: [{ cle: '1', libelle: '1', sorte: 'chiffre' }, { cle: '2', libelle: '2', sorte: 'chiffre' }],
  copropriete: { cle: '15 rue fictive', libelle: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE' },
  adresse: { cle: '15 rue fictive', voie: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE',
    commun: { digicode: true, code: '1234', nbBiens: 3, etat: ETAT({ connu: true, valeur: { digicode: true, code: '1234' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z' }) },
    batiments: [{ cle: '2', libelle: '2', digicode: null, code: null, nbBiens: 1, etat: ETAT() }] } };
let container: HTMLDivElement; let root: Root; let saisies: Record<string, unknown>[]; let lectures: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); saisies = []; lectures = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = decodeURIComponent(String(url)); lectures.push(u);
    if (u.startsWith('/api/admin/location?digicodesBien=7')) return ok(DIGI);
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); };
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const clic = async (el: HTMLElement) => { await act(async () => { el.click(); }); await calmer(); };
const saisir = async (el: HTMLElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const monter = async () => {
  await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [], modification: { lotId: 7, lecture: LECTURE, versionDistante: null, onFermer: () => {}, onEnregistre: () => {},
    onRecharger: () => {}, retour: { href: '/x', mot: 'Retour' }, occupationsDe: async () => 0,
    enregistrer: async (s) => { saisies.push(s as unknown as Record<string, unknown>); return { statut: 200, corps: { etat: 'ok', data: { changements: [], notes: [] } } }; } } })); });
  await calmer();
};

describe('🔴🔴 la fiche du bien en Location, avec la base unique', () => {
  it('le « Bâtiment » devient le MENU de la copropriété (plus de champ libre) ; l’Escalier propose « 2 » ; les codes connus se lisent ; la Location ne parle qu’à sa route', async () => {
    await monter();
    expect(lectures).toContain('/api/admin/location?digicodesBien=7');
    expect($('[data-cbc-champ]')).not.toBeNull();
    expect($('[data-cbc-escalier]').textContent).toBe('Escalier noté : 2 — choisir ce bâtiment ?');
    expect($('[data-digicodes-unifies] [data-dcp-commun] [data-dcp-lue-valeur]').textContent).toContain('code 1234');
    expect(document.querySelector('[data-digicode] [aria-label="Code du digicode"]')).toBeNull(); // l'ancien « Oui / Non + Code » n'est plus là
  });
  it('choisir le bâtiment 2 (sa ligne est à saisir) et y mettre un code : la modification part avec le bâtiment choisi et la première valeur', async () => {
    await monter();
    await clic($('[data-cbc-escalier]'));
    await saisir($('[data-digicodes-unifies] [data-dcp-batiment="2"] [data-dcp-code-batiment]'), '2B22'); await calmer();
    await clic($('[data-valider-modification]'));
    const contre = document.querySelector('[data-modale-issue], [role="dialog"]')?.textContent ?? '';
    expect(contre).toContain('Digicode du bâtiment 2 (première saisie)');
    await clic($('[data-repere="confirmer-modification"]') ?? [...document.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer') as HTMLElement);
    expect(saisies[0].digicodesBien).toEqual({ batiment: '2', batimentConfirme: false, commun: null, codeBatiment: { code: '2B22', aucun: false } });
    expect((saisies[0].valeurs as Record<string, string>).batiment).toBe('2');
  });
});

/**
 * 🔴🔴 Arno (17/11/2026) — L'ÉCART DU LOT 4 : « Nouveau bien » (/admin/location/nouveau-bien) montrait ENCORE l'ancien système (« Bâtiment » libre,
 * « Digicode » Oui / Non, « Code ») tant que l'adresse n'était pas saisie. Désormais : le composant unique dès l'ouverture, adresse vide comprise ;
 * ce qui est saisi est REPORTÉ quand l'adresse arrive ; les codes connus de la copropriété s'affichent dès l'adresse choisie (« Modifier »,
 * « Corriger une erreur »).
 */
describe('🔴🔴 « Nouveau bien » : jamais l’ancien système', () => {
  const VIDE = { ...DIGI, adresseCle: '', connus: [], nomenclature: null, escalier: null, copropriete: { cle: '', libelle: '', codePostal: null, commune: null },
    adresse: { cle: '', voie: '', codePostal: null, commune: null, commun: { digicode: null, code: null }, batiments: [] } };
  const INCONNUE = { ...DIGI, adresse: { ...DIGI.adresse, commun: { digicode: null, code: null, nbBiens: 0, etat: ETAT() }, batiments: [] } };
  let reponse: unknown;
  const monterNouveau = async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = decodeURIComponent(String(url)); lectures.push(u);
      if (u.startsWith('/api/admin/location?digicodesBienAdresse=&')) return ok(VIDE);
      if (u.startsWith('/api/admin/location?digicodesBienAdresse=15 rue Fictive')) return ok(reponse);
      return ok([]);
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await calmer();
  };
  const adresse = async () => { await saisir($('#loc-adresse-bien, [data-champ-adresse-bien] input, input[aria-autocomplete]'), '15 rue Fictive'); await act(async () => { await new Promise((r) => setTimeout(r, 650)); }); await calmer(); };
  it('adresse VIDE : le composant unique (menu du bâtiment, digicode commun à saisir, « + ») — ni « Bâtiment » libre, ni Oui / Non, ni « Code »', async () => {
    reponse = DIGI;
    await monterNouveau();
    expect($('[data-cbc-champ]')).not.toBeNull();
    expect($('[data-digicodes-unifies] [data-dcp-sans-adresse]').textContent).toContain('Choisissez l’adresse du bien');
    expect($('[data-digicodes-unifies] [data-dcp-code-commun]')).not.toBeNull();
    expect($('[data-digicodes-unifies] [data-dcp-plus]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Code du digicode"]')).toBeNull();
    expect([...document.querySelectorAll('[data-digicode] button')].some((b) => b.textContent === 'Oui')).toBe(false);
    expect([...document.querySelectorAll('.loc-champ')].some((l) => l.firstChild?.textContent === 'Bâtiment')).toBe(false);
  });
  it('🔴 (Arno, 17/11/2026) « Situation et accès dans l’immeuble » : l’Accès (Ascenseur, Digicode) JUSTE SOUS le titre, au-dessus de « Bâtiment / cage d’escalier · Étage · N° de porte » ; Précision après ; rien de retiré', async () => {
    reponse = DIGI;
    await monterNouveau();
    const bloc = $('[data-situation-acces]');
    expect([...bloc.querySelectorAll(':scope > h4')].map((h) => h.textContent)).toEqual(['Situation et accès dans l’immeuble', 'Accès']);
    const ordre = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(ordre(bloc.querySelector('h4')!, bloc.querySelector('.loc-acces')!)).toBe(true);
    expect(ordre(bloc.querySelector('.loc-acces')!, bloc.querySelector('[data-ligne-situation]')!)).toBe(true);
    expect(ordre($('[data-cbc-champ]'), $('[data-precision]'))).toBe(true);
    expect(bloc.querySelector('.loc-acces [data-digicodes-unifies]')).not.toBeNull();
    expect([...bloc.querySelectorAll('.loc-acces-mot')].map((x) => x.textContent)).toEqual(['Ascenseur', 'Digicode']);
    expect([...document.querySelectorAll('h4')].some((h) => h.textContent === 'Situation dans l’immeuble')).toBe(false);
  });
  it('🔴 (Arno, 17/11/2026) UN SEUL CHAMP : « Bâtiment / cage d’escalier » (texte d’aide court) ; le champ « Escalier » est retiré', async () => {
    reponse = DIGI;
    await monterNouveau();
    expect($('[data-cbc] > span').textContent).toBe('Bâtiment / cage d’escalier');
    expect(($('[data-cbc-champ]') as HTMLInputElement).placeholder).toBe('ex. A ou 1 (facultatif)');
    expect([...document.querySelectorAll('label')].some((l) => (l.firstChild?.textContent ?? '').trim() === 'Escalier')).toBe(false);
  });
  it('un code saisi AVANT l’adresse est REPORTÉ sur la place (sans code connu) quand l’adresse arrive', async () => {
    reponse = INCONNUE;
    await monterNouveau();
    await saisir($('[data-dcp-code-commun]'), '9999'); await calmer();
    await adresse();
    expect(lectures.some((u) => u.startsWith('/api/admin/location?digicodesBienAdresse=15 rue Fictive'))).toBe(true);
    expect(($('[data-dcp-code-commun]') as HTMLInputElement).value).toBe('9999');
  });
  it('l’adresse d’une copropriété dont les codes sont connus : le code se LIT, avec « Modifier » et « Corriger une erreur »', async () => {
    reponse = DIGI;
    await monterNouveau();
    await adresse();
    expect($('[data-digicodes-unifies] [data-dcp-commun] [data-dcp-lue-valeur]').textContent).toContain('code 1234');
    expect($('[data-digicodes-unifies] [data-dcp-commun] [data-dcp-modifier]')).not.toBeNull();
    expect($('[data-digicodes-unifies] [data-dcp-commun] [data-dcp-corriger-erreur]')).not.toBeNull();
  });
});
