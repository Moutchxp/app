import { describe, it, expect } from 'vitest';
import { dalleIgn, motifSansResultat } from './motifSansResultat';

describe('motifSansResultat — pourquoi une analyse s’arrête sans verdict', () => {
  it('origine hors bâtiment → origine_invalide (la couverture LiDAR n’y change rien)', () => {
    expect(motifSansResultat({ valide: false, altitudeTerrainOrigineM: null }, null)).toBe('origine_invalide');
    expect(motifSansResultat({ valide: false, altitudeTerrainOrigineM: null }, false)).toBe('origine_invalide');
    expect(motifSansResultat({}, null)).toBe('origine_invalide'); // forme inattendue : jamais « valide » par défaut
  });

  it('dans un bâtiment, aucune dalle MNT sous le point → pas_de_lidar', () => {
    expect(motifSansResultat({ valide: true, altitudeTerrainOrigineM: null }, false)).toBe('pas_de_lidar');
  });

  it('dalle MNT présente mais sans valeur au point → altitude_indisponible', () => {
    expect(motifSansResultat({ valide: true, altitudeTerrainOrigineM: null }, true)).toBe('altitude_indisponible');
  });

  it('couverture non vérifiable (null) → altitude_indisponible : on n’affirme jamais « pas de LiDAR » sans preuve', () => {
    expect(motifSansResultat({ valide: true, altitudeTerrainOrigineM: null }, null)).toBe('altitude_indisponible');
  });

  it('origine valide AVEC altitude → null (le moteur a rendu un résultat)', () => {
    expect(motifSansResultat({ valide: true, altitudeTerrainOrigineM: 41.57033157348633 }, true)).toBeNull();
    expect(motifSansResultat({ valide: true, altitudeTerrainOrigineM: 0 }, null)).toBeNull(); // 0 m est une altitude
  });
});

describe('dalleIgn — nom de la dalle LiDAR HD (coin Nord-Ouest, km)', () => {
  it('Vélizy (constat du 15/10/2026) : 642 685 / 6 853 606 → 0642_6854', () => {
    expect(dalleIgn(642685.2785637568, 6853606.124672878)).toBe('0642_6854');
  });

  it('Asnières (dalle du Mac, 646 000 × 6 867 000) → 0646_6868', () => {
    expect(dalleIgn(646451.7, 6867683.6)).toBe('0646_6868');
  });

  it('bords exacts : le coin Sud-Ouest appartient à la dalle, pas le bord Nord', () => {
    expect(dalleIgn(646000, 6867000)).toBe('0646_6868');
    expect(dalleIgn(646999.999, 6867999.999)).toBe('0646_6868');
  });
});
