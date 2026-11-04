// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';

/**
 * ══ 🔴🔴 LOT NEW-EVENEMENT-PROPRE (04/11/2026) — DÉPLIER LA CARTE ÉTEINT SON « NEW » ════════════════════════════
 * Règle d'Arno : le « New » disparaît dès qu'on ouvre (déplie) la carte, et ne revient qu'avec un NOUVEAU mail reçu.
 * 🔒 `fetch` est doublé : aucune base, aucun Gmail.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CARTE: CarteEvenement = {
  evenementId: 9, reference: 'GES-2026-000009', objet: 'Fuite salle de bain', demandeur: 'Mme M.',
  adresseLibre: '28 avenue Marceau', etat: 'a_traiter', ouvertLe: '2026-09-20T12:00:00Z',
  dernierEchangeLe: '2026-09-22T12:00:00Z', nbFils: 1, nbMailsDeplaces: 0, attend: true,
  derniereEtape: null, derniereEtapeMonga: null, mongaMajLe: null, vuLe: null, mongaRefs: [],
  categorie: null, urgence: null, nbRecusNonLus: 1, nouveauteLe: '2026-09-22T12:00:00Z',
  bien: { cle: '315', adresse: '28 avenue Marceau', commune: 'PARIS', proprietaire: null, locataire: null },
  nbBiens: 1,
};

let container: HTMLDivElement;
let root: Root;
let appels: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    appels.push(`${(init?.method ?? 'GET').toUpperCase()} ${String(url)}`);
    return { ok: true, status: 200, json: async () => ({ ok: true, fils: [], mailsDeplaces: [], biens: [], parties: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { await Promise.resolve(); }); };
const rendre = async (carte: CarteEvenement) => {
  await act(async () => {
    root.render(createElement(CarteVive, { carte, maintenant: new Date('2026-09-23T12:00:00Z'), onOuvrirBien: () => {}, onGeste: () => {} }));
  });
  await calmer();
};
const pastille = () => container.querySelector('.gst-neuf');
const basculer = async () => { await act(async () => { (container.querySelector('.svv-repli-titre') as HTMLElement).click(); }); await calmer(); };
const vus = () => appels.filter((a) => a === 'POST /api/admin/gestion/evenements/9/nouveaute-vue');

describe('🔴 le « New » de la carte', () => {
  it('repliée : la pastille est là, et aucune requête ne part', async () => {
    await rendre(CARTE);
    expect(pastille()?.textContent).toContain('New');
    expect(appels).toEqual([]);
  });

  it('dépliée : la pastille s’éteint tout de suite, et l’événement est marqué vu (une fois)', async () => {
    await rendre(CARTE);
    await basculer();
    expect(pastille()).toBeNull();
    expect(vus()).toHaveLength(1);
    await basculer(); await basculer(); // replier, rouvrir : rien de neuf, rien de plus
    expect(vus()).toHaveLength(1);
    expect(pastille()).toBeNull();
  });

  it('un NOUVEAU mail reçu (nouvelle date) rallume la pastille à la relecture', async () => {
    await rendre(CARTE);
    await basculer();
    expect(pastille()).toBeNull();
    await rendre({ ...CARTE, nouveauteLe: '2026-09-23T09:00:00Z', nbRecusNonLus: 1 });
    expect(pastille()?.textContent).toContain('New');
  });

  it('une carte qui n’est pas « New » : déplier n’écrit rien pour elle', async () => {
    await rendre({ ...CARTE, nouveauteLe: null, nbRecusNonLus: 0 });
    await basculer();
    expect(vus()).toHaveLength(0);
  });
});
