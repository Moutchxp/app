import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * RAPPROCHEMENT DES BIENS — le dépôt, sur une petite BASE SIMULÉE : lire la décision qui fait foi, décider (Valider, Corriger
 * parmi les candidats, Aucun rattachement), charger un calcul une seule fois. RIEN d'autre n'est écrit : ni UPDATE, ni
 * DELETE, ni `gestion_annuaire_lot` (le repointage est l'étape F). Données fictives.
 */
interface Prop { id: number; calcul: string; lot_id: number; dossier_id: string | null; niveau: string; candidats: { id: string; nom: string }[] }
interface Dec { id: number; proposition_id: number; geste: string; dossier_id: string | null; libelle: string }
let props: Prop[]; let decs: Dec[]; let ecritures: string[]; let schema: boolean;

function repondre(sqlBrut: string, p: unknown[]): { rows: unknown[]; rowCount: number } {
  const s = sqlBrut.replace(/\s+/g, ' ').trim();
  const r = (rows: unknown[]) => ({ rows, rowCount: rows.length });
  if (/^(INSERT|UPDATE|DELETE|TRUNCATE|LOCK)\b/.test(s)) ecritures.push(s.slice(0, 70));
  if (s.startsWith('SELECT count(*)::int AS n FROM information_schema.columns')) return r([{ n: schema ? 1 : 0 }]);
  if (s.startsWith('SELECT calcul FROM gestion_rapprochement_bien_proposition')) return r(props.length ? [{ calcul: props[props.length - 1].calcul }] : []);
  if (s.startsWith('SELECT p.id::text, p.lot_id::text')) {
    return r(props.filter((x) => x.calcul === p[0]).map((x) => {
      const d = [...decs].reverse().find((y) => y.proposition_id === x.id);
      return { id: String(x.id), lot_id: String(x.lot_id), lot_wippimmo_id: String(300 + x.lot_id), adresse: '1 rue A, VILLE', proprietaire_id: '7', proprietaire: 'FICHE',
        dossier_id: x.dossier_id, dossier_nom: 'Dossier', niveau: x.niveau, raison: 'commune Ville', candidats: x.candidats,
        geste: d?.geste ?? null, d_dossier_id: d?.dossier_id ?? null, decide_le: d ? '2026-10-19T12:00:00Z' : null, decide_par: d?.libelle ?? null,
        n: decs.filter((y) => y.proposition_id === x.id).length };
    }));
  }
  if (s.startsWith('SELECT dossier_id, candidats FROM gestion_rapprochement_bien_proposition WHERE id = $1 FOR UPDATE')) {
    const x = props.find((y) => y.id === p[0]);
    return r(x ? [{ dossier_id: x.dossier_id, candidats: x.candidats }] : []);
  }
  if (s.startsWith('INSERT INTO gestion_rapprochement_bien_decision')) {
    decs.push({ id: decs.length + 1, proposition_id: Number(p[0]), geste: String(p[1]), dossier_id: p[2] as string | null, libelle: String(p[4]) });
    return r([]);
  }
  if (s.startsWith('LOCK TABLE gestion_rapprochement_bien_proposition')) return r([]);
  if (s.startsWith('SELECT count(*)::int AS n FROM gestion_rapprochement_bien_proposition WHERE calcul')) return r([{ n: props.filter((x) => x.calcul === p[0]).length }]);
  if (s.startsWith('INSERT INTO gestion_rapprochement_bien_proposition')) {
    props.push({ id: props.length + 1, calcul: String(p[0]), lot_id: Number(p[1]), dossier_id: p[4] as string | null, niveau: String(p[6]), candidats: JSON.parse(String(p[8])) });
    return r([]);
  }
  throw new Error(`SQL inattendu : ${s.slice(0, 120)}`);
}
const query = vi.fn(async (sql: string, params: unknown[] = []) => repondre(sql, params));
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => query(sql, params ?? []),
  withTransaction: async (fn: (q: unknown) => Promise<unknown>) => fn((sql: string, params?: unknown[]) => query(sql, params ?? [])),
}));
const { chargerPropositionsBiens, deciderRapprochementBien, lireRapprochementBiens } = await import('./rapprochementBiensRepo');
const { oublierSchemaLocation } = await import('../location/sondeLocation');
const ARNO = { id: 1, libelle: 'Arno' };
const CAND = [{ id: 'dossierA00001', nom: 'Nom (A)' }, { id: 'dossierB00001', nom: 'Nom (B)' }];

