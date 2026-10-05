// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Conversation } from './Conversation';
import { gesteEtoileFil, lireEtoileFil } from './gestesLigne';
import { annoncerEtoile, ecouterEtoile } from '../../../../lib/gestion/signalEtoile';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 2 — L'ÉTOILE DU MAIL OUVERT ══════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026) : « À côté de la grande corbeille du bloc gris De / À / Cc / Date […], une icône
 * étoile. C'est la MÊME fonction et le MÊME état que l'étoile de la barre de survol des lignes et que l'étoile
 * rouge affichée sur la ligne : une seule porte d'écriture, un seul état. Cliquer l'une allume ou éteint les
 * trois en direct (ligne, barre de survol, mail ouvert), dans les deux sens. […] Étoile active : rouge pleine.
 * Inactive : contour. Info-bulle “Ajouter une étoile” / “Retirer l'étoile”. Dans la Corbeille, l'étoile reste
 * disponible. »
 *
 * CE QUE CE FICHIER TIENT :
 *
 *   ① L'ÉTOILE EST LÀ, DANS LE BLOC D'EN-TÊTE, et elle dit son état (pleine / contour, et le MOT qui va avec).
 *   ② CLIQUER PASSE PAR LA PORTE UNIQUE — la route de l'échange, jamais celle du message.
 *   ③ LES TROIS SENS : le clic du mail ouvert allume les autres ; un clic venu d'ailleurs l'allume, lui.
 *   ④ ELLE RESTE SUR UN MAIL À LA CORBEILLE, et disparaît quand le geste n'est pas possible (migration absente).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SRC = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');

const message = (o: Record<string, unknown> = {}) => ({
  messageId: 57523, messageIdRfc: '<m1@orange.fr>', sens: 'recu', de: 'martin@orange.fr', deNom: 'Mme Martin',
  recuLe: '2026-09-21T08:00:00Z', objet: 'Paiement loyer Octobre',
  corps: null, extrait: 'message', automatique: false, pieces: [],
  horsFile: false, motifHorsFile: null, nonRemises: [],
  destA: null, destCc: null, destinatairesFondus: null, aHtml: false, html: null,
  aLaCorbeille: false, ...o,
});
const FIL = (m: Record<string, unknown>) => ({
  fil: { filId: 3495, objet: 'Paiement loyer Octobre', etat: 'a_classer', reference: null, evenementId: null },
  messages: [m], partis: [],
});

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; corps: unknown }[];
let etoileServie: { etoilee: boolean; disponible: boolean };
let messageServi: Record<string, unknown>;

const servir = (): void => {
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    appels.push({ url: u, methode, corps: JSON.parse(String(init?.body ?? 'null')) });
    if (u.includes('/etoile') && methode === 'POST') {
      const c = JSON.parse(String(init?.body ?? '{}')) as { etoilee?: boolean };
      return { ok: true, json: async () => ({ ok: true, etoilee: c.etoilee === true, touches: 1 }) } as Response;
    }
    if (u.includes('/etoile')) return { ok: true, json: async () => etoileServie } as unknown as Response;
    if (u.includes('/messages')) return { ok: true, json: async () => FIL(messageServi) } as unknown as Response;
    if (u.includes('/corps')) {
      return { ok: true, json: async () => ({ corps: 'texte', html: null }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  etoileServie = { etoilee: false, disponible: true };
  messageServi = message();
  servir();
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 3495, maintenant: new Date('2026-09-29T12:00:00Z'), onGeste: () => {}, onFerme: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement)?.click(); }); await calmer();
};
/**
 * ⚠️ UN FIL D'UN SEUL MESSAGE S'OUVRE DÉJÀ DÉPLIÉ : cliquer sans regarder l'aurait REFERMÉ, et le bloc d'en-tête
 * — où vit l'étoile — n'existe que déplié. Ma première version de cette aide a échoué pour cette raison, pas
 * pour un défaut du produit.
 */
const deplier = async () => {
  const l = container.querySelector('.cnv-ligne');
  if (l?.getAttribute('aria-expanded') !== 'true') await cliquer(l);
};
const etoile = (): HTMLButtonElement | null => container.querySelector('.cnv-etoile');

