import { describe, it, expect } from 'vitest';
import {
  construireUrl,
  fenetreDefaut,
  preset,
  coordsSerie,
  maxSerie,
  estVideAudit,
  formatNombre,
  type PointAudit,
  type Audit,
} from './affichage';

describe('affichage audit — helpers PURS (le client ne fait que consommer l’API)', () => {
  it('construireUrl → endpoint API d’audit (jamais la base)', () => {
    expect(construireUrl({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' })).toBe(
      '/api/admin/audit?debut=2026-01-01&fin=2026-01-31&grain=jour',
    );
  });
  it('fenetreDefaut = 30 derniers jours ; preset relatif', () => {
    expect(fenetreDefaut(new Date('2026-07-10T12:00:00Z'))).toEqual({ debut: '2026-06-11', fin: '2026-07-10', grain: 'jour' });
    expect(preset(7, 'jour', new Date('2026-07-10T12:00:00Z')).debut).toBe('2026-07-04');
    expect(preset(90, 'semaine', new Date('2026-07-10T12:00:00Z')).grain).toBe('semaine');
  });
  it('maxSerie couvre succès ET échecs, plancher 1', () => {
    expect(maxSerie([{ bucket: 'a', succes: 3, echecs: 9 }])).toBe(9);
    expect(maxSerie([])).toBe(1);
  });
  it('coordsSerie : y INVERSÉ, 1 point centré, vide → []', () => {
    const s: PointAudit[] = [
      { bucket: 'a', succes: 5, echecs: 0 },
      { bucket: 'b', succes: 10, echecs: 0 },
    ];
    expect(coordsSerie(s, 'succes', 10, 100, 50)).toEqual([{ x: 0, y: 25 }, { x: 100, y: 0 }]);
    expect(coordsSerie([{ bucket: 'a', succes: 4, echecs: 0 }], 'succes', 4, 100, 50)).toEqual([{ x: 50, y: 0 }]);
    expect(coordsSerie([], 'succes', 10, 100, 50)).toEqual([]);
  });
  it('estVideAudit : vrai ssi aucun succès ET aucun échec', () => {
    const base: Audit = { fenetre: { debut: 'a', fin: 'b', grain: 'jour' }, serie: [], totaux: { succes: 0, echecs: 0 }, pics: [], seuilPic: 20 };
    expect(estVideAudit(base)).toBe(true);
    expect(estVideAudit({ ...base, totaux: { succes: 1, echecs: 0 } })).toBe(false);
    expect(estVideAudit({ ...base, totaux: { succes: 0, echecs: 4 } })).toBe(false);
  });
  it('formatNombre — FR (milliers)', () => {
    expect(formatNombre(12345).replace(/\s/g, ' ')).toMatch(/12.345/);
  });
});
