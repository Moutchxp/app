// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');

/**
 * 🔴 Arno (22/10/2026, migration 406) — la roue « Paramètres Location », onglets « Apporteurs » et « Commissions » : le
 * référentiel et ses taux DATÉS (une nouvelle version, jamais une correction en arrière), la règle du négociateur, les
 * rétrocessions (annulées, jamais supprimées). Les vrais composants, route simulée : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let suivi: Record<string, unknown>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = [];
  suivi = { disponible: true, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }],
    apporteurs: [{ id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }, { depuis: '2026-06-01', taux: 0.12, coutFixeMensuel: 50 }] }],
    regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }],
    retrocessions: [{ id: 8, negociateurId: 5, negociateurLibelle: 'Jean-Baptiste PONS', mois: '2026-08-01', montant: 200, libelle: 'Alex Coms' }] };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push({ ...JSON.parse(String(init.body)) as Record<string, unknown>, url: String(url) }); return json({ etat: 'ok' }); }
    if (String(url).includes('/suivi')) return json({ etat: 'ok', data: suivi });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-22', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ouvrir = async (onglet: string) => {
  await act(async () => { root.render(createElement(ModaleParametresLocation, { onFermer: () => {} })); });
  await calmer();
  await clic(container.querySelector(`[data-onglet="${onglet}"]`)!);
};

describe('🔴 Paramètres Location — Apporteurs et Commissions', () => {
  it('les cinq onglets ; les trois d’avant sont toujours là', async () => {
    await ouvrir('apporteurs');
    expect([...container.querySelectorAll('[data-onglet]')].map((b) => b.textContent))
      .toEqual(['Destinataires du mail', 'Barèmes d’honoraires', 'Archivage des fins de gestion', 'Apporteurs', 'Commissions']);
  });

  it('Apporteurs : le taux EN VIGUEUR aujourd’hui et l’historique ; « Nouveau taux » crée une version datée', async () => {
    await ouvrir('apporteurs');
    const ligne = container.querySelector('[data-apporteur="3"]')!;
    expect(ligne.textContent).toContain('Taux 12 % · coût fixe 50,00 € / mois (depuis le 01/06/2026)');
    expect(ligne.textContent).toContain('Historique : 01/01/2026 → 10 %');
    await clic(ligne.querySelector('[data-nouveau-taux="3"]')!);
    const champs = ligne.querySelectorAll('[data-nouvelle-version] input');
    await saisir(champs[0] as HTMLInputElement, '15');
    await saisir(champs[2] as HTMLInputElement, '2026-11-01');
    await clic(ligne.querySelector('[data-enregistrer-version]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'bareme-apporteur', apporteurId: 3, bareme: { taux: '15', coutFixe: '50', depuis: '2026-11-01' } });
  });

  it('Apporteurs : « + Ajouter l’apporteur »', async () => {
    await ouvrir('apporteurs');
    await saisir(container.querySelector('[data-nom-apporteur]') as HTMLInputElement, 'Leboncoin');
    await saisir(container.querySelector('[data-taux-apporteur]') as HTMLInputElement, '0');
    await clic(container.querySelector('[data-ajouter-apporteur]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'creer-apporteur', apporteur: { nom: 'Leboncoin', type: 'partenaire', taux: '0' } });
  });

  it('Commissions : la règle en vigueur ; une rétrocession s’ajoute, et s’ANNULE (jamais supprimée)', async () => {
    await ouvrir('commissions');
    expect(container.querySelector('[data-regle="2026-01-01"]')?.textContent).toContain('Taux 15 % · prime logement 150,00 € · prime parking 15,00 €');
    expect(container.querySelector('[data-retrocession="8"]')?.textContent).toContain('Alex Coms — 200,00 €');
    await clic(container.querySelector('[data-annuler-retrocession="8"]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'annuler-retrocession', id: 8 });
    expect(container.querySelector('[data-enregistrer-parametres]')?.hasAttribute('hidden')).toBe(true);
  });

  it('sans la migration 406 : le dit, rien à saisir', async () => {
    suivi = { disponible: false };
    await ouvrir('commissions');
    expect(container.querySelector('[data-suivi-sans-migration]')?.textContent).toContain('migration 406');
    expect(container.querySelector('[data-ajouter-retrocession]')).toBeNull();
  });
});