describe('🔴🔴 ① l’étoile est dans le bloc d’en-tête, et elle dit son état', () => {
  it('🔴 elle est là, à côté de la grande corbeille, dans la même case', async () => {
    await monter();
    await deplier();
    expect(etoile()).not.toBeNull();
    /* 🔴 LA MÊME CASE QUE LA CORBEILLE : `cnv-corbeille` porte la taille et le fond ; `cnv-etoile` la couleur. */
    expect(etoile()?.className).toContain('cnv-corbeille');
  });

  /** 🔴 ÉTEINTE : CONTOUR, et le mot qui PROMET le geste — « Ajouter une étoile ». */
  it('🔴 éteinte : contour, et « Ajouter une étoile »', async () => {
    await monter();
    await deplier();
    expect(etoile()?.className).not.toContain('cnv-etoile--pleine');
    expect(etoile()?.getAttribute('title')).toBe('Ajouter une étoile');
    expect(etoile()?.getAttribute('aria-pressed')).toBe('false');
  });

  /** 🔴 ALLUMÉE : ROUGE PLEINE, et « Retirer l'étoile ». Le MOT change, jamais la seule couleur. */
  it('🔴 allumée : pleine, et « Retirer l’étoile »', async () => {
    etoileServie = { etoilee: true, disponible: true };
    await monter();
    await deplier();
    expect(etoile()?.className).toContain('cnv-etoile--pleine');
    expect(etoile()?.getAttribute('title')).toBe('Retirer l’étoile');
    expect(etoile()?.getAttribute('aria-pressed')).toBe('true');
  });

  /**
   * ⚠️ MIGRATION 277 ABSENTE ⇒ AUCUNE ÉTOILE. Une étoile éteinte dirait faussement « cet échange n'est pas
   * suivi », là où la vérité est « on ne peut pas le savoir ». C'est déjà la règle de la barre de survol.
   */
  it('⚠️ geste impossible ⇒ aucune étoile, plutôt qu’une étoile éteinte', async () => {
    etoileServie = { etoilee: false, disponible: false };
    await monter();
    await deplier();
    expect(etoile()).toBeNull();
  });

  /** 🔴 « Dans la Corbeille, l'étoile reste disponible » (Arno) — là où la corbeille devient « Réintégrer ». */
  it('🔴 un mail à la corbeille garde son étoile', async () => {
    messageServi = message({ aLaCorbeille: true });
    await monter();
    await deplier();
    expect(etoile()).not.toBeNull();
  });
});

describe('🔴🔴 ② une seule porte d’écriture', () => {
  /**
   * 🔴🔴 LA ROUTE DE L'ÉCHANGE, ET NON CELLE DU MESSAGE. L'étoile de la ligne est celle de l'ÉCHANGE (« dès
   * qu'au moins un message est étoilé », décision d'Arno au lot ETOILE-ET-SIGNATURE) : écrire sur le message
   * aurait donné deux étoiles, deux états — exactement ce qu'il interdit.
   */
  it('🔴🔴 cliquer écrit sur `/fils/3495/etoile`, jamais sur le message', async () => {
    await monter();
    await deplier();
    await cliquer(etoile());
    /* ⚠️ ON FILTRE SUR L'ÉTOILE : la conversation marque aussi l'échange LU en arrivant (`/lecture`), et ce
       POST-là n'a rien à voir avec ce cas. */
    const ecritures = appels.filter((a) => a.methode === 'POST' && a.url.includes('/etoile'));
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0].url).toContain('/fils/3495/etoile');
    expect(ecritures[0].corps).toEqual({ etoilee: true });
    /* 🔴 ET RIEN SUR LA ROUTE DU MESSAGE : deux étoiles, deux états, c'est ce qu'Arno interdit. */
    expect(appels.filter((a) => a.methode === 'POST' && a.url.includes('/messages/'))).toEqual([]);
  });

  /** 🔴 L'ÉTAT DEMANDÉ EST ENVOYÉ, jamais « l'inverse de ce qui est là » : deux clics ne peuvent pas se croiser. */
  it('🔴 un second clic demande l’état inverse, explicitement', async () => {
    etoileServie = { etoilee: true, disponible: true };
    await monter();
    await deplier();
    await cliquer(etoile());
    expect(appels.filter((a) => a.methode === 'POST' && a.url.includes('/etoile'))[0].corps)
      .toEqual({ etoilee: false });
  });

  it('⚠️ elle s’allume aussitôt, sans attendre la relecture', async () => {
    await monter();
    await deplier();
    await cliquer(etoile());
    expect(etoile()?.className).toContain('cnv-etoile--pleine');
  });

  /**
   * 🔴 UN REFUS DÉFAIT L'ÉTOILE : on ne laisse pas un mensonge allumé. C'est déjà la règle de la barre de survol,
   * et elle vaut d'autant plus ici que le mail ouvert reste à l'écran après le clic.
   */
  it('🔴 un refus du serveur remet l’étoile dans son état d’avant', async () => {
    await monter();
    await deplier();
    global.fetch = vi.fn(async () => (
      { ok: false, json: async () => ({ erreur: 'Gmail refuse.' }) } as unknown as Response)
    ) as unknown as typeof fetch;
    await cliquer(etoile());
    expect(etoile()?.className).not.toContain('cnv-etoile--pleine');
  });
});

