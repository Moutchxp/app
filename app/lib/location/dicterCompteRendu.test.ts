import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (15/11/2026) — LA DICTÉE : transcrite (Mistral), RIEN n'est déposé ni écrit ; bornée à un bail existant ; mêmes contrôles qu'un vocal. */
const ecritures: string[] = []; const depots: unknown[] = [];
let bail: unknown = { lotId: 7 };
vi.mock('../db/client', () => ({ query: async (sql: string) => { ecritures.push(sql); return { rows: [] }; } }));
vi.mock('../stockage', () => ({ deposerPieceSortie: async (...a: unknown[]) => { depots.push(a); return { depose: true }; }, recuperer: async () => Buffer.from('') }));
vi.mock('./sortieLocatairesRepo', () => ({ lireBail: async () => bail }));
vi.mock('./piecesSortieRepo', () => ({ MOTIF_SANS_468: 'sans 468', piecesSortieDisponibles: async () => true }));
const { dicterCompteRendu } = await import('./vocauxCompteRenduRepo');

const AUDIO = Buffer.from([1, 2, 3, 4]).toString('base64');
beforeEach(() => { ecritures.length = 0; depots.length = 0; bail = { lotId: 7 }; });

describe('dicterCompteRendu', () => {
  it('transcrit et rend le texte ; AUCUN dépôt, AUCUNE écriture en base', async () => {
    const transcrire = vi.fn(async () => ({ ok: true as const, texte: 'Cuisine propre' }));
    expect(await dicterCompteRendu({ occupationIds: [11], donnees: AUDIO, typeMime: 'audio/mp4' }, { transcrire })).toEqual({ etat: 'ok', data: { ok: true, texte: 'Cuisine propre' } });
    expect(transcrire).toHaveBeenCalledWith(expect.any(Uint8Array), 'audio/mp4', 'Vocal-1.m4a');
    expect(depots).toEqual([]);
    expect(ecritures.filter((x) => /INSERT|UPDATE|DELETE/i.test(x))).toEqual([]);
  });
  it('refus : sans occupation, audio illisible ou d’un autre type, bail disparu — rien n’est transcrit', async () => {
    const transcrire = vi.fn();
    expect((await dicterCompteRendu({ occupationIds: [], donnees: AUDIO, typeMime: 'audio/mp4' }, { transcrire })).etat).toBe('refus');
    expect((await dicterCompteRendu({ occupationIds: [11], donnees: '***', typeMime: 'audio/mp4' }, { transcrire })).etat).toBe('refus');
    expect((await dicterCompteRendu({ occupationIds: [11], donnees: AUDIO, typeMime: 'image/png' }, { transcrire })).etat).toBe('refus');
    bail = null;
    expect((await dicterCompteRendu({ occupationIds: [11], donnees: AUDIO, typeMime: 'audio/mp4' }, { transcrire })).etat).toBe('refus');
    expect(transcrire).not.toHaveBeenCalled();
  });
});
