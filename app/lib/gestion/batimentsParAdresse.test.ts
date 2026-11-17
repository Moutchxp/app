import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { planBatimentsParAdresse, texteRapportBatiments, type BatimentLu, type CoproLue } from './batimentsParAdresse';

/**
 * 🔴🔴 Arno (17/11/2026, « Adresses multiples d'une copropriété », lot 2) — la reprise des bâtiments par adresse, À BLANC : « chaque bâtiment → son adresse
 * et la règle qui l'a déduite, plus la liste « à préciser » et les séparations » ; « 1. Bâtiment dont l'adresse n'est pas déductible → « adresse à
 * préciser » sur la fiche Copropriété, choix par Arno ; jamais deviné. 2. Bâtiment trouvé à deux adresses → séparé automatiquement en deux bâtiments
 * distincts (un par adresse), listé dans le rapport. » MODULE PUR.
 */
const UNE: CoproLue = { id: 1, libelle: '7 rue _TEST Digicode', adresses: [{ cle: '7 rue test digicode', libelle: '7 rue _TEST Digicode' }] };
const DEUX: CoproLue = { id: 2, libelle: '7 rue _TEST X', adresses: [{ cle: '7 rue test x', libelle: '7 rue _TEST X' }, { cle: '9 rue test x', libelle: '9 rue _TEST X' }] };
const B = (id: number, coproId: number, libelle: string, adresseCle: string | null = null): BatimentLu => ({ id, coproId, cle: libelle.toLowerCase(), libelle, adresseCle });
const plan = (bats: BatimentLu[], digi: { adresseCle: string; batimentCle: string }[] = [], biens: { lotId: number; batimentId: number; immeuble: string | null; adresse: string | null }[] = []) =>
  planBatimentsParAdresse([UNE, DEUX], bats, digi, biens);

describe('🔴 chaque bâtiment → son adresse, et la règle', () => {
  it('une copropriété à UNE adresse : c’est la sienne (même sans preuve)', () => {
    expect(plan([B(10, 1, 'A')]).map((d) => [d.regle, d.adresseCle])).toEqual([['adresse_unique', '7 rue test digicode']]);
  });
  it('déjà rattaché : rien ne change', () => {
    expect(plan([B(10, 2, 'A', '9 rue test x')]).map((d) => [d.regle, d.adresseCle])).toEqual([['deja', '9 rue test x']]);
  });
  it('plusieurs adresses : ses DIGICODES à une seule adresse ; ses BIENS reliés à une seule adresse ; les deux d’accord', () => {
    expect(plan([B(10, 2, 'A')], [{ adresseCle: '9 rue test x', batimentCle: 'a' }])[0]).toMatchObject({ regle: 'digicodes', adresseCle: '9 rue test x' });
    expect(plan([B(10, 2, 'A')], [], [{ lotId: 5, batimentId: 10, immeuble: '9 rue _TEST X', adresse: '9 rue _TEST X' }])[0]).toMatchObject({ regle: 'biens_relies', adresseCle: '9 rue test x', lotsGardes: [5] });
    expect(plan([B(10, 2, 'A')], [{ adresseCle: '9 rue test x', batimentCle: 'a' }], [{ lotId: 5, batimentId: 10, immeuble: null, adresse: '9 rue _TEST X' }])[0])
      .toMatchObject({ regle: 'digicodes_et_biens', adresseCle: '9 rue test x' });
  });
  it('🔴 aucune preuve : « adresse à préciser » — JAMAIS deviné', () => {
    expect(plan([B(10, 2, 'C')])[0]).toMatchObject({ regle: 'a_preciser', adresseCle: null, nouveaux: [] });
  });
  it('🔴 trouvé à DEUX adresses : SÉPARÉ — l’existant garde la première adresse (la principale) et son historique, un nouveau bâtiment pour l’autre ; chaque bien suit SON adresse', () => {
    const d = plan([B(10, 2, 'A')], [{ adresseCle: '9 rue test x', batimentCle: 'a' }],
      [{ lotId: 5, batimentId: 10, immeuble: '7 rue _TEST X', adresse: null }, { lotId: 6, batimentId: 10, immeuble: '9 rue _TEST X', adresse: null }])[0];
    expect(d).toMatchObject({ regle: 'separation', adresseCle: '7 rue test x', lotsGardes: [5], nouveaux: [{ adresseCle: '9 rue test x', lots: [6] }] });
  });
  it('une preuve hors des adresses de la copropriété n’est jamais une adresse : elle est SIGNALÉE', () => {
    const d = plan([B(10, 2, 'A')], [{ adresseCle: '11 rue ailleurs', batimentCle: 'a' }], [{ lotId: 7, batimentId: 10, immeuble: '11 rue Ailleurs', adresse: null }])[0];
    expect(d).toMatchObject({ regle: 'a_preciser', adresseCle: null, horsAdresses: [{ lotId: 7, adresse: '11 rue Ailleurs' }] });
  });
  it('un digicode d’un AUTRE bâtiment ne compte pas', () => {
    expect(plan([B(10, 2, 'A')], [{ adresseCle: '9 rue test x', batimentCle: 'b' }])[0].regle).toBe('a_preciser');
  });
});

describe('🔴 le rapport à blanc', () => {
  it('le résumé, chaque bâtiment avec sa règle, « À PRÉCISER », « SÉPARATIONS », « SIGNALÉS » ; il le dit : aucune écriture', () => {
    const d = plan([B(10, 1, 'A'), B(11, 2, 'A'), B(12, 2, 'C')], [{ adresseCle: '7 rue test x', batimentCle: 'a' }, { adresseCle: '9 rue test x', batimentCle: 'a' }]);
    const t = texteRapportBatiments(d, 'svav_recette', '17/11/2026 23:00:00');
    expect(t).toContain('AUCUNE ÉCRITURE : ce rapport dit ce que la reprise ferait ; rien n’est repris avant la validation d’Arno.');
    expect(t).toContain('  Bâtiments au registre : 3');
    expect(t).toContain('  Séparés (trouvés à plusieurs adresses) : 1 — 1 nouveau(x) bâtiment(s)');
    expect(t).toContain('  Adresse à préciser (choix par Arno) : 1');
    expect(t).toContain('  · 7 rue _TEST Digicode — bâtiment A (n° 10) → 7 rue _TEST Digicode — la copropriété n’a qu’une adresse');
    expect(t).toContain('  · 7 rue _TEST X — bâtiment C (n° 12) ; adresses possibles : 7 rue _TEST X ; 9 rue _TEST X');
    expect(t).toContain('      + nouveau bâtiment A à 9 rue _TEST X');
  });
  it('le script est en LECTURE SEULE : garde des verbes d’écriture, session en lecture seule, rapport dans .captures/copropriete/', () => {
    const src = readFileSync(new URL('../../scripts/batiments-par-adresse.ts', import.meta.url), 'utf8');
    expect(src).toContain("await query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');");
    expect(src).toContain('GARDE_LECTURE_SEULE();');
    expect(src).toContain("cheminRapport({ nomScript: 'copropriete', demande, prefixe: 'batiments-par-adresse-a-blanc' })");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !l.trimStart().startsWith('//') && !l.includes('VERBES_INTERDITS')).join('\n').toUpperCase();
    for (const v of ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT']) expect(code, v).not.toContain(v);
  });
});
