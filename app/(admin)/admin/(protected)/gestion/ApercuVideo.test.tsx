// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApercuFichierDrive } from './ApercuFichierDrive';
import { MESSAGE_VIDEO_ILLISIBLE } from '../../../../lib/gestion/pieces';

/**
 * ══ 🔴🔴 LOT FENETRE-BIENS-LIBELLES-ET-VIDEOS, POINT 2 — LA VISIONNEUSE, MONTÉE POUR DE VRAI ═════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « Œil “Visualiser” et visionneuse : lecteur vidéo intégré (lecture, pause, barre de
 * temps, son, plein écran), avec diffusion par plages (Range / 206) depuis la même source que le téléchargement.
 * […] Si le navigateur ne peut pas lire le format (ex. .mov HEVC d'iPhone dans Chrome) : message clair “Ce format
 * ne se lit pas dans le navigateur” + bouton Télécharger. »
 *
 * 🔴 CE FICHIER MONTE LA VRAIE VISIONNEUSE, celle qui sert aussi les PDF et les images du Drive. Un essai sur un
 * `<video>` isolé n'aurait rien prouvé : ce qu'on veut tenir, c'est que la visionneuse RECONNAÎT une vidéo et lui
 * donne un lecteur — là où elle affichait « Aperçu indisponible pour ce type de fichier ».
 *
 * ⚠️ JSDOM NE DÉCODE AUCUNE VIDÉO, et c'est sans importance ici : le décodage est le travail du navigateur, et le
 * refus qu'on éprouve est précisément l'événement `error` qu'il émet dans ce cas. On le déclenche nous-mêmes.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : une pièce inventée, `fetch` simulé — rien ne sort, rien n'est écrit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PIECE = {
  id: '27077', nom: 'VIDEO-2026-09-30-20-46-39.mp4', typeMime: 'video/mp4', lien: null,
  parentId: 'pieces-de-la-conversation', source: 'piece' as const,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ etat: 'ok' }) }) as unknown as Response) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (typeMime = 'video/mp4') => {
  await act(async () => {
    root.render(createElement(ApercuFichierDrive, {
      fichier: { ...PIECE, typeMime },
      voisinage: [],
      etiquetteNav: 'Pièces de la conversation',
      joindreAutorise: false,
      /* ⚠️ `estDeja` EST UNE FONCTION, pas un booléen : la visionneuse l'interroge pour CHAQUE document du tour. */
      estDeja: () => false,
      onJoindre: () => {},
      onFerme: () => {},
    } as never));
  });
  await calmer();
};
const lecteur = () => container.querySelector('video.apd-video') as HTMLVideoElement | null;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 UNE VIDÉO OUVRE UN LECTEUR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① la visionneuse donne un lecteur à une vidéo', () => {
  it('🔴🔴 un `<video>` avec ses commandes, sur la source du téléchargement', async () => {
    await monter();
    const v = lecteur();
    expect(v, 'la visionneuse doit rendre un lecteur vidéo').not.toBeNull();
    /* 🔴 LES CINQ COMMANDES D'ARNO (lecture, pause, barre de temps, son, plein écran) viennent de `controls` :
       les commandes natives savent aussi l'image dans l'image, la vitesse et le clavier. */
    expect(v?.hasAttribute('controls')).toBe(true);
    /* 🔴 LA MÊME SOURCE QUE LE TÉLÉCHARGEMENT — la route des pièces, qui sert MinIO, puis le Drive, puis Gmail. */
    expect(v?.getAttribute('src')).toBe('/api/admin/gestion/pieces/27077');
    /* ⚠️ ON TIRE LES MÉTADONNÉES, PAS LE FILM : une pièce ouverte par mégarde ne doit pas peser 300 Mo. */
    expect(v?.getAttribute('preload')).toBe('metadata');
  });

  /** ⚠️ ET PLUS « Aperçu indisponible » : c'est ce que la visionneuse disait avant ce lot. */
  it('⚠️ plus de message « Aperçu indisponible » pour une vidéo', async () => {
    await monter();
    expect(container.textContent).not.toContain('Aperçu indisponible');
  });

  /** 🔴 LES CINQ FORMATS D'ARNO ouvrent tous le lecteur — y compris `.mov`, qu'on ne déguise pas en fichier. */
  it('🔴 mp4, mov, webm, m4v, 3gp ouvrent tous un lecteur', async () => {
    for (const t of ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp']) {
      await monter(t);
      expect(lecteur(), t).not.toBeNull();
      await act(async () => { root.unmount(); });
      container.remove();
      container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    }
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 UN FORMAT QUE LE NAVIGATEUR NE LIT PAS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② format illisible : le message, et la sortie', () => {
  /**
   * 🔴🔴 C'EST LE NAVIGATEUR QUI TRANCHE, ET LUI SEUL. Le type MIME ne dit RIEN du codec : un `.mov` H.264 se lit
   * partout, le même `.mov` en HEVC (l'enregistrement par défaut d'un iPhone récent) est refusé par Chrome et
   * accepté par Safari. On ne devine donc pas — on tente, et `error` nous le dit.
   */
  it('🔴🔴 le message d’Arno, mot pour mot, et un bouton de téléchargement', async () => {
    await monter('video/quicktime');
    const v = lecteur() as HTMLVideoElement;
    await act(async () => { v.dispatchEvent(new Event('error')); });
    await calmer();

    expect(lecteur(), 'le lecteur doit céder la place au message').toBeNull();
    expect(container.textContent).toContain(MESSAGE_VIDEO_ILLISIBLE);
    /* 🔴 LA SORTIE EST JUSTE À CÔTÉ : un message qui constate sans proposer laisse devant un cul-de-sac. */
    const lien = [...container.querySelectorAll('a')]
      .find((a) => (a.textContent ?? '').includes('Télécharger la vidéo')) as HTMLAnchorElement;
    expect(lien, 'le bouton Télécharger doit être là').toBeDefined();
    expect(lien.getAttribute('href')).toBe('/api/admin/gestion/pieces/27077?telecharger=1');
    expect(lien.getAttribute('download')).toBe(PIECE.nom);
  });

  /** ⚠️ ET ON DIT QUE LE FICHIER EST INTACT : un refus de lecture n'est pas une pièce perdue. */
  it('⚠️ le message ne laisse pas croire que la vidéo est abîmée', async () => {
    await monter('video/quicktime');
    await act(async () => { (lecteur() as HTMLVideoElement).dispatchEvent(new Event('error')); });
    await calmer();
    expect(container.textContent).toContain('Le fichier est intact');
  });
});
