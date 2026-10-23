// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';

/**
 * 🔴 Arno (23/10/2026) — le sélecteur d'état de la carte en plein écran (« À traiter / En cours / Traité ») : choisir « Traité »
 * est un passage à la clôture comme un autre. LA MÊME MODALE ; « Annuler » ne change rien ; « Clôturer » pose la carte Clôture
 * par la route de la frise (le point d'entrée unique du serveur). Vrai composant, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown, statut = 200) => ({ ok: statut < 400, status: statut, json: async () => corps }) as unknown as Response;
const CARTE = {
  evenementId: 7, reference: 'GES-2026-000007', objet: 'Avis de passage désinsectisation', demandeur: null, adresseLibre: null,
  etat: 'en_cours', ouvertLe: '2026-10-23T12:05:00Z', dernierEchangeLe: null, nbFils: 0, nbMailsDeplaces: 0, attend: false,
  derniereEtape: null, derniereEtapeMonga: null, mongaMajLe: null, vuLe: null, mongaRefs: [], categorie: null, urgence: null,
  nbRecusNonLus: 0, nouveauteLe: null, bien: null, nbBiens: 0,
} as unknown as CarteEvenement;
const DETAIL = {
  evenementId: 7, reference: 'GES-2026-000007', objet: 'Avis de passage désinsectisation', demandeurNom: null, demandeurEmail: null,
  adresseLibre: null, etat: 'en_cours', categorie: null, urgence: null, ouvertLe: '2026-10-23T12:05:00Z', ouvertPar: null,
  traiteLe: null, traitePar: null, fils: [], mailsDeplaces: [], biens: [], parties: [],
};

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; init?: RequestInit }[];
beforeEach(() => {
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container); root = createRoot(container);
  appels = [];
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, init });
    if (u.endsWith('/frise') && init?.method === 'POST') return json({ etat: 'ok', message: 'Événement clôturé.', etatEvenement: 'traite' });
    if (u === '/api/admin/gestion/evenements/7') return json({ ok: true, data: DETAIL, ...DETAIL });
    return json({ etat: 'ok', ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const attendre = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
const clic = async (e: Element | null | undefined) => { if (!e) throw new Error('absent'); await act(async () => { (e as HTMLElement).click(); }); await attendre(); };
const ecritures = () => appels.filter((a) => a.init?.method === 'POST' && !a.url.endsWith('/vus') || a.init?.method === 'PATCH');

describe('🔴 « Traité » : la modale de clôture, puis la carte Clôture', () => {
  it('Traité → modale ; Annuler → rien ; Clôturer → POST de la frise { type: cloture }', async () => {
    const onGeste = vi.fn();
    await act(async () => { root.render(createElement(CarteVive, { carte: CARTE, maintenant: new Date('2026-10-23T18:00:00Z'), onGeste })); });
    await attendre();
    const deplier = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-expanded') === 'false');
    await clic(deplier);
    const traite = () => [...document.querySelectorAll('[aria-label="État de l’événement"] button')].find((b) => b.textContent === 'Traité');
    await clic(traite());
    expect(q('.mis-boite')?.textContent).toContain('Cet événement sera clôturé. Sa frise disparaîtra de la fiche');
    await clic(q('[data-annuler-carte-borne]'));
    expect(q('.mis-boite')).toBeNull();
    expect(ecritures()).toHaveLength(0);
    await clic(traite());
    await clic(q('[data-confirmer-carte-borne]'));
    expect(ecritures()).toHaveLength(1);
    expect(ecritures()[0].url).toBe('/api/admin/gestion/evenements/7/frise');
    expect(JSON.parse(String(ecritures()[0].init?.body))).toEqual({ type: 'cloture' });
    expect(onGeste).toHaveBeenCalledWith('Événement GES-2026-000007 : clôturé.');
  });
});
