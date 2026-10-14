import { describe, it, expect } from 'vitest';
import {
  dallesDuCercle, empriseDalle, etatDalle, geoTransformAttendue, lireNomDalle, nomDalle, volumeEstimeOctets,
  RAYON_DEFAUT_M, TUILES_PAR_DALLE,
} from './grilleLidar';

/**
 * Lot IMPORT LiDAR HD — la grille des dalles, éprouvée contre ce qui est MESURÉ en base (dalle d'Asnières) et contre la
 * géométrie du cercle (dalles de bord incluses). Aucune base.
 */
const NOTRE_DAME_L93 = { x: 652296.9731460073, y: 6861636.3585152 }; // ST_Transform du parvis (48.853, 2.3499), mesuré
const ASNIERES = { xKm: 646, yKm: 6868 };

describe('la dalle d’Asnières, telle qu’elle est en base', () => {
  it('nom, emprise et géoréférencement : ceux de LHD_FXX_0646_6868 (coin haut-gauche 645999.75 / 6868000.25)', () => {
    expect(nomDalle(ASNIERES)).toBe('0646_6868');
    expect(lireNomDalle('0646_6868')).toEqual(ASNIERES);
    expect(lireNomDalle('646-6868')).toBeNull();
    expect(empriseDalle(ASNIERES)).toEqual({ xmin: 645999.75, xmax: 646999.75, ymin: 6867000.25, ymax: 6868000.25 });
    expect(geoTransformAttendue(ASNIERES)).toEqual([645999.75, 0.5, 0, 6868000.25, 0, -0.5]);
    expect(TUILES_PAR_DALLE).toBe(64); // 8 × 8 tuiles de 256 px (bords 208 px), comme les 64 lignes mesurées
  });
});

describe('les dalles du cercle', () => {
  it('cercle de 36 km autour de Notre-Dame : 4 221 dalles (le disque fait 4 072 km² ; les dalles de bord sont incluses)', () => {
    const dalles = dallesDuCercle(NOTRE_DAME_L93, RAYON_DEFAUT_M);
    expect(dalles).toHaveLength(4221);
    expect(new Set(dalles.map(nomDalle)).size).toBe(4221); // aucun doublon
    const aire = Math.PI * 36 ** 2;
    expect(dalles.length).toBeGreaterThan(aire);
    expect(dalles.length).toBeLessThan(Math.PI * (36 + Math.SQRT2) ** 2); // au plus une diagonale de dalle au-delà
    expect(dalles.map(nomDalle)).toContain('0646_6868'); // Asnières, à ~8,7 km de Notre-Dame
  });

  it('une dalle à peine effleurée est incluse, une dalle hors d’atteinte d’un centimètre ne l’est pas', () => {
    const e = empriseDalle(ASNIERES);
    // Centre à l'ouest de la dalle, à exactement 10 m de son bord ouest.
    const centre = { x: e.xmin - 10, y: (e.ymin + e.ymax) / 2 };
    expect(dallesDuCercle(centre, 10).map(nomDalle)).toContain('0646_6868');
    expect(dallesDuCercle(centre, 9.99).map(nomDalle)).not.toContain('0646_6868');
  });

  it('petit cercle au milieu d’une dalle → 1 dalle ; au coin commun de 4 dalles → 4 dalles', () => {
    const e = empriseDalle(ASNIERES);
    expect(dallesDuCercle({ x: (e.xmin + e.xmax) / 2, y: (e.ymin + e.ymax) / 2 }, 1).map(nomDalle)).toEqual(['0646_6868']);
    expect(dallesDuCercle({ x: e.xmax, y: e.ymin }, 1).map(nomDalle).sort()).toEqual(['0646_6867', '0646_6868', '0647_6867', '0647_6868']);
    expect(dallesDuCercle({ x: 0, y: 0 }, 0)).toEqual([]);
  });
});

describe('état d’une dalle en base et volume', () => {
  it('64/64 présente ; 0/0 absente ; tout autre compte incohérente (jamais touchée)', () => {
    expect(etatDalle({ MNS: 64, MNT: 64 })).toBe('presente');
    expect(etatDalle({ MNS: 0, MNT: 0 })).toBe('absente');
    for (const [a, b] of [[64, 0], [0, 64], [63, 64], [128, 128], [65, 64]]) expect(etatDalle({ MNS: a, MNT: b })).toBe('incoherente');
  });
  it('volume : 16 752 640 octets mesurés par dalle et par couche', () => {
    expect(volumeEstimeOctets(1)).toBe(2 * 16_752_640);
    expect(volumeEstimeOctets(4220)).toBe(4220 * 2 * 16_752_640);
  });
});
