import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const depotsMock = vi.fn();
vi.mock('../../../../../lib/gestion/driveRepo', () => ({
  lireDepotsDesPieces: (...a: unknown[]) => depotsMock(...a),
}));
const emplacementsMock = vi.fn();
vi.mock('../../../../../lib/gestion/pieceDansLeDriveRepo', () => ({
  emplacementsDesPieces: (...a: unknown[]) => emplacementsMock(...a),
}));
const schemaMock = vi.fn();
vi.mock('../../../../../lib/gestion/schema', () => ({
  depotsDriveDisponibles: (...a: unknown[]) => schemaMock(...a),
}));

import { GET, PIECES_DRIVE_MAX } from './route';

/**
 * LOT HISTORIQUE-BIEN-1 — CE QUI EST DÉJÀ DANS LE DRIVE, POUR UNE LISTE DE PIÈCES DE PLUSIEURS ÉCHANGES.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CETTE ROUTE ÉVITE : 25 requêtes. Le résumé du bloc « Historique » rassemble les pièces de tous les
 * mails de la page — jusqu'à 25 mails d'autant d'échanges DIFFÉRENTS. La route d'échange
 * (`/fils/[id]/pieces-drive`) aurait demandé une requête par échange, ce qu'elle avait elle-même été écrite pour
 * éviter côté message.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const requete = (q: string) => new Request(`http://local/api/admin/gestion/pieces-drive${q}`);

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  depotsMock.mockReset(); depotsMock.mockResolvedValue([]);
  emplacementsMock.mockReset(); emplacementsMock.mockResolvedValue([]);
  schemaMock.mockReset(); schemaMock.mockResolvedValue(true);
});

describe('le statut Drive d’une liste de pièces', () => {
  it('🔒 exige le droit « gestion » : la réponse dit dans quel dossier client une pièce a été rangée', async () => {
    await GET(requete('?pieces=1,2'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('🔒 refus ⇒ aucune lecture', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(requete('?pieces=1,2'))).status).toBe(403);
    expect(depotsMock).not.toHaveBeenCalled();
    expect(emplacementsMock).not.toHaveBeenCalled();
  });

  it('🔴 UNE seule lecture pour toute la liste, par la variante `pieceIds` des repos existants', async () => {
    await GET(requete('?pieces=11,22,33'));
    expect(depotsMock).toHaveBeenCalledTimes(1);
    expect(depotsMock.mock.calls[0][0]).toEqual([11, 22, 33]);
    expect(emplacementsMock).toHaveBeenCalledTimes(1);
    expect(emplacementsMock.mock.calls[0][0]).toEqual({ pieceIds: [11, 22, 33] });
  });

  it('🔴 elle rend LES DEUX : les dépôts et les emplacements (ils ne disent pas la même chose)', async () => {
    depotsMock.mockResolvedValue([{ pieceId: 11, dossierNom: 'Baux', webViewLink: null }]);
    emplacementsMock.mockResolvedValue([{ pieceId: 22, emplacements: [], chemins: [] }]);
    const res = await GET(requete('?pieces=11,22'));
    const d = await res.json() as { etat: string; depots: unknown[]; emplacements: unknown[] };
    expect(d.etat).toBe('ok');
    expect(d.depots).toHaveLength(1);
    expect(d.emplacements).toHaveLength(1);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  /** ⚠️ LECTURE TOLÉRANTE : un identifiant abîmé est écarté, il ne fait pas tomber la réponse. */
  it('⚠️ les identifiants abîmés sont écartés, et les doublons fondus', async () => {
    await GET(requete('?pieces=11,,abc,-4,0,11,22'));
    expect(depotsMock.mock.calls[0][0]).toEqual([11, 22]);
  });

  it('⚠️ aucune pièce ⇒ réponse vide immédiate, sans toucher la base', async () => {
    const res = await GET(requete(''));
    expect((await res.json() as { etat: string }).etat).toBe('ok');
    expect(schemaMock).not.toHaveBeenCalled();
    expect(depotsMock).not.toHaveBeenCalled();
  });

  /** ⚠️ MIGRATION 245 ABSENTE ⇒ `sans_schema`, PAS UNE ERREUR : aucun dépôt ne PEUT exister. */
  it('⚠️ sans la migration des dépôts, la réponse le dit et reste un 200', async () => {
    schemaMock.mockResolvedValue(false);
    const res = await GET(requete('?pieces=11'));
    expect(res.status).toBe(200);
    expect((await res.json() as { etat: string }).etat).toBe('sans_schema');
    expect(depotsMock).not.toHaveBeenCalled();
  });

  /** ⚠️ UNE ADRESSE N'EST PAS UNE DEMANDE : le nombre de pièces est borné. */
  it('⚠️ le nombre de pièces est borné', async () => {
    const trop = Array.from({ length: PIECES_DRIVE_MAX + 50 }, (_, i) => i + 1).join(',');
    await GET(requete(`?pieces=${trop}`));
    expect(depotsMock.mock.calls[0][0]).toHaveLength(PIECES_DRIVE_MAX);
  });

  it('⚠️ une panne de base se DIT (503), sans perdre la forme de la réponse', async () => {
    depotsMock.mockRejectedValue(new Error('base muette'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(requete('?pieces=11'));
    expect(res.status).toBe(503);
    const d = await res.json() as { etat: string; depots: unknown[] };
    expect(d.etat).toBe('erreur');
    expect(d.depots).toEqual([]);
  });
});
