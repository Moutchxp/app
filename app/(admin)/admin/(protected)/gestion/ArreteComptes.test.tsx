// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { ArreteComptes, BANDEAU_ARRETE_MANQUANT } from './ArreteComptes';

/** 🔴 Arno (23/11/2026, 512) — « Date d'arrêté des comptes » : le composant unique (fiche Copropriété et fenêtre de la sortie), route simulée. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
let posts: Record<string, unknown>[];
let lu: Record<string, unknown>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); posts = [];
  lu = { arrete: null, par: null, le: null, disponible: true };
  global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const c = JSON.parse(String(init.body)) as Record<string, unknown>; posts.push(c);
      return { json: async () => ({ etat: 'ok', data: { arrete: { jour: Number(c.jour), mois: Number(c.mois) }, par: 'arno@exemple.fr', le: '2026-11-23T09:00:00.000Z' } }) } as Response;
    }
    return { json: async () => ({ etat: 'ok', data: lu }) } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const rendre = async () => { await act(async () => { root.render(createElement(ArreteComptes, { coproprieteId: 7 })); }); await calmer(); };
const clic = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const choisir = async (sel: string, v: string) => {
  const el = container.querySelector(sel) as HTMLSelectElement;
  await act(async () => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); });
};

describe('« Date d’arrêté des comptes » (composant unique)', () => {
  it('non renseignée : on le dit ; « Renseigner » ; jour + mois → UNE requête au serveur ; la date s’affiche', async () => {
    await rendre();
    expect(container.querySelector('[data-arrete-comptes]')?.getAttribute('data-arrete-comptes')).toBe('vide');
    expect(container.textContent).toContain('Date d’arrêté des comptes : non renseignée');
    await clic('[data-arrete-modifier]');
    await choisir('[data-arrete-mois]', '12');
    await choisir('[data-arrete-jour]', '31');
    await clic('[data-arrete-enregistrer]');
    expect(posts).toEqual([{ action: 'arrete-comptes', coproprieteId: 7, jour: '31', mois: '12' }]);
    expect(container.querySelector('[data-arrete-valeur]')?.textContent).toBe('31/12');
    expect(container.querySelector('[data-arrete-enregistree]')).not.toBeNull();
  });
  it('saisie incomplète : le message après la tentative, rien n’est envoyé ; « Annuler » referme', async () => {
    await rendre();
    await clic('[data-arrete-modifier]');
    expect(container.querySelector('[data-arrete-message]')).toBeNull();
    await choisir('[data-arrete-mois]', '6');
    await clic('[data-arrete-enregistrer]');
    expect(container.querySelector('[data-arrete-message]')?.textContent).toBe('Choisissez le jour ET le mois de l’arrêté des comptes.');
    expect(posts).toEqual([]);
    await clic('[data-arrete-annuler]');
    expect(container.querySelector('[data-arrete-formulaire]')).toBeNull();
  });
  it('renseignée : la date, qui l’a saisie ; « Modifier » prérempli ; juin n’offre que 30 jours', async () => {
    lu = { arrete: { jour: 30, mois: 6 }, par: 'arno@exemple.fr', le: '2026-11-20T09:00:00.000Z', disponible: true };
    await rendre();
    expect(container.querySelector('[data-arrete-valeur]')?.textContent).toBe('30/06');
    await clic('[data-arrete-modifier]');
    expect((container.querySelector('[data-arrete-jour]') as HTMLSelectElement).value).toBe('30');
    expect((container.querySelector('[data-arrete-mois]') as HTMLSelectElement).value).toBe('6');
    expect(container.querySelectorAll('[data-arrete-jour] option')).toHaveLength(31); // « — » + 30 jours
  });
  it('sans la migration 512 : on le dit, rien ne se saisit', async () => {
    lu = { arrete: null, par: null, le: null, disponible: false };
    await rendre();
    expect(container.querySelector('[data-arrete-comptes="sans-schema"]')?.textContent).toContain('migration 512');
    expect(container.querySelector('[data-arrete-modifier]')).toBeNull();
  });
  it('le MÊME composant dans la fiche Copropriété (bloc « AG ») et dans la fenêtre de la sortie', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/FicheCopropriete.tsx', 'utf8')).toContain('<ArreteComptes coproprieteId={f.id} />');
    expect(readFileSync('app/(admin)/admin/(protected)/location/AgSortie.tsx', 'utf8')).toContain('<ArreteComptes coproprieteId={lu.copropriete.id} alerteSiManquante />');
  });
  // 🔴 Arno (23/11/2026) — « Valider la sortie » : la date manquante MISE EN AVANT
  it('fenêtre de sortie (alerteSiManquante) : bandeau « Date d’arrêté des comptes manquante … » tant qu’elle manque, plus après la saisie', async () => {
    await act(async () => { root.render(createElement(ArreteComptes, { coproprieteId: 7, alerteSiManquante: true })); }); await calmer();
    expect(container.querySelector('[data-arrete-bandeau]')?.textContent).toBe(`⚠ ${BANDEAU_ARRETE_MANQUANT}`);
    expect(BANDEAU_ARRETE_MANQUANT).toBe('Date d’arrêté des comptes manquante : sans elle, le suivi des 20 % ne peut pas être fiable.');
    await clic('[data-arrete-modifier]');
    await choisir('[data-arrete-mois]', '12'); await choisir('[data-arrete-jour]', '31');
    await clic('[data-arrete-enregistrer]');
    expect(posts).toEqual([{ action: 'arrete-comptes', coproprieteId: 7, jour: '31', mois: '12' }]);
    expect(container.querySelector('[data-arrete-bandeau]')).toBeNull();
  });
  it('fiche Copropriété (sans alerteSiManquante) : pas de bandeau', async () => {
    await rendre();
    expect(container.querySelector('[data-arrete-bandeau]')).toBeNull();
  });
});
