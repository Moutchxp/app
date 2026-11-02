// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useLigneDesMois } from './EcransTransaction';

/**
 * 🔴 Arno (03/11/2026) — LA LIGNE DES MOIS (Transaction et « Mon espace ») N'HÉRITE PAS DE L'ANNÉE DE « L'ANNÉE » : une adresse ?vue=annee&annee=2025
 * (l'année de l'onglet « L'année ») → « Le mois » démarre sur l'année en cours, en « Année » ; une adresse du mois (?vue=mois&annee=2025) garde la
 * sienne, comme avant ; sans paramètre : l'année en cours.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let lu: ReturnType<typeof useLigneDesMois> | null = null;
function Sonde() { lu = useLigneDesMois('2026-11-03'); return null; }
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { lu = null; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); window.history.replaceState(null, '', '/'); });
const avec = (adresse: string) => { window.history.replaceState(null, '', adresse); act(() => { root.render(createElement(Sonde)); }); return lu!; };

describe('🔴 useLigneDesMois et l’adresse', () => {
  it('?vue=annee&annee=2025 (l’adresse de « L’année ») : 2026, « Année », novembre', () => {
    const l = avec('/?vue=annee&annee=2025');
    expect([l.annee, l.decoupage, l.mois]).toEqual([2026, 'annee', 11]);
  });
  it('?vue=mois&annee=2025&mois=4 (une adresse du mois) : gardée, comme avant', () => {
    const l = avec('/?vue=mois&annee=2025&mois=4');
    expect([l.annee, l.mois]).toEqual([2025, 4]);
  });
  it('sans paramètre : l’année en cours, « Année »', () => {
    const l = avec('/');
    expect([l.annee, l.decoupage]).toEqual([2026, 'annee']);
  });
});
