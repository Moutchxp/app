import { describe, it, expect, vi } from 'vitest';
import { annoncerEtoile, ecouterEtoile } from './signalEtoile';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-12, POINT 2 — LE SIGNAL QUI TIENT « UN SEUL ÉTAT » ═════════════════════════════════
 *
 * RÈGLE D'ARNO : « Cliquer l'une allume ou éteint les trois en direct (ligne, barre de survol, mail ouvert), dans
 * les deux sens. » Les trois ne vivent pas dans le même arbre : ce registre est ce qui les relie.
 *
 * ⚠️ MÊMES PROMESSES QUE `signalPieceDrive`, ÉPROUVÉES PAREIL : on s'abonne, on se désabonne vraiment, deux
 * abonnements du même auditeur ne font pas deux appels, et un auditeur en faute ne fait pas taire les autres.
 */

describe('🔴🔴 le signal de l’étoile', () => {
  it('🔴 un auditeur abonné reçoit l’échange ET l’état', () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    annoncerEtoile({ filId: 7, etoilee: true });
    stop();
    expect(vus).toEqual([{ filId: 7, etoilee: true }]);
  });

  /** 🔴 LE DÉSABONNEMENT EST RÉEL : un écran démonté ne doit plus jamais être appelé. */
  it('🔴 désabonné, il ne reçoit plus rien', () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    stop();
    annoncerEtoile({ filId: 7, etoilee: true });
    expect(vus).toEqual([]);
  });

  /**
   * 🔴 UN `Set`, PAS UN TABLEAU : un composant qui se démonte puis se remonte ne doit pas laisser derrière lui un
   * auditeur mort, et deux abonnements du même auditeur ne doivent pas faire deux mises à jour.
   */
  it('🔴 le même auditeur abonné deux fois n’est appelé qu’une', () => {
    const vu = vi.fn();
    const a = ecouterEtoile(vu);
    const b = ecouterEtoile(vu);
    annoncerEtoile({ filId: 7, etoilee: false });
    a(); b();
    expect(vu).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ UN AUDITEUR EN FAUTE NE FAIT PAS TAIRE LES AUTRES. Une étoile qui ne s'allume pas sur un écran ne doit pas
   * laisser les deux autres dans l'état d'avant — ce serait exactement le désaccord qu'on répare.
   */
  it('⚠️ un auditeur qui jette n’empêche pas les suivants d’être prévenus', () => {
    const vus: number[] = [];
    const a = ecouterEtoile(() => { throw new Error('écran en faute'); });
    const b = ecouterEtoile((s) => vus.push(s.filId));
    expect(() => annoncerEtoile({ filId: 12, etoilee: true })).not.toThrow();
    a(); b();
    expect(vus).toEqual([12]);
  });

  /** ⚠️ SE DÉSABONNER PENDANT L'ANNONCE NE CASSE PAS LA BOUCLE : le registre est copié avant d'être parcouru. */
  it('⚠️ un auditeur qui se désabonne pendant l’annonce ne casse rien', () => {
    const vus: number[] = [];
    let stopA: (() => void) | null = null;
    stopA = ecouterEtoile(() => { stopA?.(); });
    const stopB = ecouterEtoile((s) => vus.push(s.filId));
    expect(() => annoncerEtoile({ filId: 5, etoilee: true })).not.toThrow();
    stopB();
    expect(vus).toEqual([5]);
  });

  it('⚠️ sans aucun auditeur, annoncer ne fait rien et ne jette pas', () => {
    expect(() => annoncerEtoile({ filId: 1, etoilee: true })).not.toThrow();
  });
});
