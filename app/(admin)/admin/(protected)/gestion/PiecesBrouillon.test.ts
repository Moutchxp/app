// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PiecesBrouillon } from './PiecesBrouillon';

/**
 * 🔴 LOT EDITEUR-PJ — « JOINDRE UN FICHIER » NE RESTE PLUS GRISÉ.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT, CONSTATÉ PAR ARNO. Le bouton restait inactif avec « Le brouillon s'enregistre… vous pourrez joindre un
 * fichier dans un instant », et cet instant n'arrivait JAMAIS sur un message neuf. Ce n'était pas une lenteur,
 * c'était une impasse : l'enregistrement automatique ne part que si l'on a SAISI quelque chose (règle du lot
 * BROUILLON-SILENCIEUX, qui évite de semer des brouillons vides à chaque ouverture) — or on veut souvent joindre
 * AVANT d'écrire. Deux règles justes qui, ensemble, faisaient une promesse que l'écran ne pouvait pas tenir.
 *
 * 🔴 LA SORTIE N'EST PAS DE RELÂCHER LA RÈGLE : ce serait recréer les brouillons fantômes. C'est de dire que
 * JOINDRE EST UNE SAISIE — on ne joint pas un fichier par accident — et de créer le brouillon à ce moment-là.
 *
 * Ce qui est tenu ici :
 *   ① le bouton est ACTIF dès l'ouverture, même sans brouillon, et la phrase d'attente a disparu ;
 *   ② le brouillon est créé À LA DEMANDE, et une seule fois ;
 *   ③ 🔴 LA LISTE DE FICHIERS EST COPIÉE AVANT TOUT `await` — sans quoi elle est vidée avant d'être lue ;
 *   ④ les « Récents » locaux n'existent pas sans la migration 269.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; recent: string | null; nom: string | null }[];
let pieces: unknown[];
let recents: Record<string, unknown>;
let creations: number;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; pieces = []; creations = 0;
  recents = { etat: 'ok', disponible: false, lignes: [] };
  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    const corps = init?.body instanceof FormData ? init.body : null;
    appels.push({
      url: u, methode,
      recent: corps ? (corps.get('recent') as string | null) : null,
      nom: corps && corps.get('fichier') instanceof File ? (corps.get('fichier') as File).name : null,
    });
    if (u.includes('/pieces-recentes')) return { ok: true, json: async () => recents } as unknown as Response;
    if (methode === 'GET') return { ok: true, json: async () => ({ etat: 'ok', pieces }) } as unknown as Response;
    return { ok: true, json: async () => ({ etat: 'ok' }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const monter = async (brouillonId: number | null, avecCreation = true) => {
  await act(async () => {
    root.render(createElement(PiecesBrouillon, {
      brouillonId,
      onBesoinDeBrouillon: avecCreation ? async () => { creations += 1; return 55; } : undefined,
    } as never));
  });
  await calmer();
};
const joindre = () =>
  [...container.querySelectorAll('button')].find((b) => /Joindre un fichier/.test(b.textContent ?? ''));
/**
 * ⚠️ `DataTransfer` N'EXISTE PAS DANS jsdom. On fabrique donc une liste ARRAY-LIKE, ce qu'est un `FileList` du
 * point de vue du code testé (`Array.from` n'en demande pas plus). Prétendre en avoir un vrai n'apporterait rien
 * et ferait dépendre le test d'une implémentation que l'environnement ne fournit pas.
 */
const listeDe = (fichiers: File[]): FileList =>
  ({ ...fichiers, length: fichiers.length, item: (i: number) => fichiers[i] ?? null }) as unknown as FileList;

const deposer = async (...noms: string[]) => {
  const champ = container.querySelector('.pjb-champ') as HTMLInputElement;
  const liste = listeDe(noms.map((n) => new File(['x'], n, { type: 'text/plain' })));
  Object.defineProperty(champ, 'files', { value: liste, configurable: true });
  await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); });
  await calmer();
};

describe('🔴 ① le bouton est ACTIF dès l’ouverture', () => {
  it('🔴 sans brouillon, il n’est PAS grisé', async () => {
    await monter(null);
    expect(joindre()?.disabled).toBe(false);
  });

  it('🔴 la phrase d’attente a disparu : elle promettait un enregistrement qui n’arrivait jamais', async () => {
    await monter(null);
    expect(container.textContent).not.toContain('Le brouillon s’enregistre');
    expect(container.textContent).toContain('Glissez vos fichiers ici');
  });

  it('…et la limite reste TOUJOURS visible : on ne découvre pas le plafond au moment d’envoyer', async () => {
    await monter(null);
    expect(container.querySelector('.pjb-aide')?.textContent).toContain('25,0 Mo');
  });
});

