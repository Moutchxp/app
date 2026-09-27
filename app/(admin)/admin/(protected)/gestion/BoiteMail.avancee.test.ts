// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BoiteMail, basculerListe, filtresPoses, CRITERE_VIDE } from './BoiteMail';

/**
 * LOT RECHERCHE-AVANCEE — LE PANNEAU DE RECHERCHE DÉTAILLÉE, MONTÉ POUR DE VRAI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE, et qu'aucune relecture ne prouve :
 *   ① « Contient les mots » et le champ du haut sont UN SEUL état. Deux états séparés, recopiés « au bon moment »,
 *      finissent par diverger : on cherche alors autre chose que ce qu'on lit. Éprouvé DANS LES DEUX SENS.
 *   ② chaque réglage part vraiment au SERVEUR — un filtre qui n'atteint pas la requête est un filtre qui ment ;
 *   ③ la pastille de l'engrenage s'allume dès qu'un filtre est posé, panneau fermé. Un filtre oublié cache des
 *      mails : c'est le silence le plus coûteux d'une recherche.
 *
 * ⚠️ ON N'ASSERTE AUCUNE FORME DE SQL ici : on lit les PARAMÈTRES de l'adresse appelée, c'est-à-dire ce que le
 * serveur reçoit réellement. Le SQL, lui, est éprouvé dans `rechercheBoite.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE = {
  lignes: [], suivant: null, total: 0, comptes: null, pleinTexte: true, automatiquesMasques: null,
  brouillons: { lignes: [], tronque: false },
};

let container: HTMLDivElement;
let root: Root;
/** Toutes les adresses appelées, dans l'ordre : c'est là qu'on lit ce que le serveur a reçu. */
let urls: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  urls = [];
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    urls.push(String(url));
    return { ok: true, json: async () => PAGE } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { root.render(createElement(BoiteMail, { onOuvrir: () => {} })); });
  await calmer();
};

