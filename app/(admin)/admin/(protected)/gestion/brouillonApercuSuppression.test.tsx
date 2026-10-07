// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { ApercuBrouillon } from './ApercuBrouillon';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import {
  brouillonMeneAUnMail, MOT_MODIFIER, MOT_VOIR_LE_MAIL,
} from '../../../../lib/gestion/apercuBrouillon';
import { MOTS_SUPPRIMER_BROUILLON } from '../../../../lib/gestion/brouillonEnAttente';

/**
 * ══ 🔴🔴 LOT BROUILLON-APERCU-SUPPRESSION — UNE QUESTION QU'ON VOIT, ET UN CHEMIN VERS LE MAIL ════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026) : « Au clic sur "Supprimer le brouillon", le bouton prend un contour bleu, un petit
 * trait rouge apparaît tout en bas de la fenêtre, et rien d'autre ne se passe. »
 *
 * ═══ 🔴🔴 LA CAUSE, MESURÉE DANS CHROME AVANT D'ÊTRE CORRIGÉE ══════════════════════════════════════════════════
 *
 * La confirmation était rendue DANS le contenu défilant de l'éditeur. Dans la fenêtre flottante, relevé au clic
 * sur « Supprimer le brouillon », la fenêtre étant descendue jusqu'à ses boutons :
 *     confirmation            y 820 → 880   (60 px de haut)
 *     zone visible du corps   y 202 → 828   (`.fre-corps`, overflow-y:auto)
 *     → 8 px visibles sur 60 — et ces 8 px sont le padding haut du bloc, qui porte son BORD GAUCHE ROUGE ;
 *     → « Annuler » et « Supprimer » (y 828 → 872) ENTIÈREMENT hors de la zone visible ;
 *     → le corps était à 249 de défilement pour un maximum de 330 : 81 px restaient, sans rien le dire.
 * Le « petit trait rouge » qu'Arno voyait ÉTAIT la confirmation, rognée à son liseré. Rien n'était cassé : la
 * question était posée hors du regard, et personne ne pouvait y répondre.
 *
 * ═══ CE QUE CE FICHIER ÉPROUVE ════════════════════════════════════════════════════════════════════════════════
 * Le VRAI éditeur, monté dans les trois formes (fenêtre flottante, réponse en place, plein écran), et la vraie
 * fenêtre d'aperçu. jsdom ne fait pas de mise en page : ce qu'on prouve ici, c'est que la confirmation n'est PLUS
 * un descendant de l'éditeur — donc qu'aucun conteneur de l'éditeur ne peut la rogner. La mesure, elle, a été
 * faite dans Chrome, et elle est consignée ci-dessus.
 *
 * 🔒 AUCUN ENVOI, AUCUNE BASE, AUCUN BROUILLON RÉEL : `fetch` est simulé et compté.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5, classementDisponible: true, interneDisponible: true,
};

const NEUF: BrouillonEcran = {
  id: 900, voie: 'nouveau', a: ['gabrielle@exemple.test'], cc: [], cci: [],
  objet: '_TEST aperçu', corps: 'Bonjour,', citation: null, destinatairesApproximatifs: false,
  filId: null, repondALeMessageId: null,
};
const REPONSE: BrouillonEcran = {
  ...NEUF, id: 901, voie: 'repondre', filId: 36575, repondALeMessageId: 57261,
  objet: 'Re: _TEST aperçu',
};

/** Ce que la route rend pour l'aperçu : un brouillon de RÉPONSE, donc lié à un mail. */
const LU_REPONSE = {
  id: 901, filId: 36575, repondAMessageId: 57261, voie: 'repondre',
  a: ['gabrielle@exemple.test'], cc: [], cci: [], objet: 'Re: _TEST aperçu',
  corps: 'Bonjour,', corpsHtml: null, citation: null, majLe: '2026-10-07T09:00:00Z',
};
/** Et un message NEUF, rattaché à aucun échange. */
const LU_NEUF = { ...LU_REPONSE, id: 900, filId: null, repondAMessageId: null, voie: 'nouveau' };

let hote: HTMLDivElement;
let racine: Root;
let appels: { url: string; methode: string }[];
let ferme = 0;
/** Ce que « Voir le mail » a demandé d'ouvrir. C'est la preuve que le clic mène à la bonne conversation. */
let ouvertures: { filId: number; messageId: number | null }[];
let reponseSuppression: { statut: number; corps: Record<string, unknown> };
let brouillonLu: Record<string, unknown>;

beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  appels = []; ferme = 0; ouvertures = []; brouillonLu = LU_REPONSE;
  reponseSuppression = { statut: 200, corps: { ok: true, gmail: 'sans_objet', message: 'Brouillon supprimé définitivement.' } };
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string }) => {
    const url = String(entree);
    const methode = (init?.method ?? 'GET').toUpperCase();
    appels.push({ url, methode });
    if (/\/brouillons\?id=\d+$/.test(url)) {
      return new Response(JSON.stringify({ brouillon: brouillonLu }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (/\/pieces/.test(url)) {
      return new Response(JSON.stringify({ etat: 'ok', pieces: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (methode === 'DELETE') {
      return new Response(JSON.stringify(reponseSuppression.corps),
        { status: reponseSuppression.statut, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, brouillon: { id: 4242 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => { act(() => { racine.unmount(); }); hote.remove(); vi.unstubAllGlobals(); });

const calmer = async (): Promise<void> => {
  await act(async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); });
};
const cliquer = async (el: Element | null | undefined): Promise<void> => {
  await act(async () => { (el as HTMLElement | null | undefined)?.click(); });
  await calmer();
};
const parMot = (mot: string): HTMLButtonElement | undefined => [...document.querySelectorAll('button')]
  .find((b) => (b.textContent ?? '').trim() === mot) as HTMLButtonElement | undefined;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LA CONFIRMATION EST VUE — DANS LES TROIS ÉDITEURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Les TROIS formes de l'éditeur, montées pour de vrai. `dansFenetre` distingue la fenêtre flottante (et son
 * plein écran, qui est la même avec une autre classe sur le cadre) de la réponse rendue en place sous un mail.
 */
const EDITEURS: readonly { nom: string; dansFenetre: boolean; b: BrouillonEcran }[] = [
  { nom: 'fenêtre flottante', dansFenetre: true, b: NEUF },
  { nom: 'réponse dans une conversation', dansFenetre: false, b: REPONSE },
  { nom: 'plein écran', dansFenetre: true, b: REPONSE },
];

let courant: BrouillonEcran;
const monterEditeur = async (depart: BrouillonEcran, dansFenetre: boolean): Promise<void> => {
  courant = depart;
  const rendre = (): void => { racine.render(createElement(Redaction, {
    dansFenetre, brouillon: courant, contexte: CONTEXTE,
    onChange: (b: BrouillonEcran) => { courant = b; rendre(); },
    onFerme: () => { ferme += 1; }, onEnvoye: () => {}, onGeste: () => {},
  } as never)); };
  await act(async () => { rendre(); });
  await calmer();
};
const confirmation = (): Element | null => document.querySelector('.red-conf');
const dansLaFenetre = (mot: string): HTMLButtonElement | undefined => {
  const p = confirmation();
  return p === null ? undefined : [...p.querySelectorAll('button')]
    .find((b) => (b.textContent ?? '').trim() === mot) as HTMLButtonElement | undefined;
};

describe('🔴🔴 ① la confirmation est hors de portée de tout défilement', () => {
  for (const { nom, dansFenetre, b } of EDITEURS) {
    it(`🔴🔴 ${nom} : la question est rendue HORS de l’éditeur`, async () => {
      await monterEditeur(b, dansFenetre);
      await cliquer(parMot(MOTS_SUPPRIMER_BROUILLON.bouton));
      const fen = confirmation();
      expect(fen, 'la fenêtre de confirmation existe').not.toBeNull();
      expect(fen?.textContent).toContain(MOTS_SUPPRIMER_BROUILLON.question);
      /**
       * 🔴🔴 LA PREUVE QUI COMPTE : elle n'est descendante NI de l'éditeur, NI du conteneur qui le porte. Aucun
       * `overflow`, aucun `transform` d'ancêtre ne peut donc la rogner — c'était toute la cause.
       */
      const editeur = hote.querySelector('section.red');
      expect(editeur).not.toBeNull();
      expect(editeur?.contains(fen as Node)).toBe(false);
      expect(hote.contains(fen as Node)).toBe(false);
      /* 🔴 ET ELLE PORTE SES DEUX BOUTONS, lisibles et atteignables. */
      expect(dansLaFenetre(MOTS_SUPPRIMER_BROUILLON.annuler)).toBeDefined();
      expect(dansLaFenetre(MOTS_SUPPRIMER_BROUILLON.confirmer)).toBeDefined();
    });
  }

  /**
   * 🔴 LE VOILE COUVRE L'ÉCRAN ENTIER (`position:fixed; inset:0`) : c'est lui qui garantit que la fenêtre est
   * centrée sur la VUE, et non sur un morceau d'éditeur. On lit la règle dans la feuille, faute de mise en page.
   */
  it('🔴 la fenêtre est posée sur un voile fixe, au-dessus de tout', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    expect(src).toContain('.red-conf-voile{position:fixed;inset:0;z-index:95;');
    expect(src).toContain('align-items:center;justify-content:center;');
    /* 🔴 ET LE PORTAIL VA DANS `.svv-adm-root`, qui porte `data-theme` : dans le `body`, la fenêtre serait
       arrivée en thème Clair au milieu d'un écran Sombre. */
    expect(src).toContain('createPortal(fenetre, hoteDeLaBulle())');
  });

  /** 🔴 ÉCHAP ANNULE, et rien n'est supprimé. */
  it('🔴 Échap referme la fenêtre sans rien supprimer', async () => {
    await monterEditeur(NEUF, true);
    await cliquer(parMot(MOTS_SUPPRIMER_BROUILLON.bouton));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await calmer();
    expect(confirmation()).toBeNull();
    expect(appels.filter((a) => a.methode === 'DELETE')).toHaveLength(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 ET LA SUPPRESSION ABOUTIT, DANS LES TROIS ÉDITEURS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② « Supprimer » supprime', () => {
  for (const { nom, dansFenetre, b } of EDITEURS) {
    it(`🔴🔴 ${nom} : le brouillon part, et l’éditeur se ferme`, async () => {
      await monterEditeur(b, dansFenetre);
      await cliquer(parMot(MOTS_SUPPRIMER_BROUILLON.bouton));
      await cliquer(dansLaFenetre(MOTS_SUPPRIMER_BROUILLON.confirmer));
      const dels = appels.filter((a) => a.methode === 'DELETE');
      expect(dels).toHaveLength(1);
      expect(dels[0].url).toContain(`id=${b.id}`);
      expect(dels[0].url).toContain('definitif=1');
      /* 🔴 LA FENÊTRE SE REFERME ET L'ÉDITEUR DEMANDE SA FERMETURE : c'est `onFerme` qui met à jour le compteur
         « Brouillons », le bloc de la recherche et le picto ✎ (lot BROUILLON-ACCES-SUPPRESSION). */
      expect(confirmation()).toBeNull();
      expect(ferme).toBe(1);
    });
  }

  /**
   * 🔴🔴 UN ÉCHEC GARDE LA QUESTION OUVERTE, AVEC SON MOTIF. Arno (lot précédent) : « afficher "Brouillon non
   * supprimé dans Gmail, réessayer" et garder le brouillon affiché ». Le motif est DANS la fenêtre, donc vu —
   * et « Supprimer » est à la même place : réessayer est un seul clic.
   */
  it('🔴🔴 un échec laisse la question posée, avec son motif', async () => {
    await monterEditeur(NEUF, true);
    reponseSuppression = {
      statut: 502, corps: { erreur: 'Brouillon non supprimé dans Gmail, réessayer', gmail: 'echec' },
    };
    await cliquer(parMot(MOTS_SUPPRIMER_BROUILLON.bouton));
    await cliquer(dansLaFenetre(MOTS_SUPPRIMER_BROUILLON.confirmer));
    expect(confirmation()?.textContent).toContain('Brouillon non supprimé dans Gmail, réessayer');
    expect(dansLaFenetre(MOTS_SUPPRIMER_BROUILLON.confirmer), 'on peut réessayer').toBeDefined();
    /* 🔴 ET LE BROUILLON RESTE AFFICHÉ DERRIÈRE, intact. */
    expect(hote.querySelector('section.red')).not.toBeNull();
    expect(ferme).toBe(0);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 « VOIR LE MAIL » DANS L'APERÇU
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const monterApercu = async (avecGeste = true): Promise<void> => {
  await act(async () => {
    racine.render(createElement(ApercuBrouillon, {
      brouillonId: 901,
      onFermer: () => { ferme += 1; },
      onModifier: () => {},
      onVoirLeMail: avecGeste
        ? (filId: number, messageId: number | null) => { ouvertures.push({ filId, messageId }); }
        : undefined,
    } as never));
  });
  await calmer();
};

describe('🔴🔴 ③ « Voir le mail »', () => {
  /** 🔴 LA RÈGLE, À SA SOURCE : c'est l'échange qui décide, et lui seul. */
  it('🔴🔴 un brouillon mène à un mail dès qu’il a un échange', () => {
    expect(brouillonMeneAUnMail({ filId: 36575, repondAMessageId: 57261 })).toBe(true);
    /* 🔴 UN ÉCHANGE SANS MESSAGE PRÉCIS SUFFIT : la conversation dépliera son dernier message. */
    expect(brouillonMeneAUnMail({ filId: 36575, repondAMessageId: null })).toBe(true);
    /* 🔴 ET UN MESSAGE NEUF NE MÈNE NULLE PART : « seul "Modifier" reste » (Arno). */
    expect(brouillonMeneAUnMail({ filId: null, repondAMessageId: null })).toBe(false);
  });

  it('🔴🔴 il est là pour un brouillon de réponse, À GAUCHE de « Modifier »', async () => {
    await monterApercu();
    const voir = parMot(MOT_VOIR_LE_MAIL);
    const modifier = parMot(MOT_MODIFIER);
    expect(voir, '« Voir le mail » est rendu').toBeDefined();
    expect(modifier).toBeDefined();
    /* 🔴 « À GAUCHE » SE LIT DANS L'ORDRE DU DOCUMENT : c'est lui qui pose les deux boutons dans la rangée. */
    const avant = (voir as Node).compareDocumentPosition(modifier as Node) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(avant).toBeGreaterThan(0);
  });

  it('🔴🔴 il est ABSENT pour un message neuf rattaché à aucun mail', async () => {
    brouillonLu = LU_NEUF;
    await monterApercu();
    expect(parMot(MOT_VOIR_LE_MAIL)).toBeUndefined();
    /* 🔴 ET « MODIFIER » RESTE : rien n'est retiré, c'est la demande d'Arno mot pour mot. */
    expect(parMot(MOT_MODIFIER)).toBeDefined();
  });

  it('🔴🔴 le clic ferme l’aperçu et ouvre la conversation sur le bon message', async () => {
    await monterApercu();
    await cliquer(parMot(MOT_VOIR_LE_MAIL));
    expect(ferme).toBe(1);
    expect(ouvertures).toEqual([{ filId: 36575, messageId: 57261 }]);
  });

  /**
   * 🔴 SANS MESSAGE PRÉCIS, ON PASSE `null` — ET C'EST SIGNIFIANT. La conversation retombe alors sur son DERNIER
   * message, déplié : c'est la règle de `messagesDeplies`, et la phrase d'Arno, mot pour mot. On n'invente rien.
   */
  it('🔴 sans message précis, la conversation s’ouvre sur son dernier', async () => {
    brouillonLu = { ...LU_REPONSE, repondAMessageId: null };
    await monterApercu();
    await cliquer(parMot(MOT_VOIR_LE_MAIL));
    expect(ouvertures).toEqual([{ filId: 36575, messageId: null }]);
  });

  /** ⚠️ UN ÉCRAN QUI NE SAIT PAS OUVRIR UNE CONVERSATION NE PROPOSE PAS D'Y ALLER. */
  it('⚠️ sans geste branché, le bouton n’est pas rendu', async () => {
    await monterApercu(false);
    expect(parMot(MOT_VOIR_LE_MAIL)).toBeUndefined();
    expect(parMot(MOT_MODIFIER)).toBeDefined();
  });

  /** 🔴 ET L'ÉCRAN QUI MONTE L'APERÇU LE BRANCHE SUR SA PORTE HABITUELLE. */
  it('🔴 l’écran « boîte » ouvre la conversation par sa porte ordinaire', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    expect(src).toContain('onVoirLeMail={(filId, messageId) => onOuvrir(filId, messageId)}');
  });
});
