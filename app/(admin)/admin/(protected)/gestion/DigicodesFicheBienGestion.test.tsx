// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Complements } from './SectionsLocationFiche';
import type { ComplementsFiche } from '../../../../lib/location/bienComplet';

/**
 * 🔴🔴 Arno (16/11/2026, « Digicodes unifiés », lot 4) — la fiche du bien (bloc « Informations complémentaires », « Modifier ») : avec la base unique,
 * le MÊME composant — le bâtiment au menu, les codes connus lus, « Corriger une erreur » par le même chemin serveur. Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const ETAT = (o: Record<string, unknown> = {}) => ({ connu: false, valeur: null, depuis: null, source: null, aVenir: [], aArbitrer: [], historique: [], ...o });
const DIGI = { adresseCle: '15 rue fictive', nomenclature: 'lettres', batiment: 'A', batimentLie: true, escalier: null, connus: [{ cle: 'a', libelle: 'A', sorte: 'lettre' }],
  copropriete: { cle: '15 rue fictive', libelle: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE' },
  adresse: { cle: '15 rue fictive', voie: '15 rue Fictive', codePostal: '92400', commune: 'COURBEVOIE', commun: { digicode: null, code: null, nbBiens: 2, etat: ETAT() },
    batiments: [{ cle: 'a', libelle: 'A', digicode: true, code: 'A1', nbBiens: 1, etat: ETAT({ connu: true, valeur: { digicode: true, code: 'A1' }, source: 'unifie', depuis: '2026-11-01T10:00:00.000Z' }) }] } };
const C = { batiment: 'A', escalier: null, typeLogement: 'appartement', nombrePieces: 2, meuble: false, surfaceHabitableM2: 40, syndicId: null, syndicNom: null, epoqueConstruction: null, chauffage: null,
  dpeClasse: null, dpeDate: null, commentaire: null, typeLocal: null, parkingSituation: null, parkingType: null, surfaceM2: null, ascenseur: null, digicode: true, digicodeCode: 'A1',
  precisionAcces: null, derniereAg: null, agApplicable: false } as unknown as ComplementsFiche;
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
    if (u.startsWith('/api/admin/gestion/annuaire/location?digicodesBien=7')) return ok(DIGI);
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const clic = async (el: HTMLElement) => { await act(async () => { el.click(); }); await calmer(); };
const saisir = async (el: HTMLElement, v: string) => { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); };

describe('🔴🔴 la fiche du bien (Gestion), avec la base unique', () => {
  it('« Modifier » : le bâtiment au menu, le code du bâtiment lu, le commun à saisir ; « Enregistrer » envoie la première valeur par le chemin unique', async () => {
    await act(async () => { root.render(createElement(Complements, { id: 7, c: C, apres: () => {}, categorie: 'logement' })); }); await calmer();
    await clic([...document.querySelectorAll('button')].find((b) => b.textContent === 'Modifier') as HTMLElement);
    expect(($('[data-cbc-champ]') as HTMLInputElement).value).toBe('A');
    expect($('[data-digicodes-unifies] [data-dcp-batiment="A"] [data-dcp-lue-valeur]').textContent).toContain('code A1');
    expect(document.querySelector('[data-digicode-immeuble]')).toBeNull();
    await saisir($('[data-digicodes-unifies] [data-dcp-code-commun]'), '9876');
    await clic([...document.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer') as HTMLElement);
    const p = posts.find((x) => x.action === 'complements-bien') as { champs: Record<string, unknown> };
    expect(p.champs.digicodesBien).toEqual({ batiment: 'A', batimentConfirme: false, commun: { code: '9876', aucun: false }, codeBatiment: null });
  });
  it('« Corriger une erreur » depuis la fiche du bien : la même action que la fiche Copropriété (la place, la valeur), tout de suite', async () => {
    await act(async () => { root.render(createElement(Complements, { id: 7, c: C, apres: () => {}, categorie: 'logement' })); }); await calmer();
    await clic([...document.querySelectorAll('button')].find((b) => b.textContent === 'Modifier') as HTMLElement);
    await clic($('[data-dcp-corriger-erreur]'));
    await saisir($('[data-dcp-correction-code]'), 'A2');
    await clic($('[data-dcp-correction-confirmer]'));
    expect(posts.at(-1)).toEqual({ action: 'digicode-corriger', immeuble: '15 rue fictive', adresseCle: '15 rue fictive', batiment: 'A', digicode: true, code: 'A2' });
  });
});
