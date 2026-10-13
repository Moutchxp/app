// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoutonTache, RecapTachesDuBien } from './TachesDuBien';
import { MESSAGE_SESSION_EXPIREE, refusDuServeur, verifierSaisie } from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 CORRECTIF « CRÉER LA TÂCHE NE FAIT RIEN » — LE GARDE-FOU ════════════════════════════════════════════════
 *
 * Constat d'Arno (13/10, 20h07, lot-27) : clic sur « Créer la tâche », rien de visible, « Confiée à » encadré de rouge.
 * La règle qui en sort : « un refus, qu'il vienne du formulaire ou du serveur, affiche TOUJOURS un message clair en
 * français, à côté du champ concerné et en haut de la fenêtre. Jamais de clic sans effet visible. »
 *
 * On monte le VRAI bouton « + Tâche », sa VRAIE fenêtre et le récapitulatif, en mode strict comme le serveur de
 * développement, sur des routes simulées : la création confiée à « moi » réussit ET se voit ; chaque refus se voit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Reponse = () => Response | Promise<Response>;
let reponsePost: Reponse;
let posts: Record<string, unknown>[];
let taches: unknown[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  posts = [];
  taches = [];
  reponsePost = () => {
    taches = [{ id: 3, lotId: 27, lotCle: '26', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'Visite',
      note: null, jour: '2030-10-14', heure: null, rappels: [], etat: 'a_faire', confieeA: 2, confieeALibelle: 'Arnaud Jorel',
      creeLe: '', creeParLibelle: '', majLe: '', faiteLe: null, faiteParLibelle: null, annuleeLe: null,
      annuleeParLibelle: null, nbContacts: 0 }];
    return Response.json({ etat: 'ok', id: 3, message: 'Tâche créée.' });
  };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return reponsePost(); }
    if (url.includes('collaborateurs')) {
      return Response.json({ etat: 'ok', collaborateurs: [{ id: 2, libelle: 'Arnaud Jorel', accesGestion: true }], moi: 2 });
    }
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [] });
    if (url.includes('evenements')) return Response.json({ etat: 'ok', evenements: [] });
    return Response.json({ etat: 'ok', taches, moi: 2, tronque: false });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); }); };
const bouton = (mot: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(mot));
const taper = async (el: HTMLInputElement, v: string) => {
  const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => { poser?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

/** Ouvre la fenêtre depuis « + Tâche », écrit l'objet, clique « Créer la tâche ». */
const creer = async (objet = 'Visite') => {
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(Fragment, null,
      createElement(BoutonTache, { lotId: 27, lotCle: '26', adresse: '7 avenue de l’Union' }),
      createElement(RecapTachesDuBien, { lotId: 27 }))));
  });
  await calmer();
  await act(async () => { bouton('+ Tâche')?.click(); });
  await calmer();
  await taper(container.querySelector('.tchf input[type="text"]') as HTMLInputElement, objet);
  await act(async () => { bouton('Créer la tâche')?.click(); });
  await calmer();
};
const bandeau = () => container.querySelector('.tchf-alerte')?.textContent ?? null;
const sousLeChamp = (selecteur: string) =>
  container.querySelector(selecteur)?.closest('.tchf-champ')?.querySelector('.tchf-erreur')?.textContent ?? null;

describe('🔴 créer une tâche confiée à « moi » réussit, et ça se voit', () => {
  it('la fenêtre se ferme, une confirmation s’affiche, la tâche apparaît sur la fiche', async () => {
    await creer();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ lotId: 27, objet: 'Visite', confieeA: 2 });
    expect(container.querySelector('.tchf')).toBeNull();
    expect(container.querySelector('.tch-confirmation')?.textContent).toContain('Tâche créée : « Visite »');
    expect(container.querySelector('.tch-bloc-fiche')?.textContent).toContain('Visite');
  });
});

describe('🔴 chaque refus produit un message visible, en haut ET à côté du champ', () => {
  it('formulaire : objet vide ⇒ rien n’est envoyé, message en haut et sous « Objet »', async () => {
    await creer('   ');
    expect(posts).toHaveLength(0);
    expect(bandeau()).toBe('Indiquez l’objet de la tâche.');
    expect(sousLeChamp('.tchf input[type="text"]')).toBe('Indiquez l’objet de la tâche.');
    expect(container.querySelector('.tchf input[type="text"]')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('serveur : personne refusée ⇒ message en haut et sous « Confiée à », fenêtre ouverte', async () => {
    reponsePost = () => Response.json(
      { erreur: 'Cette personne n’a pas de compte actif avec une adresse de notre Workspace.', champ: 'confieeA' }, { status: 400 });
    await creer();
    expect(bandeau()).toContain('Workspace');
    expect(sousLeChamp('.tchf select')).toContain('Workspace');
    expect(container.querySelector('.tchf select')?.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('.tch-confirmation')).toBeNull();
  });

  it('🔴 session expirée (401 sans corps) ⇒ « Session expirée, reconnecte-toi », pas une fausse erreur de données', async () => {
    reponsePost = () => new Response(null, { status: 401 });
    await creer();
    expect(bandeau()).toBe(MESSAGE_SESSION_EXPIREE);
    expect(container.querySelector('.tchf-erreur')).toBeNull();
  });

  it('serveur injoignable ⇒ message visible', async () => {
    reponsePost = () => { throw new TypeError('réseau'); };
    await creer();
    expect(bandeau()).toContain('ne répond pas');
  });

  it('un 200 qui n’est pas la réponse attendue (page de connexion) n’est pas pris pour un succès', async () => {
    reponsePost = () => new Response('<html>connexion</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
    await creer();
    expect(container.querySelector('.tchf')).not.toBeNull();
    expect(bandeau()).toContain('rien ne confirme');
  });
});

describe('la règle des refus (pure)', () => {
  it('chaque refus de saisie désigne son champ', () => {
    const ok = { objet: 'x', jour: '2026-10-14', heure: null, note: null, confieeA: 2 };
    expect(verifierSaisie(ok)).toBeNull();
    expect(verifierSaisie({ ...ok, jour: '' })?.champ).toBe('jour');
    expect(verifierSaisie({ ...ok, heure: '9h' })?.champ).toBe('heure');
    expect(verifierSaisie({ ...ok, confieeA: null })?.champ).toBe('confieeA');
  });
  it('401 et compte révoqué ⇒ session expirée ; 403 ⇒ pas d’accès ; sinon le message du serveur', () => {
    expect(refusDuServeur(401, null).message).toBe(MESSAGE_SESSION_EXPIREE);
    expect(refusDuServeur(403, { erreur: 'ACCES_REVOQUE' }).message).toBe(MESSAGE_SESSION_EXPIREE);
    expect(refusDuServeur(403, { erreur: 'INTERDIT' }).message).toContain('accès Gestion');
    expect(refusDuServeur(400, { erreur: 'Indiquez une date valide.', champ: 'jour' })).toEqual({ message: 'Indiquez une date valide.', champ: 'jour' });
    expect(refusDuServeur(500, null).message).toContain('erreur 500');
  });
});
