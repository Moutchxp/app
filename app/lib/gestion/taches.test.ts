import { describe, expect, it } from 'vitest';
import {
  compterTaches, couleurTache, motCouleurTache, dateLisibleTache, ecartJours, erreurSaisie, filtrerTaches, jourDecale, jourParisDe,
  echeanceLisible, lireSaisie, phraseTrace, rappelsParDefaut, rappelsValides, repartirTaches, type Tache,
} from './taches';

/**
 * LOT TACHES-1 — LA RÈGLE UNIQUE des tâches : couleur, ordre, compteurs, filtre, décalage, rappels, traces.
 * Tous les écrans l'appellent ; si elle change, c'est ici qu'on le voit.
 */

/** Un instant donné en heure de PARIS (octobre = UTC+2). */
const paris = (jourHeure: string) => new Date(`${jourHeure}+02:00`);
const MAINTENANT = paris('2026-10-13T15:00:00');

const tache = (p: Partial<Tache> = {}): Tache => ({
  id: 1, lotId: 10, lotCle: '315', adresseBien: '12 rue des Lilas, Paris', evenement: null, objet: 'Visite',
  note: null, jour: '2026-10-13', heure: null, rappels: [], etat: 'a_faire', confieeA: 1, confieeALibelle: 'Arno Jorel',
  creeLe: '2026-10-01T08:00:00.000Z', creeParLibelle: 'Arno Jorel', majLe: '2026-10-01T08:00:00.000Z',
  faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, ...p,
});

describe('🔴 le code couleur d’Arno', () => {
  it('🔴 LOT COULEURS-TACHES — hier = bordeaux (retard), aujourd’hui ET demain = rouge, J+2 = orange, J+3 = vert', () => {
    expect(couleurTache({ jour: '2026-10-12', etat: 'a_faire' }, MAINTENANT)).toBe('retard');
    expect(couleurTache({ jour: '2026-10-13', etat: 'a_faire' }, MAINTENANT)).toBe('jour');
    expect(couleurTache({ jour: '2026-10-14', etat: 'a_faire' }, MAINTENANT)).toBe('jour');
    expect(couleurTache({ jour: '2026-10-15', etat: 'a_faire' }, MAINTENANT)).toBe('proche');
    expect(couleurTache({ jour: '2026-10-16', etat: 'a_faire' }, MAINTENANT)).toBe('plus_tard');
    expect(couleurTache({ jour: '2027-01-01', etat: 'a_faire' }, MAINTENANT)).toBe('plus_tard');
    expect(couleurTache({ jour: '2025-01-01', etat: 'a_faire' }, MAINTENANT)).toBe('retard');
  });

  it('🔴 passage de minuit À PARIS, et non en UTC', () => {
    // 23 h 59 à Paris le 13 = 21 h 59 UTC : la tâche du 13 est encore « du jour ».
    expect(couleurTache({ jour: '2026-10-13', etat: 'a_faire' }, paris('2026-10-13T23:59:00'))).toBe('jour');
    // 0 h 01 à Paris le 14 = 22 h 01 UTC LE 13 : en UTC on serait encore le 13 ; à Paris, c'est le 14.
    const apresMinuit = paris('2026-10-14T00:01:00');
    expect(apresMinuit.toISOString().slice(0, 10)).toBe('2026-10-13');
    expect(couleurTache({ jour: '2026-10-13', etat: 'a_faire' }, apresMinuit)).toBe('retard');
    expect(couleurTache({ jour: '2026-10-14', etat: 'a_faire' }, apresMinuit)).toBe('jour');
    expect(couleurTache({ jour: '2026-10-15', etat: 'a_faire' }, apresMinuit)).toBe('jour');  // demain
    expect(couleurTache({ jour: '2026-10-16', etat: 'a_faire' }, apresMinuit)).toBe('proche');
    expect(couleurTache({ jour: '2026-10-17', etat: 'a_faire' }, apresMinuit)).toBe('plus_tard');
  });

  it('🔴 le mot : « En retard », « Aujourd’hui », « Demain », « Dans 2 jours », « Plus tard » ; rien si terminée', () => {
    const mot = (jour: string) => motCouleurTache({ jour, etat: 'a_faire' }, MAINTENANT);
    expect(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map(mot))
      .toEqual(['En retard', 'Aujourd’hui', 'Demain', 'Dans 2 jours', 'Plus tard']);
    expect(motCouleurTache({ jour: '2026-10-13', etat: 'faite' }, MAINTENANT)).toBeNull();
    // Passé minuit à Paris, « Demain » devient « Aujourd’hui ».
    expect(motCouleurTache({ jour: '2026-10-14', etat: 'a_faire' }, paris('2026-10-14T00:01:00'))).toBe('Aujourd’hui');
  });

  it('le changement d’heure (fin octobre) ne décale pas d’un jour', () => {
    const lendemain = new Date('2026-10-25T23:30:00+01:00'); // heure d'hiver
    expect(jourParisDe(lendemain)).toBe('2026-10-25');
    expect(ecartJours('2026-10-24', '2026-10-26')).toBe(2);
    expect(couleurTache({ jour: '2026-10-27', etat: 'a_faire' }, lendemain)).toBe('proche');
  });

  it('c’est le JOUR qui compte : un rendez-vous de 9 h vu à 15 h le même jour reste « du jour »', () => {
    expect(couleurTache({ jour: '2026-10-13', etat: 'a_faire' }, MAINTENANT)).toBe('jour');
  });

  it('🔴 une tâche faite ou annulée n’a plus de couleur, et sort des compteurs', () => {
    expect(couleurTache({ jour: '2026-10-01', etat: 'faite' }, MAINTENANT)).toBeNull();
    expect(couleurTache({ jour: '2026-10-01', etat: 'annulee' }, MAINTENANT)).toBeNull();
    const n = compterTaches([
      tache({ id: 1, jour: '2026-10-01' }), tache({ id: 2, jour: '2026-10-01', etat: 'faite', faiteLe: '2026-10-02T10:00:00Z' }),
      tache({ id: 3, jour: '2026-10-13' }), tache({ id: 4, jour: '2026-10-15' }), tache({ id: 5, jour: '2026-11-01' }),
    ], MAINTENANT);
    expect(n).toEqual({ retard: 1, jour: 1, proche: 1, plus_tard: 1 });
  });
});

