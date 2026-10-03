// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PiecesJointes } from './PiecesJointes';
import { AIDE_DOUBLE_CLIC, lienDocumentEntier } from '../../../../lib/gestion/pieces';

/**
 * ══ 🔴🔴 LOT PIECES-OEIL-DOUBLE-CLIC — DEUX GESTES SUR UNE MINIATURE, ET CHACUN LE SIEN ══════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (03/10/2026). Jusqu'ici la miniature faisait DEUX CHOSES DIFFÉRENTES selon l'écran, sur le MÊME
 * geste : elle ouvrait la visionneuse maison là où un rappel `onVisualiser` était fourni, et un nouvel onglet
 * partout ailleurs. Rien ne l'annonçait, et le clic simple se déclenche par mégarde en parcourant une grille.
 *
 * LA RÈGLE DEVIENT :
 *   · l'ŒIL, dans la rangée d'actions à côté de ⤓ et ▲ → la VISIONNEUSE MAISON ;
 *   · le DOUBLE-CLIC sur la miniature → le DOCUMENT ENTIER dans un nouvel onglet, servi en INLINE ;
 *   · le CLIC SIMPLE ne fait plus rien.
 *
 * 🔴 CE QUE CE FICHIER PROTÈGE EN PLUS DU GESTE : qu'aucun `?telecharger=1` ne se glisse dans l'adresse du nouvel
 * onglet (le navigateur enregistrerait au lieu d'afficher), et que le clavier ne perde pas l'accès au document —
 * la miniature reste un `<button>`, et « Entrée » y ouvre l'onglet comme le lien d'avant le faisait.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Un PDF ordinaire : miniature, aperçu possible, octets présents. C'est le cas courant. */
const PDF = {
  pieceId: 20,
  nomFichier: '0859_001.pdf',
  nomOrigine: '0859_001.pdf',
  typeMime: 'application/pdf',
  tailleOctets: 182_400,
  disponible: true,
  motifNonStocke: null,
};

/** Un type SANS aperçu : il n'a pas d'œil (rien à montrer), mais il a bien un document à ouvrir. */
const XML = {
  ...PDF, pieceId: 21, nomFichier: 'facture.xml', nomOrigine: 'facture.xml', typeMime: 'application/xml',
};

let container: HTMLDivElement;
let root: Root;
let ouvre: ReturnType<typeof vi.fn>;
let openAvant: typeof window.open;

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  global.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    return {
      ok: true,
      json: async () => (u.includes('/google')
        ? { etat: 'ok', message: '', adresse: 'gestion@criterimmo.fr' }
        : { etat: 'ok', depots: [] }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  ouvre = vi.fn();
  openAvant = window.open;
  (window as unknown as { open: unknown }).open = ouvre;
});
afterEach(() => {
  (window as unknown as { open: unknown }).open = openAvant;
  act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks();
});

const calmer = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };

const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(PiecesJointes, {
      messageId: 57435, vraies: [PDF], signatures: [], ...props,
    } as never));
  });
  await calmer();
};

