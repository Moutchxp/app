import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interneADate, remunerationADate, type Apporteur } from './suivi';
import { collegueDeLigne, commissionApporteurDe, commissionCollegueSignatureDe, totauxApporteurs, type ActiviteCalcul } from './tableauBord';
import { nomCorrespond } from './apporteursInternes';

/**
 * 🔴 Arno (24/10/2026, migration 422) — « PASSER EN INTERNE » : à compter du jour du passage, le rattachement et la rémunération du
 * collègue prennent fin ; les dossiers DÉJÀ SIGNÉS gardent leur calcul. La règle écrite (`passerEnInterne`, partagée par le bouton et
 * le script) : refus d'un compte déjà lié, journal complet (avant / après, compte, session, écran). Base simulée, données fictives.
 */
const { appels, etat } = vi.hoisted(() => ({ appels: [] as { sql: string; params: unknown[] }[], etat: { avec422: true, lie: false, interne: false } }));
const q = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  appels.push({ sql: s, params });
  if (s.includes('gestion_journal_entite_chk')) return { rows: [{ def: "CHECK ((entite = ANY (ARRAY['location_apporteur'::text])))" }], rowCount: 1 };
  if (s.startsWith('SELECT nom, type, compte_id::text')) return { rows: [{ nom: 'Léa Fictive', type: 'partenaire', compte_id: etat.interne ? '2' : null, archive: false }], rowCount: 1 };
  if (s.startsWith('SELECT id::text, prenom, nom, identifiant FROM admin_utilisateur')) return { rows: [{ id: '5', prenom: 'Léa', nom: 'FICTIVE', identifiant: 'lea@exemple.fr' }], rowCount: 1 };
  if (s.startsWith('SELECT nom FROM gestion_location_apporteur WHERE compte_id')) return { rows: etat.lie ? [{ nom: 'Autre Apporteur' }] : [], rowCount: 0 };
  if (s.startsWith('SELECT collegue_libelle')) return { rows: [{ collegue_libelle: 'Paul Collègue' }], rowCount: 1 };
  if (s.startsWith('SELECT id::text, depuis::text, remunere')) return { rows: [{ id: '1', depuis: '2021-01-01', remunere: true, mode: 'one_shot', taux: '0.03', taux_gestion: '0', duree_annees: null, toujours: false }], rowCount: 1 };
  if (s.startsWith('UPDATE')) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});
vi.mock('../../db/client', () => ({ query: q }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'interne_depuis' ? etat.avec422 : true) }));
const { passerEnInterne } = await import('./passageInterne');
const { avecTrace } = await import('../../gestion/traceJournal');
const ecrit = () => appels.filter((a) => /^(INSERT|UPDATE|DELETE)/.test(a.sql));
beforeEach(() => { appels.length = 0; Object.assign(etat, { avec422: true, lie: false, interne: false }); });
const O = { apporteurId: 4, compteId: 5, jour: '2026-10-24', raison: 'bouton « Passer en interne » de la fiche', auteur: { id: 2, libelle: 'Arnaud Jorel' } };

