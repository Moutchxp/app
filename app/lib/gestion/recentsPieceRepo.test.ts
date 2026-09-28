import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴 LOT EDITEUR-PJ — L'HISTORIQUE DES PIÈCES ET DES DOSSIERS.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce qui est protégé ici, et qui casse d'une façon reconnaissable :
 *   ① 🔴🔴 SANS LA MIGRATION 269, LA TABLE N'EST NOMMÉE NULLE PART. C'est la règle de tout le module : une requête
 *      qui nommerait une table absente ferait échouer TOUT l'écran, pas seulement la nouveauté.
 *   ② 🔴 UNE CIBLE NE SE DUPLIQUE PAS : rejoindre douze fois le même bail doit donner UNE ligne en tête, pas douze.
 *   ③ 🔴 L'HISTORIQUE EST CELUI D'UNE PERSONNE : le compte est toujours LIÉ en premier paramètre.
 *   ④ 🔴 UNE CLÉ DE STOCKAGE N'EST RENDUE QUE SI ELLE APPARTIENT AU COMPTE. C'est la garde du point 7 : sans elle,
 *      une clé envoyée par l'écran ferait de n'importe quel objet du seau une pièce jointe.
 *   ⑤ NOTER EST UN CONFORT : une écriture qui échoue ne doit JAMAIS faire échouer une pièce jointe.
 *
 * On teste le COMPORTEMENT (paramètres LIÉS, valeurs rendues) et des FRAGMENTS SÉMANTIQUES sur un SQL normalisé —
 * jamais la forme exacte de la requête émise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const migration269 = vi.fn(async () => true);
vi.mock('./schema', () => ({ piecesRecentesDisponibles: () => migration269() }));

import { cleLocaleDuRecent, listerRecents, noterRecent, RECENTS_MAX } from './recentsPieceRepo';

const sql = (i = 0) => String(queryMock.mock.calls[i]?.[0] ?? '').replace(/\s+/g, ' ');
const params = (i = 0) => (queryMock.mock.calls[i]?.[1] ?? []) as unknown[];

const ligne = (o: Record<string, unknown> = {}) => ({
  sorte: 'locale', cle: 'gestion/brouillon/12/a.pdf', libelle: 'bail.pdf',
  detail: 'application/pdf', taille_octets: '4096', dernier_le: '2026-09-28T18:00:00Z', ...o,
});

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  migration269.mockResolvedValue(true);
});

