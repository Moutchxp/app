import { describe, expect, it } from 'vitest';
import {
  dateQuiCompte, heureDe, joursOuverts, motCloture, motOuverture, motPeriode, motReouvertures, nbReouvertures, ordreHistorique,
} from './historiqueEvenements';
import { tableauBordEvenements, tempsOuvertJusqua, type FaitsEvenement } from './tableauBordEvenements';
import { sqlPeriodes } from './etatParLaFrise';
import { readFileSync } from 'node:fs';

/**
 * 🔴 Arno (23/10/2026) — clôture, Historique des événements, réouverture par périodes. PUR : les périodes se lisent sur les cartes
 * de borne (aucune table) ; un événement rouvert compte à la date de sa réouverture ; les durées se calculent période par période.
 */
const P1 = { du: '2026-03-01T09:00:00+01:00', au: '2026-04-02T12:00:00+02:00', ouvertLe: '2026-03-01T09:00:00+01:00', ouvertPar: 'arno@x.test',
  ouvertSource: 'evenement', closLe: '2026-04-02T17:24:00+02:00', closPar: null, closSource: 'monga' };
const P2 = { du: '2026-06-05T12:00:00+02:00', au: null, ouvertLe: '2026-06-05T08:10:00+02:00', ouvertPar: 'lea@x.test', ouvertSource: 'manuelle' };

describe('🔴 les périodes, en mots', () => {
  it('du … au … ; depuis le … pour la période en cours ; qui a clos, et à quelle heure (Paris)', () => {
    expect(motPeriode(P1)).toBe('du 01/03/2026 au 02/04/2026');
    expect(motPeriode(P2)).toBe('depuis le 05/06/2026');
    expect(motCloture(P1)).toBe('clos le 02/04/2026 à 17:24 par Monga');
    expect(motCloture(P2)).toBeNull();
    expect(motOuverture(P1, true)).toBe('ouvert le 01/03/2026 à 09:00 par arno@x.test');
    expect(motOuverture(P2, false)).toBe('rouvert le 05/06/2026 à 08:10 par lea@x.test');
    expect(heureDe('2026-01-15T23:30:00Z')).toBe('00:30');   // l'heure de Paris, jamais celle de la machine
  });
  it('les réouvertures : une période de plus = une réouverture', () => {
    expect(nbReouvertures([P1])).toBe(0);
    expect(nbReouvertures([P1, P2])).toBe(1);
    expect(motReouvertures(0)).toBe('jamais rouvert');
    expect(motReouvertures(3)).toBe('3 réouvertures');
  });
  it('l’Historique : les CLOS seulement, du plus récemment clos au plus ancien', () => {
    const l = ordreHistorique([
      { id: 1, clos: true, closLe: '2026-04-02T12:00:00+02:00' }, { id: 2, clos: false, closLe: null }, { id: 3, clos: true, closLe: '2026-07-01T12:00:00+02:00' },
    ]);
    expect(l.map((e) => e.id)).toEqual([3, 1]);
  });
});

describe('🔴 « un événement rouvert compte à la date de sa réouverture » ; les durées, période par période', () => {
  it('la date qui compte : le début de la DERNIÈRE période', () => {
    expect(dateQuiCompte([P1, P2])).toBe(P2.du);
    expect(dateQuiCompte([P1])).toBe(P1.du);
    expect(dateQuiCompte([])).toBeNull();
  });
  it('la durée ouverte ne compte pas l’intervalle fermé', () => {
    const a = { du: '2026-01-01T00:00:00Z', au: '2026-01-11T00:00:00Z' };
    const b = { du: '2026-02-01T00:00:00Z', au: null };
    expect(joursOuverts([a, b], '2026-02-06T00:00:00Z')).toBe(15);   // 10 + 5, pas 36
    expect(tempsOuvertJusqua([{ evenementId: 1, ...a }, { evenementId: 1, ...b }], '2026-02-06T00:00:00Z')).toBe(15);
    expect(tempsOuvertJusqua([{ evenementId: 1, ...a }], '2025-12-31T00:00:00Z')).toBeNull();   // jalon avant l'ouverture : écarté
  });
  it('le tableau de bord : le délai de clôture d’un événement rouvert ne compte que ses périodes ouvertes', () => {
    const fait: FaitsEvenement = { id: 9, type: null, urgence: null, ouvert: false, ouvertureLe: '2026-02-01T00:00:00Z', clotureLe: '2026-02-06T00:00:00Z',
      premierDevisLe: null, acceptationLe: null, interventionLe: null, montantAttenteCents: 0, montantAccepteCents: 0, nbDevisEnAttente: 0,
      nbDevisAcceptes: 0, nbDevisRefuses: 0, nbReouvertures: 1, derniereActiviteLe: null, avecMonga: false, avecBien: true };
    const tb = tableauBordEvenements([fait], [
      { evenementId: 9, du: '2026-01-01T00:00:00Z', au: '2026-01-11T00:00:00Z' }, { evenementId: 9, du: '2026-02-01T00:00:00Z', au: '2026-02-06T00:00:00Z' },
    ], new Date('2026-02-20T12:00:00Z'));
    expect(tb.delais.global.cloture).toEqual({ n: 1, moyenneJours: 15, medianeJours: 15 });
    // Compté UNE fois, au mois de sa réouverture : février, jamais janvier.
    const mois = Object.fromEntries(tb.flux.map((m) => [m.mois, m.ouverts]));
    expect(mois['2026-01']).toBe(0);
    expect(mois['2026-02']).toBe(1);
  });
});

describe('🔴 les données : aucune table, les périodes et leurs auteurs se lisent sur les cartes de borne', () => {
  it('le pli rend la carte qui ouvre et celle qui ferme chaque période (heure et auteur du geste)', () => {
    const sql = sqlPeriodes('SELECT * FROM (VALUES (now(), \'ouvre\', 0, 0)) v(quand, sens, rang, carte)').replace(/\s+/g, ' ');
    expect(sql).toContain("(array_agg(carte ORDER BY quand, rang, carte) FILTER (WHERE sens = 'ouvre'))[1] AS carte_du");
    expect(sql).toContain("(array_agg(carte ORDER BY quand, rang, carte) FILTER (WHERE sens = 'ferme'))[1] AS carte_au");
    expect(sql).not.toMatch(/[À-ÿ]/);
  });
  it('la fiche du bien lit le type et les périodes (qui, quand) ; le tableau de bord compte à la dernière ouverture', () => {
    const repo = readFileSync('app/lib/gestion/mongaEtapeRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(repo).toContain("'closLe', svv_fa.cree_le, 'closPar', svv_fa.cree_par_libelle");
    expect(repo).toContain('e.ouvert_par_libelle');
    const tb = readFileSync('app/lib/gestion/tableauBordRepo.ts', 'utf8').replace(/\s+/g, ' ');
    expect(tb).toContain("(SELECT max(svv_p.du) FROM (${sqlPeriodesDeLEvenement('e')}) svv_p) AS ouverture_le");
    // Aucune migration pour ce lot : rien n'est ajouté au schéma.
    expect(readFileSync('app/lib/gestion/historiqueEvenements.ts', 'utf8')).toContain('Aucune table, aucune migration');
  });
});
