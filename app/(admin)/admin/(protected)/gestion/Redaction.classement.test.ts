// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Redaction, type BrouillonEcran, type ContexteRedactionEcran } from './Redaction';
import { MOTIF_NON_CLASSE } from '../../../../lib/gestion/classementAvantEnvoi';

/**
 * ══ 🔴🔴 LOT CLASSER-AVANT-ENVOI — LA FENÊTRE DE RÉDACTION, REJOUÉE EN ENTIER ═════════════════════════════════
 *
 * ARNO (01/10/2026), deux demandes qui tiennent ensemble :
 *   ① « Saisir ou valider une adresse dans À / Cc / Cci n'ouvre PLUS la modale “Rattacher ce mail à…”. On écrit
 *      son mail normalement. Les propositions continuent d'être calculées en arrière-plan à partir des
 *      destinataires (pour être prêtes et pré-cochées), mais la modale ne s'ouvre qu'au clic sur le gros bouton
 *      rouge “Rattacher”. »
 *   ② « “Envoyer” est inactif tant que le bloc “Classer ce mail” n'est pas une case VERTE. Infobulle et ligne
 *      rouge sous le bouton. […] Brouillons : on peut toujours enregistrer, fermer ou rouvrir sans classer.
 *      Seul l'envoi est bloqué. »
 *
 * ⚠️ CE FICHIER MONTE LE VRAI ÉDITEUR et compte les requêtes. Un test qui chercherait les mots dans le source
 * prouverait qu'ils sont écrits, pas qu'une fenêtre reste fermée ni qu'un bouton reste gris.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONTEXTE: ContexteRedactionEcran = {
  schemaPret: true, peutEnvoyer: true, jetonPresent: true, piecesDisponibles: false,
  signature: 'Service Gestion', nomExpediteur: 'Gestion', adresseGestion: 'gestion@exemple.test',
  delaiAnnulationS: 5,
  // 🔴 LE BLOC « Classer ce mail » EST RENDU : sans cette sonde, il n'existe pas, et l'envoi n'est pas bloqué.
  classementDisponible: true, interneDisponible: true,
};

const NEUF: BrouillonEcran = {
  id: null, voie: 'nouveau', a: ['gabrielle@exemple.test'], cc: [], cci: [], objet: 'Quittance de septembre',
  corps: 'Bonjour,\n\nService Gestion', citation: null, destinatairesApproximatifs: false,
  filId: null, repondALeMessageId: null,
};

const LOT_421 = { sorte: 'lot' as const, cle: '421', id: null, libelle: '28 av. Marceau — lot 421' };

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string }) => {
    const url = String(entree);
    appels.push({ url, methode: init?.method ?? 'GET' });
    if (/\/classement$/.test(url)) {
      return new Response(JSON.stringify({
        etat: 'ok',
        contexte: {
          disponible: true, interneDabord: false,
          biens: [{ cle: '421', libelle: '28 av. Marceau — lot 421', motif: 'locataire de ce bien', recommande: true, parties: [] }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, brouillon: { id: 4242 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  document.getSelection = () => null as unknown as Selection;
});
afterEach(() => {
  act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); }); };
const avancer = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await calmer(); };

let courant: BrouillonEcran;
const monter = async (depart: BrouillonEcran = NEUF, ctx: ContexteRedactionEcran = CONTEXTE) => {
  courant = depart;
  const rendre = () => root.render(createElement(Redaction, {
    dansFenetre: true, brouillon: courant, contexte: ctx,
    onChange: (b: BrouillonEcran) => { courant = b; rendre(); },
    onFerme: () => {}, onEnvoye: () => {}, onGeste: () => {},
  } as never));
  await act(async () => { rendre(); });
  await calmer();
};

const boutonEnvoyer = () => [...container.querySelectorAll('button')]
  .find((b) => /^Envoyer/.test((b.textContent ?? '').trim())) as HTMLButtonElement;
const caseDe = (mot: RegExp) => [...container.querySelectorAll('.ccl-case')]
  .find((c) => mot.test(c.textContent ?? '')) as HTMLElement | undefined;
const modaleOuverte = () => container.querySelector('.rec-voile') !== null;
const lecturesClassement = () => appels.filter((a) => /\/classement$/.test(a.url)).length;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① LA MODALE NE S’OUVRE PLUS TOUTE SEULE', () => {
  /**
   * 🔴 LE CŒUR DE LA DEMANDE. Avant ce lot, un effet ouvrait la fenêtre dès qu'un nouvel ensemble de
   * destinataires était validé : on écrivait un mail et une modale surgissait au milieu de l'écran.
   */
  it('🔴🔴 une adresse validée n’ouvre AUCUNE fenêtre', async () => {
    await monter();
    await avancer(2000);
    expect(modaleOuverte()).toBe(false);
  });

  it('🔴🔴 ni une deuxième adresse, ni un changement de destinataires', async () => {
    await monter();
    await act(async () => { courant = { ...courant, cc: ['syndic@exemple.test'] }; });
    await monter(courant);
    await avancer(2000);
    expect(modaleOuverte()).toBe(false);
  });

  /** 🔴 « la modale ne s'ouvre qu'au clic sur le gros bouton rouge “Rattacher” ». */
  it('🔴 le clic sur « Rattacher » l’ouvre — et c’est le seul chemin', async () => {
    await monter();
    await avancer(2000);
    await act(async () => { (caseDe(/Rattacher/) as HTMLButtonElement).click(); });
    await calmer();
    expect(modaleOuverte()).toBe(true);
  });

  /**
   * 🔴 LA CONTREPARTIE : « Les propositions continuent d'être calculées en arrière-plan à partir des
   * destinataires ». Sans elle, le clic sur « Rattacher » ouvrirait une fenêtre vide le temps d'une lecture.
   */
  it('🔴🔴 les propositions sont LUES en arrière-plan, sans ouvrir la fenêtre', async () => {
    await monter();
    expect(lecturesClassement()).toBe(0); // pas avant le délai de calme
    await avancer(1000);
    expect(lecturesClassement()).toBeGreaterThan(0);
    expect(modaleOuverte()).toBe(false);
  });

  /** ⚠️ SANS DESTINATAIRE, ON NE DEMANDE RIEN : le moteur n'aurait rien à déduire. */
  it('⚠️ aucun destinataire ⇒ aucune lecture', async () => {
    await monter({ ...NEUF, a: [] });
    await avancer(2000);
    expect(lecturesClassement()).toBe(0);
  });
});

