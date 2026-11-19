import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (18/11/2026) — le serveur : la limite des minutes seulement pour un rendez-vous de préavis, et seulement si l'heure CHANGE. Base simulée. */
const h = vi.hoisted(() => ({ preavis: new Set<number>([41]), heure: '09:53' as string | null, duree: 60 as number | null }));
vi.mock('../db/client', () => ({
  query: async (sql: string, p: unknown[] = []) => {
    if (sql.includes('to_regclass')) return { rows: [{ p: true, e: true }] };
    if (sql.includes('FROM gestion_location_previsite WHERE tache_id')) return { rows: (p[0] as number[]).filter((x) => h.preavis.has(x)).map((x) => ({ tache_id: String(x) })) };
    if (sql.includes('FROM gestion_tache WHERE id')) return { rows: [{ heure: h.heure, duree: h.duree }] };
    return { rows: [] };
  },
}));
vi.mock('./minutesRdvRepo', () => ({ minutesRdvAutorisees: async () => [0, 15, 30, 45], plageRdvAutorisee: async () => ({ debutMin: '08:00', debutMax: '20:00', finMax: '21:00' }) }));
import { refusMinutesTachePreavis, tachesRdvPreavis } from './rdvPreavisTache';

beforeEach(() => { h.heure = '09:53'; h.duree = 60; });
describe('🔴 les minutes des tâches de rendez-vous de préavis', () => {
  it('repère les tâches qui portent une pré-visite ou un état des lieux', async () => {
    expect([...(await tachesRdvPreavis([41, 42]))]).toEqual([41]);
  });
  it('rendez-vous de préavis : une nouvelle heure hors réglage est refusée ; 00/15/30/45 acceptées ; l’heure d’origine (09h53) inchangée acceptée', async () => {
    expect(await refusMinutesTachePreavis(41, '10:20')).toBe('L’heure de début doit tomber sur 00, 15, 30 ou 45 minutes.');
    for (const x of ['10:00', '10:15', '10:30', '10:45']) expect(await refusMinutesTachePreavis(41, x)).toBeNull();
    expect(await refusMinutesTachePreavis(41, '09:53')).toBeNull();
    expect(await refusMinutesTachePreavis(41, null)).toBeNull();
  });
  it('une autre tâche reste libre', async () => {
    expect(await refusMinutesTachePreavis(42, '10:20')).toBeNull();
  });
});

describe('🔴 Arno (19/11/2026) — la plage horaire des tâches de rendez-vous de préavis', () => {
  it('début 7h45 ou 20h15 refusé ; 20h00 avec 1 h accepté ; 20h00 avec 1 h 30 (fin 21h30) refusé ; une autre tâche reste libre', async () => {
    const msg = 'Un rendez-vous commence entre 8h00 et 20h00 et se termine au plus tard à 21h00.';
    expect(await refusMinutesTachePreavis(41, '07:45')).toBe(msg);
    expect(await refusMinutesTachePreavis(41, '20:15')).toBe(msg);
    expect(await refusMinutesTachePreavis(41, '20:00', 60)).toBeNull();
    expect(await refusMinutesTachePreavis(41, '20:00', 90)).toBe(msg);
    expect(await refusMinutesTachePreavis(42, '22:00')).toBeNull();
  });
});


describe('🔴 Arno (19/11/2026) — la durée : le serveur refuse tout dépassement de 21h00', () => {
  it('heure inchangée (20h00) : la durée allongée à 1 h 30 (fin 21h30) est refusée ; inchangée ou 1 h acceptée ; 09h53 jamais refusé pour sa minute', async () => {
    const msg = 'Un rendez-vous commence entre 8h00 et 20h00 et se termine au plus tard à 21h00.';
    h.heure = '20:00'; h.duree = 30;
    expect(await refusMinutesTachePreavis(41, '20:00', 90)).toBe(msg);
    expect(await refusMinutesTachePreavis(41, '20:00', 60)).toBeNull();
    expect(await refusMinutesTachePreavis(41, '20:00', 30)).toBeNull();
    h.heure = '09:53'; h.duree = 60;
    expect(await refusMinutesTachePreavis(41, '09:53', 30)).toBeNull();
  });
});
