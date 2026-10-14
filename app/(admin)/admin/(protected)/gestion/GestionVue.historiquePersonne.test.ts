// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-PERSONNE-SANS-BANDEAU (accord explicite d'Arno, 14/10/2026) ═════════════════════════════════════
 * Sur l'historique d'une fiche PROPRIÉTAIRE ou LOCATAIRE, le bloc sous le titre « Gestion » n'est plus affiché : la phrase
 * « Courrier de gestion locative… », le cadre « Dernière relève… » et ses boutons, « Relève automatique… » et « Copie des
 * pièces vers le Drive… ». Il reste, identique, sur les autres écrans qui l'avaient. Les alertes restent partout.
 * Le VRAI écran, routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ECRAN = {
  file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0,
  evenements: [], evenementsTotal: 0, messagesCaptures: 56000, messagesExclus: 40000,
  derniereReleveLe: new Date(Date.now() - 30_000).toISOString(),
};
let container: HTMLDivElement;
let root: Root;
let veille: unknown;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  veille = null;
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/empreinte')) return { ok: true, json: async () => ({ messageMax: 1, veille }) } as unknown as Response;
    if (u.includes('/boite')) return { ok: true, json: async () => ({ lignes: [], suivant: null, total: null, comptes: {} }) } as unknown as Response;
    if (u.includes('/historique')) return { ok: true, json: async () => ({ etat: 'inconnue' }) } as unknown as Response;
    return { ok: true, json: async () => ECRAN } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (adresse: string) => {
  window.history.replaceState(null, '', `/admin/gestion${adresse}`);
  await act(async () => { root.render(createElement(GestionVue)); });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
const styles = () => [...container.querySelectorAll('style')].map((s) => s.textContent ?? '');
const PHRASE = '.gst-page > .svv-page-head > .svv-page-sub{display:none}';

describe('🔴 historique d’une fiche PROPRIÉTAIRE et LOCATAIRE : le bloc n’est plus affiché', () => {
  for (const cible of ['proprio-79', 'locataire-254']) {
    it(cible, async () => {
      await monter(`?ecran=historique&cible=${cible}`);
      expect(container.querySelector('.gst-bandeau')).toBeNull();
      for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire', 'À rattacher']) expect(boutons()).not.toContain(mot);
      expect(container.querySelector('p.gst-veille:not(.gst-veille--alerte)')).toBeNull();
      // La phrase « Courrier de gestion locative… » (rendue par la page) est masquée par la feuille.
      expect(styles()).toContain(PHRASE);
      // La navigation propre à la fiche reste.
      expect(boutons()).toContain('← Écran partagé');
      expect(boutons()).toContain('Réception');
    });
  }
});

describe('il reste, identique, sur les autres écrans qui l’avaient', () => {
  it('« À rattacher » : cadre de relève, ses boutons, la ligne « Relève automatique »', async () => {
    await monter('?ecran=a_trier');
    expect(container.querySelector('.gst-bandeau')).not.toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire']) expect(boutons()).toContain(mot);
    expect(container.querySelector('p.gst-veille')).not.toBeNull();
    expect(styles()).not.toContain(PHRASE);
  });
  it('l’historique d’un BIEN (écran complet) : inchangé', async () => {
    await monter('?ecran=historique&cible=lot-155');
    expect(container.querySelector('.gst-bandeau')).not.toBeNull();
    expect(boutons()).toContain('Relever maintenant');
    expect(styles()).not.toContain(PHRASE);
  });
});
