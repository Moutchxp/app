import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * UNE FICHE BIEN = LES LOTS LOUÉS ENSEMBLE (Arno, 17 et 19/10/2026) — le dépôt, sur une petite BASE SIMULÉE en mémoire (lots,
 * annexes, occupations, fiches autonomes) : on joue de vrais scénarios — bail partiel, fiche autonome, réintégration — et
 * on vérifie que rien n'est jamais effacé. Aucune écriture Drive.
 */
interface Lot { id: number; categorie: string; porte: string | null; detache: string | null }
interface Occ { id: number; lot: number; loc: number; sortie: string | null }
interface Ligne { id: number; origine: number; tete: number; lots: number[]; motif: string; clos: string | null; statut: string | null }
let lots: Lot[]; let annexes: Map<number, number>; let occs: Occ[]; let lignes: Ligne[]; let journal: { action: string; id: number }[];
let deletes: string[];
const noms: Record<number, string> = { 5: 'DUPONT Jean', 6: 'DUPONT Marie', 9: 'MARTIN Léa' };

function repondre(sqlBrut: string, p: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = sqlBrut.replace(/\s+/g, ' ').trim();
  const r = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  if (/\bDELETE\b|\bTRUNCATE\b/.test(s)) deletes.push(s);
  if (s.startsWith('SELECT 1 FROM gestion_annuaire_lot WHERE id = $1')) return r(lots.some((l) => l.id === p[0]) ? [{}] : []);
  if (s.includes('FROM gestion_lot_annexe WHERE annexe_id = $1')) {
    const parent = annexes.get(Number(p[0]));
    return r(parent === undefined ? [] : [{ p: String(parent), parent: String(parent) }]);
  }
  if (s.includes('FROM gestion_bien_regroupement WHERE clos_le IS NULL AND $1 = ANY(lot_ids) ORDER BY id DESC')) {
    const g = lignes.filter((x) => x.clos === null && x.lots.includes(Number(p[0]))).sort((a, b) => b.id - a.id)[0];
    return r(g === undefined ? [] : [{ id: String(g.id), tete_id: String(g.tete), lot_ids: g.lots.map(String) }]);
  }
  if (s.startsWith('SELECT annexe_detachee_le IS NOT NULL AS d FROM gestion_annuaire_lot')) return r([{ d: lots.find((l) => l.id === p[0])?.detache !== null }]);
  if (s.startsWith('SELECT a.annexe_id::text AS id FROM gestion_lot_annexe a')) {
    return r([...annexes].filter(([, par]) => par === p[0]).map(([a]) => a).filter((a) => lots.find((l) => l.id === a)?.detache === null).sort((x, y) => x - y).map((a) => ({ id: String(a) })));
  }
  if (s.startsWith('SELECT a.annexe_id::text AS id, al.annexe_detachee_le IS NOT NULL AS d')) {
    return r([...annexes].filter(([, par]) => par === p[0]).map(([a]) => a).sort((x, y) => x - y).map((a) => ({ id: String(a), d: lots.find((l) => l.id === a)?.detache !== null })));
  }
  if (s.startsWith('SELECT id FROM gestion_annuaire_lot WHERE id = ANY')) return r([]);
  if (s.includes('FROM gestion_annuaire_lot lo WHERE lo.id = ANY')) {
    return r(lots.filter((l) => (p[0] as number[]).includes(l.id)).map((l) => ({ id: String(l.id), categorie: l.categorie, nature: null, type_bien: null, etage: null,
      porte: l.porte, wippimmo_id: `app-${l.id}`, adresse: '4 rue Fictive', commune: 'Puteaux' })));
  }
  if (s.includes('FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id WHERE o.lot_id = ANY')) {
    return r(occs.filter((o) => o.sortie === null && (p[0] as number[]).includes(o.lot)).map((o) => ({ lot_id: String(o.lot), locataire_id: String(o.loc), nom: noms[o.loc] })));
  }
  if (s.includes("concat_ws(', ', adresse, commune), '') AS t FROM gestion_annuaire_lot")) return r([{ t: `Bien ${p[0]}` }]);
  if (s.startsWith('SELECT DISTINCT coalesce((SELECT a.parent_id')) {
    return r([...new Set((p[0] as number[]).map((id) => annexes.get(id) ?? id))].map((o) => ({ o: String(o) })));
  }
  if (s.startsWith('UPDATE gestion_annuaire_lot SET annexe_detachee_le')) {
    const l = lots.find((x) => x.id === p[0])!;
    l.detache = s.includes('coalesce(annexe_detachee_le, now())') ? (l.detache ?? '2026-10-19T10:00:00Z') : null;
    return r([]);
  }
  if (s.startsWith('INSERT INTO gestion_journal')) { journal.push({ action: String(p[1]), id: Number(p[0]) }); return r([]); }
  if (s.startsWith('SELECT 1 FROM gestion_bien_regroupement WHERE clos_le IS NULL')) return r(lignes.filter((x) => x.clos === null && x.lots.includes(Number(p[0]))).map(() => ({})));
  if (s.startsWith('INSERT INTO gestion_bien_regroupement')) {
    const unSeul = s.includes('ARRAY[$2]');
    lignes.push({ id: lignes.length + 40, origine: Number(p[0]), tete: Number(p[1]), lots: unSeul ? [Number(p[1])] : (p[2] as number[]),
      motif: String(unSeul ? p[2] : p[3]), clos: null, statut: null });
    return r([]);
  }
  if (s.startsWith('SELECT id::text, lot_ids::text[] AS lot_ids FROM gestion_bien_regroupement')) {
    return r(lignes.filter((x) => x.clos === null && x.lots.includes(Number(p[0]))).map((g) => ({ id: String(g.id), lot_ids: g.lots.map(String) })));
  }
  if (s.startsWith('UPDATE gestion_bien_regroupement SET clos_le = now()')) {
    const g = lignes.find((x) => x.id === p[0] && x.clos === null);
    if (g) { g.clos = '2026-10-19'; g.statut = s.includes("'reintegre'") ? 'reintegre' : 'remplace'; }
    return r([]);
  }
  return r([]);
}
const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn((sql: string, params?: unknown[]) => query(sql, params ?? [])),
}));
vi.mock('./sondeLocation', () => ({ colonneExisteMemo: async (table: string, col: string) => !(table === 'gestion_annuaire_lot' && col === 'sorti_portefeuille_le') }));

