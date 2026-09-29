// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Conversation, CSS_CONVERSATION } from './Conversation';

/**
 * LOT LECTURE-HTML-FIL-TROMBONE — LE TRIANGLE ▶ / ▼, ET CE QU'IL COMMANDE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 DEMANDE D'ARNO : un triangle à GAUCHE de CHAQUE ligne de message, ▶ quand le message est replié, ▼ quand il
 * est déplié, avec une rotation animée. Un clic sur le triangle OU sur la ligne ouvre et ferme. « Tout déplier » et
 * « Plus récent / ancien d'abord » les mettent à jour.
 *
 * 🔴 CE QUI SE JOUE DERRIÈRE, ET QU'ON NE VOIT PAS À L'ÉCRAN : le triangle est le VOISIN de la ligne, jamais son
 * enfant. La ligne EST un bouton, et un bouton dans un bouton est du HTML invalide et injouable au clavier. Le
 * test le vérifie sur la structure, pas seulement sur le rendu.
 *
 * 🔴 ET IL N'AJOUTE AUCUN ARRÊT DE TABULATION. L'action existe déjà sur la ligne, qui porte `aria-expanded` : un
 * second bouton atteignable au clavier ferait passer deux fois au même endroit pour le même geste, et un lecteur
 * d'écran annoncerait deux boutons pour une seule action.
 *
 * Le fil de référence est le 36505 (« Paiement loyer Octobre », 4 messages), celui qu'Arno a nommé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const message = (n: number) => ({
  messageId: n, messageIdRfc: `<m${n}@orange.fr>`, sens: n % 2 === 0 ? 'envoye' : 'recu',
  de: n % 2 === 0 ? 'gestion@criterimmo.fr' : 'martin@orange.fr',
  deNom: n % 2 === 0 ? 'Gestion' : 'Mme Martin',
  recuLe: `2026-09-2${n}T08:00:00Z`, objet: 'Paiement loyer Octobre',
  corps: null, extrait: `message ${n}`, automatique: false, pieces: [],
  horsFile: false, motifHorsFile: null, nonRemises: [],
  destA: null, destCc: null, destinatairesFondus: null, aHtml: false, html: null,
});
/** Le fil 36505 : quatre messages, comme celui qu'Arno a pris pour référence. */
const FIL = {
  fil: { filId: 36505, objet: 'Paiement loyer Octobre', etat: 'a_classer', reference: null, evenementId: null },
  messages: [message(1), message(2), message(3), message(4)],
  partis: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('/messages')) return { ok: true, json: async () => FIL } as unknown as Response;
    if (u.includes('/corps')) {
      return { ok: true, json: async () => ({ corps: 'texte', html: null }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 36505, maintenant: new Date('2026-09-29T12:00:00Z'), onGeste: () => {}, onFerme: () => {},
    } as never));
  });
  await calmer();
};
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement)?.click(); }); await calmer();
};
const triangles = () => [...container.querySelectorAll('.cnv-triangle')] as HTMLButtonElement[];
const lignes = () => [...container.querySelectorAll('.cnv-ligne')] as HTMLButtonElement[];

describe('🔴 le triangle est là, un par message', () => {
  it('quatre messages, quatre triangles, chacun À GAUCHE de sa ligne', async () => {
    await monter();
    expect(triangles()).toHaveLength(4);
    for (const t of triangles()) {
      const rangee = t.parentElement;
      expect(rangee?.className).toContain('cnv-rangee');
      // 🔴 VOISIN, ET AVANT : c'est ce qui le place à gauche, et ce qui évite un bouton dans un bouton.
      expect(rangee?.firstElementChild).toBe(t);
      expect(t.nextElementSibling?.className).toContain('cnv-ligne');
    }
  });

  /** 🔴 UN BOUTON DANS UN BOUTON est du HTML invalide et injouable au clavier. Le test le vérifie, pas l'œil. */
  it('🔴 aucun triangle n’est À L’INTÉRIEUR d’un bouton de ligne', async () => {
    await monter();
    for (const l of lignes()) expect(l.querySelector('.cnv-triangle')).toBeNull();
  });

  /** 🔴 AUCUN ARRÊT DE TABULATION EN PLUS : l'action est déjà sur la ligne, qui porte `aria-expanded`. */
  it('🔴 il est invisible au clavier et aux lecteurs d’écran', async () => {
    await monter();
    for (const t of triangles()) {
      expect(t.getAttribute('tabindex')).toBe('-1');
      expect(t.getAttribute('aria-hidden')).toBe('true');
    }
    // …et la ligne, elle, porte bien l'état.
    expect(lignes()[0].getAttribute('aria-expanded')).not.toBeNull();
  });
});

