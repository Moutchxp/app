import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 Arno (23/11/2026, 512) — la date d'arrêté des comptes, dépôt sur une base SIMULÉE (fragments, paramètres liés). */
type Appel = { sql: string; params: unknown[] };
const appels: Appel[] = [];
const norme = (s: string): string => s.replace(/\s+/g, ' ');
let schema = true;
let ligne: Record<string, unknown> | null = null;
let compte: Record<string, unknown> | null = null;
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = norme(sql);
  appels.push({ sql: s, params });
  if (s.includes('FROM admin_utilisateur')) return { rows: compte ? [compte] : [], rowCount: compte ? 1 : 0 };
  if (s.startsWith('SELECT NULL::smallint')) return { rows: [{ jour: null, mois: null, le: null, par: null }], rowCount: 1 };
  if (s.includes('FOR UPDATE')) return { rows: ligne === null ? [] : [ligne], rowCount: ligne === null ? 0 : 1 };
  if (s.startsWith('UPDATE gestion_copropriete')) return { rows: [{ jour: params[1], mois: params[2], le: '2026-11-23 10:00:00+01', par: params[3] }], rowCount: 1 };
  if (s.includes('FROM gestion_copropriete WHERE id = $1')) return { rows: ligne === null ? [] : [ligne], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: (sql: string, params?: unknown[]) => Promise<unknown>) => Promise<unknown>) => fn((sql, params) => query(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => schema }));
const { enregistrerArrete, lireArrete } = await import('./arreteComptesRepo');

const AUTEUR = { id: 3, libelle: 'arno@exemple.fr' };
const ecritures = (): Appel[] => appels.filter((a) => /^(UPDATE|INSERT|DELETE)/.test(a.sql));
beforeEach(() => { appels.length = 0; schema = true; compte = null; ligne = { libelle: '12 rue Exemple', jour: null, mois: null, le: null, par: null }; });

describe('arrêté des comptes — lecture et enregistrement journalisé', () => {
  it('enregistre jour / mois / qui / quand, et UNE ligne de journal (avant → après) ; jamais de DELETE', async () => {
    const r = await enregistrerArrete({ coproprieteId: 7, jour: '31', mois: '12' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { arrete: { jour: 31, mois: 12 }, par: 'arno@exemple.fr' } });
    const maj = ecritures().find((a) => a.sql.startsWith('UPDATE gestion_copropriete'))!;
    expect(maj.params).toEqual([7, 31, 12, 'arno@exemple.fr']);
    const j = ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!;
    expect(j.sql).toContain("'copropriete'");
    expect(j.params.slice(0, 3)).toEqual([7, null, '31/12']);
    expect(appels.some((a) => /\bDELETE\b/.test(a.sql))).toBe(false);
  });
  it('effacer (deux champs vides) : la date passe à vide, journalisé', async () => {
    ligne = { libelle: 'X', jour: 30, mois: 6, le: '2026-11-01', par: 'x' };
    expect((await enregistrerArrete({ coproprieteId: 7, jour: '', mois: '' }, AUTEUR)).etat).toBe('ok');
    expect(ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!.params.slice(0, 3)).toEqual([7, '30/06', null]);
  });
  it('refus AVANT toute écriture : saisie invalide, sans changement, copropriété inconnue, sans la 512', async () => {
    expect((await enregistrerArrete({ coproprieteId: 7, jour: '31', mois: '6' }, AUTEUR)).etat).toBe('refus');
    ligne = { libelle: 'X', jour: 31, mois: 12, le: null, par: null };
    expect((await enregistrerArrete({ coproprieteId: 7, jour: 31, mois: 12 }, AUTEUR)).etat).toBe('refus');
    ligne = null;
    expect((await enregistrerArrete({ coproprieteId: 7, jour: 31, mois: 12 }, AUTEUR)).etat).toBe('inconnu');
    schema = false;
    expect((await enregistrerArrete({ coproprieteId: 7, jour: 31, mois: 12 }, AUTEUR)).etat).toBe('sans_schema');
    expect(ecritures()).toHaveLength(0);
  });
  it('lecture : la valeur, ou « non renseignée » ; sans la 512 : non renseignée', async () => {
    ligne = { jour: 30, mois: 6, le: '2026-11-01 09:00:00+01', par: 'arno@exemple.fr' };
    expect(await lireArrete(7)).toMatchObject({ arrete: { jour: 30, mois: 6 }, par: 'arno@exemple.fr' });
    schema = false;
    expect((await lireArrete(7))?.arrete).toBeNull();
  });
});

/** 🔴 Arno (23/11/2026) — « saisie par Arnaud JOREL le … » : prénom NOM de l'auteur, pas son adresse e-mail (comme pour les AG). */
describe('🔴 qui a saisi la date : prénom NOM', () => {
  it('à l’écriture : le prénom NOM du compte ; le journal garde l’identifiant', async () => {
    compte = { identifiant: 'arno@exemple.fr', prenom: 'Arnaud', nom: 'Jorel' };
    const r = await enregistrerArrete({ coproprieteId: 7, jour: '31', mois: '12' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'ok', data: { par: 'Arnaud JOREL' } });
    expect(ecritures().find((a) => a.sql.startsWith('UPDATE gestion_copropriete'))!.params).toEqual([7, 31, 12, 'Arnaud JOREL']);
    expect(ecritures().find((a) => a.sql.startsWith('INSERT INTO gestion_journal'))!.params.slice(-1)).toEqual(['arno@exemple.fr']);
  });
  it('à la lecture : une saisie d’avant (adresse e-mail) est traduite par son compte ; sans compte, l’adresse reste', async () => {
    ligne = { libelle: '12 rue Exemple', jour: 1, mois: 3, le: '2026-11-23 10:00:00+01', par: 'arno@exemple.fr' };
    compte = { prenom: 'Arnaud', nom: 'Jorel' };
    expect((await lireArrete(7))?.par).toBe('Arnaud JOREL');
    compte = null;
    expect((await lireArrete(7))?.par).toBe('arno@exemple.fr');
  });
});
