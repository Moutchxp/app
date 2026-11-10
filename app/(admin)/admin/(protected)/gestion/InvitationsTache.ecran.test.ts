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
/** Un aperçu propre à une épreuve (sinon `APERCU`). */
let APERCU_SUIVANT: Record<string, unknown> | null = null;
let reponseGeste: Record<string, unknown>;
let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  posts = [];
  APERCU_SUIVANT = null;
  reponseGeste = { etat: 'ok', id: 7, message: 'Tâche créée, en attente d’acceptation.', collaborateurs: [{ destinataire: 'Claire Test', etat: 'envoye', objet: 'Tâche à accepter — Visite — ven. 20 nov.' }],
    exterieurs: [{ nom: 'M. DUPONT Jean', email: 'jean@exemple.test', sorte: 'invitation', envoye: false, motif: 'Gmail indisponible', objet: 'Rendez-vous : Visite — 20/11/2026 à 10h00' }] };
  vi.stubGlobal('fetch', vi.fn(async (u: unknown, init?: { method?: string; body?: string }) => {
    const url = String(u);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') posts.push({ url, method, corps: JSON.parse(String(init?.body)) });
    if (url.includes('/taches/apercu')) return Response.json(APERCU_SUIVANT ?? APERCU);
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
    // 🔴 Arno (10/11/2026) — l'objet RÉEL rendu par le serveur (et « — » quand il n'en rend aucun).
    expect([...r.querySelectorAll('[data-objet]')].map((o) => o.textContent)).toEqual(['Tâche à accepter — Visite — ven. 20 nov.', 'Rendez-vous : Visite — 20/11/2026 à 10h00']);
    // 🔴 Une tâche n'a pas de « partenaires » : la phrase de la Location ne s'y écrit jamais (elle aurait été fausse).
    expect(r.textContent).not.toContain('partenaires');
  });
});

