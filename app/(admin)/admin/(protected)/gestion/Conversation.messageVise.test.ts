// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Conversation } from './Conversation';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT MESSAGE-CLIQUÉ — LA CONVERSATION S'OUVRE SUR LE MESSAGE QU'ON A CLIQUÉ (demande d'Arno).
 *
 * LE DÉFAUT RÉEL, relevé sur le fil 354 : en Réception, la ligne représente le dernier message REÇU (25 sept.
 * 12 h 37) ; l'écran s'ouvrait déplié sur NOTRE réponse de 15 h 58, parce que la conversation dépliait toujours son
 * dernier message. On cliquait sur une question, on lisait sa propre prose — et on ne s'en apercevait qu'après avoir
 * cherché la question des yeux.
 *
 * CE QUE CE FICHIER PROTÈGE, et qu'aucune relecture ne montre :
 *   ① le message VISÉ est déplié, et lui seul — les autres restent repliés, au-dessus comme en dessous ;
 *   ② SON CORPS EST CHARGÉ. Le serveur n'envoie le texte complet que du DERNIER message : sans cette lecture, viser
 *      un autre message l'ouvrirait sur un corps vide, et l'écran répondrait « pas de texte » — une réponse FAUSSE ;
 *   ③ les autres messages restent AFFICHÉS et cliquables : on ouvre une conversation, pas un message isolé ;
 *   ④ sans visée, rien ne change : c'est toujours le dernier message lisible qui s'ouvre.
 *
 * La règle elle-même (qui l'emporte, que faire d'un visé introuvable) est éprouvée à part, dans le module PUR
 * `conversation.test.ts` — ici on éprouve ce que l'ÉCRAN en fait.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * LA FORME DU FIL 354, du plus ancien au plus récent — l'ordre dans lequel le serveur les rend, toujours.
 *
 * ⚠️ `corps: null` SUR LES DEUX PREMIERS, ET C'EST LE POINT DÉLICAT : c'est ce que fait le vrai serveur, qui
 * n'envoie le texte complet que du dernier message. `extrait` non vide dit qu'il y a bien un texte à aller chercher.
 */
const MESSAGES = [
  {
    messageId: 8121, de: 'jean-paul.bentz@orange.fr', deNom: 'Jean-Paul Bentz', sens: 'recu',
    recuLe: '2026-09-24T09:00:00Z', objet: 'Document CRITERIMMO', corps: null, extrait: 'Premier courrier.',
    automatique: false, pieces: [], horsFile: false, motifHorsFile: null, nonRemises: [],
    destA: null, destCc: null, destinatairesFondus: 'gestion@criterimmo.fr', htmlSeul: false,
  },
  {
    // LE MESSAGE DE LA LIGNE DE RÉCEPTION : le dernier REÇU, à 12 h 37.
    messageId: 8123, de: 'jean-paul.bentz@orange.fr', deNom: 'Jean-Paul Bentz', sens: 'recu',
    recuLe: '2026-09-25T12:37:00Z', objet: 'Document CRITERIMMO - D20',
    corps: null, extrait: 'Voici le document demandé.',
    automatique: false, pieces: [], horsFile: false, motifHorsFile: null, nonRemises: [],
    destA: null, destCc: null, destinatairesFondus: 'gestion@criterimmo.fr', htmlSeul: false,
  },
  {
    // NOTRE RÉPONSE DE 15 H 58 : le dernier message du fil, et ce que l'écran ouvrait à tort.
    messageId: 8124, de: 'gestion@criterimmo.fr', deNom: 'CRITERIMMO', sens: 'envoye',
    recuLe: '2026-09-25T15:58:00Z', objet: 'Re: Document CRITERIMMO - D20',
    corps: 'Bien reçu, merci.', extrait: 'Bien reçu, merci.',
    automatique: false, pieces: [], horsFile: false, motifHorsFile: null, nonRemises: [],
    destA: null, destCc: null, destinatairesFondus: 'jean-paul.bentz@orange.fr', htmlSeul: false,
  },
];
const FIL = {
  filId: 354, objet: 'Document CRITERIMMO', etat: 'a_classer', reference: null,
  evenementId: null, evenementObjet: null,
};
/** Le texte complet, tel que la route `/corps` le rend — et qu'on ne doit voir QUE s'il a été demandé. */
const CORPS = { 8121: 'Le texte entier du premier courrier.', 8123: 'Le texte entier du document D20.' };

