import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RAPPROCHEMENT DES DOSSIERS CLIENTS — le dépôt, sur une petite BASE SIMULÉE (propositions, décisions, fiches) : enregistrer,
 * corriger, « Valider tous les SÛRS » refusé tant que les 20 du contrôle ne sont pas validés. On vérifie aussi que RIEN
 * d'autre n'est écrit (ni UPDATE, ni DELETE, ni une autre table). Données fictives.
 */
interface Prop { id: number; calcul: string; sorte: 'dossier' | 'client_sans_dossier'; proprietaire_id: number | null; niveau: string; controle_oeil: boolean; vendu_en_gestion: boolean }
interface Dec { id: number; proposition_id: number; geste: string; proprietaire_id: number | null; en_masse: boolean; libelle: string }
let props: Prop[]; let decs: Dec[]; let ecritures: string[]; let schema: boolean;
const fiches = new Map<number, string>([[1, 'FICHE UN'], [2, 'FICHE DEUX'], [99, 'FICHE CORRIGÉE']]);

function repondre(sqlBrut: string, p: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = sqlBrut.replace(/\s+/g, ' ').trim();
  const r = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  if (/^(INSERT|UPDATE|DELETE|TRUNCATE|LOCK)\b/.test(s)) ecritures.push(s.slice(0, 60));
  if (s.startsWith('SELECT calcul FROM gestion_rapprochement_proposition')) return r(props.length ? [{ calcul: props[props.length - 1].calcul }] : []);
  if (s.startsWith('SELECT id::text, sorte, copie_dossier_id')) {
    return r(props.filter((x) => x.calcul === p[0]).map((x) => ({
      id: String(x.id), sorte: x.sorte, copie_dossier_id: x.sorte === 'dossier' ? `copie-${x.id}` : null, nom_dossier: `DOSSIER ${x.id}`, branche: '1 actifs',
      nb_fichiers: 2, niveau: x.niveau, raison: 'même nom + locataire DUPONT connu', proprietaire_id: x.proprietaire_id === null ? null : String(x.proprietaire_id),
      candidats: [], controle_oeil: x.controle_oeil, vendu_en_gestion: x.vendu_en_gestion, groupe_plusieurs: null, principal: false, dernier_fichier_le: null,
    })));
  }
  if (s.startsWith('SELECT DISTINCT ON (d.proposition_id)')) {
    const der = new Map<number, Dec>();
    for (const d of decs) der.set(d.proposition_id, d);
    return r([...der.values()].map((d) => ({ id: String(d.id), proposition_id: String(d.proposition_id), geste: d.geste,
      proprietaire_id: d.proprietaire_id === null ? null : String(d.proprietaire_id), en_masse: d.en_masse, decide_le: '2026-10-19T10:00:00Z',
      decide_par_libelle: d.libelle, n: decs.filter((x) => x.proposition_id === d.proposition_id).length })));
  }
  if (s.startsWith('SELECT id::text, nom_complet AS nom, drive_dossier_id FROM gestion_annuaire_proprietaire')) {
    return r((p[0] as number[]).filter((id) => fiches.has(id)).map((id) => ({ id: String(id), nom: fiches.get(id), drive_dossier_id: `ancien-${id}` })));
  }
  if (s.startsWith('SELECT sorte, proprietaire_id::text FROM gestion_rapprochement_proposition WHERE id = $1 FOR UPDATE')) {
    const x = props.find((y) => y.id === p[0]);
    return r(x ? [{ sorte: x.sorte, proprietaire_id: x.proprietaire_id === null ? null : String(x.proprietaire_id) }] : []);
  }
  if (s.startsWith('SELECT id::text FROM gestion_annuaire_proprietaire WHERE id = $1 AND supprime_le IS NULL')) return r(fiches.has(Number(p[0])) ? [{ id: String(p[0]) }] : []);
  if (s.startsWith('SELECT id FROM gestion_rapprochement_proposition WHERE calcul = $1 ORDER BY id FOR UPDATE')) return r([]);
  if (s.startsWith('INSERT INTO gestion_rapprochement_decision')) {
    decs.push({ id: decs.length + 1, proposition_id: Number(p[0]), geste: String(p[1]), proprietaire_id: p[2] === null ? null : Number(p[2]), en_masse: Boolean(p[3]), libelle: String(p[5]) });
    return r([]);
  }
  if (s.startsWith('SELECT count(*)::int AS n FROM gestion_rapprochement_proposition WHERE calcul')) return r([{ n: props.filter((x) => x.calcul === p[0]).length }]);
  if (s.startsWith('INSERT INTO gestion_rapprochement_proposition')) {
    props.push({ id: props.length + 1, calcul: String(p[0]), sorte: p[1] as Prop['sorte'], proprietaire_id: p[10] as number | null, niveau: String(p[7]), controle_oeil: Boolean(p[12]), vendu_en_gestion: Boolean(p[13]) });
    return r([]);
  }
  if (s.startsWith('LOCK TABLE')) return r([]);
  throw new Error(`SQL inattendu : ${s.slice(0, 120)}`);
}
const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn((sql: string, params?: unknown[]) => query(sql, params ?? [])),
}));
vi.mock('../location/sondeLocation', () => ({ colonneExisteMemo: async () => schema }));

