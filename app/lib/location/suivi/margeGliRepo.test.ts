import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (25/10/2026, 427) — LA MARGE GLI EN BASE : une nouvelle VERSION (jamais une modification), une seule par date, journalisée
 * (compte, session, écran « Paramètres Location ») ; sans la 427, refusée avec son motif. Les GLI lues : dernière saisie « GLI », mois de
 * la signature ou de la première saisie « GLI », bien en gestion à la signature, loyer de l'entrée. SQL lu par FRAGMENTS. Base simulée.
 */
vi.mock('server-only', () => ({}));
const ecrits: { sql: string; params: unknown[] }[] = [];
let lignes: Record<string, Record<string, unknown>[]> = {};
let avec427 = true;
const norm = (s: string) => s.replace(/\s+/g, ' ');
const repondre = async (sql: string, params: unknown[]) => {
  const s = norm(sql);
  ecrits.push({ sql: s, params });
  for (const [cle, rows] of Object.entries(lignes)) if (s.includes(cle)) return { rows, rowCount: rows.length };
  return { rows: [], rowCount: 0 };
};
vi.mock('../../db/client', () => ({
  query: (sql: string, params?: unknown[]) => repondre(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => repondre(sql, params ?? [])),
}));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async (table: string) => table !== 'gestion_location_marge_gli' || avec427 }));
vi.mock('../../gestion/traceJournal', () => ({
  colonnesTrace: async (o: { sujet: string; champ: string }, depart: number) => ({ colonnes: ', sujet, champ, session_id, ecran',
    marques: `, $${depart}, $${depart + 1}, $${depart + 2}, $${depart + 3}`, valeurs: [o.sujet, o.champ, 'jti-1', 'Paramètres Location'] }),
}));

const { ajouterMargeGli, lireGli } = await import('./margeGliRepo');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const journal = () => ecrits.find((e) => e.sql.includes('INSERT INTO gestion_journal'));

beforeEach(() => {
  ecrits.length = 0; avec427 = true;
  lignes = { 'FROM gestion_location_marge_gli ORDER BY depuis': [{ id: '1', depuis: '2026-01-01', marge_pct: '2.50', saisi_le: '2026-01-02 10:00:00+01', saisi_par_libelle: 'Arnaud Jorel' }] };
});

describe('🔴 « Nouvelle marge » : une version de plus, journalisée', () => {
  it('écrit la version (ajout seul, une par date) et journalise l’ancienne et la nouvelle, avec la session et l’écran', async () => {
    lignes['RETURNING id'] = [{ id: '2' }];
    expect(await ajouterMargeGli({ depuis: '2026-11-01', marge: '3,25' }, AUTEUR)).toEqual({ etat: 'ok' });
    const ins = ecrits.find((e) => e.sql.startsWith('INSERT INTO gestion_location_marge_gli'))!;
    expect(ins.sql).toContain('ON CONFLICT (depuis) DO NOTHING RETURNING id');
    expect(ins.params).toEqual(['2026-11-01', 3.25, 2, 'Arnaud Jorel']);
    expect(ecrits.some((e) => e.sql.startsWith('UPDATE') || e.sql.startsWith('DELETE'))).toBe(false);
    const j = journal()!;
    expect(j.sql).toContain("VALUES ('config', $1, 'marge_gli'");
    expect(j.params).toEqual([2, 'Marge GLI : 2,5 % (depuis le 01/01/2026)', 'Marge GLI : 3,25 % à partir du 01/11/2026',
      'Paramètres Location — nouvelle version (l’historique est conservé)', 2, 'Arnaud Jorel', 'parametre', 'Marge GLI', 'jti-1', 'Paramètres Location']);
  });
  it('une version existe déjà à cette date : refusée, rien au journal', async () => {
    expect(await ajouterMargeGli({ depuis: '2026-01-01', marge: '3' }, AUTEUR)).toMatchObject({ etat: 'refus', motif: 'Une marge GLI existe déjà à cette date : choisissez une autre date d’effet.' });
    expect(journal()).toBeUndefined();
  });
  it('saisie invalide : refusée, rien n’est écrit', async () => {
    expect(await ajouterMargeGli({ depuis: '2026-11-01', marge: '2,555' }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(ecrits.filter((e) => e.sql.startsWith('INSERT'))).toEqual([]);
  });
  it('sans la 427 : indisponible, avec son motif ; rien n’est lu ni écrit', async () => {
    avec427 = false;
    expect(await ajouterMargeGli({ depuis: '2026-11-01', marge: '2' }, AUTEUR)).toEqual({ etat: 'indisponible', motif: 'La mise à jour de la base (migration 427) n’est pas encore appliquée.' });
    expect(ecrits).toEqual([]);
  });
});

describe('🔴 les GLI lues', () => {
  it('les règles d’Arno, par fragments ; les nombres et les dates rendus tels quels', async () => {
    lignes['WITH ce AS'] = [{ bail_id: '9', activite_id: '41', lot_id: '7', date_gli: '2026-03-10', bien: '3 rue X, Paris', locataire: 'Léa Martin', loyer_hc: '1234.56', provisions: '85.44' }];
    expect(await lireGli('2026-01-01', '2026-12-31')).toEqual([{ bailId: 9, activiteId: 41, lotId: 7, date: '2026-03-10', bien: '3 rue X, Paris', locataire: 'Léa Martin', loyerHc: 1234.56, provisions: 85.44 }]);
    const { sql, params } = ecrits.find((e) => e.sql.includes('WITH ce AS'))!;
    expect(params).toEqual(['2026-01-01', '2026-12-31']);
    // La DERNIÈRE saisie dit « GLI ».
    expect(sql).toContain("WHERE ce.derniere = 'gli'");
    // Le mois : la signature (ligne du Suivi, à défaut l'entrée du bail) si la PREMIÈRE saisie dit « GLI », sinon la première saisie « GLI ».
    expect(sql).toContain("CASE WHEN ce.premiere = 'gli' THEN coalesce(a.date_signature, b.entree) ELSE (ce.premiere_gli AT TIME ZONE 'Europe/Paris')::date END");
    // Avec gestion : le bien en gestion à la date de signature.
    expect(sql).toContain("t.effet_le <= g.signature ORDER BY t.effet_le DESC, t.id DESC LIMIT 1) = 'en_gestion'");
    // Le loyer de l'ENTRÉE (conditions du bail), jamais le loyer révisé.
    expect(sql).toContain('FROM gestion_location_conditions x WHERE x.bail_id = g.bail_id');
    expect(sql).not.toContain('gestion_location_loyer_revise');
  });
});
