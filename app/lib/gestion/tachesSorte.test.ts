import { describe, expect, it } from 'vitest';
import { heureFinRdv, lireSaisie, MOT_SORTE, objetRendezVous, verifierSaisie } from './taches';

/** 🔴🔴 Arno (11/11/2026, lot C) — « RDV / Tâches » : le type, l'objet proposé d'un rendez-vous, l'heure de fin, les champs obligatoires. PUR. */
const BASE = { objet: 'Visite', jour: '2026-11-20', heure: null as string | null, note: null, confieeA: 3 };
describe('rendez-vous ou tâche', () => {
  it('l’objet proposé : « Demande de rendez-vous le JJ/MM/AAAA à HHhMM »', () => {
    expect(objetRendezVous('2026-11-20', '10:30')).toBe('Demande de rendez-vous le 20/11/2026 à 10h30');
    expect(objetRendezVous('2026-11-20', null)).toBe('Demande de rendez-vous le 20/11/2026 à HHhMM');
  });
  it('l’heure de fin : début + durée, bornée à 23h59 ; sans heure ou sans durée : rien', () => {
    expect(heureFinRdv('10:30', 90)).toBe('12:00');
    expect(heureFinRdv('23:00', 120)).toBe('23:59');
    expect(heureFinRdv(null, 60)).toBeNull();
    expect(heureFinRdv('10:00', null)).toBeNull();
  });
  it('rendez-vous : heure de début ET durée obligatoires ; tâche : la date seule (heure facultative, pas de durée)', () => {
    expect(verifierSaisie({ ...BASE, sorte: 'rdv', dureeMinutes: 60 })).toMatchObject({ champ: 'heure' });
    expect(verifierSaisie({ ...BASE, sorte: 'rdv', heure: '10:00', dureeMinutes: null })).toMatchObject({ champ: 'duree' });
    expect(verifierSaisie({ ...BASE, sorte: 'rdv', heure: '10:00', dureeMinutes: 30 })).toBeNull();
    expect(verifierSaisie({ ...BASE, sorte: 'tache' })).toBeNull();
    expect(verifierSaisie({ ...BASE, sorte: 'tache', jour: '' })).toMatchObject({ champ: 'jour' });
    expect(verifierSaisie({ ...BASE })).toBeNull(); // sans type (écran d'avant) : comme avant
  });
  it('le type est relu du corps (rdv / tache seulement) ; les libellés', () => {
    expect(lireSaisie({ ...BASE, sorte: 'rdv' }).sorte).toBe('rdv');
    expect(lireSaisie({ ...BASE, sorte: 'autre' }).sorte).toBeUndefined();
    expect(MOT_SORTE).toEqual({ rdv: 'RDV', tache: 'Tâche' });
  });
});
