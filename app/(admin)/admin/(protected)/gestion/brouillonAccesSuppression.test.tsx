// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Conversation } from './Conversation';
import {
  MENTION_BROUILLON_VOIR_EN_BAS, MOTS_SUPPRIMER_BROUILLON, suiteSuppressionBrouillon,
} from '../../../../lib/gestion/brouillonEnAttente';
import { DELTA_BROUILLON_ABANDONNE } from '../../../../lib/gestion/compteursColonne';

/**
 * ══ 🔴🔴 LOT BROUILLON-ACCES-SUPPRESSION — OUVRIR UN BROUILLON, ET POUVOIR LE SUPPRIMER ══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (07/10/2026), POINT 1 : « Le clic sur la pastille “✎ Brouillon de réponse en attente — voir en bas”
 * ne fait rien. […] Comportement attendu au clic : le brouillon s'ouvre, déplié, sous le mail concerné, dans
 * l'éditeur de réponse habituel avec son contenu déjà enregistré. La page défile pour le centrer à l'écran, et le
 * curseur est placé dans le texte. La petite mention “✎ Brouillon” sous l'objet du message fait la même chose. »
 *
 * POINT 2 : « Un bouton “Supprimer le brouillon” dans l'éditeur du brouillon ouvert, à côté des boutons existants
 * (sans en retirer aucun) […] confirmation “Supprimer définitivement ce brouillon ?” avec Annuler et Supprimer.
 * […] Si la suppression dans Gmail échoue, afficher “Brouillon non supprimé dans Gmail, réessayer” et garder le
 * brouillon affiché. »
 *
 * ═══ 🔴🔴 LA CAUSE, REPRODUITE ICI TELLE QUELLE ════════════════════════════════════════════════════════════════
 *
 * La pastille n'appelait QUE `pied.current.scrollIntoView(…)`, et ce pied est l'enveloppe de l'éditeur — VIDE
 * tant que l'éditeur n'a pas été monté. Or l'éditeur ne se rouvrait que par `basculer`, c'est-à-dire en DÉPLIANT
 * un mail replié. Le mail qui porte le brouillon d'Arno est le DERNIER du fil : la conversation le déplie
 * d'office (`messagesDeplies`), sans passer par `basculer`. Aucun brouillon repris, pied de zéro pixel, clic mort.
 *
 * 🔴 CE FICHIER MONTE DONC LE BROUILLON SUR LE DERNIER MESSAGE, et c'est tout l'intérêt : le test du lot
 * précédent (`Conversation.brouillonEnHaut.test.tsx`) le pose sur un mail qu'il DÉPLIE lui-même, donc l'éditeur y
 * était déjà monté quand la pastille était cliquée — le défaut d'Arno passait sous son radar.
 *
 * 🔒 AUCUN ENVOI, AUCUNE DONNÉE RÉELLE, AUCUNE BASE : un fil inventé, des adresses inventées, `fetch` simulé. Le
 * brouillon 111 du fil 36558 n'est pas touché — il n'est même pas nommé ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MESSAGES = [
  {
    messageId: 21, de: 'monsieur.invente@exemple.test', deNom: 'Monsieur Inventé', sens: 'recu',
    recuLe: '2026-09-23T08:00:00Z', objet: 'Contrôle inventé', corps: 'Premier message.',
    extrait: 'Premier message.', automatique: false, pieces: [], horsFile: false, motifHorsFile: null,
    nonRemises: [], destA: null, destCc: null, destinatairesFondus: 'gestion@exemple.test', htmlSeul: false,
  },
  {
    /**
     * 🔴 LE MAIL QUI PORTE LE BROUILLON EST LE DERNIER DU FIL — comme chez Arno. C'est lui que la conversation
     * déplie d'office, SANS passer par le geste qui rouvrait le brouillon : c'est là que le clic mourait.
     */
    messageId: 22, de: 'madame.fictive@exemple.test', deNom: 'Madame Fictive', sens: 'recu',
    recuLe: '2026-10-06T17:30:00Z', objet: 'Re: Contrôle inventé', corps: 'Deuxième message.',
    extrait: 'Deuxième message.', automatique: false, pieces: [], horsFile: false, motifHorsFile: null,
    nonRemises: [], destA: null, destCc: null, destinatairesFondus: 'gestion@exemple.test', htmlSeul: false,
  },
];
const FIL = {
  filId: 9, objet: 'Contrôle inventé', etat: 'a_classer', reference: null,
  evenementId: null, evenementObjet: null,
};
/** Un brouillon VIVANT sur le DERNIER message — ni envoyé, ni abandonné : c'est le cas d'Arno. */
const BROUILLON = {
  id: 900, filId: 9, repondAMessageId: 22, voie: 'repondre',
  a: ['madame.fictive@exemple.test'], cc: [], cci: [],
  objet: 'Re: Contrôle inventé', corps: 'Le texte déjà enregistré',
  corpsHtml: '<p>Le texte déjà enregistré</p>', citation: null, majLe: '2026-10-06T19:23:00Z',
};
const CONTEXTE = {
  schemaPret: true, peutEnvoyer: false, jetonPresent: false, signature: '', nomExpediteur: 'GESTION',
  adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 10, piecesDisponibles: false,
};

