/**
 * ZONE SANS LiDAR (lot du 15/10/2026), données SIMULÉES : l'origine est dans un bâtiment BD TOPO, mais AUCUNE tuile LiDAR
 * n'existe autour du point (la lecture du MNT ne trouve rien → alt_terrain_mnt NULL). Ce que fait le pipeline, sans base.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { q } = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('./client', () => ({ query: q }));

import { analyserAdresse, construireEntree } from './pipeline';
import { mntSousLePoint } from './couvertureLidar';
import { motifSansResultat } from '../tunnel/motifSansResultat';

/** La ligne que rend la requête de validerOrigine pour un bâtiment de Vélizy sans dalle LiDAR (snap sur sa bordure). */
const LIGNE_ORIGINE_SANS_MNT = {
  id: 1234567, cleabs: 'BATIMENT0000000000000001', polygone_wkt: 'POLYGON((642680 6853600,642690 6853600,642690 6853612,642680 6853612,642680 6853600))',
  alt_sol_bdtopo: 171.2, alt_terrain_mnt: null, dist_m: 0, couvert: true,
  snap_x: 642685.2785637568, snap_y: 6853600, snap_lon: 2.2205969595575814, snap_lat: 48.78132268116829,
};

beforeEach(() => q.mockReset());

describe('analyserAdresse — origine dans un bâtiment, aucune donnée LiDAR autour', () => {
  it('validation VALIDE, altitude null, resultat null — UNE seule requête, aucun calcul lancé', async () => {
    q.mockResolvedValueOnce({ rows: [LIGNE_ORIGINE_SANS_MNT] });
    const { validation, resultat } = await analyserAdresse({
      point: { lat: 48.78132268116829, lon: 2.2205969595575814 }, azimutPrincipalDeg: 90, etage: 2, dernierEtage: false,
    });
    expect(validation.valide).toBe(true); // c'est ce que diag:temps affichait (« Origine valide : oui · verdict : — »)
    expect(validation.altitudeTerrainOrigineM).toBeNull();
    expect(resultat).toBeNull(); // garde du pipeline : pas d'altitude → pas d'entrée → pas de verdict ni de score
    expect(q).toHaveBeenCalledTimes(1); // arrêt voulu, pas une erreur avalée : aucune autre requête n'est partie
  });

  it('construireEntree rend entree null (la garde prévue), et la couverture dit pourquoi : pas_de_lidar', async () => {
    q.mockResolvedValueOnce({ rows: [LIGNE_ORIGINE_SANS_MNT] });
    const { validation, entree } = await construireEntree({
      point: { lat: 48.78132268116829, lon: 2.2205969595575814 }, azimutPrincipalDeg: 90, etage: 2, dernierEtage: false,
    });
    expect(entree).toBeNull();
    q.mockResolvedValueOnce({ rows: [{ couvert: false }] }); // aucune tuile MNT ne contient le point
    const mnt = await mntSousLePoint(validation.pointSnappeL93!);
    expect(mnt).toBe(false);
    const [sql, params] = q.mock.calls[1];
    expect(String(sql).replace(/\s+/g, ' ')).toContain('ST_ConvexHull(m.rast) && p.g AND ST_Intersects(m.rast, p.g)'); // par l'index
    expect(params).toEqual([642685.2785637568, 6853600]);
    expect(motifSansResultat(validation, mnt)).toBe('pas_de_lidar');
  });

  it('une dalle présente mais sans valeur au point (nodata) reste « altitude_indisponible »', async () => {
    q.mockResolvedValueOnce({ rows: [LIGNE_ORIGINE_SANS_MNT] }).mockResolvedValueOnce({ rows: [{ couvert: true }] });
    const { validation } = await construireEntree({
      point: { lat: 48.78132268116829, lon: 2.2205969595575814 }, azimutPrincipalDeg: 90, etage: 2, dernierEtage: false,
    });
    expect(motifSansResultat(validation, await mntSousLePoint(validation.pointSnappeL93!))).toBe('altitude_indisponible');
  });
});
