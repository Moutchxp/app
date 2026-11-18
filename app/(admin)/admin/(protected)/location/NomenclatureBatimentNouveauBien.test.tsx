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
 * 🔴🔴 Arno (18/11/2026) — CONSTAT (recette, « Nouveau bien », 43 Avenue Marceau) : A et B créés pendant la saisie (« nouveau — enregistré avec le
 * bien »), « 3 » tapé dans « Bâtiment / cage d'escalier » : une carte « Digicode bâtiment 3 », SANS fenêtre d'avertissement.
 * Le VRAI formulaire du bien (le même composant pour « Nouveau bien », « Créer un nouveau propriétaire » et « Modifier le bien »), sur une adresse dont
 * aucun bâtiment n'est encore enregistré (ni règle, ni bâtiment connu — comme le 43 Avenue Marceau de la recette). Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const VALEURS = valeursDepuis({ categorie: 'logement', adresse: '43 Avenue Marceau', codePostal: '92400', commune: 'Courbevoie', etage: '2', porte: '21', numLotCopro: '12',
  surfaceCarrezM2: 61.8, surfaceExterieureM2: null },
{ typeLogement: 'appartement', meuble: false, nombrePieces: 3, surfaceHabitableM2: 64.2, batiment: '', ascenseur: true, digicode: true, digicodeCode: '', commentaire: '',
  dpeClasse: 'D', dpeDate: '2024-03-01', entretienAPrevoir: false, entretiens: [], syndicId: null, syndicNom: '', precisionAcces: '', escalier: '' } as unknown as ComplementsFiche);
const LECTURE: LectureFiche = {
  version: 'v1',
  encart: { valeurs: VALEURS, famille: 'logement', annexe: false, avecIdFiscal: false, avecCharges: false, avecAg: false, avecEntretien: true, adresseModifiable: true, avecPno: false,
    digicodesUnifies: true, digicodeImmeuble: null, categorie: 'logement', adresse: '43 Avenue Marceau', codePostal: '92400', commune: 'Courbevoie', nomAnnexe: null },
  annexes: [], statut: { statut: 'en_gestion', depuis: '2019-03-01', gestes: gestesPour('en_gestion'), disponible: true, suitLot: null },
  proprietaires: ['DURAND Léa'], mandat: { sorte: 'gestion', lignes: [] },
};
const ETAT = { connu: false, valeur: null, depuis: null, source: null, aVenir: [], aArbitrer: [], historique: [] };
/** L'adresse du constat : aucun bâtiment enregistré, aucune règle — le code commun, vide, « commun aux 3 biens ». */
const DIGI = { adresseCle: '43 avenue marceau', nomenclature: null, batiment: null, batimentLie: false, escalier: null, connus: [],
  copropriete: { cle: '43 avenue marceau', libelle: '43 Avenue Marceau', codePostal: '92400', commune: 'Courbevoie' },
  adresse: { cle: '43 avenue marceau', voie: '43 Avenue Marceau', codePostal: '92400', commune: 'Courbevoie', commun: { digicode: null, code: null, nbBiens: 3, etat: ETAT }, batiments: [] } };
let container: HTMLDivElement; let root: Root; let saisies: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); saisies = [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request) => (decodeURIComponent(String(url)).startsWith('/api/admin/location?digicodesBien=7') ? ok(DIGI) : ok([]))) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); };
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const clic = async (el: HTMLElement) => { await act(async () => { el.click(); }); await calmer(); };
const saisir = async (el: HTMLElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };
const entree = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }); await calmer(); };
/** Tape un nom dans « Bâtiment / cage d'escalier » et le valide (Entrée), comme Arno. */
const taper = async (nom: string) => { await saisir($('[data-cbc-champ]'), nom); await entree($('[data-cbc-champ]')); };
const fenetre = () => document.querySelector('[data-dcp-avertissement] [role="alertdialog"]');
const monter = async () => {
  await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [], modification: { lotId: 7, lecture: LECTURE, versionDistante: null, onFermer: () => {}, onEnregistre: () => {},
    onRecharger: () => {}, retour: { href: '/x', mot: 'Retour' }, occupationsDe: async () => 0,
    enregistrer: async (s) => { saisies.push(s as unknown as Record<string, unknown>); return { statut: 200, corps: { etat: 'ok', data: { changements: [], notes: [] } } }; } } })); });
  await calmer();
};
const enregistrer = async () => {
  await clic($('[data-valider-modification]'));
  await clic($('[data-repere="confirmer-modification"]') ?? [...document.querySelectorAll('button')].find((b) => b.textContent === 'Confirmer') as HTMLElement);
};

describe('🔴🔴 le cas d’Arno : A et B créés pendant la saisie, puis « 3 »', () => {
  it('A puis B : aucune fenêtre (le premier fixe les lettres) ; « 3 » : LA fenêtre d’avertissement s’ouvre', async () => {
    await monter();
    await taper('A');
    expect(fenetre()).toBeNull();
    await taper('B');
    expect(fenetre()).toBeNull();
    await taper('3');
    expect(fenetre()?.textContent).toContain('« 3 » est un chiffre');
    expect(fenetre()?.textContent).toContain('nommés par des lettres');
  });

  it('« Confirmer cet intitulé » : « 3 » est accepté, et part confirmé, dans l’ordre de création (A, B, 3) — le serveur juge dans le même ordre', async () => {
    await monter();
    await taper('A'); await taper('B'); await taper('3');
    await clic($('[data-dcp-confirmer]'));
    expect(fenetre()).toBeNull();
    expect(($('[data-cbc-champ]') as HTMLInputElement).value).toBe('3');
    await enregistrer();
    expect(saisies[0].digicodesBien).toMatchObject({ batiment: '3', batimentConfirme: true, ordre: ['A', 'B', '3'] });
  });

  it('« Corriger » : rien n’est ajouté (3 n’entre pas dans les bâtiments créés), le champ garde sa saisie ; quitter le champ ne rouvre pas la fenêtre', async () => {
    await monter();
    await taper('A'); await taper('B'); await taper('3');
    await clic($('[data-dcp-corriger]'));
    expect(fenetre()).toBeNull();
    expect(($('[data-cbc-champ]') as HTMLInputElement).value).toBe('3');
    await act(async () => { $('[data-cbc-champ]').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }); await calmer();
    expect(fenetre()).toBeNull();
    await enregistrer();
    // rien d'ajouté : « 3 » n'est ni créé ni confirmé (le serveur le refusera tant qu'il n'est pas confirmé ou corrigé)
    expect(saisies[0].digicodesBien).toMatchObject({ batiment: '3', batimentConfirme: false, ordre: ['A', 'B'] });
  });

  it('un nom qui SUIT la numérotation (« C » après A et B) : aucune fenêtre, aucune interdiction', async () => {
    await monter();
    await taper('A'); await taper('B'); await taper('C');
    expect(fenetre()).toBeNull();
    expect(($('[data-cbc-champ]') as HTMLInputElement).value).toBe('C');
  });
});