let container: HTMLDivElement;
let root: Root;
/** Chaque défilement demandé : le calage seul nous intéresse (« centré à l'écran », Arno). */
let defilements: (string | undefined)[];
/** Tout ce qui part vers le serveur : l'adresse et le verbe. C'est ce qui prouve QUEL geste a été demandé. */
let appels: { url: string; methode: string }[];
/** Les comptes rendus rendus à l'écran parent, avec leurs deltas de compteurs. */
let gestes: { message: string; compteurs?: Record<string, number> }[];
/** Ce que le serveur répond au DELETE définitif. Chaque cas de ce fichier le règle avant de cliquer. */
let reponseSuppression: { statut: number; corps: Record<string, unknown> };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  defilements = []; appels = []; gestes = [];
  reponseSuppression = { statut: 200, corps: { ok: true, gmail: 'sans_objet', message: 'Brouillon supprimé définitivement.' } };
  /* ⚠️ JSDOM NE FOURNIT PAS `scrollIntoView` : on le pose, et il devient notre mouchard. */
  (Element.prototype as unknown as { scrollIntoView: (o?: ScrollIntoViewOptions) => void }).scrollIntoView =
    function (o?: ScrollIntoViewOptions) { defilements.push(o?.block); };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url: u, methode });
    if (u.includes('/gestion/brouillons') && methode === 'DELETE') {
      return {
        ok: reponseSuppression.statut < 400, status: reponseSuppression.statut,
        json: async () => reponseSuppression.corps,
      } as unknown as Response;
    }
    if (u.includes('/gestion/brouillons')) {
      return { ok: true, json: async () => ({ brouillons: [BROUILLON] }) } as unknown as Response;
    }
    if (u.includes('/gestion/suivi')) {
      return { ok: true, json: async () => ({ etat: 'ok', mails: [21, 22], periodes: [], exceptions: [] }) } as unknown as Response;
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
      filId: 9, maintenant: new Date('2026-10-07T12:00:00Z'), redaction: CONTEXTE,
      onGeste: (message: string, options?: { compteurs?: Record<string, number> }) => {
        gestes.push({ message, compteurs: options?.compteurs });
      },
    } as never));
  });
  await calmer();
};
const ligne = (id: number) => container.querySelector(`li[data-message="${id}"]`) as HTMLElement;
/**
 * ⚠️ ON ATTEND UNE IMAGE, POUR DE VRAI : les défilements partent dans un `requestAnimationFrame`, qui dans jsdom
 * est un minuteur — vider la file des microtâches ne le déclenche pas.
 */
const cliquer = async (e: Element) => {
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
};
/** Le bouton qui porte ce mot, où qu'il soit dans la zone donnée. */
const bouton = (dans: Element, mot: string): HTMLButtonElement | undefined =>
  [...dans.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(mot));
