// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReponseRdv } from './ReponseRdv';

/**
 * 🔴 Arno (18/11/2026) — la page publique du locataire : l'OUVERTURE du lien n'enregistre RIEN (une messagerie qui visite le lien ne répond jamais à
 * sa place) ; seul « Confirmer : … » enregistre. Le vrai composant ; la route simulée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let reponse: 'accepte' | 'refuse' | null;
let posts: string[];
const rdv = () => ({ sorte: 'edl', jour: '2026-11-25', heure: '14:00', adresse: '12 rue de l’Essai, 75011 PARIS', nom: 'Paul ESSAIPREAVIS', reponse });
const json = (c: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(c), { status, headers: { 'Content-Type': 'application/json' } }));
let racine: Root; let conteneur: HTMLDivElement;
beforeEach(() => {
  reponse = null; posts = [];
  vi.stubGlobal('fetch', vi.fn((_u: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') return json({ peutRepondre: true, cause: null, message: null, rdv: rdv() });
    const b = JSON.parse(String(init?.body)) as { decision: string };
    posts.push(b.decision);
    reponse = b.decision === 'accepter' ? 'accepte' : 'refuse';
    return json({ etat: 'ok', deja: false, peutRepondre: true, cause: null, message: null, rdv: rdv() });
  }));
  conteneur = document.createElement('div'); document.body.appendChild(conteneur); racine = createRoot(conteneur);
});
afterEach(() => { act(() => racine.unmount()); conteneur.remove(); vi.unstubAllGlobals(); });
const ouvrir = async (decision: 'accepter' | 'refuser' | null) => { await act(async () => { racine.render(createElement(ReponseRdv, { jeton: 'J'.repeat(43), decision })); }); await act(async () => {}); };
const clic = async (sel: string) => { await act(async () => { (conteneur.querySelector(sel) as HTMLButtonElement).click(); }); await act(async () => {}); };

describe('🔴 la page de réponse du locataire', () => {
  it('ouvrir le lien « J’accepte » montre le rendez-vous et N’ENREGISTRE RIEN', async () => {
    await ouvrir('accepter');
    expect(conteneur.querySelector('[data-rdv-rappel]')?.textContent).toContain('État des lieux de sortie');
    expect(conteneur.textContent).toContain('12 rue de l’Essai');
    expect(posts).toEqual([]);
  });
  it('« Confirmer : j’accepte » enregistre l’acceptation ; on peut ensuite refuser depuis la même page', async () => {
    await ouvrir('accepter');
    await clic('[data-rdv-confirmer="accepter"]');
    expect(posts).toEqual(['accepter']);
    expect(conteneur.querySelector('[data-rdv-fait]')?.getAttribute('data-rdv-fait')).toBe('accepte');
  });
  it('le lien « Je refuse » propose de confirmer le refus, puis l’enregistre au clic seulement', async () => {
    await ouvrir('refuser');
    expect(posts).toEqual([]);
    await clic('[data-rdv-confirmer="refuser"]');
    expect(posts).toEqual(['refuser']);
    expect(conteneur.querySelector('[data-rdv-fait]')?.getAttribute('data-rdv-fait')).toBe('refuse');
  });
});
