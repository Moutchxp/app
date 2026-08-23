import { describe, it, expect } from 'vitest';
import {
  construireMorphologie,
  MORPHOLOGIE_INDISPONIBLE,
  formaterOctets,
  formaterPct,
  CARTOGRAPHIE_TABLES,
  type LigneTable,
} from './morphologieDisque';

/**
 * FRAÎCHEUR / F4 — modèle PUR de morphologie disque. Vérifie : RÉCONCILIATION exacte avec pg_database_size (résiduel dans
 * Système), poste « Non rattaché » non vide (deno_affichage), sous-lignes vive/copies du bâti, sentinelle « indisponible »
 * distincte de zéro, et absence de double rattachement dans la cartographie.
 */

const T = (table: string, total: number, donnees: number, index: number, lignes: number): LigneTable => ({ table, total, donnees, index, lignes });

/** Fixture : quelques tables de plusieurs postes + une table NON cartographiée (deno_affichage) + spatial_ref_sys. */
function fixture(): { tables: LigneTable[]; dbTotal: number } {
  const tables = [
    T('batiment', 1000, 800, 200, 3_000_000),
    T('bdtopo_edition', 10, 5, 5, 7),
    T('import_log', 10, 5, 5, 8),
    T('batiment_2026_03_15', 400, 350, 50, 697_886),
    T('batiment_edition_fige', 100, 70, 30, 697_886),
    T('bdtopo_next_batiment', 60, 45, 15, 697_363),
    T('stg_etat_juin', 50, 40, 10, 697_363),
    T('adresse_ban', 200, 160, 40, 557_710),
    T('parcelle', 500, 370, 130, 1_143_976),
    T('spatial_ref_sys', 7, 6, 1, 8_500),
    T('deno_affichage', 3, 0, 3, -1), // NON cartographiée → « Non rattaché »
  ];
  // Σ public = 2340 ; on met la base à 2400 → résiduel de 60 (catalogues non-public) qui doit tomber dans « Système ».
  return { tables, dbTotal: 2400 };
}

const poste = (m: ReturnType<typeof construireMorphologie>, cle: string) => m.postes.find((p) => p.cle === cle);

describe('construireMorphologie — réconciliation exacte', () => {
  it('la somme des postes est EXACTEMENT pg_database_size (résiduel dans Système)', () => {
    const { tables, dbTotal } = fixture();
    const m = construireMorphologie(tables, dbTotal);
    expect(m.postes.reduce((s, p) => s + p.total, 0)).toBe(dbTotal);
    expect(m.reconcilie).toBe(true);
    expect(m.totalBase).toBe(2400);
  });

  it('le poste Système porte le résiduel (base − Σ public) + spatial_ref_sys', () => {
    const m = construireMorphologie(fixture().tables, fixture().dbTotal);
    const sys = poste(m, 'systeme')!;
    expect(sys.residuel).toBe(60);          // 2400 − 2340
    expect(sys.total).toBe(67);             // 7 (spatial_ref_sys) + 60 (résiduel)
  });
});

describe('construireMorphologie — poste « Non rattaché » AFFICHÉ, non vide', () => {
  it('une table non cartographiée (deno_affichage) y tombe, jamais masquée', () => {
    const m = construireMorphologie(fixture().tables, fixture().dbTotal);
    const nr = poste(m, 'non_rattache')!;
    expect(nr).toBeTruthy();
    expect(nr.nom).toBe('Non rattaché');
    expect(nr.tables).toContain('deno_affichage');
    expect(nr.total).toBe(3);
    expect(nr.lignes).toBe(0); // reltuples -1 (jamais analysée) → 0, jamais négatif
  });
});

describe('construireMorphologie — BD TOPO bâtiment : donnée vive vs copies', () => {
  it('deux sous-lignes, Édition courante avant Copies et staging, avec leurs poids', () => {
    const m = construireMorphologie(fixture().tables, fixture().dbTotal);
    const bati = poste(m, 'bdtopo_bati')!;
    expect(bati.total).toBe(1630); // 1000+10+10 + 400+100+60+50
    expect(bati.sousLignes?.map((s) => s.nom)).toEqual(['Édition courante', 'Copies et staging']);
    expect(bati.sousLignes?.find((s) => s.nom === 'Édition courante')?.total).toBe(1020); // batiment+edition+import_log
    expect(bati.sousLignes?.find((s) => s.nom === 'Copies et staging')?.total).toBe(610); // 4 copies
  });

  it('les postes sont triés par poids décroissant', () => {
    const m = construireMorphologie(fixture().tables, fixture().dbTotal);
    const totaux = m.postes.map((p) => p.total);
    expect([...totaux].sort((a, b) => b - a)).toEqual(totaux);
    expect(m.postes[0].cle).toBe('bdtopo_bati'); // 1630, le plus gros de la fixture
  });
});

describe('sentinelle et cartographie', () => {
  it('MORPHOLOGIE_INDISPONIBLE : indisponible, totalBase null (distinct d’une base à zéro)', () => {
    expect(MORPHOLOGIE_INDISPONIBLE.indisponible).toBe(true);
    expect(MORPHOLOGIE_INDISPONIBLE.totalBase).toBeNull();
    expect(MORPHOLOGIE_INDISPONIBLE.postes).toHaveLength(0);
  });

  it('aucune table n’est rattachée à deux postes (la construction lèverait sinon)', () => {
    // construireMorphologie appelle indexerTables() qui détecte un double rattachement → ne doit pas lever ici.
    expect(() => construireMorphologie([], 0)).not.toThrow();
  });

  it('la cartographie déclare bien la sous-structure du bâti', () => {
    const bati = CARTOGRAPHIE_TABLES.find((d) => d.cle === 'bdtopo_bati')!;
    expect(bati.sousGroupes?.map((s) => s.nom)).toEqual(['Édition courante', 'Copies et staging']);
  });
});

describe('formatage', () => {
  it('formaterOctets : o / Ko / Mo / Go base 1024', () => {
    expect(formaterOctets(500)).toBe('500 o');
    expect(formaterOctets(1024)).toBe('1.00 Ko');
    expect(formaterOctets(1024 * 1024)).toBe('1.00 Mo');
    expect(formaterOctets(1_965_039_616)).toBe('1.83 Go');
  });
  it('formaterPct : une décimale', () => {
    expect(formaterPct(67.9166)).toBe('67.9 %');
  });
});
