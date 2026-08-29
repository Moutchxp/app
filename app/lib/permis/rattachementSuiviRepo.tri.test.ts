import { describe, it, expect } from 'vitest';
import { trierLignesSuivi, type LigneSuivi, type EtatSuivi } from './rattachementSuiviRepo';

/**
 * L6 (règle Arno, 23/08/2026) — tri du suivi en DEUX GROUPES. Fonction PURE `trierLignesSuivi`, testée sans base :
 *   ① GROUPE 1 « rattachement à faire » (arbitrage_demande) TOUJOURS avant le GROUPE 2, quelle que soit la date du permis ;
 *   ② groupe 1 trié par date de DÉCLENCHEMENT décroissante ; groupe 2 par date d'AUTORISATION décroissante ;
 *   ③ date absente en FIN de son groupe ; tiebreaker stable sur dossierId.
 */
const l = (o: Partial<LigneSuivi>): LigneSuivi => ({
  dossierId: 1, numDau: 'X', commune: 'Paris', codeInsee: '75120', type: 'PC', adresse: null, natureTravaux: null,
  etat: 'suivi_aucun_signal', verdict: null, joursAnciennete: 0, derniereEvalIso: null,
  dateAutorisationIso: null, dateDeclenchementIso: null, origineOuverture: 'detection', alertesSurveillance: 0, ...o,
});

const ordre = (lignes: LigneSuivi[]): number[] => trierLignesSuivi(lignes).map((x) => x.dossierId);

describe('L6 — trierLignesSuivi (deux groupes)', () => {
  it('① le GROUPE 1 (arbitrage_demande) passe AVANT le groupe 2, même si le permis du groupe 2 est plus récent', () => {
    const lignes = [
      l({ dossierId: 1, etat: 'suivi_aucun_signal', dateAutorisationIso: '2026-08-01' }), // permis récent, mais groupe 2
      l({ dossierId: 2, etat: 'arbitrage_demande', dateDeclenchementIso: '2020-01-01', dateAutorisationIso: '2019-01-01' }), // ancien, mais À FAIRE
    ];
    expect(ordre(lignes)).toEqual([2, 1]); // priorité absolue au rattachement à faire — NE PAS réinverser
  });

  it('② GROUPE 1 : tri par DATE DE DÉCLENCHEMENT décroissante (le plus récemment déclenché en haut), pas la date du permis', () => {
    const lignes = [
      l({ dossierId: 1, etat: 'arbitrage_demande', dateDeclenchementIso: '2026-01-10', dateAutorisationIso: '2026-12-31' }), // permis très récent
      l({ dossierId: 2, etat: 'arbitrage_demande', dateDeclenchementIso: '2026-08-20', dateAutorisationIso: '2020-01-01' }), // déclenché le plus récemment
      l({ dossierId: 3, etat: 'arbitrage_demande', dateDeclenchementIso: '2026-05-05', dateAutorisationIso: '2025-01-01' }),
    ];
    expect(ordre(lignes)).toEqual([2, 3, 1]); // 2026-08 > 2026-05 > 2026-01 (déclenchement), la date de permis n'intervient pas
  });

  it('② GROUPE 2 : tri par DATE D’AUTORISATION du permis décroissante (comme en L1)', () => {
    const lignes = [
      l({ dossierId: 1, etat: 'suivi_aucun_signal', dateAutorisationIso: '2024-05-10' }),
      l({ dossierId: 2, etat: 'en_attente_bati', dateAutorisationIso: '2026-03-13' }),
      l({ dossierId: 3, etat: 'valide', dateAutorisationIso: '2025-08-27' }),
    ];
    expect(ordre(lignes)).toEqual([2, 3, 1]); // 2026 > 2025 > 2024, tous groupe 2 (mélange d'états non-« à faire »)
  });

  it('③ date ABSENTE reléguée en FIN de son groupe (déclenchement pour le G1, autorisation pour le G2)', () => {
    const g1 = [
      l({ dossierId: 1, etat: 'arbitrage_demande', dateDeclenchementIso: null }),
      l({ dossierId: 2, etat: 'arbitrage_demande', dateDeclenchementIso: '2026-06-30' }),
    ];
    expect(ordre(g1)).toEqual([2, 1]); // la datée d'abord, la non datée en dernier
    const g2 = [
      l({ dossierId: 3, etat: 'suivi_aucun_signal', dateAutorisationIso: null }),
      l({ dossierId: 4, etat: 'suivi_aucun_signal', dateAutorisationIso: '2025-01-01' }),
    ];
    expect(ordre(g2)).toEqual([4, 3]);
  });

  it('seul arbitrage_demande est dans le groupe 1 ; en_attente_bati / valide / refuse / annule_par_lidar restent groupe 2', () => {
    const g2etats: EtatSuivi[] = ['en_attente_bati', 'valide', 'refuse', 'annule_par_lidar', 'suivi_aucun_signal'];
    const lignes = [
      ...g2etats.map((etat, i) => l({ dossierId: 10 + i, etat, dateAutorisationIso: '2026-01-01' })),
      l({ dossierId: 99, etat: 'arbitrage_demande', dateDeclenchementIso: '2020-01-01', dateAutorisationIso: '2000-01-01' }),
    ];
    expect(trierLignesSuivi(lignes)[0].dossierId).toBe(99); // l'unique « à faire » est en tête malgré ses dates anciennes
  });

  it('tri STABLE (tiebreaker dossierId) quand les dates sont égales ou toutes deux absentes', () => {
    const memeDate = [
      l({ dossierId: 5, etat: 'valide', dateAutorisationIso: '2026-02-02' }),
      l({ dossierId: 3, etat: 'valide', dateAutorisationIso: '2026-02-02' }),
    ];
    expect(ordre(memeDate)).toEqual([3, 5]);
    const sansDate = [l({ dossierId: 9, etat: 'arbitrage_demande' }), l({ dossierId: 4, etat: 'arbitrage_demande' })];
    expect(ordre(sansDate)).toEqual([4, 9]);
  });

  it('ne mute pas le tableau d’entrée', () => {
    const lignes = [l({ dossierId: 1, etat: 'valide' }), l({ dossierId: 2, etat: 'arbitrage_demande' })];
    const copie = [...lignes];
    trierLignesSuivi(lignes);
    expect(lignes).toEqual(copie);
  });
});
