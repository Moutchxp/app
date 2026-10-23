// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location/outils' }));
const { EcranOutils } = await import('./EcransLocation');
const { TableauBordSuivi } = await import('./TableauBordSuivi');

/**
 * 🔴 Arno (23/10/2026) — l'annuaire des apporteurs à portée de main : une 3ᵉ brique sur l'accueil des Outils de suivi (avec le
 * nombre d'apporteurs et ceux « à rattacher »), un lien « Gérer les apporteurs → » à côté du filtre « Apporteur ». Les deux
 * ouvrent la MÊME modale que la roue, directement sur l'onglet « Apporteurs ». Route simulée : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
const apporteurs = [
  { id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [], collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] },
  { id: 4, nom: 'Apporteur Repris', type: 'partenaire', archive: false, baremes: [], collegues: [] },
  { id: 5, nom: 'Autre Repris', type: 'partenaire', archive: false, baremes: [], collegues: [] },
  { id: 6, nom: 'Archivé', type: 'partenaire', archive: true, baremes: [], collegues: [] },
];
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, '', '/');   // l'adresse garde l'année et le mois choisis : chaque épreuve repart d'une adresse nue
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('vue=tableau')) return json({ etat: 'ok', data: { disponible: true, annee: 2026, annees: [2026], aujourdhui: '2026-10-22', activites: [], regles: [], apporteurs,
      retrocessions: [], negociateurs: [], gestion: { disponible: true, stock: 0, transitions: [] }, preavis: {}, voirCommissions: true } });
    if (u.includes('/api/admin/location/suivi')) return json({ etat: 'ok', data: { disponible: true, annuaire: true, apporteurs, regles: [], retrocessions: [], negociateurs: [], collegues: [] } });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-22', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (el: ReturnType<typeof createElement>) => { await act(async () => { root.render(el); }); await calmer(); };
const ongletOuvert = () => container.querySelector('[data-modale-parametres] [role="tab"][aria-selected="true"]')?.getAttribute('data-onglet');

describe('🔴 Accès à l’annuaire des apporteurs', () => {
  it('la 3ᵉ brique des Outils de suivi : le nombre d’apporteurs, « à rattacher » en orange ; un clic ouvre la modale sur « Apporteurs »', async () => {
    await monter(createElement(EcranOutils, { administrateur: true }));
    expect([...container.querySelectorAll('[data-brique]')].map((b) => b.getAttribute('data-brique'))).toEqual(['mois', 'annee', 'annuaire']);
    expect(container.querySelector('[data-compte-apporteurs]')?.textContent).toBe('3 apporteurs · 2 à rattacher');
    expect(container.querySelector('[data-compte-a-rattacher]')?.className).toBe('loc-orange');
    await act(async () => { (container.querySelector('[data-brique="annuaire"]') as HTMLButtonElement).click(); });
    await calmer();
    expect(ongletOuvert()).toBe('apporteurs');
    expect(container.querySelector('[data-onglet-apporteurs]')).not.toBeNull();
    // « Honoraires de gestion » est toujours là.
    expect(container.querySelector('[data-outil="honoraires"]')).not.toBeNull();
  });

  it('sans droit administrateur : la brique le dit (comme la roue, l’annuaire est réservé aux administrateurs)', async () => {
    await monter(createElement(EcranOutils, { administrateur: false }));
    expect(container.querySelector('[data-brique="annuaire"]')?.textContent).toContain('Réservé aux administrateurs');
    expect(container.querySelector('button[data-brique="annuaire"]')).toBeNull();
  });

  it('« Gérer les apporteurs → » à côté du filtre « Apporteur », dans le Suivi du mois et dans le Suivi annuel', async () => {
    for (const vue of ['mois', 'annee'] as const) {
      await monter(createElement(TableauBordSuivi, { vue, administrateur: true }));
      const lien = container.querySelector('[data-gerer-apporteurs]') as HTMLButtonElement;
      expect(lien.closest('label')?.querySelector('[data-filtre="apporteur"]')).not.toBeNull();
      await act(async () => { lien.click(); });
      await calmer();
      expect(ongletOuvert()).toBe('apporteurs');
      act(() => { root.unmount(); }); root = createRoot(container);
    }
    await monter(createElement(TableauBordSuivi, { vue: 'annee', administrateur: false }));
    expect(container.querySelector('[data-gerer-apporteurs]')).toBeNull();
  });
});
