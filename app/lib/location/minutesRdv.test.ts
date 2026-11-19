import { describe, expect, it } from 'vitest';
import { lireMinutesRdv, listeMinutesFr, minuteDe, MINUTES_RDV_DEFAUT, refusMinutesRdv } from './minutesRdv';

/** 🔴 Arno (18/11/2026) — les minutes des rendez-vous du préavis : 00, 15, 30, 45 par défaut, un réglage, le serveur refuse les autres. */
describe('🔴 les minutes autorisées', () => {
  it('le défaut et la lecture du réglage (illisible ou vide → le défaut ; jamais hors 0-59)', () => {
    expect(MINUTES_RDV_DEFAUT).toEqual([0, 15, 30, 45]);
    expect(lireMinutesRdv(undefined)).toEqual([0, 15, 30, 45]);
    expect(lireMinutesRdv([])).toEqual([0, 15, 30, 45]);
    expect(lireMinutesRdv([30, 0, 30, 75, -1, 'x'])).toEqual([0, 30]);
    expect(lireMinutesRdv([0, 20, 40])).toEqual([0, 20, 40]);
  });
  it('seules 00, 15, 30 et 45 sont acceptées (début ET fin) ; un champ vide est laissé à la règle existante', () => {
    for (const m of ['00', '15', '30', '45']) expect(refusMinutesRdv({ debut: `10:${m}`, fin: `11:${m}` }, MINUTES_RDV_DEFAUT)).toBeNull();
    expect(refusMinutesRdv({ debut: '09:53', fin: '10:00' }, MINUTES_RDV_DEFAUT)).toBe('L’heure de début doit tomber sur 00, 15, 30 ou 45 minutes.');
    expect(refusMinutesRdv({ debut: '10:00', fin: '11:10' }, MINUTES_RDV_DEFAUT)).toBe('L’heure de fin doit tomber sur 00, 15, 30 ou 45 minutes.');
    expect(refusMinutesRdv({ debut: '', fin: '' }, MINUTES_RDV_DEFAUT)).toBeNull();
    expect(refusMinutesRdv({ debut: '10:20', fin: '11:40' }, [0, 20, 40])).toBeNull();
    expect(minuteDe('09:53')).toBe(53);
    expect(listeMinutesFr([0, 30])).toBe('00 ou 30');
  });
});

describe('🔴 Arno (19/11/2026) — la plage horaire (début 8h00 à 20h00, fin au plus tard 21h00) et l’affichage « 10h »', () => {
  it('format « 10h » ; bornes lues (incohérentes ou absentes → le défaut)', async () => {
    const { heureListeFr, lirePlageRdv, PLAGE_RDV_DEFAUT, messagePlageRdv } = await import('./minutesRdv');
    expect(heureListeFr('10')).toBe('10h');
    expect(heureListeFr('08')).toBe('8h');
    expect(lirePlageRdv(undefined)).toEqual(PLAGE_RDV_DEFAUT);
    expect(lirePlageRdv({ debutMin: '09:00', debutMax: '08:00', finMax: '21:00' })).toEqual(PLAGE_RDV_DEFAUT);
    expect(lirePlageRdv({ debutMin: '07:30', debutMax: '19:00', finMax: '20:00' })).toEqual({ debutMin: '07:30', debutMax: '19:00', finMax: '20:00' });
    expect(messagePlageRdv(PLAGE_RDV_DEFAUT)).toBe('Un rendez-vous commence entre 8h00 et 20h00 et se termine au plus tard à 21h00.');
  });
  it('début : 8h à 20h (20h : 00 seulement) ; fin : 8h15 à 21h (21h : 00 seulement) ; « garder » ajoute une heure hors plage', async () => {
    const { creneauxProposes, PLAGE_RDV_DEFAUT } = await import('./minutesRdv');
    const d = creneauxProposes('debut', PLAGE_RDV_DEFAUT, MINUTES_RDV_DEFAUT);
    expect([...d.keys()]).toEqual(['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']);
    expect(d.get('20')).toEqual([0]);
    const f = creneauxProposes('fin', PLAGE_RDV_DEFAUT, MINUTES_RDV_DEFAUT);
    expect([...f.keys()].at(-1)).toBe('21');
    expect(f.get('08')).toEqual([15, 30, 45]);
    expect(f.get('21')).toEqual([0]);
    expect(creneauxProposes('debut', PLAGE_RDV_DEFAUT, MINUTES_RDV_DEFAUT, ['22:00', '23:17']).get('23')).toEqual([17]);
  });
  it('le serveur : 20h00-21h00 accepté ; début 7h45, début 20h15, fin 21h15 refusés', async () => {
    const { refusPlageRdv, PLAGE_RDV_DEFAUT } = await import('./minutesRdv');
    const msg = 'Un rendez-vous commence entre 8h00 et 20h00 et se termine au plus tard à 21h00.';
    expect(refusPlageRdv({ debut: '20:00', fin: '21:00' }, PLAGE_RDV_DEFAUT)).toBeNull();
    expect(refusPlageRdv({ debut: '08:00', fin: '08:15' }, PLAGE_RDV_DEFAUT)).toBeNull();
    expect(refusPlageRdv({ debut: '07:45', fin: '09:00' }, PLAGE_RDV_DEFAUT)).toBe(msg);
    expect(refusPlageRdv({ debut: '20:15', fin: '21:00' }, PLAGE_RDV_DEFAUT)).toBe(msg);
    expect(refusPlageRdv({ debut: '20:00', fin: '21:15' }, PLAGE_RDV_DEFAUT)).toBe(msg);
  });
});

describe('🔴 Arno (19/11/2026) — les durées d’un rendez-vous (réglage 501)', async () => {
  const { DUREES_RDV_DEFAUT, dureeAffichee, dureeEntre, dureesCompatibles, finDepuisDebut, lireDureesRdv, motDureeRdv, PLAGE_RDV_DEFAUT } = await import('./minutesRdv');
  it('défaut 15/30/45/60, 30 d’office ; un réglage incohérent retombe sur le défaut', () => {
    expect(DUREES_RDV_DEFAUT).toEqual({ durees: [15, 30, 45, 60], defaut: 30 });
    expect(lireDureesRdv(null)).toEqual(DUREES_RDV_DEFAUT);
    expect(lireDureesRdv({ durees: [60, 30], defaut: 45 })).toEqual(DUREES_RDV_DEFAUT);
    expect(lireDureesRdv({ durees: [60, 30, 30], defaut: 60 })).toEqual({ durees: [30, 60], defaut: 60 });
  });
  it('« 15 min », « 1 h », « 1 h 30 » ; fin = début + durée ; durée entre deux heures', () => {
    expect([15, 60, 90].map(motDureeRdv)).toEqual(['15 min', '1 h', '1 h 30']);
    expect(finDepuisDebut('10:00', 30)).toBe('10:30');
    expect(dureeEntre('10:00', '11:00')).toBe(60);
    expect(dureeEntre('10:00', '09:00')).toBeNull();
    expect(dureeAffichee('10:00', '11:30', 30, [15, 30, 45, 60])).toBe('personnalisee');
  });
  it('début 20h00 : la fin ne dépasse jamais 21h00', () => {
    expect(dureesCompatibles('20:00', [15, 30, 45, 60, 90], PLAGE_RDV_DEFAUT, [0, 15, 30, 45])).toEqual([15, 30, 45, 60]);
    expect(dureesCompatibles('20:30', [15, 30, 45, 60], { ...PLAGE_RDV_DEFAUT, debutMax: '20:30' }, [0, 15, 30, 45])).toEqual([15, 30]);
  });
});
