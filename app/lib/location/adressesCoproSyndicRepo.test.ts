import { describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (28/11/2026, 13h36) — le détail des biens en gestion d'une copropriété : propriétaires, locataires EN PLACE, repères ; lecture seule. */
const sqls: string[] = [];
vi.mock('../db/client', () => ({ query: async (sql: string) => {
  const s = sql.replace(/\s+/g, ' '); sqls.push(s);
  if (s.includes('AS lot, ')) return { rows: [{ id: '1', lot: '12', batiment: 'B', etage: '3' }, { id: '2', lot: null, batiment: null, etage: null }] };
  if (s.includes('FROM gestion_annuaire_proprietaire') || s.includes('JOIN gestion_annuaire_proprietaire')) return { rows: [
    { lot_id: '1', id: '70', nom: 'Durant', prenom: 'stéphane', complet: 'DURANT Stéphane' },
    { lot_id: '1', id: '71', nom: null, prenom: null, complet: 'SCI Les Tilleuls' },
    { lot_id: '2', id: '72', nom: 'JOREL', prenom: 'Arnaud', complet: null }] };
  if (s.includes('FROM gestion_annuaire_occupation')) return { rows: [
    { lot_id: '1', id: '80', nom: 'MARTIN', prenom: 'léa', entree: '2024-01-01', sortie: null },
    { lot_id: '3', id: '81', nom: 'BERCIER', prenom: 'Paul', entree: '2024-01-01', sortie: null }, // sur l'annexe rattachée : colocataire du bien
    { lot_id: '2', id: '82', nom: 'ANCIEN', prenom: 'Bob', entree: '2020-01-01', sortie: '2026-01-01' }] }; // sorti : le bien 2 est vacant
  return { rows: [] };
} }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
import { detaillerBiensCopro } from './adressesCoproSyndicRepo';

describe('detaillerBiensCopro', () => {
  it('deux propriétaires (personne « NOM Prénom », société telle qu’enregistrée) ; colocataires sur tous les lots du bien ; sorti = vacant ; repères', async () => {
    const d = await detaillerBiensCopro([{ teteId: 1, lotIds: [1, 3] }, { teteId: 2, lotIds: [2] }], '2026-11-28');
    expect(d[1]).toEqual({ lotId: 1, lot: '12', batiment: 'B', etage: '3',
      proprietaires: [{ id: 70, nom: 'DURANT Stéphane' }, { id: 71, nom: 'SCI Les Tilleuls' }],
      locataires: [{ id: 80, nom: 'MARTIN Léa' }, { id: 81, nom: 'BERCIER Paul' }] });
    expect(d[2]).toEqual({ lotId: 2, lot: null, batiment: null, etage: null, proprietaires: [{ id: 72, nom: 'JOREL Arnaud' }], locataires: [] });
    expect(sqls.some((x) => /^\s*(INSERT|UPDATE|DELETE)/i.test(x))).toBe(false);
    expect(sqls.find((x) => x.includes('gestion_annuaire_lot_proprietaire'))).toContain('lp.jusqu_a IS NULL');
  });
  it('aucun bien : aucune lecture', async () => {
    sqls.length = 0;
    expect(await detaillerBiensCopro([], '2026-11-28')).toEqual({});
    expect(sqls).toHaveLength(0);
  });
});
