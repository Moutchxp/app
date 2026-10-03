// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Conversation } from './Conversation';
import { MENTION_BROUILLON_VOIR_EN_BAS } from '../../../../lib/gestion/brouillonEnAttente';

/**
 * ══ 🔴🔴 LOT VISUALISER-UNIFIE-ET-BROUILLON-EN-HAUT, POINT 1 — OUVRIR UN MAIL, C'EST LE LIRE ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Ouvrir un mail qui a un brouillon de réponse en attente l'affiche comme un mail
 * normal, positionné au DÉBUT du mail, sans défilement automatique vers la zone de réponse. La zone de réponse
 * reste rouverte en bas avec le brouillon. La mention “Brouillon de réponse en attente — voir en bas” reste le
 * raccourci pour y descendre. »
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE PUIS ÉPROUVÉE ICI. L'éditeur s'amène lui-même sous les yeux à son ouverture — trois
 * défilements, posés par le lot REPONSE-VISIBLE pour une raison mesurée (« un bouton dont l'effet est invisible est
 * un bouton cassé »). Depuis le lot précédent, OUVRIR UN MAIL rouvre son brouillon : l'éditeur partait donc
 * chercher la page alors que personne ne l'avait demandé, et l'on atterrissait dans la zone de réponse d'un mail
 * qu'on venait seulement lire.
 *
 * 🔴 LA DISTINCTION TENUE ICI EST CELLE DE L'INTENTION : « Répondre », un bouton du pied, un brouillon cliqué dans
 * la liste des brouillons DEMANDENT l'éditeur — ils continuent de l'amener. Ouvrir un mail, non.
 *
 * ⚠️ `scrollIntoView` N'EXISTE PAS DANS JSDOM : on le pose nous-mêmes, et c'est ce qui permet de voir QUI défile et
 * VERS QUOI. C'est aussi pour cela que le code appelant le teste (`?.`) partout.
 *
 * 🔒 AUCUN ENVOI, aucune donnée réelle : un fil inventé, des adresses inventées, `fetch` simulé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MESSAGES = [
  {
    /**
     * 🔴 LE MAIL QUI PORTE LE BROUILLON : c'est lui qu'on ouvre, et c'est à SON début qu'on doit se trouver.
     *
     * ⚠️ CE N'EST PAS LE DERNIER DU FIL, ET C'EST EXPRÈS : la conversation ouvre d'office son message le plus
     * récent. Prendre celui-là aurait mesuré une FERMETURE, pas une ouverture.
     */
    messageId: 11, de: 'monsieur.invente@exemple.test', deNom: 'Monsieur Inventé', sens: 'recu',
    recuLe: '2026-09-23T08:00:00Z', objet: 'Devis de réparation', corps: 'Voici le devis.',
    extrait: 'Voici le devis.', automatique: false, pieces: [], horsFile: false, motifHorsFile: null,
    nonRemises: [], destA: null, destCc: null, destinatairesFondus: 'gestion@exemple.test', htmlSeul: false,
  },
  {
    messageId: 12, de: 'madame.fictive@exemple.test', deNom: 'Madame Fictive', sens: 'recu',
    recuLe: '2026-10-01T10:00:00Z', objet: 'Fuite au plafond', corps: 'Il y a une fuite.',
    extrait: 'Il y a une fuite.', automatique: false, pieces: [], horsFile: false, motifHorsFile: null,
    nonRemises: [], destA: null, destCc: null, destinatairesFondus: 'gestion@exemple.test', htmlSeul: false,
  },
];
const FIL = {
  filId: 7, objet: 'Fuite au plafond', etat: 'a_classer', reference: null,
  evenementId: null, evenementObjet: null,
};
/** Un brouillon VIVANT sur le mail 12 — ni envoyé, ni abandonné : c'est le cas d'Arno. */
const BROUILLON = {
  id: 900, filId: 7, repondAMessageId: 11, voie: 'repondre',
  a: ['monsieur.invente@exemple.test'], cc: [], cci: [],
  objet: 'Re: Devis de réparation', corps: 'Bonjour, je reviens vers vous',
  corpsHtml: '<p>Bonjour, je reviens vers vous</p>', citation: null, majLe: '2026-10-02T09:00:00Z',
};
const CONTEXTE = {
  schemaPret: true, peutEnvoyer: false, jetonPresent: false, signature: '', nomExpediteur: 'GESTION',
  adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 10, piecesDisponibles: false,
};

