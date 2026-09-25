import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const schemaMock = vi.fn();
const journalMock = vi.fn();
/** LOT 5-PJ-C — la colonne `compte_google` n'existe qu'après la migration 246 : le dépôt la nomme SOUS SONDE. */
const compteColonneMock = vi.fn();
/** LOT 5-PJ-D — le réglage du nombre de dossiers récents n'existe qu'après la migration 248. Même précaution. */
const reglageRecentsMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
  pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
}));
vi.mock('./schema', () => ({
  depotsDriveDisponibles: () => schemaMock(),
  journalPieceDriveDisponible: () => journalMock(),
  compteGoogleDuDepotDisponible: () => compteColonneMock(),
  reglageRecentsDisponible: () => reglageRecentsMock(),
}));

import {
  dernierDossierDuFil, dossiersRecentsDeposes, lireDepotsDesPieces, lireMaxDossiersRecents, memoriserDepot,
} from './driveRepo';

const sql = (i: number): string => String(queryMock.mock.calls[i][0]).replace(/\s+/g, ' ');
const params = (i: number): unknown[] => queryMock.mock.calls[i][1] as unknown[];

const aDeposer = {
  pieceId: 7, driveFileId: 'F1', dossierId: 'DOS', dossierNom: 'Dupont', driveId: 'DRV',
  webViewLink: 'https://drive/F1', auteurId: 3, auteurLibelle: 'Arnaud Jorel',
};

beforeEach(() => {
  queryMock.mockReset(); schemaMock.mockReset(); journalMock.mockReset(); compteColonneMock.mockReset();
  reglageRecentsMock.mockReset();
  schemaMock.mockResolvedValue(true); journalMock.mockResolvedValue(true); compteColonneMock.mockResolvedValue(true);
  reglageRecentsMock.mockResolvedValue(true);
});

describe('sans la migration 245', () => {
  /**
   * 🔴 CELLE-CI CONDITIONNE LA FONCTIONNALITÉ, contrairement à la 244. Sans mémoire, on ne peut pas empêcher un
   * doublon : déposer quand même enverrait une seconde copie au clic suivant, sans le dire.
   */
  it('aucune requête n’est émise, et on le DIT à l’appelant', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await lireDepotsDesPieces([1, 2])).toEqual([]);
    expect(await dernierDossierDuFil(383)).toBeNull();
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'sans_schema' });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('lire les dépôts', () => {
  it('une SEULE requête pour tout un message, avec les identifiants LIÉS', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireDepotsDesPieces([1, 2, 3]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(params(0)).toEqual([[1, 2, 3]]);
    expect(sql(0)).toContain('piece_id = ANY($1::bigint[])');
  });

  it('aucune pièce → aucune requête', async () => {
    expect(await lireDepotsDesPieces([])).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rend le lien Drive et le nom du dossier tels qu’enregistrés', async () => {
    queryMock.mockResolvedValue({
      rows: [{
        piece_id: 7, drive_file_id: 'F1', drive_dossier_id: 'DOS', dossier_nom: 'Dupont',
        web_view_link: 'https://drive/F1', depose_le: '2026-09-25T10:00:00Z', depose_par_libelle: 'Arnaud Jorel',
      }],
    });
    expect((await lireDepotsDesPieces([7]))[0]).toMatchObject({
      pieceId: 7, dossierId: 'DOS', dossierNom: 'Dupont', webViewLink: 'https://drive/F1', deposePar: 'Arnaud Jorel',
    });
  });
});

describe('le dernier dossier de l’échange', () => {
  it('remonte de l’échange aux dépôts, et prend le plus récent', async () => {
    queryMock.mockResolvedValue({ rows: [{ drive_dossier_id: 'DOS', dossier_nom: 'Dupont' }] });
    expect(await dernierDossierDuFil(383)).toEqual({ id: 'DOS', nom: 'Dupont' });
    expect(sql(0)).toContain('ORDER BY d.depose_le DESC');
    expect(sql(0)).toContain('LIMIT 1');
    expect(params(0)).toEqual([383]);
  });
  it('aucun dépôt pour cet échange → null, et le sélecteur s’ouvrira à la racine', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await dernierDossierDuFil(383)).toBeNull();
  });
});

/**
 * LOT 5-PJ-D — LES DOSSIERS RÉCENTS. Cette liste est DÉRIVÉE de la mémoire des dépôts, jamais tenue à la main : un
 * dossier y figure parce qu'un fichier y est parti. Elle est commune à toute l'équipe ; les DROITS, eux, sont
 * vérifiés ensuite, dossier par dossier (cf. `dossiersRecents.ts`).
 */
