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
/**
 * LOT BARRE-STATUT — ce que les deux lectures de rattachements répondent. Pilotées par le test.
 * LOT FICHE-RATTACHEMENT — une TROISIÈME lecture s'y ajoute : `?fiche=`, qui rend les BIENS de l'échange.
 */
let liensParMessage: Record<string, unknown[]>;
let rattachementsDuFil: Record<string, unknown>;
let ficheDuFil: Record<string, unknown>;
/**
 * 🔴 LOT STATUT-HORS-GESTION — ce que la route des marques répond. `null` = migration 266 absente (`sans_schema`),
 * et l'écran doit alors griser l'option au lieu de la proposer.
 */
let marquesHorsGestion: Record<string, { motif: string | null }> | null;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  filCourant = FIL();
  messages = [MESSAGE()];
  liensParMessage = {};
  rattachementsDuFil = { etat: 'ok', data: [] };
  ficheDuFil = {
    etat: 'ok',
    data: {
      filId: 5, objet: 'Fuite', nbMailsDuFil: 1, biens: [], horsGestion: false, messageRecentId: 900,
      disponible: true,
    },
  };
  marquesHorsGestion = {};
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
    // LOT STATUT-HORS-GESTION — les marques « ce mail ne concerne aucun bien ». AVANT `/rattachements` : les deux
    //   adresses se ressemblent, et l'ordre des tests décide ici laquelle répond.
    if (u.includes('/hors-gestion')) {
      return {
        ok: true,
        json: async () => (marquesHorsGestion === null
          ? { etat: 'sans_schema', data: {} }
          : { etat: 'ok', data: marquesHorsGestion }),
      } as unknown as Response;
    }
    // LOT BARRE-STATUT — les rattachements du mail (bandeau) puis ceux de l'échange (fenêtre).
    // ⚠️ `?fiche=` AVANT `?fil=` : les deux vivent dans la même route, et la seconde condition attraperait tout.
    if (u.includes('/rattachements?fiche=')) return { ok: true, json: async () => ficheDuFil } as unknown as Response;
    if (u.includes('/drive/dossier-du-bien')) return { ok: true, json: async () => ({ etat: 'ok', dossiers: [] }) } as unknown as Response;
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
  it('b) échange sans événement → « Événement : aucun » + bouton « Classer »', async () => {
    await monter();
    expect(cartouche()?.textContent).toBe('Événement : aucun');
    /**
     * 🔴 LOT STATUT-PAR-MAIL — CE CARTOUCHE EST DÉSORMAIS NEUTRE, PLUS « EN ATTENTE ». « Attente » est le ton d'un
     * travail à faire ; or l'immense majorité des mails n'a pas d'événement et n'en aura jamais. C'est la CAPSULE
     * du bien qui porte le « à faire », et elle seule — sans quoi l'écran réclame une action qui n'existe pas.
     */
    expect(cartouche()?.className).toContain('cnv-cartouche--neutre');
    expect(declencheur()?.textContent).toBe('Classer');
  });

  it('a) échange classé → cartouche VERT « GES-… · titre », CLIQUABLE vers la carte, + « Modifier »', async () => {
    filCourant = FIL({ reference: 'GES-2026-000012', evenementId: 12, evenementObjet: 'Fuite salle de bain' });
    await monter();
    const c = cartouche() as HTMLAnchorElement;
    expect(c.textContent).toBe('Événement : GES-2026-000012 · Fuite salle de bain');
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

  it('🔴 « Rouvrir » appelle DELETE /sans-suite, et le cartouche redevient « Événement : aucun »', async () => {
    filCourant = FIL({ etat: 'sans_suite' });
    await monter();
    await cliquer(declencheur());
    await cliquer(boutonPar(/^Rouvrir$/));
    expect(appels).toContainEqual({ url: '/api/admin/gestion/fils/101/sans-suite', methode: 'DELETE' });
    expect(cartouche()?.textContent).toBe('Événement : aucun');
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
    expect(cartouche()?.textContent).toBe('Événement : aucun');
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
    ficheDuFil = {
      etat: 'ok',
      data: {
        filId: 5, objet: 'Fuite', nbMailsDuFil: 1, horsGestion: false, messageRecentId: 900, disponible: true,
        biens: [{
          cle: '513', adresseComplete: '12 rue des Lilas, 92400 COURBEVOIE', numeroLot: '513',
          nature: 'Appartement', typeBien: 'Type 2', surfaceM2: null, statut: 'auto',
          dateMail: '2026-09-20', nbMails: 1, dossierDriveId: null, lienIds: [1], personnes: [],
        }],
      },
    };
    await monter();
    await cliquer(declencheur());
    // 🔴 LOT FICHE-RATTACHEMENT — le titre dit des BIENS, parce qu'il n'y a plus que des biens dessous.
    expect(container.querySelector('#rdf-titre')?.textContent).toBe('Bien(s) de cet échange');
    expect(container.querySelector('.rdf-item')?.textContent).toContain('12 rue des Lilas, 92400 COURBEVOIE');
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

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT STATUT-PAR-MAIL — LA CAPSULE DU MAIL, À L'ÉCRAN, ET LE CAS DU FIL 803.
 *
 * LE DÉFAUT D'ORIGINE : sur le fil 803 (Thirion), chaque message affichait le badge « À classer » ET le lien vert
 * « Visualiser / Modifier ». Les deux disaient vrai — l'un de l'ÉVÉNEMENT (aucune carte), l'autre du BIEN (les trois
 * mails sont rattachés au lot 445) — mais côte à côte, ils se contredisaient.
 *
 * CE QUE CE BLOC VERROUILLE : un mail rattaché à un bien porte une capsule VERTE, quel que soit son événement ; et
 * les deux informations ne se disent plus jamais avec les mêmes mots.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('🔴 LOT STATUT-PAR-MAIL — la capsule du mail', () => {
  const lienBien = (o: Record<string, unknown> = {}) => ({
    id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: '445', id: 445 },
    libelle: 'Lot 445 — 127 rue Gerhard, Puteaux', origine: 'automatique', statut: 'confirme', confiance: null,
    regle: 'adresse', motif: null, adresses: [], parUnHumain: false,
    creeLe: null, creePar: null, statutLe: null, statutPar: null, ...o,
  });
  const capsule = () => container.querySelector('.cnv-capsule') as HTMLElement | null;

  /** 🔴 LE CAS D'ARNO, REJOUÉ : un lot confirmé, AUCUN événement. La capsule doit être verte. */
  it('🔴 fil 803 : rattaché au lot 445 et sans événement ⇒ capsule VERTE, plus « À classer »', async () => {
    liensParMessage = { '900': [lienBien()] };
    await monter();
    expect(capsule()?.textContent).toBe('Auto');
    expect(capsule()?.className).toContain('cnv-capsule--auto');
    // …et le cartouche d'événement, lui, ne dit plus « À classer ».
    expect(cartouche()?.textContent).toBe('Événement : aucun');
  });

  /** 🔴 LES DEUX INFORMATIONS NE SE DISENT PLUS JAMAIS AVEC LES MÊMES MOTS. */
  it('🔴 « À classer » n’apparaît QUE sur la capsule, jamais sur le cartouche d’événement', async () => {
    await monter();                                  // aucun rattachement du tout
    expect(capsule()?.textContent).toBe('À classer');
    expect(cartouche()?.textContent).not.toBe('À classer');
    expect(cartouche()?.textContent).toContain('Événement');
  });

  it('rattaché À LA MAIN ⇒ « Classé »', async () => {
    liensParMessage = { '900': [lienBien({ origine: 'manuel' })] };
    await monter();
    expect(capsule()?.textContent).toBe('Classé');
    expect(capsule()?.className).toContain('cnv-capsule--classe');
  });

  it('une PROPOSITION non confirmée laisse la capsule rouge', async () => {
    liensParMessage = { '900': [lienBien({ statut: 'propose' })] };
    await monter();
    expect(capsule()?.textContent).toBe('À classer');
  });

  /** 🔴 L'ÉVÉNEMENT NE CLASSE PAS UN MAIL : c'est l'autre question, et c'est tout l'objet de ce lot. */
  it('🔴 un rattachement vers un ÉVÉNEMENT ne verdit PAS la capsule', async () => {
    liensParMessage = { '900': [lienBien({ cible: { sorte: 'evenement', cle: 'ev-3', id: 3 }, origine: 'manuel' })] };
    await monter();
    expect(capsule()?.textContent).toBe('À classer');
  });

  it('l’info-bulle nomme le bien quand il y en a un, et dit pourquoi quand il n’y en a pas', async () => {
    liensParMessage = { '900': [lienBien()] };
    await monter();
    expect(capsule()?.getAttribute('title')).toContain('Lot 445 — 127 rue Gerhard, Puteaux');
    act(() => { root.unmount(); }); container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    liensParMessage = {};
    await monter();
    expect(capsule()?.getAttribute('title')).toContain('aucun bien');
  });

  /** ⚠️ Sans la migration 257, on ne sait RIEN : aucune capsule plutôt qu'une rouge qui accuserait à tort. */
  it('rattachements inconnus ⇒ AUCUNE capsule, jamais une rouge par défaut', async () => {
    await monter({ onRattachement: undefined });
    // Le bandeau n'est pas chargé : la conversation rend `null`, et la capsule ne s'affiche pas.
    if (container.querySelector('.ert') === null) expect(capsule()).toBeNull();
  });

  /**
   * 🔴 LE CLIC SUIT LE STATUT. Une capsule VERTE mène à la CONSULTATION (« où est-ce rangé ? ») ; une capsule ROUGE
   * mène au CLASSEMENT (« range-le »). Faire ouvrir la même fenêtre aux deux affichait, depuis un mail à classer,
   * une liste de rattachements vide — qui n'aidait à rien.
   */
  it('une capsule VERTE mène à la fenêtre de consultation des rattachements', async () => {
    liensParMessage = { '900': [lienBien()] };
    rattachementsDuFil = { etat: 'ok', data: [lienBien()] };
    await monter();
    await cliquer(capsule());
    expect(container.querySelector('#rdf-titre')).not.toBeNull();
    expect(container.querySelector('#clm-titre')).toBeNull();
  });

  it('une capsule ROUGE mène à la fenêtre « Classer ce mail »', async () => {
    liensParMessage = { '900': [] };
    await monter();
    expect(capsule()?.textContent).toBe('À classer');
    await cliquer(capsule());
    expect(container.querySelector('#clm-titre')?.textContent).toBe('Classer ce mail');
    expect(container.querySelector('#rdf-titre')).toBeNull();
  });
});

/**
 * ══ 🔴 LOT STATUT-PAR-MAIL — LA FENÊTRE « CLASSER CE MAIL » ═════════════════════════════════════════════════════════
 * Demande d'Arno, point 3. Ce qui est protégé ici :
 *   ① LA PORTÉE est un choix EXPLICITE, et « Ce mail uniquement » est le DÉFAUT — le geste le plus étroit ;
 *   ② « Toute la conversation » pose le même rattachement sur les mails sans classement manuel, et LE DIT ;
 *   ③ PLUSIEURS BIENS du même propriétaire peuvent être cochés — un mail parle parfois de deux appartements ;
 *   ④ le bien trouvé par l'automatisation est PRÉ-COCHÉ et marqué « Recommandé (automatique) » ;
 *   ⑤ RIEN N'EST ÉCRIT avant le clic sur « Valider le classement » — ouvrir, cocher, décocher, fermer : aucune écriture.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
describe('🔴 LOT STATUT-PAR-MAIL — la fenêtre « Classer ce mail »', () => {
  const capsule = () => container.querySelector('.cnv-capsule') as HTMLElement | null;
  /**
   * ⚠️ LES RADIOS SE DÉSIGNENT PAR LEUR GROUPE, JAMAIS PAR LEUR RANG. La fenêtre en porte désormais deux groupes
   * (« Que faire de ce mail ? » et « Portée ») : un `[1]` nu désignait la portée hier et la réponse aujourd'hui.
   */
  const radios = (groupe = 'clm-portee') =>
    [...container.querySelectorAll(`input[type="radio"][name="${groupe}"]`)] as HTMLInputElement[];
  const cases = () => [...container.querySelectorAll('.clm-bien input[type="checkbox"]')] as HTMLInputElement[];
  const resume = () => container.querySelector('.clm-resume')?.textContent ?? '';
  const valider = () => boutonPar(/^Valider le classement$/);
  /**
   * LES ÉCRITURES DE RATTACHEMENT, ET ELLES SEULES. Le marquage « lu » de la conversation (`/fils/…/lecture`) est un
   * `POST` qui part à l'ouverture du fil, bien avant cette fenêtre : le compter ici ferait croire que classer écrit
   * deux fois.
   */
  const ecritures = () => appels.filter((a) => a.methode !== 'GET' && a.url.includes('/rattachements'));

  /** Deux biens du MÊME propriétaire : le cas qu'Arno a demandé de couvrir explicitement. */
  const bien = (cle: string, o: Record<string, unknown> = {}) => ({
    cle, libelle: `Lot ${cle} — 127 rue Gerhard, Puteaux`, adresse: '127 rue Gerhard', commune: 'Puteaux',
    typeBien: 'appartement', recommande: false, dejaRattache: false,
    // LOT AFFECTATION-PAR-BIEN — le motif est désormais rendu EN CLAIR à côté de chaque bien.
    motif: 'un des 2 biens de EKAMAI', cas: 'c', certitude: 'a_trancher',
    parties: [
      { role: 'proprietaire', cle: 'VMI', nom: 'VM IMMO INVEST' },
      { role: 'locataire', cle: 'TH', nom: 'THIRION Stéphane', depuis: '2025-05-19', jusqua: '2026-10-02' },
    ],
    ...o,
  });

  const ouvrir = async (contexte: Record<string, unknown>, mails: number[] = [900]) => {
    liensParMessage = { '900': [] };
    const avant = global.fetch as unknown as typeof fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/classement?message=')) {
        appels.push({ url: u, methode: init?.method ?? 'GET' });
        return { ok: true, json: async () => ({ etat: 'ok', contexte }) } as unknown as Response;
      }
      if (u.includes('/classement?fil=')) {
        appels.push({ url: u, methode: init?.method ?? 'GET' });
        return { ok: true, json: async () => ({ etat: 'ok', mails }) } as unknown as Response;
      }
      return avant(url, init);
    }) as unknown as typeof fetch;
    await monter();
    await cliquer(capsule());
  };

  const CONTEXTE = (o: Record<string, unknown> = {}) => ({
    messageId: 900, filId: 101, dateMail: '2026-08-10T09:00:00Z', nbMailsDuFil: 3,
    proprietaire: { cle: 'VMI', nom: 'VM IMMO INVEST' },
    examen: { issue: 'a_trancher', motif: '2 bien(s) proposé(s), à trancher' },
    pieces: [],
    biens: [bien('445', {
      recommande: true, cas: 'a', certitude: 'quasi_certaine',
      motif: 'locataire en place à la date du mail (thirion@gmail.com)',
    })],
    disponible: true, ...o,
  });

  it('① la portée par défaut est « Ce mail uniquement »', async () => {
    await ouvrir(CONTEXTE());
    const [seul, tout] = radios();
    expect(seul.checked).toBe(true);
    expect(tout.checked).toBe(false);
    expect(container.textContent).toContain('Ce mail uniquement');
    expect(container.textContent).toContain('Toute la conversation');
  });

  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — LE VOCABULAIRE A CHANGÉ, ET C'EST LE CHANGEMENT DEMANDÉ. « Recommandé
   * (automatique) » ne disait pas POURQUOI. Chaque bien porte désormais sa certitude (« Quasi certain » / « À
   * trancher ») ET son motif en clair — c'est ce qui permet de trancher sans rouvrir le code.
   */
  it('④ le bien recommandé est PRÉ-COCHÉ, et le MOTIF est écrit en clair', async () => {
    await ouvrir(CONTEXTE());
    expect(cases()).toHaveLength(1);
    expect(cases()[0].checked).toBe(true);
    expect(container.textContent).toContain('Quasi certain');
    expect(container.textContent).toContain('locataire en place à la date du mail');
  });

  it('les parties du bien sont celles de la DATE DU MAIL — propriétaire ET locataire', async () => {
    await ouvrir(CONTEXTE());
    expect(container.textContent).toContain('VM IMMO INVEST');
    expect(container.textContent).toContain('THIRION Stéphane');
    expect(container.textContent).toContain('2026-10-02');
    // Et la fenêtre dit de QUELLE date il s'agit, pour qu'on ne lise pas « aujourd'hui ».
    expect(container.querySelector('.clm-date')?.textContent).toContain('10/08/2026');
  });

  it('⑤ RIEN n’est écrit à l’ouverture, ni en cochant, ni en décochant', async () => {
    await ouvrir(CONTEXTE());
    await cliquer(cases()[0]);
    await cliquer(cases()[0]);
    expect(ecritures()).toEqual([]);
  });

  it('la validation pose le rattachement sur le SEUL mail ouvert (portée par défaut)', async () => {
    await ouvrir(CONTEXTE());
    await cliquer(valider());
    const posts = ecritures().filter((a) => a.methode === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toContain('/api/admin/gestion/rattachements');
  });

  it('② « Toute la conversation » annonce « 3 mails classés » et pose sur les trois', async () => {
    await ouvrir(CONTEXTE(), [900, 901, 902]);
    await cliquer(radios()[1]);
    expect(resume()).toContain('3 mails classés');
    await cliquer(valider());
    expect(ecritures().filter((a) => a.methode === 'POST')).toHaveLength(3);
  });

  it('③ PLUSIEURS BIENS du même propriétaire : deux cases, deux rattachements', async () => {
    await ouvrir(CONTEXTE({ biens: [bien('445', { recommande: true }), bien('446')] }));
    expect(cases()).toHaveLength(2);
    // Seul le recommandé est coché : l'autre bien du propriétaire est PROPOSÉ, pas imposé.
    expect(cases().map((c) => c.checked)).toEqual([true, false]);
    await cliquer(cases()[1]);
    expect(resume()).toContain('2 biens');
    await cliquer(valider());
    expect(ecritures().filter((a) => a.methode === 'POST')).toHaveLength(2);
  });

  it('un bien DÉCOCHÉ passe au statut « retiré » (PATCH), il n’est jamais supprimé', async () => {
    rattachementsDuFil = {
      etat: 'ok',
      data: [{
        id: 77, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: '445', id: 445 },
        libelle: 'Lot 445', origine: 'automatique', statut: 'confirme', confiance: null, regle: 'adresse',
        motif: null, adresses: [], parUnHumain: false, creeLe: null, creePar: null, statutLe: null, statutPar: null,
      }],
    };
    await ouvrir(CONTEXTE());
    await cliquer(cases()[0]);
    expect(resume()).toContain('retiré');
    await cliquer(valider());
    const ecrits = ecritures();
    expect(ecrits.filter((a) => a.methode === 'PATCH')).toHaveLength(1);
    expect(ecrits.filter((a) => a.methode === 'DELETE')).toEqual([]);
  });

  it('aucun bien coché et rien à retirer : la validation est INACTIVE, et on le dit', async () => {
    await ouvrir(CONTEXTE({ biens: [bien('445')] }));
    expect(cases()[0].checked).toBe(false);
    expect(resume()).toContain('Aucun bien sélectionné');
    expect(valider()?.disabled).toBe(true);
  });

  it('annuaire ou migration absents : on le DIT, on ne montre pas une liste vide', async () => {
    await ouvrir(CONTEXTE({ disponible: false, biens: [] }));
    expect(container.textContent).toContain('n’est pas encore installé');
    expect(cases()).toHaveLength(0);
  });
});

