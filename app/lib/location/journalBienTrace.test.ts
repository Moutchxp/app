import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026, 417) — le journal d'une fiche de BIEN modifiée depuis « Suivi du mois » : UNE ligne par champ (champ, ancienne,
 * nouvelle valeur), avec le compte, la session et l'écran ; hors écran tracé, la ligne par groupe d'avant (inchangée). Base simulée.
 */
const ecrits: { sql: string; params: unknown[] }[] = [];
let avec417 = true;
vi.mock('../db/client', () => ({
  query: async (sql: string, params: unknown[] = []) => { ecrits.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return { rows: [], rowCount: 0 }; },
  withTransaction: async () => { throw new Error('inattendu'); },
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => avec417, oublierSchemaLocation: () => {} }));

const { journaliser } = await import('./encartBienRepo');
const { avecTrace } = await import('../gestion/traceJournal');

const auteur = { id: 12, libelle: 'lea.martin@exemple.fr' };
const changements = [{ champ: 'Étage', avant: '2', apres: '3' }, { champ: 'Porte', avant: '(vide)', apres: 'B' }];
beforeEach(() => { ecrits.length = 0; avec417 = true; });
const inserts = () => ecrits.filter((e) => e.sql.startsWith('INSERT INTO gestion_journal'));

describe('🔴 le journal du bien', () => {
  it('depuis « Suivi du mois » : une ligne par champ, avec compte, session, écran, entité lot', async () => {
    await avecTrace({ sessionId: 'jti-xyz', ecran: 'Suivi du mois' }, () => journaliser(363, 'situation', changements, auteur));
    const l = inserts();
    expect(l).toHaveLength(2);
    expect(l[0].sql).toContain("VALUES ('annuaire_lot', $1, 'location_encart_modifie'");
    expect(l[0].params).toEqual([363, '2', '3', expect.stringMatching(/ — /), 12, 'lea.martin@exemple.fr', 'lot', 'Étage', 'jti-xyz', 'Suivi du mois']);
    expect(l[1].params.slice(1, 3)).toEqual(['(vide)', 'B']);
    expect(l[1].params.slice(-4)).toEqual(['lot', 'Porte', 'jti-xyz', 'Suivi du mois']);
  });
  it('ailleurs : la ligne par groupe d’avant (« Champ : valeur » par ligne), sujet posé, ni session ni écran', async () => {
    await journaliser(363, 'situation', changements, auteur);
    const l = inserts();
    expect(l).toHaveLength(1);
    expect(l[0].params.slice(0, 3)).toEqual([363, 'Étage : 2\nPorte : (vide)', 'Étage : 3\nPorte : B']);
    expect(l[0].params.slice(-4)).toEqual(['lot', null, null, null]);
  });
  it('sans la 417 : exactement la ligne d’avant (aucune colonne de plus)', async () => {
    avec417 = false;
    await avecTrace({ sessionId: 'jti-xyz', ecran: 'Suivi du mois' }, () => journaliser(363, 'situation', changements, auteur));
    const l = inserts();
    expect(l.every((x) => !x.sql.includes('session_id'))).toBe(true);
    expect(l[0].params).toHaveLength(6);
  });
});
