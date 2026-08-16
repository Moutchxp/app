import { describe, it, expect } from 'vitest';
import {
  appliquerPreseanceAltitude, etatInitialDepuisResultat,
  type EtatAltitudePolygone,
} from './preseanceAltitude';
import type { ResultatRattachement } from './detectionRattachement';

/**
 * FUS-3a — préséance LiDAR sur l'altitude d'un polygone (module PUR). On éprouve les trois scénarios de la spec + le cas
 * « LiDAR arrive APRÈS validation d'un permis » (rappelé deux fois), + la GARDE anti-inversion de la préséance.
 */
const vide: EtatAltitudePolygone = { altitudeNgf: null, origine: null, altitudeLidarRefige: null };
const lidar = (a: number): EtatAltitudePolygone => ({ altitudeNgf: a, origine: 'lidar', altitudeLidarRefige: null });

describe('appliquerPreseanceAltitude — préséance LiDAR', () => {
  it('mesure LiDAR arrivée → écrase l’altitude quelle que soit l’origine (ici permis validé) ; dossier annule_par_lidar', () => {
    const permisValide: EtatAltitudePolygone = { altitudeNgf: 88.91, origine: 'permis', altitudeLidarRefige: 42.0 };
    const r = appliquerPreseanceAltitude(permisValide, { type: 'mesure_lidar', altitudeLidar: 90.5 });
    expect(r.etat).toEqual({ altitudeNgf: 90.5, origine: 'lidar', altitudeLidarRefige: null });
    expect(r.ecrasePermis).toBe(true);       // → le dossier passe à annule_par_lidar
    expect(r.effet).toBe('ecrase_par_lidar');
    expect(r.trace).toMatch(/écrase l'altitude permis 88\.91/);
  });

  it('permis en cours NON validé (rien d’écrit) → une mesure LiDAR met à jour, sans rien écraser', () => {
    const r = appliquerPreseanceAltitude(vide, { type: 'mesure_lidar', altitudeLidar: 41.3 });
    expect(r.etat).toEqual({ altitudeNgf: 41.3, origine: 'lidar', altitudeLidarRefige: null });
    expect(r.ecrasePermis).toBe(false);      // rien à écraser
    expect(r.effet).toBe('lidar_maj');
  });

  it('retour arrière manuel → restaure l’altitude LiDAR REFIGÉE (celle d’avant écrasement, à jour)', () => {
    const permisValide: EtatAltitudePolygone = { altitudeNgf: 88.91, origine: 'permis', altitudeLidarRefige: 42.7 };
    const r = appliquerPreseanceAltitude(permisValide, { type: 'retour_arriere' });
    expect(r.etat).toEqual({ altitudeNgf: 42.7, origine: 'lidar', altitudeLidarRefige: null });
    expect(r.effet).toBe('retour_lidar');
  });

  it('retour arrière sans rien de refigé → sans effet', () => {
    const r = appliquerPreseanceAltitude(lidar(42.0), { type: 'retour_arriere' });
    expect(r.effet).toBe('sans_effet');
    expect(r.etat).toEqual(lidar(42.0));
  });

  it('CAS CENTRAL — LiDAR arrive APRÈS validation d’un permis : injection puis mesure LiDAR l’écrase, retour restaure la LiDAR refigée', () => {
    // 1) validation du permis : injecte 88,91 en refigeant la LiDAR ACTUELLE (42,0 relue à l'instant, pas le snapshot)
    const apresInjection = appliquerPreseanceAltitude(lidar(42.0), { type: 'injection_permis', altitudePermis: 88.91, altitudeLidarActuelle: 42.0 });
    expect(apresInjection.etat).toEqual({ altitudeNgf: 88.91, origine: 'permis', altitudeLidarRefige: 42.0 });
    // 2) une mesure LiDAR arrive plus tard (toit construit enfin mesuré) → écrase le permis validé
    const apresLidar = appliquerPreseanceAltitude(apresInjection.etat, { type: 'mesure_lidar', altitudeLidar: 90.5 });
    expect(apresLidar.etat).toEqual({ altitudeNgf: 90.5, origine: 'lidar', altitudeLidarRefige: null });
    expect(apresLidar.ecrasePermis).toBe(true);
  });

  it('la LiDAR refigée est celle passée À L’INJECTION (à jour), pas une valeur de snapshot antérieure', () => {
    // le snapshot d'analyse valait 40,0 ; à l'injection, la LiDAR actuelle vaut 42,0 → c'est 42,0 qui doit être refigée
    const apresInjection = appliquerPreseanceAltitude(lidar(42.0), { type: 'injection_permis', altitudePermis: 88.91, altitudeLidarActuelle: 42.0 });
    const retour = appliquerPreseanceAltitude(apresInjection.etat, { type: 'retour_arriere' });
    expect(retour.etat.altitudeNgf).toBe(42.0);     // pas 40,0 (snapshot périmé)
  });

  it('GARDE anti-inversion — une mesure LiDAR NE DOIT JAMAIS préserver une altitude d’origine permis (si ce test casse, la préséance a été inversée)', () => {
    const permisValide: EtatAltitudePolygone = { altitudeNgf: 88.91, origine: 'permis', altitudeLidarRefige: 42.0 };
    const r = appliquerPreseanceAltitude(permisValide, { type: 'mesure_lidar', altitudeLidar: 90.5 });
    // Le LiDAR MESURE, le permis DÉCLARE : la valeur permis NE survit PAS.
    expect(r.etat.origine).toBe('lidar');
    expect(r.etat.altitudeNgf).not.toBe(88.91);
    expect(r.etat.altitudeNgf).toBe(90.5);
    expect(r.ecrasePermis).toBe(true);
  });
});

describe('etatInitialDepuisResultat — bridge verdict FUS-2 → état du dossier', () => {
  const resultat = (over: Partial<ResultatRattachement>): ResultatRattachement => ({
    verdict: 'RATTACHEMENT_AUTOMATIQUE', regime: 'sans_fusion', motif: '',
    criteres: {
      surface: { applicable: false, ratio: null, seuil: 0.8, franchi: false },
      bordure: { applicable: false, part: null, seuil: 0.6, franchi: false },
      bati: { nbNouveauxOuModifies: 1, franchi: true },
    },
    preuves: [], ...over,
  });

  it('RIEN → aucun dossier (null)', () => {
    expect(etatInitialDepuisResultat(resultat({ verdict: 'RIEN', criteres: { surface: { applicable: false, ratio: null, seuil: 0.8, franchi: false }, bordure: { applicable: false, part: null, seuil: 0.6, franchi: false }, bati: { nbNouveauxOuModifies: 0, franchi: false } } }))).toBeNull();
  });

  it('ARBITRAGE_DEMANDE → arbitrage_demande (non auto)', () => {
    expect(etatInitialDepuisResultat(resultat({ verdict: 'ARBITRAGE_DEMANDE' }))).toEqual({ etat: 'arbitrage_demande', auto: false });
  });

  it('RATTACHEMENT_AUTOMATIQUE + polygone livré → valide AUTOMATIQUEMENT', () => {
    expect(etatInitialDepuisResultat(resultat({}))).toEqual({ etat: 'valide', auto: true });
  });

  it('RATTACHEMENT_AUTOMATIQUE + 0 polygone (fusion parcellaire nette) → en_attente_bati', () => {
    const r = resultat({ regime: 'avec_fusion', criteres: { surface: { applicable: true, ratio: 0.95, seuil: 0.8, franchi: true }, bordure: { applicable: true, part: 0.9, seuil: 0.6, franchi: true }, bati: { nbNouveauxOuModifies: 0, franchi: false } } });
    expect(etatInitialDepuisResultat(r)).toEqual({ etat: 'en_attente_bati', auto: false });
  });
});
