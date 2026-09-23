import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 4a — LE REPLI QUI MENTAIT. Le lot 3-quinquies promettait que la relève fonctionnait sans la migration 231 : elle
 * tentait l'écriture AVEC les colonnes d'UID et se rabattait sur le code « colonne inconnue » (42703). Ce repli ne
 * pouvait PAS marcher, et ne marchait pas : chez Arno, la relève a échoué AU PREMIER MESSAGE avec « current transaction
 * is aborted, commands ignored until end of transaction block ».
 *
 * La raison est une règle de PostgreSQL, pas un détail d'implémentation : la première erreur d'une transaction l'ABORTE,
 * et tout ordre suivant échoue en 25P02 — y compris le repli. Un rattrapage APRÈS l'erreur est donc impossible dans une
 * transaction ; il faut demander AVANT. Le premier test ci-dessous rejoue exactement ce comportement.
 */

const queryMock = vi.fn();
/**
 * `withTransaction` FIDÈLE à PostgreSQL : une fois un ordre en erreur, tous les suivants échouent en 25P02. C'est ce
 * comportement — et lui seul — qui rendait l'ancien repli impossible. Il est défini DANS la fabrique du mock : celle-ci
 * est hissée en tête de fichier et ne peut donc pas lire une variable déclarée plus bas.
 */
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => {
    let abortee = false;
    return fn(async (...a: unknown[]) => {
      if (abortee) {
        throw Object.assign(new Error('current transaction is aborted, commands ignored until end of transaction block'), { code: '25P02' });
      }
      try {
        return await queryMock(...a);
      } catch (e) {
        abortee = true; // ⚠️ c'est CE comportement que le repli d'avant ignorait
        throw e;
      }
    });
  },
  pool: { connect: async () => ({ query: async () => ({ rows: [{ ok: true }] }), release: () => {} }) },
}));

import { colonnesUidPresentes, ecrireMessage } from './captureRepo';
import type { MessageAEcrire } from './capture';

const message = (): MessageAEcrire => ({
  uidImap: 42, messageId: '<a@x.fr>', inReplyTo: null, referencesBrut: null, sens: 'recu',
  deAdresse: 'a@x.fr', deNom: null, destinataires: null, nbDestinataires: 0, objet: 'o', objetGabarit: 'o',
  recuLe: new Date('2026-09-20T08:00:00Z'), corpsTexte: null, corpsHtml: null,
  automatique: false, signauxAutomatisme: null, exclusion: null,
});
const sqls = () => queryMock.mock.calls.map((c) => c[0]).filter((t): t is string => typeof t === 'string');

beforeEach(() => { queryMock.mockReset(); });

describe('la sonde des colonnes — posée AVANT, hors transaction', () => {
  it('les DEUX colonnes présentes → on écrit l’UID', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 2 }] });
    expect(await colonnesUidPresentes()).toBe(true);
    expect(sqls()[0]).toContain('information_schema.columns');
  });

  it('une seule des deux → NON : un UID sans son UIDVALIDITY est un piège, jamais une demi-mesure', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 1 }] });
    expect(await colonnesUidPresentes()).toBe(false);
  });

  it('aucune (migration 231 en attente) → non, et la relève écrira sans elles', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 0 }] });
    expect(await colonnesUidPresentes()).toBe(false);
  });

  it('base injoignable → non, jamais une exception : la sonde ne doit pas faire échouer la passe', async () => {
    queryMock.mockRejectedValue(new Error('connexion refusée'));
    expect(await colonnesUidPresentes()).toBe(false);
  });
});