let container: HTMLDivElement;
let root: Root;
/** Les messages dont le CORPS a été demandé au serveur — l'objet du point ②. */
let corpsDemandes: number[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  corpsDemandes = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    const m = /\/messages\/(\d+)\/corps/.exec(u);
    if (m !== null) {
      const id = Number(m[1]);
      corpsDemandes.push(id);
      return { ok: true, json: async () => ({ corps: (CORPS as Record<number, string>)[id] ?? null }) } as unknown as Response;
    }
    if (u.includes('/messages')) {
      return { ok: true, json: async () => ({ fil: FIL, messages: MESSAGES, partis: [] }) } as unknown as Response;
    }
    if (u.includes('/rattachements')) return { ok: true, json: async () => ({ etat: 'ok', data: {} }) } as unknown as Response;
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const monter = async (messageVise: number | null = null) => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 354, maintenant: new Date('2026-09-26T12:00:00Z'), onGeste: () => {}, messageVise,
    } as never));
  });
  await calmer();
};
const ligne = (id: number) => container.querySelector(`li[data-message="${id}"]`) as HTMLElement | null;
/** Les messages DÉPLIÉS à l'écran, lus par l'identité de leur ligne — jamais par leur position. */
const deplies = () => [...container.querySelectorAll('li[data-message]')]
  .filter((li) => li.querySelector('.cnv-detail') !== null)
  .map((li) => Number(li.getAttribute('data-message')));
const affiches = () => [...container.querySelectorAll('li[data-message]')]
  .map((li) => Number(li.getAttribute('data-message')));

describe('🔴 ① le message visé est déplié, et lui seul', () => {
  it('RÉCEPTION : on clique sur le message reçu de 12 h 37, c’est LUI qui s’ouvre', async () => {
    await monter(8123);
    expect(deplies()).toEqual([8123]);
    // …et surtout PAS notre réponse de 15 h 58, qui est pourtant le dernier message du fil.
    expect(ligne(8124)?.querySelector('.cnv-detail')).toBeNull();
  });

  it('ENVOYÉS : la même conversation, ouverte sur NOTRE message', async () => {
    await monter(8124);
    expect(deplies()).toEqual([8124]);
  });

  it('RECHERCHE : le message trouvé au MILIEU du fil s’ouvre, sans rien déplier d’autre', async () => {
    await monter(8121);
    expect(deplies()).toEqual([8121]);
  });

  /** ④ Sans visée, rien ne change : le dernier message lisible, comme avant ce lot. */
  it('sans message visé, c’est le DERNIER — le comportement d’avant ce lot', async () => {
    await monter(null);
    expect(deplies()).toEqual([8124]);
  });
});

describe('🔴 ② le corps du message visé est bien allé le chercher', () => {
  /**
   * LE PIÈGE : le serveur n'envoie le corps complet QUE du dernier message. Déplier le message visé sans demander
   * son texte l'ouvrirait sur un corps vide — et l'écran dirait « ce message n'a pas de texte », ce qui est FAUX.
   */
  it('le texte complet est demandé, puis AFFICHÉ', async () => {
    await monter(8123);
    expect(corpsDemandes).toContain(8123);
    expect(ligne(8123)?.textContent).toContain('Le texte entier du document D20.');
  });

  it('on ne demande QUE le corps du message visé — pas ceux des messages restés repliés', async () => {
    await monter(8123);
    expect(corpsDemandes).toEqual([8123]);
  });

  it('le dernier message, lui, arrive avec son corps : aucune requête de plus', async () => {
    await monter(null);
    expect(corpsDemandes).toEqual([]);
  });
});

describe('🔴 ③ les autres messages restent là, repliés et cliquables', () => {
  it('on ouvre une CONVERSATION, pas un message isolé', async () => {
    await monter(8123);
    // Les trois messages sont affichés, au-dessus et en dessous du visé (ici, plus récent d'abord).
    expect(affiches().sort()).toEqual([8121, 8123, 8124]);
    // Et chaque ligne repliée reste un bouton : on peut la déplier d'un clic.
    expect(ligne(8121)?.querySelector('button')).not.toBeNull();
    expect(ligne(8124)?.querySelector('button')).not.toBeNull();
  });

  /** Un identifiant qui ne désigne plus rien (mail déplacé depuis, adresse bricolée) ne doit pas vider l'écran. */
  it('un message visé INTROUVABLE ouvre la conversation normalement', async () => {
    await monter(999999);
    expect(affiches()).toHaveLength(3);
    expect(deplies()).toEqual([8124]); // on retombe sur le dernier
  });
});
