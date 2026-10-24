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
  if (s.startsWith('SELECT id, apporteur_id, depuis::text AS depuis, taux,')) return { rows: [{ id: '1', apporteur_id: '12', depuis: '2021-01-01', taux: '0.5', mode: 'one_shot', taux_gestion: '0', duree_annees: null, toujours: false }], rowCount: 1 };
  if (s.startsWith('SELECT id, apporteur_id, depuis::text AS depuis, remunere')) return { rows: [], rowCount: 0 };
  return { rows: [], rowCount: 1 };
});
vi.mock('../../db/client', () => ({ query, withTransaction: async (f: (q: typeof query) => unknown) => f(query) }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'toujours' ? etat.avec420 : true) }));
const { ajouterBaremeApporteur, ajouterRemunerationCollegue } = await import('./suiviRepo');
const { avecTrace } = await import('../../gestion/traceJournal');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const TRACE = { sessionId: 'jti-fictif', ecran: 'Annuaire des apporteurs' as const };
const ecrit = () => appels.filter((a) => /^(INSERT|UPDATE|DELETE)/.test(a.sql));
beforeEach(() => { appels.length = 0; etat.avec420 = true; });

describe('🔴 « Depuis toujours » au serveur', () => {
  it('la règle : une nouvelle version marquée, datée du jour ; AUCUNE version d’avant touchée ; journal avec compte, session, écran', async () => {
    expect(await avecTrace(TRACE, () => ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '20', tauxGestion: '0', depuis: '2000-01-01', toujours: true }, AUTEUR))).toEqual({ etat: 'ok' });
    expect(ecrit().some((a) => a.sql.startsWith('UPDATE') || a.sql.startsWith('DELETE'))).toBe(false);
    const ins = ecrit().find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_bareme'))!;
    // 🔴 Arno (24/10/2026) — une clé de date hors calendrier utile (an 1), jamais la date du jour : une version déjà datée du jour ne la bloque plus.
    expect(ins.sql.replace(/\s+/g, ' ')).toContain("toujours) SELECT $1, (SELECT DATE '0001-01-01' + count(*)::int FROM gestion_location_apporteur_bareme WHERE apporteur_id = $1 AND toujours), $2, $3, $4, $5, $6, $7, true");
    expect(ins.params.slice(0, 2)).toEqual([12, 0.2]);
    const j = ecrit().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.sql).toContain('sujet, champ, session_id, ecran');
    expect(j.params).toEqual([12, 'location_apporteur_regle_depuis_toujours', 'One shot — location 50 %, gestion 0 %', 'One shot — location 20 %, gestion 0 %',
      'Règle de l’apporteur remplacé(e) depuis toujours : One shot — location 50 %, gestion 0 % → One shot — location 20 %, gestion 0 % (versions précédentes conservées)',
      2, 'Arnaud Jorel', 'apporteur', 'Règle de l’apporteur', 'jti-fictif', 'Annuaire des apporteurs']);
  });
  it('la rémunération du collègue : idem (« Aucune rémunération » → la nouvelle), journalisée', async () => {
    expect(await avecTrace(TRACE, () => ajouterRemunerationCollegue(12, { remunere: true, mode: 'one_shot', taux: '5', tauxGestion: '0', depuis: '2000-01-01', toujours: true }, AUTEUR))).toEqual({ etat: 'ok' });
    const ins = ecrit().find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_remuneration'))!;
    expect(ins.sql.replace(/\s+/g, ' ')).toContain("SELECT $1, (SELECT DATE '0001-01-01' + count(*)::int FROM gestion_location_apporteur_remuneration WHERE apporteur_id = $1 AND toujours), $2,");
    expect(ins.params.slice(0, 3)).toEqual([12, true, 'one_shot']);
    expect(ecrit().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!.params.slice(1, 4))
      .toEqual(['location_remuneration_collegue_depuis_toujours', 'Aucune rémunération', 'One shot — location 5 %, gestion 0 %']);
  });
  it('🔴 0 % / 0 % « depuis toujours » : accepté et écrit (0, jamais lu comme vide) ; un champ VIDE : refusé, rien n’est écrit', async () => {
    expect(await avecTrace(TRACE, () => ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '0', tauxGestion: '0', depuis: '2000-01-01', toujours: true }, AUTEUR))).toEqual({ etat: 'ok' });
    const ins = ecrit().find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_bareme'))!;
    expect(ins.params).toEqual([12, 0, 0, 'Arnaud Jorel', 'one_shot', 0, null]);
    expect(ecrit().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!.params.slice(1, 4))
      .toEqual(['location_apporteur_regle_depuis_toujours', 'One shot — location 50 %, gestion 0 %', 'One shot — location 0 %, gestion 0 %']);
    appels.length = 0;
    expect(await ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '0', tauxGestion: '', depuis: '2000-01-01', toujours: true }, AUTEUR))
      .toEqual({ etat: 'refus', motif: 'Taux sur la gestion : saisissez un pourcentage (0 est accepté).' });
    expect(await ajouterBaremeApporteur(12, { mode: 'one_shot', tauxGestion: '0', depuis: '2026-11-01' }, AUTEUR))
      .toEqual({ etat: 'refus', motif: 'Taux sur la location : saisissez un pourcentage (0 est accepté).' });
    expect(ecrit()).toEqual([]);
  });
  it('sans la 420 : refusé, rien n’est écrit ; une version datée ordinaire s’écrit comme avant (sans journal)', async () => {
    etat.avec420 = false;
    expect((await ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '20', tauxGestion: '0', depuis: '2000-01-01', toujours: true }, AUTEUR)).etat).toBe('indisponible');
    expect(ecrit()).toEqual([]);
    expect(await ajouterBaremeApporteur(12, { mode: 'one_shot', taux: '20', tauxGestion: '0', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(ecrit().map((a) => a.sql.slice(0, 50))).toEqual(['INSERT INTO gestion_location_apporteur_bareme (app']);
  });
});
