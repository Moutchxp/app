/**
 * Q3-B — test d'INTÉGRATION (vraie base) de la règle « soldé sans documents → revient au stock ». On joue la requête EXPORTÉE
 * `SQL_DOSSIERS_DEJA_DEMANDES` (aucune dérive avec le code de prod) sur des lignes seedées, dans une transaction TOUJOURS
 * ROLLBACKée → aucune trace, le golden n'est jamais touché. Lancé via `npm run test:integration` (motif *.itest.ts), pas par npm test.
 *
 * Sept situations, une par assertion : dû (envoyée) HORS stock · close sans docs REVIENT · close avec dossier_document NE
 * REVIENT PAS · close avec satisfait_le NE REVIENT PAS · refus_mairie REVIENT · non_fourni (envoyée) NE REVIENT PAS ·
 * annulée (actif=false) inchangé (hors set).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { pool, closePool } from '../db/client';
import { SQL_DOSSIERS_DEJA_DEMANDES } from './demandeRepo';

afterAll(async () => { await closePool(); });

interface Situation { cle: string; statut: string; actif: boolean; satisfait: boolean; triage: string | null; avecDocument: boolean; attenduDansSet: boolean }
const SITUATIONS: Situation[] = [
  { cle: 'du_envoyee',        statut: 'envoyee', actif: true,  satisfait: false, triage: null,          avecDocument: false, attenduDansSet: true },
  { cle: 'close_sans_docs',   statut: 'close',   actif: true,  satisfait: false, triage: null,          avecDocument: false, attenduDansSet: false },
  { cle: 'close_avec_doc',    statut: 'close',   actif: true,  satisfait: false, triage: null,          avecDocument: true,  attenduDansSet: true },
  { cle: 'close_satisfait',   statut: 'close',   actif: true,  satisfait: true,  triage: null,          avecDocument: false, attenduDansSet: true },
  { cle: 'refus_mairie',      statut: 'envoyee', actif: true,  satisfait: false, triage: 'refus_mairie', avecDocument: false, attenduDansSet: false },
  { cle: 'non_fourni',        statut: 'envoyee', actif: true,  satisfait: false, triage: 'non_fourni',   avecDocument: false, attenduDansSet: true },
  { cle: 'annulee',           statut: 'annulee', actif: false, satisfait: false, triage: null,          avecDocument: false, attenduDansSet: false },
];

describe('Q3-B (intégration) — soldé sans documents → revient ; obtenu ne revient jamais', () => {
  it('les 7 situations produisent la bonne appartenance à dejaRattaches', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const idParCle = new Map<string, number>();
      let i = 0;
      for (const s of SITUATIONS) {
        i += 1;
        const dos = await client.query<{ id: number }>(
          `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
           VALUES ('PC', $1, '75056', '75', '2024', '2024') RETURNING id`,
          [`Q3BTEST${String(i).padStart(6, '0')}`],
        );
        const dossierId = dos.rows[0].id;
        idParCle.set(s.cle, dossierId);
        const dem = await client.query<{ id: number }>(
          `INSERT INTO demande (reference, code_insee, statut) VALUES ($1, '75056', $2) RETURNING id`,
          [`SVAV-DEM-9999-${String(i).padStart(6, '0')}`, s.statut], // année sentinelle 9999 → jamais un vrai numéro

        );
        const demandeId = dem.rows[0].id;
        // Contraintes demande_dossier : triage_le NOT NULL ⟺ triage NOT NULL ; refus_le NOT NULL ⟺ triage='refus_mairie'.
        await client.query(
          `INSERT INTO demande_dossier (demande_id, dossier_id, actif, satisfait_le, triage, triage_le, refus_le)
           VALUES ($1, $2, $3, ${s.satisfait ? 'now()' : 'NULL'}, $4,
                   ${s.triage ? 'now()' : 'NULL'},
                   ${s.triage === 'refus_mairie' ? "'2026-01-01'::date" : 'NULL'})`,
          [demandeId, dossierId, s.actif, s.triage],
        );
        if (s.avecDocument) {
          await client.query(
            `INSERT INTO dossier_document (dossier_id, nom_fichier, cle_stockage) VALUES ($1, 'q3b.pdf', $2)`,
            [dossierId, `entrantes/q3b/${dossierId}.pdf`],
          );
        }
      }
      const res = await client.query<{ dossier_id: number }>(SQL_DOSSIERS_DEJA_DEMANDES);
      const set = new Set(res.rows.map((r) => r.dossier_id));
      for (const s of SITUATIONS) {
        const dossierId = idParCle.get(s.cle)!;
        expect({ cle: s.cle, dansSet: set.has(dossierId) }).toEqual({ cle: s.cle, dansSet: s.attenduDansSet });
      }
    } finally {
      await client.query('ROLLBACK'); // AUCUNE trace : tout le seed est annulé
      client.release();
    }
  });

  it('Q3-A — annuler une demande avec un dossier SATISFAIT et un dossier DÛ : le satisfait garde actif=true, le dû passe à false', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Un dossier SATISFAIT (documents obtenus) + un dossier DÛ, dans une même demande annulée.
      const mk = async (num: string): Promise<number> => {
        const r = await client.query<{ id: number }>(
          `INSERT INTO sitadel_dossier (type, num_dau, code_insee, departement, vu_le_premier_millesime, vu_le_dernier_millesime)
           VALUES ('PC', $1, '75056', '75', '2024', '2024') RETURNING id`, [num]);
        return r.rows[0].id;
      };
      const dSatisfait = await mk('Q3ASATISFAIT');
      const dDu = await mk('Q3ADU');
      const dem = await client.query<{ id: number }>(
        `INSERT INTO demande (reference, code_insee, statut) VALUES ('SVAV-DEM-9999-100001', '75056', 'annulee') RETURNING id`);
      const demandeId = dem.rows[0].id;
      await client.query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif, satisfait_le) VALUES ($1, $2, true, now())`, [demandeId, dSatisfait]);
      await client.query(`INSERT INTO demande_dossier (demande_id, dossier_id, actif, satisfait_le) VALUES ($1, $2, true, NULL)`, [demandeId, dDu]);

      // Effet de l'annulation sur les dossiers, tel qu'émis par changerStatutLot (garde Q3-A).
      await client.query(`UPDATE demande_dossier SET actif = false WHERE demande_id = $1 AND satisfait_le IS NULL`, [demandeId]);

      const etat = async (dossierId: number): Promise<boolean> => {
        const r = await client.query<{ actif: boolean }>(`SELECT actif FROM demande_dossier WHERE demande_id = $1 AND dossier_id = $2`, [demandeId, dossierId]);
        return r.rows[0].actif;
      };
      expect(await etat(dSatisfait)).toBe(true);  // permis OBTENU → jamais libéré (pas de faux retour)
      expect(await etat(dDu)).toBe(false);        // permis dû → libéré, redevient demandable

      // Le stock (dejaRattaches) ne récupère QUE le dû : le satisfait reste « déjà demandé » (invariant obtenu).
      const set = new Set((await client.query<{ dossier_id: number }>(SQL_DOSSIERS_DEJA_DEMANDES)).rows.map((r) => r.dossier_id));
      expect(set.has(dSatisfait)).toBe(true);   // hors stock (obtenu)
      expect(set.has(dDu)).toBe(false);         // revient au stock
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