const editeur = () => ligne(22).querySelector('section.red');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LE DÉFAUT D'ARNO : SANS CORRECTIF, IL N'Y A AUCUN ÉDITEUR À ATTEINDRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① la pastille, sur un mail déplié d’office', () => {
  /**
   * 🔴 LA CAUSE, MESURÉE. Le mail est ouvert, la pastille est là (elle vient de la BASE), et il n'y a AUCUN
   * éditeur sous le message : c'est pour cela que le clic ne menait nulle part. Ce cas-ci décrit l'état d'AVANT
   * le clic — il doit rester vrai, sinon le test suivant ne prouverait rien.
   */
  it('🔴🔴 le mail est déplié, la pastille est là, et l’éditeur n’est PAS monté', async () => {
    await monter();
    expect(ligne(22).querySelector('.cnv-detail'), 'le dernier mail est déplié d’office').not.toBeNull();
    expect(bouton(ligne(22), MENTION_BROUILLON_VOIR_EN_BAS), 'la pastille est affichée').toBeDefined();
    expect(editeur(), 'et rien n’est encore ouvert sous le mail').toBeNull();
  });

  it('🔴🔴 le clic ouvre le brouillon, déplié, sous le mail, avec son contenu enregistré', async () => {
    await monter();
    defilements = [];
    await cliquer(bouton(ligne(22), MENTION_BROUILLON_VOIR_EN_BAS) as Element);
    const red = editeur();
    expect(red, 'l’éditeur est monté SOUS CE mail').not.toBeNull();
    /* 🔴 « avec son contenu déjà enregistré » (Arno) : c'est le texte du brouillon, pas un éditeur vide. */
    expect(red?.textContent).toContain('Le texte déjà enregistré');
    /* 🔴 ET IL EST DÉPLIÉ, pas rendu sous un `hidden` : l'enveloppe du pied ne le cache pas. */
    expect(red?.closest('[hidden]'), 'rien ne le masque').toBeNull();
    /* 🔴 « la page défile pour le centrer à l'écran » (Arno), mot pour mot. */
    expect(defilements, 'un défilement part').not.toHaveLength(0);
    expect(defilements).toContain('center');
  });

  /** 🔴 « le curseur est placé dans le texte » (Arno). */
  it('🔴🔴 et le curseur est dans la zone de texte', async () => {
    await monter();
    await cliquer(bouton(ligne(22), MENTION_BROUILLON_VOIR_EN_BAS) as Element);
    expect(editeur()?.contains(document.activeElement)).toBe(true);
  });

  /**
   * 🔴 UN DEUXIÈME CLIC FAIT QUELQUE CHOSE. L'éditeur est déjà monté : il n'y a rien à ouvrir, mais la promesse
   * reste la même — se montrer, centré, et prendre le curseur. Un bouton qui ne répond qu'une fois se lit comme
   * un bouton cassé, et c'est exactement le symptôme d'Arno.
   */
  it('🔴 un deuxième clic la rappelle encore, centrée', async () => {
    await monter();
    await cliquer(bouton(ligne(22), MENTION_BROUILLON_VOIR_EN_BAS) as Element);
    defilements = [];
    await cliquer(bouton(ligne(22), MENTION_BROUILLON_VOIR_EN_BAS) as Element);
    expect(defilements).toContain('center');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LA MENTION « ✎ Brouillon » SOUS L'OBJET FAIT LA MÊME CHOSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② la mention « ✎ Brouillon » de la ligne', () => {
  /**
   * ⚠️ ELLE N'EST VISIBLE QUE TANT QUE L'ÉDITEUR N'EST PAS SOUS LES YEUX (règle du lot BROUILLONS-GMAIL : la
   * mention se tait quand le brouillon est ouvert). On la clique donc AVANT toute ouverture — ce qui est
   * précisément le geste d'Arno.
   */
  it('🔴🔴 le clic sur la mention ouvre le brouillon, comme la pastille', async () => {
    await monter();
    const mention = ligne(22).querySelector('.cnv-brouillon');
    expect(mention, 'la mention « Brouillon » est sous l’objet').not.toBeNull();
    await cliquer(mention as Element);
    expect(editeur(), 'l’éditeur est monté').not.toBeNull();
    expect(editeur()?.textContent).toContain('Le texte déjà enregistré');
  });

  /**
   * 🔴 ET ELLE NE REPLIE PAS LE MAIL. La mention vit DANS la ligne, qui est le bouton de dépliage : sans tri du
   * clic, cliquer la mention aurait refermé le mail — c'est-à-dire fait le contraire de ce qu'Arno demande.
   */
  it('🔴🔴 et le mail reste déplié', async () => {
    await monter();
    await cliquer(ligne(22).querySelector('.cnv-brouillon') as Element);
    expect(ligne(22).querySelector('.cnv-detail')).not.toBeNull();
  });

  /** ⚠️ LE RESTE DE LA LIGNE GARDE SON GESTE : cliquer l'objet replie toujours le mail. */
  it('⚠️ un clic ailleurs sur la ligne replie toujours le mail', async () => {
    await monter();
    await cliquer(ligne(22).querySelector('.cnv-objet') as Element);
    expect(ligne(22).querySelector('.cnv-detail')).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 « SUPPRIMER LE BROUILLON » — LE BOUTON, SA CONFIRMATION, ET CE QU'IL NE RETIRE PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** On ouvre le brouillon par sa pastille — c'est le chemin du point 1, et le seul dont on a besoin ici. */
const ouvrirLeBrouillon = async () => {
  await monter();
  await cliquer(bouton(ligne(22), MENTION_BROUILLON_VOIR_EN_BAS) as Element);
};

describe('🔴🔴 ③ le bouton « Supprimer le brouillon »', () => {
  it('🔴🔴 il est dans l’éditeur, et AUCUN bouton existant n’a disparu', async () => {
    await ouvrirLeBrouillon();
    const red = editeur() as Element;
    expect(bouton(red, MOTS_SUPPRIMER_BROUILLON.bouton), 'le nouveau bouton').toBeDefined();
    /* 🔴 « sans en retirer aucun » (Arno) : les trois voisins sont toujours là, au même endroit. */
    expect(bouton(red, 'Envoyer'), '« Envoyer » est resté').toBeDefined();
    expect(bouton(red, 'Garder en brouillon'), '« Garder en brouillon » est resté').toBeDefined();
    expect(red.querySelector('.red-outil--rouge'), 'la corbeille des outils est restée').not.toBeNull();
  });

  it('🔴🔴 le clic POSE LA QUESTION, et ne supprime rien', async () => {
    await ouvrirLeBrouillon();
    appels = [];
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.bouton) as Element);
    const red = editeur() as Element;
    expect(red.textContent, 'la question d’Arno, mot pour mot').toContain(MOTS_SUPPRIMER_BROUILLON.question);
    expect(bouton(red, MOTS_SUPPRIMER_BROUILLON.annuler)).toBeDefined();
    expect(bouton(red, MOTS_SUPPRIMER_BROUILLON.confirmer)).toBeDefined();
    /* 🔴 RIEN N'EST PARTI VERS LE SERVEUR : une question n'est pas un geste. */
    expect(appels.filter((a) => a.methode === 'DELETE')).toHaveLength(0);
  });

  it('🔴 « Annuler » referme la question et laisse le brouillon ouvert', async () => {
    await ouvrirLeBrouillon();
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.bouton) as Element);
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.annuler) as Element);
    const red = editeur() as Element;
    expect(red.textContent).not.toContain(MOTS_SUPPRIMER_BROUILLON.question);
    expect(red.textContent).toContain('Le texte déjà enregistré');
    expect(appels.filter((a) => a.methode === 'DELETE')).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ 🔴🔴 APRÈS CONFIRMATION : LE BON GESTE, LE BON COMPTEUR, ET RIEN D'AUTRE DE TOUCHÉ
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ④ la suppression confirmée', () => {
  const confirmer = async () => {
    await ouvrirLeBrouillon();
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.bouton) as Element);
    appels = []; gestes = [];
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.confirmer) as Element);
  };

  it('🔴🔴 elle demande la suppression DÉFINITIVE du bon brouillon', async () => {
    await confirmer();
    const dels = appels.filter((a) => a.methode === 'DELETE');
    expect(dels, 'un seul appel, et c’est un DELETE').toHaveLength(1);
    expect(dels[0].url).toContain('id=900');
    /* 🔴 `definitif=1` DISTINGUE LES DEUX GESTES : sans lui, la route met à la corbeille (elle le faisait déjà,
       et elle continue — aucun appel existant ne change de sens). */
    expect(dels[0].url).toContain('definitif=1');
  });

  it('🔴🔴 le brouillon quitte l’écran, et le compteur « Brouillons » perd un', async () => {
    await confirmer();
    expect(editeur(), 'l’éditeur s’est fermé').toBeNull();
    expect(gestes.map((g) => g.compteurs)).toContainEqual(DELTA_BROUILLON_ABANDONNE);
    /* 🔴 ET LA CORBEILLE N'EN GAGNE PAS : le brouillon n'y va pas, il est supprimé. */
    expect(DELTA_BROUILLON_ABANDONNE).not.toHaveProperty('corbeille');
  });

  /**
   * 🔴🔴 « Le message reçu, ses pièces jointes, son statut et son classement ne sont jamais touchés » (Arno).
   * On le prouve par ce qui part vers le serveur : AUCUN appel n'écrit sur un message, une pièce, un statut ou un
   * rattachement. C'est la preuve la plus solide dont on dispose à l'écran — un geste qui n'est pas demandé ne
   * peut pas avoir lieu.
   */
  it('🔴🔴 et rien n’est écrit sur le message reçu, ses pièces, son statut ni son classement', async () => {
    await confirmer();
    const ecritures = appels.filter((a) => a.methode !== 'GET');
    for (const a of ecritures) {
      expect(a.url, `aucune écriture sur un message (${a.methode} ${a.url})`).not.toMatch(/\/gestion\/messages/);
      expect(a.url, `aucune écriture sur une pièce (${a.methode} ${a.url})`).not.toMatch(/\/gestion\/pieces/);
      expect(a.url, `aucun classement (${a.methode} ${a.url})`).not.toMatch(/\/gestion\/(rattachements|classement|etapes)/);
      expect(a.url, `aucune corbeille de message (${a.methode} ${a.url})`).not.toMatch(/\/gestion\/corbeille/);
    }
    /* ⚠️ ET LE MESSAGE EST TOUJOURS À L'ÉCRAN, avec son objet et son expéditeur : on n'a pas vidé la
       conversation. (L'objet est affiché NETTOYÉ de son « Re: » — c'est la règle du lot FIL-LECTURE.) */
    expect(ligne(22).textContent).toContain('Contrôle inventé');
    expect(ligne(22).textContent).toContain('Madame Fictive');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ 🔴🔴 L'ÉCHEC GMAIL GARDE LE BROUILLON, ET LE DIT AVEC LES MOTS D'ARNO
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ quand la suppression dans Gmail échoue', () => {
  it('🔴🔴 la phrase d’Arno s’affiche, et le brouillon reste sous les yeux', async () => {
    await ouvrirLeBrouillon();
    reponseSuppression = { statut: 502, corps: { erreur: 'Brouillon non supprimé dans Gmail, réessayer', gmail: 'echec' } };
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.bouton) as Element);
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.confirmer) as Element);
    const red = editeur();
    expect(red, '« garder le brouillon affiché » (Arno)').not.toBeNull();
    expect(red?.textContent).toContain('Brouillon non supprimé dans Gmail, réessayer');
    /* 🔴 ET SON TEXTE EST TOUJOURS LÀ : on peut réessayer, ou fermer sans rien perdre. */
    expect(red?.textContent).toContain('Le texte déjà enregistré');
  });

  /** 🔴 LE RÉSEAU TOMBÉ SE TRAITE PAREIL : on ne sait pas ce qui a été fait, donc on ne promet rien. */
  it('🔴 un serveur muet est traité comme un échec, pas comme un succès', async () => {
    await ouvrirLeBrouillon();
    global.fetch = vi.fn(async () => { throw new Error('réseau coupé'); }) as unknown as typeof fetch;
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.bouton) as Element);
    await cliquer(bouton(editeur() as Element, MOTS_SUPPRIMER_BROUILLON.confirmer) as Element);
    expect(editeur()).not.toBeNull();
    expect(editeur()?.textContent).toContain(suiteSuppressionBrouillon('echec').phrase);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔴 LE MODULE PUR, ET L'INVARIANT DE LA ROUTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ⑥ les mots et les règles, à leur source', () => {
  it('🔴 la suite du geste est décidée dans le module pur, et l’échec garde tout', async () => {
    expect(suiteSuppressionBrouillon('echec'))
      .toEqual({ phrase: 'Brouillon non supprimé dans Gmail, réessayer', garderAffiche: true });
    /* 🔴 `sans_objet` N'EST PAS UN ÉCHEC : il n'y a rien chez Google à supprimer, et le geste a bien eu lieu. */
    expect(suiteSuppressionBrouillon('sans_objet').garderAffiche).toBe(false);
    expect(suiteSuppressionBrouillon('supprime').garderAffiche).toBe(false);
  });

  /**
   * 🔴🔴 LA ROUTE N'EFFACE PAS EN BASE QUAND GMAIL A ÉCHOUÉ, et c'est lisible dans son texte : elle décide par
   * `suiteSuppressionBrouillon`, et elle rend AVANT d'appeler le dépôt. L'ordre est la règle — l'inverser
   * laisserait un brouillon chez Google sans sa ligne chez nous.
   */
  it('🔴🔴 la route tente Gmail AVANT d’effacer en base', () => {
    const src = readFileSync('app/(admin)/api/admin/gestion/brouillons/route.ts', 'utf8');
    const iGarde = src.indexOf('if (suite.garderAffiche)');
    const iEfface = src.indexOf('supprimerBrouillonDefinitivement(id)');
    expect(iGarde, 'le refus est écrit').toBeGreaterThan(0);
    expect(iEfface, 'la suppression est écrite').toBeGreaterThan(0);
    expect(iGarde).toBeLessThan(iEfface);
  });

  /**
   * 🔴🔴 ET LA SUPPRESSION DÉFINITIVE NE PASSE PAS PAR LE GESTE DE LA CORBEILLE. Deux fonctions distinctes au
   * dépôt : l'une DATE la ligne (réversible), l'autre l'EFFACE. Les réunir aurait fait du « définitivement » de
   * la confirmation une approximation — et c'est le genre de mot sur lequel on clique en s'y fiant.
   */
  it('🔴 le dépôt garde deux gestes distincts, et le définitif ne touche jamais un message', () => {
    const src = readFileSync('app/lib/gestion/redactionRepo.ts', 'utf8');
    expect(src).toContain('export async function abandonnerBrouillon');
    expect(src).toContain('export async function supprimerBrouillonDefinitivement');
    /* 🔴 LE CORPS DU GESTE DÉFINITIF : un DELETE sur gestion_brouillon, et rien d'autre. */
    const debut = src.indexOf('export async function supprimerBrouillonDefinitivement');
    const corps = src.slice(debut, src.indexOf('\n}', debut));
    const sql = corps.replace(/\s+/g, ' ');
    expect(sql).toContain('DELETE FROM gestion_brouillon');
    expect(sql).toContain('envoye_le IS NULL');
    expect(sql).not.toContain('gestion_message');
  });
});
