// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SectionLocationProprietaire } from './SectionsLocationFiche';

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien », réponse 2) — « Fiche propriétaire : les champs « N° de mandat de gestion / de transaction » deviennent,
 * avec l'accord d'Arno, la liste en lecture seule des n° de ses biens (chacun modifiable sur son bien). » Sans la 492 : les champs d'avant.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let hote: HTMLDivElement; let racine: Root; let posts: unknown[]; let avec492: boolean;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); posts = []; avec492 = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(init.body); return reponse({ etat: 'ok' }); }
    if (String(url).includes('proprietaire=323')) {
      return reponse({ etat: 'ok', data: { fiche: { id: 323 }, sortie: null, numeroMandat: 'MG ANCIEN', numeroMandatTransaction: null, enGestion: null,
        statutsBiens: { en_gestion: 2, location_seule: 0, ancienne_gestion: 0 }, biens: [], location372: true,
        ...(avec492 ? { mandatsBiens: [
          { lotId: 453, adresse: '4 rue _TEST MANDAT, 92600 Asnières-sur-Seine', sorte: 'gestion', numero: 'TM 41', signeLe: '2026-11-01' },
          { lotId: 454, adresse: '6 rue _TEST MANDAT, 92600 Asnières-sur-Seine', sorte: 'gestion', numero: 'TM 41', signeLe: null }] } : {}) } });
    }
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });
const monter = async () => {
  await act(async () => { racine.render(createElement(SectionLocationProprietaire, { proprietaireId: 323 })); });
  await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
};

describe('🔴 la fiche propriétaire : les n° de ses biens, en lecture seule', () => {
  it('chaque n° avec son bien (lien vers sa fiche) ; aucun champ de saisie de mandat, aucun envoi ; l’ancien n° de la fiche est dit', async () => {
    await monter();
    const bloc = hote.querySelector('[data-mandats-des-biens]')!;
    expect(bloc.querySelector('h3')?.textContent).toBe('N° de mandat de ses biens');
    expect([...bloc.querySelectorAll('[data-mandat-du-bien]')].map((x) => x.textContent)).toEqual([
      'Mandat de gestion n° TM 41, signé le 01/11/2026 — 4 rue _TEST MANDAT, 92600 Asnières-sur-Seine',
      'Mandat de gestion n° TM 41 — 6 rue _TEST MANDAT, 92600 Asnières-sur-Seine']);
    expect(bloc.querySelector('a')?.getAttribute('href')).toBe('/admin/location/bien/453');
    expect(hote.querySelector('[data-mandat="gestion"]')).toBeNull();
    expect(bloc.querySelectorAll('input, button')).toHaveLength(0);
    expect(bloc.querySelector('[data-mandat-ancien="gestion"]')?.textContent).toBe('N° de mandat de gestion encore sur la fiche du propriétaire (d’avant le mandat par bien) : MG ANCIEN');
    expect(hote.querySelector('.slf-resume')?.textContent).toContain('mandat TM 41');
    expect(posts).toEqual([]);
  });
  it('sans la 492 : les champs d’avant, inchangés', async () => {
    avec492 = false;
    await monter();
    expect(hote.querySelector('[data-mandats-des-biens]')).toBeNull();
    expect(hote.querySelector('[data-mandat="gestion"] input')).not.toBeNull();
  });
});
