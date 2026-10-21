// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DigicodeImmeuble } from './DigicodeImmeuble';

/** 🔴 Arno (21/10/2026, 396) — le champ « Digicode » de la fiche immeuble / syndic (rose) : celui de l'IMMEUBLE de l'adresse ; 399 : par bâtiment. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (c: unknown) => ({ ok: true, status: 200, json: async () => c }) as unknown as Response;
let container: HTMLDivElement; let root: Root; let appels: { methode: string; url: string; corps: unknown }[]; let reponse: unknown;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); appels = [];
  reponse = { etat: 'ok', data: { digicode: true, code: '57B83', source: 'immeuble', mention: 'Commun à tous les biens du 25 rue Edith Cavell, 92400 Courbevoie (3 biens)' } };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    appels.push({ methode: init?.method ?? 'GET', url: String(url), corps: init?.body ? JSON.parse(String(init.body)) : null });
    return json(init?.method === 'POST' ? { etat: 'ok', data: { change: true } } : reponse);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

describe('DigicodeImmeuble (fiche immeuble / syndic)', () => {
  it('lit par l’ADRESSE (jamais par le syndic), montre le code et la mention ; modifier puis « Enregistrer » écrit sur l’immeuble', async () => {
    await act(async () => { root.render(createElement(DigicodeImmeuble, { voie: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' })); });
    await calmer();
    expect(appels[0].url).toBe('/api/admin/gestion/immeubles/digicode?voie=25%20rue%20Edith%20Cavell&cp=92400&commune=Courbevoie');
    expect(appels[0].url).not.toMatch(/syndic/);
    expect((container.querySelector('[data-code-digicode]') as HTMLInputElement).value).toBe('57B83');
    expect(container.querySelector('[data-mention-digicode]')?.textContent).toBe('Commun à tous les biens du 25 rue Edith Cavell, 92400 Courbevoie (3 biens)');
    expect(container.querySelector('[data-enregistrer-digicode]')).toBeNull();
    const champ = container.querySelector('[data-code-digicode]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(champ, '9X41'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (container.querySelector('[data-enregistrer-digicode]') as HTMLButtonElement).click(); });
    await calmer();
    expect(appels.find((a) => a.methode === 'POST')?.corps).toEqual({ voie: '25 rue Edith Cavell', cp: '92400', commune: 'Courbevoie', digicode: true, code: '9X41' });
    expect(container.textContent).toContain('Digicode enregistré pour tous les biens de l’adresse.');
  });
  it('🔴 399 — liste « Digicodes » : une ligne par bâtiment connu + « Code général », chacune modifiable ; « + Ajouter un bâtiment »', async () => {
    reponse = { etat: 'ok', data: { digicode: true, code: '1111', source: 'immeuble', parBatiment: true,
      mention: 'Commun aux 2 biens de l’adresse 25 rue Edith Cavell, 92400 Courbevoie',
      batiments: [
        { cle: 'a', libelle: 'A', digicode: true, code: 'AAAA', nbBiens: 2, mention: 'Commun aux 2 biens du bâtiment A, 25 rue Edith Cavell, 92400 Courbevoie' },
        { cle: 'b', libelle: 'B', digicode: null, code: null, nbBiens: 1, mention: 'Code propre du bâtiment B, 25 rue Edith Cavell, 92400 Courbevoie (1 bien)' },
      ] } };
    await act(async () => { root.render(createElement(DigicodeImmeuble, { voie: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' })); });
    await calmer();
    const lignes = [...container.querySelectorAll('[data-ligne-digicode]')];
    expect(lignes.map((l) => l.querySelector('.dgi-mot')?.textContent)).toEqual(['Bâtiment A', 'Bâtiment B', 'Code général']);
    expect(lignes.map((l) => (l.querySelector('[data-code-digicode]') as HTMLInputElement).value)).toEqual(['AAAA', '', '1111']);
    expect(lignes[0].querySelector('[data-mention-digicode]')?.textContent).toBe('Commun aux 2 biens du bâtiment A, 25 rue Edith Cavell, 92400 Courbevoie');
    expect(lignes[2].querySelector('[data-mention-digicode]')?.textContent).toBe('Commun aux 2 biens de l’adresse 25 rue Edith Cavell, 92400 Courbevoie');
    // Le bâtiment A modifié : le POST porte le bâtiment ; le code général n'est pas touché.
    const champA = lignes[0].querySelector('[data-code-digicode]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(champA, '9X41'); champA.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (lignes[0].querySelector('[data-enregistrer-digicode]') as HTMLButtonElement).click(); });
    await calmer();
    expect(appels.filter((a) => a.methode === 'POST').map((a) => a.corps)).toEqual([{ voie: '25 rue Edith Cavell', cp: '92400', commune: 'Courbevoie', digicode: true, code: '9X41', batiment: 'A' }]);
    expect(container.textContent).toContain('Digicode du bâtiment A enregistré pour ses biens.');
    // + Ajouter un bâtiment : une ligne neuve, enregistrée avec son nom.
    await act(async () => { (container.querySelector('[data-ajouter-batiment]') as HTMLButtonElement).click(); });
    const nom = container.querySelector('[data-nom-batiment]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nom, 'C'); nom.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (container.querySelector('[data-valider-batiment]') as HTMLButtonElement).click(); });
    const ligneC = container.querySelector('[data-ligne-digicode="C"]') as HTMLElement;
    expect(ligneC.querySelector('.dgi-mot')?.textContent).toBe('Bâtiment C');
    await act(async () => { ([...ligneC.querySelectorAll('.dgi-choix button')].find((b) => b.textContent === 'Oui') as HTMLButtonElement).click(); });
    const champC = ligneC.querySelector('[data-code-digicode]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(champC, '3C3C'); champC.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (ligneC.querySelector('[data-enregistrer-digicode]') as HTMLButtonElement).click(); });
    await calmer();
    expect(appels.filter((a) => a.methode === 'POST').at(-1)?.corps).toEqual({ voie: '25 rue Edith Cavell', cp: '92400', commune: 'Courbevoie', digicode: true, code: '3C3C', batiment: 'C' });
  });
  it('sans la migration 396 : rien n’est affiché (la fiche est celle d’avant)', async () => {
    reponse = { etat: 'sans_schema' };
    await act(async () => { root.render(createElement(DigicodeImmeuble, { voie: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie' })); });
    await calmer();
    expect(container.innerHTML).toBe('');
  });
});
