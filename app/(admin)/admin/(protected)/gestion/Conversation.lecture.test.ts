// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
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
const boutonPar = (motif: RegExp) => [...container.querySelectorAll('button')].find((b) => motif.test(b.textContent ?? ''));
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
  /**
   * 🔴 LOT FIL-LECTURE-2 — L'OBJET N'EST PLUS DANS L'EN-TÊTE GRIS. Il y a vécu une journée, et s'affichait alors
   * DEUX fois : sous « reçu de … » et ici, à trois centimètres d'écart. Celui du haut a gagné — il est visible
   * message replié comme déplié. Ce test garde donc la garantie inverse : l'en-tête gris ne le répète pas.
   */
  it('l’en-tête déplié porte De, À, Cc, Date — et PLUS l’objet', async () => {
    await monter();
    await cliquer(ligne(11)?.querySelector('.cnv-ligne'));
    const intitules = [...(ligne(11)?.querySelectorAll('.cnv-entete-ligne dt') ?? [])].map((d) => d.textContent);
    expect(intitules).not.toContain('Objet');
    expect(intitules[0]).toBe('De');
    expect(intitules).toContain('Cc');
    expect(intitules[intitules.length - 1]).toBe('Date');
  });

  /** 🔴 UNE SEULE FOIS DANS TOUT LE MESSAGE, déplié compris : c'est la demande d'Arno, et c'est vérifiable. */
  it('l’objet n’apparaît qu’UNE fois par message, même déplié', async () => {
    await monter();
    await cliquer(ligne(11)?.querySelector('.cnv-ligne'));
    const occurrences = (ligne(11)?.textContent ?? '').split('Fuite salle de bain').length - 1;
    expect(occurrences).toBe(1);
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
    // LOT FIL-LECTURE-2 — précédé de « Objet : », puisque c'est désormais le SEUL endroit où il s'affiche.
    expect(ligne(12)?.querySelector('.cnv-objet')?.textContent).toContain('Objet :');
    expect(ligne(12)?.querySelector('.cnv-objet')?.textContent).toContain('Fuite salle de bain');
    // ⚠️ « Re: » est retiré à l'AFFICHAGE seulement : l'objet enregistré, lui, n'est jamais réécrit.
    expect(ligne(13)?.querySelector('.cnv-objet')?.textContent).toContain('Devis plomberie');
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
    expect(ligne(11)?.querySelector('.cnv-objet')?.textContent).toContain('(sans objet)');
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT FIL-LECTURE-2 — UN SEUL FOND PAR LIGNE, ET « MODIFIER » UN RATTACHEMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 une ligne de message n’a qu’UN fond, sur toute sa largeur', () => {
  /**
   * 🔴 LE DÉFAUT VU PAR ARNO. Le fond de survol était posé sur le BOUTON de gauche, qui n'occupe pas toute la
   * largeur : la moitié gauche devenait grise, la moitié droite (statut, heure, étoile, ⋮) restait blanche. Deux
   * fonds sur une même ligne donnent à voir deux objets là où il n'y en a qu'un.
   *
   * On éprouve la STRUCTURE, pas la couleur : jsdom n'applique pas les feuilles de style, mais il dit qui contient
   * quoi. Le fond ne peut être unique que si la ligne et son coin vivent dans la MÊME enveloppe.
   */
  it('la ligne et ses boutons de droite sont dans la même enveloppe', async () => {
    await monter();
    const rangee = ligne(13)?.querySelector('.cnv-rangee');
    expect(rangee).not.toBeNull();
    expect(rangee?.querySelector('.cnv-ligne')).not.toBeNull();
    expect(rangee?.querySelector('.cnv-coin')).not.toBeNull();
  });

  /** Et l'enveloppe n'englobe PAS le message déplié : survoler le corps ne doit pas allumer la ligne de titre. */
  it('l’enveloppe s’arrête à l’en-tête : le corps du message est dehors', async () => {
    await monter();
    expect(ligne(13)?.querySelector('.cnv-rangee .cnv-detail')).toBeNull();
    expect(ligne(13)?.querySelector('.cnv-detail')).not.toBeNull();
  });

  /** 🔴 ET LE BOUTON N'A PLUS DE FOND PROPRE : deux règles de fond, c'est tôt ou tard deux fonds. */
  it('le fond de survol est écrit sur la rangée, jamais sur le bouton', async () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(css).toContain('.cnv-rangee:hover,.cnv-rangee:focus-within{background:var(--color-svv-field)}');
    expect(css).not.toContain('.cnv-ligne:hover');
  });

  /** La même règle dans la LISTE des mails, où le défaut se retrouvait à l'identique. */
  it('dans la liste de la boîte aussi, le fond est sur la rangée', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
    expect(css).toContain('.bte-li:hover,.bte-li:focus-within{background:var(--color-svv-field)}');
    expect(css).not.toContain('.bte-ligne:hover');
  });
});

