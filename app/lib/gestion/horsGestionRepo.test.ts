import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴 LOT STATUT-HORS-GESTION — « CE MAIL NE CONCERNE AUCUN BIEN », EN BASE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI EST PROTÉGÉ ICI, et qui casse d'une façon reconnaissable :
 *   ① 🔴 JAMAIS AUTOMATIQUE. Aucun geste n'aboutit sans un auteur humain NOMMÉ. Si cette garde tombe, un script
 *      pourrait vider la file en marquant tout — et personne ne saurait qui l'a décidé.
 *   ② 🔴 RIEN N'EST SUPPRIMÉ. Annuler est un `UPDATE` qui date et signe ; aucun `DELETE` n'existe dans ce fichier.
 *   ③ SANS LA MIGRATION 266, la table n'est NOMMÉE NULLE PART et le refus est DIT, jamais silencieux.
 *   ④ Le motif est FACULTATIF, et une valeur inconnue ne devient pas une raison inventée.
 *
 * On teste le COMPORTEMENT (paramètres liés, refus rendus) et des FRAGMENTS SÉMANTIQUES sur un SQL normalisé —
 * jamais la forme exacte de la requête émise.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const migration266 = vi.fn(async () => true);
vi.mock('./schema', () => ({ horsGestionDisponible: () => migration266() }));

import {
  annulerHorsGestion, auteurHumain, historiqueHorsGestion, leverHorsGestionApresRattachement,
  lireHorsGestion, marquerHorsGestion, motifRetenu,
} from './horsGestionRepo';

const ARNO = { id: 3, libelle: 'a.jorel' };
const sql = () => String(queryMock.mock.calls[0]?.[0] ?? '').replace(/\s+/g, ' ');
const params = () => (queryMock.mock.calls[0]?.[1] ?? []) as unknown[];

beforeEach(() => {
  migration266.mockResolvedValue(true);
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [{ id: '1' }] });
});

