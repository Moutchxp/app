/**
 * Test d'INTÉGRATION (H3) — les écritures de l'alerte G4 s'exécutent VRAIMENT contre la vraie base (motif *.itest.ts). Angle mort
 * visé : un refus PostgreSQL invisible aux tests unitaires simulés. Chaque test ÉCRIT puis RELIT.
 *
 * HYGIÈNE : uniquement alerte_maj_journal (empreinte synthétique, nettoyée) et config_veille.alerte_maj_empreinte, RESTAURÉE à sa
 * valeur d'origine (afterAll, requête directe). JAMAIS une table de la famille mairies. Re-jouable.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { query, closePool } from '../db/client';
import { majEmpreinte, journaliser } from './alerteMisesAJourRepo';

const EMPREINTE_TEST = '__h3_alerte_itest__';

let origEmpreinte: string | null = null;

beforeAll(async () => {
  const { rows } = await query<{ e: string | null }>(`SELECT alerte_maj_empreinte AS e FROM config_veille WHERE id = 1`);
  origEmpreinte = rows[0]?.e ?? null;
});
beforeEach(async () => {
  await query(`DELETE FROM alerte_maj_journal WHERE empreinte = $1`, [EMPREINTE_TEST]);
});
afterAll(async () => {
  await query(`UPDATE config_veille SET alerte_maj_empreinte = $1 WHERE id = 1`, [origEmpreinte]); // RESTAURE l'empreinte réelle
  await query(`DELETE FROM alerte_maj_journal WHERE empreinte = $1`, [EMPREINTE_TEST]);
  await closePool();
});

describe('config_veille — majEmpreinte', () => {
  it('écrit RÉELLEMENT l’empreinte, puis on restaure l’originale', async () => {
    await majEmpreinte(EMPREINTE_TEST);
    const { rows } = await query<{ e: string | null }>(`SELECT alerte_maj_empreinte AS e FROM config_veille WHERE id = 1`);
    expect(rows[0].e).toBe(EMPREINTE_TEST);
    await majEmpreinte(origEmpreinte ?? ''); // remet une valeur (afterAll remettra l'exacte originale de toute façon)
  });
});

describe('alerte_maj_journal — journaliser', () => {
  it('insère RÉELLEMENT une ligne d’envoi « envoyee » (empreinte, destinataire, sujet)', async () => {
    await journaliser(EMPREINTE_TEST, 'admin@example.test', '[Données SVAV] 2 bases prêtes', 'envoyee', null);
    const { rows } = await query<{ n: number; destinataire: string; sujet: string; resultat: string }>(
      `SELECT count(*)::int AS n, max(destinataire) AS destinataire, max(sujet) AS sujet, max(resultat) AS resultat
         FROM alerte_maj_journal WHERE empreinte = $1`, [EMPREINTE_TEST]);
    expect(rows[0]).toMatchObject({ n: 1, destinataire: 'admin@example.test', resultat: 'envoyee' });
    expect(rows[0].sujet).toContain('[Données SVAV]');
  });

  it('insère RÉELLEMENT une ligne d’échec « erreur » avec le message complet', async () => {
    await journaliser(EMPREINTE_TEST, 'admin@example.test', 'sujet', 'erreur', 'SMTP 535 auth refusée');
    const { rows } = await query<{ resultat: string; erreur: string | null }>(
      `SELECT resultat, erreur FROM alerte_maj_journal WHERE empreinte = $1`, [EMPREINTE_TEST]);
    expect(rows[0]).toMatchObject({ resultat: 'erreur', erreur: 'SMTP 535 auth refusée' });
  });
});
