import { describe, it, expect } from 'vitest';
import { partitionnerSuivi, estAFaire, aSignalMiseAJour, estDansRattachement, estValidationAcquise, ETATS_A_FAIRE, GROUPE1_TITRE, RATT_VALIDES_TITRE, SURV_SUIVIS_TITRE, GROUPE_INCOMPLET_TITRE, type LigneGroupable } from './rattachementGroupes';
import type { EtatSuivi } from './rattachementSuiviRepo';

/**
 * LOT COMPLET — `partitionnerSuivi` : l'ONGLET dérive de « franchi le process » (validationAcquise), plus d'un signal.
 *   RATTACHEMENT (validés) = ① `rattAFaire` (signal détecté) + ② `rattValides` (en veille) ;
 *   SOUS SURVEILLANCE (non validés) = `survSuivis` + `survIncomplets`.
 * Partition EXCLUSIVE & EXHAUSTIVE. SOURCE UNIQUE partagée par la pastille, le tri et l'affichage.
 */
const l = (etat: EtatSuivi, completudeIncomplete: boolean, id = 0, validationAcquise = false, alertesSurveillance = 0, passageAcquis = false): LigneGroupable & { id: number } => ({ etat, completudeIncomplete, validationAcquise, alertesSurveillance, passageAcquis, id });

describe('LOT COMPLET — partitionnerSuivi (quatre groupes, exclusifs & exhaustifs)', () => {
  it('exhaustif : la somme des quatre groupes vaut toujours le total ; aucun id partagé', () => {
    const lignes = [
      l('arbitrage_demande', false, 1, true), l('arbitrage_demande', true, 2, false),
      l('suivi_aucun_signal', false, 3, false), l('suivi_aucun_signal', true, 4, false),
      l('en_attente_bati', true, 5, true), l('valide', false, 6, true), l('acheve_sans_bati', true, 7, true),
    ];
    const { rattAFaire, rattValides, survSuivis, survIncomplets } = partitionnerSuivi(lignes);
    expect(rattAFaire.length + rattValides.length + survSuivis.length + survIncomplets.length).toBe(lignes.length);
    const ids = [...rattAFaire, ...rattValides, ...survSuivis, ...survIncomplets].map((x) => x.id);
    expect(new Set(ids).size).toBe(lignes.length);
  });

  it('CONDITION D’ENTRÉE : un permis ENTIÈREMENT VALIDÉ entre dans Rattachement MÊME sans signal (catégorie ②)', () => {
    const { rattValides, survSuivis } = partitionnerSuivi([l('en_attente_bati', false, 1, /*validé*/ true)]);
    expect(rattValides.map((x) => x.id)).toEqual([1]);
    expect(survSuivis).toHaveLength(0);
  });

  it('un permis NON entièrement validé n’entre JAMAIS dans Rattachement (même en arbitrage) → Sous surveillance', () => {
    const { rattAFaire, rattValides, survSuivis } = partitionnerSuivi([l('arbitrage_demande', false, 1, /*validé*/ false)]);
    expect(rattAFaire).toHaveLength(0);
    expect(rattValides).toHaveLength(0);
    expect(survSuivis.map((x) => x.id)).toEqual([1]); // patiente en surveillance jusqu'à validation
  });

  it('catégorie ① : un VALIDÉ AVEC signal (arbitrage ouvert) est dans « rattAFaire », pas « rattValides »', () => {
    const { rattAFaire, rattValides } = partitionnerSuivi([l('arbitrage_demande', false, 1, true)]);
    expect(rattAFaire.map((x) => x.id)).toEqual([1]);
    expect(rattValides).toHaveLength(0);
  });

  it('🔴 SURV-1 fondu dans ① : un VALIDÉ SANS arbitrage mais AVEC alerte polygone monte en « rattAFaire »', () => {
    const { rattAFaire, rattValides } = partitionnerSuivi([l('en_attente_bati', false, 1, /*validé*/ true, /*alertes*/ 3)]);
    expect(rattAFaire.map((x) => x.id)).toEqual([1]);
    expect(rattValides).toHaveLength(0);
  });

  it('SOUS SURVEILLANCE : « incomplet » (non validé) vs « suivis, non instruits » (le reste non validé)', () => {
    const { survIncomplets, survSuivis } = partitionnerSuivi([
      l('suivi_aucun_signal', true, 1, false),   // incomplet
      l('suivi_aucun_signal', false, 2, false),  // suivi, non instruit
    ]);
    expect(survIncomplets.map((x) => x.id)).toEqual([1]);
    expect(survSuivis.map((x) => x.id)).toEqual([2]);
  });

  it('un VALIDÉ incomplet va en RATTACHEMENT ② (la complétude documentaire ne décide plus l’onglet d’un validé)', () => {
    const { rattValides, survIncomplets } = partitionnerSuivi([l('en_attente_bati', /*incomplet*/ true, 1, /*validé*/ true)]);
    expect(rattValides.map((x) => x.id)).toEqual([1]);
    expect(survIncomplets).toHaveLength(0);
  });

  it('réversibilité : un permis qui PERD sa validation RETOMBE en Sous surveillance', () => {
    const { rattValides, survIncomplets, survSuivis } = partitionnerSuivi([l('en_attente_bati', true, 1, /*validé*/ false)]);
    expect(rattValides).toHaveLength(0);
    expect(survIncomplets.map((x) => x.id)).toEqual([1]); // incomplet + non validé
    expect(survSuivis).toHaveLength(0);
  });

  it('préserve l’ordre d’entrée dans chaque groupe', () => {
    const { survSuivis } = partitionnerSuivi([l('suivi_aucun_signal', false, 5), l('suivi_aucun_signal', false, 3), l('suivi_aucun_signal', false, 9)]);
    expect(survSuivis.map((x) => x.id)).toEqual([5, 3, 9]);
  });

  it('cohérence : ETATS_A_FAIRE ⇔ estAFaire ; aSignalMiseAJour = arbitrage OU alerte ; titres stables et DISTINCTS (homonymie levée)', () => {
    for (const e of ETATS_A_FAIRE) expect(estAFaire(e)).toBe(true);
    expect(aSignalMiseAJour({ etat: 'en_attente_bati', alertesSurveillance: 0 })).toBe(false);
    expect(aSignalMiseAJour({ etat: 'en_attente_bati', alertesSurveillance: 1 })).toBe(true);
    expect(aSignalMiseAJour({ etat: 'arbitrage_demande', alertesSurveillance: 0 })).toBe(true);
    expect(GROUPE1_TITRE).toBe('Rattachement à faire');
    expect(GROUPE_INCOMPLET_TITRE).toBe('Permis avec dossier incomplet');
    // 🔴 les deux libellés homonymes d'autrefois sont désormais DISTINCTS (validés vs non instruits)
    expect(RATT_VALIDES_TITRE).not.toBe(SURV_SUIVIS_TITRE);
    expect(RATT_VALIDES_TITRE.toLowerCase()).toContain('validés');
    expect(SURV_SUIVIS_TITRE.toLowerCase()).toContain('non instruits');
  });
});

