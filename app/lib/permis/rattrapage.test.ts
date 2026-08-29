import { describe, it, expect } from 'vitest';
import { apercuRattrapage, rattrapageVide } from './rattrapage';
import type { EtatStatutPolygone } from './polygoneStatut';

const etat = (statut: EtatStatutPolygone['statut'], origine: EtatStatutPolygone['origine']): EtatStatutPolygone =>
  ({ statut, origine, etatBdtopoAuMoment: null, decidePar: null, decideLe: null, historique: [] });

describe('NOM-2 — apercuRattrapage (liste ce qui SERAIT écrit, sans rien écrire)', () => {
  const reperes = new Map([['C1', 'C'], ['C2', 'D'], ['C3', 'I']]);

  it('NOMS : un corps sans repere ni nom_repli → proposé ; un nom déjà attribué ou un repere document → PAS proposé', () => {
    const corps = [
      { corpsId: 3, repere: null, nomRepli: null },        // anonyme → proposé
      { corpsId: 4, repere: null, nomRepli: 'BP2' },       // déjà attribué → PAS reproposé
      { corpsId: 5, repere: '2D1', nomRepli: null },       // nom document → PAS de repli
    ];
    const a = apercuRattrapage(corps, reperes, new Map(), []);
    expect(a.noms).toHaveLength(1);
    expect(a.noms[0]).toEqual({ corpsId: 3, nomActuel: 'bâtiment 3', nomFutur: 'bâtiment en projet 1' }); // 3 corps → BP1
  });

  it('un SEUL corps anonyme → « bâtiment en projet » (sans numéro)', () => {
    const a = apercuRattrapage([{ corpsId: 3, repere: null, nomRepli: null }], reperes, new Map(), []);
    expect(a.noms[0].nomFutur).toBe('bâtiment en projet');
  });

  it('STATUTS : recouvert total (100 %) jamais statué → « detruit » ; partiel (80 %) → « mixte » ; le taux est affiché', () => {
    const a = apercuRattrapage([], reperes, new Map(), [{ cleabs: 'C1', tauxPct: 100 }, { cleabs: 'C2', tauxPct: 80 }]);
    expect(a.statuts).toEqual([
      { cleabs: 'C1', repere: 'C', statut: 'detruit', tauxPct: 100 },
      { cleabs: 'C2', repere: 'D', statut: 'mixte', tauxPct: 80 },
    ]);
  });

  it('STATUTS : un polygone décidé à la main (origine « saisie ») n’est JAMAIS proposé à l’écrasement', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['C1', etat('preserve', 'saisie')]]);
    const a = apercuRattrapage([], reperes, statuts, [{ cleabs: 'C1', tauxPct: 100 }]);
    expect(a.statuts).toEqual([]); // la décision d'Arno prime : rien à rattraper sur C1
  });

  it('STATUTS : un statut AUTO déjà correct → PAS reproposé (pas de doublon)', () => {
    const statuts = new Map<string, EtatStatutPolygone>([['C1', etat('detruit', 'auto_recouvrement')]]);
    const a = apercuRattrapage([], reperes, statuts, [{ cleabs: 'C1', tauxPct: 100 }]);
    expect(a.statuts).toEqual([]);
  });

  it('rattrapageVide : rien à écrire → true ; sinon false', () => {
    expect(rattrapageVide({ noms: [], statuts: [] })).toBe(true);
    expect(rattrapageVide(apercuRattrapage([{ corpsId: 3, repere: null, nomRepli: null }], reperes, new Map(), []))).toBe(false);
  });
});
