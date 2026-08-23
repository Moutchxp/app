/**
 * Test d'INTÉGRATION (H3) — les écritures de l'ingestion auto s'exécutent VRAIMENT contre la vraie base (motif *.itest.ts,
 * `npm run test:integration`). Angle mort visé : deux bugs de typage (G2 to_char, H2 42P08) sont passés parce qu'une requête
 * SIMULÉE ne reproduit pas un refus PostgreSQL. Chaque test ÉCRIT puis RELIT pour prouver la ligne/valeur.
 *
 * HYGIÈNE : uniquement ingestion_auto_journal (source synthétique, nettoyée) et les colonnes de config_veille concernées ; JAMAIS
 * une table de la famille mairies. Les interrupteurs et la fenêtre sont RESTAURÉS à leur valeur d'origine (afterAll, requête
 * directe → robuste même si un test échoue). Re-jouable plusieurs fois.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { query, closePool } from '../db/client';
import {
  journaliserRefus, journaliserDebut, journaliserFin,
  basculerIngestionAuto, ecrireFenetreNocturne, lireConfigIngestionAuto,
} from './ingestionAutoRepo';

const SRC = '__h3_ingest_itest__';
const NUIT = '2026-01-01';

let origDilaActif = false;
let origFenetre = { debut: 3, fin: 6 };

beforeAll(async () => {
  const c = await lireConfigIngestionAuto();
  origDilaActif = c.actifs.dila;
  origFenetre = c.fenetre;
});
beforeEach(async () => {
  await query(`DELETE FROM ingestion_auto_journal WHERE source = $1`, [SRC]);
});
afterAll(async () => {
  // RESTAURE l'état d'origine par requête DIRECTE (pas via les fonctions testées).
  await query(
    `UPDATE config_veille SET dila_auto_active = $1, ingestion_auto_fenetre_debut = $2, ingestion_auto_fenetre_fin = $3 WHERE id = 1`,
    [origDilaActif, origFenetre.debut, origFenetre.fin],
  );
  await query(`DELETE FROM ingestion_auto_journal WHERE source = $1`, [SRC]);
  await closePool();
});

describe('ingestion_auto_journal — journaliserDebut / journaliserFin', () => {
  it('journaliserDebut insère une tentative « echec/en cours » et RETOURNE un id', async () => {
    const id = await journaliserDebut(SRC, NUIT, new Date('2026-08-23T03:00:00Z'));
    // `id` (bigint) est renvoyé par node-postgres en STRING (pas de perte de précision) — usable tel quel par journaliserFin
    // (WHERE id = $1, coercition text→bigint). On prouve qu'il est renseigné, pas son type JS exact.
    expect(id).not.toBeNull();
    const { rows } = await query<{ resultat: string; motif: string | null; a_demarre: boolean }>(
      `SELECT resultat, motif, demarre_le IS NOT NULL AS a_demarre FROM ingestion_auto_journal WHERE id = $1`, [id]);
    expect(rows[0]).toMatchObject({ resultat: 'echec', motif: 'en cours', a_demarre: true });
  });

  it('journaliserFin(succes) → resultat « succes », fini_le posé, motif remis à NULL', async () => {
    const id = await journaliserDebut(SRC, NUIT, new Date('2026-08-23T03:00:00Z'));
    await journaliserFin(id, new Date('2026-08-23T03:05:00Z'), 'succes', null);
    const { rows } = await query<{ resultat: string; motif: string | null; a_fini: boolean }>(
      `SELECT resultat, motif, fini_le IS NOT NULL AS a_fini FROM ingestion_auto_journal WHERE id = $1`, [id]);
    expect(rows[0]).toMatchObject({ resultat: 'succes', motif: null, a_fini: true });
  });

  it('journaliserFin(echec) → « echec » + erreur, motif « en cours » PRÉSERVÉ (le CASE $3 tient en réel)', async () => {
    const id = await journaliserDebut(SRC, NUIT, new Date('2026-08-23T03:00:00Z'));
    await journaliserFin(id, new Date('2026-08-23T03:05:00Z'), 'echec', 'timeout 30 min');
    const { rows } = await query<{ resultat: string; erreur: string | null; motif: string | null }>(
      `SELECT resultat, erreur, motif FROM ingestion_auto_journal WHERE id = $1`, [id]);
    expect(rows[0]).toMatchObject({ resultat: 'echec', erreur: 'timeout 30 min', motif: 'en cours' });
  });
});

describe('ingestion_auto_journal — journaliserRefus', () => {
  it('insère une ligne « refus » avec motif + détail + fini_le', async () => {
    await journaliserRefus(SRC, NUIT, 'disque_insuffisant', 'libre=1073741824 requis=6442450944');
    const { rows } = await query<{ resultat: string; motif: string | null; erreur: string | null; a_fini: boolean }>(
      `SELECT resultat, motif, erreur, fini_le IS NOT NULL AS a_fini FROM ingestion_auto_journal WHERE source = $1 AND nuit_du = $2`, [SRC, NUIT]);
    expect(rows[0]).toMatchObject({ resultat: 'refus', motif: 'disque_insuffisant', a_fini: true });
    expect(rows[0].erreur).toContain('requis=');
  });
});

describe('config_veille — basculerIngestionAuto / ecrireFenetreNocturne (restaurés en fin)', () => {
  it('basculerIngestionAuto(dila) écrit RÉELLEMENT l’interrupteur (true puis false)', async () => {
    await basculerIngestionAuto('dila', true);
    expect((await lireConfigIngestionAuto()).actifs.dila).toBe(true);
    await basculerIngestionAuto('dila', false);
    expect((await lireConfigIngestionAuto()).actifs.dila).toBe(false);
  });

  it('ecrireFenetreNocturne écrit RÉELLEMENT la fenêtre (4-7), puis on remet 3-6', async () => {
    await ecrireFenetreNocturne(4, 7);
    expect((await lireConfigIngestionAuto()).fenetre).toEqual({ debut: 4, fin: 7 });
    await ecrireFenetreNocturne(3, 6);
    expect((await lireConfigIngestionAuto()).fenetre).toEqual({ debut: 3, fin: 6 });
  });
});
