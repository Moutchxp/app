import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * LOT 100 — origine (auto/manuelle) de l'extraction NON-IA. On éprouve les briques PARTAGÉES par tous les writers :
 *  · `origineDepuisMajPar` (PURE) : mapping majPar → axe ;
 *  · `suffixeOrigine` : greffe la colonne SEULEMENT si elle existe (résilience migration 196), avec le bon placeholder ;
 *  · `lireOrigineExtractionSansIa` : origine de la dernière ligne non-IA, résilient (colonne/table absente → null).
 * On asserte le COMPORTEMENT et les PARAMÈTRES liés, jamais la forme exacte du SQL.
 */
const H = vi.hoisted(() => {
  const state = { rows: [] as { origine: string | null }[], jette: false };
  const queryMock = vi.fn(async (sql: string) => {
    if (state.jette) { const e = new Error('boom') as Error & { code: string }; e.code = '42703'; throw e; }
    void sql; return { rows: state.rows, rowCount: state.rows.length };
  });
  return { state, queryMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { origineDepuisMajPar, suffixeOrigine, lireOrigineExtractionSansIa, _resetCacheColonneOrigine } from './journalExtraction';

// INVENTAIRE EXHAUSTIF (recon LOT 100) des 9 fichiers qui INSÈRENT dans permis_extraction_journal — chacun DOIT tracer l'origine.
const WRITERS = ['ecritureChamps', 'ecritureCerfa', 'ecritureDesignation', 'ecritureNiveaux', 'ecritureLots', 'ecritureGabaritPlu', 'ecritureCerfaScan', 'cerfaRecapRepo', 'lectureValeursPageRepo'];
const src = (f: string) => readFileSync(fileURLToPath(new URL(`./${f}.ts`, import.meta.url)), 'utf8');

beforeEach(() => { _resetCacheColonneOrigine(); H.state.rows = []; H.state.jette = false; H.queryMock.mockClear(); });

describe('origineDepuisMajPar — mapping PUR, jamais présumé', () => {
  it('analyse:* (passage en Analyse, 56-C) → auto', () => expect(origineDepuisMajPar('analyse:passage:42')).toBe('auto'));
  it('extraction:* (relance admin, gabarit CLI) → manuelle', () => {
    expect(origineDepuisMajPar('extraction:relance:7')).toBe('manuelle');
    expect(origineDepuisMajPar('extraction:gabarit-plu')).toBe('manuelle');
  });
  it('inconnu / vide / null → null (indéterminée, jamais présumé auto)', () => {
    expect(origineDepuisMajPar('admin')).toBeNull();
    expect(origineDepuisMajPar('')).toBeNull();
    expect(origineDepuisMajPar(null)).toBeNull();
    expect(origineDepuisMajPar(undefined)).toBeNull();
  });
});

describe('suffixeOrigine — greffe la colonne UNIQUEMENT si elle existe (résilient migration 196)', () => {
  const qAvec = vi.fn(async () => ({ rows: [{ ok: 1 }], rowCount: 1 }));   // detection → colonne présente
  const qSans = vi.fn(async () => ({ rows: [], rowCount: 0 }));            // detection → colonne absente
  const qErreur = vi.fn(async () => { const e = new Error('no col') as Error & { code: string }; e.code = '42703'; throw e; });
  beforeEach(() => _resetCacheColonneOrigine());

  it('colonne présente → suffixe + placeholder au bon rang + param origine', async () => {
    expect(await suffixeOrigine(12, 'auto', qAvec as never)).toEqual({ cols: ', origine', vals: ', $13', params: ['auto'] });
  });
  it('colonne absente → aucun suffixe (INSERT d’avant, origine « indéterminée »)', async () => {
    expect(await suffixeOrigine(12, 'manuelle', qSans as never)).toEqual({ cols: '', vals: '', params: [] });
  });
  it('détection en ERREUR (42703 / table absente) → repli sûr, aucun suffixe', async () => {
    expect(await suffixeOrigine(10, 'auto', qErreur as never)).toEqual({ cols: '', vals: '', params: [] });
  });
  it('le rang du placeholder suit le nombre de paramètres de base', async () => {
    expect((await suffixeOrigine(6, 'manuelle', qAvec as never)).vals).toBe(', $7');
  });
});

describe('lireOrigineExtractionSansIa — origine de la dernière ligne NON-IA du dossier', () => {
  it('cible les lignes NON-IA et rend l’origine trouvée', async () => {
    H.state.rows = [{ origine: 'auto' }];
    expect(await lireOrigineExtractionSansIa(470)).toBe('auto');
    const sql = (H.queryMock.mock.calls.at(-1)?.[0] as string).replace(/\s+/g, ' ');
    expect(sql).toContain("methode <> 'ia'");       // NON-IA seulement (jamais confondu avec l'IA, toujours manuelle)
    expect(sql).toContain('origine IS NOT NULL');   // ignore les lignes historiques sans origine
  });
  it('aucune ligne tracée → null (indéterminée : lignes historiques / jamais extrait)', async () => {
    H.state.rows = [];
    expect(await lireOrigineExtractionSansIa(470)).toBeNull();
  });
  it('colonne/table absente (42703) → null, jamais une exception (comportement d’avant)', async () => {
    H.state.jette = true;
    expect(await lireOrigineExtractionSansIa(470)).toBeNull();
  });
});

describe('COUVERTURE — chaque writer inventorié trace l’origine (aucun INSERT sans origine une fois la migration passée)', () => {
  it.each(WRITERS)('%s appelle suffixeOrigine sur son INSERT de journal', (f) => {
    const s = src(f);
    // tout fichier qui INSÈRE dans le journal doit greffer l'origine via le suffixe partagé.
    expect(s).toContain('INSERT INTO permis_extraction_journal');
    expect(s).toContain('suffixeOrigine(');
    expect(s).toContain('${og.cols}'); // suffixe de colonnes greffé sur l'INSERT existant
  });
  it('les writers de l’extraction (hors LOT 95 manuel explicite) dérivent l’origine du majPar', () => {
    for (const f of WRITERS.filter((w) => w !== 'lectureValeursPageRepo')) {
      expect(src(f), f).toContain('origineDepuisMajPar(');
    }
    // LOT 95 (bouton « analyse de la page ») : origine 'manuelle' EXPLICITE (geste humain), jamais dérivée d'un majPar.
    expect(src('lectureValeursPageRepo')).toContain("suffixeOrigine(params.length, 'manuelle')");
  });
});
