// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PropositionRattachement } from './PropositionRattachement';

/** 🔴🔴 Arno (17/11/2026, « Adresses multiples d'une copropriété », lot 5) — la proposition sous l'adresse du bien ; rien ne s'écrit sans un clic. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root; let posts: Record<string, unknown>[];
const rep = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { const b = JSON.parse(String(init.body)); posts.push(b);
      return rep(b.action === 'copro-rattacher-adresse' ? { etat: 'ok', data: { message: '5 rue _TEST Deux Adresses, 92600 Asnières-sur-Seine est désormais une adresse de la copropriété _TEST DEUX ADRESSES : son bloc de digicodes (vide) est créé.' } } : { etat: 'ok', data: { memorise: true } }); }
    if (String(url).includes('rattachementAdresse=')) return rep({ etat: 'ok', data: posts.length > 0 ? [] : [{ coproprieteId: 271, cle: '1 rue test deux adresses', nom: '_TEST DEUX ADRESSES', adresses: ['1 rue _TEST Deux Adresses', '3 rue _TEST Deux Adresses'] }] });
    return rep({ etat: 'ok', data: [] });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });
const attendre = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 560)); }); await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const ADR = { libelle: '5 rue _TEST Deux Adresses', codePostal: '92600', commune: 'Asnières-sur-Seine' };

describe('🔴 « Rattacher à la copropriété <nom> — <adresses> ? »', () => {
  it('la question, et ses deux réponses ; rien n’est écrit avant un clic', async () => {
    await act(async () => { root.render(createElement(PropositionRattachement, { adresse: ADR })); });
    await attendre();
    expect(container.querySelector('.prc-question')?.textContent).toBe('Rattacher à la copropriété _TEST DEUX ADRESSES — 1 rue _TEST Deux Adresses, 3 rue _TEST Deux Adresses ?');
    expect([...container.querySelectorAll('.prc-boutons button')].map((b) => b.textContent)).toEqual(['Non, c’est une autre copropriété', 'Rattacher cette adresse']);
    expect(posts).toEqual([]);
  });
  it('« Rattacher cette adresse » : l’adresse est rattachée, l’écran relit ses digicodes ; la question s’efface', async () => {
    const relire = vi.fn();
    await act(async () => { root.render(createElement(PropositionRattachement, { adresse: ADR, onRattache: relire })); });
    await attendre();
    await act(async () => { (container.querySelector('[data-prc-oui]') as HTMLButtonElement).click(); });
    await attendre();
    expect(posts).toEqual([{ action: 'copro-rattacher-adresse', coproprieteId: 271, adresse: ADR.libelle, codePostal: '92600', commune: ADR.commune }]);
    expect(relire).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-prc-message]')?.textContent).toContain('son bloc de digicodes (vide) est créé');
    expect(container.querySelector('.prc-question')).toBeNull();
  });
  it('« Non, c’est une autre copropriété » : mémorisé, « la question ne reviendra plus pour cette adresse »', async () => {
    await act(async () => { root.render(createElement(PropositionRattachement, { adresse: ADR })); });
    await attendre();
    await act(async () => { (container.querySelector('[data-prc-non]') as HTMLButtonElement).click(); });
    await attendre();
    expect(posts[0]).toMatchObject({ action: 'copro-refuser-rattachement', coproprieteId: 271 });
    expect(container.querySelector('[data-prc-message]')?.textContent).toBe('Noté : la question ne reviendra plus pour cette adresse.');
  });
});
