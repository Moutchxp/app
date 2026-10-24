import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (24/10/2026, migration 419) — LE SERVEUR : un INTERNE se crée lié à son compte, sans collègue ; un EXTERNE sans collègue est
 * refusé à la création ET à la modification ; un interne ne se rattache pas et ne rémunère personne ; la rémunération est une version
 * datée. Base simulée : rien n'est écrit.
 */
const { appels, etat } = vi.hoisted(() => ({
  appels: [] as { sql: string; params: unknown[] }[],
  etat: { interne: false, rattache: true, avec419: true, compteLie: false },
}));
vi.mock('server-only', () => ({}));
const query = vi.fn(async (sql: string, params: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim();
  appels.push({ sql: s, params });
  if (s.includes('FROM admin_utilisateur WHERE id = $1')) return { rows: params[0] === 404 ? [] : [{ libelle: params[0] === 5 ? 'Jean-Baptiste Pons' : 'Arnaud Jorel' }], rowCount: 1 };
  if (s.includes('AS externe')) return { rows: [{ externe: !etat.interne, rattache: etat.rattache }], rowCount: 1 };
  if (s.includes('compte_id IS NOT NULL AS interne')) return { rows: [{ interne: etat.interne }], rowCount: 1 };
  if (s.startsWith('SELECT nom FROM gestion_location_apporteur WHERE compte_id')) return { rows: etat.compteLie ? [{ nom: 'Ancien' }] : [], rowCount: 0 };
  if (s.startsWith('SELECT id FROM gestion_location_apporteur WHERE lower')) return { rows: [], rowCount: 0 };
  if (s.startsWith('INSERT INTO gestion_location_apporteur (')) return { rows: [{ id: '31' }], rowCount: 1 };
  if (s.includes('is_nullable')) return { rows: [{ n: '1' }], rowCount: 1 };
  return { rows: [], rowCount: 1 };
});
vi.mock('../../db/client', () => ({ query, withTransaction: async (f: (q: typeof query) => unknown) => f(query) }));
vi.mock('../sondeLocation', () => ({ colonneExisteMemo: async (_t: string, c: string) => (c === 'compte_id' ? etat.avec419 : true) }));
const { creerApporteur, modifierApporteur, rattacherApporteur, ajouterRemunerationCollegue, ajouterBaremeApporteur } = await import('./suiviRepo');
const AUTEUR = { id: 2, libelle: 'Arnaud Jorel' };
const ecrit = () => appels.filter((a) => /^(INSERT|UPDATE)/.test(a.sql));
beforeEach(() => { appels.length = 0; Object.assign(etat, { interne: false, rattache: true, avec419: true, compteLie: false }); });

describe('🔴 création : interne lié à son compte ; externe sans collègue refusé', () => {
  it('un INTERNE : nommé d’après son compte, `compte_id` posé, type « Collaborateur », AUCUN rattachement à un collègue', async () => {
    expect(await creerApporteur({ interne: true, compteId: 5, collegueId: 2, taux: '5', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok', data: { id: 31 } });
    const ins = ecrit().find((a) => a.sql.startsWith('INSERT INTO gestion_location_apporteur ('))!;
    expect(ins.params.slice(0, 2)).toEqual(['Jean-Baptiste Pons', 'collaborateur']);
    expect(ecrit().find((a) => a.sql.startsWith('UPDATE gestion_location_apporteur SET compte_id'))?.params).toEqual([31, 5]);
    expect(ecrit().some((a) => a.sql.includes('gestion_location_apporteur_collegue'))).toBe(false);
  });
  it('un compte déjà apporteur interne : refusé, rien n’est écrit', async () => {
    etat.compteLie = true;
    expect(await creerApporteur({ interne: true, compteId: 5, depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'refus', motif: 'Ce compte est déjà l’apporteur interne « Ancien ».' });
    expect(ecrit()).toEqual([]);
  });
  it('un EXTERNE sans collègue : refusé, rien n’est écrit ; avec : rattaché (« depuis toujours » possible), la durée du récurrent écrite', async () => {
    expect((await creerApporteur({ nom: 'Léa Dupont', type: 'partenaire', taux: '10', depuis: '2026-11-01' }, AUTEUR)).etat).toBe('refus');
    expect(ecrit()).toEqual([]);
    expect((await creerApporteur({ nom: 'Léa Dupont', type: 'partenaire', taux: '10', depuis: '2026-11-01', collegueId: 5, depuisToujours: true,
      mode: 'recurrent', tauxGestion: '10', dureeAnnees: '3' }, AUTEUR)).etat).toBe('ok');
    expect(ecrit().find((a) => a.sql.includes('gestion_location_apporteur_collegue'))?.params).toEqual([31, null, 5, 'Jean-Baptiste Pons', 'Arnaud Jorel']);
    const bareme = ecrit().find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_bareme'))!;
    expect(bareme.sql).toContain('duree_annees');
    expect(bareme.params.at(-1)).toBe(3);
  });
  it('sans la 419 : un interne ou une durée sont refusés (ils seraient perdus)', async () => {
    etat.avec419 = false;
    expect((await creerApporteur({ interne: true, compteId: 5, depuis: '2026-11-01' }, AUTEUR)).etat).toBe('refus');
    expect(ecrit()).toEqual([]);
  });
});

describe('🔴 modification : un externe « à rattacher » est refusé ; un interne ne se rattache pas', () => {
  it('fiche, nouveau taux et rémunération d’un externe SANS collègue : refusés, rien n’est écrit', async () => {
    etat.rattache = false;
    expect((await modifierApporteur(4, { societe: 'X' }, AUTEUR))).toMatchObject({ etat: 'refus', motif: expect.stringMatching(/rattachez-le d’abord/) });
    expect((await ajouterBaremeApporteur(4, { taux: '10', depuis: '2026-11-01' }, AUTEUR)).etat).toBe('refus');
    expect((await ajouterRemunerationCollegue(4, { remunere: true, mode: 'one_shot', taux: '5', depuis: '2026-11-01' }, AUTEUR)).etat).toBe('refus');
    expect(ecrit()).toEqual([]);
  });
  it('un INTERNE : pas de rattachement (« rattaché à personne »), pas de rémunération de collègue ; sa fiche se modifie', async () => {
    etat.interne = true; etat.rattache = false;
    expect(await rattacherApporteur(4, { collegueId: 5, depuisToujours: true }, AUTEUR)).toEqual({ etat: 'refus', motif: 'Un apporteur interne n’est rattaché à personne.' });
    expect((await ajouterRemunerationCollegue(4, { remunere: true, mode: 'one_shot', taux: '5', depuis: '2026-11-01' }, AUTEUR)).etat).toBe('refus');
    expect(ecrit()).toEqual([]);
    expect(await modifierApporteur(4, { societe: 'X' }, AUTEUR)).toEqual({ etat: 'ok' });
  });
  it('la rémunération d’un externe rattaché : une VERSION datée (ON CONFLICT : jamais réécrite)', async () => {
    expect(await ajouterRemunerationCollegue(4, { remunere: true, mode: 'recurrent', taux: '5', tauxGestion: '10', dureeAnnees: '3', depuis: '2026-11-01' }, AUTEUR)).toEqual({ etat: 'ok' });
    const ins = ecrit().find((a) => a.sql.includes('INSERT INTO gestion_location_apporteur_remuneration'))!;
    expect(ins.sql).toContain('ON CONFLICT (apporteur_id, depuis) DO NOTHING');
    expect(ins.params).toEqual([4, '2026-11-01', true, 'recurrent', 0.05, 0.1, 3, 'Arnaud Jorel']);
  });
});
