// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { ConfirmationsEnregistrement } from './ConfirmationsEnregistrement';

/**
 * 🔴 Arno (21/10/2026) — TUILE LOCATION : l'hôte des confirmations, avec le vrai composant et un `fetch` simulé :
 *   · une écriture réussie → modale VERTE « ✓ … » (la fiche, « Voir la fiche ») ; refusée / serveur muet → modale ROUGE (quoi,
 *     pourquoi, quoi faire ; saisie conservée) ;
 *   · le bouton du geste passe à « Enregistrement… » le temps de la requête, puis revient ;
 *   · un DOUBLE CLIC n'envoie qu'UNE requête (les deux appels reçoivent la même réponse) ;
 *   · une lecture, une route d'ailleurs, un écran qui confirme lui-même : rien ;
 *   · l'hôte démonté (hors de la tuile) : tout passe, rien ne s'annonce.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let reponses: { statut: number; corps: unknown } | 'panne';
let appels: string[];
let liberer: (() => void) | null;
let retenir: boolean;
let hote: HTMLDivElement;
let racine: Root;
beforeEach(() => {
  delete (window as unknown as { __svavConfirmations?: unknown }).__svavConfirmations;
  const adm = document.createElement('div'); adm.className = 'svv-adm-root'; document.body.appendChild(adm);
  appels = []; liberer = null; retenir = false; reponses = { statut: 200, corps: { etat: 'ok' } };
  window.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    appels.push(`${init?.method ?? 'GET'} ${url} ${String(init?.body ?? '')}`);
    if (retenir) await new Promise<void>((r) => { liberer = r; });
    if (reponses === 'panne') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(reponses.corps), { status: reponses.statut, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  const titre = document.createElement('h3'); titre.className = 'ann-tete-nom'; titre.textContent = 'DUPONT Paul'; document.body.appendChild(titre);
});
afterEach(() => { act(() => racine.unmount()); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); }); };
const monter = async () => { await act(async () => { racine.render(createElement(ConfirmationsEnregistrement)); }); };
const modale = () => document.querySelector('[data-modale-issue]');
const bouton = (texte: string): HTMLButtonElement => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = texte; document.body.appendChild(b); return b;
};
/** Un clic sur un bouton de l'écran qui déclenche une écriture (comme les écrans de la tuile). */
const geste = (b: HTMLButtonElement, corps: Record<string, unknown>, url = '/api/admin/location') => {
  let p: Promise<Response> | null = null;
  b.onclick = () => { p = fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }); };
  b.click();
  return p as unknown as Promise<Response>;
};

describe('🔴 les confirmations d’enregistrement de la tuile Location', () => {
  it('SUCCÈS : modale verte « ✓ … », la fiche, « Voir la fiche » ; la réponse reste intacte pour l’écran', async () => {
    await monter();
    const p = geste(bouton('Enregistrer'), { action: 'conditions-entree', occupationId: 4 });
    await act(async () => { expect(await (await p).json()).toEqual({ etat: 'ok' }); });
    await calmer();
    expect(modale()?.getAttribute('data-modale-issue')).toBe('succes');
    expect(modale()?.querySelector('h2')?.textContent).toBe('✓ Conditions d’entrée enregistrées');
    expect(modale()?.querySelector('[data-resume]')?.textContent).toBe('FicheDUPONT Paul');
    expect(modale()?.querySelector('[data-voir-fiche-confirmation]')?.getAttribute('href')).toBe('/');
    await act(async () => { (modale()!.querySelector('[data-fermer-confirmation]') as HTMLElement).click(); });
    expect(modale()).toBeNull();
  });

  it('ÉCHEC (refus du serveur) : modale rouge — quoi, pourquoi, quoi faire, saisie conservée', async () => {
    reponses = { statut: 200, corps: { etat: 'refus', motif: 'La surface doit être un nombre.' } };
    await monter();
    await geste(bouton('Enregistrer'), { action: 'modifier-bien', id: 3 });
    await calmer();
    expect(modale()?.getAttribute('data-modale-issue')).toBe('erreur');
    expect(modale()?.querySelector('[data-echec-quoi]')?.textContent).toBe('Le bien n’a pas été enregistré.');
    expect(modale()?.querySelector('[data-echec-pourquoi]')?.textContent).toBe('La surface doit être un nombre.');
    expect(modale()?.querySelector('[data-echec-faire]')?.textContent).toBe('Corrigez ce point, puis cliquez à nouveau sur le bouton.');
    expect(modale()?.querySelector('[data-echec-conserve]')?.textContent).toBe('Rien n’a été enregistré. Votre saisie est conservée : vous pouvez réessayer.');
  });

  it('ÉCHEC (serveur muet) : modale rouge « technique » ; l’écran reçoit toujours l’erreur', async () => {
    reponses = 'panne';
    await monter();
    await act(async () => { await expect(geste(bouton('Enregistrer'), { action: 'sortie-locataires' })).rejects.toThrow(); });
    await calmer();
    expect(modale()?.querySelector('[data-echec-pourquoi]')?.textContent).toBe('Le serveur n’a pas répondu ou a rencontré une erreur technique.');
  });

  it('le bouton passe à « Enregistrement… » pendant la requête, puis revient ; un DOUBLE CLIC n’envoie qu’UNE requête', async () => {
    retenir = true;
    await monter();
    const b = bouton('Enregistrer l’annotation');
    const p1 = geste(b, { action: 'modifier-bien', id: 7, champs: { annotation: 'x' } });
    expect(b.dataset.enregistrement).toBe('en-cours');
    expect(b.getAttribute('aria-busy')).toBe('true');
    const css = document.querySelector('style')?.textContent ?? '';
    expect(css).toContain('content:"Enregistrement…"');
    expect(css).toContain('pointer-events:none');
    const p2 = fetch('/api/admin/location', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'modifier-bien', id: 7, champs: { annotation: 'x' } }) });
    expect(appels).toHaveLength(1);
    await act(async () => { liberer?.(); });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(await r1.json()).toEqual({ etat: 'ok' });
    expect(await r2.json()).toEqual({ etat: 'ok' });
    await calmer();
    expect(appels).toHaveLength(1);
    expect(b.dataset.enregistrement).toBeUndefined();
    expect(b.hasAttribute('aria-busy')).toBe(false);
  });

  it('rien pour une lecture, une route d’ailleurs, un écran qui confirme lui-même ; hôte démonté : tout passe', async () => {
    await monter();
    await fetch('/api/admin/location?lot=3');
    await fetch('/api/admin/location', { method: 'POST', body: JSON.stringify({ action: 'creer-bien' }) });
    await fetch('/api/admin/location', { method: 'POST', body: JSON.stringify({ action: 'apercu-lots' }) });
    await fetch('/api/admin/gestion/taches', { method: 'POST', body: JSON.stringify({ action: 'creer' }) });
    await calmer();
    expect(modale()).toBeNull();
    act(() => racine.unmount()); racine = createRoot(hote);
    await fetch('/api/admin/location', { method: 'POST', body: JSON.stringify({ action: 'modifier-bien' }) });
    await calmer();
    expect(modale()).toBeNull();
    expect(appels).toHaveLength(5);
  });

  it('monté sur TOUTE la tuile Location (son layout)', () => {
    const layout = readFileSync('app/(admin)/admin/(protected)/location/layout.tsx', 'utf8');
    expect(layout).toMatch(/<ConfirmationsEnregistrement \/>\s*\{children\}/);
  });
});