import { appliquerPlan, lireFiche, reintegrerSiComplet } from './regroupementRepo';
import { detacherAnnexe } from './entretienAnnexeRepo';
import { planifierBail } from './regroupement';

const AUTEUR = { id: 3, libelle: 'arno@exemple.fr' };
const q = (sql: string, params?: unknown[]) => query(sql, params ?? []);

beforeEach(() => {
  // L'appartement (1) + la cave n°3 (3) + le parking n°14 (14) : une fiche d'origine.
  lots = [{ id: 1, categorie: 'logement', porte: null, detache: null }, { id: 3, categorie: 'cave', porte: '3', detache: null },
    { id: 14, categorie: 'parking', porte: '14', detache: null }];
  annexes = new Map([[3, 1], [14, 1]]);
  occs = []; lignes = []; journal = []; deletes = [];
});

async function bail(lotChoisi: number, coches: number[], locataires: number[]): Promise<string[]> {
  const fiche = (await lireFiche(q as never, lotChoisi, true))!;
  const plan = planifierBail(fiche, coches);
  if (!plan.ok) throw new Error(plan.motif);
  for (const loc of locataires) for (const l of plan.plan.lotsLoues) occs.push({ id: occs.length + 100, lot: l, loc, sortie: null });
  await appliquerPlan(q as never, fiche, plan.plan, AUTEUR);
  return reintegrerSiComplet(q as never, plan.plan.lotsLoues, AUTEUR);
}

