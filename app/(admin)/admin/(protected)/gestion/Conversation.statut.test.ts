// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Conversation } from './Conversation';

/**
 * LOT 5-STATUT — LES CARTOUCHES, ÉPROUVÉS À L'ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE. Les trois boutons de classement ont quitté la barre pour le cartouche, à gauche de la
 * date de chaque message (décision d'Arno du 24/09/2026, seul retrait du lot). Trois défauts guettent :
 *   ① un geste qui n'appelle plus la même route qu'avant — le journal métier se met alors à mentir en silence ;
 *   ② un cartouche qui ne se met pas à jour après l'action — on reclasse deux fois, ou on croit avoir raté ;
 *   ③ un bouton DANS le bouton de la ligne repliée : invalide en HTML, injouable au clavier, et le pire est qu'il
 *      « marche » à la souris — c'est le piège déjà rencontré au lot 4d et corrigé par un VOISIN positionné.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MESSAGE = (o: Record<string, unknown> = {}) => ({
  messageId: 900, de: 'martin@orange.fr', deNom: 'Mme Martin', sens: 'recu', recuLe: '2026-09-20T12:00:00Z',
  objet: 'Fuite', corps: 'Bonjour.', extrait: 'Bonjour.', automatique: false, pieces: [],
  horsFile: false, motifHorsFile: null, destA: null, destCc: null, destinatairesFondus: 'gestion@criterimmo.fr',
  htmlSeul: false, ...o,
});
const FIL = (o: Record<string, unknown> = {}) => ({
  filId: 101, objet: 'Fuite salle de bain', etat: 'a_classer', reference: null, evenementId: null,
  evenementObjet: null, ...o,
});

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];
let filCourant: Record<string, unknown>;
let messages: Record<string, unknown>[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  filCourant = FIL();
  messages = [MESSAGE()];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    appels.push({ url: u, methode });
    if (u.includes('/sans-suite')) {
      filCourant = methode === 'POST' ? FIL({ etat: 'sans_suite' }) : FIL();
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }
    if (u.includes('/affectation') && methode === 'GET') {
      return { ok: true, json: async () => ({ propositions: { objet: 'Fuite salle de bain', demandeurNom: null, demandeurEmail: null, adresseLibre: null } }) } as unknown as Response;
    }
    if (u.includes('/messages')) return { ok: true, json: async () => ({ fil: filCourant, messages, partis: [] }) } as unknown as Response;
    return { ok: true, json: async () => ({ evenements: [], max: 30 }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const classements: string[] = [];
const monter = async (props: Record<string, unknown> = {}) => {
  classements.length = 0;
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 101, maintenant: new Date('2026-09-24T12:00:00Z'), onGeste: () => {}, barreActions: true,
      onClassement: (v: string) => classements.push(v), ...props,
    } as never));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (motif: RegExp) => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: Element | null | undefined) => { await act(async () => { (b as HTMLElement | undefined)?.click(); }); await calmer(); };
const cartouche = () => container.querySelector('.cnv-cartouche') as HTMLElement | null;
const declencheur = () => container.querySelector('.cnv-statut-bouton') as HTMLElement | null;

describe('LES CINQ CARTOUCHES — le mot est écrit, jamais la couleur seule', () => {
  it('b) échange pas encore classé → « À classer » + bouton « Classer »', async () => {
    await monter();
    expect(cartouche()?.textContent).toBe('À classer');
    expect(cartouche()?.className).toContain('cnv-cartouche--attente');
    expect(declencheur()?.textContent).toBe('Classer');
  });

  it('a) échange classé → cartouche VERT « GES-… · titre », CLIQUABLE vers la carte, + « Modifier »', async () => {
    filCourant = FIL({ reference: 'GES-2026-000012', evenementId: 12, evenementObjet: 'Fuite salle de bain' });
    await monter();
    const c = cartouche() as HTMLAnchorElement;
    expect(c.textContent).toBe('GES-2026-000012 · Fuite salle de bain');
    expect(c.className).toContain('cnv-cartouche--succes');
    expect(c.tagName).toBe('A');
    expect(c.getAttribute('href')).toBe('/admin/gestion?ecran=boite&etiquette=carte-12');
    expect(declencheur()?.textContent).toBe('Modifier');
  });

  it('c) échange classé sans suite → cartouche « Sans suite » + « Modifier »', async () => {
    filCourant = FIL({ etat: 'sans_suite' });
    await monter();
    expect(cartouche()?.textContent).toBe('Sans suite');
    expect(cartouche()?.className).toContain('cnv-cartouche--neutre');
    expect(declencheur()?.textContent).toBe('Modifier');
  });

  it('e) message hors file → cartouche informatif « Courrier automatique », SANS bouton', async () => {
    messages = [MESSAGE({ horsFile: true, motifHorsFile: 'envoi produit par un logiciel' })];
    await monter();
    expect(cartouche()?.textContent).toBe('Courrier automatique');
    expect(declencheur()).toBeNull();
    // Le motif reste consultable, et la mention d'origine n'a pas bougé de la ligne repliée.
    expect(cartouche()?.getAttribute('title')).toContain('logiciel');
  });

  it('🔴 ③ le cartouche est un VOISIN de la ligne repliée, jamais son enfant (bouton dans bouton)', async () => {
    await monter();
    const ligne = container.querySelector('.cnv-ligne') as HTMLElement;
    expect(ligne.querySelector('.cnv-statut')).toBeNull();
    expect(ligne.querySelector('button')).toBeNull();
    // …et il se trouve bien dans le coin, à gauche de la date.
    const coin = container.querySelector('.cnv-coin') as HTMLElement;
    const html = coin.innerHTML;
    expect(html.indexOf('cnv-cartouche')).toBeLessThan(html.indexOf('cnv-quand'));
  });
});

describe('LA RÉVÉLATION DES GESTES, et son annulation', () => {
  it('« Classer » révèle les trois gestes + « Annuler », et « Annuler » les referme', async () => {
    await monter();
    expect(container.querySelector('.cnv-statut-actions')).toBeNull();
    await cliquer(declencheur());
    expect(boutonPar(/^Classer dans une carte$/)).toBeDefined();
    expect(boutonPar(/^Créer un événement$/)).toBeDefined();
    expect(boutonPar(/^Classer sans suite$/)).toBeDefined();
    await cliquer(boutonPar(/^Annuler$/));
    expect(container.querySelector('.cnv-statut-actions')).toBeNull();
  });

  it('classé → « Modifier » révèle « Changer l’affectation », « Créer un événement », « Classer sans suite »', async () => {
    filCourant = FIL({ reference: 'GES-2026-000012', evenementId: 12, evenementObjet: 'Fuite' });
    await monter();
    await cliquer(declencheur());
    expect(boutonPar(/^Changer l’affectation$/)).toBeDefined();
    expect(boutonPar(/^Créer un événement$/)).toBeDefined();
    expect(boutonPar(/^Classer sans suite$/)).toBeDefined();
  });

  it('sans suite → « Modifier » révèle « Rouvrir », « Classer dans une carte », « Créer un événement »', async () => {
    filCourant = FIL({ etat: 'sans_suite' });
    await monter();
    await cliquer(declencheur());
    expect(boutonPar(/^Rouvrir$/)).toBeDefined();
    expect(boutonPar(/^Classer dans une carte$/)).toBeDefined();
    expect(boutonPar(/^Créer un événement$/)).toBeDefined();
  });
});

describe('🔴 ① LES MÊMES ROUTES QU’AVANT, et ② le cartouche qui se met à jour', () => {
  it('« Classer dans une carte » et « Changer l’affectation » ouvrent le partage sur la RECHERCHE', async () => {
    await monter();
    await cliquer(declencheur());
    await cliquer(boutonPar(/^Classer dans une carte$/));
    expect(classements).toEqual(['existant']);
  });

  it('« Créer un événement » ouvre le partage sur le FORMULAIRE', async () => {
    await monter();
    await cliquer(declencheur());
    await cliquer(boutonPar(/^Créer un événement$/));
    expect(classements).toEqual(['nouveau']);
  });

  it('🔴 « Classer sans suite » appelle POST /sans-suite, et le cartouche devient « Sans suite »', async () => {
    await monter();
    await cliquer(declencheur());
    await cliquer(boutonPar(/^Classer sans suite$/));
    expect(appels).toContainEqual({ url: '/api/admin/gestion/fils/101/sans-suite', methode: 'POST' });
    expect(cartouche()?.textContent).toBe('Sans suite');
  });

  it('🔴 « Rouvrir » appelle DELETE /sans-suite, et le cartouche redevient « À classer »', async () => {
    filCourant = FIL({ etat: 'sans_suite' });
    await monter();
    await cliquer(declencheur());
    await cliquer(boutonPar(/^Rouvrir$/));
    expect(appels).toContainEqual({ url: '/api/admin/gestion/fils/101/sans-suite', methode: 'DELETE' });
    expect(cartouche()?.textContent).toBe('À classer');
  });

  it('sans écran parent, « Classer » retombe sur le panneau EN PLACE — le comportement d’avant', async () => {
    await monter({ onClassement: undefined });
    await cliquer(declencheur());
    await cliquer(boutonPar(/^Classer dans une carte$/));
    expect(container.querySelector('.gst-panneau')).not.toBeNull();
  });
});

describe('CE QUI NE BOUGE PAS', () => {
  it('le menu « ⋯ » de l’échange garde toutes ses entrées, « Détacher » comprise', async () => {
    filCourant = FIL({ reference: 'GES-2026-000012', evenementId: 12, evenementObjet: 'Fuite' });
    await monter();
    await cliquer(container.querySelector('.cnv-bandeau .gst-menu-bouton'));
    const entrees = [...container.querySelectorAll('.gst-menu-entree')].map((e) => e.textContent);
    expect(entrees).toContain('Détacher l’échange');
    expect(entrees).toContain('Classer sans suite');
  });

  it('le menu « ⋯ » du MESSAGE garde « Déplacer ce mail » et « Détacher ce mail »', async () => {
    await monter({ onClassement: undefined });
    const menus = [...container.querySelectorAll('.cnv-coin .gst-menu-bouton')];
    expect(menus.length).toBe(1);
    await cliquer(menus[0]);
    const entrees = [...container.querySelectorAll('.gst-menu-entree')].map((e) => e.textContent);
    expect(entrees).toContain('Déplacer ce mail vers un autre événement…');
    expect(entrees).toContain('Détacher ce mail');
  });

  it('la date, l’expéditeur et l’extrait sont toujours là, au même endroit', async () => {
    await monter();
    expect(container.querySelector('.cnv-qui')?.textContent).toContain('Mme Martin');
    expect(container.querySelector('.cnv-quand')).not.toBeNull();
    expect(container.textContent).toContain('Fuite salle de bain'); // le titre de l'échange, dans la barre
  });

  it('🔴 AUCUN bouton d’envoi dans ce lot non plus', async () => {
    await monter();
    for (const mot of [/Répondre/, /Transférer/]) expect(boutonPar(mot)).toBeUndefined();
  });
});
