// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';

/**
 * LOT 4c-A — RÉGRESSION VUE À L'ÉCRAN PAR ARNO : après « Rattacher », un panneau d'affectation restait OUVERT sur un
 * échange qu'il n'avait PAS cliqué (le suivant dans la file). Le risque n'est pas cosmétique : le panneau suivant est
 * pré-rempli avec les données de SON échange, et un clic de confirmation par réflexe rattache le MAUVAIS échange.
 *
 * Ce fichier monte la vue ENTIÈRE (jsdom + act, sans testing-library — patron des écrans Permis) parce que le défaut ne
 * vit ni dans une fonction pure ni dans une route : il vit dans l'appariement entre un état d'ouverture et une liste
 * qui CHANGE sous lui. Il fallait donc la liste, le geste, et le rechargement qui suit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ECHANGE = (filId: number, objet: string) => ({
  filId, objet, interlocuteur: 'Mme M.', dernierLe: '2026-09-20T12:00:00Z',
  nbMessages: 2, nbPieces: 0, attend: true,
});

const ECRAN = (file: ReturnType<typeof ECHANGE>[]) => ({
  file, filsTotal: file.length, fenetreJours: 30, filsTropAnciens: 0,
  sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0,
  messagesCaptures: 10, messagesExclus: 0, derniereReleveLe: '2026-09-23T10:00:00Z',
});

/** La file telle qu'Arno l'avait : l'échange qu'il a rattaché, puis celui d'en dessous, qu'il n'a jamais cliqué. */
const AVANT = [ECHANGE(101, 'Préavis de départ'), ECHANGE(102, 'Re: Dates travaux')];
const APRES = [ECHANGE(102, 'Re: Dates travaux')]; // rattacher fait SORTIR l'échange de la file
/**
 * LOT 4d-C — la file AFFICHE l'objet sans sa cascade de préfixes : « Re: Dates travaux » se lit « Dates travaux ».
 * L'objet ENREGISTRÉ, lui, garde son « Re: » (les données de capture ne sont jamais réécrites) — d'où l'écart entre
 * ce que porte le jeu d'essai et ce que le DOM montre.
 */
const AFFICHE = 'Dates travaux';

let container: HTMLDivElement;
let root: Root;
let fileCourante: ReturnType<typeof ECHANGE>[];
let posts: { url: string; corps: unknown }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  fileCourante = AVANT;
  posts = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    if (u.includes('/affectation') && methode === 'GET') {
      // Le sélecteur du panneau : aucun événement ouvert, et un pré-remplissage propre à CET échange.
      return { ok: true, json: async () => ({ evenements: [], propositions: { objet: `objet de ${u}`, demandeurNom: null, demandeurEmail: null, adresseLibre: null } }) } as unknown as Response;
    }
    if (u.includes('/affectation') && methode === 'POST') {
      posts.push({ url: u, corps: JSON.parse(String(init?.body ?? '{}')) });
      fileCourante = APRES; // la file a changé sous l'écran : c'est tout le nœud du défaut
      return { ok: true, json: async () => ({ ok: true, evenementId: 9, reference: 'GES-2026-000001' }) } as unknown as Response;
    }
    return { ok: true, json: async () => ECRAN(fileCourante) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
const monter = async () => { await act(async () => { root.render(createElement(GestionVue)); }); await calmer(); };
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (motif: RegExp) => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: HTMLElement | undefined) => { await act(async () => { b?.click(); }); await calmer(); };
const panneaux = () => [...container.querySelectorAll('.gst-panneau')];
/** L'échange dont le panneau est ouvert, lu dans le DOM — la seule vérité qui compte pour l'utilisateur. */
const echangeOuvert = (): string | null => {
  const p = container.querySelector('.gst-panneau');
  return p ? (p.closest('li')?.querySelector('.gst-objet')?.textContent ?? null) : null;
};

describe('le panneau d’affectation appartient à UN ÉCHANGE, pas à une position dans la liste', () => {
  it('s’ouvre sur l’échange cliqué, et sur lui seul', async () => {
    await monter();
    const lignes = [...container.querySelectorAll('li.gst-item')];
    await cliquer(lignes[0].querySelector('button') as HTMLElement);
    expect(panneaux()).toHaveLength(1);
    expect(echangeOuvert()).toBe('Préavis de départ');
  });

  /**
   * LE CAS D'ARNO, bout à bout. Après un rattachement réussi, la file se réduit : l'échange rattaché s'en va et
   * « Re: Dates travaux » REMONTE à la position qu'occupait le premier. Si l'ouverture suivait la POSITION, le panneau
   * réapparaîtrait sur lui — sur un échange que personne n'a désigné.
   */
  it('après un rattachement réussi, AUCUN panneau n’est ouvert — surtout pas sur l’échange qui a pris la place', async () => {
    await monter();
    const lignes = [...container.querySelectorAll('li.gst-item')];
    await cliquer(lignes[0].querySelector('button') as HTMLElement);
    expect(echangeOuvert()).toBe('Préavis de départ');

    await cliquer(boutonPar(/^Rattacher$/));

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toContain('/fils/101/'); // le geste a bien porté sur l'échange CLIQUÉ
    expect(panneaux()).toHaveLength(0);
    expect(echangeOuvert()).toBeNull();
    expect(container.textContent).toContain('GES-2026-000001'); // le compte rendu, lui, reste affiché
  });

  /**
   * LE FILET STRUCTUREL. Toute relecture de l'écran referme le panneau — pas seulement celle qui suit un geste : la
   * relève automatique et « Rafraîchir » rapportent eux aussi une file différente de celle sur laquelle on a cliqué.
   * Mettre la remise à zéro dans `charger` plutôt que chez chaque appelant est ce qui rend l'oubli impossible.
   */
  it('« Rafraîchir » referme le panneau : la file relue n’est plus celle sur laquelle on avait cliqué', async () => {
    await monter();
    const lignes = [...container.querySelectorAll('li.gst-item')];
    await cliquer(lignes[0].querySelector('button') as HTMLElement);
    expect(panneaux()).toHaveLength(1);
    await cliquer(boutonPar(/^Rafraîchir$/));
    expect(panneaux()).toHaveLength(0);
  });

  it('le panneau NOMME l’échange sur lequel il agit — un panneau anonyme ferait rattacher le mauvais', async () => {
    await monter();
    const lignes = [...container.querySelectorAll('li.gst-item')];
    await cliquer(lignes[1].querySelector('button') as HTMLElement);
    const titre = container.querySelector('.gst-panneau-titre')?.textContent ?? '';
    expect(titre).toContain('Rattacher');
    expect(titre).toContain(AFFICHE);
  });

  it('« Replier » remplace « Fermer » : replier un panneau n’est pas clore un dossier', async () => {
    await monter();
    const lignes = [...container.querySelectorAll('li.gst-item')];
    await cliquer(lignes[0].querySelector('button') as HTMLElement);
    expect(boutonPar(/^Replier$/)).toBeDefined();
    expect(boutonPar(/^Fermer$/)).toBeUndefined();
    await cliquer(boutonPar(/^Replier$/));
    expect(panneaux()).toHaveLength(0); // la fonction elle-même est conservée : seul le mot change
  });

  it('le panneau se referme sur l’échange où il était, jamais sur un autre (« Annuler »)', async () => {
    await monter();
    const lignes = [...container.querySelectorAll('li.gst-item')];
    await cliquer(lignes[1].querySelector('button') as HTMLElement);
    expect(echangeOuvert()).toBe(AFFICHE);
    await cliquer(boutonPar(/^Annuler$/));
    expect(panneaux()).toHaveLength(0);
  });
});
