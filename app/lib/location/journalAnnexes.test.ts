import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026) — chaque détachement / rattachement d'annexe est JOURNALISÉ SUR LES DEUX BIENS (qui, quand, quel lot,
 * quel bien), sur une base SIMULÉE. Le lien `gestion_lot_annexe` n'est jamais modifié ni supprimé (table en ajout seul).
 */
const appels: { sql: string; params: unknown[] }[] = [];
let lignes: (sql: string) => unknown[] = () => [];
const q = async (sql: string, params: unknown[] = []) => { const s = sql.replace(/\s+/g, ' '); appels.push({ sql: s, params }); return { rows: lignes(s), rowCount: 1 }; };
vi.mock('../db/client', () => ({ query: (s: string, p?: unknown[]) => q(s, p ?? []), withTransaction: async (fn: (x: typeof q) => unknown) => fn(q) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (t: string) => t !== 'gestion_bien_regroupement' }));
const { detacherAnnexe } = await import('./entretienAnnexeRepo');
const { rattacherAnnexe } = await import('./locationRepo');
const AUTEUR = { id: 5, libelle: 'jb.pons@sansvisavis.com' };
const journal = () => appels.filter((a) => a.sql.startsWith('INSERT INTO gestion_journal'));
beforeEach(() => { appels.length = 0; });

describe('journal des gestes d’annexe', () => {
  it('DÉTACHER : la marque seulement (aucun lien touché) ; une ligne sur l’annexe (qui nomme son bien principal) ET une sur le bien', async () => {
    lignes = (s) => (s.includes('SELECT parent_id::text AS parent FROM gestion_lot_annexe') ? [{ parent: '436' }] : []);
    expect(await detacherAnnexe(437, true, AUTEUR)).toEqual({ etat: 'ok', data: undefined });
    expect(appels.filter((a) => /gestion_lot_annexe/.test(a.sql) && /^(UPDATE|DELETE|INSERT)/.test(a.sql))).toEqual([]);
    expect(appels.some((a) => a.sql.startsWith('UPDATE gestion_annuaire_lot SET annexe_detachee_le'))).toBe(true);
    const j = journal();
    expect(j.map((x) => x.params[0])).toEqual([437, 436]);
    expect(j.map((x) => x.params[1])).toEqual(['location_annexe_detachee', 'location_annexe_detachee']);
    expect(String(j[0].params[2])).toContain('(bien principal 436)');
    expect(String(j[1].params[2])).toContain('annexe 437');
    expect(j[0].params.slice(3)).toEqual([5, 'jb.pons@sansvisavis.com']);
  });

  it('RATTACHER un lot jamais lié : une ligne de lien AJOUTÉE (jamais modifiée) ; journal sur le bien principal ET sur le lot', async () => {
    lignes = (s) => (s.includes('FROM gestion_annuaire_lot WHERE id = ANY($1::bigint[]) FOR UPDATE') ? [{ id: '436', proprietaire_id: '49' }, { id: '500', proprietaire_id: '49' }] : []);
    expect(await rattacherAnnexe(436, 500, AUTEUR)).toEqual({ etat: 'ok', data: undefined });
    expect(appels.find((a) => a.sql.startsWith('INSERT INTO gestion_lot_annexe'))?.params).toEqual([500, 436, 'jb.pons@sansvisavis.com']);
    const j = journal();
    expect(j.map((x) => [x.params[1], x.params[2], x.params[4]])).toEqual([[436, 'location_annexe_rattachee', 'annexe 500'], [500, 'location_annexe_rattachee', 'bien principal 436']]);
  });
});
