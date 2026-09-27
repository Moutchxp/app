import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LOT MINIATURES-COMPLÈTES — L'APERÇU EST FABRIQUÉ DÈS L'ARRIVÉE DE LA PIÈCE (point ③ de la demande d'Arno).
 *
 * CE QUE CE FICHIER PROTÈGE, et qu'aucune relecture ne montre :
 *   ① la vignette est fabriquée PENDANT la relève, à partir des octets DÉJÀ EN MÉMOIRE — aucune relecture du
 *      stockage. Sans cela, elle n'était faite qu'au premier affichage, et une pièce jamais regardée n'en avait
 *      jamais ; pire, une pièce vidée vers le Drive avant d'être regardée n'en aurait JAMAIS PU AVOIR ;
 *   ② elle N'EST JAMAIS BLOQUANTE : un décodage qui échoue, un stockage absent, une bibliothèque qui jette — la
 *      pièce est déposée et enregistrée quand même. Une relève ne doit pas tomber pour une vignette ;
 *   ③ un échec TRANSITOIRE n'est pas inscrit : la complétion reprendra la pièce. Seul un échec du FICHIER l'est.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
  pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
}));

/** Le stockage : on note ce qui est déposé, sans jamais parler à MinIO. */
const deposesPieces: unknown[] = [];
const deposesMiniatures: { pieceId: number; octets: number }[] = [];
let depotMiniatureMarche = true;
vi.mock('../stockage', () => ({
  deposerPieceGestion: async (contenu: Buffer) => {
    deposesPieces.push(contenu);
    return { depose: true, cle: 'gestion/messages/1/abc.pdf', taille: contenu.byteLength, empreinte: 'sha' };
  },
  deposerMiniatureGestion: async (octets: Buffer, pieceId: number) => {
    if (!depotMiniatureMarche) return { depose: false, motif: 'stockage non configuré' };
    deposesMiniatures.push({ pieceId, octets: octets.byteLength });
    return { depose: true, cle: `gestion/miniatures/${pieceId}/v.jpg` };
  },
}));

/** La fabrique de vignettes : pilotée par le test, jamais le vrai décodeur (ni `sharp`, ni le WebAssembly). */
let issueMiniature: { ok: true; octets: Buffer; largeur: number; hauteur: number } | { ok: false; motif: string } =
  { ok: true, octets: Buffer.from('JPEG'), largeur: 226, hauteur: 319 };
const appelsGeneration: { nom: string; typeMime: string | null; octets: number }[] = [];
/** Quand il est posé, la fabrique JETTE au lieu de rendre un motif : le cas d'une bibliothèque qui explose. */
let generationJette: Error | null = null;
vi.mock('./miniature', () => ({
  genererMiniature: async (octets: Buffer, typeMime: string | null, nom: string) => {
    appelsGeneration.push({ nom, typeMime, octets: octets.byteLength });
    if (generationJette !== null) throw generationJette;
    return issueMiniature;
  },
  TYPE_MINIATURE: 'image/jpeg',
}));

const memorises: { pieceId: number; cle: string }[] = [];
const echecsMemorises: { pieceId: number; motif: string }[] = [];
vi.mock('./piecesRepo', () => ({
  memoriserMiniature: async (pieceId: number, cle: string) => { memorises.push({ pieceId, cle }); return true; },
  memoriserEchecMiniature: async (pieceId: number, motif: string) => { echecsMemorises.push({ pieceId, motif }); return true; },
}));

import { deposerPiecesMessage } from './captureRepo';

const CONFIG = { typesPiecesAcceptes: ['application/pdf', 'image/jpeg'], pieceTailleMaxOctets: 40 * 1024 * 1024 } as never;
const piecePdf = (nom = 'Appel_Fonds_Q1.pdf', typeMime: string | null = 'application/pdf') => ({
  nomFichier: nom, typeMime, contenu: Buffer.from('%PDF-1.4 des octets'), tailleOctets: 19,
});

beforeEach(() => {
  deposesPieces.length = 0; deposesMiniatures.length = 0; appelsGeneration.length = 0;
  memorises.length = 0; echecsMemorises.length = 0;
  depotMiniatureMarche = true; generationJette = null;
  issueMiniature = { ok: true, octets: Buffer.from('JPEG'), largeur: 226, hauteur: 319 };
  queryMock.mockReset();
  // L'INSERT de la pièce rend son identifiant : c'est lui qui sert à ranger la vignette.
  queryMock.mockImplementation(async (sql: string) => (
    String(sql).includes('RETURNING') ? { rows: [{ id: '4242' }] } : { rows: [] }));
});

