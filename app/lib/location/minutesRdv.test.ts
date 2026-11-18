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