describe('l’écriture ne tente JAMAIS ce qu’elle sait voué à l’échec', () => {
  it('sans les colonnes → l’INSERT ne les nomme pas, et le message est écrit', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 7 }] });
    expect(await ecrireMessage(message(), 1, null, false)).toBe(7);
    expect(sqls()[0]).not.toContain('uid_imap');
    expect(queryMock.mock.calls[0][1]).toHaveLength(18); // les 18 paramètres d'avant, ni plus ni moins
  });

  it('avec les colonnes → l’UID et l’UIDVALIDITY sont écrits', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 7 }] });
    await ecrireMessage(message(), 1, '987654321', true);
    expect(sqls()[0]).toContain('uid_imap, uid_validity');
    expect(queryMock.mock.calls[0][1]).toHaveLength(20);
    expect((queryMock.mock.calls[0][1] as unknown[])[19]).toBe('987654321');
  });

  it('🔴 LE CAS RÉEL : colonnes absentes, l’écriture PASSE — là où l’ancien repli mourait en 25P02', async () => {
    // On rejoue la vraie base : l'INSERT nommant uid_imap échoue en 42703, ce qui ABORTE la transaction.
    queryMock.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('uid_imap')) {
        throw Object.assign(new Error('column "uid_imap" of relation "gestion_message" does not exist'), { code: '42703' });
      }
      return { rows: [{ id: 7 }] };
    });
    // La sonde dit NON → on n'essaie même pas la version avec UID → aucune transaction n'est abortée.
    expect(await ecrireMessage(message(), 1, null, false)).toBe(7);
    expect(sqls().some((s) => s.includes('uid_imap'))).toBe(false);
  });

  it('…et la PREUVE que l’ancien chemin était impossible : tenter puis se rabattre meurt en 25P02', async () => {
    // Simulation locale d'une transaction PostgreSQL : le 1er échec l'aborte, tout ordre suivant échoue en 25P02.
    let abortee = false;
    const ordre = async (sql: string) => {
      if (abortee) throw Object.assign(new Error('current transaction is aborted, commands ignored until end of transaction block'), { code: '25P02' });
      if (sql.includes('uid_imap')) { abortee = true; throw Object.assign(new Error('column "uid_imap" does not exist'), { code: '42703' }); }
      return { rows: [{ id: 7 }] };
    };
    // L'ANCIENNE logique : essayer AVEC les colonnes, puis retomber SANS, dans la MÊME transaction.
    const ancien = async () => {
      try { return await ordre('INSERT INTO gestion_message (uid_imap) VALUES (1)'); }
      catch { return await ordre('INSERT INTO gestion_message (fil_id) VALUES (1)'); }
    };
    await expect(ancien()).rejects.toThrow('current transaction is aborted');
  });

  it('une erreur qui n’est PAS une colonne manquante remonte toujours (jamais de silence)', async () => {
    queryMock.mockRejectedValue(Object.assign(new Error('deadlock detected'), { code: '40P01' }));
    await expect(ecrireMessage(message(), 1, null, true)).rejects.toThrow('deadlock detected');
  });
});

describe('les autres replis de migration sont, eux, HORS transaction — donc valides', () => {
  it('la lecture de configuration (230) rejoue bien sa requête après un 42703', async () => {
    const { chargerConfigGestion } = await import('./config');
    queryMock.mockReset();
    queryMock
      .mockRejectedValueOnce(Object.assign(new Error('column "reconnexions_max" does not exist'), { code: '42703' }))
      .mockResolvedValueOnce({ rows: [{
        dossier_imap: 'D', adresse_gestion: 'g@x.fr', domaines_internes: 'x.fr', rattrapage_jours: 90,
        plafond_par_passe: 400, types_pieces_acceptes: 'application/pdf', piece_taille_max_mo: 25,
        conservation_carte_close_mois: 60,
      }] });
    const c = await chargerConfigGestion();
    expect(c.dossierImap).toBe('D');          // la seconde requête a bien abouti
    expect(c.reconnexionsMax).toBe(3);        // …et les colonnes absentes ont pris leur repli
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('le filtre des déjà-vus (231) survit lui aussi à un 42703', async () => {
    const { filtrerNonVus } = await import('./captureRepo');
    queryMock.mockReset();
    queryMock.mockRejectedValueOnce(Object.assign(new Error('column "uid_imap" does not exist'), { code: '42703' }));
    const client = { uidValidite: () => '123' } as never;
    await expect(filtrerNonVus(client, [1, 2, 3])).resolves.toEqual([1, 2, 3]); // aucun filtre, mais aucune panne
  });
});
