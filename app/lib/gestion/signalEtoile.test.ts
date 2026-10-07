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
 *
 * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — ET IL PORTE MAINTENANT L'IDENTIFIANT DU MAIL ══════════════════════════════════
 *
 * BUG CONSTATÉ PAR ARNO (07/10/2026, fil 36764) : il clique la grande étoile du mail du 06/10 16:31, l'étoile du
 * mail du 07/10 09:32 s'allume. Le signal ne disait QUE l'échange : les écrans devaient DEVINER de quel mail on
 * parlait, et ils devinaient « le dernier » — parce que c'est ce que la porte d'un ÉCHANGE vise.
 *
 * 🔴 DEUX CHAMPS DE PLUS, ET CHACUN RÉPOND À UNE QUESTION DIFFÉRENTE :
 *   · `messageId` — QUEL MAIL (ou `null` : le geste a porté sur l'échange entier, depuis une ligne de la boîte) ;
 *   · `filEtoile` — L'ÉCHANGE EST-IL ENCORE ÉTOILÉ (la règle de la LIGNE : « au moins un mail »), ou `null` quand
 *     l'émetteur l'ignore.
 */

describe('🔴🔴 le signal de l’étoile', () => {
  it('🔴 un auditeur abonné reçoit le MAIL, l’état, ET l’état de l’échange', () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    annoncerEtoile({ filId: 7, messageId: 51, etoilee: true, filEtoile: true });
    stop();
    expect(vus).toEqual([{ filId: 7, messageId: 51, etoilee: true, filEtoile: true }]);
  });

  /** 🔴 LE DÉSABONNEMENT EST RÉEL : un écran démonté ne doit plus jamais être appelé. */
  it('🔴 désabonné, il ne reçoit plus rien', () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    stop();
    annoncerEtoile({ filId: 7, messageId: 51, etoilee: true, filEtoile: true });
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
    annoncerEtoile({ filId: 7, messageId: 51, etoilee: false, filEtoile: false });
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
    expect(() => annoncerEtoile({ filId: 12, messageId: 51, etoilee: true, filEtoile: true })).not.toThrow();
    a(); b();
    expect(vus).toEqual([12]);
  });

  /** ⚠️ SE DÉSABONNER PENDANT L'ANNONCE NE CASSE PAS LA BOUCLE : le registre est copié avant d'être parcouru. */
  it('⚠️ un auditeur qui se désabonne pendant l’annonce ne casse rien', () => {
    const vus: number[] = [];
    let stopA: (() => void) | null = null;
    stopA = ecouterEtoile(() => { stopA?.(); });
    const stopB = ecouterEtoile((s) => vus.push(s.filId));
    expect(() => annoncerEtoile({ filId: 5, messageId: 51, etoilee: true, filEtoile: true })).not.toThrow();
    stopB();
    expect(vus).toEqual([5]);
  });

  it('⚠️ sans aucun auditeur, annoncer ne fait rien et ne jette pas', () => {
    expect(() => annoncerEtoile({ filId: 1, messageId: 51, etoilee: true, filEtoile: true })).not.toThrow();
  });

  /**
   * ══ 🔴🔴 LOT ETOILE-PAR-MESSAGE — LE SIGNAL TRANSPORTE **TEL QUEL** CE QU'ON LUI DONNE ═══════════════════════
   *
   * 🔴 IL NE DÉDUIT RIEN, et c'est la propriété qui répare le bug : un registre qui « corrigerait » le mail visé,
   * ou qui déduirait l'état de l'échange de celui du mail, reconstruirait la devinette qu'on vient de supprimer.
   */
  it('🔴🔴 un geste sur UN mail arrive avec SON identifiant, sans rien de déduit', () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    /* Retirer l'étoile d'un mail parmi plusieurs : le MAIL s'éteint, l'ÉCHANGE reste allumé. */
    annoncerEtoile({ filId: 36764, messageId: 57625, etoilee: false, filEtoile: true });
    stop();
    expect(vus).toEqual([{ filId: 36764, messageId: 57625, etoilee: false, filEtoile: true }]);
  });

  /** ⚠️ ET UN GESTE SUR L'ÉCHANGE ENTIER SE DIT `messageId: null` — la ligne de la boîte et sa barre de survol. */
  it('⚠️ un geste sur l’échange entier passe sans identifiant de mail', () => {
    const vus: unknown[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    annoncerEtoile({ filId: 36764, messageId: null, etoilee: true, filEtoile: true });
    stop();
    expect(vus).toEqual([{ filId: 36764, messageId: null, etoilee: true, filEtoile: true }]);
  });

  /** ⚠️ `filEtoile: null` VOYAGE AUSSI : « je ne sais pas » est une information, pas une absence à remplacer. */
  it('⚠️ « je ne sais pas » sur l’échange arrive intact', () => {
    const vus: { filEtoile: boolean | null }[] = [];
    const stop = ecouterEtoile((s) => vus.push(s));
    annoncerEtoile({ filId: 7, messageId: 51, etoilee: false, filEtoile: null });
    stop();
    expect(vus[0].filEtoile).toBeNull();
  });
});
