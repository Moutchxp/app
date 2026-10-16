// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReponseTache } from './ReponseTache';

/**
 * Lot GESTION-ACCEPTATION — décision d'Arno du 16/10/2026 : l'OUVERTURE du lien n'enregistre RIEN (un antivirus qui
 * visite le lien ne doit pas accepter à la place du collaborateur) ; seul le clic sur « Confirmer l'acceptation »
 * enregistre. Le vrai composant est rendu ; la route est simulée (état en mémoire), ainsi que l'agenda.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TACHE = { objet: 'Visite', echeance: 'mar. 20 oct. · 9 h 30', adresse: '7 avenue de l’Union', demandeur: 'Arnaud Jorel' };
let statut: 'en_attente' | 'acceptee' | 'refusee';
let posts: { decision: string; motif?: string }[];
let evenementsAgenda: number;

const resume = () => ({
  tache: { ...TACHE, statut },
  peutRepondre: statut === 'en_attente',
  cause: statut === 'en_attente' ? null : 'deja_utilise',
  message: statut === 'en_attente' ? null : 'Ce lien a déjà servi : votre réponse a été enregistrée.',
});
const repondre = (corps: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  statut = 'en_attente'; posts = []; evenementsAgenda = 0;
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') return repondre(resume());
    const b = JSON.parse(String(init?.body)) as { decision: string; motif?: string };
    posts.push(b);
    if (statut !== 'en_attente') return repondre({ erreur: 'déjà', ...resume() }, 409);
    statut = b.decision === 'accepter' ? 'acceptee' : 'refusee';
    if (statut === 'acceptee') evenementsAgenda = Math.min(1, evenementsAgenda + 1); // agenda idempotent : un seul événement
    return repondre({ etat: 'ok', statut, agenda: 'Agenda Google à jour.', ...resume() });
  }));
});

let racine: Root; let conteneur: HTMLDivElement;
async function ouvrir(decision: 'accepter' | 'refuser' | null) {
  conteneur = document.createElement('div'); document.body.appendChild(conteneur);
  racine = createRoot(conteneur);
  await act(async () => { racine.render(createElement(ReponseTache, { jeton: 'JETON', decision })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const texte = () => conteneur.textContent ?? '';
const bouton = (t: string) => [...conteneur.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(t));
afterEach(() => { act(() => racine.unmount()); conteneur.remove(); vi.unstubAllGlobals(); });

describe('page publique de réponse — « Accepter »', () => {
  it('ouverture seule du lien → RIEN n’est enregistré (lecture uniquement), un seul bouton « Confirmer l’acceptation »', async () => {
    await ouvrir('accepter');
    expect(posts).toEqual([]);
    expect(statut).toBe('en_attente');
    expect(evenementsAgenda).toBe(0);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
    expect(bouton('Confirmer l’acceptation')).toBeDefined();
    expect(conteneur.querySelectorAll('button')).toHaveLength(1);
    expect(texte()).toContain('Visite');
    expect(texte()).toContain('mar. 20 oct. · 9 h 30');
  });

  it('clic sur « Confirmer l’acceptation » → acceptée, un seul événement d’agenda', async () => {
    await ouvrir('accepter');
    await act(async () => { bouton('Confirmer l’acceptation')!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(posts).toEqual([{ jeton: 'JETON', decision: 'accepter' }]);
    expect(statut).toBe('acceptee');
    expect(evenementsAgenda).toBe(1);
    expect(texte()).toContain('Tâche acceptée');
    expect(texte()).toContain('La tâche est ajoutée à votre agenda.');
  });

  it('second clic plus tard (le lien rouvert) → « déjà enregistrée », rien n’est envoyé, toujours un seul événement', async () => {
    statut = 'acceptee'; evenementsAgenda = 1;
    await ouvrir('accepter');
    expect(posts).toEqual([]);
    expect(texte()).toContain('Tâche acceptée');
    expect(texte()).toContain('Votre réponse avait déjà été enregistrée');
    expect(evenementsAgenda).toBe(1);
  });
});

describe('page publique de réponse — « Refuser »', () => {
  it('ouverture seule → rien enregistré ; le motif est obligatoire ; puis « Tâche refusée »', async () => {
    await ouvrir('refuser');
    expect(posts).toEqual([]);
    await act(async () => { bouton('Confirmer le refus')!.click(); });
    expect(posts).toEqual([]);
    expect(texte()).toContain('Indiquez le motif du refus.');
    const zone = conteneur.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(zone, 'Déjà pris ce jour-là');
      zone.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { bouton('Confirmer le refus')!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(posts).toEqual([{ jeton: 'JETON', decision: 'refuser', motif: 'Déjà pris ce jour-là' }]);
    expect(texte()).toContain('Tâche refusée');
    expect(evenementsAgenda).toBe(0);
  });
});
