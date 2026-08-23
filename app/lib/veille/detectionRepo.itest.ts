/**
 * Test d'INTÉGRATION (H2) — enregistrerDetection écrit VRAIMENT dans source_detection (motif *.itest.ts, `npm run test:integration`).
 *
 * C'est LE test qui aurait attrapé le bug : la requête d'upsert réutilisait $2 (timestamptz) dans un CASE non typé (résolu en
 * text) → PostgreSQL refusait le PARSE (42P08) → l'écriture jetait, était avalée par le catch, et RIEN n'était persisté. Une
 * requête SIMULÉE ne peut pas reproduire ce refus de typage ; seule une vraie connexion l'attrape. AVANT le fix : RED (0 ligne).
 * LECTURE + écriture d'UNE ligne de test isolée (source synthétique), nettoyée après. Aucune migration, aucun DDL.
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { enregistrerDetection } from './detectionRepo';
import { query, closePool } from '../db/client';

const SOURCE_TEST = '__h2_itest_detection__'; // clé synthétique : ne collisionne avec aucune vraie source

async function nettoyer(): Promise<void> {
  await query(`DELETE FROM source_detection WHERE source = $1`, [SOURCE_TEST]);
}

beforeEach(nettoyer);
afterAll(async () => { await nettoyer(); await closePool(); });

describe('enregistrerDetection — écriture réelle en base', () => {
  it('un succès de détection est RÉELLEMENT persisté (source, édition, verifie_le)', async () => {
    await enregistrerDetection(SOURCE_TEST, { succes: true, editionDistante: '2026-09-15', dateDistante: '2026-09-15', motif: null }, new Date('2026-08-23T12:00:00Z'));

    const { rows } = await query<{ n: number; edition: string | null; a_verifie: boolean; a_succes: boolean }>(
      `SELECT count(*)::int AS n, max(edition_distante) AS edition,
              bool_or(verifie_le IS NOT NULL) AS a_verifie, bool_or(dernier_succes_le IS NOT NULL) AS a_succes
         FROM source_detection WHERE source = $1`, [SOURCE_TEST]);
    expect(rows[0].n).toBe(1);                    // ← RED avant le fix : la ligne n'était jamais écrite (42P08 avalé)
    expect(rows[0].edition).toBe('2026-09-15');
    expect(rows[0].a_verifie).toBe(true);
    expect(rows[0].a_succes).toBe(true);          // succès → dernier_succes_le renseigné (le CASE fonctionne)
  });

  it('un échec PRÉSERVE l’édition d’un succès précédent, sans dernier_succes_le neuf', async () => {
    await enregistrerDetection(SOURCE_TEST, { succes: true, editionDistante: '2026-09-15', dateDistante: '2026-09-15', motif: null }, new Date('2026-08-20T12:00:00Z'));
    await enregistrerDetection(SOURCE_TEST, { succes: false, editionDistante: null, dateDistante: null, motif: 'HTTP 500' }, new Date('2026-08-23T12:00:00Z'));

    const { rows } = await query<{ edition: string | null; motif: string | null; succes: boolean }>(
      `SELECT edition_distante AS edition, motif, succes FROM source_detection WHERE source = $1`, [SOURCE_TEST]);
    expect(rows[0].edition).toBe('2026-09-15'); // édition du succès PRÉSERVÉE malgré l'échec
    expect(rows[0].succes).toBe(false);
    expect(rows[0].motif).toBe('HTTP 500');
  });
});
