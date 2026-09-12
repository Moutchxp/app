import { describe, it, expect } from 'vitest';
import { impactTraceManuel } from './impactTraceManuel';

// Emprise minimale (seuls provenance/validee/valideeLe/valideeParNom/surface/id comptent pour l'impact).
const e = (over: Partial<{ id: number; provenance: 'trace_manuel' | 'ign_adopte' | 'ign_retouche'; surfaceM2: number | null; validee: boolean; valideeLe: string | null; valideeParNom: string | null }> = {}) =>
  ({ id: 1, provenance: 'ign_adopte' as const, surfaceM2: 100, validee: false, valideeLe: null, valideeParNom: null, ...over });

describe('impactTraceManuel — ce qu’un tracé manuel va détruire sur le bâtiment', () => {
  it('AUCUNE emprise adoptée → pas de confirmation (non destructif)', () => {
    // un tracé manuel préexistant n’est PAS effacé (le serveur ne supprime que les provenances IGN) → rien à avertir.
    const r = impactTraceManuel([e({ id: 1, provenance: 'trace_manuel' })]);
    expect(r.destructif).toBe(false);
    expect(r.nbEffacees).toBe(0);
    expect(r.nbValidees).toBe(0);
    expect(r.aEffacer).toEqual([]);
    // liste vide → aussi non destructif
    expect(impactTraceManuel([]).destructif).toBe(false);
  });

  it('UNE emprise adoptée NON validée → confirmation, sans validation à signaler', () => {
    const r = impactTraceManuel([e({ id: 5, provenance: 'ign_adopte', validee: false })]);
    expect(r.destructif).toBe(true);
    expect(r.nbEffacees).toBe(1);
    expect(r.nbValidees).toBe(0);
    expect(r.aEffacer.map((x) => x.id)).toEqual([5]);
  });

  it('TROIS adoptées dont DEUX validées → confirmation détaillant les deux validations (date + auteur)', () => {
    const r = impactTraceManuel([
      e({ id: 16, provenance: 'ign_adopte', surfaceM2: 2647, validee: true, valideeLe: '2026-09-09T15:01:10Z', valideeParNom: 'Arnaud Jorel' }),
      e({ id: 17, provenance: 'ign_adopte', surfaceM2: 721, validee: true, valideeLe: '2026-09-09T15:01:13Z', valideeParNom: 'Arnaud Jorel' }),
      e({ id: 18, provenance: 'ign_adopte', surfaceM2: 115, validee: false }),
    ]);
    expect(r.destructif).toBe(true);
    expect(r.nbEffacees).toBe(3);
    expect(r.nbValidees).toBe(2);
    // les deux validées portent leur date + auteur (pour l’affichage « travail humain perdu »)
    const validees = r.aEffacer.filter((x) => x.validee);
    expect(validees.map((x) => x.id)).toEqual([16, 17]);
    expect(validees.every((x) => x.valideeLe !== null && x.valideeParNom === 'Arnaud Jorel')).toBe(true);
  });

  it('une adoptée RETOUCHÉE à la main (ign_retouche) compte aussi (même exclusivité serveur)', () => {
    const r = impactTraceManuel([e({ id: 9, provenance: 'ign_retouche', validee: true, valideeLe: '2026-09-07T11:00:00Z', valideeParNom: 'X' })]);
    expect(r.destructif).toBe(true);
    expect(r.nbEffacees).toBe(1);
    expect(r.nbValidees).toBe(1);
  });

  it('mélange : les tracés manuels ne sont NI effacés NI comptés, seules les IGN le sont', () => {
    const r = impactTraceManuel([e({ id: 1, provenance: 'trace_manuel', validee: true }), e({ id: 2, provenance: 'ign_adopte', validee: true }), e({ id: 3, provenance: 'trace_manuel' })]);
    expect(r.nbEffacees).toBe(1);
    expect(r.aEffacer.map((x) => x.id)).toEqual([2]);
  });
});
