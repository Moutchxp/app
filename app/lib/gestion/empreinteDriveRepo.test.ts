import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 L'INDEX DES EMPREINTES — CE QUE SES ÉCRITURES TOUCHENT, ET CE QU'ELLES NE TOUCHENT PAS ═══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce fichier tient les trois écritures « d'entretien » de l'index — celles qui ne viennent pas du balayage :
 *
 *   · `noterParentDeplace`  (lot DRIVE-NIVEAUX-DEPLACEMENT) — un déplacement change le PARENT, et rien d'autre ;
 *   · `noterFichiersDisparus` / `noterFichiersRevus` (lot PASTILLE-DRIVE-EN-DIRECT) — la corbeille et son retour.
 *
 * 🔴 CE QUI SE PERDRAIT SANS CES ÉPREUVES, et ce n'est pas théorique : la tentation est de tout faire passer par
 * `noterFichiersVus`, qui sait déjà écrire une ligne entière. Elle exige alors le nom, l'empreinte, la taille et
 * les dates — qu'un déplacement ne change pas — donc une relecture du fichier chez Google pour reposer ce qu'on a
 * déjà. Et elle remet `releve_le = now()`, ce qui ferait croire l'index plus frais qu'il n'est : cette date dit
 * « je l'ai VU », pas « on me l'a raconté ».
 *
 * ⚠️ SANS LA MIGRATION 299, la table n'est NOMMÉE NULLE PART : chaque fonction rend `0` et n'émet aucune requête.
 * C'est la règle du module, et elle est éprouvée pour chacune.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
const indexDispoMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({
  indexEmpreintesDriveDisponible: () => indexDispoMock(),
  pieceMd5Disponible: async () => true,
}));

import { noterFichiersDisparus, noterFichiersRevus, noterParentDeplace } from './empreinteDriveRepo';

const sql = (i = 0): string => String(queryMock.mock.calls[i][0]).replace(/\s+/g, ' ');
const params = (i = 0): unknown[] => queryMock.mock.calls[i][1] as unknown[];

beforeEach(() => {
  queryMock.mockReset(); indexDispoMock.mockReset();
  indexDispoMock.mockResolvedValue(true);
  queryMock.mockResolvedValue({ rowCount: 1, rows: [] });
});

describe('🔴🔴 un déplacement change le PARENT, et rien d’autre', () => {
  it('🔴🔴 c’est un UPDATE de `parent_id`, sur ce seul fichier', async () => {
    expect(await noterParentDeplace('F1', 'CIBLE')).toBe(1);
    expect(sql()).toContain('UPDATE gestion_drive_empreinte SET parent_id = $2');
    expect(sql()).toContain('WHERE drive_file_id = $1');
    expect(params()).toEqual(['F1', 'CIBLE']);
  });

  /**
   * 🔴🔴 `releve_le` N'EST PAS TOUCHÉ, ET C'EST LE POINT. La date dit « je l'ai VU » ; on vient d'apprendre qu'il
   * a bougé, on ne vient pas de le voir. La mentir ferait croire l'index plus frais qu'il n'est.
   */
  it('🔴🔴 ni `releve_le`, ni le nom, ni l’empreinte, ni la taille', async () => {
    await noterParentDeplace('F1', 'CIBLE');
    for (const colonne of ['releve_le', 'nom =', 'md5 =', 'taille_octets', 'modifie_le', 'est_dossier']) {
      expect(sql(), colonne).not.toContain(colonne);
    }
  });

  /** ⚠️ LA LIGNE DÉJÀ À LA BONNE PLACE N'EST PAS RÉÉCRITE. */
  it('⚠️ rien à écrire quand le parent est déjà le bon', async () => {
    await noterParentDeplace('F1', 'CIBLE');
    expect(sql()).toContain("coalesce(parent_id, '') <> $2");
  });

  it('⚠️ un identifiant vide n’émet aucune requête', async () => {
    expect(await noterParentDeplace('  ', 'CIBLE')).toBe(0);
    expect(await noterParentDeplace('F1', '  ')).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('⚠️ sans la migration 299, aucune requête', async () => {
    indexDispoMock.mockResolvedValue(false);
    expect(await noterParentDeplace('F1', 'CIBLE')).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('🔴 la corbeille et son retour', () => {
  /** 🔴 ON DATE, ON N'EFFACE PAS : une ligne supprimée ne dirait plus rien ; une ligne datée dit jusqu'à quand. */
  it('🔴 « disparus » DATE, et ne supprime rien', async () => {
    expect(await noterFichiersDisparus(['F1', 'F2'])).toBe(1);
    expect(sql()).toContain('SET disparu_le = now()');
    expect(sql()).not.toContain('DELETE');
    expect(params()).toEqual([['F1', 'F2']]);
  });

  /**
   * 🔴 ET LE RETOUR LÈVE LA MARQUE : un compteur qui ne sait que baisser finit à zéro et ne dit plus rien. Une
   * mise à la corbeille annulée dans la seconde éteindrait la pastille pour toujours.
   */
  it('🔴 « revus » lève la marque, et ne touche pas `releve_le`', async () => {
    expect(await noterFichiersRevus(['F1'])).toBe(1);
    expect(sql()).toContain('SET disparu_le = NULL');
    expect(sql()).not.toContain('releve_le');
  });

  /** ⚠️ LES DOUBLONS ET LES VIDES SONT ÉCARTÉS AVANT LA REQUÊTE, pour les deux sens. */
  it('⚠️ la liste est nettoyée, et une liste vide n’interroge pas la base', async () => {
    await noterFichiersRevus(['F1', 'F1', '  ', '']);
    expect(params()).toEqual([['F1']]);
    queryMock.mockClear();
    expect(await noterFichiersDisparus(['', '   '])).toBe(0);
    expect(await noterFichiersRevus([])).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('⚠️ sans la migration 299, aucune requête dans les deux sens', async () => {
    indexDispoMock.mockResolvedValue(false);
    expect(await noterFichiersDisparus(['F1'])).toBe(0);
    expect(await noterFichiersRevus(['F1'])).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