beforeEach(() => {
  schema = true; ecritures = []; decs = []; oublierSchemaLocation();
  props = [{ id: 1, calcul: 'c1', lot_id: 10, dossier_id: 'dossierA00001', niveau: 'PROBABLE', candidats: CAND },
    { id: 2, calcul: 'c1', lot_id: 11, dossier_id: null, niveau: 'AMBIGU', candidats: CAND }];
});

describe('rapprochement des biens — le dépôt', () => {
  it('sans la migration 388 : « sans_schema », et aucun geste ne passe', async () => {
    schema = false;
    expect(await lireRapprochementBiens()).toEqual({ etat: 'sans_schema' });
    expect(await deciderRapprochementBien(1, 'valider', null, ARNO)).toEqual({ ok: false, motif: 'La migration 388 n’est pas appliquée.' });
    expect(ecritures).toEqual([]);
  });
  it('Valider, puis Corriger : la plus récente fait foi, le dossier corrigé est nommé ; seules des décisions sont écrites', async () => {
    expect(await deciderRapprochementBien(1, 'valider', null, ARNO)).toEqual({ ok: true });
    expect(await deciderRapprochementBien(1, 'corriger', 'dossierB00001', ARNO)).toEqual({ ok: true });
    const l = await lireRapprochementBiens();
    if (l.etat !== 'ok') throw new Error('lecture');
    expect(l.lignes[0].decision).toMatchObject({ geste: 'corriger', dossierId: 'dossierB00001', dossierNom: 'Nom (B)', decidePar: 'Arno' });
    expect(l.lignes[0].nbDecisions).toBe(2);
    expect(ecritures.every((e) => e.startsWith('INSERT INTO gestion_rapprochement_bien_decision'))).toBe(true);
  });
  it('refus AVANT toute écriture : Valider un AMBIGU, Corriger hors des dossiers du propriétaire, proposition inconnue', async () => {
    expect(await deciderRapprochementBien(2, 'valider', null, ARNO)).toMatchObject({ ok: false, motif: expect.stringMatching(/Aucun dossier n’est proposé/) });
    expect(await deciderRapprochementBien(1, 'corriger', 'racine000000x', ARNO)).toMatchObject({ ok: false });
    expect(await deciderRapprochementBien(99, 'aucun', null, ARNO)).toEqual({ ok: false, motif: 'Proposition inconnue.' });
    expect(ecritures).toEqual([]);
  });
  it('« Aucun rattachement » s’enregistre sans dossier', async () => {
    expect(await deciderRapprochementBien(2, 'aucun', null, ARNO)).toEqual({ ok: true });
    expect(decs).toEqual([{ id: 1, proposition_id: 2, geste: 'aucun', dossier_id: null, libelle: 'Arno' }]);
  });
  it('charger : une fois par calcul ; le second chargement est refusé', async () => {
    const p = [{ lot_id: 12, lot_wippimmo_id: '312', proprietaire_id: 7, dossier_id: 'dossierA00001', dossier_nom: 'Nom (A)', niveau: 'SUR' as const, raison: 'commune A', candidats: CAND }];
    expect(await chargerPropositionsBiens('c2', p)).toEqual({ ok: true, nombre: 1 });
    expect(await chargerPropositionsBiens('c2', p)).toEqual({ ok: false, motif: 'Le calcul « c2 » est déjà chargé.' });
    expect(ecritures.some((e) => /gestion_annuaire_lot|UPDATE|DELETE/.test(e))).toBe(false);
  });
});