let container: HTMLDivElement;
let root: Root;
/** Chaque défilement demandé : l'élément visé, et le calage. C'est tout l'objet de ce fichier. */
let defilements: { quoi: string; bloc: string | undefined }[];

/** Comment on NOMME un élément dans le relevé : sa ligne de mail, ou l'éditeur, ou le reste. */
function nommer(el: Element): string {
  const li = el.closest?.('li[data-message]');
  if (el.tagName === 'SECTION' && el.classList.contains('red')) return 'editeur';
  if (li !== null && li !== undefined && li === el) return `mail-${li.getAttribute('data-message')}`;
  if (el.classList.contains('cnv-pied-ancre')) return 'zone-de-reponse';
  return el.className === '' ? el.tagName.toLowerCase() : `.${String(el.className).split(' ')[0]}`;
}

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  defilements = [];
  /* ⚠️ JSDOM NE FOURNIT PAS `scrollIntoView` : on le pose, et il devient notre mouchard. */
  (Element.prototype as unknown as { scrollIntoView: (o?: ScrollIntoViewOptions) => void }).scrollIntoView =
    function (o?: ScrollIntoViewOptions) { defilements.push({ quoi: nommer(this as Element), bloc: o?.block }); };
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/gestion/brouillons')) {
      return { ok: true, json: async () => ({ brouillons: [BROUILLON] }) } as unknown as Response;
    }
    if (u.includes('/gestion/suivi')) {
      return { ok: true, json: async () => ({ etat: 'ok', mails: [11, 12], periodes: [], exceptions: [] }) } as unknown as Response;
    }
    if (u.includes('/messages')) {
      return { ok: true, json: async () => ({ fil: FIL, messages: MESSAGES, partis: [] }) } as unknown as Response;
    }
    if (u.includes('/rattachements')) return { ok: true, json: async () => ({ etat: 'ok', data: {} }) } as unknown as Response;
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 7, maintenant: new Date('2026-10-03T12:00:00Z'), onGeste: () => {}, redaction: CONTEXTE,
    } as never));
  });
  await calmer();
};
const ligne = (id: number) => container.querySelector(`li[data-message="${id}"]`) as HTMLElement;
/**
 * ⚠️ ON ATTEND UNE IMAGE, POUR DE VRAI. Le défilement de l'ouverture part dans un `requestAnimationFrame` — dans
 * jsdom, c'est un minuteur, que vider la file des microtâches ne déclenche PAS. Sans cette attente, le relevé
 * d'un geste débordait sur le suivant, et seulement quand la machine était chargée : un test qui ment une fois
 * sur dix est pire qu'un test absent.
 */
