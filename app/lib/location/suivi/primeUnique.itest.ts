import { afterAll, describe, expect, it, vi } from 'vitest';
import { closePool, query } from '../../db/client';
import { sqlPorteUnePrime } from './suivi';
import { primeDe } from './tableauBord';

/**
 * 🔴 Arno (24/10/2026) — LECTURE SEULE sur la vraie base : la règle SQL « porte une prime » dit, ligne à ligne, la même chose que
 * `primeDe` (le calcul du suivi) ; la proposition (situation du bien, prime déjà versée) s'exécute sur de vrais biens. Rien n'est écrit.
 */
vi.mock('server-only', () => ({}));
afterAll(async () => { await closePool(); });

describe('🔴 « porte une prime » : le SQL et primeDe sont d’accord sur chaque ligne de la base', () => {
  it('sur toutes les affaires non annulées', async () => {
    const { lireActivites, anneesActives } = await import('./tableauBordRepo');
    const { lireRegles } = await import('./suiviRepo');
    const annees = await anneesActives();
    if (annees.length === 0) return;
    const [activites, regles] = await Promise.all([lireActivites(annees), lireRegles()]);
    const { rows } = await query<{ id: string; prime: boolean }>(
      `SELECT a.id::text, ${sqlPorteUnePrime('a', true)} AS prime FROM gestion_location_activite a WHERE a.annule_le IS NULL`);
    const sql = new Map(rows.map((r) => [Number(r.id), r.prime]));
    const desaccords = activites.filter((a) => (primeDe(a, regles) > 0) !== sql.get(Number(a.id)));
    expect(desaccords.map((a) => a.id)).toEqual([]);
  });
});

describe('🔴 la proposition et la prime déjà versée, sur de vrais biens (lecture seule)', () => {
  it('s’exécutent et rendent un cas', async () => {
    const { proposerActivite, primeDejaVersee } = await import('./suiviRepo');
    const { rows } = await query<{ id: string }>(
      `SELECT DISTINCT lot_id::text AS id FROM gestion_location_activite WHERE lot_id IS NOT NULL ORDER BY 1 LIMIT 5`);
    for (const r of rows) {
      const p = await proposerActivite(Number(r.id), [], '2026-10-24');
      expect(p.etat).toBe('ok');
      if (p.etat === 'ok') expect(['nouveau_mandat', 'relocation', 'deja_prime', 'hors_gestion']).toContain(p.data!.cas);
      await primeDejaVersee(query, Number(r.id));
    }
  });
});
