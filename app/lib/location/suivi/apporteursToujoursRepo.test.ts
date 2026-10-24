import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026, migration 420) — « DEPUIS TOUJOURS », AU SERVEUR : une NOUVELLE version (marquée, datée du jour) — aucune
 * version d'avant n'est modifiée ni effacée — et une ligne de journal par geste : ce qui est remplacé → ce qui est posé, avec le compte,
 * la session et l'écran. Sans la 420 : refusé, rien n'est écrit. Base simulée.
 */
const { appels, etat } = vi.hoisted(() => ({ appels: [] as { sql: string; params: unknown[] }[], etat: { avec420: true } }));
vi.mock('server-only', () => ({}));
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  appels.push({ sql: s, params });
  if (s.includes('AS externe')) return { rows: [{ externe: true, rattache: true }], rowCount: 1 };
  if (s.includes('compte_id IS NOT NULL AS interne')) return { rows: [{ interne: false }], rowCount: 1 };
  if (s.includes('gestion_journal_entite_chk')) return { rows: [{ def: "CHECK ((entite = ANY (ARRAY['location_apporteur'::text, 'annuaire'::text])))" }], rowCount: 1 };
  if (s.startsWith('SELECT id, nom, type')) return { rows: [{ id: '12', nom: 'Michel Cohen', type: 'partenaire', archive_le: null, societe: null, telephone: null, email: null, nom_famille: null, prenom: null, compte_id: null }], rowCount: 1 };
  if (s.startsWith('SELECT id, apporteur_id, depuis, taux,')) return { rows: [{ id: '1', apporteur_id: '12', depuis: '2021-01-01', taux: '0.5', mode: 'one_shot', taux_gestion: '0', duree_annees: null, toujours: false }], rowCount: 1 };
  if (s.startsWith('SELECT id, apporteur_id, depuis, remunere')) return { rows: [], rowCount: 0 };
  return { rows: [], rowCount: 1 };
});
vi.mock('../../db/client', () => ({ query, withTransaction: async (f: (q: typeof query) => unknown) => f(query) }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'toujours' ? etat.avec420 : true) }));
const { ajouterBaremeApporteur, ajouterRemunerationCollegue } = await import('./suiviRepo');
const { avecTrace } = await import('../../gestion/traceJournal');
const { aujourdhuiParis } = await import('./suivi');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const TRACE = { sessionId: 'jti-fictif', ecran: 'Annuaire des apporteurs' as const };
const ecrit = () => appels.filter((a) => /^(INSERT|UPDATE|DELETE)/.test(a.sql));
beforeEach(() => { appels.length = 0; etat.avec420 = true; });

describe('🔴 « Depuis toujours » au serveur', () => {
  it('la règle : une nouvelle version marquée, datée du jour ; AUCUNE version d’avant touchée ; journal avec compte, session, écran', async () => {
    expect(await avecTrace(TRACE, () => ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '20', depuis: '2000-01-01', toujours: true }, AUTEUR))).toEqual({ etat: 'ok' });
    expect(ecrit().some((a) => a.sql.startsWith('UPDATE') || a.sql.startsWith('DELETE'))).toBe(false);
    const ins = ecrit().find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_bareme'))!;
    expect(ins.sql).toContain('toujours) SELECT $1, $2, $3, $4, $5, $6, $7, $8, true');
    expect(ins.params.slice(0, 3)).toEqual([12, aujourdhuiParis(), 0.2]);
    const j = ecrit().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.sql).toContain('sujet, champ, session_id, ecran');
    expect(j.params).toEqual([12, 'location_apporteur_regle_depuis_toujours', 'One shot — location 50 %, gestion 0 %', 'One shot — location 20 %, gestion 0 %',
      'Règle de l’apporteur remplacé(e) depuis toujours : One shot — location 50 %, gestion 0 % → One shot — location 20 %, gestion 0 % (versions précédentes conservées)',
      2, 'Arnaud Jorel', 'apporteur', 'Règle de l’apporteur', 'jti-fictif', 'Annuaire des apporteurs']);
  });
  it('la rémunération du collègue : idem (« Aucune rémunération » → la nouvelle), journalisée', async () => {
    expect(await avecTrace(TRACE, () => ajouterRemunerationCollegue(12, { remunere: true, mode: 'one_shot', taux: '5', depuis: '2000-01-01', toujours: true }, AUTEUR))).toEqual({ etat: 'ok' });
    const ins = ecrit().find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_remuneration'))!;
    expect(ins.sql).toContain('VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)');
    expect(ins.params[1]).toBe(aujourdhuiParis());
    expect(ecrit().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!.params.slice(1, 4))
      .toEqual(['location_remuneration_collegue_depuis_toujours', 'Aucune rémunération', 'One shot — location 5 %, gestion 0 %']);
  });
  it('sans la 420 : refusé, rien n’est écrit ; une version datée ordinaire s’écrit comme avant (sans journal)', async () => {
    etat.avec420 = false;
    expect((await ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '20', depuis: '2000-01-01', toujours: true }, AUTEUR)).etat).toBe('indisponible');
    expect(ecrit()).toEqual([]);
    expect(await ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '20', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(ecrit().map((a) => a.sql.slice(0, 50))).toEqual(['INSERT INTO gestion_location_apporteur_bareme (app']);
  });
});