describe('🔴 ② le brouillon est créé à la demande', () => {
  it('🔴 déposer un fichier sans brouillon le CRÉE, puis y attache la pièce', async () => {
    await monter(null);
    await deposer('bail.pdf');
    expect(creations).toBe(1);
    const post = appels.find((a) => a.methode === 'POST');
    expect(post?.url).toContain('/brouillons/55/pieces');
    expect(post?.nom).toBe('bail.pdf');
  });

  it('avec un brouillon déjà là, on n’en crée PAS un second', async () => {
    await monter(12);
    await deposer('bail.pdf');
    expect(creations).toBe(0);
    expect(appels.find((a) => a.methode === 'POST')?.url).toContain('/brouillons/12/pieces');
  });

  it('si la création échoue, on le DIT — la pièce n’est pas perdue en silence', async () => {
    await act(async () => {
      root.render(createElement(PiecesBrouillon, {
        brouillonId: null, onBesoinDeBrouillon: async () => null,
      } as never));
    });
    await calmer();
    await deposer('bail.pdf');
    expect(container.textContent).toContain('n’a pas pu être créé');
    expect(appels.some((a) => a.methode === 'POST')).toBe(false);
  });
});

describe('🔴 ③ la liste de fichiers est copiée AVANT le premier `await`', () => {
  /**
   * 🔴 LE PIÈGE, MESURÉ DANS CHROME. Le champ natif est remis à zéro juste après l'appel (`value = ''`,
   * indispensable pour pouvoir redéposer deux fois le même fichier) — et vider la valeur d'un `<input type="file">`
   * VIDE AUSSI son `FileList`, qui est une vue vivante, pas une copie. Tant qu'aucun `await` ne précédait la
   * boucle, celle-ci ne voyait pas le vidage. Depuis que le brouillon est créé à la demande, il y en a un :
   * sans copie, la liste était VIDE au moment de la lire, aucune requête ne partait, et l'écran n'affichait NI
   * pièce NI erreur. Un échec parfaitement muet.
   */
  it('🔴 le vidage du champ juste après le dépôt ne fait pas perdre les fichiers', async () => {
    await monter(null);
    const champ = container.querySelector('.pjb-champ') as HTMLInputElement;
    let vue = listeDe([
      new File(['x'], 'un.txt', { type: 'text/plain' }),
      new File(['y'], 'deux.txt', { type: 'text/plain' }),
    ]);
    Object.defineProperty(champ, 'files', { get: () => vue, configurable: true });
    Object.defineProperty(champ, 'value', {
      // C'est ce que fait le navigateur : remettre la valeur à '' VIDE la liste.
      set: () => { vue = listeDe([]); }, get: () => '', configurable: true,
    });
    await act(async () => { champ.dispatchEvent(new Event('change', { bubbles: true })); });
    await calmer();
    const posts = appels.filter((a) => a.methode === 'POST');
    expect(posts.map((p) => p.nom)).toEqual(['un.txt', 'deux.txt']);
  });

  it('plusieurs fichiers d’un coup sont tous déposés — la sélection multiple reste acquise', async () => {
    await monter(12);
    await deposer('un.txt', 'deux.txt', 'trois.txt');
    expect(appels.filter((a) => a.methode === 'POST').map((p) => p.nom))
      .toEqual(['un.txt', 'deux.txt', 'trois.txt']);
  });
});

describe('🔴 ④ les « Récents » locaux', () => {
  it('🔴 sans la migration 269, AUCUN bouton « Récents » — pas un panneau vide', async () => {
    recents = { etat: 'ok', disponible: false, lignes: [] };
    await monter(12);
    expect(container.textContent).not.toContain('Récents');
  });

  it('avec la migration, le panneau propose les pièces déjà envoyées depuis l’ordinateur', async () => {
    recents = {
      etat: 'ok', disponible: true,
      lignes: [{ cle: 'gestion/brouillon/1/a.pdf', libelle: 'bail signé.pdf', detail: 'application/pdf', tailleOctets: 2048 }],
    };
    await monter(12);
    const b = [...container.querySelectorAll('button')].find((x) => /Récents \(1\)/.test(x.textContent ?? ''));
    expect(b).toBeDefined();
    await act(async () => { b?.click(); }); await calmer();
    expect(container.querySelector('.pjb-recents')?.textContent).toContain('bail signé.pdf');
  });

  /**
   * 🔴 ON ENVOIE LA CLÉ, PAS LES OCTETS. Les octets sont déjà chez nous : on ne redemande rien au Mac. Et la route
   * vérifie que cette clé figure dans l'historique DE CE COMPTE avant de relire quoi que ce soit — sans quoi une
   * clé envoyée d'ici ferait de n'importe quel objet du stockage une pièce jointe.
   */
  it('🔴 rejoindre une pièce récente envoie sa CLÉ, jamais un fichier', async () => {
    recents = {
      etat: 'ok', disponible: true,
      lignes: [{ cle: 'gestion/brouillon/1/a.pdf', libelle: 'bail signé.pdf', detail: 'application/pdf', tailleOctets: 2048 }],
    };
    await monter(12);
    const ouvrir = [...container.querySelectorAll('button')].find((x) => /Récents/.test(x.textContent ?? ''));
    await act(async () => { ouvrir?.click(); }); await calmer();
    const item = container.querySelector('.pjb-recent-bouton') as HTMLButtonElement;
    await act(async () => { item.click(); }); await calmer();
    const post = appels.find((a) => a.methode === 'POST');
    expect(post?.recent).toBe('gestion/brouillon/1/a.pdf');
    expect(post?.nom).toBeNull();
  });
});
