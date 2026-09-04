import { describe, it, expect } from 'vitest';
import { partitionnerSuivi, estAFaire, estValidationAcquise, ETATS_A_FAIRE, GROUPE_INCOMPLET_TITRE, type LigneGroupable } from './rattachementGroupes';
import type { EtatSuivi } from './rattachementSuiviRepo';

/**
 * RATT-1 — `partitionnerSuivi` : partition EXCLUSIVE & EXHAUSTIVE en trois groupes, priorité ABSOLUE au groupe 1 « à faire ».
 * LOT 77 — un permis VALIDÉ (validationAcquise) va en « en attente » même incomplet.
 */
const l = (etat: EtatSuivi, completudeIncomplete: boolean, id = 0, validationAcquise = false): LigneGroupable & { id: number } => ({ etat, completudeIncomplete, validationAcquise, id });

describe('RATT-1 — partitionnerSuivi (trois groupes, exclusifs & exhaustifs)', () => {
  it('exhaustif : la somme des trois groupes vaut toujours le total', () => {
    const lignes = [
      l('arbitrage_demande', false, 1), l('arbitrage_demande', true, 2),
      l('suivi_aucun_signal', false, 3), l('suivi_aucun_signal', true, 4),
      l('en_attente_bati', true, 5), l('valide', false, 6), l('acheve_sans_bati', true, 7),
    ];
    const { aFaire, incomplets, enAttente } = partitionnerSuivi(lignes);
    expect(aFaire.length + incomplets.length + enAttente.length).toBe(lignes.length);
    // exclusif : aucun id partagé entre deux groupes
    const ids = [...aFaire, ...incomplets, ...enAttente].map((x) => x.id);
    expect(new Set(ids).size).toBe(lignes.length);
  });

  it('priorité absolue : un « à faire » incomplet reste dans le GROUPE 1 (jamais dans « incomplet »)', () => {
    const { aFaire, incomplets } = partitionnerSuivi([l('arbitrage_demande', true, 1), l('acheve_sans_bati', true, 2)]);
    expect(aFaire.map((x) => x.id)).toEqual([1, 2]);
    expect(incomplets).toHaveLength(0);
  });

  it('« incomplet » ne puise QUE dans ce qui serait « en attente » (pas à faire + completudeIncomplete)', () => {
    const { incomplets, enAttente } = partitionnerSuivi([
      l('suivi_aucun_signal', true, 1),   // → incomplet
      l('en_attente_bati', true, 2),      // → incomplet
      l('suivi_aucun_signal', false, 3),  // → en attente
      l('valide', true, 4),               // valide (pas à faire) + incomplet → incomplet
    ]);
    expect(incomplets.map((x) => x.id)).toEqual([1, 2, 4]);
    expect(enAttente.map((x) => x.id)).toEqual([3]);
  });

  it('« jamais diagnostiqué » (completudeIncomplete=false) → jamais dans le 3e groupe', () => {
    const { incomplets, enAttente } = partitionnerSuivi([l('suivi_aucun_signal', false, 1)]);
    expect(incomplets).toHaveLength(0);
    expect(enAttente).toHaveLength(1);
  });

  it('préserve l’ordre d’entrée dans chaque groupe', () => {
    const { enAttente } = partitionnerSuivi([l('suivi_aucun_signal', false, 5), l('suivi_aucun_signal', false, 3), l('suivi_aucun_signal', false, 9)]);
    expect(enAttente.map((x) => x.id)).toEqual([5, 3, 9]);
  });

  it('cohérence : ETATS_A_FAIRE ⇔ estAFaire ; titre du 3e groupe stable', () => {
    for (const e of ETATS_A_FAIRE) expect(estAFaire(e)).toBe(true);
    expect(GROUPE_INCOMPLET_TITRE).toBe('Permis avec dossier incomplet');
  });

  // LOT 77 — la règle dans les DEUX sens.
  it('VALIDÉ + incomplet → « en attente » (pas « incomplet ») ; l’incomplétude reste sur la ligne', () => {
    const valideIncomplet = l('en_attente_bati', /*incomplet*/ true, 1, /*validationAcquise*/ true);
    const { incomplets, enAttente } = partitionnerSuivi([valideIncomplet]);
    expect(incomplets).toHaveLength(0);
    expect(enAttente.map((x) => x.id)).toEqual([1]);
    expect(enAttente[0].completudeIncomplete).toBe(true); // l'info n'est pas perdue : la ligne la porte toujours
  });

  it('NON validé + incomplet → « incomplet » (réversibilité : perte de validation → retombe)', () => {
    const { incomplets, enAttente } = partitionnerSuivi([l('en_attente_bati', true, 1, /*validationAcquise*/ false)]);
    expect(incomplets.map((x) => x.id)).toEqual([1]);
    expect(enAttente).toHaveLength(0);
  });

  it('validé + à-faire → reste « à faire » (priorité absolue inchangée)', () => {
    const { aFaire } = partitionnerSuivi([l('arbitrage_demande', true, 1, true)]);
    expect(aFaire.map((x) => x.id)).toEqual([1]);
  });
});

describe('LOT 77 — estValidationAcquise : 0 corps ne vaut JAMAIS « validé » (piège LOT 71)', () => {
  it('projection validée + ≥1 corps + tous avec altitude → validé', () => {
    expect(estValidationAcquise(true, 2, 0)).toBe(true);
    expect(estValidationAcquise(true, 1, 0)).toBe(true);
  });
  it('🔴 0 corps → PAS validé, même projection validée et 0 corps sans altitude', () => {
    expect(estValidationAcquise(true, 0, 0)).toBe(false);
  });
  it('un corps sans altitude → PAS validé', () => {
    expect(estValidationAcquise(true, 3, 1)).toBe(false);
  });
  it('projection non validée → PAS validé', () => {
    expect(estValidationAcquise(false, 2, 0)).toBe(false);
  });
});
