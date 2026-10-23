import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collegueADate, depuisLibelle, DEPUIS_TOUJOURS, type Apporteur } from './suivi';
import { apporteursEtCollegues, type ActiviteCalcul } from './tableauBord';

const { appels } = vi.hoisted(() => ({ appels: [] as { sql: string; params: unknown[] }[] }));

/**
 * 🔴 Arno (23/10/2026, 409) — un apporteur rattaché à son collègue « DEPUIS TOUJOURS » : toutes ses affaires, l'historique importé
 * (2019 → 2026) compris, vont à ce collègue ; un rattachement DATÉ ultérieur prend le relais à sa date. Et la liste des collègues :
 * TOUS les comptes actifs, triés par nom.
 */
const apporteur = (collegues: Apporteur['collegues']): Apporteur => ({ id: 9, nom: 'Apporteur A', type: 'partenaire', archive: false, baremes: [], collegues });
const ligne = (id: string, date: string, ca: number): ActiviteCalcul => ({
  id, type: 'bail', dateSignature: date, dateSupposee: true, libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: ca, honoLocataireHt: 0,
  primeSaisie: 0, mandatGestion: false, categoriePrime: null, apporteurId: 9, apporteurNom: 'Apporteur A', apporteurTaux: 0.1, commissionSaisie: ca / 10,
  negociateurId: 5, negociateurLibelle: 'N', avecGestion: false, origineProprietaire: null, origineLocataire: null, loyerHc: null, charges: null, assurance: null,
  parking: false, vacanceJours: null, rattachement: 'non_rattache', origineContact: 'apporteur', collegueId: null, collegueLibelle: null, primeMode: 'aucune',
});

describe('🔴 Rattachement « depuis toujours »', () => {
  const toujours = { depuis: DEPUIS_TOUJOURS, collegueId: 2, collegueLibelle: 'Arnaud Jorel' };
  it('couvre tout l’historique (2019 comme 2026) ; un rattachement daté prend le relais à sa date', () => {
    const seul = apporteur([toujours]);
    expect(collegueADate(seul, '2019-11-01')?.collegueLibelle).toBe('Arnaud Jorel');
    expect(collegueADate(seul, '2030-01-01')?.collegueLibelle).toBe('Arnaud Jorel');
    const relais = apporteur([toujours, { depuis: '2026-07-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste PONS' }]);
    expect(collegueADate(relais, '2021-03-01')?.collegueLibelle).toBe('Arnaud Jorel');
    expect(collegueADate(relais, '2026-06-30')?.collegueLibelle).toBe('Arnaud Jorel');
    expect(collegueADate(relais, '2026-07-01')?.collegueLibelle).toBe('Jean-Baptiste PONS');
  });
  it('le cumul par collègue en tient compte sur toutes les années', () => {
    const a = apporteur([toujours, { depuis: '2026-07-01', collegueId: 5, collegueLibelle: 'Jean-Baptiste PONS' }]);
    const r = apporteursEtCollegues([ligne('x', '2020-06-01', 1000), ligne('y', '2023-02-01', 500), ligne('z', '2026-09-01', 200)], [a]);
    expect(r.collegues.map((c) => [c.libelle, c.nb, c.ca])).toEqual([['Arnaud Jorel', 2, 1500], ['Jean-Baptiste PONS', 1, 200]]);
  });
  it('se lit « depuis toujours » ; une date se lit « depuis le JJ/MM/AAAA »', () => {
    expect(`Rattaché à Arnaud Jorel ${depuisLibelle(toujours)}`).toBe('Rattaché à Arnaud Jorel depuis toujours');
    expect(depuisLibelle({ depuis: '2026-07-01' })).toBe('depuis le 01/07/2026');
  });
});

describe('🔴 La liste des collègues : TOUS les comptes (administrateurs compris), triés par nom ; les désactivés marqués', () => {
  vi.mock('server-only', () => ({}));
  vi.mock('../../db/client', () => ({
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      appels.push({ sql: sql.replace(/\s+/g, ' '), params });
      if (sql.includes('information_schema')) return { rows: [{ n: '1' }] };
      return { rows: [{ id: '7', libelle: 'Alice Martin', actif: true }, { id: '3', libelle: 'Ancien Compte', actif: false }] };
    }),
    withTransaction: vi.fn(),
  }));
  vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
  beforeEach(() => { appels.length = 0; });
  it('aucune condition de rôle ni de droit : tous les comptes, les désactivés marqués `actif: false` (la liste les écarte) ; tri par nom', async () => {
    const { lireCollegues } = await import('./suiviRepo');
    expect(await lireCollegues()).toEqual([{ id: 7, libelle: 'Alice Martin', actif: true }, { id: 3, libelle: 'Ancien Compte', actif: false }]);
    const sql = appels.at(-1)!.sql;
    // Arno (24/10/2026) — Cédric Jullien, administrateur, absent : AUCUN filtre sur le rôle ni sur les droits, ni sur `actif`
    // (le désactivé est rendu marqué, pour qu'un choix déjà fait reste lisible).
    expect(sql).toContain('FROM admin_utilisateur u ORDER BY');
    expect(sql).not.toContain('WHERE');
    expect(sql).not.toContain('perm_');
    expect(sql).not.toContain('role');
    expect(sql).toContain('ORDER BY lower(coalesce(nullif(btrim(u.nom)');
  });
});
