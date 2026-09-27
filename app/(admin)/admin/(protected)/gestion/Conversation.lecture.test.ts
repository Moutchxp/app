// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Conversation } from './Conversation';
import { CLE_ORDRE_FIL, ordonnerMessages, libelleOrdre, ordreSuivant, ORDRE_FIL_DEFAUT } from '../../../../lib/gestion/conversation';

/**
 * LOT FIL-LECTURE — LIRE UNE CONVERSATION : ORDRE, RÉPONSE PAR MESSAGE, EN-TÊTE, OBJET.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE, et qu'aucune relecture ne montre :
 *   ① le PLUS RÉCENT EN HAUT par défaut, et le sélecteur qui bascule — avec la mémoire du choix ;
 *   ② « Répondre » sous un message ANCIEN rédige une réponse à CE message : ses destinataires, sa citation, son
 *      objet, son In-Reply-To. C'est le défaut le plus coûteux du lot, parce qu'il ne se voit qu'après l'envoi ;
 *   ③ l'objet de CHAQUE message est affiché — replié comme déplié.
 *
 * ⚠️ AUCUN ENVOI : la rédaction s'ouvre, on lit ce qu'elle contient, on ne clique jamais « Envoyer ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Trois messages, du plus ancien au plus récent — l'ordre dans lequel le serveur les rend, toujours. */
const MESSAGES = [
  {
    messageId: 11, de: 'martin@orange.fr', deNom: 'Mme Martin', sens: 'recu', recuLe: '2026-09-01T08:00:00Z',
    objet: 'Fuite salle de bain', corps: 'Il y a une fuite.', extrait: 'Il y a une fuite.', automatique: false,
    pieces: [], horsFile: false, motifHorsFile: null,
    destA: [{ nom: null, adresse: 'gestion@criterimmo.fr' }],
    destCc: [{ nom: 'Copie', adresse: 'copie@criterimmo.fr' }],
    destinatairesFondus: 'gestion@criterimmo.fr', htmlSeul: false,
  },
  {
    messageId: 12, de: 'gestion@criterimmo.fr', deNom: 'CRITERIMMO', sens: 'envoye', recuLe: '2026-09-10T09:00:00Z',
    objet: 'Re: Fuite salle de bain', corps: 'Un plombier passera.', extrait: 'Un plombier passera.',
    automatique: false, pieces: [], horsFile: false, motifHorsFile: null,
    destA: [{ nom: null, adresse: 'martin@orange.fr' }], destCc: null,
    destinatairesFondus: 'martin@orange.fr', htmlSeul: false,
  },
  {
    messageId: 13, de: 'syndic@immeuble.fr', deNom: 'Syndic', sens: 'recu', recuLe: '2026-09-20T10:00:00Z',
    objet: 'Devis plomberie', corps: 'Voici le devis.', extrait: 'Voici le devis.', automatique: false,
    pieces: [], horsFile: false, motifHorsFile: null,
    destA: [{ nom: null, adresse: 'gestion@criterimmo.fr' }], destCc: null,
    destinatairesFondus: 'gestion@criterimmo.fr', htmlSeul: false,
  },
];
const FIL = { filId: 101, objet: 'Fuite salle de bain', etat: 'a_classer', reference: null, evenementId: null, evenementObjet: null };
/** ⚠️ `signature: ''` et non `null` : l'éditeur lit `contexte.signature.trim()`. Une signature ABSENTE se dit par
 *  une chaîne vide — c'est ce que rend la vraie route, et un `null` ici ferait échouer le rendu pour une raison qui
 *  n'a rien à voir avec ce qu'on éprouve. */
const REDACTION = { adresseGestion: 'gestion@criterimmo.fr', signature: '', peutEnvoyer: true, schemaPret: true, delaiAnnulationS: 10 };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.localStorage?.clear(); } catch { /* stockage refusé : le test vaut quand même */ }
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/messages')) return { ok: true, json: async () => ({ fil: FIL, messages: MESSAGES, partis: [] }) } as unknown as Response;
    if (u.includes('/rattachements')) return { ok: true, json: async () => ({ etat: 'ok', data: {} }) } as unknown as Response;
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 101, maintenant: new Date('2026-09-24T12:00:00Z'), onGeste: () => {},
      barreActions: true, redaction: REDACTION,
    } as never));
  });
  await calmer();
};
const cliquer = async (b: Element | null | undefined) => { await act(async () => { (b as HTMLElement | undefined)?.click(); }); await calmer(); };
/**
 * TOUT CE QUE L'ÉDITEUR MONTRE — valeurs des champs ET texte affiché.
 *
 * ⚠️ LES DESTINATAIRES NE SONT PAS DANS UN `input` : `ChampDestinataires` les rend en pastilles (le champ de saisie,
 * lui, reste vide pour en AJOUTER un). Lire les seules valeurs de champs faisait donc conclure « aucun destinataire »
 * alors qu'ils étaient à l'écran. On lit donc les deux : les valeurs saisies et le texte rendu.
 */