describe('🔴🔴 ② « ENVOYER » EST INACTIF TANT QUE LE MAIL N’EST PAS CLASSÉ', () => {
  it('🔴🔴 rien n’est choisi : le bouton est gris, et la ligne rouge dit pourquoi', async () => {
    await monter();
    expect(boutonEnvoyer().disabled).toBe(true);
    const ligne = container.querySelector('.red-non-classe');
    expect(ligne?.textContent).toBe(MOTIF_NON_CLASSE);
    expect(ligne?.textContent).toBe('Classez ce mail avant de l’envoyer : Rattacher ou Interne.');
  });

  /** 🔴 « Infobulle ET ligne rouge » — les deux, parce qu'au doigt une infobulle n'existe pas. */
  it('🔴 l’infobulle porte le même motif, et elle survit au bouton désactivé', async () => {
    await monter();
    expect(boutonEnvoyer().getAttribute('title')).toBe(MOTIF_NON_CLASSE);
    // L'enveloppe la porte aussi : plusieurs navigateurs n'affichent plus l'infobulle d'un bouton inerte.
    expect(container.querySelector('.red-envoi')?.getAttribute('title')).toBe(MOTIF_NON_CLASSE);
    // Et le lecteur d'écran l'entend en atteignant le bouton.
    expect(boutonEnvoyer().getAttribute('aria-describedby')).toBe('red-non-classe');
  });

  it('🔴🔴 « Interne » DÉBLOQUE l’envoi', async () => {
    await monter();
    await act(async () => { (caseDe(/Interne/) as HTMLButtonElement).click(); });
    await calmer();
    expect(boutonEnvoyer().disabled).toBe(false);
    expect(container.querySelector('.red-non-classe')).toBeNull();
  });

  it('🔴🔴 « Rattaché » avec au moins un bien DÉBLOQUE l’envoi', async () => {
    await monter({ ...NEUF, cibles: [LOT_421] });
    expect(boutonEnvoyer().disabled).toBe(false);
    expect(container.querySelector('.red-non-classe')).toBeNull();
  });

  /**
   * 🔴 ET DÉFAIRE LE CLASSEMENT REBLOQUE L'ENVOI : l'état revient aux deux boutons, l'obligation avec lui.
   *
   * ⚠️ LE LIEN « Réinitialiser » A DISPARU au lot BLOC-CLASSER-COMPACT (accord d'Arno) : il faisait doublon
   * avec la case verte, devenue cliquable. On éprouve donc le geste qui reste — et c'est le même chemin, la
   * propriété `onReinitialiser`, que la case appelle.
   */
  it('🔴 défaire le classement rebloque l’envoi', async () => {
    await monter({ ...NEUF, interne: true });
    expect(boutonEnvoyer().disabled).toBe(false);
    await act(async () => { (caseDe(/Interne/) as HTMLButtonElement).click(); });
    await calmer();
    expect(boutonEnvoyer().disabled).toBe(true);
    expect(container.querySelector('.red-non-classe')?.textContent).toBe(MOTIF_NON_CLASSE);
  });

  /** 🔴🔴 ET IL N'Y A PLUS DE LIEN « Réinitialiser » : une seule porte pour défaire, la case elle-même. */
  it('🔴🔴 le lien « Réinitialiser » a disparu de la fenêtre de rédaction', async () => {
    await monter({ ...NEUF, cibles: [LOT_421] });
    expect([...container.querySelectorAll('button')]
      .some((b) => (b.textContent ?? '').trim() === 'Réinitialiser')).toBe(false);
  });

  /**
   * 🔴🔴 LE GARDE-FOU QUI ÉVITE UNE FENÊTRE INUTILISABLE. Sans la migration 265, le bloc « Classer ce mail »
   * n'est pas rendu du tout (règle du lot REDACTION-GMAIL). Bloquer l'envoi sur un bloc ABSENT exigerait un
   * classement qu'aucun geste à l'écran ne permettrait de faire.
   */
  it('🔴🔴 sans le bloc « Classer ce mail », l’envoi n’est PAS bloqué', async () => {
    await monter(NEUF, { ...CONTEXTE, classementDisponible: false });
    expect(container.querySelector('.ccl')).toBeNull();
    expect(boutonEnvoyer().disabled).toBe(false);
  });
});

