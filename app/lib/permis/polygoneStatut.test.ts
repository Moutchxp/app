import { describe, it, expect } from 'vitest';
import { statutCourantParCleabs, estStatuable, type LigneStatutPolygone } from './polygoneStatut';

const l = (cleabs: string, statut: LigneStatutPolygone['statut'], le: string, etat: string | null = 'En service', par = 'admin'): LigneStatutPolygone =>
  ({ cleabs, statut, etatBdtopoAuMoment: etat, decidePar: par, decideLe: le });

describe('RATT-1 (2) — statutCourantParCleabs (append-only : dernière décision = courant)', () => {
  it('une seule décision → statut courant + snapshot source', () => {
    const m = statutCourantParCleabs([l('A', 'preserve', '2026-08-01T10:00:00Z', 'En projet')]);
    expect(m.get('A')).toMatchObject({ statut: 'preserve', etatBdtopoAuMoment: 'En projet' });
  });
  it('la DERNIÈRE ligne (decide_le max) fait foi ; l’historique est du plus récent au plus ancien', () => {
    const m = statutCourantParCleabs([
      l('A', 'preserve', '2026-08-01T10:00:00Z'),
      l('A', 'detruit', '2026-08-03T09:00:00Z'),
      l('A', 'preserve', '2026-08-02T09:00:00Z'),
    ]);
    expect(m.get('A')!.statut).toBe('detruit');                 // la plus récente (03/08)
    expect(m.get('A')!.historique.map((h) => h.statut)).toEqual(['detruit', 'preserve', 'preserve']); // récent → ancien
  });
  it('révoquer en dernier → statut null, MAIS l’historique reste (audit)', () => {
    const m = statutCourantParCleabs([
      l('A', 'detruit', '2026-08-01T10:00:00Z'),
      l('A', 'revoque', '2026-08-02T10:00:00Z'),
    ]);
    expect(m.get('A')!.statut).toBeNull();
    expect(m.get('A')!.historique).toHaveLength(2);             // la décision « détruit » reste lisible
  });
  it('aucune ligne pour un cleabs → absent de la Map (aucun statut décidé)', () => {
    expect(statutCourantParCleabs([]).get('X')).toBeUndefined();
  });
});

describe('RATT-1 (2) — estStatuable', () => {
  it('polygone En service, non recouvert → statuable', () => {
    expect(estStatuable({ cleabs: 'A', etat: 'En service' }, [])).toBe(true);
  });
  it('polygone « En projet » (futur bâti) → NON statuable (relève de l’adoption)', () => {
    expect(estStatuable({ cleabs: 'A', etat: 'En projet' }, [])).toBe(false);
    expect(estStatuable({ cleabs: 'A', etat: 'En construction' }, [])).toBe(false);
  });
  it('polygone recouvert par une emprise projetée → NON statuable', () => {
    expect(estStatuable({ cleabs: 'A', etat: 'En service' }, ['A'])).toBe(false);
  });
  it('sans cleabs → non statuable', () => {
    expect(estStatuable({ cleabs: null, etat: 'En service' }, [])).toBe(false);
  });
});
