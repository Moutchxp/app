import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 Arno (24/11/2026) — « Restitution faite » / « Annuler » : gestes en ajout seul (513), journalisés au dossier de chaque locataire. */
const h = vi.hoisted(() => ({ query: vi.fn(), avec513: true, sql: [] as { s: string; p: unknown[] }[], restitutions: [] as { id: number; sortie: number; geste: string; annule: number | null }[] }));
vi.mock('../db/client', () => ({ query: h.query, withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn(h.query) }));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async () => h.avec513 }));
import { annulerRestitution, enregistrerRestitution, SQL_SANS_RESTITUTION_EN_COURS } from './restitutionVingtRepo';
import { MOTIF_SANS_513 } from './vingtPourcent';

const AUTEUR = { id: 1, libelle: 'Arno Test' };
const norm = (s: string) => s.replace(/\s+/g, ' ');
beforeEach(() => {
  h.avec513 = true; h.sql = []; h.restitutions = [];
  h.query.mockReset().mockImplementation(async (sql: string, p: unknown[] = []) => {
    const s = norm(sql); h.sql.push({ s, p });
    if (s.includes('FROM gestion_location_sortie_validee s WHERE s.id = $1') && s.includes('retenue_20 AS retenue')) {
      return { rows: Number(p[0]) === 7 ? [{ date_sortie: '2026-03-01', retenue: true, j: '2026-11-24' }] : Number(p[0]) === 8 ? [{ date_sortie: '2026-03-01', retenue: false, j: '2026-11-24' }] : [] };
    }
    if (s.startsWith('SELECT 1 AS id FROM gestion_location_sortie_validee s WHERE s.id = $1 AND NOT')) {
      const enCours = h.restitutions.some((r) => r.sortie === Number(p[0]) && r.geste === 'faite' && !h.restitutions.some((a) => a.annule === r.id));
      return { rows: enCours ? [{ id: '1' }] : [] };
    }
    if (s.startsWith("INSERT INTO gestion_location_restitution_vingt (sortie_validee_id, geste, date_restitution")) {
      const id = h.restitutions.length + 1; h.restitutions.push({ id, sortie: Number(p[0]), geste: 'faite', annule: null }); return { rows: [{ id: String(id) }] };
    }
    if (s.includes("FROM gestion_location_restitution_vingt f WHERE f.id = $1 AND f.geste = 'faite'")) {
      const r = h.restitutions.find((x) => x.id === Number(p[0]) && x.geste === 'faite');
      return { rows: r ? [{ sortie: String(r.sortie), date: '2026-11-20', montant: '312.50' }] : [] };
    }
    if (s.startsWith("INSERT INTO gestion_location_restitution_vingt (sortie_validee_id, geste, annule_id")) {
      if (h.restitutions.some((a) => a.annule === Number(p[1]))) return { rows: [] };
      const id = h.restitutions.length + 1; h.restitutions.push({ id, sortie: Number(p[0]), geste: 'annulee', annule: Number(p[1]) }); return { rows: [{ id: String(id) }] };
    }
    if (s.includes('SELECT DISTINCT o.locataire_id::text AS id')) return { rows: [{ id: '101' }, { id: '102' }] };
    return { rows: [] };
  });
});
const journaux = () => h.sql.filter((x) => x.s.startsWith('INSERT INTO gestion_journal'));