/**
 * ══ 🔴 LOT STATUT-HORS-GESTION — « CE MAIL NE CONCERNE AUCUN BIEN », À L'ÉCRAN ═══════════════════════════════════
 * Demande d'Arno. Ce qui est protégé ici :
 *   ① la capsule GRISE apparaît dans l'en-tête du mail, avec son MOT ;
 *   ② l'option est proposée dans la fenêtre de classement, et GRISÉE quand la migration 266 manque ;
 *   ③ elle n'est JAMAIS pré-cochée : « rattacher » reste le défaut ;
 *   ④ la validation appelle la route des marques, jamais celle des rattachements ;
 *   ⑤ elle est RÉVERSIBLE : « Annuler hors gestion », et aussi le simple fait de rattacher un bien.
 */
describe('🔴 LOT STATUT-HORS-GESTION — la capsule grise et son geste', () => {
  const capsule = () => container.querySelector('.cnv-capsule') as HTMLElement | null;
  const reponses = () => [...container.querySelectorAll('input[type="radio"][name="clm-reponse"]')] as HTMLInputElement[];
  /**
   * ══ ⚠️ RÉÉCRIT PAR LE LOT RATTACHER-EN-ECRIVANT — ON DÉSIGNE UNE RÉPONSE PAR SON MOT, PLUS PAR SON RANG ══════
   *
   * Ces épreuves lisaient `reponses()[1]` pour « Hors gestion ». Le lot a inséré « Interne » entre les deux — à sa
   * place dans la priorité des capsules (Classé > Auto > INTERNE > Hors gestion) — et le rang 1 désignait soudain
   * un autre bouton, sans que rien ne le dise. Un index dans une liste de boutons est une adresse qui bouge ;
   * le mot affiché, lui, est ce que l'utilisateur voit.
   */
  const reponsePar = (mot: string | RegExp): HTMLInputElement => {
    const trouve = reponses().find((r) => {
      const texte = r.closest('label')?.textContent ?? '';
      return typeof mot === 'string' ? texte.includes(mot) : mot.test(texte);
    });
    if (trouve === undefined) throw new Error(`Aucune réponse « ${String(mot)} » dans la fenêtre.`);
    return trouve;
  };
  const valider = () => boutonPar(/^Valider le classement$/);
  const ecritures = () => appels.filter((a) => a.methode !== 'GET' && !a.url.includes('/lecture'));

  const CONTEXTE = {
    messageId: 900, filId: 101, dateMail: '2026-08-10T09:00:00Z', nbMailsDuFil: 1,
    proprietaire: null, biens: [], disponible: true,
  };
  /** Un rattachement confirmé vers un LOT, tel que la route le rend (le même que plus haut dans ce fichier). */
  const lienBien = (o: Record<string, unknown> = {}) => ({
    id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: '445', id: 445 },
    libelle: 'Lot 445 — 127 rue Gerhard, Puteaux', origine: 'automatique', statut: 'confirme', confiance: null,
    regle: 'adresse', motif: null, adresses: [], parUnHumain: false,
    creeLe: null, creePar: null, statutLe: null, statutPar: null, ...o,
  });

  const monterAvecFenetre = async () => {
    const avant = global.fetch as unknown as typeof fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/classement?message=')) {
        appels.push({ url: u, methode: init?.method ?? 'GET' });
        return { ok: true, json: async () => ({ etat: 'ok', contexte: CONTEXTE }) } as unknown as Response;
      }
      if (u.includes('/classement?fil=')) {
        appels.push({ url: u, methode: init?.method ?? 'GET' });
        return { ok: true, json: async () => ({ etat: 'ok', mails: [900] }) } as unknown as Response;
      }
      return avant(url, init);
    }) as unknown as typeof fetch;
    await monter();
    await cliquer(capsule());
  };

  it('① un mail marqué porte la capsule GRISE, et le MOT est écrit', async () => {
    liensParMessage = { '900': [] };
    marquesHorsGestion = { '900': { motif: 'prospection' } };
    await monter();
    expect(capsule()?.textContent).toBe('Hors gestion');
    expect(capsule()?.className).toContain('cnv-capsule--hors_gestion');
  });

  it('l’info-bulle dit que c’est une décision humaine, son motif, et comment la défaire', async () => {
    liensParMessage = { '900': [] };
    marquesHorsGestion = { '900': { motif: 'prospection' } };
    await monter();
    const t = capsule()?.getAttribute('title') ?? '';
    expect(t).toContain('à la main');
    expect(t).toContain('prospection');
    expect(t).toContain('Rattacher un bien lève cette marque');
  });

  it('🔴 ⑤ un mail marqué PUIS rattaché à un bien redevient VERT : la marque ne l’emporte jamais', async () => {
    liensParMessage = { '900': [lienBien({ origine: 'manuel' })] };
    marquesHorsGestion = { '900': { motif: null } };
    await monter();
    expect(capsule()?.textContent).toBe('Classé');
  });

  it('sans la migration 266, aucune capsule grise : le mail reste « À classer »', async () => {
    liensParMessage = { '900': [] };
    marquesHorsGestion = null;
    await monter();
    expect(capsule()?.textContent).toBe('À classer');
  });

  it('② ③ l’option existe dans la fenêtre, et « rattacher » reste le DÉFAUT', async () => {
    liensParMessage = { '900': [] };
    await monterAvecFenetre();
    expect(container.textContent).toContain('Hors gestion — ce mail ne concerne aucun bien');
    const biens = reponsePar('Le rattacher à un ou plusieurs biens');
    const hors = reponsePar('Hors gestion');
    expect(biens.checked).toBe(true);
    expect(hors.checked).toBe(false);
    expect(hors.disabled).toBe(false);
    // 🔴 LOT RATTACHER-EN-ECRIVANT — et la troisième réponse est là, entre les deux, avec son mot.
    expect(container.textContent).toContain('Interne — échange entre collègues, aucun bien à rattacher');
  });

  it('② sans la migration 266, l’option est GRISÉE et dit pourquoi', async () => {
    liensParMessage = { '900': [] };
    marquesHorsGestion = null;
    await monterAvecFenetre();
    const hors = reponsePar('Hors gestion');
    expect(hors.disabled).toBe(true);
    expect(container.textContent).toContain('pas encore installé sur cette base');
  });

  it('④ la validation appelle la route des MARQUES, et pas celle des rattachements', async () => {
    liensParMessage = { '900': [] };
    await monterAvecFenetre();
    await cliquer(reponsePar('Hors gestion'));
    expect(container.querySelector('.clm-resume')?.textContent).toContain('marqué « hors gestion »');
    await cliquer(valider());
    const e = ecritures();
    expect(e).toHaveLength(1);
    expect(e[0].url).toContain('/api/admin/gestion/hors-gestion');
    expect(e[0].methode).toBe('POST');
  });

  it('⑤ « Annuler hors gestion » est offert sur un mail marqué, et passe par un DELETE', async () => {
    liensParMessage = { '900': [] };
    marquesHorsGestion = { '900': { motif: null } };
    await monterAvecFenetre();
    await cliquer(boutonPar(/^Annuler hors gestion$/));
    expect(container.querySelector('.clm-resume')?.textContent).toContain('plus « hors gestion »');
    await cliquer(valider());
    const e = ecritures();
    expect(e).toHaveLength(1);
    expect(e[0].methode).toBe('DELETE');
    expect(e[0].url).toContain('/api/admin/gestion/hors-gestion');
  });

  it('🔴 RIEN n’est écrit avant la validation — ouvrir, choisir, changer d’avis : aucune écriture', async () => {
    liensParMessage = { '900': [] };
    marquesHorsGestion = { '900': { motif: null } };
    await monterAvecFenetre();
    await cliquer(reponses()[1]);
    await cliquer(reponses()[0]);
    await cliquer(boutonPar(/^Annuler hors gestion$/));
    expect(ecritures()).toEqual([]);
  });
});