describe('l’ordre d’affichage : rouge, blanc, orange, vert, puis date et heure', () => {
  it('trie les ouvertes et met les terminées à part', () => {
    const l = [
      tache({ id: 1, jour: '2026-10-20' }),
      tache({ id: 2, jour: '2026-10-14', heure: '10:00' }),
      tache({ id: 3, jour: '2026-10-14' }),
      tache({ id: 4, jour: '2026-10-13', heure: '18:00' }),
      tache({ id: 5, jour: '2026-10-10' }),
      tache({ id: 6, jour: '2026-10-09', etat: 'faite', faiteLe: '2026-10-09T10:00:00Z' }),
      tache({ id: 7, jour: '2026-10-08', etat: 'annulee', annuleeLe: '2026-10-11T10:00:00Z' }),
    ];
    const { ouvertes, terminees } = repartirTaches(l, MAINTENANT);
    expect(ouvertes.map((t) => t.id)).toEqual([5, 4, 3, 2, 1]);
    expect(terminees.map((t) => t.id)).toEqual([7, 6]);
  });
});

describe('🔴 le filtre « Toutes / Les miennes »', () => {
  const l = [tache({ id: 1, confieeA: 1 }), tache({ id: 2, confieeA: 2 }), tache({ id: 3, confieeA: null })];
  it('« Toutes » rend tout ; « Les miennes » ne rend que celles qui me sont confiées', () => {
    expect(filtrerTaches(l, 'toutes', 1).map((t) => t.id)).toEqual([1, 2, 3]);
    expect(filtrerTaches(l, 'miennes', 1).map((t) => t.id)).toEqual([1]);
    expect(filtrerTaches(l, 'miennes', 2).map((t) => t.id)).toEqual([2]);
  });
  it('un identifiant rendu en chaîne par la base est comparé comme un nombre', () => {
    expect(filtrerTaches([tache({ confieeA: '1' as unknown as number })], 'miennes', 1)).toHaveLength(1);
  });
  it('sans compte (voie de secours), aucune n’est « à moi »', () => {
    expect(filtrerTaches(l, 'miennes', null)).toEqual([]);
  });
});

describe('🔴 « Décaler » : raccourcis, et nouvelle couleur', () => {
  it('+1 jour, +2 jours, +1 semaine à partir du jour de la tâche', () => {
    expect(jourDecale('2026-10-14', '+1j', MAINTENANT)).toBe('2026-10-15');
    expect(jourDecale('2026-10-14', '+2j', MAINTENANT)).toBe('2026-10-16');
    expect(jourDecale('2026-10-14', '+1s', MAINTENANT)).toBe('2026-10-21');
    expect(jourDecale('2026-10-30', '+2j', MAINTENANT)).toBe('2026-11-01');
  });
  it('une tâche EN RETARD se décale à partir d’aujourd’hui — sinon elle resterait rouge', () => {
    const nouveau = jourDecale('2026-10-01', '+1j', MAINTENANT);
    expect(nouveau).toBe('2026-10-14');
    expect(couleurTache({ jour: '2026-10-01', etat: 'a_faire' }, MAINTENANT)).toBe('retard');
    expect(couleurTache({ jour: nouveau, etat: 'a_faire' }, MAINTENANT)).toBe('jour'); // demain : rouge
    expect(couleurTache({ jour: jourDecale('2026-10-13', '+1s', MAINTENANT), etat: 'a_faire' }, MAINTENANT)).toBe('plus_tard');
  });
});

