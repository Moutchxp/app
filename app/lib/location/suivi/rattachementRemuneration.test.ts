import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026) — LE RATTACHEMENT ET LA RÉMUNÉRATION DU COLLÈGUE, UN SEUL GESTE (serveur). La réponse Oui / Non est
 * OBLIGATOIRE ; le rattachement et la version de rémunération s'écrivent dans la MÊME transaction (un refus annule tout) ; chaque
 * partie est journalisée (compte, session, écran). Base simulée : la transaction est suivie (ouverte, validée, annulée).
 */
const { etat } = vi.hoisted(() => ({ etat: {
  enTransaction: false, ecrits: [] as { sql: string; params: unknown[]; dansTransaction: boolean }[], transactions: [] as ('validee' | 'annulee')[],
  conflitRemu: false, rattache: false,
} }));
vi.mock('server-only', () => ({}));
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^(INSERT|UPDATE|DELETE)/.test(s)) etat.ecrits.push({ sql: s, params, dansTransaction: etat.enTransaction });
  if (s.includes('gestion_journal_entite_chk')) return { rows: [{ def: "CHECK ((entite = ANY (ARRAY['location_apporteur'::text])))" }], rowCount: 1 };
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: [{ libelle: 'Paul Collègue' }], rowCount: 1 };
  if (s.includes('is_nullable')) return { rows: [{ n: '1' }], rowCount: 1 };
  if (s.startsWith('SELECT id, nom, type')) return { rows: [{ id: '4', nom: 'Léa Fictive', type: 'partenaire', archive_le: null, societe: null, telephone: null, email: null,
    nom_famille: 'Fictive', prenom: 'Léa', compte_id: null, civilite: null, adresse: null, notes: null, telephones_autres: [], emails_autres: [], version: 'v1', compte_libelle: null,
    compte_identifiant: null, interne_depuis: null }], rowCount: 1 };
  if (s.startsWith('SELECT apporteur_id, depuis::text AS depuis, collegue_id, collegue_libelle')) {
    return { rows: etat.rattache ? [{ apporteur_id: '4', depuis: null, collegue_id: '2', collegue_libelle: 'Arnaud Jorel' }] : [], rowCount: 0 };
  }
  if (s.startsWith('INSERT INTO gestion_location_apporteur_remuneration')) return { rows: [], rowCount: etat.conflitRemu ? 0 : 1 };
  if (s.startsWith('INSERT')) return { rows: [], rowCount: 1 };
  return { rows: [], rowCount: 0 };
});
const withTransaction = vi.fn(async (f: (q: typeof query) => Promise<unknown>) => {
  etat.enTransaction = true;
  try { const r = await f(query); etat.transactions.push('validee'); return r; } catch (e) { etat.transactions.push('annulee'); throw e; } finally { etat.enTransaction = false; }
});
vi.mock('../../db/client', () => ({ query, withTransaction }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async () => true }));
const { enregistrerRattachement } = await import('./suiviRepo');
const { avecTrace } = await import('../../gestion/traceJournal');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const TRACE = { sessionId: 'jti-fictif', ecran: 'Annuaire des apporteurs' as const };
beforeEach(() => { Object.assign(etat, { enTransaction: false, ecrits: [], transactions: [], conflitRemu: false, rattache: false }); });

describe('🔴 (1) la question Oui / Non est obligatoire', () => {
  it('sans réponse : refusé, rien n’est écrit', async () => {
    const r = await enregistrerRattachement(4, { sorte: 'rattacher', collegueId: 5, depuis: '2026-11-01', remuneration: {} }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus', motif: expect.stringMatching(/Oui \/ Non/) });
    expect(etat.ecrits).toEqual([]);
  });
});

describe('🔴 (3) rattachement + rémunération : la MÊME transaction', () => {
  it('Oui, récurrent 3 ans : le rattachement, la version de rémunération (même date) et les deux lignes de journal — toutes dans UNE transaction', async () => {
    const r = await avecTrace(TRACE, () => enregistrerRattachement(4, { sorte: 'rattacher', collegueId: 5, depuis: '2026-11-01',
      remuneration: { remunere: true, mode: 'recurrent', taux: '5', tauxGestion: '10', dureeAnnees: '3' } }, AUTEUR));
    expect(r).toEqual({ etat: 'ok' });
    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(etat.transactions).toEqual(['validee']);
    expect(etat.ecrits.every((e) => e.dansTransaction)).toBe(true);
    expect(etat.ecrits.map((e) => e.sql.split(' (')[0])).toEqual(['INSERT INTO gestion_location_apporteur_collegue', 'INSERT INTO gestion_location_apporteur_remuneration',
      'INSERT INTO gestion_journal', 'INSERT INTO gestion_journal']);
    expect(etat.ecrits[0].params).toEqual([4, '2026-11-01', 5, 'Paul Collègue', 'Arnaud Jorel']);
    expect(etat.ecrits[1].params).toEqual([4, '2026-11-01', true, 'recurrent', 0.05, 0.1, 3, 'Arnaud Jorel']);
    expect(etat.ecrits[2].params).toEqual([4, 'location_apporteur_rattache', 'à rattacher', 'Paul Collègue depuis le 01/11/2026',
      'Collègue de rattachement : à rattacher → Paul Collègue depuis le 01/11/2026', 2, 'Arnaud Jorel', 'apporteur', 'Collègue de rattachement', 'jti-fictif', 'Annuaire des apporteurs']);
    expect(etat.ecrits[3].params.slice(1, 4)).toEqual(['location_remuneration_collegue', 'Aucune rémunération',
      'Récurrent — location 5 %, gestion 10 % / mois, pendant 3 ans (à partir du 01/11/2026)']);
  });
  it('Non : une version « Aucune rémunération » à la même date (celle d’un collègue précédent ne passe jamais au nouveau)', async () => {
    expect(await enregistrerRattachement(4, { sorte: 'rattacher', collegueId: 5, depuis: '2026-11-01', remuneration: { remunere: false } }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(etat.ecrits.find((e) => e.sql.startsWith('INSERT INTO gestion_location_apporteur_remuneration'))?.params.slice(0, 3)).toEqual([4, '2026-11-01', false]);
  });
  it('un refus dans la transaction (version de rémunération déjà à cette date) : TOUT est annulé — le rattachement aussi', async () => {
    etat.conflitRemu = true;
    const r = await enregistrerRattachement(4, { sorte: 'rattacher', collegueId: 5, depuis: '2026-11-01', remuneration: { remunere: false } }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus', motif: expect.stringMatching(/existe déjà à cette date/) });
    expect(etat.transactions).toEqual(['annulee']);
  });
  it('« Modifier la rémunération » : le collègue actuel garde son rattachement ; seule une version (date ou « depuis toujours »)', async () => {
    etat.rattache = true;
    expect(await enregistrerRattachement(4, { sorte: 'remuneration', remuneration: { remunere: true, mode: 'one_shot', taux: '3', tauxGestion: '0', depuis: '2026-12-01' } }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(etat.ecrits.some((e) => e.sql.startsWith('INSERT INTO gestion_location_apporteur_collegue'))).toBe(false);
    expect(etat.ecrits.find((e) => e.sql.startsWith('INSERT INTO gestion_location_apporteur_remuneration'))?.params.slice(0, 5)).toEqual([4, '2026-12-01', true, 'one_shot', 0.03]);
    etat.rattache = false;
    expect((await enregistrerRattachement(4, { sorte: 'remuneration', remuneration: { remunere: false, depuis: '2026-12-01' } }, AUTEUR)).etat).toBe('refus');
  });
});