const engrenage = () => container.querySelector('button[aria-label="Recherche avancée"]') as HTMLButtonElement;
const panneau = () => container.querySelector('#bte-avancee');
const champHaut = () => container.querySelector('input[type="search"]') as HTMLInputElement;
/** Un champ du panneau, désigné par le mot écrit à côté de lui — ce qu'une personne lit réellement. */
const champDuPanneau = (nom: string): HTMLInputElement | HTMLSelectElement => {
  const l = [...container.querySelectorAll('#bte-avancee label')]
    .find((x) => (x.querySelector('.bte-f-nom')?.textContent ?? '') === nom);
  return l?.querySelector('input, select') as HTMLInputElement | HTMLSelectElement;
};
const caseListe = (mot: string): HTMLInputElement => {
  const l = [...container.querySelectorAll('#bte-avancee .bte-case')]
    .find((x) => (x.textContent ?? '').trim() === mot);
  return l?.querySelector('input') as HTMLInputElement;
};
const cliquer = async (e: Element | null) => { await act(async () => { (e as HTMLElement)?.click(); }); await calmer(); };
/** Saisir dans un champ contrôlé par React : on passe par le setter natif, sinon React ignore la valeur. */
const taper = async (champ: HTMLInputElement | HTMLSelectElement, valeur: string) => {
  const proto = champ instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(champ, valeur);
  await act(async () => { champ.dispatchEvent(new Event(champ instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
  await calmer();
};
const chercher = async () => {
  const f = container.querySelector('form.bte-recherche') as HTMLFormElement;
  await act(async () => { f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await calmer();
};
/** Les paramètres de la DERNIÈRE recherche lancée. */
const derniersParams = (): URLSearchParams => {
  const u = [...urls].reverse().find((x) => x.includes('/recherche')) ?? '';
  return new URLSearchParams(u.slice(u.indexOf('?') + 1));
};

describe('🔴 le panneau s’ouvre, se referme, et ne s’impose jamais', () => {
  it('il est FERMÉ au départ ; l’engrenage l’ouvre puis le referme', async () => {
    await monter();
    expect(panneau()).toBeNull();
    expect(engrenage().getAttribute('aria-expanded')).toBe('false');
    await cliquer(engrenage());
    expect(panneau()).not.toBeNull();
    expect(engrenage().getAttribute('aria-expanded')).toBe('true');
    await cliquer(engrenage());
    expect(panneau()).toBeNull();
  });

  it('Échap referme le panneau SANS effacer ce qui est saisi — replier n’est pas annuler', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Ne contient pas') as HTMLInputElement, 'facture');
    const form = container.querySelector('form.bte-recherche') as HTMLFormElement;
    await act(async () => { form.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await calmer();
    expect(panneau()).toBeNull();
    await cliquer(engrenage());
    expect((champDuPanneau('Ne contient pas') as HTMLInputElement).value).toBe('facture');
  });

  it('l’engrenage porte un nom, pas seulement une icône', async () => {
    await monter();
    expect(engrenage().getAttribute('title')).toBe('Recherche avancée');
    expect(engrenage().querySelector('svg')).not.toBeNull();
  });
});

describe('🔴 « Contient les mots » et le champ du haut sont UN SEUL état', () => {
  it('du haut vers le panneau : le panneau s’ouvre DÉJÀ rempli', async () => {
    await monter();
    await taper(champHaut(), 'fuite');
    await cliquer(engrenage());
    expect((champDuPanneau('Contient les mots') as HTMLInputElement).value).toBe('fuite');
  });

  it('du panneau vers le haut : la frappe se voit en haut À LA FRAPPE, sans valider', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Contient les mots') as HTMLInputElement, 'marceau');
    expect(champHaut().value).toBe('marceau');
  });

  it('et dans l’autre sens, panneau ouvert : taper en haut met le panneau à jour', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champHaut(), 'bail');
    expect((champDuPanneau('Contient les mots') as HTMLInputElement).value).toBe('bail');
  });
});

describe('🔴 chaque réglage atteint vraiment le serveur', () => {
  it('« ne contient pas » part dans la requête', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Contient les mots') as HTMLInputElement, 'fuite');
    await taper(champDuPanneau('Ne contient pas') as HTMLInputElement, 'facture');
    await chercher();
    expect(derniersParams().get('q')).toBe('fuite');
    expect(derniersParams().get('sans')).toBe('facture');
  });

  it('la période et l’expéditeur partent aussi', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Du') as HTMLInputElement, '2026-01-01');
    await taper(champDuPanneau('Au') as HTMLInputElement, '2026-03-31');
    await taper(champDuPanneau('Expéditeur') as HTMLInputElement, 'martin');
    await chercher();
    expect(derniersParams().get('du')).toBe('2026-01-01');
    expect(derniersParams().get('au')).toBe('2026-03-31');
    expect(derniersParams().get('de')).toBe('martin');
  });

  it('« avec » et « sans » pièce jointe partent ; « indifférent » n’écrit RIEN', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Contient les mots') as HTMLInputElement, 'bail');
    await taper(champDuPanneau('Pièce jointe'), 'avec');
    await chercher();
    expect(derniersParams().get('pj')).toBe('avec');

    await taper(champDuPanneau('Pièce jointe'), 'sans');
    await chercher();
    expect(derniersParams().get('pj')).toBe('sans');

    await taper(champDuPanneau('Pièce jointe'), 'indifferent');
    await chercher();
    expect(derniersParams().has('pj')).toBe(false); // un filtre neutre ne doit rien coûter
  });

  /**
   * 🔴 LES LISTES : ABSENT ≠ AUCUNE. Tant que les quatre sont cochées, le paramètre N'EST PAS écrit — une adresse
   * sans lui garde exactement le sens qu'elle avait avant ce lot, et les liens déjà envoyés continuent de marcher.
   */
  it('les quatre cases cochées n’écrivent aucun paramètre ; en décocher une l’écrit', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Contient les mots') as HTMLInputElement, 'bail');
    await chercher();
    expect(derniersParams().has('listes')).toBe(false);

    await cliquer(caseListe('Courrier automatique'));
    await chercher();
    expect(derniersParams().get('listes')).toBe('reception,envoyes,brouillons');
  });

  it('tout décocher part quand même : c’est « nulle part », pas « partout »', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Contient les mots') as HTMLInputElement, 'bail');
    for (const mot of ['Réception', 'Envoyés', 'Courrier automatique', 'Brouillons']) await cliquer(caseListe(mot));
    await chercher();
    expect(derniersParams().get('listes')).toBe('');
  });

  it('« Effacer les filtres » remet tout par défaut', async () => {
    await monter();
    await cliquer(engrenage());
    await taper(champDuPanneau('Ne contient pas') as HTMLInputElement, 'facture');
    await cliquer(caseListe('Brouillons'));
    await cliquer([...container.querySelectorAll('#bte-avancee button')]
      .find((b) => /Effacer les filtres/.test(b.textContent ?? '')) ?? null);
    expect((champDuPanneau('Ne contient pas') as HTMLInputElement).value).toBe('');
    expect(caseListe('Brouillons').checked).toBe(true);
  });
});

