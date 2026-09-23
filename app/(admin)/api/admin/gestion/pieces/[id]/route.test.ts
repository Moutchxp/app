import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const gardeMock = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const repo = { lirePieceAServir: vi.fn() };
vi.mock('../../../../../../lib/gestion/carteRepo', () => ({ lirePieceAServir: (...a: unknown[]) => repo.lirePieceAServir(...a) }));
const stockage = { recuperer: vi.fn() };
vi.mock('../../../../../../lib/stockage', () => ({ recuperer: (...a: unknown[]) => stockage.recuperer(...a) }));

import { GET } from './route';

/**
 * LOT 4c — LES OCTETS D'UNE PIÈCE JOINTE. Ce fichier tient l'exigence posée par Arno : « servies par l'application,
 * JAMAIS d'URL de stockage vers le navigateur ». Les pièces d'une boîte de gestion locative sont des baux, des RIB,
 * des constats — une URL signée serait un laissez-passer transmissible ; ici le droit est relu à chaque ouverture.
 */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const requete = (q = '') => new Request(`http://local/api/admin/gestion/pieces/7${q}`);
const PIECE = { cleStockage: 'gestion/2026/09/12/constat.pdf', nomFichier: 'constat.pdf', typeMime: 'application/pdf' };

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  repo.lirePieceAServir.mockReset(); repo.lirePieceAServir.mockResolvedValue(PIECE);
  stockage.recuperer.mockReset(); stockage.recuperer.mockResolvedValue(Buffer.from('%PDF-1.4 octets'));
});

describe('la pièce est servie PAR L’APPLICATION, jamais par une URL de stockage', () => {
  it('rend les OCTETS, avec le type et le nom du fichier', async () => {
    const res = await GET(requete(), ctx('7'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="constat.pdf"');
    expect(await res.text()).toContain('%PDF-1.4');
  });

  it('AUCUNE redirection, et la clé de stockage ne franchit PAS la réponse', async () => {
    const res = await GET(requete(), ctx('7'));
    expect(res.status).toBe(200); // ni 302 ni 307 : pas de renvoi vers MinIO/S3
    expect(res.headers.get('Location')).toBeNull();
    expect(await res.text()).not.toContain('gestion/2026');
  });

  it('`private, no-store` : ni cache partagé, ni disque — y compris sur les ERREURS', async () => {
    expect((await GET(requete(), ctx('7'))).headers.get('Cache-Control')).toBe('private, no-store');
    repo.lirePieceAServir.mockResolvedValue(null);
    const absente = await GET(requete(), ctx('7'));
    expect(absente.status).toBe(404);
    // Un navigateur peut enregistrer une réponse d'erreur SOUS LE NOM DU FICHIER attendu : elle ne doit pas non plus
    //   être conservée par un cache intermédiaire, qui la resservirait à la place de la pièce.
    expect(absente.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('le refus de la garde porte lui aussi l’en-tête, et n’ouvre AUCUN octet', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    const res = await GET(requete(), ctx('7'));
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(repo.lirePieceAServir).not.toHaveBeenCalled();
    expect(stockage.recuperer).not.toHaveBeenCalled();
  });

  it('exige le droit « gestion », relu à CHAQUE ouverture (un droit retiré ferme un lien déjà copié)', async () => {
    await GET(requete(), ctx('7'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('`?telecharger=1` propose l’enregistrement, avec le MÊME nom', async () => {
    const res = await GET(requete('?telecharger=1'), ctx('7'));
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="constat.pdf"');
  });

  it('pièce inconnue et pièce jamais déposée donnent le MÊME 404 — la réponse ne renseigne pas sur ce qui existe', async () => {
    repo.lirePieceAServir.mockResolvedValue(null);
    const res = await GET(requete(), ctx('7'));
    expect(res.status).toBe(404);
    expect(stockage.recuperer).not.toHaveBeenCalled();
  });

  it('identifiant absurde → 400, sans toucher ni la base ni le stockage', async () => {
    for (const mauvais of ['abc', '0', '-1', '1.5']) {
      expect((await GET(requete(), ctx(mauvais))).status).toBe(400);
    }
    expect(repo.lirePieceAServir).not.toHaveBeenCalled();
  });

  it('stockage muet → 503 explicite, jamais un fichier vide qui passerait pour la pièce', async () => {
    stockage.recuperer.mockRejectedValue(new Error('MinIO injoignable'));
    const res = await GET(requete(), ctx('7'));
    expect(res.status).toBe(503);
    expect((await res.json() as { erreur: string }).erreur).toMatch(/stockage/i);
  });
});

describe('sûreté du fichier servi', () => {
  it('un type absent ne devient pas un type DEVINÉ par le navigateur', async () => {
    repo.lirePieceAServir.mockResolvedValue({ ...PIECE, typeMime: null });
    const res = await GET(requete(), ctx('7'));
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('un nom de fichier piégé ne casse pas l’en-tête (anti-injection)', async () => {
    repo.lirePieceAServir.mockResolvedValue({ ...PIECE, nomFichier: 'bail"\r\nX-Injecte: 1.pdf' });
    const d = (await GET(requete(), ctx('7'))).headers.get('Content-Disposition') ?? '';
    expect(d).not.toMatch(/[\r\n]/);
    expect(d).toBe('inline; filename="bail___X-Injecte: 1.pdf"'); // le guillemet ET les deux retours sont neutralisés
  });

  it('un nom vide ne produit pas un en-tête bancal', async () => {
    repo.lirePieceAServir.mockResolvedValue({ ...PIECE, nomFichier: '' });
    expect((await GET(requete(), ctx('7'))).headers.get('Content-Disposition')).toBe('inline; filename="piece-jointe"');
  });
});

describe('ce que le CODE de la route s’interdit, vérifiable', () => {
  const src = readFileSync('app/(admin)/api/admin/gestion/pieces/[id]/route.ts', 'utf8');
  // On lit le CODE, commentaires ôtés : les commentaires de ce fichier DISENT ce qu'il ne fait pas (« aucune URL
  //   signée »), et une assertion sur le fichier entier prouverait exactement le contraire de ce qu'on veut.
  const code = src.split('\n').filter((l) => !/^\s*(\*|\/\*|\/\/)/.test(l)).join('\n');

  it('n’appelle JAMAIS `urlSignee` : aucun laissez-passer transmissible n’est fabriqué', () => {
    expect(code).not.toContain('urlSignee');
  });

  it('ne redirige pas : pas de `Response.redirect`, pas de 302', () => {
    expect(code).not.toContain('Response.redirect');
    expect(code).not.toContain('302');
  });

  it('la garde est appelée AVANT toute lecture de pièce', () => {
    expect(code.indexOf('exigerCompteActif')).toBeLessThan(code.indexOf('lirePieceAServir'));
  });
});
