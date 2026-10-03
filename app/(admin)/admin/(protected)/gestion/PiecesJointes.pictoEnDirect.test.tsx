// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PiecesJointes } from './PiecesJointes';
import { annoncerPiecesDrive } from '../../../../lib/gestion/signalPieceDrive';

/**
 * ══ 🔴🔴 LOT PASTILLE-DRIVE-EN-DIRECT — LE PICTO CYLINDRE PARAÎT SANS RECHARGEMENT ═══════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (03/10/2026, fil 36669 / message 57427, « test gigout.pdf ») : « de retour dans le mail, la
 * miniature n'a pas le picto cylindre ».
 *
 * 🔴 LA CAUSE, LUE DANS LE CODE ET REPRODUITE ICI. Le statut Drive des pièces est tenu à DEUX endroits
 * indépendants — les cartes d'un mail (ce composant) et le récapitulatif de la conversation — et chacun n'était
 * rafraîchi que par SA PROPRE fenêtre de rangement (`onRangement`). Ranger depuis l'un laissait l'autre sur son
 * image d'avant ; et `HistoriqueCible` comme `VieDuBien` montent eux aussi ce composant.
 *
 * 🔴 MESURÉ EN BASE : la ligne du registre existait bien (`gestion_piece_drive` id 26554, pièce 27085, déposée à
 * 21:37:35). Le serveur SAVAIT ; l'écran ne lui avait rien redemandé.
 *
 * 🔴 VÉRIFIÉ : en retirant l'abonnement `ecouterPiecesDrive` de `PiecesJointes`, les deux premières épreuves de ce
 * fichier retombent sur « aucun picto ». C'est le défaut, dans sa forme exacte.
 *
 * ⚠️ AUCUN RÉSEAU, AUCUNE DONNÉE RÉELLE : un `fetch` de doublure, et un message inventé.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MESSAGE = 57427;
const PIECE_ID = 27085;

const PIECE = {
  pieceId: PIECE_ID, nomFichier: 'test gigout.pdf', typeMime: 'application/pdf', tailleOctets: 84_213,
  disponible: true, motifNonStocke: null,
};

let container: HTMLDivElement;
let root: Root;
/** Ce que la route `/messages/[id]/drive` annonce. Vide au départ : la pièce n'est rangée nulle part. */
let emplacements: { pieceId: number; emplacements: unknown[] }[];
/** Combien de fois l'écran a demandé le statut : c'est ce nombre qui prouve qu'il a REDEMANDÉ. */
let lectures: number;

const EMPLACEMENT = {
  driveFileId: 'F1', nom: 'test gigout.pdf', dossierId: 'd1', dossierNom: 'Test creation dossier drive',
  chemin: [{ id: 'd1', nom: 'Test creation dossier drive' }], voie: 'registre',
};

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  emplacements = [];
  lectures = 0;
  vi.stubGlobal('fetch', vi.fn(async (u: unknown) => {
    const url = String(u);
    if (url.includes(`/messages/${MESSAGE}/drive`)) {
      lectures += 1;
      return new Response(JSON.stringify({ etat: 'ok', depots: [], emplacements }), { status: 200 });
    }
    if (url.includes('/gestion/google')) {
      return new Response(JSON.stringify({ etat: 'ok', message: '', adresse: 'a@b.c' }), { status: 200 });
    }
    return new Response(JSON.stringify({ etat: 'ok' }), { status: 200 });
  }));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

const monter = async () => {
  await act(async () => {
    root.render(createElement(PiecesJointes, {
      messageId: MESSAGE, filId: 36669, vraies: [PIECE], signatures: [],
    } as never));
  });
  await calmer();
};

/** 🔴 LE PICTO CYLINDRE : il n'apparaît QUE si cette pièce est déjà dans le Drive. */
const picto = () => container.querySelector('.pdd button');

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LE DÉFAUT D'ARNO, ET SA CORRECTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le picto cylindre, en direct', () => {
  /** ⚠️ PAS UN BOUTON ÉTEINT, PAS UNE PLACE RÉSERVÉE : le picto est ABSENT quand la pièce n'y est pas. */
  it('⚠️ pièce rangée nulle part : aucun picto', async () => {
    await monter();
    expect(picto()).toBeNull();
  });

  /**
   * 🔴🔴 L'ÉPREUVE DU CONSTAT D'ARNO. Une autre fenêtre vient de ranger la pièce ; le serveur le sait ; l'écran
   * du mail doit le redemander SANS rechargement.
   */
  it('🔴🔴 une autre fenêtre range : le picto paraît sans rechargement', async () => {
    await monter();
    expect(picto()).toBeNull();
    const avant = lectures;

    // ① Le serveur sait désormais où la pièce est rangée (c'est ce que la route du dépôt vient d'écrire).
    emplacements = [{ pieceId: PIECE_ID, emplacements: [EMPLACEMENT] }];
    // ② Et la fenêtre Drive l'annonce — c'est exactement ce que fait `ranger` après un dépôt réussi.
    await act(async () => { annoncerPiecesDrive([PIECE_ID]); });
    await calmer();

    expect(lectures).toBeGreaterThan(avant);
    expect(picto()).not.toBeNull();
    expect(picto()?.getAttribute('title')).toBe('Pièce jointe dans le Drive');
  });

  /**
   * 🔴 ET IL DISPARAÎT QUAND LA PIÈCE N'Y EST PLUS. C'est la contrepartie : « la corbeille fait redescendre le
   * compteur » vaut aussi pour le picto, sinon il mènerait à un emplacement vide.
   */
  it('🔴 la pièce quitte le Drive : le picto s’en va', async () => {
    emplacements = [{ pieceId: PIECE_ID, emplacements: [EMPLACEMENT] }];
    await monter();
    expect(picto()).not.toBeNull();
    emplacements = [];
    await act(async () => { annoncerPiecesDrive(); });
    await calmer();
    expect(picto()).toBeNull();
  });

  /**
   * ⚠️ ON NE RELIT PAS POUR LES PIÈCES DES AUTRES. Une conversation peut avoir douze messages dépliés, donc douze
   * instances de ce composant : les faire toutes relire pour une pièce qui n'appartient qu'à l'une d'elles ferait
   * douze requêtes au lieu d'une.
   */
  it('⚠️ un signal qui ne nous concerne pas ne déclenche AUCUNE lecture', async () => {
    await monter();
    const avant = lectures;
    await act(async () => { annoncerPiecesDrive([999_999]); });
    await calmer();
    expect(lectures).toBe(avant);
  });

  /**
   * 🔴 « ON NE SAIT PAS LESQUELLES » FAIT RELIRE. C'est le cas d'un geste sur un FICHIER du Drive (corbeille,
   * déplacement, annulation) : ne pas savoir doit faire relire, jamais faire ignorer.
   */
  it('🔴 un signal sans liste de pièces fait relire', async () => {
    await monter();
    const avant = lectures;
    await act(async () => { annoncerPiecesDrive(); });
    await calmer();
    expect(lectures).toBeGreaterThan(avant);
  });

  /** ⚠️ ET L'ÉCRAN DÉMONTÉ CESSE D'ÉCOUTER : un auditeur mort relirait pour un composant qui n'existe plus. */
  it('⚠️ démonté, il ne lit plus', async () => {
    await monter();
    await act(async () => { root.unmount(); });
    const avant = lectures;
    await act(async () => { annoncerPiecesDrive(); });
    await calmer();
    expect(lectures).toBe(avant);
    // Remonté pour que le nettoyage de fin de test ait quelque chose à démonter.
    root = createRoot(container);
  });
});