describe('les rappels', () => {
  it('par défaut : rendez-vous = la veille + 1 h avant ; repère = le jour même à 9 h', () => {
    expect(rappelsParDefaut(true)).toEqual([{ sorte: 'avant', minutes: 1440 }, { sorte: 'avant', minutes: 60 }]);
    expect(rappelsParDefaut(false)).toEqual([{ sorte: 'jour', heure: '09:00' }]);
  });
  it('les rappels venus du navigateur sont nettoyés, et incompatibles écartés', () => {
    const brut = [{ sorte: 'avant', minutes: 60 }, { sorte: 'avant', minutes: 60 }, { sorte: 'jour', heure: '25:00' },
      { sorte: 'bidon' }, { sorte: 'jour', heure: '09:00' }];
    expect(rappelsValides(brut, true)).toEqual([{ sorte: 'avant', minutes: 60 }]);
    expect(rappelsValides(brut, false)).toEqual([{ sorte: 'jour', heure: '09:00' }]);
    expect(rappelsValides('n’importe quoi', true)).toEqual([]);
  });
});

describe('la saisie', () => {
  it('lit le corps sans faire confiance aux types, et dit ce qui manque', () => {
    const s = lireSaisie({ objet: ' Visite ', jour: '2026-10-14', heure: '', confieeA: '3', evenementId: '' });
    expect(s).toMatchObject({ objet: ' Visite ', jour: '2026-10-14', heure: null, confieeA: 3, evenementId: null });
    expect(erreurSaisie(s)).toBeNull();
    expect(erreurSaisie({ ...s, objet: '  ' })).toMatch(/objet/);
    expect(erreurSaisie({ ...s, jour: '2026-02-31' })).toMatch(/date/);
    expect(erreurSaisie({ ...s, heure: '9h' })).toMatch(/HH:MM/);
    expect(erreurSaisie({ ...s, confieeA: null })).toMatch(/personne/);
  });
});

describe('🔴 les traces, comme Arno les a écrites', () => {
  it('faite, décalée (ancienne → nouvelle date), annulée, modifiée', () => {
    const le = '2026-10-13T17:20:00.000Z'; // 19 h 20 à Paris
    expect(phraseTrace({ action: 'faite', avant: null, apres: null, survenuLe: le, auteurLibelle: 'Arno Jorel' }))
      .toBe('Faite par Arno Jorel le 13/10/2026 à 19:20');
    expect(phraseTrace({
      action: 'decalage', avant: { jour: '2026-10-15', heure: null }, apres: { jour: '2026-10-17', heure: '10:00' },
      survenuLe: le, auteurLibelle: 'Arno Jorel',
    })).toBe('Décalée du jeu. 15/10/2026 au sam. 17/10/2026 à 10:00 par Arno Jorel le 13/10/2026 à 19:20'); // LOT GESTION-DECALER-TACHE
    expect(phraseTrace({ action: 'annulation', avant: null, apres: null, survenuLe: le, auteurLibelle: 'X' }))
      .toBe('Annulée par X le 13/10/2026 à 19:20');
    expect(phraseTrace({ action: 'modification', avant: {}, apres: { objet: 'a', jour: 'b' }, survenuLe: le, auteurLibelle: 'X' }))
      .toBe('Modifiée par X le 13/10/2026 à 19:20 (objet, date)');
  });
  it('la date d’une tâche se lit avec son jour de la semaine', () => {
    expect(dateLisibleTache('2026-10-13', null)).toBe('mar. 13/10/2026');
    expect(dateLisibleTache('2026-10-13', '09:30')).toBe('mar. 13/10/2026 à 09:30');
  });
});

describe('🔴 PARTIE A — l’échéance, au format d’Arno', () => {
  const MAINT = new Date('2026-10-13T15:00:00+02:00');
  it('« mar. 13 oct. · 9 h 30 », « … · 10 h », « … · journée »', () => {
    expect(echeanceLisible('2026-10-13', '09:30', MAINT)).toBe('mar. 13 oct. · 9 h 30');
    expect(echeanceLisible('2026-10-13', '10:00', MAINT)).toBe('mar. 13 oct. · 10 h');
    expect(echeanceLisible('2026-10-13', null, MAINT)).toBe('mar. 13 oct. · journée');
    expect(echeanceLisible('2026-02-01', null, MAINT)).toBe('dim. 1 févr. · journée');
  });
  it('l’année n’apparaît que si elle n’est pas l’année en cours', () => {
    expect(echeanceLisible('2027-01-04', null, MAINT)).toBe('lun. 4 janv. 2027 · journée');
  });
});
