import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * M5 — ouverture MANUELLE de l'arbitrage. On mocke ../db/client pour prouver le COMPORTEMENT : motif obligatoire, refus si un dossier
 * existe déjà ou si le permis n'a pas d'empreinte, et — cas nominal — création d'un dossier `arbitrage_demande` tracé 'manuelle' +
 * un événement append-only 'ouverture_manuelle'. PREUVE que le snapshot / la capture / l'empreinte ne sont JAMAIS écrits.
 * SQL par fragments sémantiques (jamais la forme complète).
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { existe: false, empreinte: true };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/SELECT etat FROM permis_rattachement WHERE dossier_id/i.test(sql)) return { rows: etat.existe ? [{ etat: 'arbitrage_demande' }] : [] };
    if (/FROM permis_empreinte WHERE dossier_id/i.test(sql)) return { rows: etat.empreinte ? [{ '?column?': 1 }] : [] };
    if (/INSERT INTO permis_rattachement\b/i.test(sql)) return { rows: [{ id: 77 }] };
    return { rows: [] };
  };
  const withTransactionMock = async (fn: (q: typeof queryMock) => unknown) => fn(queryMock);
  return { appels, etat, queryMock, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { ouvrirRattachementManuel } from './rattachementSuiviRepo';

const aEmis = (re: RegExp) => appels.some((a) => re.test(a.sql));
const trouve = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.existe = false; etat.empreinte = true; });

describe('M5 — ouvrirRattachementManuel', () => {
  it('motif VIDE → refus, AUCUNE écriture', async () => {
    const r = await ouvrirRattachementManuel(11430, '   ', 'admin:ouverture-manuelle');
    expect(r).toEqual({ ok: false, motif: expect.stringContaining('motif') });
    expect(aEmis(/INSERT INTO permis_rattachement/i)).toBe(false);
  });

  it('un dossier existe déjà → refus explicite, AUCUNE création', async () => {
    etat.existe = true;
    const r = await ouvrirRattachementManuel(11430, 'test', 'admin:ouverture-manuelle');
    expect(r).toEqual({ ok: false, motif: expect.stringContaining('existe déjà') });
    expect(aEmis(/INSERT INTO permis_rattachement/i)).toBe(false);
  });

  it('permis sans empreinte → refus, AUCUNE création', async () => {
    etat.empreinte = false;
    const r = await ouvrirRattachementManuel(11430, 'test', 'admin:ouverture-manuelle');
    expect(r).toEqual({ ok: false, motif: expect.stringContaining('empreinte') });
    expect(aEmis(/INSERT INTO permis_rattachement/i)).toBe(false);
  });

  it('cas nominal → dossier arbitrage_demande tracé MANUELLE + événement append-only, motif conservé', async () => {
    const r = await ouvrirRattachementManuel(11430, 'vérification affectation', 'admin:ouverture-manuelle');
    expect(r).toEqual({ ok: true, rattId: 77 });
    // INSERT du dossier : état arbitrable, origine 'manuelle', verdict SENTINELLE (jamais un verdict de détection), motif lié.
    const ins = trouve(/INSERT INTO permis_rattachement\b/i)!;
    expect(ins.sql).toContain("'arbitrage_demande'");
    expect(ins.sql).toContain("'manuelle'");
    expect(ins.sql).toContain("'OUVERTURE_MANUELLE'");
    expect(ins.params).toEqual([11430, 'vérification affectation']);
    // Événement append-only 'ouverture_manuelle' avec le motif et l'auteur.
    const evt = trouve(/INSERT INTO permis_rattachement_evenement/i)!;
    expect(evt.sql).toContain("'ouverture_manuelle'");
    expect(JSON.stringify(evt.params)).toContain('vérification affectation');
    expect(evt.params).toContain('admin:ouverture-manuelle');
  });

  it('NE TOUCHE PAS le snapshot / la capture (aucune écriture de faux delta)', async () => {
    await ouvrirRattachementManuel(11430, 'test', 'admin:ouverture-manuelle');
    expect(aEmis(/permis_bati_snapshot/i)).toBe(false);
    expect(aEmis(/permis_bati_capture/i)).toBe(false);
    // l'empreinte n'est que LUE (SELECT), jamais écrite.
    expect(aEmis(/INSERT INTO permis_empreinte|UPDATE permis_empreinte|DELETE FROM permis_empreinte/i)).toBe(false);
  });
});