/**
 * ══ 🔴 LOT CONTACTS-ET-EVENEMENT — B2 : LE CARTOUCHE REFLÈTE LE BLOC « ÉVÉNEMENT RATTACHÉ » ═══════════════════
 * Y COMPRIS quand la carte est posée sur CE MAIL SEUL. Avant ce lot, on liait un mail à une carte et son cartouche
 * continuait d'afficher celle de l'échange — ou « aucun ».
 *
 * 🔴 B4 — ET LA CAPSULE DE STATUT NE BOUGE JAMAIS : elle dit le rattachement à un BIEN, l'événement est facultatif.
 */
describe('🔴 B2/B4 — le cartouche suit l’événement du mail, la capsule ne bouge pas', () => {
  const capsule = () => container.querySelector('.cnv-capsule') as HTMLElement | null;
  const lienBien = () => ({
    id: 1, messageId: 900, pieceId: null, cible: { sorte: 'lot', cle: '445', id: 445 },
    libelle: 'Lot 445', origine: 'manuel', statut: 'confirme', confiance: null, regle: 'adresse',
    motif: null, adresses: [], parUnHumain: true, creeLe: null, creePar: null, statutLe: null, statutPar: null,
  });

  it('un mail lié à SA carte affiche CETTE carte, pas celle de son échange', async () => {
    filCourant = FIL({ reference: 'GES-2026-000001', evenementId: 1, evenementObjet: 'Carte de l’échange' });
    const avant = global.fetch as unknown as typeof fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/messages')) {
        return {
          ok: true,
          json: async () => ({
            fil: filCourant, messages,
            // Le serveur rend déjà les mails « partis » d'un fil : c'est ce que le cartouche doit lire.
            partis: [{
              messageId: 900, objet: 'Fuite', recuLe: '2026-09-20T12:00:00Z',
              reference: 'GES-2026-000042', evenementId: 42, objetEvenement: 'Fuite salle de bain',
            }],
          }),
        } as unknown as Response;
      }
      return avant(url, init);
    }) as unknown as typeof fetch;

    await monter();
    expect(cartouche()?.textContent).toBe('Événement : GES-2026-000042 · Fuite salle de bain');
  });

  it('🔴 B4 — et la CAPSULE reste celle du BIEN : l’événement ne la change jamais', async () => {
    liensParMessage = { '900': [lienBien()] };
    filCourant = FIL({ reference: 'GES-2026-000001', evenementId: 1, evenementObjet: 'Une carte' });
    await monter();
    // Une carte posée, un bien rattaché à la main : la capsule dit le BIEN, et rien que lui.
    expect(capsule()?.textContent).toBe('Classé');
  });

  it('🔴 B4 — sans aucun bien, une carte posée ne verdit PAS la capsule', async () => {
    liensParMessage = { '900': [] };
    filCourant = FIL({ reference: 'GES-2026-000001', evenementId: 1, evenementObjet: 'Une carte' });
    await monter();
    expect(capsule()?.textContent).toBe('À classer');
  });
});
