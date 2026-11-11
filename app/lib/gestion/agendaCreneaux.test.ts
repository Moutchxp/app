import { describe, expect, it } from 'vitest';
import { construireEvenement, CRENEAUX_SANS_HEURE, placeDansAgenda, premierCreneauLibre, type ContenuTache } from './agendaTache';
import { objetTacheGestion, objetType } from './taches';
import { icsTacheExterne } from './mailTacheExterne';

/** 🔴🔴 Arno (11/11/2026) — LA PLACE D'UNE TÂCHE DANS L'AGENDA (Google et .ics) ; l'objet type d'une tâche. PUR. */
const C = (o: Partial<ContenuTache>): ContenuTache => ({ id: 7, objet: 'Relancer', texte: '', jour: '2026-11-20', heure: null, dureeMinutes: null, rappels: [], faite: false,
  lotId: 1, adresse: null, codePostal: null, commune: null, pieces: [], ...o });
const ev = (o: Partial<ContenuTache>) => construireEvenement(C(o), { motRappel: () => '' });

describe('les créneaux d’une tâche sans heure : 30 min, empilés en remontant, jamais après 9h30', () => {
  it('9h00, puis 8h30, puis 8h00… ; le premier LIBRE (un créneau libéré est repris, les autres ne bougent pas)', () => {
    expect(CRENEAUX_SANS_HEURE.slice(0, 4)).toEqual(['09:00', '08:30', '08:00', '07:30']);
    expect(CRENEAUX_SANS_HEURE.at(-1)).toBe('00:00');
    expect(premierCreneauLibre([])).toBe('09:00');
    expect(premierCreneauLibre(['09:00'])).toBe('08:30');
    expect(premierCreneauLibre(['09:00', '08:30'])).toBe('08:00');
    expect(premierCreneauLibre(['08:30', '08:00'])).toBe('09:00'); // la 1re annulée : son créneau est repris, 8h30 et 8h00 restent
    expect(premierCreneauLibre(CRENEAUX_SANS_HEURE)).toBeNull();
  });
  it('l’événement Google : tâche sans heure dans SON créneau (9h00–9h30) ; tâche avec heure : 30 min à son heure ; rendez-vous : sa durée', () => {
    expect([ev({ sorte: 'tache', creneau: '09:00' }).start, ev({ sorte: 'tache', creneau: '09:00' }).end]).toEqual([
      { dateTime: '2026-11-20T09:00:00', timeZone: 'Europe/Paris' }, { dateTime: '2026-11-20T09:30:00', timeZone: 'Europe/Paris' }]);
    expect(ev({ sorte: 'tache', creneau: '08:30' }).end).toEqual({ dateTime: '2026-11-20T09:00:00', timeZone: 'Europe/Paris' });
    expect(ev({ sorte: 'tache', heure: '14:15' }).end).toEqual({ dateTime: '2026-11-20T14:45:00', timeZone: 'Europe/Paris' });
    expect(ev({ sorte: 'rdv', heure: '10:00', dureeMinutes: 90 }).end).toEqual({ dateTime: '2026-11-20T11:30:00', timeZone: 'Europe/Paris' });
    // Une tâche d'avant (sans créneau) : la journée, comme avant ; un rendez-vous d'avant sans durée : 1 h.
    expect(ev({ sorte: 'tache' }).start).toEqual({ date: '2026-11-20' });
    expect(ev({ heure: '10:00' }).end).toEqual({ dateTime: '2026-11-20T11:00:00', timeZone: 'Europe/Paris' });
    // Chaque tâche reste un événement séparé (sa propre marque).
    expect(ev({ id: 8, sorte: 'tache', creneau: '08:30' }).extendedProperties.private).toMatchObject({ svavTacheId: '8' });
  });
  it('les rappels d’une tâche sans heure se comptent jusqu’à SON créneau (le jour même à 9h ⇒ à l’heure ; la veille à 17h ⇒ 16 h avant 9h00)', () => {
    const r = ev({ sorte: 'tache', creneau: '09:00', rappels: [{ sorte: 'jour', heure: '09:00' }, { sorte: 'veille', heure: '17:00' }] }).reminders;
    expect((r.overrides ?? []).map((x) => x.minutes)).toEqual([0, 960]);
  });
  it('placeDansAgenda : la même règle pour l’invitation .ics', () => {
    expect(placeDansAgenda({ sorte: 'tache', heure: null, dureeMinutes: null, creneau: '08:00' })).toEqual({ heure: '08:00', duree: 30 });
    expect(placeDansAgenda({ sorte: 'tache', heure: null, dureeMinutes: null, creneau: null })).toBeNull();
    const ics = icsTacheExterne({ sorte: 'invitation', titre: 'Relancer', jour: '2026-11-20', heure: null, dureeMinutes: null, adresse: null, notes: null, signature: { texte: '', html: '' },
      tacheId: 9, domaine: 'exemple.test', sequence: 0, maintenant: new Date('2026-11-11T10:00:00Z'), place: { heure: '08:30', duree: 30 } })!;
    expect(ics).toContain('DTSTART:20261120T073000Z'); // 8h30 à Paris (UTC+1)
    expect(ics).toContain('DTEND:20261120T080000Z');
  });
});

describe('l’objet type', () => {
  it('« Demande de participation à une tâche de gestion le JJ/MM/AAAA » (+ « à HHhMM » avec une heure) ; le rendez-vous garde le sien', () => {
    expect(objetTacheGestion('2026-11-20', null)).toBe('Demande de participation à une tâche de gestion le 20/11/2026');
    expect(objetTacheGestion('2026-11-20', '14:15')).toBe('Demande de participation à une tâche de gestion le 20/11/2026 à 14h15');
    expect(objetType('rdv', '2026-11-20', '10:30')).toBe('Demande de rendez-vous le 20/11/2026 à 10h30');
  });
});
