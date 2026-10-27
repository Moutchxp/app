import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { permsDuCompte, type CompteDB } from './comptes';

/**
 * 🔴 TUILE « TRANSACTION » (27/10/2026) — le droit `perm_transaction` (migration 433) ne doit JAMAIS rendre la connexion
 * dépendante de la migration : la lecture des comptes est sur le chemin d'authentification.
 */
describe('🔴 droit Transaction', () => {
  const norm = (f: string): string => readFileSync(f, 'utf8').replace(/\s+/g, ' ');

  it('la lecture des comptes sonde la colonne et retombe sur « false » sans la migration 433', () => {
    const src = norm('app/lib/admin/comptes.ts');
    expect(src).toContain("${avecTransaction ? 'perm_transaction' : 'false AS perm_transaction'}");
    // Et la colonne n'est écrite qu'après la sonde (création et modification des droits).
    expect(src.match(/droitTransactionDisponible\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/COLONNES_COMPTE = `[^`]*perm_transaction/);
  });

  it('administrateur : Transaction implicite ; collaborateur : sa colonne', () => {
    const base = { role: 'collaborateur', perm_transaction: false } as unknown as CompteDB;
    expect(permsDuCompte({ ...base, role: 'administrateur' }).transaction).toBe(true);
    expect(permsDuCompte(base).transaction).toBe(false);
    expect(permsDuCompte({ ...base, perm_transaction: true }).transaction).toBe(true);
  });

  it('le proxy garde la page ET l’API du module', () => {
    const proxy = norm('proxy.ts');
    expect(proxy).toContain("['/admin/transaction', 'transaction']");
    expect(proxy).toContain("['/api/admin/transaction', 'transaction']");
  });
});