const vignette = () => container.querySelector('.pj-apercu') as HTMLElement;
const actions = () => [...container.querySelectorAll('.pj-actions .pj-action')];
const parLibelle = (debut: string) =>
  actions().find((a) => (a.getAttribute('aria-label') ?? '').startsWith(debut)) as HTMLElement | undefined;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① L'ŒIL — IL OUVRE LA VISIONNEUSE, ET IL EST À CÔTÉ DES DEUX AUTRES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 l’œil « Visualiser »', () => {
  it('🔴🔴 il ouvre la visionneuse sur CETTE pièce', async () => {
    const onVisualiser = vi.fn();
    await monter({ onVisualiser });
    const oeil = parLibelle('Visualiser');
    expect(oeil).toBeDefined();
    act(() => { oeil!.click(); });
    expect(onVisualiser).toHaveBeenCalledWith(20);
  });

  /**
   * 🔴 « À CÔTÉ DES DEUX PICTOS EXISTANTS, MÊME TAILLE ET MÊME STYLE » (Arno). Ils partagent donc la classe
   * `.pj-action`, qui porte la cible de 44 px et la couleur du texte — et non un style à part qui dériverait.
   */
  it('🔴 il partage la rangée et le style de ⤓ et ▲', async () => {
    await monter({ onVisualiser: vi.fn() });
    expect(actions()).toHaveLength(3);
    expect(parLibelle('Visualiser')?.className).toContain('pj-action');
    expect(parLibelle('Télécharger')?.className).toContain('pj-action');
    expect(parLibelle('Ajouter')?.className).toContain('pj-action');
    // ⚠️ L'ŒIL EST EN PREMIER : c'est le geste le plus courant des trois.
    expect(actions()[0].getAttribute('aria-label')).toContain('Visualiser');
  });

  /**
   * 🔴 UN TRACÉ, PAS UN EMOJI. « 👁 » est rendu par une police EN COULEUR qui ignore `color` : il resterait de la
   * même teinte en Clair et en Sombre. C'est la leçon du trombone (30/09/2026), et elle vaut ici.
   */
  it('🔴 l’œil est un tracé qui suit la couleur du texte', async () => {
    await monter({ onVisualiser: vi.fn() });
    const svg = parLibelle('Visualiser')?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
    expect(parLibelle('Visualiser')?.textContent).not.toContain('👁');
  });

  /**
   * ⚠️ PAS D'ŒIL QUAND IL N'OUVRIRAIT RIEN — ni sans rappel (historique d'une cible, vie d'un bien), ni sur un
   * type sans aperçu. Un bouton qui ne mènerait nulle part est pire que pas de bouton : règle de ce fichier.
   */
  it('⚠️ aucun œil sans visionneuse à ouvrir', async () => {
    await monter();                                   // aucun `onVisualiser`
    expect(parLibelle('Visualiser')).toBeUndefined();
    expect(actions()).toHaveLength(2);

    await monter({ onVisualiser: vi.fn(), vraies: [XML] });   // type sans aperçu
    expect(parLibelle('Visualiser')).toBeUndefined();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA MINIATURE — CLIC SIMPLE INERTE, DOUBLE-CLIC VERS UN NOUVEL ONGLET
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 la miniature', () => {
  it('🔴🔴 le clic simple n’ouvre PLUS la visionneuse, et n’ouvre aucun onglet', async () => {
    const onVisualiser = vi.fn();
    await monter({ onVisualiser });
    act(() => { vignette().click(); });
    expect(onVisualiser).not.toHaveBeenCalled();
    expect(ouvre).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 LE DOUBLE-CLIC OUVRE LE DOCUMENT ENTIER. L'adresse est celle du module PUR : la même route que le
   * téléchargement — donc la même source (MinIO → copie Drive → Gmail) et le même nom, nom d'usage ✎ compris.
   */
  it('🔴🔴 le double-clic ouvre le document entier dans un nouvel onglet', async () => {
    await monter({ onVisualiser: vi.fn() });
    act(() => { vignette().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(ouvre).toHaveBeenCalledWith('/api/admin/gestion/pieces/20', '_blank', 'noopener,noreferrer');
  });

  /**
   * 🔴🔴 EN INLINE, JAMAIS EN TÉLÉCHARGEMENT FORCÉ (Arno, mot pour mot). La route sert `inline` par défaut et
   * bascule en `attachment` sur `?telecharger=1` : un paramètre de trop ici ferait enregistrer le fichier au lieu
   * de l'afficher, et personne ne verrait d'où vient la différence.
   */
  it('🔴🔴 l’adresse ouverte ne porte AUCUN « telecharger=1 »', async () => {
    await monter({ onVisualiser: vi.fn() });
    act(() => { vignette().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    const adresse = String(ouvre.mock.calls[0][0]);
    expect(adresse).toBe(lienDocumentEntier(20));
    expect(adresse).not.toContain('telecharger');
    // ⚠️ ET LE TÉLÉCHARGEMENT, LUI, LE PORTE TOUJOURS : les deux gestes restent distincts.
    expect(parLibelle('Télécharger')?.getAttribute('href'))
      .toBe('/api/admin/gestion/pieces/20?telecharger=1');
  });

  /** ⚠️ MÊME SUR UN TYPE SANS APERÇU : le document s'ouvre, et le navigateur décide quoi en faire. */
  it('⚠️ un type sans aperçu s’ouvre quand même au double-clic', async () => {
    await monter({ vraies: [XML] });
    act(() => { vignette().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(ouvre).toHaveBeenCalledWith('/api/admin/gestion/pieces/21', '_blank', 'noopener,noreferrer');
  });

  /**
   * 🔴 LE CLAVIER NE PERD RIEN. Avant ce lot, la miniature des écrans sans visionneuse était un LIEN : « Entrée »
   * l'ouvrait. Un `<div onDoubleClick>` l'aurait rendue inatteignable au clavier et au lecteur d'écran — ce lot
   * ne retire rien, donc la miniature reste un bouton et « Entrée » y ouvre l'onglet.
   */
  it('🔴 « Entrée » sur la miniature ouvre l’onglet', async () => {
    await monter();
    expect(vignette().tagName).toBe('BUTTON');
    act(() => {
      vignette().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(ouvre).toHaveBeenCalledWith('/api/admin/gestion/pieces/20', '_blank', 'noopener,noreferrer');
  });

  /** ⚠️ LE GESTE EST ANNONCÉ : un double-clic ne se devine pas. */
  it('⚠️ la miniature dit ce que le double-clic fait', async () => {
    await monter({ onVisualiser: vi.fn() });
    expect(vignette().getAttribute('title')).toBe(AIDE_DOUBLE_CLIC);
    expect(vignette().getAttribute('aria-label')).toContain('nouvel onglet');
  });

  /**
   * 🔴 L'IMAGE N'EST PAS SAISISSABLE. Une image est glissable NATIVEMENT : sans `draggable={false}`, un
   * double-clic un peu traînant démarre le glisser de l'IMAGE et le second clic n'arrive jamais. Défaut déjà payé
   * une fois dans la fenêtre Drive, sur une vraie pièce.
   */
  it('🔴 la vignette n’est pas saisissable', async () => {
    await monter({ onVisualiser: vi.fn() });
    expect(container.querySelector('img.pj-vignette')?.getAttribute('draggable')).toBe('false');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ CE QUI N'EST PAS TOUCHÉ — la sélection et le glisser-déposer de la fenêtre Drive
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 la fenêtre Drive garde ses gestes', () => {
  const code = (f: string) => readFileSync(f, 'utf8');
  const DRIVE = 'app/(admin)/admin/(protected)/gestion/SelecteurFichierDrive.tsx';

  /**
   * 🔴🔴 ARNO : « S'il sert aujourd'hui à autre chose de validé (sélection pour le rangement Drive,
   * glisser-déposer), garde cet usage tel quel. »
   *
   * Dans le panneau « À ranger », la miniature n'est PAS une commande d'aperçu : elle fait partie d'une LIGNE
   * qu'on coche d'un clic (⌘ et ⇧ compris) et qu'on saisit pour la déposer dans un dossier. Elle n'est donc pas
   * touchée par ce lot — et ce test est là pour que personne ne « finisse le travail » en y posant un
   * double-clic : les deux clics qu'il émet d'abord cocheraient puis décocheraient la ligne.
   */
  it('🔴 la ligne « À ranger » coche toujours au clic et reste saisissable', () => {
    const d = code(DRIVE);
    expect(d).toContain('cliquer(e.metaKey || e.ctrlKey, e.shiftKey)');
    expect(d).toContain('onDragEnd');
    /**
     * ⚠️ ON REGARDE LA LIGNE DU PANNEAU « À RANGER », PAS TOUT LE FICHIER. L'ARBRE du Drive, lui, a DÉJÀ son
     * double-clic (« un dossier s'ouvre, un fichier se visualise — comme dans le Finder ») et il n'est pas
     * concerné : ce lot porte sur les miniatures de PIÈCES JOINTES d'un mail. Une assertion sur le fichier entier
     * aurait donc rougi pour une fonction qui n'a rien à voir — elle l'a fait, et c'est pourquoi elle est bornée.
     */
    const ligne = d.slice(d.indexOf('onDragEnd'), d.indexOf('sfd-piece-mots'));
    expect(ligne).toContain('sfd-piece-vignette');
    expect(ligne).not.toContain('onDoubleClick');
  });

  /** ⚠️ ET LES MINIATURES DE `ClasserMail` NE SONT PAS CLIQUABLES DU TOUT : il n'y avait donc rien à aligner. */
  it('⚠️ les vignettes de « Classer » restent de simples images', () => {
    const c = code('app/(admin)/admin/(protected)/gestion/ClasserMail.tsx');
    const bloc = c.slice(c.indexOf('clm-vignette'), c.indexOf('clm-piece-nom'));
    expect(bloc).not.toContain('onClick');
    expect(bloc).not.toContain('onDoubleClick');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ UNE SEULE ÉCRITURE DE L'ADRESSE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 une seule adresse pour le document entier', () => {
  it('🔴 les deux écrans passent par `lienDocumentEntier`', () => {
    for (const f of [
      'app/(admin)/admin/(protected)/gestion/PiecesJointes.tsx',
      'app/(admin)/admin/(protected)/gestion/PiecesDeLaConversation.tsx',
    ]) {
      expect(readFileSync(f, 'utf8')).toContain('lienDocumentEntier(p.pieceId)');
    }
  });

  it('⚠️ elle ne porte jamais de paramètre', () => {
    expect(lienDocumentEntier(7)).toBe('/api/admin/gestion/pieces/7');
  });
});
