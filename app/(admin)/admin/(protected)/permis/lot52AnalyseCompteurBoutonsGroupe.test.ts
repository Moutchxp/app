import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LOT 52 — trois correctifs après essai réel du LOT 51 :
 *  (1) pastille « Analyse » RE-SOUMISE à l'invariant du LOT 46 « pastille d'onglet == nombre de LIGNES affichées » : elle vaut
 *      EXACTEMENT `compterFileProjection` = `listerFileProjection().length` — le terme PART-E `relancesReponseDue` (dossiers
 *      partiel-actifs SANS ligne, exclus par FIX-2) est RETIRÉ de cet agrégat (défaut ANTÉRIEUR au LOT 51, rendu visible par le
 *      double-compte d'un dossier « testé »).
 *  (2) boutons « Tester le dossier en analyse » et « Renvoyer ce permis dans l’onglet En cours » = action PRINCIPALE : pleine largeur + fond rouge
 *      tokenisé (`svv-btn-primary`), plus d'override `width:'auto'`.
 *  (3) dossiers testés en PREMIÈRE POSITION dans l'onglet Analyse. LOT 54 : le groupe/pli « Test Permis » de tête est RETIRÉ —
 *      la partition (testés d'abord) est conservée, mais le seul signal distinctif est désormais l'EN-TÊTE DE COLONNE du tableau
 *      des testés (« Test permis "En cours" » au lieu de « Permis »).
 * Prédicats/DB non montables unitairement → gardes par LECTURE DE SOURCE (patron `archivesGlobal.test.ts`).
 */
const lire = (p: string): string => readFileSync(join(process.cwd(), p), 'utf8');

describe('LOT 52 (point 1) — pastille « Analyse » == lignes affichées (invariant LOT 46)', () => {
  it('la pastille vaut EXACTEMENT compterFileProjection (aucun terme PART-E ajouté)', () => {
    const s = lire('app/(admin)/api/admin/permis/actions/route.ts');
    expect(s).toContain('const projection = fileProjection;');             // égalité structurelle : pastille = file
    expect(s).not.toContain('fileProjection + relancesReponseDue');        // l'ancien gonflement est retiré
    expect(s).not.toContain('compterRelancesReponseDue');                  // plus importé/appelé ici
  });
  it('compterFileProjection EST, par construction, la longueur de listerFileProjection (une seule vérité)', () => {
    const s = lire('app/lib/permis/projectionFileRepo.ts');
    // Le compteur d'onglet et la liste rendue dérivent de la MÊME fonction → pastille == lignes par construction.
    expect(s.replace(/\s+/g, ' ')).toContain('return (await listerFileProjection(cfg)).length;');
  });
  it('le helper PART-E survit mais n’alimente plus aucune pastille (placement futur possible)', () => {
    const s = lire('app/lib/veille/relanceReponsePartielleAuto.ts');
    expect(s).toContain('export async function compterRelancesReponseDue');
    expect(s).toContain("N'ALIMENTE PLUS la pastille");
  });
});

describe('LOT 52 (point 2) — visibilité des deux boutons (pleine largeur, fond rouge tokenisé)', () => {
  it('« Tester le dossier en analyse » : svv-btn-primary, sans width:auto', () => {
    const s = lire('app/(admin)/admin/(protected)/permis/SuiviDemandes.tsx');
    const idx = s.indexOf('Tester le dossier en analyse</button>'); // ancre sur </button> (le libellé apparaît aussi dans un commentaire)
    expect(idx).toBeGreaterThan(0);
    const bloc = s.slice(Math.max(0, idx - 300), idx);
    expect(bloc).toContain('svv-btn svv-btn-primary');
    expect(bloc).not.toContain("width: 'auto'");
  });
  it('« Renvoyer ce permis dans l’onglet « En cours » » (côté Analyse) : même traitement principal', () => {
    const s = lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx');
    const idx = s.indexOf('Renvoyer ce permis dans l’onglet « En cours »</button>');
    expect(idx).toBeGreaterThan(0);
    const bloc = s.slice(Math.max(0, idx - 300), idx);
    expect(bloc).toContain('svv-btn svv-btn-primary');
    expect(bloc).not.toContain("width: 'auto'");
  });
});

describe('LOT 54 (ex-point 3 du LOT 52) — dossiers testés EN PREMIER, signalés par leur EN-TÊTE DE COLONNE (plus de groupe)', () => {
  const s = lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx');
  it('partitionne la file sur testeEnAnalyse et rend les testés AVANT le reste', () => {
    expect(s).toContain('file.filter((f) => f.testeEnAnalyse)');       // enTest
    expect(s).toContain('file.filter((f) => !f.testeEnAnalyse)');      // reste
    expect(s.indexOf('file={enTest}')).toBeLessThan(s.indexOf('file={reste}')); // testés rendus avant le reste
  });
  it('AUCUN groupe/pli de tête : le titre « Test Permis » a disparu, le signal est l’en-tête de colonne', () => {
    expect(s).not.toContain('Test Permis');                                    // l'en-tête de groupe est retiré
    expect(s).toContain("libellePermis={'Test permis « En cours »'}");         // en-tête de colonne discriminant
  });
  it('les testés n’apparaissent que si NON VIDE et ne font pas mentir « La file est vide »', () => {
    expect(s).toContain('enTest.length > 0 &&');
    expect(s).toContain('reste.length > 0 || file.length === 0');
  });
});
