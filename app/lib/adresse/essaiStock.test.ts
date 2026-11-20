import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyserAdresse, deciderRapprochement, type CandidatBan } from './rapprochementBan';
import type { RapprochementComplet } from './banRepo';
import { construireRapport, csvEcritures, csvReunions, htmlRapport, texteResume, type BienLu } from './essaiStock';
import { cleImmeuble } from '../gestion/syndics';

/** 🔴🔴 Arno (20/11/2026, lot 3) — l'essai du stock : le rapport (le 54 réuni en une seule adresse), et la preuve qu'il n'écrit rien. */
const h = vi.hoisted(() => ({ sql: [] as string[], lectureSeule: 'on', comptes: { n: 0 } }));
const q = vi.hoisted(() => async (sql: string, p: unknown[] = []) => {
  const s = sql.replace(/\s+/g, ' ').trim(); h.sql.push(s);
  if (s.startsWith('SELECT current_database() AS base')) return { rows: [{ base: 'svav_recette', lecture_seule: h.lectureSeule }] };
  if (s.startsWith('SELECT to_regclass($1)::text AS t')) return { rows: [{ t: p[0] }] };
  if (s.startsWith('SELECT count(*)::text AS n FROM')) return { rows: [{ n: '7' }] };
  if (s.startsWith('SELECT id::text, immeuble, adresse, code_postal, commune FROM gestion_annuaire_lot')) {
    return { rows: [{ id: '1', immeuble: '54 Avneue Puvis de Chavannes', adresse: null, code_postal: '92400', commune: 'Courbevoie' }] };
  }
  return { rows: [] };
});
vi.mock('../db/client', () => ({ query: q }));
vi.mock('../gestion/regroupementCoproprietesRepo', () => ({ regroupementsEnCours: async () => [] }));
vi.mock('./banRepo', () => ({ rapprocherBien: async () => complet('54 Avneue Puvis de Chavannes', [PUVIS]) }));
import { essaiDuStock } from './essaiStockRepo';

const PUVIS: CandidatBan = { id: '92026_7184_00054', numero: 54, suffixe: null, nomVoie: 'Avenue Puvis De Chavannes', insee: '92026', commune: 'Courbevoie', x: 1, y: 2 };
function complet(texte: string, candidats: CandidatBan[] | null): RapprochementComplet {
  return { ...deciderRapprochement(analyserAdresse(texte, 'Courbevoie'), candidats), insee: '92026', codePostal: '92400', parcelle: '920260000AB0012', texteSource: texte };
}
const SIX = [['54 avenue du Puvis de Chavannes / AUGIER', 29], ['54 avenue Puvis de Chavannes', 38], ['54 avenue Puvis de Chavannes (HARY)', 4],
  ['54 avenue puvis de Chavannes, 92400, Courbevoie', 1], ['54 Avneue Puvis de Chavannes', 1], ['54 Puvis de Chavannes', 3]] as const;

/** Le portefeuille d'essai : les 76 biens du 54 (six écritures), deux biens au 56, un bien à une plage de numéros, un bien sans numéro. */
function portefeuille(regroupe: boolean) {
  const biens: BienLu[] = [];
  const rapprochements = new Map<number, RapprochementComplet>();
  let id = 0;
  for (const [texte, n] of SIX) for (let i = 0; i < n; i++) { biens.push({ id: ++id, immeuble: texte, adresse: null, codePostal: '92400', commune: 'Courbevoie' }); rapprochements.set(id, complet(texte, [PUVIS])); }
  const au56 = { ...PUVIS, id: '92026_7184_00056', numero: 56 };
  for (let i = 0; i < 2; i++) { biens.push({ id: ++id, immeuble: '56 avenue Puvis de Chavannes', adresse: null, codePostal: '92400', commune: 'Courbevoie' }); rapprochements.set(id, complet('56 avenue Puvis de Chavannes', [au56])); }
  biens.push({ id: ++id, immeuble: '28-32 avenue Marceau', adresse: null, codePostal: '92400', commune: 'Courbevoie' });
  rapprochements.set(id, complet('28-32 avenue Marceau', [{ ...PUVIS, id: '92026_6120_00028', numero: 28, nomVoie: 'Avenue Marceau' }]));
  biens.push({ id: ++id, immeuble: 'rue camille deschanel', adresse: null, codePostal: '92400', commune: 'Courbevoie' });
  rapprochements.set(id, complet('rue camille deschanel', null));
  // le regroupement 504 : les cinq autres écritures, adresses secondaires de « … , 92400, Courbevoie »
  const principale = SIX[3][0];
  const principaleDe = new Map<string, string>(regroupe ? SIX.filter(([t]) => t !== principale).map(([t]) => [cleImmeuble(t), cleImmeuble(principale)]) : []);
  return { biens, rapprochements, principaleDe, coproprietes: regroupe ? [cleImmeuble(principale)] : [],
    regroupements: regroupe ? [{ id: 9, cle: cleImmeuble(principale), principale, regroupees: SIX.filter(([t]) => t !== principale).map(([t]) => t) }] : [] };
}