describe('🔴 ▶ replié, ▼ déplié — et les deux voies pour basculer', () => {
  /** Le dernier message est déplié à l'ouverture (règle du lot FIL-LECTURE) : c'est lui qui porte le ▼. */
  it('à l’ouverture, seul le message déplié porte le ▼', async () => {
    await monter();
    const ouverts = triangles().filter((t) => t.className.includes('cnv-triangle--ouvert'));
    expect(ouverts).toHaveLength(1);
    // …et la ligne correspondante le dit aussi, en `aria-expanded`.
    expect(lignes().filter((l) => l.getAttribute('aria-expanded') === 'true')).toHaveLength(1);
  });

  it('🔴 un clic sur le TRIANGLE ouvre, un autre referme', async () => {
    await monter();
    const replie = triangles().find((t) => !t.className.includes('cnv-triangle--ouvert'));
    await cliquer(replie);
    expect(replie?.className).toContain('cnv-triangle--ouvert');
    await cliquer(replie);
    expect(replie?.className).not.toContain('cnv-triangle--ouvert');
  });

  it('🔴 un clic sur la LIGNE fait exactement la même chose', async () => {
    await monter();
    const i = triangles().findIndex((t) => !t.className.includes('cnv-triangle--ouvert'));
    await cliquer(lignes()[i]);
    expect(triangles()[i].className).toContain('cnv-triangle--ouvert');
  });

  /**
   * 🔴 LA ROTATION EST PORTÉE PAR LE STYLE, et elle est COUPÉE pour qui a demandé moins d'animation. Un triangle
   * qui tourne est un agrément ; il ne doit pas s'imposer à qui l'a refusé dans son système.
   */
  it('🔴 la rotation est animée, et respecte « moins d’animation »', () => {
    // ⚠️ La feuille de la conversation est EXPORTÉE et posée par l'écran parent : on l'éprouve à la source, pas
    //    en fouillant le DOM — ce qui reviendrait à tester où quelqu'un a branché la feuille, pas ce qu'elle dit.
    expect(CSS_CONVERSATION).toContain('.cnv-triangle--ouvert svg{transform:rotate(90deg)}');
    expect(CSS_CONVERSATION).toContain('transition:transform');
    expect(CSS_CONVERSATION).toContain('prefers-reduced-motion');
    // 🔴 LA COULEUR EST CELLE DE LA CHARTE, donc un jeton : elle suit le thème, Clair comme Sombre.
    expect(CSS_CONVERSATION).toContain('color:var(--color-svv-red)');
  });
});

describe('🔴 « Tout déplier » et l’ordre mettent les triangles à jour', () => {
  it('« Tout déplier » les ouvre tous, « Tout replier » les referme tous', async () => {
    await monter();
    const bouton = () => [...container.querySelectorAll('button')]
      .find((b) => /Tout (déplier|replier)/.test(b.textContent ?? ''));
    await cliquer(bouton());
    expect(triangles().every((t) => t.className.includes('cnv-triangle--ouvert'))).toBe(true);
    await cliquer(bouton());
    expect(triangles().some((t) => t.className.includes('cnv-triangle--ouvert'))).toBe(false);
  });

  /**
   * 🔴 CHANGER L'ORDRE NE DOIT PAS PERDRE L'ÉTAT. Le triangle n'a aucun état propre — il lit `ouvert` — donc le
   * message déplié reste déplié, à sa nouvelle place. Le vérifier ici scelle qu'on n'a pas introduit un second
   * état qui, lui, se perdrait.
   */
  it('🔴 changer l’ordre garde chaque message dans son état', async () => {
    await monter();
    const avant = triangles().map((t) => t.className.includes('cnv-triangle--ouvert'));
    await cliquer([...container.querySelectorAll('button')].find((b) => /d’abord/.test(b.textContent ?? '')));
    const apres = triangles().map((t) => t.className.includes('cnv-triangle--ouvert'));
    // La liste est retournée : le même message reste ouvert, à l'autre bout.
    expect(apres).toEqual([...avant].reverse());
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE REPLI DE LA CITATION A DISPARU
   ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 « Afficher le message cité » n’existe plus', () => {
  it('ni le mot, ni le repli — la citation se lit sans un clic', async () => {
    await monter();
    expect(container.textContent).not.toContain('Afficher le message cité');
    expect(container.querySelector('.gst-cite')).toBeNull();
  });
});
