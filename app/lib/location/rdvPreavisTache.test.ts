import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (18/11/2026) — le serveur : la limite des minutes seulement pour un rendez-vous de préavis, et seulement si l'heure CHANGE. Base simulée. */
const h = vi.hoisted(() => ({ preavis: new Set<number>([41]), heure: '09:53' as string | null }));
vi.mock('../db/client', () => ({
  query: async (sql: string, p: unknown[] = []) => {
    if (sql.includes('to_regclass')) return { rows: [{ p: true, e: true }] };
    if (sql.includes('FROM gestion_location_previsite WHERE tache_id')) return { rows: (p[0] as number[]).filter((x) => h.preavis.has(x)).map((x) => ({ tache_id: String(x) })) };
    if (sql.includes('FROM gestion_tache WHERE id')) return { rows: [{ heure: h.heure }] };
    return { rows: [] };
  },
}));
vi.mock('./minutesRdvRepo', () => ({ minutesRdvAutorisees: async () => [0, 15, 30, 45] }));
import { refusMinutesTachePreavis, tachesRdvPreavis } from './rdvPreavisTache';

beforeEach(() => { h.heure = '09:53'; });
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
