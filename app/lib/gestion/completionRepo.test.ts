import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
  pool: { connect: async () => ({ query: async () => ({ rows: [{ ok: true }] }), release: () => {} }) },
}));

import { AUTEUR_COMPLETION, compterRestantes, ecrireLot, journaliserCompletion, lireACompleter } from './completionRepo';
import { rapportVide, type AEcrire } from './completion';

/** SQL normalisé : on asserte des FRAGMENTS SÉMANTIQUES, jamais la forme complète d'une requête. */
const sql = (i: number): string => String(queryMock.mock.calls[i][0]).replace(/\s+/g, ' ');
const params = (i: number): unknown[] => queryMock.mock.calls[i][1] as unknown[];

const aEcrire = (id: number): AEcrire => ({
  id,
  destinataires: {
    a: [{ nom: 'Jean', adresse: 'jean@exemple.fr' }],
    cc: [], cci: [], repondreA: [],
  },
});

beforeEach(() => { queryMock.mockReset(); });

describe('lecture des lignes à compléter', () => {
  it('ne prend QUE les lignes jamais analysées, les plus anciennes d’abord, sous un plafond lié', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 3, message_id: '<a@x.fr>', uid_imap: 42, uid_validity: '198' }] });
    const lignes = await lireACompleter(200);
    expect(sql(0)).toContain('WHERE dest_a IS NULL');
    expect(sql(0)).toContain('ORDER BY id');
    expect(params(0)).toEqual([200]); // le plafond est un paramètre LIÉ, jamais interpolé
    expect(lignes).toEqual([{ id: 3, messageId: '<a@x.fr>', uidImap: 42, uidValidity: '198' }]);
  });

  /**
   * `pg` rend les `bigint` SOUS FORME DE CHAÎNE alors que TypeScript les type `number` : une comparaison stricte se met
   * alors à mentir en silence. Piège déjà payé dans ce dépôt — d'où le cast côté SQL, et ce test qui le tient.
   */
  it('l’UID est cast en entier côté SQL, l’UIDVALIDITY reste du texte', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireACompleter(10);
    expect(sql(0)).toContain('uid_imap::int');
    expect(sql(0)).toContain('uid_validity::text');
  });

  it('un message sans UID est rendu avec null, pas avec 0', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 9, message_id: '<b@x.fr>', uid_imap: null, uid_validity: null }] });
    expect((await lireACompleter(1))[0]).toMatchObject({ uidImap: null, uidValidity: null });
  });
});

describe('compte de ce qui reste', () => {
  it('compte les lignes jamais analysées', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 27_833 }] });
    expect(await compterRestantes()).toBe(27_833);
    expect(sql(0)).toContain('WHERE dest_a IS NULL');
  });
  it('une base qui ne rend rien vaut zéro, pas une exception', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await compterRestantes()).toBe(0);
  });
});

describe('écriture — le périmètre est minuscule, et il est tenu par le SQL', () => {
  it('n’écrit QUE les quatre colonnes de destinataires', async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    await ecrireLot([aEcrire(3)]);
    const s = sql(0);
    expect(s).toContain('UPDATE gestion_message');
    expect(s).toContain('SET dest_a =');
    expect(s).toContain('dest_cc =');
    expect(s).toContain('dest_cci =');
    expect(s).toContain('repondre_a =');
  });

  /**
   * 🔴 LE TEST CENTRAL DU LOT. Entre la lecture des candidats et l'écriture, une relève ordinaire peut avoir capturé et
   * analysé la même ligne. Sans le `dest_a IS NULL` DANS LE WHERE, on écraserait une valeur fraîche par une valeur
   * relue — un filtre posé seulement en amont ne protège de rien.
   */
  it('le WHERE porte dest_a IS NULL : une valeur déjà analysée ne peut pas être écrasée', async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    await ecrireLot([aEcrire(3)]);
    expect(sql(0)).toContain('WHERE id = $1 AND dest_a IS NULL');
  });

  it('ne touche NI maj_le NI aucune autre colonne', async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    await ecrireLot([aEcrire(3)]);
    expect(sql(0)).not.toContain('maj_le');
    expect(sql(0)).not.toContain('exclu_');
  });

  it('passe l’identifiant et les quatre listes en paramètres LIÉS, sérialisés en JSON', async () => {
    queryMock.mockResolvedValue({ rowCount: 1 });
    await ecrireLot([aEcrire(3)]);
    const p = params(0);
    expect(p[0]).toBe(3);
    expect(JSON.parse(String(p[1]))).toEqual([{ nom: 'Jean', adresse: 'jean@exemple.fr' }]);
    expect(JSON.parse(String(p[2]))).toEqual([]);
    expect(JSON.parse(String(p[3]))).toEqual([]);
    expect(JSON.parse(String(p[4]))).toEqual([]);
  });

  it('compte les lignes RÉELLEMENT touchées : rowCount 0 = une autre passe l’avait déjà faite', async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 1 });
    expect(await ecrireLot([aEcrire(1), aEcrire(2), aEcrire(3)])).toEqual({ completes: 2, dejaFaits: 1 });
  });

  it('un lot vide n’émet AUCUNE requête', async () => {
    expect(await ecrireLot([])).toEqual({ completes: 0, dejaFaits: 0 });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('journal — une ligne par passe appliquée', () => {
  it('écrit dans gestion_journal, avec l’opération pour auteur figé', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await journaliserCompletion({ ...rapportVide(), completes: 1_200, introuvables: 4, resteNull: 26_633 });
    expect(sql(0)).toContain('INSERT INTO gestion_journal');
    expect(params(0)[3]).toBe(AUTEUR_COMPLETION);
  });

  it('le commentaire dit les comptes, en français, y compris ce qui n’a PAS marché', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await journaliserCompletion({ ...rapportVide(), completes: 10, introuvables: 4, ambigus: 2, echecs: 1, resteNull: 7 });
    const commentaire = String(params(0)[2]);
    expect(commentaire).toContain('10 message(s) complété(s)');
    expect(commentaire).toContain('4 introuvable(s)');
    expect(commentaire).toContain('2 Message-ID ambigu(s)');
    expect(commentaire).toContain('7 restant(s)');
  });

  /**
   * L'entité et son identifiant sont ceux que la migration 228 autorise déjà : le journal n'a AUCUNE clé étrangère, et
   * `0` dit que l'opération ne porte sur aucune passe de relève enregistrée. C'est ce qui permet de livrer ce lot SANS
   * migration.
   */
  it('se range sur une entité DÉJÀ admise par la contrainte du journal — aucune migration nécessaire', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await journaliserCompletion(rapportVide());
    const s = sql(0);
    expect(s).toContain("'releve'");
    expect(s).toContain('0');
    expect(s).toContain("'completion_destinataires'");
  });
});
