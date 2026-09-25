import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const miniaturesMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
  pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
}));
vi.mock('./schema', () => ({ miniaturesDisponibles: () => miniaturesMock() }));

import {
  lireEnTeteMessage, lireEtatMiniature, lirePiecesDuMessage, memoriserEchecMiniature, memoriserMiniature,
} from './piecesRepo';

const sql = (i: number): string => String(queryMock.mock.calls[i][0]).replace(/\s+/g, ' ');
const params = (i: number): unknown[] => queryMock.mock.calls[i][1] as unknown[];

beforeEach(() => { queryMock.mockReset(); miniaturesMock.mockReset(); miniaturesMock.mockResolvedValue(true); });

describe('les pièces d’un message', () => {
  it('ne prend que celles RÉELLEMENT déposées, dans l’ordre de capture', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lirePiecesDuMessage(7);
    expect(sql(0)).toContain('cle_stockage IS NOT NULL');
    expect(sql(0)).toContain('ORDER BY id');
    expect(params(0)).toEqual([7]);
  });

  /**
   * `pg` rend un bigint SOUS FORME DE CHAÎNE. Sans conversion, additionner les tailles CONCATÉNERAIT les chiffres :
   * « 1000 » + « 2000 » = « 10002000 », et le plafond d'archive se déclencherait au hasard.
   */
  it('la taille revient en NOMBRE, jamais en chaîne', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 1, nom_fichier: 'a.pdf', type_mime: 'application/pdf', cle_stockage: 'k', taille_octets: '3145728' }],
    });
    const p = await lirePiecesDuMessage(7);
    expect(p[0].tailleOctets).toBe(3_145_728);
    expect(typeof p[0].tailleOctets).toBe('number');
  });

  it('une taille inconnue reste nulle, elle ne devient pas zéro', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 1, nom_fichier: 'a', type_mime: null, cle_stockage: 'k', taille_octets: null }],
    });
    expect((await lirePiecesDuMessage(7))[0].tailleOctets).toBeNull();
  });
});

describe('l’en-tête du message (pour nommer l’archive)', () => {
  it('rend la date en jour, et l’objet', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 7, objet: 'Fenêtre cassée', recu_le: '2026-09-25' }] });
    expect(await lireEnTeteMessage(7)).toEqual({ messageId: 7, objet: 'Fenêtre cassée', recuLe: '2026-09-25' });
  });
  it('un message inconnu rend null, pas une exception', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lireEnTeteMessage(7)).toBeNull();
  });
});

describe('l’état de la miniature — et la sonde de schéma', () => {
  /**
   * 🔴 LA RÈGLE DU MODULE DEPUIS LE LOT 4a : on DEMANDE au schéma ce qu'il sait faire AVANT d'émettre le SQL. Nommer
   * une colonne qui n'existe pas encore ferait échouer la requête, donc la route, donc la carte — et la migration est
   * livrée NON APPLIQUÉE, donc ce cas est le cas NORMAL pendant plusieurs jours.
   */
  it('migration 244 ABSENTE : la requête ne nomme AUCUNE colonne de miniature', async () => {
    miniaturesMock.mockResolvedValue(false);
    queryMock.mockResolvedValue({ rows: [{ cle_stockage: 'k', nom_fichier: 'a.pdf', type_mime: 'application/pdf', miniature_etat: null, miniature_cle: null, miniature_motif: null }] });
    const e = await lireEtatMiniature(3);
    // Les TROIS sont des constantes aliasées, donc aucune colonne réelle n'est nommée — c'est ce qui permet à la
    //   requête de s'exécuter sur un schéma qui ne les a pas encore.
    expect(sql(0)).toContain('NULL::text AS miniature_etat');
    expect(sql(0)).toContain('NULL::text AS miniature_cle');
    expect(sql(0)).toContain('NULL::text AS miniature_motif');
    expect(e?.etat).toBeNull(); // « jamais tentée » : la vignette sera refaite, et c'est le prix assumé
  });

  it('migration 244 PRÉSENTE : les colonnes sont lues', async () => {
    queryMock.mockResolvedValue({ rows: [{ cle_stockage: 'k', nom_fichier: 'a.pdf', type_mime: null, miniature_etat: 'ok', miniature_cle: 'm', miniature_motif: null }] });
    const e = await lireEtatMiniature(3);
    expect(sql(0)).toContain('miniature_etat, miniature_cle, miniature_motif');
    expect(e).toMatchObject({ etat: 'ok', cleMiniature: 'm' });
  });

  it('une pièce jamais déposée n’a rien à montrer', async () => {
    queryMock.mockResolvedValue({ rows: [{ cle_stockage: null, nom_fichier: 'a', type_mime: null, miniature_etat: null, miniature_cle: null, miniature_motif: null }] });
    expect(await lireEtatMiniature(3)).toBeNull();
  });

  it('un état inattendu en base est ramené à « jamais tentée », jamais cru sur parole', async () => {
    queryMock.mockResolvedValue({ rows: [{ cle_stockage: 'k', nom_fichier: 'a', type_mime: null, miniature_etat: 'nimporte quoi', miniature_cle: null, miniature_motif: null }] });
    expect((await lireEtatMiniature(3))?.etat).toBeNull();
  });
});

describe('mémoriser une miniature', () => {
  it('écrit la clé et l’état « ok »', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await memoriserMiniature(3, 'gestion/miniatures/3/x.jpg')).toBe(true);
    expect(sql(0)).toContain('UPDATE gestion_piece');
    expect(sql(0)).toContain("miniature_etat = 'ok'");
    expect(params(0)).toEqual([3, 'gestion/miniatures/3/x.jpg']);
  });

  it('sans la migration 244 : on n’écrit RIEN, et on le dit à l’appelant', async () => {
    miniaturesMock.mockResolvedValue(false);
    expect(await memoriserMiniature(3, 'k')).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  /** Sans mémoire de l'échec, un fichier mal formé serait re-décodé à chaque affichage : une charge permanente. */
  it('un échec est mémorisé UNE fois, avec son motif borné', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await memoriserEchecMiniature(3, 'PDF illisible')).toBe(true);
    expect(sql(0)).toContain("miniature_etat = 'echec'");
    expect(sql(0)).toContain('left($2, 300)');
    expect(params(0)).toEqual([3, 'PDF illisible']);
  });

  it('un échec efface la clé : on ne garde pas le chemin d’une vignette qui n’existe pas', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await memoriserEchecMiniature(3, 'x');
    expect(sql(0)).toContain('miniature_cle = NULL');
  });

  it('sans la migration 244, l’échec non plus n’est pas écrit', async () => {
    miniaturesMock.mockResolvedValue(false);
    expect(await memoriserEchecMiniature(3, 'x')).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
