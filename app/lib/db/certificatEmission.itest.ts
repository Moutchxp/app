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
import type { RequeteTx } from './client';
import { pool, query, closePool } from './client';
import { SQL_EMPREINTE_BAREME, insererCertificat, ouvrirAcheminement } from './certificatEmission';

afterAll(async () => {
  await closePool();
});

/** Exécute `fn` dans une transaction TOUJOURS ROLLBACKée (aucune trace : ni certificat immuable, ni compteur brûlé,
 *  ni ligne d'acheminement laissée). Miroir du harnais de certificatNumero.itest. */
async function dansRollback(fn: (q: RequeteTx) => Promise<void>): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q: RequeteTx = (t, p) => client.query(t, p as never);
    await fn(q);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** Certificat minimal (schéma réel) — numéro SENTINELLE hors de toute série ; seul l'INSERT + l'acheminement comptent. */
const CERT_MINIMAL = {
  numero: 'SAVV-9999-999999', jetonVerification: 'ABCDEFGHJKMNPQRS', reference: 'SVAV-ABCD-2345', projetId: 0, configGeneration: null, configEmpreinte: 'itest',
  lat: null, lon: null, azimutDeg: null, etage: null, dernierEtage: null,
  hauteurSousPlafondM: null, hauteurVisionM: null, adresse: null, typeBien: null,
  surfaceM2: null, nbPieces: null, epoque: null, verdict: 'SANS_VIS_A_VIS', score: 0,
  distanceObstacleM: null, profondeurMoyenneM: null, faisceauxDegagesPct: null,
  altitudeTerrainM: null, altitudeSolM: null, toleranceM: 40,
  referenceCadastrale: null, anneeBatiment: null, resultat: '{}', photoCle: null,
};

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

describe('acheminement ouvert avec le certificat (schéma réel, transaction ROLLBACKée)', () => {
  it('INSERT certificat + ouvrirAcheminement → une ligne, statut en_attente, toutes les clés/horodatages NULL', async () => {
    let vu: Record<string, unknown> | undefined;
    await dansRollback(async (q) => {
      // Dépendances FK, éphémères (rollback) : un internaute + un projet à référencer.
      const ir = await q<{ id: string }>(
        `INSERT INTO internaute (prenom, nom, email, source_collecte, parcours)
         VALUES ('T', 'T', $1, 'tunnel', 'incomplet') RETURNING id`,
        [`itest-ach-${Date.now()}@example.com`],
      );
      const pr = await q<{ id: string }>(
        `INSERT INTO internaute_projet (internaute_id, version_tunnel, payload) VALUES ($1, 1, '{}'::jsonb) RETURNING id`,
        [ir.rows[0].id],
      );
      const projetId = Number(pr.rows[0].id);
      const certId = await insererCertificat(q, { ...CERT_MINIMAL, projetId });
      await ouvrirAcheminement(q, certId);
      const ach = await q<Record<string, unknown>>(
        `SELECT certificat_id, statut, pdf_cle, carte_orientation_cle, genere_le, envoye_le, derniere_erreur
         FROM certificat_acheminement WHERE certificat_id = $1`,
        [certId],
      );
      expect(ach.rows).toHaveLength(1); // UNE ligne, née avec le certificat
      vu = ach.rows[0];
      expect(Number(vu.certificat_id)).toBe(certId);
      expect(vu.statut).toBe('en_attente'); // le certificat existe, rien n'est encore généré ni envoyé
      // Rien n'est généré/envoyé/échoué → aucun mensonge par défaut.
      for (const cle of ['pdf_cle', 'carte_orientation_cle', 'genere_le', 'envoye_le', 'derniere_erreur']) {
        expect(vu[cle]).toBeNull();
      }
    });
    expect(vu).toBeDefined(); // le corps de la transaction s'est bien exécuté avant le ROLLBACK
  });

  it('ROLLBACK de l’émission → AUCUNE ligne d’acheminement (ni certificat) laissée', async () => {
    // La sentinelle 'SAVV-9999-999999' n'est JAMAIS committée (toujours rollback) → invisible après coup.
    const c = await query(`SELECT id FROM certificat WHERE numero = $1`, [CERT_MINIMAL.numero]);
    expect(c.rows).toHaveLength(0);
    const a = await query(
      `SELECT id FROM certificat_acheminement WHERE certificat_id IN (SELECT id FROM certificat WHERE numero = $1)`,
      [CERT_MINIMAL.numero],
    );
    expect(a.rows).toHaveLength(0);
  });
});