describe('les dossiers récents', () => {
  it('rend des dossiers DISTINCTS, le plus récent d’abord, et le nombre demandé est LIÉ', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await dossiersRecentsDeposes(18);
    expect(params(0)).toEqual([18]);
    expect(sql(0)).toContain('DISTINCT ON (drive_dossier_id)');
    expect(sql(0)).toContain('ORDER BY dernier DESC');
    expect(sql(0)).toContain('LIMIT $1');
  });

  it('rend le nom et le Drive du DERNIER dépôt de chaque dossier', async () => {
    queryMock.mockResolvedValue({
      rows: [{ drive_dossier_id: 'DOS', dossier_nom: 'Dupont', drive_id: 'DRV', dernier: '2026-09-25T10:00:00Z' }],
    });
    expect(await dossiersRecentsDeposes(6)).toEqual([
      { id: 'DOS', nom: 'Dupont', driveId: 'DRV', dernierDepot: '2026-09-25T10:00:00Z' },
    ]);
  });

  it('sans la migration 245, aucune requête : il ne peut exister aucun dépôt', async () => {
    schemaMock.mockResolvedValue(false);
    expect(await dossiersRecentsDeposes(6)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('un nombre nul ou négatif n’interroge pas la base', async () => {
    expect(await dossiersRecentsDeposes(0)).toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('le réglage du nombre de dossiers récents', () => {
  it('sans la migration 248, le défaut de six, et AUCUNE requête sur une colonne absente', async () => {
    reglageRecentsMock.mockResolvedValue(false);
    expect(await lireMaxDossiersRecents()).toBe(6);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('avec la migration, la valeur de la base est lue', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 9 }] });
    expect(await lireMaxDossiersRecents()).toBe(9);
    expect(sql(0)).toContain('drive_dossiers_recents_max');
  });

  /** Une valeur aberrante ne doit pas vider l'écran : elle est ramenée dans ses bornes, comme les autres réglages. */
  it('une valeur hors bornes est ramenée, jamais refusée', async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 500 }] });
    expect(await lireMaxDossiersRecents()).toBe(20);
  });

  it('une base qui refuse la lecture rend le défaut, pas une exception : le sélecteur s’ouvre quand même', async () => {
    queryMock.mockRejectedValue(new Error('colonne inconnue'));
    expect(await lireMaxDossiersRecents()).toBe(6);
  });
});

describe('mémoriser un dépôt', () => {
  it('écrit la ligne, puis le journal', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'enregistre' });
    expect(sql(0)).toContain('INSERT INTO gestion_piece_drive');
    expect(sql(1)).toContain('INSERT INTO gestion_journal');
  });

  /** L'anti-doublon est tenu par la BASE : entre lire et écrire, il y a toujours la place pour un second clic. */
  it('le doublon est refusé par la base, pas par une lecture préalable', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'doublon' });
    expect(sql(0)).toContain('ON CONFLICT (piece_id, drive_dossier_id) DO NOTHING');
  });

  it('un doublon n’écrit AUCUNE ligne de journal — il ne s’est rien passé', async () => {
    queryMock.mockResolvedValue({ rowCount: 0, rows: [] });
    await memoriserDepot(aDeposer);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('l’auteur est figé en texte, avec son identifiant', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot(aDeposer);
    expect(params(0)).toContain('Arnaud Jorel');
    expect(params(0)).toContain(3);
  });

  /**
   * LOT 5-PJ-C — on sait AVEC QUEL COMPTE GOOGLE le fichier est parti. C'est ce compte-là qui en est propriétaire
   * côté Drive : sans lui, on saurait qui a cliqué sans savoir sous quelle identité.
   */
  it('avec la migration 246, le compte Google employé est enregistré ET journalisé', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot({ ...aDeposer, compteGoogle: 'a.jorel@criterimmo.fr' });
    expect(sql(0)).toContain('compte_google');
    expect(params(0)).toContain('a.jorel@criterimmo.fr');
    // Le commentaire du journal est le 4e paramètre lié (entite, entite_id, valeur_apres, COMMENTAIRE, …).
    expect(String(params(1)[3])).toContain('a.jorel@criterimmo.fr');
  });

  /** Sans la 246, NOMMER la colonne ferait échouer toute la requête — et le fichier, lui, est déjà dans le Drive. */
  it('sans la migration 246, la colonne n’est pas nommée, et le dépôt s’enregistre quand même', async () => {
    compteColonneMock.mockResolvedValue(false);
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    expect(await memoriserDepot({ ...aDeposer, compteGoogle: 'a@criterimmo.fr' })).toEqual({ etat: 'enregistre' });
    expect(sql(0)).not.toContain('compte_google');
    expect(params(0)).not.toContain('a@criterimmo.fr');
  });

  /**
   * 🔴 L'ENTITÉ EST DÉCIDÉE, PAS DEVINÉE. Écrire « envoi » en dur avait fait rendre un échec pour un message
   * pourtant parti, le 23/09. Sans la 245, on se range sur une entité que la base accepte déjà.
   */
  it('sans l’élargissement du journal, la ligne se range sur une entité admise', async () => {
    journalMock.mockResolvedValue(false);
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })              // l'insertion du dépôt
      .mockResolvedValueOnce({ rows: [{ message_id: 42 }] })          // le message qui porte la pièce
      .mockResolvedValueOnce({ rows: [] });                           // le journal
    await memoriserDepot(aDeposer);
    const journal = queryMock.mock.calls.find((c) => String(c[0]).includes('gestion_journal'));
    expect((journal?.[1] as unknown[])[0]).toBe('message');
    expect((journal?.[1] as unknown[])[1]).toBe(42);
  });

  it('avec la 245, la ligne se range sur « piece_drive »', async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
    await memoriserDepot(aDeposer);
    expect(params(1)[0]).toBe('piece_drive');
    expect(params(1)[1]).toBe(7);
  });

  /** Le fichier est DANS le Drive : un journal impossible ne doit pas faire croire que le dépôt a échoué. */
  it('un journal qui échoue ne défait pas le dépôt', async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockRejectedValueOnce(new Error('journal refusé'));
    expect(await memoriserDepot(aDeposer)).toEqual({ etat: 'enregistre' });
  });
});
