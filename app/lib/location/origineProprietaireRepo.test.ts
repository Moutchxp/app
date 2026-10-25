import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (25/10/2026, 425) — L'ORIGINE DU PROPRIÉTAIRE EN BASE : modifier l'origine d'un propriétaire ne touche AUCUNE location ; le
 * report (case décochée par défaut) ne vise que les locations encore « à renseigner » ; le bloc 9 écrit la LOCATION seule et refuse un
 * conflit. Le SQL est lu par fragments sémantiques (jamais sa forme exacte). Base simulée.
 */
vi.mock('server-only', () => ({}));
const ecrits: { sql: string; params: unknown[] }[] = [];
let lignes: Record<string, Record<string, unknown>[]> = {};
const norm = (s: string) => s.replace(/\s+/g, ' ');
const repondre = async (sql: string, params: unknown[]) => {
  const s = norm(sql);
  ecrits.push({ sql: s, params });
  for (const [cle, rows] of Object.entries(lignes)) if (s.includes(cle)) return { rows };
  return { rows: [] };
};
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => repondre(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => repondre(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => true }));
vi.mock('../gestion/traceJournal', () => ({ colonnesTrace: async () => ({ colonnes: '', marques: '', valeurs: [] }), traceCourante: () => null }));

const { modifierOrigineProprietaire, modifierOrigineActivite } = await import('./origineProprietaireRepo');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const majLocations = () => ecrits.filter((e) => e.sql.startsWith('UPDATE gestion_location_activite'));

beforeEach(() => {
  ecrits.length = 0;
  lignes = {
    'SELECT 1 FROM gestion_annuaire_proprietaire': [{ '?column?': 1 }],
    'FROM gestion_annuaire_proprietaire WHERE id = $1 FOR UPDATE': [{ origine_contact: 'internet', origine_contact_precision: null, origine_apporteur_id: null, origine_collegue_id: null }],
    'FROM gestion_location_apporteur WHERE id': [{ nom: 'Frédéric Rousseau' }],
  };
});

describe('🔴 modifier l’origine d’un propriétaire', () => {
  it('PAS DE RÉTROACTIVITÉ : sans la case, aucune location n’est modifiée', async () => {
    const r = await modifierOrigineProprietaire(7, { origine: 'apporteur', apporteurId: 12 }, false, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { reportees: 0 } });
    expect(ecrits.some((e) => e.sql.startsWith('UPDATE gestion_annuaire_proprietaire SET origine_contact'))).toBe(true);
    expect(majLocations()).toEqual([]);
    expect(ecrits.some((e) => e.sql.includes('INSERT INTO gestion_journal') && e.params.includes('annuaire_origine_contact'))).toBe(true);
  });

  it('avec la case : seulement les locations encore « à renseigner » (origine vide, aucun apporteur), relues et gardées en base', async () => {
    lignes['AND a.origine_contact IS NULL AND a.apporteur_id IS NULL'] = [{ id: '41' }, { id: '42' }];
    lignes['RETURNING id'] = [{ id: '41' }];
    const r = await modifierOrigineProprietaire(7, { origine: 'apporteur', apporteurId: 12 }, true, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok' });
    const maj = majLocations();
    expect(maj.length).toBe(2);
    for (const m of maj) expect(m.sql).toContain('WHERE id = $1 AND origine_contact IS NULL AND apporteur_id IS NULL AND annule_le IS NULL');
    expect(maj.map((m) => m.params[0])).toEqual([41, 42]);
  });

  it('« Origine inconnue » : enregistrée, jamais reportée', async () => {
    lignes['AND a.origine_contact IS NULL AND a.apporteur_id IS NULL'] = [{ id: '41' }];
    expect(await modifierOrigineProprietaire(7, { origine: 'inconnue' }, true, AUTEUR)).toMatchObject({ etat: 'ok', data: { reportees: 0 } });
    expect(majLocations()).toEqual([]);
  });

  it('vide : refusée, rien n’est écrit', async () => {
    expect(await modifierOrigineProprietaire(7, { origine: '' }, false, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(ecrits.filter((e) => e.sql.startsWith('UPDATE'))).toEqual([]);
  });
});

describe('🔴 bloc 9 : l’origine de la LOCATION seule, conflit refusé', () => {
  const ligne = { origine_contact: null, origine_contact_precision: null, apporteur_id: null, collegue_id: null, avec_gestion: false, mandat_gestion: false };
  it('écrit la location (jamais le propriétaire) et journalise', async () => {
    lignes['FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL FOR UPDATE'] = [ligne];
    const r = await modifierOrigineActivite(41, { origineContact: 'internet' }, '|||', AUTEUR);
    expect(r).toMatchObject({ etat: 'ok' });
    expect(majLocations().length).toBe(1);
    expect(ecrits.some((e) => e.sql.includes('UPDATE gestion_annuaire_proprietaire'))).toBe(false);
    expect(ecrits.some((e) => e.sql.includes('INSERT INTO gestion_journal'))).toBe(true);
  });
  it('l’origine a changé depuis l’ouverture : conflit, rien n’est écrit', async () => {
    lignes['FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL FOR UPDATE'] = [{ ...ligne, origine_contact: 'internet' }];
    expect(await modifierOrigineActivite(41, { origineContact: 'passage_agence' }, '|||', AUTEUR)).toMatchObject({ etat: 'conflit' });
    expect(majLocations()).toEqual([]);
  });
  it('« Relocation » sans la case de la location : refusée (la règle du bloc 4 prime)', async () => {
    lignes['FROM gestion_location_activite WHERE id = $1 AND annule_le IS NULL FOR UPDATE'] = [ligne];
    expect(await modifierOrigineActivite(41, { origineContact: 'relocation' }, '|||', AUTEUR)).toMatchObject({ etat: 'refus' });
  });
});