describe('🔴🔴 ③ les trois en direct, dans les deux sens', () => {
  /**
   * 🔴🔴 LE SENS « MAIL OUVERT → LES AUTRES ». La ligne et sa barre de survol vivent dans `BoiteMail`, montée à
   * CÔTÉ de la conversation : c'est le signal qui les relie (voir `signalEtoile`).
   */
  it('🔴🔴 cliquer dans le mail ouvert ANNONCE l’état confirmé', async () => {
    const vus: { filId: number; etoilee: boolean }[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    await monter();
    await deplier();
    await cliquer(etoile());
    stop();
    expect(vus).toEqual([{ filId: 3495, etoilee: true }]);
  });

  /** 🔴🔴 LE SENS INVERSE : un clic sur la LIGNE (ou sa barre de survol) allume le mail ouvert. */
  it('🔴🔴 une étoile posée ailleurs allume celle du mail ouvert', async () => {
    await monter();
    await deplier();
    expect(etoile()?.className).not.toContain('cnv-etoile--pleine');
    await act(async () => { annoncerEtoile({ filId: 3495, etoilee: true }); });
    await calmer();
    expect(etoile()?.className).toContain('cnv-etoile--pleine');
    /* ⚠️ ET DANS L'AUTRE SENS AUSSI : décrocher ailleurs éteint ici. */
    await act(async () => { annoncerEtoile({ filId: 3495, etoilee: false }); });
    await calmer();
    expect(etoile()?.className).not.toContain('cnv-etoile--pleine');
  });

  /**
   * ⚠️ ON NE RETIENT QUE SON PROPRE ÉCHANGE : deux conversations peuvent être montées en même temps (l'écran
   * partagé en ouvre une, une carte vive une autre), et chacune ne doit s'allumer que pour elle.
   */
  it('⚠️ l’étoile d’un AUTRE échange ne l’allume pas', async () => {
    await monter();
    await deplier();
    await act(async () => { annoncerEtoile({ filId: 99999, etoilee: true }); });
    await calmer();
    expect(etoile()?.className).not.toContain('cnv-etoile--pleine');
  });

  /** ⚠️ RIEN N'EST ANNONCÉ SUR UN ÉCHEC : les autres écrans n'ont rien vu, ce qui est exact — rien n'a changé. */
  it('⚠️ un geste refusé n’annonce rien', async () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    global.fetch = vi.fn(async () => (
      { ok: false, json: async () => ({ erreur: 'refus' }) } as unknown as Response)
    ) as unknown as typeof fetch;
    const r = await gesteEtoileFil(7, true);
    stop();
    expect(r.ok).toBe(false);
    expect(r.etoilee).toBeNull();
    expect(vus).toEqual([]);
  });
});

describe('🔴 ④ la porte, et ce qu’elle lit', () => {
  /** 🔴 L'ÉTAT ANNONCÉ EST CELUI QUE LE SERVEUR CONFIRME, jamais celui qu'on a demandé. */
  it('🔴 c’est l’état RENDU par le serveur qui est annoncé', async () => {
    const vus: { filId: number; etoilee: boolean }[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    global.fetch = vi.fn(async () => (
      /* ⚠️ Le serveur rend `false` alors qu'on demandait `true` : c'est le sien qui gagne. */
      { ok: true, json: async () => ({ ok: true, etoilee: false, touches: 0 }) } as unknown as Response)
    ) as unknown as typeof fetch;
    const r = await gesteEtoileFil(7, true);
    stop();
    expect(r.etoilee).toBe(false);
    expect(vus).toEqual([{ filId: 7, etoilee: false }]);
  });

  /** ⚠️ `disponible: false` DÈS QUE LA LECTURE N'ABOUTIT PAS : on n'invente pas « pas suivi ». */
  it('⚠️ une lecture en échec rend « indisponible », jamais « éteinte »', async () => {
    global.fetch = vi.fn(async () => { throw new Error('réseau'); }) as unknown as typeof fetch;
    expect(await lireEtoileFil(7)).toEqual({ etoilee: false, disponible: false });
  });

  /**
   * 🔴🔴 LA GARANTIE STRUCTURELLE : la conversation n'écrit l'étoile de l'échange que par `gesteEtoileFil`. Un
   * `fetch` recopié ici rougirait ce cas — c'est ce qui tient « une seule porte d'écriture » dans le temps.
   */
  it('🔴🔴 la conversation ne recopie aucun appel d’étoile d’échange', () => {
    expect(SRC).toContain('gesteEtoileFil(filId, vise)');
    expect(SRC).not.toMatch(/fetch\(`\/api\/admin\/gestion\/fils\/\$\{filId\}\/etoile`/);
  });
});