/**
 * ══ 🔴🔴 ③ RÉPONDRE DANS UNE CONVERSATION DÉJÀ CLASSÉE ═════════════════════════════════════════════════════
 *
 * « si la conversation est déjà rattachée, interne ou hors gestion, la case est pré-remplie en vert dans le même
 * état (avec Réinitialiser). Sinon, même obligation que pour un nouveau message. »
 *
 * ⚠️ C'est `Conversation` qui CALCULE l'héritage (module pur `classementHerite`, éprouvé à part) ; ici on
 * vérifie que la fenêtre, recevant un brouillon déjà classé, est bien verte et envoyable d'emblée.
 */
describe('🔴🔴 ③ une réponse dans un fil déjà classé part sans rien reclasser', () => {
  const REPONSE: BrouillonEcran = {
    ...NEUF, voie: 'repondre', filId: 36575, repondALeMessageId: 57261, objet: 'Re: Quittance de septembre',
  };

  it('🔴 fil RATTACHÉ : case verte « Rattaché », envoi possible tout de suite', async () => {
    await monter({ ...REPONSE, cibles: [LOT_421] });
    expect(caseDe(/Rattaché/)?.className).toContain('ccl-case--verte');
    expect(boutonEnvoyer().disabled).toBe(false);
  });

  it('🔴 fil INTERNE : case verte « Interne », envoi possible tout de suite', async () => {
    await monter({ ...REPONSE, interne: true });
    expect(caseDe(/Interne/)?.className).toContain('ccl-case--verte');
    expect(boutonEnvoyer().disabled).toBe(false);
  });

  it('🔴 message HORS GESTION : case verte « Hors gestion », envoi possible tout de suite', async () => {
    await monter({ ...REPONSE, horsGestion: true });
    expect(caseDe(/Hors gestion/)?.className).toContain('ccl-case--verte');
    expect(boutonEnvoyer().disabled).toBe(false);
  });

  /** 🔴 « Sinon, même obligation que pour un nouveau message. » */
  it('🔴 fil NON classé : même obligation que pour un message neuf', async () => {
    await monter(REPONSE);
    expect(boutonEnvoyer().disabled).toBe(true);
    expect(container.querySelector('.red-non-classe')?.textContent).toBe(MOTIF_NON_CLASSE);
  });

  /** 🔴 L'héritage se défait comme un choix fait à la main : d'un clic sur la case verte. */
  it('🔴 l’héritage « hors gestion » se défait d’un clic sur la case', async () => {
    await monter({ ...REPONSE, horsGestion: true });
    await act(async () => { (caseDe(/Hors gestion/) as HTMLButtonElement).click(); });
    await calmer();
    // ⚠️ `button.ccl-case` : depuis le lot AUCUNE-PROPOSITION-ET-ANIMATION-INVERSE, la case verte qui s'en va
    //   reste 560 ms à l'écran sous forme de FANTÔME — qui porte la même classe, mais n'est pas un bouton.
    expect([...container.querySelectorAll('button.ccl-case')]).toHaveLength(2);
    expect([...container.querySelectorAll('button.ccl-case')].map((b) => b.textContent ?? '').join(' '))
      .not.toContain('Hors gestion');
  });
});

