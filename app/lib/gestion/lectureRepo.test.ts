import { describe, it, expect, vi, beforeEach } from 'vitest';

// Base MOCKÉE : aucune connexion réelle, aucune écriture possible.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const schemaMock = vi.fn();
vi.mock('./schema', () => ({ lectureDisponible: () => schemaMock() }));

import { compterFilsNonLus, filsNonLus, marquerFil } from './lectureRepo';

/**
 * LOT 5-BOITE — LU / NON LU, PAR COLLABORATEUR.
 *
 * 🔴 CE QUI EST ÉPROUVÉ ICI, ET POURQUOI CHAQUE CAS COMPTE :
 *   ① l'état est PERSONNEL — lu par l'un ne veut pas dire lu par l'autre. C'est la raison d'être du lot : sans cela,
 *      le premier qui ouvre la boîte éteindrait le gras de toute l'équipe ;
 *   ② l'historique est réputé lu PAR UN REPÈRE, pas par une écriture de masse — sinon 16 800 messages en gras le jour
 *      de la livraison, et une table de plusieurs centaines de milliers de lignes ;
 *   ③ « marquer comme non lu » l'emporte sur ce repère, sinon le geste serait sans effet sur un mail un peu ancien ;
 *   ④ un message ENVOYÉ n'est jamais non lu — nous l'avons écrit ;
 *   ⑤ sans la migration 250, AUCUNE requête n'est émise et rien n'est en gras.
 */

const SQL = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));
const PARAMS = (i = 0): unknown[] => (queryMock.mock.calls[i]?.[1] ?? []) as unknown[];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  schemaMock.mockReset().mockResolvedValue(true);
});

describe('🔴 ⑤ sans la migration 250', () => {
  it('aucune requête n’est émise, et rien n’est non lu', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await filsNonLus([1, 2], 7)).toEqual(new Set());
    expect(await compterFilsNonLus(7)).toBeNull();
    expect(await marquerFil(5, 7, true)).toEqual({ etat: 'sans_schema' });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ① l’état est PERSONNEL', () => {
  it('la question est posée POUR UN collaborateur, dont l’identifiant est LIÉ', async () => {
    queryMock.mockResolvedValue({ rows: [{ le: '2026-09-25T10:00:00Z' }] });
    await filsNonLus([11, 12], 7);
    // ① la mise en service, ② la question elle-même : l'identifiant du collaborateur y est un paramètre lié.
    expect(PARAMS(1)[0]).toBe(7);
    expect(SQL()[1]).toContain('l.utilisateur_id = $1');
  });

  it('sans compte personnel (accès de secours), on ne demande RIEN et rien n’est en gras', async () => {
    expect(await filsNonLus([1], null)).toEqual(new Set());
    expect(await compterFilsNonLus(null)).toBeNull();
    expect(await marquerFil(5, null, true)).toEqual({ etat: 'sans_compte' });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('aucun échange à examiner → aucune requête', async () => {
    expect(await filsNonLus([], 7)).toEqual(new Set());
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('la question ne porte QUE sur les échanges affichés — jamais sur toute la boîte', async () => {
    queryMock.mockResolvedValue({ rows: [{ le: '2026-09-25T10:00:00Z' }] });
    await filsNonLus([11, 12, 13], 7);
    expect(SQL()[1]).toContain('mm.fil_id = ANY($2::bigint[])');
    expect(PARAMS(1)[1]).toEqual([11, 12, 13]);
  });

  it('rend les échanges non lus, en NOMBRES (piège `bigint` de pg)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ le: '2026-09-25T10:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [{ fil_id: '11' }, { fil_id: '13' }] });
    expect(await filsNonLus([11, 12, 13], 7)).toEqual(new Set([11, 13]));
  });
});

describe('🔴 ②③④ la règle elle-même', () => {
  /** La règle complète : reçu ET ( ligne explicite ? elle fait foi : recu_le >= mise en service ). */
  it('④ un message ENVOYÉ n’est jamais non lu', async () => {
    queryMock.mockResolvedValue({ rows: [{ le: '2026-09-25T10:00:00Z' }] });
    await filsNonLus([11], 7);
    expect(SQL()[1]).toContain("mm.sens = 'recu'");
  });

  it('② l’historique est réputé lu par le REPÈRE de mise en service, pas par des lignes', async () => {
    queryMock.mockResolvedValue({ rows: [{ le: '2026-09-25T10:00:00Z' }] });
    await filsNonLus([11], 7);
    const sql = SQL()[1];
    expect(sql).toContain('mm.recu_le >= $3::timestamptz');
    expect(PARAMS(1)[2]).toBe('2026-09-25T10:00:00Z');
    // …et le repère est LU, jamais recopié dans le code : c'est la configuration qui le porte.
    expect(SQL()[0]).toContain('lecture_service_le');
  });

  it('③ une ligne « non lu » explicite l’emporte sur le repère, même pour un vieux message', async () => {
    queryMock.mockResolvedValue({ rows: [{ le: '2026-09-25T10:00:00Z' }] });
    await filsNonLus([11], 7);
    // La seconde branche du OU ne regarde AUCUNE date : c'est ce qui rend « marquer comme non lu » effectif partout.
    expect(SQL()[1]).toContain('AND NOT l2.lu');
  });

  /** Sans repère lisible (migration à moitié appliquée, base muette) : on se tait plutôt que de tout mettre en gras. */
  it('sans repère de mise en service, rien n’est non lu', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await filsNonLus([11], 7)).toEqual(new Set());
    expect(await compterFilsNonLus(7)).toBeNull();
  });
});

describe('le compteur', () => {
  it('compte des ÉCHANGES distincts, et ignore le courrier automatique — comme la liste', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ le: '2026-09-25T10:00:00Z' }] })
      .mockResolvedValueOnce({ rows: [{ n: 3 }] });
    expect(await compterFilsNonLus(7)).toBe(3);
    const sql = SQL()[1];
    expect(sql).toContain('count(DISTINCT mm.fil_id)');
    expect(sql).toContain('mm.exclu_le IS NULL');
  });
});

describe('marquer un échange', () => {
  it('écrit pour TOUS les messages reçus de l’échange, et pour ce collaborateur seul', async () => {
    queryMock.mockResolvedValue({ rowCount: 4, rows: [] });
    expect(await marquerFil(5, 7, true)).toEqual({ etat: 'ok', messages: 4 });
    const sql = SQL()[0];
    expect(sql).toContain('INSERT INTO gestion_message_lu');
    expect(sql).toContain("m.fil_id = $1::bigint AND m.sens = 'recu'");
    expect(PARAMS(0)).toEqual([5, 7, true]);
  });

  /** L'ouverture d'une conversation rejoue ce geste À CHAQUE affichage : il doit être rejouable sans fin. */
  it('🔴 IDEMPOTENT : la base tranche, et un second passage ne produit ni doublon ni erreur', async () => {
    queryMock.mockResolvedValue({ rowCount: 4, rows: [] });
    await marquerFil(5, 7, true);
    expect(SQL()[0]).toContain('ON CONFLICT (message_id, utilisateur_id) DO UPDATE SET lu = EXCLUDED.lu');
  });

  it('« non lu » écrit false plutôt que d’effacer la ligne : rien n’est jamais supprimé', async () => {
    queryMock.mockResolvedValue({ rowCount: 4, rows: [] });
    await marquerFil(5, 7, false);
    expect(PARAMS(0)[2]).toBe(false);
    expect(SQL()[0]).not.toContain('DELETE');
  });
});