describe('le rapport de l’essai', () => {
  it('le 54 avenue Puvis de Chavannes : six écritures RÉUNIES sous une seule adresse officielle (76 biens) ; le 56 reste à part', () => {
    const r = construireRapport(portefeuille(false));
    const [reunion] = r.reunions;
    expect(r.reunions).toHaveLength(1);
    expect([reunion.banId, reunion.officielle, reunion.biens, reunion.ecritures.length, reunion.dejaUneCopropriete]).toEqual(['92026_7184_00054', '54 Avenue Puvis De Chavannes', 76, 6, false]);
    // copropriétés : 6 (le 54) + le 56 + la plage + sans numéro = 9 aujourd'hui ; après : le 54 n'en fait plus qu'une
    expect(r.coproprietes).toEqual({ avant: 9, apres: 4 });
    expect(r.biens).toEqual({ total: 80, certains: 78, aVerifier: 1, introuvables: 1 });
    expect(r.ecritures).toEqual({ total: 9, certaines: 7, aVerifier: 1, introuvables: 1 });
    // les écritures à vérifier et introuvables d'abord, avec leur motif
    expect(r.lignes.slice(0, 2).map((l) => [l.ecriture, l.statut])).toEqual([['28-32 avenue Marceau', 'a_verifier'], ['rue camille deschanel', 'introuvable']]);
  });
  it('déjà regroupé par la 504 : une seule copropriété aujourd’hui, le regroupement ABSORBÉ (même adresse officielle certaine)', () => {
    const r = construireRapport(portefeuille(true));
    expect(r.coproprietes).toEqual({ avant: 4, apres: 4 });
    expect(r.reunions[0].dejaUneCopropriete).toBe(true);
    expect(r.regroupements).toEqual([expect.objectContaining({ id: 9, absorbe: true, banId: '92026_7184_00054' })]);
  });
  it('les fichiers lisibles : le CSV (Numbers : point-virgule, BOM), les réunions, la page HTML et le résumé contiennent le 54 réuni', () => {
    const r = construireRapport(portefeuille(true));
    const c = csvEcritures(r);
    expect(c.startsWith('﻿Écriture WIPPIMMO;Code postal;Commune;Biens;Statut;Adresse officielle proposée;Identifiant BAN;Score;Parcelle;Motif;Texte rapproché')).toBe(true);
    expect(c).toContain('54 Avneue Puvis de Chavannes;92400;Courbevoie;1;Certain;54 Avenue Puvis De Chavannes;92026_7184_00054;1,00;920260000AB0012;;');
    expect(c).toContain('28-32 avenue Marceau;92400;Courbevoie;1;À vérifier;28 Avenue Marceau;92026_6120_00028;1,00;920260000AB0012;Plage de numéros');
    expect(csvReunions(r).split('\n').filter((l) => l.includes('92026_7184_00054'))).toHaveLength(6);
    const page = htmlRapport(r, ['Base : essai']);
    expect(page).toContain('<strong>54 Avenue Puvis De Chavannes</strong> <span class="id">92026_7184_00054</span> — 76 bien(s)');
    expect(page).not.toMatch(/<script|https?:\/\//);
    expect(texteResume(r, [])).toContain('n° 9 « 54 avenue puvis de Chavannes, 92400, Courbevoie » : absorbé (92026_7184_00054)');
  });
});

describe('🔴 l’essai n’écrit rien', () => {
  beforeEach(() => { h.sql = []; h.lectureSeule = 'on'; });
  it('connexion en lecture seule exigée ; aucune instruction d’écriture ; les tables comptées avant et après sont identiques', async () => {
    const e = await essaiDuStock();
    expect(e.ok && [e.intact, e.avant.gestion_lot_adresse_ban, e.apres.gestion_lot_adresse_ban, e.rapport.biens.certains]).toEqual([true, 7, 7, 1]);
    expect(h.sql.filter((s) => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)/i.test(s))).toEqual([]);
    expect(h.sql.filter((s) => s.startsWith('SELECT count(*)::text AS n FROM'))).toHaveLength(12);
  });
  it('une connexion qui n’est pas en lecture seule : refus, et RIEN n’est lu au-delà', async () => {
    h.lectureSeule = 'off';
    expect(await essaiDuStock()).toEqual({ ok: false, motif: 'La connexion à « svav_recette » n’est pas en lecture seule : rien n’est fait.' });
    expect(h.sql).toHaveLength(1);
  });
});
