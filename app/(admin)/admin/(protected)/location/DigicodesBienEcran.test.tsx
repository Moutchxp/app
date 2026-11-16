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
    expect($('[data-cbc-escalier]').textContent).toContain('L’escalier « 2 » est un bâtiment de la copropriété');
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
