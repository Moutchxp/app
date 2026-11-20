import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 RÈGLE CONFIRMÉE PAR ARNO (20/11/2026) : « un locataire qui a un préavis validé et dont la sortie n'est pas validée reste en statut
 * préavis. Il n'en sort que lorsque sa sortie est validée, ce qui change son statut en ancien locataire et rend le logement vacant. »
 *
 * Comment l'application la tient : le préavis n'écrit JAMAIS l'occupation (statutLogement.test.ts) ; « en préavis » = une occupation SANS
 * sortie portant un préavis ouvert (`locatairesEnPreavis`), SANS aucune comparaison à la date du jour — la date maximale passée ne change
 * rien ; seule la validation de la sortie (`enregistrerSortie` → `ecrireDateSortie`) pose la date, et alors le statut devient « ancien » et
 * le logement vacant s'il n'y reste personne. L'import WIPPIMMO, lui, n'écrit plus la sortie d'une occupation en préavis
 * (importSortieAnnulee.test.ts, miseAJourWippimmo.test.ts).
 */

let lignes: { locataire_id: string; date_max: string }[];
let sqls: string[];
vi.mock('../db/client', () => ({
  query: async (sql: string) => { sqls.push(sql.replace(/\s+/g, ' ')); return { rows: lignes }; },
  withTransaction: async () => { throw new Error('aucune écriture ici'); },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./preavisTestSonde', () => ({ sqlHorsTest: async () => 'true' }));

import { locatairesEnPreavis } from './preavisEnCoursRepo';
import { statutLocataire } from '../gestion/historiqueBien';
import { issueSortie } from './sortieLocataires';

beforeEach(() => { lignes = []; sqls = []; });

describe('préavis validé, sortie non validée → reste « en préavis »', () => {
  it('AVANT la date maximale : en préavis', async () => {
    lignes = [{ locataire_id: '7', date_max: '2999-12-31' }];
    const p = await locatairesEnPreavis([7]);
    expect(p['7']).toBe('2999-12-31');
    expect(statutLocataire([{ sortie: null }], p['7'] !== undefined)).toBe('en_preavis');
  });

  it('APRÈS la date maximale, sortie toujours non validée : TOUJOURS en préavis (aucune comparaison à la date du jour)', async () => {
    lignes = [{ locataire_id: '7', date_max: '2020-01-31' }];
    const p = await locatairesEnPreavis([7]);
    expect(p['7']).toBe('2020-01-31');
    expect(statutLocataire([{ sortie: null }], p['7'] !== undefined)).toBe('en_preavis');
    const sql = sqls[0];
    expect(sql).toContain('o.sortie IS NULL');
    expect(sql).toContain('p.remplace_le IS NULL AND p.annule_le IS NULL');
    expect(sql).not.toMatch(/date_max\s*(<|>|<=|>=)|now\(\)|CURRENT_DATE|Europe\/Paris/);
  });

  it('le préavis ne pose jamais la date de sortie de l’occupation', () => {
    const src = readFileSync('app/lib/location/preavisRepo.ts', 'utf8');
    expect(src).not.toMatch(/ecrireDateSortie/);
    expect(src).not.toMatch(/UPDATE gestion_annuaire_occupation SET[^`]*?\bsortie\s*=/);
  });
});

describe('sortie VALIDÉE → ancien locataire, logement vacant', () => {
  it('la validation pose la date (seule porte) : le statut devient « ancien », plus de préavis', () => {
    const src = readFileSync('app/lib/location/sortieLocatairesRepo.ts', 'utf8');
    expect(src).toContain("ecrireDateSortie(q, ids, { mode: 'poser', date })");
    expect(statutLocataire([{ sortie: '2026-11-15' }], false)).toBe('ancien');
    // l'occupation a désormais une sortie : `locatairesEnPreavis` ne la lit plus (o.sortie IS NULL)
  });
  it('dernier occupant sorti : le logement devient vacant ; un autre occupant reste : non vacant', () => {
    const bail = { locataires: [{ occupationId: 1, locataireId: 7, nom: '_TEST PREAVIS', entree: '2024-01-01' }], autresOccupants: [] };
    expect(issueSortie(bail, [1])).toEqual({ vacant: true, restants: [] });
    expect(issueSortie({ ...bail, autresOccupants: ['AUTRE'] }, [1]).vacant).toBe(false);
  });
});