describe('🔴 les dossiers déjà signés gardent leur calcul', () => {
  const d = (date: string): ActiviteCalcul => ({ id: date, type: 'bail', dateSignature: date, libelleProprietaire: 'P', libelleLocataire: 'L', honoProprietaireHt: 1000, honoLocataireHt: 0,
    primeSaisie: null, mandatGestion: false, categoriePrime: 'logement', apporteurId: 4, apporteurNom: 'Léa Fictive', apporteurTaux: null, commissionSaisie: null, negociateurId: 1,
    negociateurLibelle: 'JB', avecGestion: false, origineProprietaire: 'nouveau', origineLocataire: 'nouveau', loyerHc: null, charges: null, assurance: null, parking: false,
    vacanceJours: null, rattachement: 'rattache', origineContact: 'apporteur' });
  const externe: Apporteur = { id: 4, nom: 'Léa Fictive', type: 'partenaire', archive: false, compteId: null, baremes: [{ depuis: '2020-01-01', taux: 0.1 }],
    collegues: [{ depuis: '0001-01-01', collegueId: 7, collegueLibelle: 'Paul Collègue' }],
    remunerations: [{ depuis: '2021-01-01', remunere: true, mode: 'one_shot', taux: 0.03, tauxGestion: 0, dureeAnnees: null }] };
  const passe: Apporteur = { ...externe, type: 'collaborateur', compteId: 5, interneDepuis: '2026-10-24' };
  it('avant le passage : collègue et rémunération du collègue inchangés ; à partir du jour : clos (ses dossiers sont les siens)', () => {
    expect(interneADate(passe, '2026-10-23')).toBe(false);
    expect(interneADate(passe, '2026-10-24')).toBe(true);
    for (const date of ['2025-03-01', '2026-10-23']) {
      expect(commissionCollegueSignatureDe(d(date), [passe])).toBe(commissionCollegueSignatureDe(d(date), [externe]));
      expect(collegueDeLigne(d(date), [passe])).toEqual(collegueDeLigne(d(date), [externe]));
      expect(commissionApporteurDe(d(date), [passe])).toBe(commissionApporteurDe(d(date), [externe]));
    }
    expect(commissionCollegueSignatureDe(d('2025-03-01'), [passe])).toBeCloseTo(30, 10);
    expect(commissionCollegueSignatureDe(d('2026-10-24'), [passe])).toBe(0);
    expect(remunerationADate(passe, '2026-11-01')).toBeNull();
    expect(collegueDeLigne(d('2026-11-01'), [passe])).toEqual({ cle: 'id:5', libelle: 'Léa Fictive' });
    // Les totaux de l'annuaire, sur les dossiers d'avant : identiques.
    const avant = [d('2024-01-01'), d('2025-06-01')];
    expect(totauxApporteurs(avant, [passe], '2026-10-24')).toEqual(totauxApporteurs(avant, [externe], '2026-10-24'));
  });
  it('un interne CRÉÉ interne (sans date de passage) : interne pour tous ses dossiers, comme avant', () => {
    expect(interneADate({ compteId: 5, interneDepuis: null }, '2001-01-01')).toBe(true);
  });
  it('le nom de l’apporteur et celui du compte : la règle du script (accents, casse, tirets, ordre ignorés)', () => {
    expect(nomCorrespond('Jean Baptiste Pons', { prenom: 'Jean-Baptiste', nom: 'PONS' })).toBe(true);
    expect(nomCorrespond('PONS Jean-Baptiste', { prenom: 'Jean-Baptiste', nom: 'PONS' })).toBe(true);
    expect(nomCorrespond('Léa Fictive', { prenom: 'Marie', nom: 'Interne' })).toBe(false);
  });
});

describe('🔴 la règle écrite (bouton et script)', () => {
  it('interne le jour même (compte, type, date) ; journal avant → après avec compte, session, écran', async () => {
    const r = await avecTrace({ sessionId: 'jti-fictif', ecran: 'Annuaire des apporteurs' }, () => passerEnInterne(q as never, O));
    expect(r).toEqual({ etat: 'ok', avant: 'externe (partenaire), rattaché à Paul Collègue, rémunération : One shot — location 3 %, gestion 0 %',
      apres: 'interne — compte n° 5 Léa FICTIVE, depuis le 24/10/2026' });
    const u = ecrit().filter((a) => a.sql.startsWith('UPDATE'));
    expect(u).toHaveLength(1);
    expect(u[0].sql).toContain("compte_id = $2, type = 'collaborateur', interne_depuis = $3");
    expect(u[0].params).toEqual([4, 5, '2026-10-24', 'Arnaud Jorel']);
    // Rien n'est effacé : ni rattachement, ni rémunération (l'historique est conservé).
    expect(ecrit().some((a) => /DELETE|gestion_location_apporteur_collegue|gestion_location_apporteur_remuneration/.test(a.sql.split(' (')[0]))).toBe(false);
    const j = ecrit().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.sql).toContain('sujet, champ, session_id, ecran');
    expect(j.params).toEqual([4, r.etat === 'ok' ? r.avant : '', r.etat === 'ok' ? r.apres : '',
      'Apporteur « Léa Fictive » passé en interne (bouton « Passer en interne » de la fiche) : rattachement et rémunération du collègue clos à compter du 24/10/2026 ; dossiers déjà signés inchangés',
      2, 'Arnaud Jorel', 'apporteur', 'Type d’apporteur', 'jti-fictif', 'Annuaire des apporteurs']);
  });
  it('un compte déjà lié à un autre apporteur : refusé, rien n’est écrit', async () => {
    etat.lie = true;
    expect(await passerEnInterne(q as never, O)).toEqual({ etat: 'refus', motif: 'Ce compte est déjà l’apporteur interne « Autre Apporteur ».' });
    expect(ecrit()).toEqual([]);
  });
  it('déjà interne : refusé ; sans la 422 : refusé (le calcul des dossiers passés ne serait pas gardé) — rien n’est écrit', async () => {
    etat.interne = true;
    expect((await passerEnInterne(q as never, O)).etat).toBe('refus');
    etat.interne = false; etat.avec422 = false;
    expect((await passerEnInterne(q as never, O)).etat).toBe('indisponible');
    expect(ecrit()).toEqual([]);
  });
});