describe('🔴 les autres points d’entrée : décaler, renvoyer une invitation, annuler (même récapitulatif, même résultat)', () => {
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
  it('🔴 renvoyer l’invitation : le bouton EST là, le récapitulatif (Claire), « Confirmer », le PATCH, puis le résultat avec le VRAI objet', async () => {
    reponseGeste = { etat: 'ok', id: 9, message: 'Invitation renvoyée à Claire Test.',
      collaborateurs: [{ destinataire: 'Claire Test', etat: 'envoye', objet: 'Tâche à accepter — 7 av. — Visite — ven. 13 nov.' }], exterieurs: [] };
    await carte();
    // Plus de sortie silencieuse : sans le bouton, l'épreuve échoue.
    const renvoyer = container.querySelector('[data-invite="31"] [data-action="renvoyer-invitation"]');
    expect(renvoyer?.textContent).toBe('Renvoyer l’invitation');
    await clic(renvoyer);
    expect(posts[0]).toMatchObject({ url: '/api/admin/gestion/taches/apercu', corps: { geste: 'renvoyerInvitation', tacheId: 9, inviteId: 31 } });
    const f = document.querySelector('[data-fenetre-envois="recap"]');
    expect(f?.querySelector('[data-titre-recap-envois]')?.textContent).toBe('Récapitulatif — Invitation renvoyée');
    expect(posts.some((p) => p.method === 'PATCH')).toBe(false); // rien avant « Confirmer »
    await clic(document.querySelector('[data-confirmer-recap]'));
    expect(posts.at(-1)).toMatchObject({ url: '/api/admin/gestion/taches/9', method: 'PATCH', corps: { geste: 'renvoyerInvitation', inviteId: 31 } });
    const r = document.querySelector('[data-fenetre-envois="resultat"]')!;
    expect(r.querySelector('[data-titre-resultat-envois]')?.textContent).toBe('✓ Invitation renvoyée');
    expect([...r.querySelectorAll('[data-mail-parti]')].map((m) => [m.querySelector('[data-objet]')?.textContent, m.querySelector('[data-a]')?.textContent]))
      .toEqual([['Tâche à accepter — 7 av. — Visite — ven. 13 nov.', 'Claire Test']]);
  });
  it('🔴 annuler la tâche : le récapitulatif (« 1 mail d’annulation partira »), puis le résultat avec l’objet de l’annulation', async () => {
    APERCU_SUIVANT = { etat: 'ok', total: 1, collaborateurs: [], texteCollaborateur: null,
      exterieurs: [{ nom: 'M. DUPONT Jean', email: 'jean@exemple.test', sorte: 'annulation', mail: true, motif: null }],
      texteExterieur: 'Bonjour,\n\nLe rendez-vous ci-dessous est annulé.' };
    reponseGeste = { etat: 'ok', id: 9, message: 'Tâche annulée.', collaborateurs: [],
      exterieurs: [{ nom: 'M. DUPONT Jean', email: 'jean@exemple.test', sorte: 'annulation', envoye: true, motif: null, objet: 'Rendez-vous annulé : Visite — 13/11/2026 à 10h00' }] };
    await carte();
    await clic(container.querySelector('[data-action="annuler"]'));
    await clic(container.querySelector('[data-action="annuler-oui"]'));
    expect(posts[0]).toMatchObject({ url: '/api/admin/gestion/taches/apercu', corps: { geste: 'annuler', tacheId: 9 } });
    const f = document.querySelector('[data-fenetre-envois="recap"]')!;
    expect(f.querySelector('[data-total-envois]')?.textContent).toBe('1 mail d’annulation partira.');
    expect([...f.querySelectorAll('[data-recap-exterieurs] li')].map((l) => l.textContent)).toEqual(['M. DUPONT Jean <jean@exemple.test> — annulation']);
    await clic(document.querySelector('[data-confirmer-recap]'));
    expect(posts.at(-1)).toMatchObject({ url: '/api/admin/gestion/taches/9', method: 'PATCH', corps: { geste: 'annuler' } });
    const r = document.querySelector('[data-fenetre-envois="resultat"]')!;
    expect(r.querySelector('[data-mail-parti]')?.textContent).toContain('Annulation (contact extérieur)');
    expect(r.querySelector('[data-objet]')?.textContent).toBe('Rendez-vous annulé : Visite — 13/11/2026 à 10h00');
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

describe('🔴 la légende de confidentialité « 🔒 Coordonnées réservées à l’agence » — même composant, même texte partout', () => {
  const legende = (racine: ParentNode) => racine.querySelector('[data-legende-confidentialite]');
  const TEXTE = 'Les coordonnées des contacts ne sont communiquées qu’en interne, aux collaborateurs de l’agence concernés par cette tâche. Les contacts extérieurs (clients, locataires, propriétaires, tiers) ne reçoivent jamais les coordonnées des autres intervenants : seul le texte de la note leur est transmis.';
  it('① le formulaire : au-dessus du bloc « Texte de la tâche — bloc Contacts (généré) » (absente tant qu’aucun contact n’est choisi)', async () => {
    await creer();
    expect(container.querySelector('[data-bloc-contacts]')).toBeNull();
    expect(legende(container)).toBeNull();
    await clic(caseDe('DUPONT'));
    const l = legende(container)!;
    expect([l.querySelector('.lcf-titre')?.textContent, l.querySelector('.lcf-texte')?.textContent]).toEqual(['🔒 Coordonnées réservées à l’agence', TEXTE]);
    // AU-DESSUS du bloc généré, dans le même champ.
    const bloc = container.querySelector('[data-bloc-contacts]')!;
    expect(l.compareDocumentPosition(bloc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(l.parentElement).toBe(bloc.parentElement);
  });
  it('② le récapitulatif avant envoi : au-dessus des listes de destinataires', async () => {
    await creer();
    await clic(caseDe('DUPONT'));
    await clic(invitation('proprietaire:12'));
    await clic(bouton('Créer la tâche'));
    const f = document.querySelector('[data-fenetre-envois="recap"]')!;
    const l = legende(f)!;
    expect([l.querySelector('.lcf-titre')?.textContent, l.querySelector('.lcf-texte')?.textContent]).toEqual(['🔒 Coordonnées réservées à l’agence', TEXTE]);
    expect(l.compareDocumentPosition(f.querySelector('[data-recap-collaborateurs]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('③ la carte d’une tâche : dans la section « CONTACTS (n) », au-dessus des encadrés', async () => {
    const AUJ = jourParisDe(new Date());
    const tache: Tache = {
      id: 9, lotId: 10, lotCle: '315', adresseBien: '7 avenue de l’Union', evenement: null, objet: 'Visite', note: null, jour: ajouterJours(AUJ, 3), heure: '10:00', rappels: [],
      etat: 'a_faire', confieeA: 2, confieeALibelle: 'Claire Test', creeLe: '', creeParLibelle: '', majLe: '2026-11-01T08:00:00Z', faiteLe: null, faiteParLibelle: null,
      annuleeLe: null, annuleeParLibelle: null, nbContacts: 1, pieces: [], invites: [],
      contacts: [{ ...PROPRIO, copieLe: '2026-11-01T08:00:00Z' }],
    };
    await act(async () => { root.render(createElement('ul', null, createElement(LigneTache, { tache, maintenant: new Date(), deplie: true, onDetail: () => {}, onBasculer: () => {} }))); });
    await calmer();
    const section = container.querySelector('[data-ordre="contacts"]')!;
    expect(section.querySelector('.tch-carte-etiquette')?.textContent).toBe('Contacts (1)');
    const l = legende(section)!;
    expect([l.querySelector('.lcf-titre')?.textContent, l.querySelector('.lcf-texte')?.textContent]).toEqual(['🔒 Coordonnées réservées à l’agence', TEXTE]);
    expect(l.compareDocumentPosition(section.querySelector('[data-contact="proprietaire:12"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