describe('🔴 « Modifier » un rattachement : comprendre, puis remplacer', () => {
  const LIEN = {
    id: 77, messageId: 13, pieceId: null,
    cible: { sorte: 'proprietaire', cle: 'DENIS-PHILIPPE', id: null },
    libelle: 'DENIS Philippe (25)', origine: 'automatique', statut: 'confirme',
    confiance: 'certaine', regle: 'adresse de l’expéditeur', motif: 'p.denis@orange.fr reconnu',
    adresses: ['p.denis@orange.fr'], parUnHumain: false,
    creeLe: '2026-09-20T10:00:00Z', creePar: 'automatique', statutLe: null, statutPar: null,
  };
  /** Les appels d'écriture, dans l'ordre : c'est là qu'on lit ce que la validation a vraiment fait. */
  let ecritures: { methode: string; corps: Record<string, unknown> }[];

  beforeEach(() => {
    ecritures = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const methode = init?.method ?? 'GET';
      if (u.includes('/rattachements') && methode !== 'GET') {
        ecritures.push({ methode, corps: JSON.parse(String(init?.body ?? '{}')) });
        return { ok: true, json: async () => ({ ok: true, id: 78 }) } as unknown as Response;
      }
      if (u.includes('/rattachements')) {
        return { ok: true, json: async () => ({ etat: 'ok', data: { 13: [LIEN] } }) } as unknown as Response;
      }
      // ⚠️ DEUX CONSOMMATEURS de la même route : le SÉLECTEUR de cible interroge `?q=…`, et l'encart « qui nous
      //   écrit » interroge `?emails=…` avec une tout autre forme de réponse. Ne pas les distinguer faisait
      //   planter le rendu sur `indices.map is not a function` — une panne sans rapport avec ce qu'on éprouve.
      if (u.includes('/annuaire') && u.includes('emails=')) {
        return { ok: true, json: async () => ({ etat: 'ok', data: [] }) } as unknown as Response;
      }
      if (u.includes('/annuaire')) {
        return {
          ok: true,
          // ⚠️ LA FORME DE L'ANNUAIRE, pas celle des cibles : c'est `ciblesDeLaLigne` qui dérive les cibles d'une
          //   ligne de résultat. Un jeu d'essai « déjà transformé » faisait planter le sélecteur sur
          //   `l.proprietaireNom.trim is not a function` — une panne du jeu d'essai, pas du composant.
          json: async () => ({ etat: 'ok', data: { lignes: [
            {
              lotNumero: 'LOT-4RUEX', adresse: '4 rue X', commune: 'Puteaux',
              proprietaireCle: null, proprietaireNom: '', locataireId: null, locataireNom: null,
            },
          ], tronque: false } }),
        } as unknown as Response;
      }
      if (u.includes('/messages')) return { ok: true, json: async () => ({ fil: FIL, messages: MESSAGES, partis: [] }) } as unknown as Response;
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  const ouvrirModale = async () => {
    await monter();
    await cliquer(boutonPar(/^Modifier$/));
  };

  it('la fenêtre montre CE QUI A JUSTIFIÉ le lien : règle, adresses, origine, date', async () => {
    await ouvrirModale();
    const modale = container.querySelector('[role="dialog"]');
    expect(modale).not.toBeNull();
    const vu = modale?.textContent ?? '';
    expect(vu).toContain('DENIS Philippe (25)');
    expect(vu).toContain('adresse de l’expéditeur');
    expect(vu).toContain('p.denis@orange.fr');
    expect(vu).toContain('posé automatiquement');
    expect(vu).toContain('Propriétaire');
  });

  /** 🔴 UNE FENÊTRE OUVERTE PAR CURIOSITÉ NE DOIT PAS POUVOIR ÉCRIRE. */
  it('« Valider » est éteint tant que rien n’a changé, et « Annuler » n’écrit RIEN', async () => {
    await ouvrirModale();
    const valider = boutonPar(/^Valider la modification$/) as HTMLButtonElement;
    expect(valider.disabled).toBe(true);
    await cliquer(boutonPar(/^Annuler$/));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(ecritures).toHaveLength(0);
  });

  /**
   * 🔴 REMPLACER = RETIRER PUIS POSER, DANS CET ORDRE. L'ancien n'est jamais supprimé : il passe au statut
   * « retiré », reste consultable et se remet d'un clic. Le nouveau est posé à la main, donc confirmé.
   */
  it('valider retire l’ancien PUIS pose le nouveau, avec un motif qui dit pourquoi', async () => {
    await ouvrirModale();
    await cliquer(boutonPar(/Choisir une autre cible/));
    /**
     * ⚠️ IL FAUT TAPER, PUIS ATTENDRE. Le sélecteur ne cherche qu'à partir de DEUX caractères, et APRÈS une pause
     * (une requête par frappe ferait dix requêtes pour un mot de dix lettres). Sans ces deux étapes, la liste reste
     * vide et il n'y a rien à cocher — c'est ce qui faisait échouer ce test, et non le composant.
     */
    const champ = container.querySelector('input[aria-label="Chercher dans l’annuaire"]') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, '4 rue');
    await act(async () => { champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    await calmer();
    // Le sélecteur de cible COCHE puis VALIDE — c'est le même composant que « + Rattacher à… », et on s'en sert
    //   exactement comme une personne s'en sert : on coche la ligne, puis on confirme le choix.
    const coche = [...container.querySelectorAll('label')]
      .find((l) => /4 rue X/.test(l.textContent ?? ''))?.querySelector('input[type="checkbox"]');
    await cliquer(coche);
    await cliquer(boutonPar(/^Rattacher$/));
    const valider = () => boutonPar(/^Valider la modification$/) as HTMLButtonElement;
    expect(valider().disabled).toBe(false);
    await cliquer(valider());

    expect(ecritures).toHaveLength(2);
    expect(ecritures[0].methode).toBe('PATCH');
    expect(ecritures[0].corps).toMatchObject({ lienId: 77, statut: 'retire' });
    expect(String(ecritures[0].corps.motif)).toContain('4 rue X');
    expect(ecritures[1].methode).toBe('POST');
    expect(ecritures[1].corps).toMatchObject({ messageId: 13, cible: { sorte: 'lot', cle: 'LOT-4RUEX' } });
    expect(String(ecritures[1].corps.motif)).toContain('DENIS Philippe');
  });
});