describe('🔴 la pastille : un filtre posé ne se cache pas derrière un panneau fermé', () => {
  it('elle apparaît quand un filtre autre que les mots est actif, et survit à la fermeture', async () => {
    await monter();
    expect(container.querySelector('.bte-pastille')).toBeNull();
    await taper(champHaut(), 'fuite');
    expect(container.querySelector('.bte-pastille')).toBeNull(); // des MOTS ne sont pas un filtre caché

    await cliquer(engrenage());
    await taper(champDuPanneau('Ne contient pas') as HTMLInputElement, 'facture');
    await cliquer(engrenage()); // on referme : c'est là que le filtre deviendrait invisible
    expect(panneau()).toBeNull();
    expect(container.querySelector('.bte-pastille')).not.toBeNull();
    // Et un MOT pour qui ne voit pas la pastille.
    expect(engrenage().textContent).toContain('des filtres sont actifs');
  });

  it('décocher une liste l’allume aussi — c’est le filtre le plus facile à oublier', async () => {
    await monter();
    await cliquer(engrenage());
    await cliquer(caseListe('Réception'));
    await cliquer(engrenage());
    expect(container.querySelector('.bte-pastille')).not.toBeNull();
  });
});

describe('les aides pures du panneau', () => {
  it('basculer une liste garde l’ordre de référence — recocher ne renvoie pas en fin de file', () => {
    const sans = basculerListe(['reception', 'envoyes', 'automatique', 'brouillons'], 'reception', false);
    expect(sans).toEqual(['envoyes', 'automatique', 'brouillons']);
    expect(basculerListe(sans, 'reception', true)).toEqual(['reception', 'envoyes', 'automatique', 'brouillons']);
  });

  it('un critère vide ne pose AUCUN filtre ; chaque réglage en pose un', () => {
    expect(filtresPoses(CRITERE_VIDE)).toBe(false);
    expect(filtresPoses({ ...CRITERE_VIDE, q: 'fuite' })).toBe(false); // des mots ne sont pas un filtre caché
    expect(filtresPoses({ ...CRITERE_VIDE, sansMots: 'facture' })).toBe(true);
    expect(filtresPoses({ ...CRITERE_VIDE, pj: 'avec' })).toBe(true);
    expect(filtresPoses({ ...CRITERE_VIDE, du: '2026-01-01' })).toBe(true);
    expect(filtresPoses({ ...CRITERE_VIDE, de: 'martin' })).toBe(true);
    expect(filtresPoses({ ...CRITERE_VIDE, listes: ['reception'] })).toBe(true);
  });
});