describe('« Restitution faite »', () => {
  const OK = { sortieId: 7, date: '2026-11-20', montantRestitue: '312,50', montantRetenuCharges: '40', commentaire: 'Virement _TEST' };
  it('🔴 enregistrée, puis journalisée dans le dossier de CHAQUE locataire de la sortie (entité « annuaire »)', async () => {
    expect(await enregistrerRestitution(OK, AUTEUR)).toEqual({ etat: 'ok', data: { id: 1 } });
    const ins = h.sql.find((x) => x.s.startsWith('INSERT INTO gestion_location_restitution_vingt'))!;
    expect(ins.p).toEqual([7, '2026-11-20', 312.5, 40, 'Virement _TEST', 1, 'Arno Test']);
    expect(journaux().map((j) => [j.p[0], j.p[1], j.p[2]])).toEqual([
      [101, 'location_restitution_20_faite', 'restitution des 20 % faite le 20/11/2026 : 312,50 € restitués, 40,00 € retenus au titre des charges'],
      [102, 'location_restitution_20_faite', 'restitution des 20 % faite le 20/11/2026 : 312,50 € restitués, 40,00 € retenus au titre des charges'],
      // 🔴 (Arno, 25/11/2026) et dans l'historique du BIEN de la sortie (paramètre : la sortie ; le bien lu sur s.lot_id)
      [7, 'location_restitution_20_faite', 'restitution des 20 % faite le 20/11/2026 : 312,50 € restitués, 40,00 € retenus au titre des charges']]);
    expect(journaux()[2].s).toContain("INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle) SELECT 'annuaire_lot', s.lot_id, $2, NULL, $3, $4, $5, $6 FROM gestion_location_sortie_validee s WHERE s.id = $1");
    expect(journaux()[2].p[3]).toBe('Virement _TEST — sortie validée 7, restitution 1');
    expect(norm(SQL_SANS_RESTITUTION_EN_COURS)).toContain("f.geste = 'faite' AND NOT EXISTS (SELECT 1 FROM gestion_location_restitution_vingt a WHERE a.annule_id = f.id)");
  });
  it('🔴 une deuxième fois sur la même sortie : refus, rien n’est écrit ; sans retenue, ou date avant la sortie / dans le futur : refus', async () => {
    await enregistrerRestitution(OK, AUTEUR);
    h.sql = [];
    expect(await enregistrerRestitution(OK, AUTEUR)).toMatchObject({ etat: 'refus', motif: expect.stringContaining('déjà enregistrée') });
    expect(await enregistrerRestitution({ ...OK, sortieId: 8 }, AUTEUR)).toMatchObject({ etat: 'refus' });
    expect(await enregistrerRestitution({ ...OK, date: '2026-02-01' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'date' });
    expect(await enregistrerRestitution({ ...OK, date: '2026-12-01' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'date' });
    expect(await enregistrerRestitution({ ...OK, montantRestitue: '' }, AUTEUR)).toMatchObject({ etat: 'refus', champ: 'montantRestitue' });
    expect(h.sql.some((x) => x.s.startsWith('INSERT'))).toBe(false);
  });
  it('sans la 513 : refus dit, rien n’est lu ni écrit', async () => {
    h.avec513 = false;
    expect(await enregistrerRestitution(OK, AUTEUR)).toEqual({ etat: 'refus', motif: MOTIF_SANS_513 });
    expect(h.sql).toEqual([]);
  });
});

describe('« Annuler » une restitution', () => {
  it('🔴 un geste « annulee » (la restitution reste), journalisé pour chaque locataire ; une deuxième annulation : refus', async () => {
    await enregistrerRestitution({ sortieId: 7, date: '2026-11-20', montantRestitue: '312,50' }, AUTEUR);
    h.sql = [];
    expect(await annulerRestitution({ restitutionId: 1 }, AUTEUR)).toEqual({ etat: 'ok', data: { id: 2 } });
    expect(h.restitutions).toEqual([{ id: 1, sortie: 7, geste: 'faite', annule: null }, { id: 2, sortie: 7, geste: 'annulee', annule: 1 }]);
    expect(journaux().map((j) => [j.p[0], j.p[1], j.p[2]])).toEqual([
      [101, 'location_restitution_20_annulee', 'restitution des 20 % du 20/11/2026 (312,50 €) annulée'],
      [102, 'location_restitution_20_annulee', 'restitution des 20 % du 20/11/2026 (312,50 €) annulée'],
      [7, 'location_restitution_20_annulee', 'restitution des 20 % du 20/11/2026 (312,50 €) annulée']]);     // 🔴 (25/11) au bien aussi
    expect(journaux()[2].s).toContain("SELECT 'annuaire_lot', s.lot_id,");
    // aucune ligne modifiée ni effacée
    expect(h.sql.some((x) => /^(UPDATE|DELETE)/.test(x.s))).toBe(false);
    expect(await annulerRestitution({ restitutionId: 1 }, AUTEUR)).toMatchObject({ etat: 'refus', motif: expect.stringContaining('déjà annulée') });
    // annulée : la sortie peut de nouveau être restituée
    expect((await enregistrerRestitution({ sortieId: 7, date: '2026-11-21', montantRestitue: 300 }, AUTEUR)).etat).toBe('ok');
  });
});