describe('le bail d’un nouveau locataire sur une partie des lots', () => {
  it('logement non coché : la cave et le parking forment UNE nouvelle fiche (lien de parenté gardé) ; l’appartement reste seul dans la sienne', async () => {
    await bail(1, [3, 14], [5]);
    expect(lignes).toEqual([{ id: 40, origine: 1, tete: 3, lots: [3, 14], motif: 'bail', clos: null, statut: null }]);
    expect(lots.filter((l) => l.detache !== null).map((l) => l.id)).toEqual([3, 14]);
    // Le lien annexe → logement n'a pas bougé.
    expect([...annexes]).toEqual([[3, 1], [14, 1]]);
    const cave = (await lireFiche(q as never, 3))!;
    expect(cave).toMatchObject({ sorte: 'regroupement', origineId: 1, teteId: 3 });
    expect(cave.lots.map((l) => l.id)).toEqual([3, 14]);
    const appart = (await lireFiche(q as never, 1))!;
    expect(appart).toMatchObject({ sorte: 'origine' });
    expect(appart.lots.map((l) => l.id)).toEqual([1]);
    expect(journal.filter((j) => j.action === 'location_annexe_detachee').length).toBeGreaterThan(0);
  });

  it('logement coché, parking décoché et libre : le parking devient un bien autonome (sa fiche, lien gardé)', async () => {
    await bail(1, [1, 3], [5]);
    expect(lignes).toEqual([{ id: 40, origine: 1, tete: 14, lots: [14], motif: 'orphelin', clos: null, statut: null }]);
    expect((await lireFiche(q as never, 1))!.lots.map((l) => l.id)).toEqual([1, 3]);
    expect((await lireFiche(q as never, 14))!).toMatchObject({ sorte: 'regroupement', origineId: 1 });
  });
});

describe('la réintégration automatique', () => {
  it('tous les lots de nouveau loués aux MÊMES locataires : ils se réunissent ; la fiche autonome est « réintégrée », jamais effacée', async () => {
    await bail(1, [3, 14], [5, 6]);
    expect(lignes[0].clos).toBeNull();
    const messages = await bail(1, [1], [5, 6]);
    expect(messages).toEqual(['Réintégration : la cave n°3, le parking n°14 reviennent dans la fiche de Bien 1 — tous ses lots sont loués aux mêmes locataires.']);
    expect(lots.every((l) => l.detache === null)).toBe(true);
    expect(lignes).toEqual([expect.objectContaining({ id: 40, clos: '2026-10-19', statut: 'reintegre' })]);
    expect((await lireFiche(q as never, 3))!.lots.map((l) => l.id)).toEqual([1, 3, 14]);
    expect(journal.filter((j) => j.action === 'location_annexe_reintegree').map((j) => j.id).sort((a, b) => a - b)).toEqual([1, 1, 3, 14]);
    expect(deletes).toEqual([]);
  });

  it('pas de réintégration si les locataires diffèrent', async () => {
    await bail(1, [3, 14], [5]);
    expect(await bail(1, [1], [9])).toEqual([]);
    expect(lignes[0].clos).toBeNull();
  });
});

describe('« Détacher » existant = le même effet que le détachement automatique', () => {
  it('le bouton pose la même marque, ouvre la même fiche autonome, journalise pareil ; « Rattacher » la clôt (réintégrée)', async () => {
    expect(await detacherAnnexe(14, true, AUTEUR)).toEqual({ etat: 'ok', data: undefined });
    expect(lots.find((l) => l.id === 14)!.detache).not.toBeNull();
    expect(lignes).toEqual([{ id: 40, origine: 1, tete: 14, lots: [14], motif: 'detacher', clos: null, statut: null }]);
    expect(journal.map((j) => j.action)).toEqual(['location_annexe_detachee', 'location_annexe_detachee']);
    await detacherAnnexe(14, false, AUTEUR);
    expect(lignes[0]).toMatchObject({ statut: 'reintegre' });
    expect(deletes).toEqual([]);
  });

  it('une seule implémentation : le geste et l’automatique passent par detacherAnnexeDans ; aucune écriture Drive', () => {
    const geste = readFileSync('app/lib/location/entretienAnnexeRepo.ts', 'utf8');
    const repo = readFileSync('app/lib/location/regroupementRepo.ts', 'utf8');
    expect(geste).toMatch(/export async function detacherAnnexe\([\s\S]*?detacherAnnexeDans\(q, annexeId, detacher, auteur/);
    expect(repo.match(/detacherAnnexeDans\(/g)!.length).toBeGreaterThanOrEqual(2);
    expect(repo).not.toMatch(/UPDATE gestion_annuaire_lot SET annexe_detachee_le/);
    for (const src of [geste, repo]) expect(src).not.toMatch(/from '\.\.\/gestion\/drive|googleapis/);
    expect(repo).toContain("POINT D'ACCROCHE FUTUR");
  });
});
