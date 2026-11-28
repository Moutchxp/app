import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 🔴🔴 Arno (28/11/2026, 09h56) — LA LIGNE DES LOCATAIRES d'une ligne repliée de « Locataires en préavis » : « tous les locataires avec NOM et
 * Prénom séparés par un "/", ex. "DURANT Stéphane / BERCIER Caroline / JOREL Arnaud" ». Seulement les cartes de LOCATAIRES du préavis (jamais un
 * garant ni un contact du locataire), dans l'ordre des cartes ; une fiche sans prénom séparé (société) : telle qu'elle est enregistrée.
 * Le dépôt sur une base SIMULÉE : fragments sémantiques et paramètres, jamais la forme exacte d'un SQL.
 */
const appels: string[] = [];
let lus: Record<string, unknown>[] = [];
vi.mock('../db/client', () => ({
  query: vi.fn(async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ');
    appels.push(s);
    return s.includes('FROM gestion_location_preavis p') ? { rows: lus, rowCount: lus.length } : { rows: [], rowCount: 0 };
  }),
  withTransaction: vi.fn(),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('./bailRepo', () => ({ bailDisponible: async () => true }));
vi.mock('./preavisTestSonde', () => ({ testDisponible: async () => false }));
vi.mock('./edlsRepo', () => ({ edlsDesOccupations: async () => [], edlsDisponible: async () => false }));

import { ligneDesLocataires, nomLocataireAffiche } from './nomsPreavis';
import { preavisEnCours } from './preavisRepo';

const ligne = (occ: number, nom: string, prenom: string | null) => ({
  occupation_id: String(occ), locataire_id: String(occ + 100), nom, prenom, lot_id: '7', entree: '2022-09-01', recu_le: '2026-11-02',
  date_max: '2027-02-02', adresse: '3 rue A, 75011 Paris', edl: null, bail_id: '44', test_id: null,
});

beforeEach(() => { appels.length = 0; lus = []; });

describe('ligneDesLocataires (PUR)', () => {
  it('un locataire : « NOM Prénom » (NOM en majuscules, Prénom capitalisé, accents et composés gardés)', () => {
    expect(ligneDesLocataires([{ nom: 'Durant', prenom: 'stéphane' }])).toBe('DURANT Stéphane');
    expect(nomLocataireAffiche({ nom: 'benoît', prenom: 'jean-baptiste' })).toBe('BENOÎT Jean-Baptiste');
  });
  it('deux locataires : séparés par « / »', () => {
    expect(ligneDesLocataires([{ nom: 'DURANT', prenom: 'Stéphane' }, { nom: 'BERCIER', prenom: 'Caroline' }])).toBe('DURANT Stéphane / BERCIER Caroline');
  });
  it('trois locataires : l’exemple d’Arno, dans l’ordre des cartes (aucun tri)', () => {
    expect(ligneDesLocataires([{ nom: 'DURANT', prenom: 'Stéphane' }, { nom: 'BERCIER', prenom: 'Caroline' }, { nom: 'JOREL', prenom: 'Arnaud' }]))
      .toBe('DURANT Stéphane / BERCIER Caroline / JOREL Arnaud');
  });
  it('une société ou un nom non séparé : tel qu’il est enregistré (aucune devinette)', () => {
    expect(ligneDesLocataires([{ nom: 'SCI Les Tilleuls', prenom: null }, { nom: 'ESSAIPREAVIS Paul' }, { nom: 'MARTIN', prenom: 'Léa' }]))
      .toBe('SCI Les Tilleuls / ESSAIPREAVIS Paul / MARTIN Léa');
  });
});

describe('preavisEnCours — les cartes de locataires du préavis, avec leur prénom', () => {
  it('les locataires viennent des OCCUPATIONS en préavis (jamais un garant ni un contact) ; le prénom de la fiche est lu', async () => {
    lus = [ligne(11, 'DURANT', 'Stéphane'), ligne(12, 'BERCIER', 'Caroline'), ligne(13, 'SCI Les Tilleuls', null)];
    const r = await preavisEnCours();
    expect(r.lignes).toHaveLength(1);
    expect(r.lignes[0].locataires.map((x) => [x.nom, x.prenom])).toEqual([['DURANT', 'Stéphane'], ['BERCIER', 'Caroline'], ['SCI Les Tilleuls', null]]);
    expect(ligneDesLocataires(r.lignes[0].locataires)).toBe('DURANT Stéphane / BERCIER Caroline / SCI Les Tilleuls');
    const sql = appels.find((s) => s.includes('FROM gestion_location_preavis p'))!;
    expect(sql).toContain("nullif(btrim(l.prenom), '') AS prenom");
    expect(sql).toContain('JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id');
    expect(sql).not.toMatch(/garant|gestion_annuaire_contact/);
  });
});

/* 🔴🔴 Arno (28/11/2026, 10h13) — « l'état des lieux de sortie est effectué une fois la sortie validée (étape 4 de la frise) » : sa ligne reste jusque-là ;
   ensuite la ligne ENTIÈRE quitte la liste, comme aujourd'hui (« Valider la sortie » pose la sortie de l'occupation). */
describe('preavisEnCours — sortie validée : la ligne quitte la liste', () => {
  it('seules les occupations SANS sortie sont lues ; l’alerte « Sortie à valider » tombe dès la sortie validée', async () => {
    const { alertesRdv } = await import('./triRdvPreavis');
    await preavisEnCours();
    const sql = appels.find((s) => s.includes('FROM gestion_location_preavis p'))!;
    expect(sql).toContain('o.sortie IS NULL');
    const l = { edls: { jour: '2020-02-03', heure: '11:30' } };
    expect(alertesRdv(l, '2026-11-28 10:00')).toEqual(['sortie']);
    expect(alertesRdv({ ...l, sortieValidee: true }, '2026-11-28 10:00')).toEqual([]);
  });
});
