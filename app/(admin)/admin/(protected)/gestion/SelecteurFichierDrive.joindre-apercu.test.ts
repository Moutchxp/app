// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SelecteurFichierDrive } from './SelecteurFichierDrive';

/**
 * ══ 🔴🔴 LOT RENOMMAGE-UN-SEUL-NOM, POINT 4 — « JOINDRE CE FICHIER » EST UN GESTE D'ÉCRITURE ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026) : « le bouton “Joindre ce fichier” apparaît dans la visionneuse pendant la LECTURE
 * d'un mail reçu. Même règle que le menu clic droit : il n'apparaît QUE si la fenêtre a été ouverte depuis un
 * message EN COURS D'ÉCRITURE (nouveau, réponse, transfert, brouillon). »
 *
 * 🔴 IL Y ÉTAIT, ET IL NE FAISAIT RIEN. Le bouton appelle `onJoindre`, qui appelle `choisir`, qui rend la main
 * aussitôt si `onChoisir` est absent — et `onChoisir` n'est fourni QUE par l'éditeur de mail. En mode « ranger »,
 * le clic partait donc dans le vide : exactement le défaut des entrées « Joindre au message » et « Insérer un
 * lien » du menu contextuel, corrigé au lot précédent. Même cause, même règle, même mot.
 *
 * 🔴 LE MOT, JUSTEMENT : `mode === 'joindre'` EST « la fenêtre a été ouverte depuis un message qu'on rédige ».
 * C'est `Redaction.tsx` et lui seul qui le passe ; `PiecesJointes.tsx` et `Conversation.tsx` passent « ranger ».
 * Ce n'est donc pas une approximation de la demande d'Arno — c'est sa formulation exacte, en code.
 *
 * ⚠️ CE FICHIER MONTE LES DEUX MODES, et c'est le seul moyen de prouver la règle : un test qui ne verrait que
 * l'absence prouverait qu'on a caché un bouton, pas qu'on l'a gardé là où il sert.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Ce que l'éditeur de mail a reçu. En mode « ranger », il n'existe pas — et c'est tout le sujet. */
let choisis: unknown[];

const fichier = (id: string, nom: string, dossier = false) => ({
  id, nom, typeMime: dossier ? 'application/vnd.google-apps.folder' : 'application/pdf',
  tailleOctets: dossier ? null : 2048, modifieLe: '2026-09-15T08:00:00Z',
  lien: `https://drive.google.com/${id}`, dossier, parentId: 'D1',
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { globalThis.sessionStorage?.clear(); globalThis.localStorage?.clear(); } catch { /* tout part neuf */ }
  choisis = [];
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    if (url.includes('/pieces-recentes')) {
      return new Response(JSON.stringify({ etat: 'ok', disponible: false, lignes: [] }), { status: 200 });
    }
    if (url.includes('/dossier-du-bien')) {
      return new Response(JSON.stringify({ etat: 'ok', biens: [], dossiers: [] }), { status: 200 });
    }
    if (url.includes('/drive/dossiers')) {
      return new Response(JSON.stringify({ etat: 'ok', mode: 'accueil', dernier: null, recents: [] }), { status: 200 });
    }
    if (url.includes('/drive/apercu')) {
      return new Response(JSON.stringify({
        etat: 'ok', nom: 'bail.pdf', sorte: 'pdf', typeMime: 'application/pdf',
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      etat: 'ok', joindreAutorise: true, motifRefus: null, creerAutorise: false, motifCreation: null,
      fichiers: [fichier('d1', 'Artisans', true), fichier('f1', 'bail.pdf')],
    }), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };

/** La fenêtre ouverte depuis un message QU'ON RÉDIGE : `onChoisir` existe, et le mode le dit. */
const monterEnEcriture = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'joindre', onChoisir: (c: unknown) => { choisis.push(c); }, onFermer: () => {},
    } as never));
  });
  await calmer();
};

/** La fenêtre ouverte depuis un mail qu'on LIT et qu'on classe : aucun message à remplir. */
const monterEnLecture = async () => {
  await act(async () => {
    root.render(createElement(SelecteurFichierDrive, {
      mode: 'ranger', messageId: 900, filId: 42,
      pieces: [{ pieceId: 11, nom: '0836_001.pdf', tailleOctets: 84_213, typeMime: 'application/pdf' }],
      onRangement: () => {}, onFermer: () => {},
    } as never));
  });
  await calmer();
};

const ligneDe = (nom: string) =>
  [...container.querySelectorAll('.sfd-ligne')].find((x) => (x.textContent ?? '').includes(nom));
