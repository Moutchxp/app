import { describe, it, expect } from 'vitest';
import { statutBatimentsProjection, fraicheurSansManquement } from './statutBatimentsProjection';
import type { EtatTitreFamille } from '../../../../lib/permis/etatFamilleProjection';

/**
 * ENR-1 (LOT 1/2) — INVARIANT « le durcissement client ne peut que RENFORCER, jamais repeindre en VERT un ROUGE serveur ».
 * `statutBatimentsProjection(base, manquements)` compose l'état serveur `base` (altitude/enregistrement, fait serveur) avec la fraîcheur
 * LIVE (noms des bâtiments à enregistrer / à valider). Propriété prouvée ici : quelle que soit la fraîcheur, si `base` est ROUGE, le
 * résultat est ROUGE ; le client ne débloque JAMAIS un permis que le serveur bloque. (La convergence mère/sous-ligne et le blocage
 * d'envoi sont testés côté serveur — projectionFileRepo.test.ts — et pur — etatFamilleProjection.test.ts.)
 */
const rouge: EtatTitreFamille = { texte: '1 bâtiment à enregistrer', ton: 'rouge' };
const vert: EtatTitreFamille = { texte: 'complète', ton: 'vert' };

describe('ENR-1 — statutBatimentsProjection : le client RENFORCE, jamais ne repeint en vert un rouge serveur', () => {
  it('base ROUGE + AUCUN manquement live → reste ROUGE (repli : l’état serveur porte seul le titre)', () => {
    expect(fraicheurSansManquement({ aEnregistrer: [], altitudeAValider: [] })).toBe(true);
    expect(statutBatimentsProjection(rouge, { aEnregistrer: [], altitudeAValider: [] })).toEqual(rouge);
  });

  it('base ROUGE + manquements live → ROUGE, en CONSERVANT le motif serveur puis en AJOUTANT le détail nommé (jamais un vert)', () => {
    const r = statutBatimentsProjection(rouge, { aEnregistrer: ['bâtiment 1'], altitudeAValider: [] });
    expect(r.ton).toBe('rouge');
    expect(r.texte).toContain('1 bâtiment à enregistrer'); // motif serveur conservé
  });

  it('base VERTE + manquement live (« modifié depuis », invisible du serveur) → ROUGE : le client ne fait que DURCIR', () => {
    const r = statutBatimentsProjection(vert, { aEnregistrer: ['bâtiment 1'], altitudeAValider: [] });
    expect(r.ton).toBe('rouge');
    expect(r.texte).toContain('à enregistrer');
  });

  it('base VERTE + AUCUN manquement → VERTE (le seul cas vert : serveur ET client d’accord)', () => {
    expect(statutBatimentsProjection(vert, { aEnregistrer: [], altitudeAValider: [] })).toEqual(vert);
  });
});
