import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026, 413) — l'écriture de la règle d'un apporteur (mode, taux sur la gestion) : avec la migration 413, tout est
 * écrit ; sans elle, une règle « One shot — gestion 0 % » s'écrit comme avant, une autre est REFUSÉE (elle serait perdue). Base simulée.
 */
const { appels, colonnes } = vi.hoisted(() => ({ appels: [] as { sql: string; params: unknown[] }[], colonnes: { avec413: true, avec414: true } }));
vi.mock('server-only', () => ({}));
vi.mock('../../db/client', () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    appels.push({ sql: sql.replace(/\s+/g, ' '), params });
    // 419 — l'apporteur est un externe RATTACHÉ (la modification d'un externe sans collègue est refusée, éprouvé ailleurs).
    if (sql.includes('AS externe')) return { rows: [{ externe: true, rattache: true }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }),
  withTransaction: vi.fn(),
}));
vi.mock('../sondeLocation', () => ({
  // 419 (compte_id) absente ici : les écritures d'avant, à l'identique.
  colonneExisteMemo: async (_t: string, c: string) => (c === 'taux_gestion_bien_ht' ? colonnes.avec413 : c === 'nom_famille' ? colonnes.avec414 : c !== 'compte_id'),
}));
const { ajouterBaremeApporteur, modifierApporteur } = await import('./suiviRepo');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
beforeEach(() => { appels.length = 0; colonnes.avec413 = true; colonnes.avec414 = true; });

describe('🔴 la règle d’un apporteur, écrite', () => {
  it('avec la 413 : le mode et le taux sur la gestion partent avec la règle datée', async () => {
    expect(await ajouterBaremeApporteur(3, { mode: 'recurrent', taux: '10', tauxGestion: '10', coutFixe: '', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok' });
    const ins = appels.find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_bareme'))!;
    expect(ins.sql).toContain('mode, taux_gestion');
    expect(ins.params).toEqual([3, '2026-11-01', 0.1, 0, 'Arnaud Jorel', 'recurrent', 0.1]);
  });
  it('sans la 413 : « One shot — gestion 0 % » s’écrit comme avant ; « Récurrent » ou un taux sur la gestion est refusé', async () => {
    colonnes.avec413 = false;
    expect(await ajouterBaremeApporteur(3, { taux: '10', coutFixe: '', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(appels.at(-1)!.sql).not.toContain('taux_gestion');
    appels.length = 0;
    const r = await ajouterBaremeApporteur(3, { mode: 'recurrent', taux: '10', tauxGestion: '10', coutFixe: '', depuis: '2026-11-01' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus' });
    expect(appels.some((a) => a.sql.includes('INSERT'))).toBe(false);
  });
});

describe('🔴 Arno (24/10/2026) — « Type de bien » Parking : le serveur refuse si un lot loué n’est pas un parking', () => {
  it('refus lu AVANT d’écrire ; avec seulement des parkings, l’écriture passe le contrôle', async () => {
    const { query, withTransaction } = await import('../../db/client');
    let tous = false;
    vi.mocked(query).mockImplementation((async (sql: string, params: unknown[] = []) => {
      appels.push({ sql: sql.replace(/\s+/g, ' '), params });
      if (sql.includes('FROM gestion_bail b JOIN gestion_annuaire_lot l')) return { rows: [{ lot_id: '7', proprietaire_id: null, proprio: 'P', categorie: 'parking' }], rowCount: 1 };
      if (sql.includes('bool_and(')) return { rows: [{ tous }], rowCount: 1 };
      if (sql.includes('INSERT INTO gestion_location_activite')) return { rows: [{ id: '1' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }) as never);
    vi.mocked(withTransaction).mockImplementation((async (fn: (q: typeof query) => unknown) => fn(query)) as never);
    const { enregistrerActiviteBail, MOT_PARKING_SEUL } = await import('./suiviRepo');
    const corps = { dateSignature: '2026-10-24', honoProprietaireHt: '', honoLocataireHt: '', apporteurTaux: '', origineContact: 'internet', categoriePrime: 'parking' };
    expect(await enregistrerActiviteBail(99, corps, AUTEUR)).toEqual({ etat: 'refus', motif: MOT_PARKING_SEUL });
    expect(appels.some((a) => a.sql.includes('INSERT INTO gestion_location_activite'))).toBe(false);
    tous = true; appels.length = 0;
    await enregistrerActiviteBail(99, corps, AUTEUR).catch(() => null);
    expect(appels.some((a) => a.sql.includes('INSERT INTO gestion_location_activite'))).toBe(true);
  });
});

describe('🔴 Arno (24/10/2026, 414) — la fiche écrit le nom de famille et le prénom', () => {
  it('avec la 414 : écrits ; vides = une structure ; un prénom sans nom est refusé ; sans la 414 : la fiche s’écrit comme avant', async () => {
    const { query } = await import('../../db/client');
    vi.mocked(query).mockImplementation((async (sql: string, params: unknown[] = []) => {
      appels.push({ sql: sql.replace(/\s+/g, ' '), params });
      return sql.includes('AS externe') ? { rows: [{ externe: true, rattache: true }], rowCount: 1 } : { rows: [], rowCount: 1 };
    }) as never);
    expect(await modifierApporteur(5, { nomFamille: ' Arthur ', prenom: 'Marjorie', type: 'partenaire' }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(appels.at(-1)!.sql).toContain('nom_famille = $7, prenom = $8');
    expect(appels.at(-1)!.params.slice(-2)).toEqual(['Arthur', 'Marjorie']);
    await modifierApporteur(5, { nomFamille: '', prenom: '' }, AUTEUR);
    expect(appels.at(-1)!.params.slice(-2)).toEqual(['', null]);
    expect(await modifierApporteur(5, { nomFamille: '', prenom: 'Marjorie' }, AUTEUR)).toMatchObject({ etat: 'refus' });
    colonnes.avec414 = false; appels.length = 0;
    expect(await modifierApporteur(5, { nomFamille: 'Arthur', prenom: 'Marjorie' }, AUTEUR)).toEqual({ etat: 'ok' });
    expect(appels.at(-1)!.sql).not.toContain('nom_famille');
  });
});

describe('🔴 Arno (24/10/2026, 415) — « Propriétaire déjà client » : refusé par le serveur tant que la base ne l’admet pas', () => {
  it('sans la 415 : refus lu avant d’écrire, rien n’est écrit', async () => {
    const { query, withTransaction } = await import('../../db/client');
    vi.mocked(query).mockImplementation((async (sql: string, params: unknown[] = []) => {
      appels.push({ sql: sql.replace(/\s+/g, ' '), params });
      if (sql.includes('FROM pg_constraint')) return { rows: [{ ok: false }], rowCount: 1 };
      if (sql.includes('FOR UPDATE')) return { rows: [{ apporteur_id: null, lot_id: '7' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }) as never);
    vi.mocked(withTransaction).mockImplementation((async (fn: (q: typeof query) => unknown) => fn(query)) as never);
    const { modifierActivite } = await import('./suiviRepo');
    appels.length = 0;
    const r = await modifierActivite(12, { origineContact: 'proprietaire_deja_client' }, AUTEUR);
    expect(r).toMatchObject({ etat: 'refus' });
    expect((r as { motif: string }).motif).toContain('migration 415');
    expect(appels.some((a) => a.sql.startsWith('UPDATE gestion_location_activite'))).toBe(false);
  });
});
