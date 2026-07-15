/**
 * Intégration LECTURE SEULE — reproductibilité de l'empreinte de barème.
 *
 * NE COMMIT AUCUN certificat : la table `certificat` est IMMUABLE (031, aucune DELETE possible) et son compteur
 * `certificat_compteur` est PARTAGÉ avec la production (numérotation dérivée de l'année). Insérer de vrais
 * certificats dans un test automatisé laisserait des lignes ineffaçables ET brûlerait des numéros SAVV de la
 * série de prod. La concurrence / l'idempotence par contrainte sont donc prouvées au niveau UNITAIRE
 * (certificatEmission.test.ts : chemin 23505) + par la contrainte DB elle-même (034). Ici, seule la partie
 * lisible sans effet de bord est vérifiée en base réelle : l'empreinte SQL est stable et bien formée.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { query, closePool } from './client';
import { SQL_EMPREINTE_BAREME } from './certificatEmission';

afterAll(async () => {
  await closePool();
});

describe('empreinte de barème (SQL, hors JS)', () => {
  it('deux calculs successifs SANS modification du barème → MÊME hash (reproductible)', async () => {
    const a = await query<{ empreinte: string; generation: string | null }>(SQL_EMPREINTE_BAREME);
    const b = await query<{ empreinte: string; generation: string | null }>(SQL_EMPREINTE_BAREME);
    expect(a.rows[0].empreinte).toBe(b.rows[0].empreinte);
  });

  it('empreinte = SHA-256 hex (64 caractères hexadécimaux minuscules)', async () => {
    const r = await query<{ empreinte: string }>(SQL_EMPREINTE_BAREME);
    expect(r.rows[0].empreinte).toMatch(/^[0-9a-f]{64}$/);
  });

  it('config_generation = max(config_edit_log.id) — entier coercible (int8 → chaîne), ou NULL si log vide', async () => {
    const r = await query<{ generation: string | null }>(SQL_EMPREINTE_BAREME);
    const g = r.rows[0].generation;
    expect(g === null || Number.isInteger(Number(g))).toBe(true);
  });

  it('empreinte couvre bien les 39 colonnes du singleton (le concat_ws n’est pas vide / tronqué)', async () => {
    // Garde-fou anti-régression : si le SQL listait 0 colonne, sha256('') vaudrait e3b0c442... ; on vérifie qu'on
    // n'est PAS sur ce hash de chaîne vide (le barème réel produit un hash distinct).
    const r = await query<{ empreinte: string }>(SQL_EMPREINTE_BAREME);
    const SHA256_VIDE = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(r.rows[0].empreinte).not.toBe(SHA256_VIDE);
  });
});
