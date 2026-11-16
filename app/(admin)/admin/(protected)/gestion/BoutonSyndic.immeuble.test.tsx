// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonSyndic } from './BoutonSyndic';
import { immeubleDuBien } from '../../../../lib/gestion/copropriete';

/**
 * 🔴 Arno (16/11/2026, lot A) — le bouton du syndic retrouve l'immeuble EXACTEMENT comme le bouton « Copropriété » : le champ « Immeuble »,
 * sinon l'adresse. Rien n'est réécrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', disponible: true, immeubles: [
    { cle: '12 rue des lilas', libelle: '12 rue des Lilas', codePostal: '75011', commune: 'Paris', lots: [], syndic: { id: 2, nom: 'Cabinet A', ville: 'Paris' } }] }) }) as unknown as Response) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

describe('le même immeuble pour les deux boutons', () => {
  it('la règle : « Immeuble », sinon l’adresse (espaces ignorés) ; rien des deux : vide', () => {
    expect(immeubleDuBien({ immeuble: 'Résidence Les Tilleuls', adresse: '12 rue des Lilas' })).toBe('Résidence Les Tilleuls');
    expect(immeubleDuBien({ immeuble: '  ', adresse: ' 12 rue des Lilas ' })).toBe('12 rue des Lilas');
    expect(immeubleDuBien({ immeuble: null, adresse: null })).toBe('');
  });
  it('un bien SANS « Immeuble » : le syndic de son adresse est trouvé (il ne l’était pas)', async () => {
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble: null, adresse: '12 rue des Lilas', lotId: 3 })); });
    await calmer();
    expect(container.querySelector('button')?.textContent).toMatch(/Cabinet A/i);
  });
  it('un bien AVEC « Immeuble » : c’est lui qui compte, comme avant', async () => {
    await act(async () => { root.render(createElement(BoutonSyndic, { immeuble: 'Autre immeuble', adresse: '12 rue des Lilas', lotId: 3 })); });
    await calmer();
    expect(container.querySelector('button')?.textContent).toBe('Créer le syndic');
  });
});
