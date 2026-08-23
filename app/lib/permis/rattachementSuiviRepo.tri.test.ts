import { describe, it, expect } from 'vitest';
import { trierLignesSuivi, type LigneSuivi, type EtatSuivi } from './rattachementSuiviRepo';

/**
 * L1 (décision Arno, 21/08/2026) — tri du suivi : URGENCE d'abord, RÉCENCE ensuite. On teste la fonction PURE `trierLignesSuivi`
 * (aucune base) : ① l'ordre d'urgence reste le 1er critère (inchangé), ② à urgence égale la date d'autorisation décroissante
 * (plus récent en haut), ③ une date absente est reléguée en FIN de groupe (jamais confondue avec une date récente).
 */
const l = (o: Partial<LigneSuivi>): LigneSuivi => ({
  dossierId: 1, numDau: 'X', commune: 'Paris', codeInsee: '75120', type: 'PC', adresse: null, natureTravaux: null,
  etat: 'suivi_aucun_signal', verdict: null, joursAnciennete: 0, derniereEvalIso: null, dateAutorisationIso: null, ...o,
});

const ordre = (lignes: LigneSuivi[]): number[] => trierLignesSuivi(lignes).map((x) => x.dossierId);

describe('L1 — trierLignesSuivi', () => {
  it('① URGENCE d’abord : un dossier à arbitrer passe AVANT un « aucun signal », même si l’arbitrage est plus ANCIEN', () => {
    const lignes = [
      l({ dossierId: 1, etat: 'suivi_aucun_signal', dateAutorisationIso: '2026-08-01' }), // récent mais peu urgent
      l({ dossierId: 2, etat: 'arbitrage_demande', dateAutorisationIso: '2020-01-01' }),  // ancien mais urgent
    ];
    expect(ordre(lignes)).toEqual([2, 1]); // l'urgence prime la récence — NE PAS réinverser
  });

  it('② à urgence égale : date_reelle_autorisation DÉCROISSANTE (plus récent en haut)', () => {
    const lignes = [
      l({ dossierId: 1, etat: 'arbitrage_demande', dateAutorisationIso: '2024-05-10' }),
      l({ dossierId: 2, etat: 'arbitrage_demande', dateAutorisationIso: '2026-03-13' }),
      l({ dossierId: 3, etat: 'arbitrage_demande', dateAutorisationIso: '2025-08-27' }),
    ];
    expect(ordre(lignes)).toEqual([2, 3, 1]); // 2026 > 2025 > 2024
  });

  it('③ date ABSENTE reléguée en FIN de groupe (jamais en tête, jamais prise pour une date récente)', () => {
    const lignes = [
      l({ dossierId: 1, etat: 'en_attente_bati', dateAutorisationIso: null }),
      l({ dossierId: 2, etat: 'en_attente_bati', dateAutorisationIso: '2025-01-01' }),
      l({ dossierId: 3, etat: 'en_attente_bati', dateAutorisationIso: '2026-06-30' }),
    ];
    expect(ordre(lignes)).toEqual([3, 2, 1]); // les datées d'abord (décroissant), la non datée EN DERNIER
  });

  it('l’ordre d’urgence lui-même est inchangé (arbitrage < en attente < annulé LiDAR < validé < refusé < aucun signal)', () => {
    const etats: EtatSuivi[] = ['refuse', 'valide', 'suivi_aucun_signal', 'arbitrage_demande', 'annule_par_lidar', 'en_attente_bati'];
    const lignes = etats.map((etat, i) => l({ dossierId: i + 1, etat }));
    expect(trierLignesSuivi(lignes).map((x) => x.etat)).toEqual([
      'arbitrage_demande', 'en_attente_bati', 'annule_par_lidar', 'valide', 'refuse', 'suivi_aucun_signal',
    ]);
  });

  it('tri STABLE et déterministe quand dates égales ou toutes deux absentes (tiebreaker dossierId)', () => {
    const memeDate = [
      l({ dossierId: 5, etat: 'valide', dateAutorisationIso: '2026-02-02' }),
      l({ dossierId: 3, etat: 'valide', dateAutorisationIso: '2026-02-02' }),
    ];
    expect(ordre(memeDate)).toEqual([3, 5]);
    const sansDate = [l({ dossierId: 9, etat: 'refuse' }), l({ dossierId: 4, etat: 'refuse' })];
    expect(ordre(sansDate)).toEqual([4, 9]);
  });

  it('ne mute pas le tableau d’entrée', () => {
    const lignes = [l({ dossierId: 1, etat: 'valide' }), l({ dossierId: 2, etat: 'arbitrage_demande' })];
    const copie = [...lignes];
    trierLignesSuivi(lignes);
    expect(lignes).toEqual(copie); // entrée intacte
  });
});