const cliquer = async (e: Element) => {
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};
/** On ouvre le mail 11 par sa ligne — exactement le geste d'Arno. */
const ouvrirLeMail = async () => {
  const entete = ligne(11).querySelector('button.cnv-ligne') as HTMLElement;
  defilements = [];
  await cliquer(entete);
  /* 🔴 LE RELEVÉ DE CE GESTE EST CLOS ICI : ce qui suivra appartient au geste suivant. */
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 ON OUVRE LE MAIL, ON EST AU DÉBUT DU MAIL
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① ouvrir un mail qui a un brouillon', () => {
  it('🔴🔴 la page se pose au DÉBUT du mail ouvert', async () => {
    await monter();
    await ouvrirLeMail();
    expect(defilements).toContainEqual({ quoi: 'mail-11', bloc: 'start' });
  });

  /** 🔴🔴 LE DÉFAUT D'ARNO, NOMMÉ : plus aucun défilement ne part vers la zone de réponse. */
  it('🔴🔴 et RIEN ne défile vers la zone de réponse', async () => {
    await monter();
    await ouvrirLeMail();
    expect(defilements.map((d) => d.quoi)).not.toContain('editeur');
  });

  /** 🔴 LA ZONE RESTE ROUVERTE EN BAS, AVEC LE BROUILLON : c'est la règle du lot précédent, intacte. */
  it('🔴🔴 la zone de réponse est bien rouverte, avec le brouillon', async () => {
    await monter();
    await ouvrirLeMail();
    const editeur = ligne(11).querySelector('section.red');
    expect(editeur).not.toBeNull();
    /* 🔴 ET C'EST BIEN LE BROUILLON D'ARNO qu'on y retrouve, pas un éditeur vide : son texte est là.
       (L'objet vit dans un champ de saisie, donc hors du texte du bloc : on lit le CORPS, qui, lui, s'y trouve.) */
    expect(editeur?.textContent).toContain('Bonjour, je reviens vers vous');
    expect(editeur?.querySelector('input')).not.toBeNull();
  });

  /**
   * ══ 🔴🔴 ET LE CURSEUR NE PART PAS NON PLUS DANS LA ZONE DE RÉPONSE ═══════════════════════════════════════════
   *
   * MESURÉ DANS LE NAVIGATEUR (fil 36671, mail 57471, 03/10/2026) : les trois calages coupés, la page descendait
   * ENCORE de 790 px à l'ouverture — et `scrollIntoView` n'était appelé NULLE PART (relevé à zéro appel). C'est
   * `focus()` qui déplaçait la page, le navigateur amenant d'office l'élément focalisé sous les yeux.
   *
   * 🔴 LE DÉFILEMENT ET LE CURSEUR SONT DONC LA MÊME DÉCISION, et ils suivent la même option.
   */
  it('🔴🔴 le curseur reste hors de la zone de réponse', async () => {
    await monter();
    await ouvrirLeMail();
    const editeur = ligne(11).querySelector('section.red');
    expect(editeur?.contains(document.activeElement)).toBe(false);
  });

  /** ⚠️ ET LE MAIL EST BIEN OUVERT : on vérifie qu'on n'a pas mesuré l'absence de défilement d'un geste raté. */
  it('⚠️ le mail est bien déplié', async () => {
    await monter();
    await ouvrirLeMail();
    expect(ligne(11).querySelector('.cnv-detail')).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LA MENTION RESTE LE RACCOURCI POUR DESCENDRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② « voir en bas » emmène en bas', () => {
  it('🔴🔴 le clic sur la mention fait défiler jusqu’à la zone de réponse', async () => {
    await monter();
    await ouvrirLeMail();
    const mention = [...ligne(11).querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes(MENTION_BROUILLON_VOIR_EN_BAS));
    expect(mention, 'la mention « voir en bas » doit être là').toBeDefined();
    defilements = [];
    await cliquer(mention as Element);
    /* 🔴 ELLE TIENT SA PROMESSE : un défilement part, et il vise le pied du message — pas autre chose. */
    expect(defilements).toHaveLength(1);
    expect(defilements[0].bloc).toBe('center');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴 CE QUI NE CHANGE PAS : « RÉPONDRE » AMÈNE TOUJOURS L'ÉDITEUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ③ une DEMANDE d’éditeur l’amène toujours sous les yeux', () => {
  /**
   * 🔴🔴 LA MOITIÉ QU'IL NE FALLAIT PAS CASSER. Le lot REPONSE-VISIBLE a mesuré dans le navigateur pourquoi
   * l'éditeur doit venir sous les yeux quand on le demande (il s'ouvrait hors de l'écran, sous douze messages).
   * Ce lot ne retire ce défilement QUE pour l'ouverture d'un mail.
   */
  it('🔴🔴 l’option existe, et elle vaut « oui » partout ailleurs', () => {
    const red = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    expect(red).toContain('calerAVue = true');
    expect(red).toContain('if (!calerAVue) {');
    /* 🔴 ET LE CURSEUR SUIT LA MÊME OPTION : prendre le focus, c'est faire défiler. */
    expect(red).toContain('autoFocus={calerAVue && (brouillon.voie === \'repondre\'');
    const conv = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(conv).toContain('calerAVue={calerLaReponse}');
    /* 🔴 UN SEUL ENDROIT LE MET À « non » : la reprise par OUVERTURE du mail. */
    expect(conv.match(/setCalerLaReponse\(false\)/g) ?? []).toHaveLength(1);
    /* 🔴 ET QUATRE LE REMETTENT À « oui » : Répondre, le pied, le brouillon cliqué, la fermeture. */
    expect(conv.match(/setCalerLaReponse\(true\)/g) ?? []).toHaveLength(4);
  });
});
