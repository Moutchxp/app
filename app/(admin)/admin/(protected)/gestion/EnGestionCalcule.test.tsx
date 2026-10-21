// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SectionLocationProprietaire } from './SectionsLocationFiche';

/**
 * 🔴 Arno (21/10/2026, réponse 3a) — sur la fiche propriétaire, la bascule « en gestion » (Oui / Non / Non renseigné), qui écrivait
 * une colonne plus lue, est REMPLACÉE par une mention calculée sur les statuts de ses biens, en lecture seule (accord d'Arno pour
 * ce retrait). Plus aucun geste « en-gestion » ne part de la fiche.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement;
let racine: Root;
let posts: unknown[];
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); posts = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(init.body); return reponse({ etat: 'ok' }); }
    if (String(url).includes('proprietaire=49')) {
      return reponse({ etat: 'ok', data: { fiche: { id: 49 }, sortie: null, numeroMandat: 'MG 1', numeroMandatTransaction: null, enGestion: false,
        statutsBiens: { en_gestion: 2, location_seule: 1, ancienne_gestion: 0 }, biens: [], location372: true } });
    }
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });

describe('🔴 « Propriétaire en gestion ? » : calculé, en lecture seule', () => {
  it('la mention calculée (ignorant la colonne d’avant), dans le bloc et dans le résumé ; aucun bouton, aucun envoi', async () => {
    await act(async () => { racine.render(createElement(SectionLocationProprietaire, { proprietaireId: 49 })); });
    await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
    const bloc = hote.querySelector('[data-en-gestion-calcule]')!;
    expect(bloc.querySelector('p')?.textContent).toBe('En gestion : oui (2 biens) · 1 en location seule');
    expect(bloc.querySelectorAll('button')).toHaveLength(0);
    expect(hote.querySelector('[aria-label="Propriétaire en gestion ?"]')).toBeNull();
    expect(hote.querySelector('.slf-resume')?.textContent).toContain('En gestion : oui (2 biens) · 1 en location seule');
    expect(posts).toEqual([]);
  });
});
