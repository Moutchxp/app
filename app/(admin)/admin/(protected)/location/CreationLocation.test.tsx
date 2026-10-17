// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationProprietaires } from './CreationProprietaires';
import { CreationBien } from './CreationBien';

/**
 * 🔴 TUILE LOCATION — « Créer un nouveau propriétaire » et « Ajouter un nouveau bien » (Arno, 17/10/2026).
 * Les VRAIS composants, routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok({ ids: [1, 2], logementId: 9 }); }
    if (u.includes('proprietairesIds=')) return ok([{ id: 1, titre: 'DUPONT Paul', detail: null }, { id: 2, titre: 'DUPONT Anne', detail: null }]);
    if (u.includes('proprietairesRecherche=')) return ok([{ id: 3, titre: 'MARTIN Léa', detail: '3 rue du Port, PARIS' }]);
    if (u.includes('syndics=1')) return ok([{ id: 5, nom: 'FONCIA', ville: 'Paris' }]);
    return ok([]);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (texte: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(texte)) as HTMLButtonElement;

describe('🔴 Créer un nouveau propriétaire', () => {
  it('une carte de contact de la Gestion au départ ; « + Ajouter un contact » en ajoute autant qu’on veut', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    expect(container.querySelectorAll('.cp-form')).toHaveLength(1);
    await act(async () => { bouton('+ Ajouter un contact').click(); });
    await act(async () => { bouton('+ Ajouter un contact').click(); });
    expect(container.querySelectorAll('.cp-form')).toHaveLength(3);
  });

  it('« Propriétaire(s) en gestion ? » : rien sans réponse ; Oui → mandat puis bouton ; Non → bouton direct, mandat vidé', async () => {
    await act(async () => { root.render(createElement(CreationProprietaires)); });
    const mandat = () => container.querySelector('[data-mandat] input') as HTMLInputElement | null;
    const gros = () => container.querySelector('[data-continuer]');
    // Pas de choix : ni mandat, ni gros bouton.
    expect(container.querySelector('[data-question-gestion]')).not.toBeNull();
    expect(mandat()).toBeNull();
    expect(gros()).toBeNull();
    // Oui : le champ mandat ; le gros bouton seulement une fois le mandat rempli.
    await act(async () => { bouton('Oui').click(); });
    expect(bouton('✓ Oui').getAttribute('aria-pressed')).toBe('true');
    expect(mandat()).not.toBeNull();
    expect(gros()).toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(mandat(), 'MG 2026-041');
      mandat()!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(gros()).not.toBeNull();
    expect(gros()?.className).toContain('loc-gros-bouton--centre');
    // Non : plus de champ mandat, le gros bouton tout de suite ; repasser à Oui montre un mandat VIDÉ.
    await act(async () => { bouton('Non').click(); });
    expect(mandat()).toBeNull();
    expect(gros()).not.toBeNull();
    await act(async () => { bouton('Oui').click(); });
    expect(mandat()?.value).toBe('');
    expect(gros()).toBeNull();
    await act(async () => { bouton('Non').click(); });
    // Le gros bouton refuse tant qu'aucune carte n'est enregistrée, et le dit — rien n'est envoyé.
    await act(async () => { bouton('Ajouter un bien à ce nouveau propriétaire').click(); });
    expect(container.textContent).toContain('Remplissez et enregistrez au moins une carte');
    expect(posts).toEqual([]);
  });
});

describe('🔴 Ajouter un nouveau bien', () => {
  it('les propriétaires arrivés de la création sont déjà là ; 7 sections en entonnoir ; bouton collant', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1, 2] })); });
    await calmer();
    expect([...container.querySelectorAll('[data-proprietaires] .loc-puce')].map((x) => x.textContent?.replace('✕', '').trim())).toEqual(['DUPONT Paul', 'DUPONT Anne']);
    expect([...container.querySelectorAll('.loc-section > h3')].map((h) => h.textContent?.replace(/^\d/, '').replace('*', '').trim()))
      .toEqual(['Propriétaire(s)', 'Adresse et situation', 'Le logement', 'Copropriété', 'Annexes', 'Caractéristiques complémentaires', 'Commentaires']);
    expect(container.querySelector('[data-collant] button[type="submit"]')?.textContent).toBe('Enregistrer le bien');
    expect(container.querySelector('option[value="5"]')?.textContent).toContain('FONCIA');
  });

  it('obligatoires : sans adresse ni type, « Enregistrer le bien » dit ce qui manque et n’envoie rien', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await calmer();
    await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); });
    expect(container.textContent).toContain('Choisissez au moins un propriétaire.');
    expect(container.textContent).toContain('L’adresse du logement est obligatoire.');
    expect(container.textContent).toContain('Le type de logement est obligatoire.');
    expect(posts).toEqual([]);
  });

  it('« + Cave » / « + Parking » : les annexes s’affichent SOUS le logement', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [] })); });
    await act(async () => { bouton('+ Cave').click(); });
    await act(async () => { bouton('+ Parking').click(); });
    expect([...container.querySelectorAll('[data-annexes] > li')].map((li) => li.className)).toEqual(['loc-racine', 'loc-enfant', 'loc-enfant']);
    expect(container.textContent).toContain('N° de place');
  });
});
