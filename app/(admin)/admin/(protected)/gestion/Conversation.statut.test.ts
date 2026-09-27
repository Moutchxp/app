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
/** LOT BARRE-STATUT — ce que les deux lectures de rattachements répondent. Pilotées par le test. */
let liensParMessage: Record<string, unknown[]>;
let rattachementsDuFil: Record<string, unknown>;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  filCourant = FIL();
  messages = [MESSAGE()];
  liensParMessage = {};
  rattachementsDuFil = { etat: 'ok', data: [] };
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
    // LOT BARRE-STATUT — les rattachements du mail (bandeau) puis ceux de l'échange (fenêtre).
    if (u.includes('/rattachements?fil=')) return { ok: true, json: async () => rattachementsDuFil } as unknown as Response;
    if (u.includes('/rattachements')) return { ok: true, json: async () => ({ etat: 'ok', data: liensParMessage }) } as unknown as Response;
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
    expect(c.getAttribute('href')).toBe(/* LOT ERGO-BOITE — la boîte est l'écran par défaut : `ecran=boite` ne s'écrit plus. */ '/admin/gestion?etiquette=carte-12');
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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT BARRE-STATUT — LE LIEN DE L'EN-TÊTE SUIT LA MÊME RÈGLE QUE LA BARRE D'UNE LIGNE (demande d'Arno).
 *
 * ⚠️ CE QU'IL NE FAUT SURTOUT PAS CONFONDRE, et que ce bloc verrouille : le CARTOUCHE dit si l'échange est posé sur
 * une CARTE (un événement) ; le nouveau bouton répond à l'autre question — est-il rattaché à un LOGEMENT ou à un
 * PROPRIÉTAIRE ? Mesuré le 27/09/2026 : 474 échanges sans événement, 9 631 sans rattachement. Le MOT du cartouche
 * ne doit donc PAS changer ; seul son bouton le fait.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT BARRE-STATUT — « Visualiser / Modifier » dans l’en-tête d’un message', () => {
  const lien = (o: Record<string, unknown> = {}) => ({
    id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: 'lot-513', id: 513 },
    libelle: 'Lot 513 — 12 rue des Lilas', origine: 'automatique', statut: 'confirme', confiance: null,
    regle: 'adresse', motif: null, adresses: [], parUnHumain: false,
    creeLe: null, creePar: null, statutLe: null, statutPar: null, ...o,
  });

  it('rattachement CONFIRMÉ : le lien devient « Visualiser / Modifier », en vert', async () => {
    liensParMessage = { '900': [lien()] };
    await monter();
    expect(declencheur()?.textContent).toBe('Visualiser / Modifier');
    expect(declencheur()?.className).toContain('cnv-statut-bouton--vert');
  });

  /** 🔴 LE MOT DU CARTOUCHE NE BOUGE PAS : il répond à l'autre question, celle de la carte. */
  it('🔴 le cartouche, lui, dit toujours « À classer » — c’est l’autre question', async () => {
    liensParMessage = { '900': [lien()] };
    await monter();
    expect(cartouche()?.textContent).toBe('À classer');
  });

  it('une PROPOSITION ne suffit pas : le lien reste « Classer »', async () => {
    liensParMessage = { '900': [lien({ statut: 'propose' })] };
    await monter();
    expect(declencheur()?.textContent).toBe('Classer');
  });

  /** Un rattachement vers un ÉVÉNEMENT n'est pas la question posée ici : c'est celle du cartouche. */
  it('un rattachement vers un ÉVÉNEMENT ne rend pas le lien vert', async () => {
    liensParMessage = { '900': [lien({ cible: { sorte: 'evenement', cle: 'ev-3', id: 3 } })] };
    await monter();
    expect(declencheur()?.textContent).toBe('Classer');
  });

  it('aucun rattachement : le lien d’avant, inchangé', async () => {
    await monter();
    expect(declencheur()?.textContent).toBe('Classer');
    expect(declencheur()?.className).not.toContain('--vert');
  });

  it('🔴 le clic ouvre la FENÊTRE des rattachements, pas le menu de classement', async () => {
    liensParMessage = { '900': [lien()] };
    rattachementsDuFil = { etat: 'ok', data: [lien()] };
    await monter();
    await cliquer(declencheur());
    expect(container.querySelector('#rdf-titre')?.textContent).toBe('Rattachements de l’échange');
    expect(container.querySelector('.rdf-item')?.textContent).toContain('Lot 513 — 12 rue des Lilas');
    // …et surtout PAS le panneau de classement, qui répond à l'autre question.
    expect(classements).toEqual([]);
  });
});

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT AVIS-LISIBLE — OUVRIR UN AVIS DE NON-REMISE DONNE SA PHRASE, EN ROUGE ET EN ENTIER (demande d'Arno).
 *
 * L'extraction elle-même est éprouvée dans le module PUR (`nonRemise.test.ts`) ; ici on vérifie ce que l'ÉCRAN en
 * fait : le bandeau rouge est rendu, la partie technique reste affichée dessous, et un mail ORDINAIRE n'en reçoit
 * évidemment aucun.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT AVIS-LISIBLE — l’avis de non-remise, ouvert', () => {
  /** Le corps exact du message 57056 (fil 35848), raccourci de sa fin de rapport. */
  const CORPS_AVIS = [
    '** Boîte de réception du destinataire pleine **',
    '',
    "Votre message n'a pas pu être distribué à rishikadsingh@gmail.com. Sa boîte de réception est pleine ou elle reçoit un trop grand nombre de messages actuellement.",
    '',
    'Cliquez ici pour en savoir plus : https://support.google.com/mail/?p=OverQuotaTemp',
    '',
    'Reporting-MTA: dns; googlemail.com',
    'Final-Recipient: rfc822; rishikadsingh@gmail.com',
    'Action: failed',
  ].join('\n');
  const avis = () => container.querySelector('.cnv-avis') as HTMLElement | null;

  const monterAvis = async (corps: string) => {
    messages = [MESSAGE({
      messageId: 900, de: 'mailer-daemon@googlemail.com', deNom: 'Mail Delivery Subsystem',
      objet: 'Delivery Status Notification (Failure)', corps, extrait: corps.slice(0, 80),
    })];
    await monter();
  };

  it('🔴 la phrase de l’avis est rendue EN ENTIER, dans son bandeau rouge', async () => {
    await monterAvis(CORPS_AVIS);
    expect(avis()).not.toBeNull();
    expect(avis()?.textContent).toContain('Boîte de réception du destinataire pleine');
    expect(avis()?.textContent).toContain("Sa boîte de réception est pleine ou elle reçoit un trop grand nombre de messages actuellement.");
  });

  it('la partie technique n’est PAS dans le rouge — mais elle reste affichée dessous', async () => {
    await monterAvis(CORPS_AVIS);
    expect(avis()?.textContent).not.toContain('Reporting-MTA');
    expect(avis()?.textContent).not.toContain('Cliquez ici');
    const corps = container.querySelector('.gst-msg-corps:not(.cnv-avis)');
    expect(corps?.textContent).toContain('Reporting-MTA: dns; googlemail.com');
    expect(corps?.textContent).toContain('Final-Recipient: rfc822; rishikadsingh@gmail.com');
  });

  /** 🔴 RIEN N'EST DIT DEUX FOIS : la phrase du bandeau ne doit pas réapparaître en noir juste en dessous. */
  it('🔴 la phrase n’est PAS répétée sous le bandeau', async () => {
    await monterAvis(CORPS_AVIS);
    const corps = container.querySelector('.gst-msg-corps:not(.cnv-avis)');
    expect(corps?.textContent).not.toContain('Sa boîte de réception est pleine');
  });

  /** Le repli demandé : rien d'isolable ⇒ le motif déjà extrait pour la ligne de liste, en rouge quand même. */
  it('avis illisible : le MOTIF de la ligne de liste passe en rouge, jamais un bandeau vide', async () => {
    await monterAvis([
      'Reporting-MTA: dns; googlemail.com',
      'Final-Recipient: rfc822; jean@exemple.fr',
      'Action: failed',
      'Status: 5.1.1',
    ].join('\n'));
    expect(avis()?.textContent).toContain('cette adresse n’existe pas chez le destinataire');
  });

  it('un mail ORDINAIRE n’a aucun bandeau rouge', async () => {
    messages = [MESSAGE()];
    await monter();
    expect(avis()).toBeNull();
  });

  /** ⚠️ Une RÉPONSE à un avis n'est pas un avis : `estAvisNonRemise` l'écarte, et l'écran doit suivre. */
  it('une RÉPONSE humaine à un avis n’est pas traitée comme un avis', async () => {
    messages = [MESSAGE({
      de: 'martin@orange.fr', objet: 'Re: Delivery Status Notification (Failure)',
      corps: 'Bonjour, j’ai bien vu que le message n’était pas passé. Je vous rappelle demain.',
    })];
    await monter();
    expect(avis()).toBeNull();
  });
});
