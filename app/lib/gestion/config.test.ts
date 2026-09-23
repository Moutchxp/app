import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...args: unknown[]) => queryMock(...args) }));

import { chargerConfigGestion, CONFIG_GESTION_DEFAUT, listeDe } from './config';

/**
 * LOT 3 — la configuration du module. Deux exigences :
 *   · le REPLI SÛR : table absente, ligne manquante, base injoignable ⇒ les défauts, JAMAIS une exception qui
 *     empêcherait l'écran de s'ouvrir ;
 *   · le repli doit dire EXACTEMENT ce que dit la base. Un repli qui diverge des DEFAULT de la migration est un piège :
 *     l'outil se comporterait différemment selon que la table existe ou non. Le dernier test compare les deux.
 */

beforeEach(() => { queryMock.mockReset(); });

const ligne = (o: Record<string, unknown> = {}) => ({
  rows: [{
    dossier_imap: '_GESTION BOITE MAIL', adresse_gestion: 'gestion@criterimmo.fr',
    domaines_internes: 'criterimmo.fr,sansvisavis.com', rattrapage_jours: 90, plafond_par_passe: 400,
    types_pieces_acceptes: 'application/pdf,image/jpeg', piece_taille_max_mo: 25, conservation_carte_close_mois: 60, ...o,
  }],
});

describe('repli sûr', () => {
  it('table absente / base injoignable → les défauts, jamais une exception', async () => {
    queryMock.mockRejectedValue(new Error('relation "gestion_config" does not exist'));
    expect(await chargerConfigGestion()).toEqual(CONFIG_GESTION_DEFAUT);
  });

  it('ligne singleton manquante → les défauts', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await chargerConfigGestion()).toEqual(CONFIG_GESTION_DEFAUT);
  });

  it('valeur vide ou absurde en base → le défaut pour CE champ, les autres restent lus', async () => {
    queryMock.mockResolvedValue(ligne({ dossier_imap: '   ', rattrapage_jours: 0, plafond_par_passe: -5 }));
    const c = await chargerConfigGestion();
    expect(c.dossierImap).toBe(CONFIG_GESTION_DEFAUT.dossierImap);
    expect(c.rattrapageJours).toBe(90);
    expect(c.plafondParPasse).toBe(400);
    expect(c.adresseGestion).toBe('gestion@criterimmo.fr'); // lu, pas écrasé
  });
});

describe('lecture normale', () => {
  it('lit le singleton et convertit ce qui doit l’être', async () => {
    queryMock.mockResolvedValue(ligne({ dossier_imap: 'AUTRE DOSSIER', piece_taille_max_mo: 10 }));
    const c = await chargerConfigGestion();
    expect(c.dossierImap).toBe('AUTRE DOSSIER');
    expect(c.pieceTailleMaxOctets).toBe(10 * 1024 * 1024); // les Mo de l'écran deviennent des octets pour le code
    expect(c.domainesInternes).toEqual(['criterimmo.fr', 'sansvisavis.com']);
    expect(c.typesPiecesAcceptes).toEqual(['application/pdf', 'image/jpeg']);
    expect(queryMock.mock.calls[0][0]).toContain('gestion_config');
  });

  it('l’adresse de gestion est minusculée : c’est elle qui décide du SENS de chaque message', async () => {
    queryMock.mockResolvedValue(ligne({ adresse_gestion: 'Gestion@Criterimmo.FR' }));
    expect((await chargerConfigGestion()).adresseGestion).toBe('gestion@criterimmo.fr');
  });

  it('découpe les listes en tolérant espaces, casse et virgules en trop', () => {
    expect(listeDe(' Criterimmo.FR , ,sansvisavis.com ')).toEqual(['criterimmo.fr', 'sansvisavis.com']);
    expect(listeDe(null)).toEqual([]);
  });
});

describe('le repli dit EXACTEMENT ce que dit la migration 228', () => {
  const sql = readFileSync('db/migrations/228_gestion_schema.sql', 'utf8');

  it('dossier, adresse, domaines internes', () => {
    expect(sql).toContain(`DEFAULT '${CONFIG_GESTION_DEFAUT.dossierImap}'`);
    expect(sql).toContain(`DEFAULT '${CONFIG_GESTION_DEFAUT.adresseGestion}'`);
    expect(sql).toContain(`DEFAULT '${CONFIG_GESTION_DEFAUT.domainesInternes.join(',')}'`);
  });

  it('profondeur de rattrapage, plafond, taille et conservation', () => {
    expect(new RegExp(`rattrapage_jours\\s+integer\\s+NOT NULL DEFAULT ${CONFIG_GESTION_DEFAUT.rattrapageJours}\\b`).test(sql)).toBe(true);
    expect(new RegExp(`plafond_par_passe\\s+integer\\s+NOT NULL DEFAULT ${CONFIG_GESTION_DEFAUT.plafondParPasse}\\b`).test(sql)).toBe(true);
    expect(new RegExp(`piece_taille_max_mo\\s+integer\\s+NOT NULL DEFAULT ${CONFIG_GESTION_DEFAUT.pieceTailleMaxOctets / (1024 * 1024)}\\b`).test(sql)).toBe(true);
    expect(new RegExp(`conservation_carte_close_mois integer\\s+NOT NULL DEFAULT ${CONFIG_GESTION_DEFAUT.conservationCarteCloseMois}\\b`).test(sql)).toBe(true);
  });

  it('la liste des types acceptés, type par type', () => {
    for (const t of CONFIG_GESTION_DEFAUT.typesPiecesAcceptes) expect(sql).toContain(t);
    expect(sql).toContain(`DEFAULT '${CONFIG_GESTION_DEFAUT.typesPiecesAcceptes.join(',')}'`);
  });
});