describe('🔴 ① « Hors gestion » ne se pose JAMAIS automatiquement', () => {
  it('refuse un auteur sans nom, et le DIT', async () => {
    const r = await marquerHorsGestion({ messageIds: [12], auteur: { id: null, libelle: '' } });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('à la main');
    // 🔴 ET SURTOUT : rien n'est parti en base.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('refuse le mot que le moteur de rattachement signe', async () => {
    const r = await marquerHorsGestion({ messageIds: [12], auteur: { id: null, libelle: 'automatique' } });
    expect(r.ok).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('…quelle que soit la casse ou les espaces : « Automatique » est refusé aussi', () => {
    expect(auteurHumain({ libelle: '  Automatique ' })).toBe(false);
    expect(auteurHumain({ libelle: '' })).toBe(false);
    expect(auteurHumain(null)).toBe(false);
    expect(auteurHumain({ libelle: 'a.jorel' })).toBe(true);
    // La voie de secours (mot de passe partagé) est un humain : elle porte un libellé, et c'est une information.
    expect(auteurHumain({ libelle: 'accès de secours' })).toBe(true);
  });

  it('accepte un collaborateur nommé, et écrit son nom dans la ligne', async () => {
    const r = await marquerHorsGestion({ messageIds: [12], motif: 'prospection', auteur: ARNO });
    expect(r).toEqual({ ok: true, nb: 1 });
    expect(params()).toEqual([[12], 'prospection', 3, 'a.jorel']);
  });
});

describe('🔴 ② rien n’est jamais supprimé', () => {
  it('annuler est un UPDATE qui date et signe — pas un DELETE', async () => {
    await annulerHorsGestion({ messageIds: [12], auteur: ARNO, motif: 'erreur de ma part' });
    expect(sql()).toContain('UPDATE gestion_hors_gestion');
    expect(sql()).toContain('retire_le = now()');
    expect(sql()).not.toContain('DELETE');
    expect(params()).toEqual([[12], 3, 'a.jorel', 'erreur de ma part']);
  });

  it('n’annule que les marques VIVANTES : une marque déjà retirée ne se re-retire pas', async () => {
    await annulerHorsGestion({ messageIds: [12], auteur: ARNO });
    expect(sql()).toContain('retire_le IS NULL');
  });

  it('🔴 AUCUN `DELETE` dans tout le fichier — garde statique sur la source', () => {
    const src = readFileSync('app/lib/gestion/horsGestionRepo.ts', 'utf8');
    expect(/\bDELETE\s+FROM\b/i.test(src)).toBe(false);
  });

  it('marquer deux fois ne crée pas deux marques vivantes (index partiel + ON CONFLICT)', async () => {
    await marquerHorsGestion({ messageIds: [12], auteur: ARNO });
    expect(sql()).toContain('ON CONFLICT (message_id) WHERE retire_le IS NULL DO NOTHING');
  });
});

describe('🔴 ③ sans la migration 266 : on le DIT, on ne nomme pas la table', () => {
  it('le marquage est refusé avec un motif lisible à l’écran', async () => {
    migration266.mockResolvedValue(false);
    const r = await marquerHorsGestion({ messageIds: [12], auteur: ARNO });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('266');
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('l’annulation aussi', async () => {
    migration266.mockResolvedValue(false);
    const r = await annulerHorsGestion({ messageIds: [12], auteur: ARNO });
    expect(r.ok).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('la lecture rend une carte VIDE, sans interroger — pas une erreur qui casserait l’écran', async () => {
    migration266.mockResolvedValue(false);
    expect((await lireHorsGestion([1, 2, 3])).size).toBe(0);
    expect(await historiqueHorsGestion(12)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('la levée après rattachement ne fait rien — et surtout ne fait pas échouer le rattachement', async () => {
    migration266.mockResolvedValue(false);
    expect(await leverHorsGestionApresRattachement([12], ARNO)).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 ④ le motif est FACULTATIF, et jamais inventé', () => {
  it('une valeur inconnue vaut « non précisé »', () => {
    expect(motifRetenu('prospection')).toBe('prospection');
    expect(motifRetenu('interne')).toBe('interne');
    expect(motifRetenu('autre')).toBe('autre');
    expect(motifRetenu('parce que')).toBeNull();
    expect(motifRetenu(undefined)).toBeNull();
    expect(motifRetenu(42)).toBeNull();
  });

  it('un marquage sans motif passe `null` en base, jamais une chaîne bricolée', async () => {
    await marquerHorsGestion({ messageIds: [12], auteur: ARNO });
    expect(params()[1]).toBeNull();
  });
});

describe('la lecture des marques vivantes', () => {
  it('ne lit que les vivantes, en UNE requête pour toute la page', async () => {
    queryMock.mockResolvedValue({
      rows: [{ message_id: '2896', motif: 'interne', pose_le: '2026-09-28T10:00:00Z', pose_par: 'a.jorel' }],
    });
    const m = await lireHorsGestion([2896, 2830]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(sql()).toContain('retire_le IS NULL');
    // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans conversion, la clé ne retrouverait jamais son mail.
    expect(m.get(2896)).toMatchObject({ messageId: 2896, motif: 'interne', posePar: 'a.jorel' });
    expect(m.has(2830)).toBe(false);
  });

  it('une liste vide n’interroge pas la base', async () => {
    expect((await lireHorsGestion([])).size).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('les identifiants sont nettoyés et bornés : ni doublon, ni zéro, ni millier', async () => {
    await lireHorsGestion([12, 12, 0, -3, 7]);
    expect(params()[0]).toEqual([12, 7]);
    queryMock.mockClear();
    await lireHorsGestion(Array.from({ length: 900 }, (_, i) => i + 1));
    expect((params()[0] as number[]).length).toBe(500);
  });
});

describe('🔴 rattacher un bien LÈVE la marque — la réversibilité par le geste naturel', () => {
  it('retire les marques vivantes des mails rattachés, en le disant dans la ligne', async () => {
    const n = await leverHorsGestionApresRattachement([2896], ARNO);
    expect(n).toBe(1);
    expect(sql()).toContain('UPDATE gestion_hors_gestion');
    expect(sql()).toContain('retire_le IS NULL');
    expect(params()[2]).toBe('a.jorel');
  });

  it('🔴 ELLE N’ÉCHOUE JAMAIS BRUYAMMENT : une base qui refuse ne doit pas défaire le rattachement', async () => {
    queryMock.mockRejectedValue(new Error('base injoignable'));
    await expect(leverHorsGestionApresRattachement([2896], ARNO)).resolves.toBe(0);
  });
});

describe('l’historique d’un mail', () => {
  it('rend toutes les marques, la plus récente d’abord, annulées comprises', async () => {
    queryMock.mockResolvedValue({
      rows: [{
        id: '2', motif: null, pose_le: '2026-09-28T10:00:00Z', pose_par: 'a.jorel',
        retire_le: '2026-09-28T11:00:00Z', retire_par: 'a.jorel', retire_motif: 'erreur',
      }],
    });
    const h = await historiqueHorsGestion(2896);
    expect(sql()).toContain('ORDER BY id DESC');
    expect(h[0]).toMatchObject({ id: 2, retirePar: 'a.jorel', retireMotif: 'erreur' });
  });

  it('un identifiant absurde n’interroge pas la base', async () => {
    expect(await historiqueHorsGestion(0)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