describe('🔴🔴 ① sans la migration 269, la table n’est nommée NULLE PART', () => {
  it('lister ne fait AUCUNE requête, et le DIT au lieu de rendre une liste vide', async () => {
    migration269.mockResolvedValue(false);
    const r = await listerRecents(7, ['locale']);
    expect(r).toEqual({ lignes: [], disponible: false });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('noter ne fait AUCUNE requête, et rend `false` sans jeter', async () => {
    migration269.mockResolvedValue(false);
    expect(await noterRecent({ compteId: 7, sorte: 'locale', cle: 'k', libelle: 'x' })).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('la clé d’une pièce récente n’est pas cherchée non plus', async () => {
    migration269.mockResolvedValue(false);
    expect(await cleLocaleDuRecent(7, 'k')).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴 « disponible: false » N'EST PAS « liste vide ». Une liste vide se lit « vous n'avez rien joint » ; l'absence
   * de migration se lit « cette fonction n'est pas encore installée ». L'écran doit pouvoir les distinguer, sinon
   * il affiche une section vide que personne ne comprend.
   */
  it('avec la migration mais sans rien en base, `disponible` reste VRAI', async () => {
    const r = await listerRecents(7, ['locale']);
    expect(r.disponible).toBe(true);
    expect(r.lignes).toEqual([]);
  });
});

describe('🔴 ② une cible REMONTE, elle ne se duplique pas', () => {
  it('l’écriture est un `ON CONFLICT` sur (compte, sorte, clé), et elle incrémente le compte d’usages', async () => {
    await noterRecent({ compteId: 7, sorte: 'drive_fichier', cle: 'abc', libelle: 'bail.pdf' });
    const s = sql();
    expect(s).toContain('ON CONFLICT (compte_id, sorte, cle) DO UPDATE');
    expect(s).toContain('dernier_le = now()');
    expect(s).toContain('nb_usages = gestion_piece_recente.nb_usages + 1');
  });

  it('le libellé est RAFRAÎCHI : un fichier renommé chez Google reprend son nom courant', async () => {
    await noterRecent({ compteId: 7, sorte: 'drive_fichier', cle: 'abc', libelle: 'nouveau nom.pdf' });
    expect(sql()).toContain('libelle = EXCLUDED.libelle');
    expect(params()[3]).toBe('nouveau nom.pdf');
  });

  /** Un détail ou une taille absents ne doivent pas EFFACER ceux qu'on connaissait déjà. */
  it('un détail absent ne remplace pas celui qu’on avait', async () => {
    await noterRecent({ compteId: 7, sorte: 'drive_dossier', cle: 'd1', libelle: 'Artisans' });
    expect(sql()).toContain('coalesce(EXCLUDED.detail, gestion_piece_recente.detail)');
    expect(sql()).toContain('coalesce(EXCLUDED.taille_octets, gestion_piece_recente.taille_octets)');
  });
});

describe('🔴 ③ l’historique est celui d’UNE PERSONNE, et le tri est « le plus récent d’abord »', () => {
  it('le compte est LIÉ, jamais interpolé', async () => {
    await listerRecents(7, ['locale', 'drive_fichier']);
    expect(params()[0]).toBe(7);
    expect(params()[1]).toEqual(['locale', 'drive_fichier']);
    expect(sql()).toContain('WHERE compte_id = $1');
  });

  it('🔴 le plus récent est en PREMIER — c’est la demande d’Arno', async () => {
    await listerRecents(7, ['locale']);
    expect(sql()).toContain('ORDER BY dernier_le DESC');
  });

  it('un compte absurde ne fait AUCUNE requête', async () => {
    expect(await listerRecents(0, ['locale'])).toEqual({ lignes: [], disponible: true });
    expect(await listerRecents(-3, ['locale'])).toEqual({ lignes: [], disponible: true });
    expect(await listerRecents(7, [])).toEqual({ lignes: [], disponible: true });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('la limite est BORNÉE : une liste de « récents » se lit, elle ne défile pas', async () => {
    await listerRecents(7, ['locale'], 9999);
    expect(params()[2]).toBe(RECENTS_MAX);
    queryMock.mockClear();
    await listerRecents(7, ['locale'], 0);
    expect(params()[2]).toBe(1);
  });

  /** ⚠️ `bigint` arrive en CHAÎNE avec le pilote `pg` : sans `Number`, une taille serait comparée comme du texte. */
  it('🔴 la taille rendue est un NOMBRE, pas la chaîne que rend PostgreSQL', async () => {
    queryMock.mockResolvedValue({ rows: [ligne({ taille_octets: '4096' })] });
    const r = await listerRecents(7, ['locale']);
    expect(r.lignes[0].tailleOctets).toBe(4096);
    expect(typeof r.lignes[0].tailleOctets).toBe('number');
  });

  it('une taille absente reste absente — jamais zéro, qui voudrait dire « fichier vide »', async () => {
    queryMock.mockResolvedValue({ rows: [ligne({ taille_octets: null })] });
    expect((await listerRecents(7, ['locale'])).lignes[0].tailleOctets).toBeNull();
  });

  it('une sorte inconnue en base est ÉCARTÉE plutôt que rendue telle quelle', async () => {
    queryMock.mockResolvedValue({ rows: [ligne({ sorte: 'bizarre' }), ligne()] });
    const r = await listerRecents(7, ['locale']);
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0].sorte).toBe('locale');
  });
});

describe('🔴🔴 ④ une clé de stockage n’est rendue QU’À SON PROPRE COMPTE', () => {
  it('la requête filtre sur le compte ET sur la sorte « locale »', async () => {
    queryMock.mockResolvedValue({ rows: [ligne()] });
    await cleLocaleDuRecent(7, 'gestion/brouillon/12/a.pdf');
    const s = sql();
    expect(s).toContain('WHERE compte_id = $1');
    expect(s).toContain("sorte = 'locale'");
    expect(params()[0]).toBe(7);
    expect(params()[1]).toBe('gestion/brouillon/12/a.pdf');
  });

  /**
   * 🔴 C'EST LA LIGNE QUI PROTÈGE LE SEAU. Une clé qui n'est pas dans l'historique de ce compte ne rend RIEN —
   * la route refuse alors de relire le moindre octet. Sans cela, une clé envoyée par l'écran suffirait à joindre
   * n'importe quel objet du stockage à un mail sortant.
   */
  it('🔴 une clé inconnue de ce compte rend `null` — rien ne sera relu', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await cleLocaleDuRecent(7, 'clé/de/quelqu/un/dautre.pdf')).toBeNull();
  });

  it('une clé vide ou un compte absurde n’interrogent même pas la base', async () => {
    expect(await cleLocaleDuRecent(7, '   ')).toBeNull();
    expect(await cleLocaleDuRecent(0, 'k')).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ⑤ noter est un CONFORT : cela ne doit jamais faire échouer une pièce jointe', () => {
  it('une écriture qui échoue rend `false` et ne jette pas', async () => {
    queryMock.mockRejectedValue(new Error('base indisponible'));
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(noterRecent({ compteId: 7, sorte: 'locale', cle: 'k', libelle: 'x' })).resolves.toBe(false);
    espion.mockRestore();
  });

  it('une clé vide n’est pas notée : une ligne sans cible ne se rejoindrait jamais', async () => {
    expect(await noterRecent({ compteId: 7, sorte: 'locale', cle: '  ', libelle: 'x' })).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('un libellé démesuré est tronqué plutôt que refusé', async () => {
    await noterRecent({ compteId: 7, sorte: 'locale', cle: 'k', libelle: 'x'.repeat(900) });
    expect(String(params()[3]).length).toBe(300);
  });
});

/**
 * 🔴🔴 LE GARDE-FOU LE PLUS IMPORTANT DE CE FICHIER : cet historique vit dans NOTRE base, et rien — absolument
 * rien — n'est écrit dans le Drive pour le tenir. Un test STATIQUE, parce que ce qu'on veut garantir est une
 * NON-ACTION : on ne prouve pas une absence en l'exécutant.
 */
describe('🔴🔴 aucune écriture Drive pour tenir cet historique', () => {
  it('le dépôt ne parle jamais à Google', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync('app/lib/gestion/recentsPieceRepo.ts', 'utf8')
      .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l.trim())).join('\n');
    expect(/googleapis|files\.create|files\.update|files\.delete|permissions\.create|deposerFichier/.test(code))
      .toBe(false);
    expect(/fetch\s*\(/.test(code)).toBe(false);
  });
});
