import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * 🔴 MON ESPACE, LOT 2 (Arno, 02/11/2026) — le n° de mandat : la règle de comparaison (une seule source), la lecture d'un champ, le résumé du
 * refus ; l'ANCIEN SCHÉMA (sans la 449) : rien n'est exigé, rien ne plante, aucune colonne n'est nommée ; le doublon levé par la base devient
 * un refus clair. Le comportement complet (vraies écritures, propagation) : `mandat.itest.ts`, sur une base jetable.
 */
const queryMock = vi.fn();
vi.mock('../db/client', () => ({
  query: (...a: unknown[]) => queryMock(...a),
  withTransaction: (fn: (q: (...a: unknown[]) => unknown) => unknown) => fn((...a: unknown[]) => queryMock(...a)),
}));

import { lireNumeroMandat, MOTIF_MANDAT_OBLIGATOIRE, MOTIF_SANS_449, motifMandatPris, normaliserMandat } from './mandat';
import { estDoublonMandat, INDEX_UNIQUE_MANDAT, venteDuMandat } from './mandatRepo';
import { creerVente } from './repo';
import { lireDossier, lireModification, lireVente } from './saisie';
import { oublierSchemaDroits } from '../admin/schemaDroits';

describe('normaliserMandat — les variantes d’écriture d’un même n° sont reconnues comme le même', () => {
  it('espaces, casse, tirets, points, barres et zéros de tête ignorés', () => {
    const formes = ['M-0042', 'm 42', 'M42', ' m-00042 ', 'M.0042', 'm/42'].map(normaliserMandat);
    expect(new Set(formes)).toEqual(new Set(['M42']));
    expect(normaliserMandat('2024 - 015')).toBe('202415');
    expect(normaliserMandat('2024-015')).toBe(normaliserMandat('2024 / 15')); // chaque suite de chiffres perd ses zéros de tête
    expect(normaliserMandat('00123')).toBe('123');
    expect(normaliserMandat('0')).toBe('0');
    expect(normaliserMandat('Vé-12')).toBe('VE12'); // accents retirés
  });
  it('des n° différents restent différents (pas de rapprochement abusif)', () => {
    expect(normaliserMandat('M42')).not.toBe(normaliserMandat('M420'));
    expect(normaliserMandat('M42')).not.toBe(normaliserMandat('42'));
    expect(normaliserMandat('A1B2')).not.toBe(normaliserMandat('A12B'));
  });
  it('rien de lisible → null', () => {
    expect([normaliserMandat(''), normaliserMandat('  - . / '), normaliserMandat(null), normaliserMandat(undefined)]).toEqual([null, null, null, null]);
  });
});

describe('lireNumeroMandat — le champ du formulaire', () => {
  it('vide → null ; texte → tel que saisi (espaces de bord retirés) et sa forme de comparaison', () => {
    expect(lireNumeroMandat('')).toEqual({ ok: true, valeur: null });
    expect(lireNumeroMandat('   ')).toEqual({ ok: true, valeur: null });
    expect(lireNumeroMandat(undefined)).toEqual({ ok: true, valeur: null });
    expect(lireNumeroMandat('  M-0042  ')).toEqual({ ok: true, valeur: { saisi: 'M-0042', normalise: 'M42' } });
  });
  it('illisible, sans lettre ni chiffre, ou trop long → un motif', () => {
    expect(lireNumeroMandat(42).ok).toBe(false);
    expect(lireNumeroMandat('- / -').ok).toBe(false);
    expect(lireNumeroMandat('X'.repeat(41)).ok).toBe(false);
  });
  it('la saisie d’une affaire le lit (dossier, modification, vente) ; absent : la saisie n’en parle pas', () => {
    const base = { societe: 'criterimmo', statut: 'compromis', honorairesTtc: 1000 };
    const d = lireDossier({ ...base, numeroMandat: ' a12 ' });
    expect(d.ok && d.valeur.numeroMandat).toEqual({ saisi: 'a12', normalise: 'A12' });
    const sans = lireDossier(base);
    expect(sans.ok && 'numeroMandat' in sans.valeur).toBe(false);
    expect(lireDossier({ ...base, numeroMandat: '- -' }).ok).toBe(false);
    const m = lireModification({ numeroMandat: '' });
    expect(m.ok && m.valeur.numeroMandat).toBeNull();
    const v = lireVente({ ...base, libelle: 'X', annee: 2026, mois: null, parts: [], numeroMandat: 'B7' });
    expect(v.ok && v.valeur.numeroMandat).toEqual({ saisi: 'B7', normalise: 'B7' });
  });
});