const { chargerPropositions, deciderRapprochement, lireRapprochement, validerTousLesSurs } = await import('./rapprochementDossiersRepo');
const ARNO = { id: 1, libelle: 'Arno' };

beforeEach(() => {
  schema = true; decs = []; ecritures = [];
  props = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, calcul: '2026-10-19', sorte: 'dossier' as const, proprietaire_id: 1, niveau: 'SUR', controle_oeil: true, vendu_en_gestion: false }));
  props.push({ id: 21, calcul: '2026-10-19', sorte: 'dossier', proprietaire_id: 2, niveau: 'SUR', controle_oeil: false, vendu_en_gestion: false });
  props.push({ id: 22, calcul: '2026-10-19', sorte: 'dossier', proprietaire_id: 2, niveau: 'SUR', controle_oeil: false, vendu_en_gestion: true });
  props.push({ id: 23, calcul: '2026-10-19', sorte: 'dossier', proprietaire_id: null, niveau: 'AUCUN', controle_oeil: false, vendu_en_gestion: false });
});

describe('sans la migration 387 : rien ne tombe, rien n’est écrit', () => {
  it('lecture « sans_schema », décision refusée', async () => {
    schema = false;
    expect(await lireRapprochement()).toEqual({ etat: 'sans_schema' });
    expect(await deciderRapprochement(1, 'valider', null, ARNO)).toEqual({ ok: false, motif: expect.stringMatching(/387/) });
    expect(ecritures).toEqual([]);
  });
});

describe('enregistrer une décision : datée, attribuée, et modifiable par une nouvelle', () => {
  it('Valider pose la fiche PROPOSÉE ; Corriger pose la fiche CHOISIE ; la plus récente fait foi', async () => {
    expect(await deciderRapprochement(21, 'valider', null, ARNO)).toEqual({ ok: true });
    expect(await deciderRapprochement(21, 'corriger', 99, ARNO)).toEqual({ ok: true });
    expect(decs.map((d) => [d.geste, d.proprietaire_id, d.libelle])).toEqual([['valider', 2, 'Arno'], ['corriger', 99, 'Arno']]);
    const lu = await lireRapprochement();
    if (lu.etat !== 'ok') throw new Error(lu.etat);
    const l = lu.lignes.find((x) => x.id === 21)!;
    expect(l.decision?.geste).toBe('corriger');
    expect(l.decision?.fiche?.nom).toBe('FICHE CORRIGÉE');
    expect(l.decision?.decidePar).toBe('Arno');
    expect(l.nbDecisions).toBe(2);
    expect(ecritures.every((e) => e.startsWith('INSERT INTO gestion_rapprochement_decision'))).toBe(true);
  });
  it('refusé AVANT toute écriture : Valider sans fiche proposée, Corriger vers une fiche inconnue, proposition inconnue', async () => {
    expect((await deciderRapprochement(23, 'valider', null, ARNO)).ok).toBe(false);
    expect((await deciderRapprochement(21, 'corriger', 4242, ARNO)).ok).toBe(false);
    expect((await deciderRapprochement(999, 'aucun', null, ARNO)).ok).toBe(false);
    expect(ecritures).toEqual([]);
    expect(await deciderRapprochement(23, 'aucun', null, ARNO)).toEqual({ ok: true });
    expect(decs).toEqual([expect.objectContaining({ proposition_id: 23, geste: 'aucun', proprietaire_id: null })]);
  });
});

describe('« Valider tous les SÛRS »', () => {
  it('REFUSÉ tant que les 20 du contrôle ne sont pas validés — aucune écriture', async () => {
    for (let i = 1; i <= 19; i += 1) await deciderRapprochement(i, 'valider', null, ARNO);
    const avant = decs.length;
    expect(await validerTousLesSurs(ARNO)).toEqual({ ok: false, motif: expect.stringMatching(/19 validé\(s\) sur 20/) });
    expect(decs.length).toBe(avant);
  });
  it('les 20 validés : valide les SÛRS restants, en masse, sauf le « vendu / perdu mais en gestion » ; une 2e fois → rien à faire', async () => {
    for (let i = 1; i <= 20; i += 1) await deciderRapprochement(i, 'valider', null, ARNO);
    expect(await validerTousLesSurs(ARNO)).toEqual({ ok: true, nombre: 1 });
    expect(decs.at(-1)).toEqual(expect.objectContaining({ proposition_id: 21, geste: 'valider', proprietaire_id: 2, en_masse: true }));
    expect(decs.some((d) => d.proposition_id === 22)).toBe(false);
    expect(await validerTousLesSurs(ARNO)).toEqual({ ok: false, motif: expect.stringMatching(/Aucun SÛR/) });
  });
});

describe('le chargement d’un calcul', () => {
  it('refuse un calcul déjà chargé, sans rien écrire', async () => {
    const r = await chargerPropositions('2026-10-19', []);
    expect(r).toEqual({ ok: false, motif: expect.stringMatching(/déjà chargé/) });
    expect(ecritures.filter((e) => e.startsWith('INSERT'))).toEqual([]);
  });
});