const editeur = (): string => {
  const bloc = container.querySelector('.red') ?? container;
  const champs = [...bloc.querySelectorAll('input, textarea')]
    .map((c) => (c as HTMLInputElement).value).join(' | ');
  return `${bloc.textContent ?? ''} | ${champs}`;
};
/** L'ordre des messages TEL QU'IL EST À L'ÉCRAN, lu par l'identité de chaque ligne. */
const ordreAffiche = () => [...container.querySelectorAll('li[data-message]')].map((li) => Number(li.getAttribute('data-message')));
const ligne = (id: number) => container.querySelector(`li[data-message="${id}"]`) as HTMLElement | null;
/** Les trois boutons de réponse D'UN message précis. */
const repondreDe = (id: number, motif: RegExp) =>
  [...(ligne(id)?.querySelectorAll('.cnv-repondre button') ?? [])].find((b) => motif.test(b.textContent ?? ''));

describe('🔴 ① l’ordre : le plus récent en haut, et le sélecteur', () => {
  it('à l’ouverture, le plus RÉCENT est en premier et il est déplié', async () => {
    await monter();
    expect(ordreAffiche()).toEqual([13, 12, 11]);
    // Le message déplié à l'ouverture n'a pas changé — c'est toujours le dernier lisible, il est juste en haut.
    expect(ligne(13)?.querySelector('.cnv-detail')).not.toBeNull();
    expect(ligne(11)?.querySelector('.cnv-detail')).toBeNull();
  });

  it('le sélecteur bascule l’ordre, et dit celui qui est en cours', async () => {
    await monter();
    const sel = () => container.querySelector('.cnv-ordre') as HTMLButtonElement;
    expect(sel().textContent).toBe('Plus récent d’abord');
    await cliquer(sel());
    expect(ordreAffiche()).toEqual([11, 12, 13]);
    expect(sel().textContent).toBe('Plus ancien d’abord');
    await cliquer(sel());
    expect(ordreAffiche()).toEqual([13, 12, 11]);
  });

  /**
   * 🔴 LE CHOIX SURVIT À LA FERMETURE. Sans mémoire, on rebasculerait à chaque conversation ouverte : le réglage
   * deviendrait un geste de plus, et personne ne s'en servirait.
   */
  it('le choix est mémorisé, et relu à la conversation suivante', async () => {
    await monter();
    await cliquer(container.querySelector('.cnv-ordre'));
    expect(globalThis.localStorage.getItem(CLE_ORDRE_FIL)).toBe('ancien');
    act(() => { root.unmount(); });
    root = createRoot(container);
    await monter();
    expect(ordreAffiche()).toEqual([11, 12, 13]);
  });

  /** Une valeur abîmée dans le navigateur ne doit pas casser la lecture : on retombe sur le défaut. */
  it('une mémoire illisible vaut le défaut', async () => {
    globalThis.localStorage.setItem(CLE_ORDRE_FIL, 'n’importe quoi');
    await monter();
    expect(ordreAffiche()).toEqual([13, 12, 11]);
  });
});

describe('🔴 ② répondre à N’IMPORTE QUEL message, et à celui-là seulement', () => {
  it('les trois boutons sont sous CHAQUE message déplié', async () => {
    await monter();
    await cliquer(ligne(11)?.querySelector('.cnv-ligne'));
    for (const mot of [/^Répondre$/, /^Répondre à tous$/, /^Transférer$/]) {
      expect(repondreDe(11, mot)).toBeDefined();
      expect(repondreDe(13, mot)).toBeDefined();
    }
  });

  /**
   * 🔴 LE CŒUR DU LOT. Répondre sous le PREMIER message (Mme Martin, 1er septembre) doit écrire à Mme Martin — pas
   * au syndic, qui est l'expéditeur du dernier message. Avant ce lot, le brouillon se préparait toujours à partir du
   * dernier message du fil : mauvais destinataire, mauvaise citation, et une réponse qui se raccroche au mauvais
   * endroit du fil chez le correspondant. Rien ne l'aurait montré avant l'envoi.
   */
  it('« Répondre » sous un message ANCIEN écrit à l’expéditeur de CE message', async () => {
    await monter();
    await cliquer(ligne(11)?.querySelector('.cnv-ligne'));
    await cliquer(repondreDe(11, /^Répondre$/));
    const vu = editeur();
    expect(vu).toContain('martin@orange.fr');
    expect(vu).not.toContain('syndic@immeuble.fr');
    // …et la citation est celle de CE message.
    expect(vu).toContain('Il y a une fuite.');
    expect(vu).not.toContain('Voici le devis.');
  });

  it('« Répondre à tous » sous ce même message reprend SES copies', async () => {
    await monter();
    await cliquer(ligne(11)?.querySelector('.cnv-ligne'));
    await cliquer(repondreDe(11, /^Répondre à tous$/));
    const vu = editeur();
    expect(vu).toContain('martin@orange.fr');
    expect(vu).toContain('copie@criterimmo.fr'); // la copie du message 11, pas celle du dernier
  });

  it('« Transférer » sous le message le plus récent reprend SON objet', async () => {
    await monter();
    await cliquer(repondreDe(13, /^Transférer$/));
    expect(editeur()).toContain('Devis plomberie');
  });
});