describe('motifMandatPris — le refus dit quelle vente porte déjà le n°', () => {
  it('compromis en cours : n°, société, libellé, adresse, date du compromis', () => {
    expect(motifMandatPris({ id: 1, societe: 'macj', numero: 'M-0042', libelle: 'DUPONT / MARTIN', statut: 'compromis', dateCompromis: '2026-10-15', dateActe: null,
      adresseBien: '3 rue A, Paris' })).toBe('Ce mandat existe déjà : n° M-0042 chez MACJ — « DUPONT / MARTIN », 3 rue A, Paris, compromis en cours (signé le 15/10/2026). Rien n’a été enregistré.');
  });
  it('vendue : la date de l’acte', () => {
    expect(motifMandatPris({ id: 1, societe: 'criterimmo', numero: '7', libelle: 'X', statut: 'vendue', dateCompromis: null, dateActe: '2026-03-04', adresseBien: null }))
      .toBe('Ce mandat existe déjà : n° 7 chez CRITERIMMO — « X », vendue (acte du 04/03/2026). Rien n’a été enregistré.');
  });
});

describe('🔴 ancien schéma (migration 449 non appliquée) : aucun plantage, rien n’est exigé', () => {
  beforeEach(() => {
    oublierSchemaDroits();
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
      // La sonde : 433 et le reste présents, la colonne de la 449 absente.
      if (String(sql).includes('information_schema.columns')) return { rows: [{ n: params?.[1] === 'numero_mandat_normalise' ? 0 : 1 }] };
      if (String(sql).includes('INSERT INTO transaction_vente ')) return { rows: [{ id: '77' }] };
      return { rows: [{ id: '1' }] };
    });
  });
  const compromis = (o: Record<string, unknown> = {}) => { const v = lireVente({ societe: 'criterimmo', libelle: 'X', honorairesTtc: 1000, statut: 'compromis', annee: 2026, mois: null, parts: [], ...o });
    if (!v.ok) throw new Error(v.motif); return v.valeur; };
  const sqlEmis = (): string => queryMock.mock.calls.map((c) => String(c[0])).filter((x) => !x.includes('information_schema')).join('\n');

  it('un compromis se crée sans n°, comme avant ; aucune colonne du mandat n’est nommée', async () => {
    expect(await creerVente(compromis(), { id: null, libelle: 'essai' })).toEqual({ ok: true, valeur: 77 });
    expect(sqlEmis()).not.toContain('numero_mandat');
  });
  it('un n° envoyé quand même est refusé, rien n’est écrit', async () => {
    expect(await creerVente(compromis({ numeroMandat: 'M1' }), { id: null, libelle: 'essai' })).toEqual({ ok: false, motif: MOTIF_SANS_449 });
    expect(sqlEmis()).not.toContain('INSERT');
  });
  it('la recherche d’un n° répond « libre » sans interroger la colonne', async () => {
    expect(await venteDuMandat('criterimmo', 'M1')).toBeNull();
    expect(sqlEmis()).toBe('');
  });
  it('avec la 449 : un compromis sans n° est refusé AVANT toute écriture', async () => {
    queryMock.mockImplementation(async (sql: string) => (String(sql).includes('information_schema.columns') ? { rows: [{ n: 1 }] } : { rows: [] }));
    expect(await creerVente(compromis(), { id: null, libelle: 'essai' })).toEqual({ ok: false, motif: MOTIF_MANDAT_OBLIGATOIRE });
    expect(sqlEmis()).not.toContain('INSERT');
  });
});

describe('le doublon levé par la base (index unique de la 449)', () => {
  it('reconnu seulement sur SON index (une autre contrainte unique n’est pas un doublon de mandat)', () => {
    expect(estDoublonMandat({ code: '23505', constraint: INDEX_UNIQUE_MANDAT })).toBe(true);
    expect(estDoublonMandat({ code: '23505', constraint: 'transaction_vente_import_cle_key' })).toBe(false);
    expect(estDoublonMandat({ code: '23503', constraint: INDEX_UNIQUE_MANDAT })).toBe(false);
    expect(estDoublonMandat(null)).toBe(false);
  });
});
