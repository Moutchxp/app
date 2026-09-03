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
 *  (3) groupe dynamique « Test Permis » en PREMIÈRE POSITION dans l'onglet Analyse (socle réutilisé, non modifié).
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

describe('LOT 52 (point 3) — groupe « Test Permis » en tête d’Analyse (dynamique, socle réutilisé)', () => {
  const s = lire('app/(admin)/admin/(protected)/permis/ProjectionVue.tsx');
  it('partitionne la file sur testeEnAnalyse et rend le groupe AVANT le reste', () => {
    expect(s).toContain('file.filter((f) => f.testeEnAnalyse)');       // enTest
    expect(s).toContain('file.filter((f) => !f.testeEnAnalyse)');      // reste
    expect(s.indexOf('Test Permis')).toBeLessThan(s.lastIndexOf('file={reste}')); // groupe rendu avant le reste
  });
  it('n’apparaît que si NON VIDE (garde enTest.length > 0) et réutilise BlocRepliable (socle non modifié)', () => {
    expect(s).toContain('enTest.length > 0 &&');
    expect(s).toContain('<BlocRepliable defautOuvert');
  });
  it('ne fait pas mentir « La file est vide » quand tout est en test', () => {
    expect(s).toContain('reste.length > 0 || file.length === 0');
  });
});
