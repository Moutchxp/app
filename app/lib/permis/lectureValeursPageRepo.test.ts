import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 95 (B2) — persistance de la lecture de valeurs. `db/client` mocké (routé par fragment SQL, whitespace-normalisé) ;
 * `ecrireCaracteristiquesGlobales` mocké (on éprouve le COMPORTEMENT, pas la forme du SQL de l'écriture de colonne). On prouve :
 *   • valeur sûre + champ VIDE → écrite (origine 'extraite') + journal 'ia' 'retenue', confiance 'a_verifier' (jamais 'confirmee') ;
 *   • champ déjà rempli → JAMAIS écrasé (aucune écriture de colonne, journal 'ecartee') ;
 *   • valeur douteuse → « à vérifier » (journal 'candidat', aucune écriture) ;
 *   • rien de lisible → aucune écriture, aucun journal, résumé honnête ;
 *   • réversibilité (annuler si origine 'extraite', jamais une saisie) ;
 *   • résilience migration 195 absente (42P01) → enregistrement no-op, lecture vide.
 */
const H = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const state = {
    valeurActuelle: null as number | null,       // permis_caracteristique.altitude_sommet_ngf actuel (null = champ vide)
    origineActuelle: null as string | null,      // …_origine ('saisie' | 'extraite' | null)
    iaRetenues: 0,                               // nb de lignes 'ia' 'retenue' pour le champ dossier
    ecrits: ['altitudeSommetNgf'] as string[],   // ce que rend ecrireCaracteristiquesGlobales
    pageLectureAbsente: false,                    // true → la table permis_page_lecture jette 42P01
    lectureRows: [] as Record<string, unknown>[],
  };
  const err42P01 = () => { const e = new Error('relation "permis_page_lecture" does not exist') as Error & { code: string }; e.code = '42P01'; throw e; };
  const norm = (s: string) => s.replace(/\s+/g, ' ');
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql: norm(sql), params: params ?? [] });
    const s = norm(sql);
    if (/SELECT altitude_sommet_ngf AS v FROM permis_caracteristique/i.test(s)) return { rows: [{ v: state.valeurActuelle }], rowCount: 1 };
    if (/SELECT altitude_sommet_ngf_origine AS orig FROM permis_caracteristique/i.test(s)) return { rows: [{ orig: state.origineActuelle }], rowCount: 1 };
    if (/count\(\*\)::text AS n FROM permis_extraction_journal/i.test(s)) return { rows: [{ n: String(state.iaRetenues) }], rowCount: 1 };
    if (/(INSERT INTO|SELECT).*permis_page_lecture/i.test(s)) { if (state.pageLectureAbsente) err42P01(); return { rows: state.lectureRows, rowCount: state.lectureRows.length }; }
    return { rows: [], rowCount: 0 }; // DELETE/INSERT journal, UPDATE caracteristique → enregistrés dans `appels`
  };
  const ecrireMock = vi.fn(async () => ({ ecrits: state.ecrits, ignores: [] as string[] }));
  return { appels, state, queryMock, ecrireMock };
});
vi.mock('../db/client', () => ({ query: H.queryMock }));
vi.mock('./caracteristiquesRepo', () => ({ ecrireCaracteristiquesGlobales: H.ecrireMock }));

import { appliquerLectureValeur, annulerLectureValeur, enregistrerLecturePage, lireLecturesPage } from './lectureValeursPageRepo';

const j = () => H.appels.filter((a) => /INSERT INTO permis_extraction_journal/i.test(a.sql));

beforeEach(() => {
  H.appels.length = 0;
  H.ecrireMock.mockClear();
  Object.assign(H.state, { valeurActuelle: null, origineActuelle: null, iaRetenues: 0, ecrits: ['altitudeSommetNgf'], pageLectureAbsente: false, lectureRows: [] });
});

