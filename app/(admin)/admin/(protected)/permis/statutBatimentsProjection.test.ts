import { describe, it, expect } from 'vitest';
import { statutBatimentsProjection, fraicheurSansManquement } from './statutBatimentsProjection';
import type { EtatTitreFamille } from '../../../../lib/permis/etatFamilleProjection';

/**
 * (C) — module PUR de statut de la ligne mère « Bâtiments et projection » durci par la fraîcheur. Table de cas : aucune exigence manquante,
 * enregistrement seul, altitude seule, les deux, base déjà rouge (emprise), plusieurs bâtiments (abrègement). On asserte le TON et le TEXTE
 * (comportement), jamais une couleur/classe.
 */
const VERT: EtatTitreFamille = { ton: 'vert', texte: 'Projection validée' };
const ROUGE_EMPRISE: EtatTitreFamille = { ton: 'rouge', texte: 'projection non validée — à valider : 1 emprise' };
const RIEN = { aEnregistrer: [], altitudeARevalider: [] };

describe('statutBatimentsProjection — fraîcheur ajoutée sans écraser l’état serveur', () => {
  it('aucun manquement de fraîcheur → base renvoyée telle quelle (vert reste vert, rouge reste rouge)', () => {
    expect(statutBatimentsProjection(VERT, RIEN)).toEqual(VERT);
    expect(statutBatimentsProjection(ROUGE_EMPRISE, RIEN)).toEqual(ROUGE_EMPRISE);
    expect(fraicheurSansManquement(RIEN)).toBe(true);
  });

  it('base VERTE + 1 bâtiment à enregistrer → ROUGE nommant le bâtiment', () => {
    const r = statutBatimentsProjection(VERT, { aEnregistrer: ['B1'], altitudeARevalider: [] });
    expect(r.ton).toBe('rouge');
    expect(r.texte).toContain('1 bâtiment à enregistrer (B1)');
    expect(r.texte).not.toContain('Projection validée'); // on ne conserve pas un « validé » contradictoire
  });

  it('base VERTE + 1 altitude à revalider → ROUGE nommant le bâtiment', () => {
    const r = statutBatimentsProjection(VERT, { aEnregistrer: [], altitudeARevalider: ['B2'] });
    expect(r.ton).toBe('rouge');
    expect(r.texte).toContain('1 altitude à revalider (B2)');
  });

  it('base VERTE + les DEUX exigences manquantes → ROUGE cumulant les deux détails', () => {
    const r = statutBatimentsProjection(VERT, { aEnregistrer: ['B1'], altitudeARevalider: ['B3'] });
    expect(r.ton).toBe('rouge');
    expect(r.texte).toContain('à enregistrer (B1)');
    expect(r.texte).toContain('à revalider (B3)');
  });

  it('base déjà ROUGE (emprise) + 1 à enregistrer → conserve le manquement serveur ET ajoute le nouveau', () => {
    const r = statutBatimentsProjection(ROUGE_EMPRISE, { aEnregistrer: ['B1'], altitudeARevalider: [] });
    expect(r.ton).toBe('rouge');
    expect(r.texte).toContain('à valider : 1 emprise');       // ce que base portait déjà, conservé
    expect(r.texte).toContain('1 bâtiment à enregistrer (B1)'); // ajouté
  });

  it('plus de 2 bâtiments → abrège « 2 premiers et N autre(s) »', () => {
    const r = statutBatimentsProjection(VERT, { aEnregistrer: ['B1', 'B2', 'B3', 'B4'], altitudeARevalider: [] });
    expect(r.texte).toContain('4 bâtiments à enregistrer (B1, B2 et 2 autres)');
  });

  it('les manquements PLURIELS s’accordent', () => {
    const r = statutBatimentsProjection(VERT, { aEnregistrer: ['B1', 'B2'], altitudeARevalider: ['B3', 'B4'] });
    expect(r.texte).toContain('2 bâtiments à enregistrer (B1, B2)');
    expect(r.texte).toContain('2 altitudes à revalider (B3, B4)');
  });
});
