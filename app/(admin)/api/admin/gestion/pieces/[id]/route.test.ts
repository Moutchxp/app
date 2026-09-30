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

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 DÉFAUT TROUVÉ DANS LA NUIT DU 27/09/2026, en éprouvant la route par le VRAI chemin de l'application (requête
   * HTTP depuis la page, avec la session réelle). Deux pièces sur dix arrivaient sous un nom ABÎMÉ :
   * « mandat de gestion signé.pdf » était reçu « mandat de gestion signÃ©.pdf » — vérifié octet par octet, l'en-tête
   * portait l'UTF-8 brut que HTTP relit en ISO-8859-1.
   *
   * Aucun test ne pouvait le voir : tous n'employaient que des noms ASCII, sur lesquels le défaut est invisible. Or
   * une gestion locative française nomme ses pièces « signé », « état des lieux », « Thaïs »…
   *
   * ⚠️ LE DÉFAUT ÉTAIT ANTÉRIEUR AU VIDAGE : il frappait aussi les pièces servies depuis MinIO. Ce n'est donc pas la
   * lecture Drive qui l'a introduit — c'est elle qui l'a fait découvrir.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 un nom ACCENTUÉ arrive intact : les deux formes, dont `filename*=UTF-8`', async () => {
    repo.lirePieceAServir.mockResolvedValue({ ...PIECE, nomFichier: 'mandat de gestion signé.pdf' });
    const d = (await GET(requete(), ctx('7'))).headers.get('Content-Disposition') ?? '';
    // La forme qui l'emporte chez tous les clients modernes : le nom EXACT, encodé.
    expect(d).toContain("filename*=UTF-8''mandat%20de%20gestion%20sign%C3%A9.pdf");
    // Et le repli translittéré pour les clients anciens : lisible, sans caractère inventé.
    expect(d).toContain('filename="mandat de gestion signe.pdf"');
    // 🔴 ET SURTOUT : plus jamais d'UTF-8 BRUT dans l'en-tête, qui est ce qui produisait le mojibake.
    expect(d).not.toContain('signé.pdf');
    // Un en-tête HTTP ne porte que de l'ASCII imprimable.
    expect(d).toMatch(/^[\x20-\x7E]*$/);
  });

  it('un nom purement ASCII reste ÉCRIT EN CLAIR : on n’encode pas ce qui n’en a pas besoin', async () => {
    // Un en-tête lisible se diagnostique à l'œil dans un journal ; encoder par réflexe le rendrait illisible.
    repo.lirePieceAServir.mockResolvedValue({ ...PIECE, nomFichier: 'constat.pdf' });
    expect((await GET(requete(), ctx('7'))).headers.get('Content-Disposition'))
      .toBe('inline; filename="constat.pdf"');
  });

  it('un nom accentué ET piégé : l’anti-injection passe AVANT l’encodage', async () => {
    repo.lirePieceAServir.mockResolvedValue({ ...PIECE, nomFichier: 'bail signé"\r\nX-Injecte: 1.pdf' });
    const d = (await GET(requete(), ctx('7'))).headers.get('Content-Disposition') ?? '';
    expect(d).not.toMatch(/[\r\n]/);
    // 🔴 EXACTEMENT DEUX GUILLEMETS : ceux qui délimitent `filename="…"`. Le guillemet injecté a été neutralisé, et
    //   il n'a donc pas pu refermer la valeur pour ajouter un en-tête de son cru.
    expect((d.match(/"/g) ?? []).length).toBe(2);
    expect(d).toContain("filename*=UTF-8''");
    // L'accent est encodé dans la forme RFC 2231, et translittéré dans le repli — jamais d'UTF-8 brut.
    expect(d).toContain('sign%C3%A9');
    expect(d).not.toContain('signé');
  });
});

/**
 * ══ 🔴🔴 LOT PIECES-DE-LA-CONVERSATION — LES TRANCHES (`Range`) ════════════════════════════════════════════════════
 *
 * CE QUE ÇA REND POSSIBLE, ET QUI NE L'ÉTAIT PAS. Cette route servait TOUJOURS le fichier entier. Deux conséquences
 * mesurées ailleurs dans le module :
 *   ① PDF.js attend le document complet avant de peindre le premier pixel (1 117 ms contre 13 646 ms sur un acte de
 *      3,3 Mo, mesuré côté Drive le 29/09/2026 — c'est le même mécanisme) ;
 *   ② le préchargement d'un voisin, demandé par Arno « début du fichier seulement », était impossible : il aurait
 *      tiré douze mégaoctets pour un document que personne ne regarde encore.
 *
 * 🔒 UNE TRANCHE N'EST QU'UNE DÉCOUPE DE CE QU'ON AVAIT DÉJÀ LE DROIT DE LIRE : le droit `gestion` est relu au début
 * de la requête, comme pour toute autre. C'est ce que garde le dernier test de ce bloc.
 */
const requeteTranche = (intervalle: string) => new Request('http://local/api/admin/gestion/pieces/7', {
  headers: { Range: intervalle },
});

describe('🔴🔴 les tranches : servir le DÉBUT d’une pièce sans servir tout le fichier', () => {
  beforeEach(() => {
    // 26 octets, pour que les bornes se lisent à l'œil dans les assertions.
    stockage.recuperer.mockResolvedValue(Buffer.from('abcdefghijklmnopqrstuvwxyz'));
  });

  /**
   * ══ 🔴🔴 ELLE NE L'ANNONCE PAS — ET C'EST MESURÉ, PAS SUPPOSÉ ═══════════════════════════════════════════
   *
   * Première écriture de ce lot : `Accept-Ranges: bytes`, pour que PDF.js n'attende plus le fichier entier.
   * MESURÉ À L'ÉCRAN LE 30/09/2026, sur EDLS.pdf (3 194 577 o, 16 pages), AVEC puis SANS l'en-tête : dans les
   * deux cas PDF.js émet DEUX requêtes SANS `Range`, pour 4 243 753 octets transférés. Il n'active son mode
   * « tranches » que si la réponse porte un `Content-Length`, que Next ne met pas sur un flux. L'annoncer ne
   * change donc AUCUNE requête aujourd'hui — et le jour où ce `Content-Length` apparaîtrait, PDF.js se mettrait
   * à découper, chaque morceau payant une lecture COMPLÈTE de l'objet chez MinIO (le piège déjà mesuré côté
   * Drive : « tranches de 128 Kio, 20 requêtes, 13 646 ms — douze fois PIRE », supportable là-bas grâce à la
   * mémoire courte des octets, que cette route-ci n'a pas).
   *
   * 🔴 LA RÈGLE D'ARNO EST « le temps d'ouverture de la page 1 ne doit pas se dégrader ». Un en-tête qui
   * n'apporte rien et qui peut coûter cher ne se met pas. La tranche reste servie à qui la demande
   * explicitement — c'est tout ce dont le préchargement d'un voisin a besoin.
   */
  it('🔴🔴 la route n’ANNONCE PAS les tranches — elle les sert à qui les demande', async () => {
    const res = await GET(requete(), ctx('7'));
    expect(res.headers.get('Accept-Ranges')).toBeNull();
  });

  it('🔴 un début de fichier est rendu en 206, avec sa position et la taille TOTALE', async () => {
    const res = await GET(requeteTranche('bytes=0-3'), ctx('7'));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-3/26');
    expect(await res.text()).toBe('abcd');
  });

  /** ⚠️ `bytes=N-` : depuis un point jusqu'au bout. C'est la forme d'une reprise de téléchargement. */
  it('une tranche ouverte va jusqu’au bout', async () => {
    const res = await GET(requeteTranche('bytes=23-'), ctx('7'));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 23-25/26');
    expect(await res.text()).toBe('xyz');
  });

  /**
   * 🔴 `bytes=-N` : les N DERNIERS octets. C'est ainsi que PDF.js va chercher la table d'index, qui est à la FIN
   * d'un PDF. L'oublier ferait retomber sur le fichier entier à chaque ouverture — donc perdre tout le gain.
   */
  it('🔴 les N derniers octets (la table d’index d’un PDF) sont servis', async () => {
    const res = await GET(requeteTranche('bytes=-4'), ctx('7'));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 22-25/26');
    expect(await res.text()).toBe('wxyz');
  });

  /**
   * 🔴🔴 UNE DEMANDE ILLISIBLE OU HORS BORNES REND LE FICHIER ENTIER, JAMAIS UNE ERREUR — c'est le comportement
   * d'avant ce lot, et c'est ce qui garantit que rien ne peut casser : au pire, on retombe exactement sur l'ancien.
   */
  it('🔴 une demande illisible ou hors bornes rend le fichier ENTIER (200)', async () => {
    // ⚠️ Un en-tête HTTP ne transporte que des octets : les valeurs d'épreuve restent en pur ASCII.
    for (const mauvaise of ['bytes=nimporte quoi', 'lignes=0-10', 'bytes=-', 'bytes=99-', 'bytes=5-2']) {
      const res = await GET(requeteTranche(mauvaise), ctx('7'));
      expect(res.status, mauvaise).toBe(200);
      expect(res.headers.get('Content-Range'), mauvaise).toBeNull();
      expect(await res.text(), mauvaise).toHaveLength(26);
    }
  });

  it('une tranche garde le type, le nom et `private, no-store`', async () => {
    const res = await GET(requeteTranche('bytes=0-3'), ctx('7'));
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="constat.pdf"');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  /** 🔒 ET LE DROIT EST RELU AVANT, COMME TOUJOURS : une tranche n'est pas une porte dérobée. */
  it('🔒 une tranche demandée sans le droit « gestion » n’ouvre AUCUN octet', async () => {
    gardeMock.mockResolvedValue(new Response('non', { status: 403 }));
    const res = await GET(requeteTranche('bytes=0-3'), ctx('7'));
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(stockage.recuperer).not.toHaveBeenCalled();
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