const ouvrirApercuDe = async (nom: string) => {
  await act(async () => { ligneDe(nom)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
  await calmer();
};
/** Les boutons de l'aperçu, et d'eux seuls : la fenêtre de derrière a les siens. */
const boutonsApercu = () => [...(container.querySelector('.apd')?.querySelectorAll('button') ?? [])]
  .map((b) => (b.textContent ?? '').trim());

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 « Joindre ce fichier » n’existe que dans un message en cours d’écriture', () => {
  it('🔴🔴 en LECTURE (mode « ranger »), le bouton est ABSENT de l’aperçu', async () => {
    await monterEnLecture();
    await ouvrirApercuDe('bail.pdf');
    expect(container.querySelector('.apd')).not.toBeNull();
    expect(boutonsApercu().join(' ')).not.toContain('Joindre');
  });

  it('🔴🔴 en ÉCRITURE (mode « joindre »), le bouton est PRÉSENT', async () => {
    await monterEnEcriture();
    await ouvrirApercuDe('bail.pdf');
    expect(container.querySelector('.apd')).not.toBeNull();
    expect(boutonsApercu()).toContain('Joindre ce fichier');
  });

  /**
   * 🔴🔴 ET IL AGIT VRAIMENT. Un bouton présent qui ne joindrait rien serait le défaut d'Arno déplacé, pas
   * corrigé : on presse, et l'on regarde ce que l'éditeur de mail reçoit.
   */
  it('🔴🔴 pressé en écriture, il joint le fichier au message', async () => {
    await monterEnEcriture();
    await ouvrirApercuDe('bail.pdf');
    const b = [...(container.querySelector('.apd')?.querySelectorAll('button') ?? [])]
      .find((x) => (x.textContent ?? '').trim() === 'Joindre ce fichier');
    await act(async () => { (b as HTMLButtonElement | undefined)?.click(); });
    await calmer();
    expect(choisis).toHaveLength(1);
    expect(JSON.stringify(choisis[0])).toContain('bail.pdf');
  });

  /**
   * ⚠️ ABSENT, PAS ÉTEINT — comme pour le menu contextuel. Un bouton gris sans motif se prend pour une panne ;
   * et il n'y a aucun motif à expliquer, puisqu'il n'y a pas de message où écrire.
   */
  it('⚠️ absent, et non grisé', async () => {
    await monterEnLecture();
    await ouvrirApercuDe('bail.pdf');
    const tous = [...(container.querySelector('.apd')?.querySelectorAll('button') ?? [])];
    expect(tous.some((b) => (b.textContent ?? '').includes('Joindre'))).toBe(false);
    expect(tous.some((b) => (b.getAttribute('title') ?? '').includes('Joindre'))).toBe(false);
  });

  /**
   * 🔴 CE QUI NE BOUGE PAS, ET QUI COMPTE AUTANT : l'aperçu reste entièrement utilisable en lecture. On ne
   * retire qu'un bouton qui ne marchait pas — pas la visionneuse.
   */
  it('🔴 en lecture, l’aperçu garde sa croix et sa navigation', async () => {
    await monterEnLecture();
    await ouvrirApercuDe('bail.pdf');
    expect(container.querySelector('.apd-croix')).not.toBeNull();
    expect(container.querySelector('.apd-scene')).not.toBeNull();
  });

  /**
   * 🔴🔴 LA RÈGLE DU LOT PRÉCÉDENT TIENT TOUJOURS, et c'est elle qui rend celle-ci cohérente : le MENU CLIC
   * DROIT n'offre pas « Joindre au message » en lecture. Les deux chemins disent donc la même chose.
   */
  it('🔴🔴 le menu contextuel dit la même chose que l’aperçu', async () => {
    await monterEnLecture();
    await act(async () => {
      ligneDe('bail.pdf')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }));
    });
    await calmer();
    const menu = container.querySelector('.sfd-menu');
    expect(menu).not.toBeNull();
    expect(menu?.textContent ?? '').not.toContain('Joindre au message');
  });
});

/**
 * ══ 🔴 CE QUE LA VISIONNEUSE DU MAIL, ELLE, CONTINUE D'OFFRIR ═══════════════════════════════════════════════════
 *
 * ⚠️ NE PAS CONFONDRE DEUX BOUTONS QUI S'AFFICHENT AU MÊME ENDROIT. Dans la visionneuse des pièces d'un mail
 * (`Conversation.tsx`), le même emplacement porte « Ranger dans le Drive » — un geste de CLASSEMENT, qui n'a
 * jamais rien eu à voir avec l'écriture d'un message. Ce lot ne le touche pas, et il ne doit pas le toucher :
 * c'est le seul moyen d'ouvrir le rangement depuis la lecture.
 *
 * 🔴 CE QUI LES SÉPARE EN CODE : l'aperçu reçoit `joindreAutorise` de son appelant. `Conversation.tsx` le passe
 * à `true` avec son propre libellé ; le sélecteur, lui, ne le passe désormais qu'en mode « joindre ».
 */
describe('🔴 la pièce d’un mail n’a jamais porté « Joindre ce fichier »', () => {
  it('🔴 l’aperçu d’une PIÈCE reçue n’offre pas de « Joindre »', async () => {
    await monterEnLecture();
    const piece = container.querySelector('.sfd-piece');
    await act(async () => { (piece?.querySelector('.sfd-piece-oeil') as HTMLElement | null)?.click(); });
    await calmer();
    expect(container.querySelector('.apd')).not.toBeNull();
    expect(boutonsApercu().join(' ')).not.toContain('Joindre');
  });
});