/**
 * ══ 🔴🔴 ④ LES BROUILLONS NE SONT JAMAIS BLOQUÉS ═══════════════════════════════════════════════════════════
 *
 * « Brouillons : on peut toujours enregistrer, fermer ou rouvrir sans classer. Seul l'envoi est bloqué. »
 *
 * 🔴 C'EST LA MOITIÉ QUI REND LA RÈGLE VIVABLE. Sans elle, commencer un mail sans savoir encore à quel bien il
 * se rattache obligerait à trancher avant d'avoir écrit — ou à perdre ce qu'on vient d'écrire.
 */
describe('🔴🔴 ④ un brouillon NON classé s’enregistre, se garde et se jette', () => {
  it('🔴🔴 il s’enregistre tout seul, sans aucun classement', async () => {
    await monter();
    await act(async () => { courant = { ...courant, objet: 'Quittance de septembre — relance' }; });
    await monter(courant);
    await avancer(4000);
    const posts = appels.filter((a) => a.methode === 'POST' && /\/brouillons$/.test(a.url));
    expect(posts.length).toBeGreaterThan(0);
    // …et l'envoi, lui, reste bien bloqué : c'est la seule chose que ce lot interdit.
    expect(boutonEnvoyer().disabled).toBe(true);
  });

  it('🔴 « Garder en brouillon » n’est JAMAIS désactivé', async () => {
    await monter();
    const garder = [...container.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').trim() === 'Garder en brouillon') as HTMLButtonElement;
    expect(garder.disabled).toBe(false);
  });

  it('🔴 la corbeille non plus', async () => {
    await monter();
    const jeter = container.querySelector('.red-outil--rouge') as HTMLButtonElement;
    expect(jeter.disabled).toBe(false);
  });
});
