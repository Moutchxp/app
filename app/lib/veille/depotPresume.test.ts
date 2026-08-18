import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT A — signalerDepotPresume : COMPORTEMENT + paramètres LIÉS (db/client mocké, aucune DB). Prouve : lecture serveur du
 * canal/commune, le téléservice SEUL présume, l'UPSERT idempotent, la traduction de la violation de verrou (23505), et —
 * garde-fou central — qu'AUCUNE échéance ne peut courir (jamais de write sur statut/envoye_le).
 */
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { signalerDepotPresume } from './depotPresume';

const norm = (s: unknown) => String(s).replace(/\s+/g, ' ');
beforeEach(() => queryMock.mockReset());

describe('LOT A — signalerDepotPresume', () => {
  it('demande introuvable → « demande_introuvable », aucun INSERT', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // SELECT meta : rien
    expect(await signalerDepotPresume(233, 'texte')).toBe('demande_introuvable');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('canal ≠ formulaire → « non_formulaire », aucun INSERT (un e-mail ne présume rien)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code_insee: '93001', dest_canal: 'email' }] });
    expect(await signalerDepotPresume(1, 'texte')).toBe('non_formulaire');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('formulaire + « texte » → UPSERT sur demande_depot_presume, params liés [demande, code_insee, fenêtre], colonne copie_texte_le', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code_insee: '75056', dest_canal: 'formulaire' }] }); // SELECT
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });                                       // INSERT
    expect(await signalerDepotPresume(233, 'texte')).toBe('enregistre');
    const [sql, params] = queryMock.mock.calls[1];
    expect(norm(sql)).toContain('INSERT INTO demande_depot_presume');
    expect(norm(sql)).toContain('copie_texte_le');
    expect(norm(sql)).toContain('ON CONFLICT (demande_id) WHERE resolu_le IS NULL'); // idempotence par demande
    expect(params).toEqual([233, '75056', 60]);                                       // 60 s = fenêtre par défaut du lot
  });

  it('« ref » → colonne copie_ref_le', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code_insee: '75056', dest_canal: 'formulaire' }] });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await signalerDepotPresume(233, 'ref');
    expect(norm(queryMock.mock.calls[1][0])).toContain('copie_ref_le');
  });

  it('GARDE-FOU « aucune échéance » : aucune requête n’écrit demande.statut ni envoye_le ni l’acheminement', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code_insee: '75056', dest_canal: 'formulaire' }] });
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    await signalerDepotPresume(233, 'texte');
    const toutSql = queryMock.mock.calls.map(([s]) => String(s)).join(' | ');
    expect(/envoye_le|SET\s+statut|UPDATE\s+demande\b|demande_acheminement/i.test(toutSql)).toBe(false);
  });

  it('violation du VERROU commune (23505) → « verrou_commune » (une autre demande de la commune est en vol), jamais une exception nue', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code_insee: '75056', dest_canal: 'formulaire' }] });
    queryMock.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));
    expect(await signalerDepotPresume(999, 'texte')).toBe('verrou_commune');
  });

  it('erreur INATTENDUE → propagée (pas de catch muet)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ code_insee: '75056', dest_canal: 'formulaire' }] });
    queryMock.mockRejectedValueOnce(Object.assign(new Error('boom'), { code: '42P01' }));
    await expect(signalerDepotPresume(1, 'texte')).rejects.toThrow('boom');
  });
});