describe('appliquerLectureValeur — écriture d’un champ VIDE + journal ia', () => {
  it('valeur sûre + champ vide → colonne écrite (origine extraite) + journal ia RETENUE, confiance a_verifier (jamais confirmee)', async () => {
    const r = await appliquerLectureValeur(1, { pieceId: 9, pieceNom: 'PC3.pdf', page: 2, valeurLue: { valeur: 61.09, confiance: 'sure', extrait: '+61.09 NGF' }, par: 'admin' });
    expect(r.action).toBe('ecrire'); expect(r.ecrit).toBe(true);
    // écriture de colonne déléguée à ecrireCaracteristiquesGlobales, mode 'extraite' (invariant 103 porté là-bas).
    expect(H.ecrireMock).toHaveBeenCalledWith(1, { altitudeSommetNgf: 61.09 }, 'extraite', 'admin');
    // une ligne de journal 'ia' 'retenue', provenance pièce+page, confiance a_verifier (jamais 'confirmee').
    const ins = j(); expect(ins).toHaveLength(1);
    expect(ins[0].sql).toContain("'ia'"); expect(ins[0].sql).toContain("'a_verifier'");
    expect(ins[0].params).toEqual([1, 'altitude_sommet_ngf', 61.09, 'retenue', null, 'PC3.pdf', 2, '+61.09 NGF']);
    // purge idempotente CIBLÉE de la ligne 'ia' précédente AVANT réécriture.
    expect(H.appels.some((a) => /DELETE FROM permis_extraction_journal.*methode = 'ia'.*champ =/i.test(a.sql))).toBe(true);
  });

  it('champ déjà rempli → JAMAIS écrasé : aucune écriture de colonne, journal ecartee', async () => {
    H.state.valeurActuelle = 55; // champ occupé
    const r = await appliquerLectureValeur(1, { pieceId: 9, pieceNom: 'PC3.pdf', page: 2, valeurLue: { valeur: 61.09, confiance: 'sure', extrait: 'x' }, par: 'admin' });
    expect(r.action).toBe('deja_rempli'); expect(r.ecrit).toBe(false);
    expect(H.ecrireMock).not.toHaveBeenCalled();
    const ins = j(); expect(ins[0].params[3]).toBe('ecartee'); // role
  });

  it('valeur douteuse → « à vérifier » : aucune écriture, journal CANDIDAT', async () => {
    const r = await appliquerLectureValeur(1, { pieceId: 9, pieceNom: 'PC3.pdf', page: 2, valeurLue: { valeur: 61.09, confiance: 'douteuse', extrait: 'x' }, par: 'admin' });
    expect(r.action).toBe('a_verifier'); expect(r.ecrit).toBe(false);
    expect(H.ecrireMock).not.toHaveBeenCalled();
    expect(j()[0].params[3]).toBe('candidat');
  });

  it('rien de lisible (valeur null) → aucune écriture, AUCUN journal, résumé honnête', async () => {
    const r = await appliquerLectureValeur(1, { pieceId: 9, pieceNom: 'PC3.pdf', page: 2, valeurLue: null, par: 'admin' });
    expect(r.action).toBe('rien'); expect(r.ecrit).toBe(false);
    expect(r.resume).toContain('aucune valeur exploitable');
    expect(H.ecrireMock).not.toHaveBeenCalled();
    expect(j()).toHaveLength(0);
  });
});

describe('annulerLectureValeur — réversibilité, jamais une saisie', () => {
  it('origine extraite + ligne ia retenue → annule : vide la colonne + retire la ligne ia', async () => {
    H.state.origineActuelle = 'extraite'; H.state.iaRetenues = 1;
    const r = await annulerLectureValeur(1);
    expect(r).toEqual({ ok: true, annule: true });
    expect(H.appels.some((a) => /UPDATE permis_caracteristique SET altitude_sommet_ngf = NULL/i.test(a.sql))).toBe(true);
    expect(H.appels.some((a) => /DELETE FROM permis_extraction_journal.*methode = 'ia'/i.test(a.sql))).toBe(true);
  });
  it('origine saisie (valeur humaine) → PROTÉGÉE : annule:false, aucune écriture', async () => {
    H.state.origineActuelle = 'saisie'; H.state.iaRetenues = 1;
    const r = await annulerLectureValeur(1);
    expect(r).toEqual({ ok: true, annule: false });
    expect(H.appels.some((a) => /UPDATE permis_caracteristique/i.test(a.sql))).toBe(false);
  });
  it('aucune ligne ia (rien à annuler) → annule:false', async () => {
    H.state.origineActuelle = 'extraite'; H.state.iaRetenues = 0;
    expect(await annulerLectureValeur(1)).toEqual({ ok: true, annule: false });
  });
});

describe('résilience migration 195 (audit daté par page)', () => {
  it('enregistrerLecturePage : table absente (42P01) → false (no-op), jamais une erreur', async () => {
    H.state.pageLectureAbsente = true;
    const ok = await enregistrerLecturePage(1, 9, 2, { envoyee: true, motif: null, nbValeurs: 1, resume: 'x', modele: 'm', modeleResolu: null, tokensIn: 1, tokensOut: 1, coutUsd: 0, par: 'admin' });
    expect(ok).toBe(false);
  });
  it('lireLecturesPage : table absente → Map vide (« jamais analysée »)', async () => {
    H.state.pageLectureAbsente = true;
    expect((await lireLecturesPage(1)).size).toBe(0);
  });
  it('lireLecturesPage : présente → Map par pièce', async () => {
    H.state.lectureRows = [{ piece_id: 9, page: 2, envoyee: true, motif_ecart: null, nb_valeurs: 1, resume: 'ok', cout_usd: 0.000001, cree_le: '2026-09-05T10:00:00Z' }];
    const m = await lireLecturesPage(1);
    expect(m.get(9)).toHaveLength(1);
    expect(m.get(9)![0].page).toBe(2);
  });
});
