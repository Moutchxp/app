import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  annoncerCartesContact, concerneCeBien, ecouterCartesContact, oublierLesAuditeursCartesContact,
  type SignalCartesContact,
} from './signalCartesContact';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-7 — LA SYNCHRONISATION DU HAUT ET DU BAS ════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : « SYNCHRONISATION TOTALE avec le bloc Parties : créer une carte par le “+”, glisser une capsule
 * d'un côté à l'autre, vérifier, modifier ou retirer, que ce soit depuis le haut ou depuis le bas, met à jour
 * l'autre endroit en direct. Une seule porte d'écriture. »
 *
 * CE QUE CE FICHIER TIENT : le signal lui-même — il réveille les deux endroits, il porte la clé du bien, et un
 * auditeur en erreur ne fait pas taire les autres. Que les deux écrans s'y abonnent VRAIMENT est éprouvé là où ils
 * vivent (`CartesPersonnes.contacts.test.tsx` et `HistoriqueDuBien.test.ts`).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
beforeEach(() => { oublierLesAuditeursCartesContact(); });

describe('le signal réveille qui affiche des cartes de contact', () => {
  it('🔴🔴 TOUS LES ABONNÉS SONT PRÉVENUS — c’est ce qui synchronise le haut et le bas', () => {
    const haut = vi.fn();
    const bas = vi.fn();
    ecouterCartesContact(haut);
    ecouterCartesContact(bas);
    annoncerCartesContact('432');
    expect(haut).toHaveBeenCalledTimes(1);
    expect(bas).toHaveBeenCalledTimes(1);
    expect((haut.mock.calls[0][0] as SignalCartesContact).lotCle).toBe('432');
  });

  it('🔴 LE SIGNAL PORTE LA CLÉ DU BIEN : un geste sur un bien ne fait pas relire les autres', () => {
    const vus: string[] = [];
    ecouterCartesContact((s) => { if (concerneCeBien(s, '432')) vus.push('moi'); });
    annoncerCartesContact('29');
    expect(vus).toEqual([]);
    annoncerCartesContact('432');
    expect(vus).toEqual(['moi']);
  });

  it('⚠️ LA COMPARAISON IGNORE LES ESPACES DE BORD — la clé vient d’une URL ici, d’une colonne là', () => {
    expect(concerneCeBien({ lotCle: ' 432 ', tour: 1 }, '432')).toBe(true);
    expect(concerneCeBien({ lotCle: '432', tour: 1 }, ' 432')).toBe(true);
    /* ⚠️ MAIS UNE CLÉ VIDE NE CONCERNE PERSONNE : sans cela, deux vides se répondraient. */
    expect(concerneCeBien({ lotCle: '', tour: 1 }, '')).toBe(false);
    expect(concerneCeBien({ lotCle: '  ', tour: 1 }, '')).toBe(false);
  });

  it('⚠️ UNE CLÉ VIDE N’ANNONCE RIEN : un geste sans bien n’a personne à réveiller', () => {
    const f = vi.fn();
    ecouterCartesContact(f);
    expect(annoncerCartesContact('')).toBe(0);
    expect(annoncerCartesContact('   ')).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  /**
   * ══ 🔴🔴 NE PAS SE RÉVEILLER SOI-MÊME, ET C'EST LA MESURE QUI L'A IMPOSÉ ═══════════════════════════════════
   *
   * Le bloc du bas est à la fois ÉMETTEUR et AUDITEUR. Sans ce tour rendu, il relisait DEUX FOIS après chacune
   * de ses écritures — une fois parce qu'il venait d'écrire, une fois parce qu'il s'entendait. Deux épreuves de
   * `HistoriqueDuBien` comptent les lectures : elles en attendaient deux, elles en ont vu trois.
   */
  it('🔴🔴 `sauf` ÉPARGNE L’ÉMETTEUR : il ne s’entend pas lui-même', () => {
    const relectures: number[] = [];
    const moi = (s: SignalCartesContact): void => { relectures.push(s.tour); };
    ecouterCartesContact(moi);

    /* ① mon propre geste : je m'épargne, et je ne me relis pas. */
    annoncerCartesContact('432', { sauf: moi });
    expect(relectures).toEqual([]);

    /* ② le geste de l'AUTRE endroit : je le reçois, et je relis. */
    const autre = annoncerCartesContact('432');
    expect(relectures).toEqual([autre]);
  });

  /**
   * 🔴🔴 POURQUOI `sauf` DÉSIGNE L'AUDITEUR ET NON UN NUMÉRO DE TOUR. Ma première version rendait le tour pour
   * que l'émetteur le garde et l'ignore. Elle ne pouvait pas marcher : les auditeurs sont prévenus PENDANT
   * l'appel, et le marqueur n'est rangé qu'APRÈS. L'épreuve l'a dit tout de suite, et ce cas garde la leçon.
   */
  it('🔴🔴 LE PIÈGE FERMÉ : garder le tour APRÈS l’appel arrive toujours trop tard', () => {
    let monTour = 0;
    const vus: number[] = [];
    ecouterCartesContact((s) => { if (s.tour !== monTour) vus.push(s.tour); });
    /* On range le tour après l'appel — exactement ma première version : l'auditeur a déjà été prévenu. */
    monTour = annoncerCartesContact('432');
    expect(vus).toHaveLength(1);
    expect(monTour).toBe(vus[0]);
  });

  it('⚠️ `sauf` N’ÉPARGNE QUE LUI : les autres sont prévenus comme d’habitude', () => {
    const moi = vi.fn();
    const autre = vi.fn();
    ecouterCartesContact(moi);
    ecouterCartesContact(autre);
    annoncerCartesContact('432', { sauf: moi });
    expect(moi).not.toHaveBeenCalled();
    expect(autre).toHaveBeenCalledTimes(1);
  });

  it('🔴 LE DÉSABONNEMENT MARCHE : un composant démonté n’est plus appelé', () => {
    const f = vi.fn();
    const stop = ecouterCartesContact(f);
    annoncerCartesContact('432');
    stop();
    annoncerCartesContact('432');
    expect(f).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ SANS CE `try`, UN SEUL ÉCRAN EN ERREUR LAISSERAIT TOUS LES SUIVANTS SUR LEUR IMAGE D'AVANT — c'est-à-dire
   * exactement le défaut qu'on répare. Le cas est écrit pour que personne ne retire la protection.
   */
  it('🔴🔴 UN AUDITEUR QUI JETTE NE FAIT PAS TAIRE LES AUTRES', () => {
    const bon = vi.fn();
    ecouterCartesContact(() => { throw new Error('écran en erreur'); });
    ecouterCartesContact(bon);
    expect(() => annoncerCartesContact('432')).not.toThrow();
    expect(bon).toHaveBeenCalledTimes(1);
  });

  it('⚠️ LE TOUR NE RECULE JAMAIS : un auditeur peut savoir qu’il a déjà vu ce signal', () => {
    const tours: number[] = [];
    ecouterCartesContact((s) => tours.push(s.tour));
    annoncerCartesContact('432');
    annoncerCartesContact('432');
    annoncerCartesContact('29');
    expect(tours).toHaveLength(3);
    expect(tours[1]).toBeGreaterThan(tours[0]);
    expect(tours[2]).toBeGreaterThan(tours[1]);
  });

  /**
   * 🔴 LE MODULE NE SAIT NI LIRE NI ÉCRIRE, et c'est sa garantie : il est importé par des composants `'use
   * client'`. Un seul import qui tirerait `pg` ferait tomber TOUTE l'application, écran de connexion compris —
   * incident du 24/09/2026. Le garde de graphe l'attrape aussi ; celui-ci le dit à l'endroit où on le lit.
   */
  it('🔒 le module ne porte aucune I/O', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/signalCartesContact.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const mot of ['fetch(', 'SELECT ', 'from \'react\'', 'from \'../db/', 'server-only', 'node:fs']) {
      expect(src, mot).not.toContain(mot);
    }
  });
});