describe('🔴 ① la vignette est faite pendant la relève, sans relire le stockage', () => {
  it('une pièce déposée reçoit son aperçu dans la foulée', async () => {
    const r = await deposerPiecesMessage(1, [piecePdf()], CONFIG);
    expect(r).toEqual({ deposees: 1, nonDeposees: 0 });
    expect(appelsGeneration).toHaveLength(1);
    expect(deposesMiniatures).toEqual([{ pieceId: 4242, octets: 4 }]);
    expect(memorises).toEqual([{ pieceId: 4242, cle: 'gestion/miniatures/4242/v.jpg' }]);
  });

  /**
   * 🔴 LES MÊMES OCTETS, PAS UNE RELECTURE. Ils viennent d'être déposés : les redemander au stockage serait payer
   * deux fois le même fichier à chaque relève — et, pour une pièce vidée plus tard, arriver trop tard.
   */
  it('🔴 ce sont les octets DÉJÀ EN MÉMOIRE qui servent — aucune lecture du stockage', async () => {
    const p = piecePdf();
    await deposerPiecesMessage(1, [p], CONFIG);
    expect(appelsGeneration[0].octets).toBe(p.contenu.byteLength);
    expect(appelsGeneration[0].nom).toBe('Appel_Fonds_Q1.pdf');
  });

  it('un type sans aperçu n’ouvre même pas ses octets, et n’inscrit rien', async () => {
    await deposerPiecesMessage(1, [piecePdf('facture.xml', 'application/xml')], CONFIG);
    expect(appelsGeneration).toEqual([]);
    expect(echecsMemorises).toEqual([]);
    expect(deposesMiniatures).toEqual([]);
  });
});

describe('🔴 ② jamais bloquante : une relève ne tombe pas pour une vignette', () => {
  it('la fabrique échoue : la pièce est tout de même déposée et enregistrée', async () => {
    issueMiniature = { ok: false, motif: 'Invalid PDF structure' };
    const r = await deposerPiecesMessage(1, [piecePdf()], CONFIG);
    expect(r).toEqual({ deposees: 1, nonDeposees: 0 });
    expect(deposesPieces).toHaveLength(1);
  });

  it('la fabrique JETTE : la relève continue, en silence', async () => {
    generationJette = new Error('wasm hors mémoire');
    const r = await deposerPiecesMessage(1, [piecePdf()], CONFIG);
    expect(r).toEqual({ deposees: 1, nonDeposees: 0 });
    expect(echecsMemorises).toEqual([]); // rien inscrit : la complétion reprendra
  });

  it('le stockage refuse la vignette : la pièce reste déposée, rien n’est inscrit', async () => {
    depotMiniatureMarche = false;
    const r = await deposerPiecesMessage(1, [piecePdf()], CONFIG);
    expect(r).toEqual({ deposees: 1, nonDeposees: 0 });
    expect(memorises).toEqual([]);
    expect(echecsMemorises).toEqual([]);
  });
});

describe('🔴 ③ seul un échec du FICHIER est inscrit', () => {
  it('fichier illisible → inscrit : on ne redécodera pas à chaque affichage', async () => {
    issueMiniature = { ok: false, motif: 'PDF sans page' };
    await deposerPiecesMessage(1, [piecePdf()], CONFIG);
    expect(echecsMemorises).toEqual([{ pieceId: 4242, motif: 'PDF sans page' }]);
  });

  /** Un délai dépassé pendant une relève chargée ne dit RIEN du fichier : l'inscrire l'effacerait pour toujours. */
  it('🔴 délai dépassé → RIEN inscrit : la complétion reprendra la pièce', async () => {
    issueMiniature = { ok: false, motif: 'fabrication de la miniature : délai de 15000 ms dépassé' };
    await deposerPiecesMessage(1, [piecePdf()], CONFIG);
    expect(echecsMemorises).toEqual([]);
  });
});

describe('plusieurs pièces', () => {
  it('chacune a la sienne, et l’échec de l’une n’empêche pas les autres', async () => {
    const r = await deposerPiecesMessage(1, [piecePdf('a.pdf'), piecePdf('b.jpg', 'image/jpeg')], CONFIG);
    expect(r.deposees).toBe(2);
    expect(appelsGeneration.map((a) => a.nom)).toEqual(['a.pdf', 'b.jpg']);
    expect(deposesMiniatures).toHaveLength(2);
  });
});
