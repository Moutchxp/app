// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Arno (23/11/2026) — « Valider la sortie », bien sans copropriété : « Créer une copropriété » = EXACTEMENT le parcours de la Gestion (la fiche
 * Copropriété elle-même, pour l'adresse du bien). La fiche est observée (son comportement a ses propres épreuves : adresse officielle, parcelle,
 * adresses prises, anti-doublon, « Rattacher à … ? », « Non » mémorisé).
 */
const fiche = vi.fn();
vi.mock('../gestion/FicheCopropriete', () => ({
  FicheCopropriete: (p: { lotId?: number | null; immeuble?: string | null; onFerme: () => void }) => {
    fiche(p); return createElement('button', { 'data-stub-fiche': String(p.lotId), onClick: p.onFerme }, 'Fermer la fiche');
  },
}));
vi.mock('../gestion/ArreteComptes', () => ({ ArreteComptes: () => null }));
const { AgSortie, saisieAgInitiale, luAgPropre, corpsAg } = await import('./AgSortie');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); fiche.mockClear(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const LU = luAgPropre({ disponible: true, lotId: 7, copropriete: null, immeuble: '4 rue Fictive', coproprieteSaisie: true, suggestions: [],
  proposition: { derniere: null, prochaine: null }, adresse: '4 rue Fictive', moi: 'arno@exemple.fr' });

describe('« Créer une copropriété » depuis la fenêtre de sortie', () => {
  it('ouvre LA fiche Copropriété pour le bien (lotId), sans nom tapé ; à sa fermeture, la fenêtre se RELIT', async () => {
    const relire = vi.fn();
    const s = saisieAgInitiale(LU);
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s, onChange: () => {}, desactive: false, onRelire: relire })); });
    expect(container.querySelector('input[data-ag-copro-nom]')).toBeNull();
    await act(async () => { (container.querySelector('button[data-ag-copro="creer"]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenCalledWith(expect.objectContaining({ lotId: 7 }));
    await act(async () => { (container.querySelector('[data-stub-fiche="7"]') as HTMLButtonElement).click(); });
    expect(relire).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-stub-fiche]')).toBeNull();
  });
  it('le corps envoyé ne porte JAMAIS de création par nom (seulement « rattacher » ou rien)', () => {
    const s = saisieAgInitiale(LU);
    expect(corpsAg({ ...s, copro: 'aucune' }, LU)).not.toHaveProperty('coproprieteChoix.creer');
    expect(corpsAg({ ...s, copro: 'rattacher', rattacher: 12 }, LU)).toMatchObject({ coproprieteChoix: { rattacher: 12 } });
  });
  it('le serveur ne crée plus de copropriété depuis la sortie : `creerCoproprietePourLot` n’y est plus appelé (gardé dans agCoproprieteRepo)', () => {
    expect(readFileSync('app/lib/location/validationSortieRepo.ts', 'utf8')).not.toContain('creerCoproprietePourLot');
    expect(readFileSync('app/lib/location/agCoproprieteRepo.ts', 'utf8')).toContain('export async function creerCoproprietePourLot');
  });
});
