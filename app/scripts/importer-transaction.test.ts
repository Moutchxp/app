import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fichiersDuDossier, optionsMultiples, SOURCES_DEFAUT } from './importer-transaction';

/** CLI `transaction:importer` — options, fichiers lus (D1 : nom lisible), à blanc par défaut, rapport hors du Bureau. */
describe('transaction:importer', () => {
  it('--fichier répétable ou séparé par des virgules (D7 : fichier par fichier)', () => {
    expect(optionsMultiples(['--fichier=TABLEAU DE BORD 2025.xlsx', '--fichier=a.xlsx,b.xlsx', '--appliquer'], 'fichier'))
      .toEqual(['TABLEAU DE BORD 2025.xlsx', 'a.xlsx', 'b.xlsx']);
  });
  it('ne lit que les « TABLEAU DE BORD [MACJ] AAAA » du dossier (ni brouillon Excel, ni autre fichier)', () => {
    const d = mkdtempSync(join(tmpdir(), 'trx-'));
    mkdirSync(join(d, 'x'));
    for (const f of ['TABLEAU DE BORD 2019 .xlsx', 'TABLEAU DE BORD MACJ 2025.xlsx', '~$TABLEAU DE BORD 2020.xlsx', 'notes.xlsx', 'TABLEAU DE BORD 2021.csv']) writeFileSync(join(d, f), '');
    expect(fichiersDuDossier(d)).toEqual(['TABLEAU DE BORD 2019 .xlsx', 'TABLEAU DE BORD MACJ 2025.xlsx']);
  });
  it('à blanc par défaut, sources et rapport dans .captures (jamais le Bureau)', () => {
    const src = readFileSync('app/scripts/importer-transaction.ts', 'utf8');
    expect(src).toContain("const appliquer = argv.includes('--appliquer');");
    expect(SOURCES_DEFAUT).toMatch(/\.captures\/transaction\/sources$/);
    expect(src).toContain("cheminRapport({ nomScript: NOM_SCRIPT");
    expect(src).not.toMatch(/Desktop|Bureau\//);
  });
});
