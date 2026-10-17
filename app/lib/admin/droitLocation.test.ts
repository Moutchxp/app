import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { permsDuCompte, type CompteDB } from './comptes';

/**
 * 🔴 TUILE « LOCATION » (17/10/2026) — le droit `perm_location` (migration 371) ne doit JAMAIS rendre la connexion
 * dépendante de la migration : la lecture des comptes est sur le chemin d'authentification.
 */
describe('🔴 droit Location', () => {
  const norm = (f: string): string => readFileSync(f, 'utf8').replace(/\s+/g, ' ');

  it('la lecture des comptes sonde la colonne et retombe sur « false » sans la migration 371', () => {
    const src = norm('app/lib/admin/comptes.ts');
    expect(src).toContain("${avecLocation ? 'perm_location' : 'false AS perm_location'}");
    // Et la colonne n'est écrite qu'après la sonde (création et modification des droits).
    expect(src.match(/droitLocationDisponible\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/COLONNES_COMPTE = `[^`]*perm_location/);
  });

  it('administrateur : Location implicite ; collaborateur : sa colonne', () => {
    const base = { role: 'collaborateur', perm_location: false } as unknown as CompteDB;
    expect(permsDuCompte({ ...base, role: 'administrateur' }).location).toBe(true);
    expect(permsDuCompte(base).location).toBe(false);
    expect(permsDuCompte({ ...base, perm_location: true }).location).toBe(true);
  });

  it('le proxy garde la page ET l’API du module', () => {
    const proxy = norm('proxy.ts');
    expect(proxy).toContain("['/admin/location', 'location']");
    expect(proxy).toContain("['/api/admin/location', 'location']");
  });
});
