// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MesCompteurs, URL_MES_AFFAIRES } from './MesCompteurs';

/**
 * 🔴 MON ESPACE, LOT 3 — l'accueil de l'espace : les deux compteurs (nombre — mon CA) lus de la route, la bascule « HT | TTC » du Suivi CA ;
 * un compte sans aucune vente : zéro partout, sans erreur ; une lecture impossible : un message, jamais un écran blanc. Route simulée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let reponse: { status: number; corps: unknown };
let container: HTMLDivElement;
let root: Root;
const compteurs = (cNb: number, cHt: number, aNb: number, aHt: number) => ({ compromis: { nb: cNb, ids: [], ca: { htC: cHt, ttcC: cHt * 1.2 } },
  actees: { annee: 2026, nb: aNb, ids: [], ca: { htC: aHt, ttcC: aHt * 1.2 } } });
beforeEach(() => {
  try { window.localStorage.setItem('trx-affichage-montants', 'ht'); } catch { /* sans stockage */ }
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (url: string) => {
    expect(url).toBe(URL_MES_AFFAIRES);
    return { ok: reponse.status === 200, status: reponse.status, json: async () => reponse.corps };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const rendre = async () => { await act(async () => { root.render(createElement(MesCompteurs)); }); await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const texte = (sel: string): string => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';

describe('🔴 les compteurs de « Mon espace »', () => {
  it('« 2 compromis — 15 000 € HT » et « 1 vente — 5 000 € HT » ; la bascule TTC montre les montants TTC', async () => {
    reponse = { status: 200, corps: { etat: 'ok', data: { disponible: true, aujourdhui: '2026-11-02', ventes: [], titulaire: { id: 5, prenom: 'Léa', administrateur: false },
      compteurs: compteurs(2, 1500000, 1, 500000) } } };
    await rendre();
    expect(texte('[data-compteur="compromis"] .mes-compteur-chiffres')).toBe('2 compromis — 15 000 € HT');
    expect(texte('[data-compteur="actees"] h3')).toBe('Mes ventes actées cette année (2026)');
    expect(texte('[data-compteur="actees"] .mes-compteur-chiffres')).toBe('1 vente — 5 000 € HT');
    await act(async () => { (container.querySelector('[data-afficher="ttc"]') as HTMLElement).click(); });
    expect(texte('[data-compteur="compromis"] [data-compteur-total]')).toBe('18 000 € TTC');
  });
  it('un compte sans aucune vente : zéro partout, aucun message d’erreur', async () => {
    reponse = { status: 200, corps: { etat: 'ok', data: { disponible: true, aujourdhui: '2026-11-02', ventes: [], titulaire: { id: 9, prenom: null, administrateur: false },
      compteurs: compteurs(0, 0, 0, 0) } } };
    await rendre();
    expect([texte('[data-compteur="compromis"] .mes-compteur-chiffres'), texte('[data-compteur="actees"] .mes-compteur-chiffres')]).toEqual(['0 compromis — 0 € HT', '0 vente — 0 € HT']);
    expect(container.querySelector('[data-mon-espace-erreur]')).toBeNull();
  });
  it('lecture refusée ou impossible : un message, pas de compteur', async () => {
    reponse = { status: 403, corps: { erreur: 'ACCES_REVOQUE' } };
    await rendre();
    expect(texte('[data-mon-espace-erreur]')).toBe('Vos affaires n’ont pas pu être lues. Rechargez la page.');
    expect(container.querySelector('[data-compteur]')).toBeNull();
  });
});
