import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lot 1 — SOCLE DONNÉES : la charge utile de la carte porte désormais le `canal` (rail) de chaque commune, joint depuis mairie_contact et
//   renvoyé BRUT (le mapping vers le rail est fait côté client par processDeCanal, source unique). On teste le COMPORTEMENT (mapping des lignes),
//   jamais la forme du SQL. `query` est mocké (aucune base).
vi.mock('../db/client', () => ({ query: vi.fn() }));
import { query } from '../db/client';
import { lireCarteCommunes } from './carteRepo';

const q = query as unknown as ReturnType<typeof vi.fn>;
const POLY = '{"type":"Polygon","coordinates":[[[0,0],[10,0],[10,10],[0,10],[0,0]]]}';
beforeEach(() => q.mockReset());

describe('lireCarteCommunes — le canal (rail) de chaque commune est renvoyé', () => {
  it('mappe le canal BRUT par commune (email / formulaire / null) et préserve la géométrie + la bbox', async () => {
    q.mockResolvedValueOnce({ rows: [
      { code: '75056', nom: 'Paris', dep: '75', gj: POLY, canal: 'email' },
      { code: '92050', nom: 'Suresnes', dep: '92', gj: POLY, canal: 'formulaire' },
      { code: '92064', nom: 'Sans contact', dep: '92', gj: POLY, canal: null },
    ] });
    q.mockResolvedValueOnce({ rows: [{ xmin: 0, ymin: 0, xmax: 10, ymax: 10 }] });

    const { communes, bbox } = await lireCarteCommunes();
    expect(communes.map((c) => [c.code, c.canal])).toEqual([
      ['75056', 'email'], ['92050', 'formulaire'], ['92064', null],
    ]);
    expect(communes[0].anneaux.length).toBeGreaterThan(0); // la géométrie (anneaux) reste servie
    expect(bbox).toEqual([0, 0, 10, 10]);
  });

  it('canal absent de la ligne → null (jamais undefined)', async () => {
    q.mockResolvedValueOnce({ rows: [{ code: '75056', nom: 'Paris', dep: '75', gj: POLY }] }); // pas de champ canal
    q.mockResolvedValueOnce({ rows: [{ xmin: 0, ymin: 0, xmax: 1, ymax: 1 }] });
    const { communes } = await lireCarteCommunes();
    expect(communes[0].canal).toBeNull();
  });
});