describe('🔴 ③ l’objet de chaque message est visible, et l’en-tête tient en lignes', () => {
  it('l’en-tête déplié porte l’objet EN PREMIÈRE ligne, puis De, À, Cc, Date', async () => {
    await monter();
    await cliquer(ligne(11)?.querySelector('.cnv-ligne'));
    const intitules = [...(ligne(11)?.querySelectorAll('.cnv-entete-ligne dt') ?? [])].map((d) => d.textContent);
    expect(intitules[0]).toBe('Objet');
    expect(intitules).toContain('De');
    expect(intitules).toContain('Cc');
    expect(intitules[intitules.length - 1]).toBe('Date');
  });

  /** Chaque intitulé a sa valeur SUR SA LIGNE : une rangée = un `dt` + un `dd`, et rien d'autre. */
  it('chaque ligne d’en-tête porte un intitulé et une valeur, et une seule', async () => {
    await monter();
    for (const l of ligne(13)?.querySelectorAll('.cnv-entete-ligne') ?? []) {
      expect(l.querySelectorAll('dt')).toHaveLength(1);
      expect(l.querySelectorAll('dd')).toHaveLength(1);
    }
  });

  it('l’objet du message s’affiche AUSSI sur la ligne repliée', async () => {
    await monter();
    expect(ligne(12)?.querySelector('.cnv-objet')?.textContent).toBe('Fuite salle de bain');
    // ⚠️ « Re: » est retiré à l'AFFICHAGE seulement : l'objet enregistré, lui, n'est jamais réécrit.
    expect(ligne(13)?.querySelector('.cnv-objet')?.textContent).toBe('Devis plomberie');
  });

  /**
   * 153 messages de la boîte n'ont AUCUN objet — vérifié le 27/09/2026 en relisant les mails réels : leur en-tête
   * `Subject:` existe et il est VIDE. Ce n'est pas un défaut d'import, il n'y a rien à corriger ; il faut seulement
   * que l'écran le dise au lieu d'afficher un trou.
   */
  it('un message sans objet le DIT, il ne laisse pas un blanc', async () => {
    (global.fetch as unknown as { mockImplementation: (f: unknown) => void }).mockImplementation(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/messages')) {
        return { ok: true, json: async () => ({ fil: FIL, messages: [{ ...MESSAGES[0], objet: null }], partis: [] }) } as unknown as Response;
      }
      if (u.includes('/rattachements')) return { ok: true, json: async () => ({ etat: 'ok', data: {} }) } as unknown as Response;
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    });
    await monter();
    expect(ligne(11)?.querySelector('.cnv-objet')?.textContent).toBe('(sans objet)');
    expect(ligne(11)?.querySelector('.cnv-entete-ligne dd')?.textContent).toBe('(sans objet)');
  });
});

describe('les règles pures de l’ordre', () => {
  it('ordonner ne MUTE jamais la liste reçue', () => {
    const source = [1, 2, 3];
    expect(ordonnerMessages(source, 'recent')).toEqual([3, 2, 1]);
    expect(source).toEqual([1, 2, 3]); // une liste d'état React mutée en place donnerait deux rendus incohérents
    expect(ordonnerMessages(source, 'ancien')).toEqual([1, 2, 3]);
  });

  it('les mots et la bascule', () => {
    expect(ORDRE_FIL_DEFAUT).toBe('recent');
    expect(libelleOrdre('recent')).toBe('Plus récent d’abord');
    expect(libelleOrdre('ancien')).toBe('Plus ancien d’abord');
    expect(ordreSuivant('recent')).toBe('ancien');
    expect(ordreSuivant('ancien')).toBe('recent');
  });
});

describe('🔴 le pied de conversation dit à QUI il répond', () => {
  /**
   * 🔴 LE PIÈGE QUE CE TEST FERME, et qu'on n'a vu qu'à l'écran. Le pied de la conversation a toujours répondu au
   * message le plus RÉCENT. Ce n'était pas ambigu tant que le plus récent était juste au-dessus de lui. Depuis que
   * l'ordre est un réglage, ce pied peut se trouver sous le message le plus ANCIEN : on croirait répondre à celui
   * qu'on vient de lire, et on écrirait à quelqu'un d'autre. Rien ne l'aurait montré avant l'envoi.
   */
  it('la mention est là dès qu’il y a plus d’un message', async () => {
    await monter();
    expect(container.querySelector('.cnv-pied-note')?.textContent)
      .toContain('répondent au message le plus récent');
  });

  it('…et le pied répond bien au plus récent, quel que soit l’ordre affiché', async () => {
    await monter();
    await cliquer(container.querySelector('.cnv-ordre')); // on passe en « plus ancien d'abord »
    await cliquer([...container.querySelectorAll('.cnv-pied-bouton')].find((b) => /^Répondre$/.test(b.textContent ?? '')));
    const vu = editeur();
    expect(vu).toContain('syndic@immeuble.fr');   // l'expéditeur du message 13, le plus récent
    expect(vu).not.toContain('martin@orange.fr'); // et non celui du message affiché juste au-dessus du pied
  });
});