describe('COMPLÉMENT — mode de passage (réglage) : estDansRattachement + partition selon le mode', () => {
  it('T1 — mode AUTOMATIQUE : un permis entièrement validé (sans marqueur) ENTRE dans Rattachement', () => {
    expect(estDansRattachement({ validationAcquise: true, passageAcquis: false }, 'automatique')).toBe(true);
    const { rattValides } = partitionnerSuivi([l('en_attente_bati', false, 1, /*validé*/ true)], 'automatique');
    expect(rattValides.map((x) => x.id)).toEqual([1]);
  });
  it('T2 — mode CLÔTURE MANUELLE : un permis validé mais NON clôturé (sans marqueur) N’apparaît PAS dans Rattachement', () => {
    expect(estDansRattachement({ validationAcquise: true, passageAcquis: false }, 'cloture_manuelle')).toBe(false);
    const { rattAFaire, rattValides, survSuivis } = partitionnerSuivi([l('en_attente_bati', false, 1, /*validé*/ true)], 'cloture_manuelle');
    expect(rattAFaire).toHaveLength(0);
    expect(rattValides).toHaveLength(0);
    expect(survSuivis.map((x) => x.id)).toEqual([1]); // il patiente hors Rattachement (reste dans « Analyse et projection »)
  });
  it('🔴 T4 — « acquis reste acquis » : un permis DÉJÀ passé (marqueur permis_projection, ex. 7424) reste dans Rattachement APRÈS bascule en clôture manuelle', () => {
    expect(estDansRattachement({ validationAcquise: true, passageAcquis: true }, 'cloture_manuelle')).toBe(true);
    expect(estDansRattachement({ validationAcquise: false, passageAcquis: true }, 'cloture_manuelle')).toBe(true); // le marqueur suffit, même sans validation courante
    const { rattValides } = partitionnerSuivi([l('en_attente_bati', false, 7424, /*validé*/ true, /*alertes*/ 0, /*passageAcquis*/ true)], 'cloture_manuelle');
    expect(rattValides.map((x) => x.id)).toEqual([7424]);
  });
  it('défaut = automatique (aucun mode passé) → comportement livré au commit cdfdc0a (validationAcquise décide)', () => {
    const { rattValides } = partitionnerSuivi([l('en_attente_bati', false, 1, /*validé*/ true)]);
    expect(rattValides.map((x) => x.id)).toEqual([1]);
  });
});

describe('« franchi le process » — estValidationAcquise DURCI (altitudes ET emprises VALIDÉES pour tous les bâtiments)', () => {
  it('≥ 1 bâtiment + toutes altitudes VALIDÉES + toutes emprises VALIDÉES → franchi', () => {
    expect(estValidationAcquise(3, 0, 0)).toBe(true);
    expect(estValidationAcquise(1, 0, 0)).toBe(true);
  });
  it('🔴 0 bâtiment → PAS franchi (piège LOT 71), même 0 manquant', () => {
    expect(estValidationAcquise(0, 0, 0)).toBe(false);
  });
  it('un bâtiment sans altitude VALIDÉE → PAS franchi', () => {
    expect(estValidationAcquise(3, 1, 0)).toBe(false);
  });
  it('🔴 un bâtiment sans emprise VALIDÉE → PAS franchi (le durcissement : renseignée/tracée ne suffit plus)', () => {
    expect(estValidationAcquise(3, 0, 1)).toBe(false);
  });
});
