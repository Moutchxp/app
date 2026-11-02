// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_MES_AFFAIRES } from './MesCompteurs';
import { URL_APPORTEURS } from './MesApporteurs';

/**
 * 🔴 MON ESPACE, LOT 9 — l'onglet « Mes apporteurs » dans le VRAI écran de « Mon espace », routes simulées (rien n'est écrit) : la liste
 * (coordonnées, collègue, chiffres), la recherche, « Modifier la fiche » seulement quand le serveur le permet, « + Nouvel apporteur » : un doublon
 * de l'annuaire est annoncé avec son collègue, la création est bloquée, « L'utiliser » ne crée rien. Données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fiche = (id: number, nom: string) => ({ id, nom, type: 'partenaire', baremes: [], archive: false, collegues: [] });
const mon = (o: Record<string, unknown>) => ({ interne: false, societe: null, telephone: null, email: null, collegue: 'Léa', recherche: '', modifiable: true,
  nbVentes: 0, caApporteHt: 0, retroHt: 0, ...o });
const LISTE = {
  apporteurs: [
    mon({ id: 1, libelle: 'DURAND Paul', telephone: '06 12 34 56 78', email: 'paul@durand.fr', nbVentes: 2, caApporteHt: 8000, fiche: fiche(1, 'DURAND Paul') }),
    mon({ id: 2, libelle: 'MARTIN Lise', collegue: 'Marc', modifiable: false, fiche: fiche(2, 'MARTIN Lise') }),
  ],
  collegues: [{ id: 5, libelle: 'Léa' }, { id: 7, libelle: 'Marc' }], titulaireId: 5, administrateur: false, utiliserDisponible: true, identite: true, nomPrenom: true,
};
const DOUBLON = { id: 9, libelle: 'BERNARD Jean', collegue: 'Marc', raisons: ['telephone'] };
let posts: Record<string, unknown>[];
let doublons: unknown[];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  posts = []; doublons = [];
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) });
    if (u.startsWith(URL_MES_AFFAIRES)) return ok({ disponible: true, aujourdhui: '2026-11-02', titulaire: { id: 5, prenom: 'Léa', administrateur: false }, ventes: [],
      compteurs: { compromis: { nb: 0, ids: [], ca: { htC: 0, ttcC: 0 } }, actees: { nb: 0, ids: [], annee: 2026, ca: { htC: 0, ttcC: 0 } }, parAnnee: [] }, retrocessions: [] });
    if (u.startsWith(`${URL_APPORTEURS}/doublons`)) return ok(doublons);
    if (u === URL_APPORTEURS && init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
    if (u === URL_APPORTEURS) return ok(LISTE);
    return { ok: false, status: 500, json: async () => ({}) };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (container.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, v: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }); await calmer();
};
const ouvrir = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await calmer(); await cliquer('[data-onglet-mon-espace="apporteurs"]'); };
const ids = () => [...container.querySelectorAll('[data-mon-apporteur]')].map((e) => e.getAttribute('data-mon-apporteur'));

describe('🔴 « Mes apporteurs »', () => {
  it('la liste : coordonnées, collègue de rattachement, ventes et CA apporté sur mes ventes', async () => {
    await ouvrir();
    expect(ids()).toEqual(['1', '2']);
    const p = container.querySelector('[data-mon-apporteur="1"]')!.textContent ?? '';
    expect(p).toContain('06 12 34 56 78');
    expect(p).toContain('paul@durand.fr');
    expect(p).toContain('Collègue de rattachement : Léa');
    expect(p.replace(/\s/g, ' ')).toContain('2 ventes — CA apporté 8 000 € HT');
  });
  it('la recherche : nom, téléphone, e-mail', async () => {
    await ouvrir();
    await saisir('[data-recherche-apporteur]', 'martin');
    expect(ids()).toEqual(['2']);
    await saisir('[data-recherche-apporteur]', '0612');
    expect(ids()).toEqual(['1']);
    await saisir('[data-recherche-apporteur]', 'durand.fr');
    expect(ids()).toEqual(['1']);
  });
  it('« Modifier la fiche » : seulement là où le serveur le permet (son collègue, un administrateur)', async () => {
    await ouvrir();
    expect(container.querySelector('[data-modifier-apporteur="1"]')).not.toBeNull();
    expect(container.querySelector('[data-modifier-apporteur="2"]')).toBeNull();
  });
  it('« + Nouvel apporteur » : le même formulaire ; l’externe est rattaché à moi par défaut', async () => {
    await ouvrir();
    await cliquer('[data-nouvel-apporteur-mon-espace]');
    expect(container.querySelector('[data-nouvel-apporteur-transaction]')).not.toBeNull();
    expect(container.querySelector('[data-nouvel-apporteur-collegue]')?.textContent).toContain('Léa');
  });
  it('un doublon de l’annuaire : « Cet apporteur existe déjà, rattaché à Marc », création bloquée ; « L’utiliser » ne crée rien', async () => {
    doublons = [DOUBLON];
    await ouvrir();
    await cliquer('[data-nouvel-apporteur-mon-espace]');
    await saisir('[data-nouvel-apporteur-champ="telephone"]', '0611111111');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); }); await calmer();
    expect(container.querySelector('[data-doublon="9"]')?.textContent).toContain('Cet apporteur existe déjà, rattaché à Marc');
    expect((container.querySelector('[data-creer-apporteur-transaction]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer('[data-utiliser-apporteur="9"]');
    expect(posts).toEqual([{ action: 'utiliser', apporteurId: 9 }]);
    expect(container.querySelector('[data-nouvel-apporteur-transaction]')).toBeNull();
  });
  it('rien en commun : la création passe par la route de « Mon espace »', async () => {
    await ouvrir();
    await cliquer('[data-nouvel-apporteur-mon-espace]');
    await saisir('[data-nouvel-apporteur-champ="nom"]', 'NOUVELLE');
    await saisir('[data-nouvel-apporteur-champ="prenom"]', 'Zoé');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); }); await calmer();
    await cliquer('[data-creer-apporteur-transaction]');
    expect(posts[0]).toMatchObject({ action: 'creer', apporteur: { nom: 'Zoé NOUVELLE', collegueId: 5, interne: false } });
  });
});
