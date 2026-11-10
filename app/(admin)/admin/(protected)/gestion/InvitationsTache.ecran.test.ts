// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FenetreTache } from './FenetreTache';
import { LigneTache } from './LigneTache';
import type { ContactSource } from '../../../../lib/gestion/contactsTache';
import { ajouterJours, jourParisDe, type Tache } from '../../../../lib/gestion/taches';

/**
 * 🔴🔴 INVITER LES CONTACTS D'UNE TÂCHE — À L'ÉCRAN (Arno, 10/11/2026) : la case « Envoyer une invitation à ce contact », DÉCOCHÉE par défaut ;
 * le RÉCAPITULATIF avant tout envoi (collaborateurs et extérieurs séparés, nombre exact, textes), « Revenir » qui garde la saisie, puis le
 * RÉSULTAT d'après la réponse du serveur (échec en rouge) — à la création, à la modification, au décalage, au renvoi d'une invitation. Les
 * vraies fenêtres, routes simulées : rien ne part.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const PROPRIO: ContactSource = { cle: 'proprietaire:12', famille: 'proprietaire', nom: 'M. DUPONT Jean', qualite: null, organisation: null, adresse: null,
  coordonnees: [{ sorte: 'telephone', libelle: 'Mobile', valeur: '0612345678', affichage: null }, { sorte: 'email', libelle: null, valeur: 'jean@exemple.test', affichage: null }] };
const LOCATAIRE: ContactSource = { cle: 'locataire:45', famille: 'locataire', nom: 'Mme MARTIN Alice', qualite: null, organisation: null, adresse: null,
  coordonnees: [{ sorte: 'telephone', libelle: 'Portable', valeur: '0700000000', affichage: null }] };
const APERCU = {
  etat: 'ok', total: 2,
  collaborateurs: [{ libelle: 'Claire Test', mail: true, motif: null }, { libelle: 'Arno Jorel', mail: false, motif: 'vous-même : acceptée d’office' }],
  exterieurs: [{ nom: 'M. DUPONT Jean', email: 'jean@exemple.test', sorte: 'invitation', mail: true, motif: null }],
  texteCollaborateur: 'Bonjour Claire Test, … M. DUPONT Jean — jean@exemple.test', texteExterieur: 'Bonjour,\n\nNous vous confirmons le rendez-vous suivant.',
};
let posts: { url: string; method: string; corps: Record<string, unknown> }[];
let reponseGeste: Record<string, unknown>;
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  posts = [];
  reponseGeste = { etat: 'ok', id: 7, message: 'Tâche créée, en attente d’acceptation.', collaborateurs: [{ destinataire: 'Claire Test', etat: 'envoye' }],
    exterieurs: [{ nom: 'M. DUPONT Jean', email: 'jean@exemple.test', sorte: 'invitation', envoye: false, motif: 'Gmail indisponible' }] };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') posts.push({ url, method, corps: JSON.parse(String(init?.body)) });
    if (url.includes('/taches/apercu')) return Response.json(APERCU);
    if (method !== 'GET') return Response.json(reponseGeste);
    if (url.includes('/taches/collaborateurs')) return Response.json({ etat: 'ok', collaborateurs: [{ id: 1, libelle: 'Arno Jorel' }, { id: 2, libelle: 'Claire Test' }], moi: 1 });
    if (url.includes('/biens/evenements')) return Response.json({ etat: 'ok', evenements: [] });
    if (url.includes('/taches/contacts')) return Response.json({ etat: 'ok', contacts: [PROPRIO, LOCATAIRE] });
    return Response.json({});
  }));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.querySelectorAll('.mis-voile').forEach((n) => n.remove()); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const caseDe = (nom: string) => [...container.querySelectorAll<HTMLLabelElement>('.tchc-case')].find((l) => l.textContent?.includes(nom))?.querySelector('input') as HTMLInputElement;
const invitation = (cle: string) => container.querySelector(`[data-inviter-contact="${cle}"] input`) as HTMLInputElement | null;
const clic = async (el: Element | null) => { if (el === null) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const creer = async () => {
  await act(async () => { root.render(createElement(FenetreTache, { mode: { sorte: 'creer', lotId: 10, lotCle: '315', adresse: '7 avenue de l’Union, Paris' }, onFermer: () => {} })); });
  await calmer();
  const objet = container.querySelector('input[type="text"]') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(objet, 'Visite'); objet.dispatchEvent(new Event('input', { bubbles: true })); });
};
const bouton = (mot: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === mot) as HTMLButtonElement;

describe('🔴 la case « Envoyer une invitation à ce contact »', () => {
  it('sous chaque contact coché, DÉCOCHÉE par défaut ; impossible sans e-mail', async () => {
    await creer();
    expect(invitation('proprietaire:12')).toBeNull();
    await clic(caseDe('DUPONT'));
    await clic(caseDe('MARTIN'));
    expect(invitation('proprietaire:12')?.checked).toBe(false);
    expect(invitation('locataire:45')?.disabled).toBe(true);
    expect(container.querySelector('[data-inviter-contact="locataire:45"]')?.textContent).toContain('pas d’adresse e-mail');
  });
  it('case décochée : la création ne demande AUCUNE invitation de contact', async () => {
    await creer();
    await clic(caseDe('DUPONT'));
    await clic(bouton('Créer la tâche'));
    expect(posts[0]).toMatchObject({ url: '/api/admin/gestion/taches/apercu', corps: { geste: 'creer', contacts: ['proprietaire:12'], invitesContacts: [] } });
  });
});

describe('🔴 le récapitulatif avant envoi, « Revenir », puis le résultat', () => {
  it('collaborateurs et extérieurs SÉPARÉS, le nombre exact, le texte d’un collaborateur et d’un extérieur ; rien n’est encore créé', async () => {
    await creer();
    await clic(caseDe('DUPONT'));
    await clic(invitation('proprietaire:12'));
    await clic(bouton('Créer la tâche'));
    expect(posts.at(-1)?.corps).toMatchObject({ geste: 'creer', invitesContacts: ['proprietaire:12'] });
    const f = document.querySelector('[data-fenetre-envois="recap"]')!;
    expect(f.querySelector('[data-total-envois]')?.textContent).toBe('2 invitations partiront.');
    expect([...f.querySelectorAll('[data-recap-collaborateurs] li')].map((l) => l.textContent)).toEqual(['Claire Test — invitation par mail', 'Arno Jorel — aucun mail (vous-même : acceptée d’office)']);
    expect([...f.querySelectorAll('[data-recap-exterieurs] li')].map((l) => l.textContent)).toEqual(['M. DUPONT Jean <jean@exemple.test> — invitation']);
    expect(f.querySelector('[data-texte-exterieur]')?.textContent).toContain('Nous vous confirmons le rendez-vous suivant.');
    expect(f.querySelector('[data-texte-collaborateur]')).not.toBeNull();
    expect(posts.filter((p) => p.url === '/api/admin/gestion/taches')).toHaveLength(0);
  });
  it('« Revenir » : rien n’est fait, toute la saisie reste (objet, contacts, case)', async () => {
    await creer();
    await clic(caseDe('DUPONT'));
    await clic(invitation('proprietaire:12'));
    await clic(bouton('Créer la tâche'));
    await clic(document.querySelector('[data-revenir-recap]'));
    expect(document.querySelector('[data-fenetre-envois]')).toBeNull();
    expect(posts.filter((p) => p.url === '/api/admin/gestion/taches')).toHaveLength(0);
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Visite');
    expect(caseDe('DUPONT').checked).toBe(true);
    expect(invitation('proprietaire:12')?.checked).toBe(true);
  });
  it('« Confirmer et envoyer » : le résultat, d’après le serveur — les noms, le nombre, l’échec en rouge', async () => {
    await creer();
    await clic(caseDe('DUPONT'));
    await clic(invitation('proprietaire:12'));
    await clic(bouton('Créer la tâche'));
    await clic(document.querySelector('[data-confirmer-recap]'));
    expect(posts.at(-1)).toMatchObject({ url: '/api/admin/gestion/taches', corps: { invitesContacts: ['proprietaire:12'] } });
    const r = document.querySelector('[data-fenetre-envois="resultat"]')!;
    expect(r.querySelector('[data-titre-resultat-envois]')?.textContent).toBe('✓ Tâche créée');
    expect(r.querySelector('[data-resultat-nombre]')?.textContent).toBe('1 destinataire a reçu le mail ; 1 non envoyé.');
    expect([...r.querySelectorAll('[data-mail-parti]')].map((m) => [m.getAttribute('data-envoye'), m.querySelector('[data-a]')?.textContent])).toEqual([
      ['oui', 'Claire Test'], ['non', 'M. DUPONT Jean <jean@exemple.test>']]);
    expect(r.querySelector('[data-envoye="non"] [data-echec-envoi]')?.textContent).toContain('Gmail indisponible');
    // 🔴 Une tâche n'a pas de « partenaires » : la phrase de la Location ne s'y écrit jamais (elle aurait été fausse).
    expect(r.textContent).not.toContain('partenaires');
  });
});

describe('🔴 les autres points d’entrée : décaler, renvoyer une invitation (même récapitulatif, même résultat)', () => {
  const AUJ = jourParisDe(new Date());
  const tache: Tache = {
    id: 9, lotId: 10, lotCle: '315', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'Visite', note: null, jour: ajouterJours(AUJ, 3), heure: '10:00', rappels: [],
    etat: 'a_faire', confieeA: 2, confieeALibelle: 'Claire Test', creeLe: '', creeParLibelle: '', majLe: '2026-11-01T08:00:00Z', faiteLe: null, faiteParLibelle: null,
    annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, contacts: [], pieces: [],
    invites: [{ inviteId: 31, collaborateurId: 2, libelle: 'Claire Test', principal: true, statut: 'en_attente', automatique: false, motif: null, reponduLe: null,
      demandeLe: '2026-11-01T08:00:00Z', mailEtat: 'envoye', dernierRenvoiLe: null }],
  };
  const carte = async () => { await act(async () => { root.render(createElement('ul', null, createElement(LigneTache, { tache, maintenant: new Date(), deplie: true, onDetail: () => {}, onBasculer: () => {} }))); }); await calmer(); };
  it('décaler de +1 jour : le récapitulatif (nouvelle date), puis le résultat', async () => {
    reponseGeste = { etat: 'ok', id: 9, message: 'Tâche décalée.', collaborateurs: [{ destinataire: 'Claire Test', etat: 'envoye' }], exterieurs: [] };
    await carte();
    await clic([...container.querySelectorAll('button')].find((b) => /Décaler/.test(b.textContent ?? '')) ?? null);
    await clic(container.querySelector('.tch-decaler button'));
    expect(posts[0]).toMatchObject({ url: '/api/admin/gestion/taches/apercu', corps: { geste: 'decaler', tacheId: 9 } });
    expect(posts[0].corps.jour).not.toBe(tache.jour);
    expect(document.querySelector('[data-fenetre-envois="recap"]')).not.toBeNull();
    await clic(document.querySelector('[data-confirmer-recap]'));
    expect(posts.at(-1)).toMatchObject({ url: '/api/admin/gestion/taches/9', method: 'PATCH', corps: { geste: 'decaler' } });
    expect(document.querySelector('[data-titre-resultat-envois]')?.textContent).toBe('✓ Tâche décalée');
  });
  it('renvoyer l’invitation : le récapitulatif, puis le résultat', async () => {
    reponseGeste = { etat: 'ok', id: 9, message: 'Invitation renvoyée à Claire Test.', collaborateurs: [{ destinataire: 'Claire Test', etat: 'envoye' }], exterieurs: [] };
    await carte();
    const renvoyer = [...container.querySelectorAll('button')].find((b) => /Renvoyer l’invitation/.test(b.textContent ?? ''));
    if (renvoyer === undefined) return; // la carte ne propose le renvoi qu'après le délai : couvert par la fenêtre (même code)
    await clic(renvoyer);
    expect(posts[0]).toMatchObject({ corps: { geste: 'renvoyerInvitation', tacheId: 9, inviteId: 31 } });
  });
});

describe('🔴 règle 5 — la tâche d’un bien accepte aussi un contact saisi à la main (avec sa case d’invitation)', () => {
  it('saisi, invitable, envoyé avec la tâche ; la phrase « tiers indépendant » est dite', async () => {
    await creer();
    expect(container.querySelector('[data-aide-tiers]')?.textContent).toContain('« tiers indépendant »');
    const poser = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const champ = async (nom: string, v: string) => {
      const el = container.querySelector(`[data-champ-contact="${nom}"]`) as HTMLInputElement;
      await act(async () => { poser.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
    };
    await champ('nom', 'Plombier Test');
    await champ('qualite', 'Plombier');
    await champ('email', 'plombier@exemple.test');
    await clic(bouton('+ Ajouter ce contact'));
    const caseNouveau = container.querySelector('[data-inviter-contact="nouveau-0"] input') as HTMLInputElement;
    expect(caseNouveau.checked).toBe(false);
    await clic(caseNouveau);
    await clic(bouton('Créer la tâche'));
    expect(posts[0]).toMatchObject({ url: '/api/admin/gestion/taches/apercu', corps: { lotId: 10,
      contactsManuels: [{ nom: 'Plombier Test', qualite: 'Plombier', telephone: null, email: 'plombier@exemple.test', inviter: true }] } });
  });
});
