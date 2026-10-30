// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { CSS_SUPPRIMER_LOCATION, SupprimerLocation } from './SupprimerLocation';

/**
 * 🔴🔴 LOT LS1 (Arno, 30/10/2026, option A) — « Supprimer » une location (Suivi du mois) : le bouton, la confirmation écrite d'après le plan du
 * serveur (simple, avec un locataire conservé, sans profil supprimé), « Annuler » ne change rien, « Oui, supprimer » appelle le serveur ;
 * l'observateur ne voit pas le bouton et le serveur le refuse (403). Le geste lui-même (règle, contrôle serveur, CA, journal) est éprouvé sur
 * la recette par `app/lib/location/suivi/suppressionLocation.itest.ts` (transaction annulée).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let plan: Record<string, unknown>;
const simple = { id: 105, bien: '114 Rue du Château, 92100 Boulogne', dateSignature: '2026-09-01', locataires: [{ id: 241, nom: 'Jules HANQUIEZ', conserve: false, autreBien: null }] };
beforeEach(() => {
  posts = []; plan = simple;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: plan }) }; }
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: plan }) };
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const cliquer = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };
const monter = async (onFini = vi.fn()) => { await act(async () => { root.render(createElement(SupprimerLocation, { id: 105, onFini })); }); await calmer(); return onFini; };
const texte = (sel: string) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('🔴 LOT LS1 — « Supprimer » une location', () => {
  it('le bouton : « Supprimer », texte rouge discret (pas un bouton plein)', async () => {
    await monter();
    const b = container.querySelector('[data-supprimer-location="105"]')!;
    expect([b.textContent, b.className]).toEqual(['Supprimer', 'fdm-supprimer-location']);
    expect(CSS_SUPPRIMER_LOCATION.replace(/\s+/g, ' ')).toContain('.fdm-supprimer-location{appearance:none;border:0;background:transparent;color:var(--color-svv-red)');
  });

  it('la fenêtre simple : la location, « profil supprimé », les propriétaires et le bien conservés, la limite de la tuile Gestion', async () => {
    await monter();
    await cliquer('[data-supprimer-location]');
    expect(texte('[data-fenetre-suppression] h3')).toBe('Supprimer cette location ?');
    expect(texte('[data-phrase-action]')).toBe('Cette action supprime la location 114 Rue du Château, 92100 Boulogne — 01/09/2026 et le profil du ou des locataires concernés.');
    expect(texte('[data-phrase-conserve]')).toBe('Toutes les données du ou des propriétaires et toutes les données du bien sont conservées, pour permettre une nouvelle location.');
    expect(texte('[data-locataire-suppression="241"]')).toBe('Jules HANQUIEZ — profil supprimé');
    expect(texte('[data-limite-gestion]')).toBe('Dans la tuile Gestion, la fiche du bien peut encore afficher cet ancien locataire.');
    expect(document.querySelector('[data-aucun-profil]')).toBeNull();
    expect([texte('[data-confirmer-suppression]'), texte('[data-annuler-suppression]')]).toEqual(['Oui, supprimer', 'Annuler']);
    expect(document.querySelector('[data-confirmer-suppression]')!.className).toContain('svv-btn-primary');
  });

  it('un locataire rattaché à un autre bien : sa phrase ; deux locataires dont un conservé', async () => {
    plan = { ...simple, locataires: [{ id: 1, nom: 'Léa RESTE', conserve: false, autreBien: null }, { id: 2, nom: 'Tom AILLEURS', conserve: true, autreBien: '71 Rue de la République, 92800 Puteaux' }] };
    await monter();
    await cliquer('[data-supprimer-location]');
    expect([...document.querySelectorAll('[data-locataire-suppression]')].map((l) => l.textContent)).toEqual([
      'Léa RESTE — profil supprimé',
      'Tom AILLEURS est aussi rattaché à 71 Rue de la République, 92800 Puteaux. Ses coordonnées sont conservées pour cette autre location ; seul son lien avec la location supprimée est retiré.']);
  });

  it('aucun profil supprimé : l’en-tête le dit', async () => {
    plan = { ...simple, locataires: [{ id: 2, nom: 'Tom AILLEURS', conserve: true, autreBien: '71 Rue de la République' }] };
    await monter();
    await cliquer('[data-supprimer-location]');
    expect(texte('[data-aucun-profil]')).toBe('Aucun profil de locataire ne sera supprimé.');
    expect(texte('[data-phrase-action]')).toBe('Cette action supprime la location 114 Rue du Château, 92100 Boulogne — 01/09/2026.');
  });

  it('« Annuler » (et Échap) ne change rien : aucun appel d’écriture ; « Oui, supprimer » : l’appel au serveur, puis la relecture (la ligne disparaît)', async () => {
    const onFini = await monter();
    await cliquer('[data-supprimer-location]');
    await cliquer('[data-annuler-suppression]');
    expect([document.querySelector('[data-fenetre-suppression]'), posts, onFini.mock.calls.length]).toEqual([null, [], 0]);
    await cliquer('[data-supprimer-location]');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); await calmer();
    expect([document.querySelector('[data-fenetre-suppression]'), posts]).toEqual([null, []]);
    await cliquer('[data-supprimer-location]');
    await cliquer('[data-confirmer-suppression]');
    expect(posts).toEqual([{ action: 'supprimer-location', id: 105 }]);
    expect(onFini).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-fenetre-suppression]')).toBeNull();
  });

  it('observateur : le bouton est masqué (marquage « lecture seule » de la page) et le serveur refuse l’écriture (403, garde centrale)', async () => {
    expect(CSS_SUPPRIMER_LOCATION).toContain('.fdm-supprimer-location[data-lecture-seule]{display:none !important}');
    const { estBoutonAction } = await import('../ModeObservateur');
    expect(estBoutonAction('button', 'Supprimer')).toBe(true);
    const { ecritureRefuseeObservateur } = await import('../../../../lib/admin/observateur');
    expect(ecritureRefuseeObservateur('observateur', 'POST', '/api/admin/location/suivi')).toBe(true);
  });

  it('sa place : en bas de la ligne dépliée, après « Convertir en … » ; la route : la lecture du plan et le geste, tracés', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/FeuilleDuMois.tsx', 'utf8');
    expect(src.indexOf('<SupprimerLocation id={a.id} onFini={onRelire} />')).toBeGreaterThan(src.indexOf('<ConversionMandat a={a} onFini={onRelire} />'));
    const route = readFileSync('app/(admin)/api/admin/location/suivi/route.ts', 'utf8').replace(/\s+/g, ' ');
    expect(route).toContain("vue') === 'suppression-location') return json(await lirePlanSuppression(");
    expect(route).toContain("case 'supprimer-location': {");
  });
});
