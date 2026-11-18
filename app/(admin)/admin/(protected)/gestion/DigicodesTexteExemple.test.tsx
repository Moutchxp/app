// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { DigicodesCopropriete, saisieDigicodesInitiale, TEXTE_EXEMPLE_DIGICODE } from './DigicodesCopropriete';

/**
 * 🔴 Arno (18/11/2026) — « dans tous les champs de saisie d'un digicode (copropriété et bâtiments), le texte d'exemple « facultatif » ou « code » est
 * remplacé par « Digicode ». Même mot partout, y compris dans la fenêtre « Modifier » (« Nouveau digicode »). » Le composant est unique : fiche
 * Copropriété, « Nouveau bien », « Créer un nouveau propriétaire », « Modifier le bien », fiche du bien Gestion.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const FICHE = { digicodes: [{ cle: '12 rue des lilas', voie: '12 rue des Lilas', codePostal: '75011', commune: 'Paris', commun: { digicode: null, code: null }, batiments: [] }] };
function Hote() {
  const [s, setS] = useState(saisieDigicodesInitiale(FICHE as never));
  return createElement(DigicodesCopropriete, { s, onChange: setS, connus: [], nomenclature: 'lettres', desactive: false });
}
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

describe('🔴 « Digicode », le texte d’exemple de tous les champs de digicode', () => {
  it('le champ de la copropriété et celui d’un bâtiment ajouté : « Digicode » (plus « facultatif », plus « code »)', async () => {
    await act(async () => { root.render(createElement(Hote)); });
    expect(TEXTE_EXEMPLE_DIGICODE).toBe('Digicode');
    expect((container.querySelector('[data-dcp-code-commun]') as HTMLInputElement).placeholder).toBe('Digicode');
    await act(async () => { (container.querySelector('[data-dcp-plus]') as HTMLElement).click(); });
    const codes = [...container.querySelectorAll('input')].filter((i) => !i.hasAttribute('data-dcp-nom-batiment') && i.type === 'text' && !i.hasAttribute('data-dcp-code-commun'));
    expect(codes.map((i) => i.placeholder)).toContain('Digicode');
    expect([...container.querySelectorAll('input')].map((i) => i.placeholder)).not.toEqual(expect.arrayContaining(['facultatif', 'code']));
  });
  it('« Corriger une erreur » et la fenêtre « Modifier » : le même mot, et l’intitulé « Nouveau digicode » ; « pas de digicode » reste quand il n’y en a pas', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/DigicodesCopropriete.tsx', 'utf8');
    expect(src.match(/placeholder=\{[a-z.]+aucun \? 'pas de digicode' : TEXTE_EXEMPLE_DIGICODE\}/g)).toHaveLength(4);
    expect(src).not.toMatch(/: 'facultatif'\}|: 'code'\}|: 'nouveau code'\}/);
    expect(src).toContain('<span>Nouveau digicode</span>');
    expect(src).not.toContain('<span>Nouveau code</span>');
  });
});
