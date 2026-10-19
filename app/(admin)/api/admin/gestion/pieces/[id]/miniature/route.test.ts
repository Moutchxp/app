import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /api/admin/gestion/pieces/[id]/miniature — LA VIGNETTE D'UNE PIÈCE JOINTE (régression du 19/10/2026 : plus aucune
 * miniature depuis l'arrêt du stockage objet du Mac par la bascule du 15/10). Rien de réel : stockage, Drive, base simulés.
 *   · image dont la vignette est déposée → servie ;
 *   · PDF jamais vignetté, octets dans le stockage → fabriquée, déposée, retenue ;
 *   · pièce dans le Drive, stockage ÉTEINT → fabriquée depuis le Drive et SERVIE (avant : 503), gardée en mémoire ;
 *   · pièce introuvable → 404, l'écran garde son étiquette de type, et rien n'est mémorisé comme échec.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));

type Etat = { etat: 'ok' | 'echec' | null; cleMiniature: string | null; cleStockage: string | null; typeMime: string; nomFichier: string } | null;
let etats: Record<number, Etat>;
const memoriserMiniature = vi.fn(async () => undefined);
const memoriserEchecMiniature = vi.fn(async () => undefined);
vi.mock('../../../../../../../lib/gestion/piecesRepo', () => ({
  lireEtatMiniature: async (id: number) => etats[id] ?? null,
  memoriserMiniature: (...a: unknown[]) => memoriserMiniature(...(a as [])),
  memoriserEchecMiniature: (...a: unknown[]) => memoriserEchecMiniature(...(a as [])),
}));
let stockageEteint: boolean; const deposes: string[] = [];
const VIGNETTE_DEPOSEE = Buffer.from('jpeg-depose');
vi.mock('../../../../../../../lib/stockage', () => ({
  recuperer: async (cle: string) => { if (stockageEteint) throw new Error('connect ECONNREFUSED 127.0.0.1:9000'); if (cle.startsWith('miniatures/')) return VIGNETTE_DEPOSEE; throw new Error('NoSuchKey'); },
  deposerMiniatureGestion: async (_o: Buffer, id: number) => {
    if (stockageEteint) throw new Error('connect ECONNREFUSED 127.0.0.1:9000');
    deposes.push(`miniatures/${id}.jpg`); return { depose: true, cle: `miniatures/${id}.jpg` };
  },
}));
let sources: Record<number, 'stockage' | 'drive' | null>; const lectures: number[] = [];
vi.mock('../../../../../../../lib/gestion/octetsPiece', () => ({
  lireOctetsPiece: async (p: { pieceId: number }) => {
    lectures.push(p.pieceId);
    const s = sources[p.pieceId];
    if (s === 'drive' || (s === 'stockage' && !stockageEteint)) return { ok: true, octets: Buffer.from(`octets-${p.pieceId}`), source: s === 'drive' ? 'drive' : 'minio', md5: 'x' };
    return { ok: false, motif: 'aucune source', essais: [] };
  },
}));
vi.mock('../../../../../../../lib/gestion/octetsPieceCablage', () => ({
  lirePiecesALire: async () => new Map(), depsOctetsPiece: () => ({}),
}));
vi.mock('../../../../../../../lib/gestion/miniature', () => ({
  TYPE_MINIATURE: 'image/jpeg', DEPOT_MAX_OCTETS: 2 * 1024 * 1024, MOTIF_MINIATURE_NAVIGATEUR: 'miniature vidéo',
  genererMiniature: async (o: Buffer) => ({ ok: true, octets: Buffer.concat([Buffer.from('jpeg-de-'), o]) }),
  miniatureDepuisImageDeposee: async () => ({ ok: false, motif: 'non' }),
}));
const { GET } = await import('./route');
const { cacheMiniatures } = await import('../../../../../../../lib/gestion/cacheMiniatures');
const appel = (id: number) => GET(new Request(`http://localhost/api/admin/gestion/pieces/${id}/miniature`), { params: Promise.resolve({ id: String(id) }) } as never);

beforeEach(() => {
  stockageEteint = false; deposes.length = 0; lectures.length = 0; memoriserMiniature.mockClear(); memoriserEchecMiniature.mockClear();
  for (const id of [1, 2, 3, 4, 5]) cacheMiniatures.oublier(id);
  etats = {
    1: { etat: 'ok', cleMiniature: 'miniatures/1.jpg', cleStockage: 'pieces/1', typeMime: 'image/jpeg', nomFichier: 'photo.jpg' },
    2: { etat: null, cleMiniature: null, cleStockage: 'pieces/2', typeMime: 'application/pdf', nomFichier: 'bail.pdf' },
    3: { etat: 'ok', cleMiniature: 'miniatures/3.jpg', cleStockage: 'pieces/3', typeMime: 'application/pdf', nomFichier: 'devis.pdf' },
    5: { etat: 'echec', cleMiniature: null, cleStockage: 'pieces/5', typeMime: 'application/zip', nomFichier: 'a.zip' },
  };
  sources = { 1: 'stockage', 2: 'stockage', 3: 'drive', 4: null, 5: null };
});

describe('la vignette d’une pièce jointe', () => {
  it('image : la vignette déposée est servie, en JPEG, avec un cache navigateur', async () => {
    const r = await appel(1);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/jpeg');
    expect(r.headers.get('Cache-Control')).toMatch(/max-age/);
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('jpeg-depose');
    expect(lectures).toEqual([]);
  });
  it('PDF jamais vignetté : fabriquée depuis ses octets, déposée et retenue', async () => {
    const r = await appel(2);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('jpeg-de-octets-2');
    expect(deposes).toEqual(['miniatures/2.jpg']);
    expect(memoriserMiniature).toHaveBeenCalledWith(2, 'miniatures/2.jpg');
  });
  it('🔴 RÉGRESSION : pièce dans le Drive, stockage ÉTEINT → la vignette est fabriquée depuis le Drive et SERVIE (plus de 503)', async () => {
    stockageEteint = true;
    const r = await appel(3);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('jpeg-de-octets-3');
    expect(memoriserMiniature).not.toHaveBeenCalled();
    // L'affichage suivant ne relit pas le Drive : la vignette est gardée EN MÉMOIRE (rien de durable).
    const r2 = await appel(3);
    expect(r2.status).toBe(200);
    expect(lectures).toEqual([3]);
    // Le stockage revenu : la vignette déposée reprend la main, et la mémoire est vidée.
    stockageEteint = false;
    expect(Buffer.from(await (await appel(3)).arrayBuffer()).toString()).toBe('jpeg-depose');
    expect(cacheMiniatures.lire(3)).toBeNull();
  });
  it('pièce introuvable → 404 (l’écran garde son étiquette de type), sans mémoriser d’échec ; pièce inconnue → 404', async () => {
    etats[4] = { etat: null, cleMiniature: null, cleStockage: null, typeMime: 'image/png', nomFichier: 'x.png' };
    const r = await appel(4);
    expect(r.status).toBe(404);
    expect(memoriserEchecMiniature).not.toHaveBeenCalled();
    expect((await appel(99)).status).toBe(404);
  });
  it('un échec déjà constaté (type sans miniature) n’est pas retenté → 404', async () => {
    expect((await appel(5)).status).toBe(404);
    expect(lectures).toEqual([]);
  });
});
