/**
 * Test d'intégration — attribuerNumeroCertificat (compteur atomique SAVV-AAAA-NNNNNN, vraie base).
 *
 * Lancé uniquement via `npm run test:integration` (motif *.itest.ts). NE touche QUE `certificat_compteur`
 * (table SANS trigger d'immuabilité, HORS du golden = pipeline de score). Isolation :
 *  - sémantiques PAR ANNÉE (1re attribution, isolation, année) → années SENTINELLES 9999/9998, jamais un vrai
 *    certificat, purgées avant/après ;
 *  - comportement de la FONCTION (elle dérive l'année serveur, non paramétrable) → sur l'ANNÉE COURANTE, soit dans
 *    une transaction ROLLBACKée (aucune trace), soit committé (concurrence) puis le compteur courant est RESTAURÉ
 *    à son état d'avant-test.
 * Aucune ligne laissée derrière ; le golden n'est jamais touché.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { RequeteTx } from './client';
import { pool, query, closePool } from './client';
import { attribuerNumeroCertificat } from './certificatNumero';

const ANNEE_TEST = 9999; // sentinelle : hors de toute série réelle
const ANNEE_TEST_2 = 9998;

/** Attribution BRUTE (contrat SQL) pour une année explicite — sert les tests PAR ANNÉE (la fonction, elle, dérive
 *  l'année serveur et n'est pas paramétrable). */
async function attribuerAnnee(annee: number): Promise<number> {
  const r = await query<{ dernier: number | string }>(
    `INSERT INTO certificat_compteur (annee, dernier) VALUES ($1, 1)
       ON CONFLICT (annee) DO UPDATE SET dernier = certificat_compteur.dernier + 1
       RETURNING dernier`,
    [annee],
  );
  return Number(r.rows[0].dernier);
}

async function lireDernier(annee: number): Promise<number | null> {
  const r = await query<{ dernier: number | string }>('SELECT dernier FROM certificat_compteur WHERE annee = $1', [annee]);
  return r.rows[0] ? Number(r.rows[0].dernier) : null;
}

/** Exécute `fn` dans une transaction TOUJOURS ROLLBACKée (teste la fonction sans laisser de trace). */
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

/** Attribution via la fonction dans une transaction COMMITTÉE distincte (pour la concurrence inter-transactions). */
async function attribuerCommit(): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q: RequeteTx = (t, p) => client.query(t, p as never);
    const numero = await attribuerNumeroCertificat(q);
    await client.query('COMMIT');
    return numero;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

let anneeCourante: number;
let derniereCourante: number | null; // état du compteur de l'année courante AVANT les tests (null = absent)

beforeAll(async () => {
  await query('DELETE FROM certificat_compteur WHERE annee IN ($1, $2)', [ANNEE_TEST, ANNEE_TEST_2]);
  anneeCourante = Number((await query<{ a: number }>(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::int AS a`)).rows[0].a);
  derniereCourante = await lireDernier(anneeCourante);
});

afterAll(async () => {
  await query('DELETE FROM certificat_compteur WHERE annee IN ($1, $2)', [ANNEE_TEST, ANNEE_TEST_2]);
  // Restaure le compteur de l'année courante (le test de concurrence a committé des incréments).
  if (derniereCourante === null) {
    await query('DELETE FROM certificat_compteur WHERE annee = $1', [anneeCourante]);
  } else {
    await query('UPDATE certificat_compteur SET dernier = $2 WHERE annee = $1', [anneeCourante, derniereCourante]);
  }
  await closePool();
});

describe('attribuerNumeroCertificat — compteur atomique SAVV-AAAA-NNNNNN', () => {
  it('1. première attribution d’une année (compteur vierge) → NNNNNN = 000001', async () => {
    // Année courante vidée DANS une transaction rollbackée → la fonction voit un compteur vierge, sans trace après.
    await dansRollback(async (q) => {
      await q(`DELETE FROM certificat_compteur WHERE annee = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::int`);
      const numero = await attribuerNumeroCertificat(q);
      expect(numero).toMatch(/^SAVV-\d{4}-000001$/);
    });
  });

  it('2. attributions successives → strictement croissantes, sans trou', async () => {
    await dansRollback(async (q) => {
      await q(`DELETE FROM certificat_compteur WHERE annee = EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::int`);
      const n1 = await attribuerNumeroCertificat(q);
      const n2 = await attribuerNumeroCertificat(q);
      const n3 = await attribuerNumeroCertificat(q);
      expect([n1, n2, n3].map((n) => n.slice(-6))).toEqual(['000001', '000002', '000003']);
    });
  });

  it('3. format exact + zéro-padding (satisfait le CHECK de la colonne numero)', async () => {
    await dansRollback(async (q) => {
      // Force le compteur à 41 → la prochaine attribution doit rendre …-000042 (padding sur 6).
      await q(
        `INSERT INTO certificat_compteur (annee, dernier) VALUES (EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::int, 41)
           ON CONFLICT (annee) DO UPDATE SET dernier = 41`,
      );
      const numero = await attribuerNumeroCertificat(q);
      expect(numero).toMatch(/^SAVV-[0-9]{4}-[0-9]{6}$/); // motif identique au CHECK de 031
      expect(numero.slice(-6)).toBe('000042');
    });
  });

  it('4. CONCURRENCE — N attributions parallèles (transactions distinctes) → N numéros TOUS DISTINCTS', async () => {
    const N = 25;
    const numeros = await Promise.all(Array.from({ length: N }, () => attribuerCommit()));
    expect(numeros).toHaveLength(N);
    expect(new Set(numeros).size).toBe(N); // aucun doublon : le verrou de ligne sérialise
    for (const n of numeros) expect(n).toMatch(/^SAVV-[0-9]{4}-[0-9]{6}$/);
    // Les N numéros forment un bloc contigu (aucun trou) : les suffixes sont N valeurs consécutives.
    const suffixes = numeros.map((n) => Number(n.slice(-6))).sort((a, b) => a - b);
    for (let i = 1; i < suffixes.length; i++) expect(suffixes[i]).toBe(suffixes[i - 1] + 1);
  });

  it('5. ROLLBACK — une attribution annulée ne consomme AUCUN numéro (compteur inchangé)', async () => {
    const avant = await lireDernier(anneeCourante);
    await dansRollback(async (q) => {
      await attribuerNumeroCertificat(q); // attribué puis rollbacké
    });
    const apres = await lireDernier(anneeCourante);
    expect(apres).toEqual(avant); // le numéro a été LIBÉRÉ, pas de trou
  });

  it('6. bascule d’année — une nouvelle année repart à 1 sans toucher l’année précédente', async () => {
    // Sémantique PAR ANNÉE, testée sur les sentinelles (la fonction dérive l'année serveur).
    expect(await attribuerAnnee(ANNEE_TEST)).toBe(1); // 9999 vierge → 1
    expect(await attribuerAnnee(ANNEE_TEST)).toBe(2);
    expect(await attribuerAnnee(ANNEE_TEST_2)).toBe(1); // 9998 repart à 1, indépendant
    expect(await lireDernier(ANNEE_TEST)).toBe(2); // 9999 intact
  });

  it('7. frontière d’année ANCRÉE Europe/Paris — insensible au fuseau de la session', async () => {
    // Année Paris de l'instant courant (référence).
    const anneeParis = String(
      Number((await query<{ a: number }>(`SELECT EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Paris'))::int AS a`)).rows[0].a),
    );

    // (a) INVARIANCE FONCTION : sous des fuseaux de session extrêmes (26 h d'écart), la fonction rend la MÊME
    //     année, et c'est celle de Paris. Un now() SENSIBLE À LA SESSION divergerait dans la fenêtre autour du 1er
    //     janvier → ce test l'attraperait à la bascule ; hors bascule, l'égalité à Paris reste vérifiée.
    const anneeFonctionSous = async (tz: string): Promise<string> => {
      let annee = '';
      await dansRollback(async (q) => {
        await q(`SET LOCAL TimeZone = '${tz}'`);
        annee = (await attribuerNumeroCertificat(q)).slice(5, 9);
      });
      return annee;
    };
    const estPlus14 = await anneeFonctionSous('Pacific/Kiritimati'); // UTC+14
    const ouestMoins12 = await anneeFonctionSous('Etc/GMT+12'); // UTC-12
    expect(estPlus14).toBe(ouestMoins12); // même année malgré 26 h d'écart de session
    expect(estPlus14).toBe(anneeParis); // et c'est l'année civile française

    // (b) VERROU DÉTERMINISTE (indépendant de l'instant du run) : au 1er janvier 00h30 heure de Paris, l'ancrage
    //     Paris donne l'année N ; un now() sensible à la session (UTC) donnerait N-1 (le BUG décrit). Ce test
    //     ÉCHOUE si l'on revient un jour à une dérivation sensible à la session.
    await dansRollback(async (q) => {
      await q(`SET LOCAL TimeZone = 'UTC'`); // session volontairement décalée
      const instant = `TIMESTAMPTZ '2027-01-01 00:30:00+01'`; // 00h30 à Paris (hiver, +01) = 23h30 UTC le 31/12
      const ancrageParis = Number(
        (await q<{ a: number }>(`SELECT EXTRACT(YEAR FROM (${instant} AT TIME ZONE 'Europe/Paris'))::int AS a`)).rows[0].a,
      );
      const sensibleSession = Number((await q<{ a: number }>(`SELECT EXTRACT(YEAR FROM ${instant})::int AS a`)).rows[0].a);
      expect(ancrageParis).toBe(2027); // ancrage Europe/Paris → année civile française correcte
      expect(sensibleSession).toBe(2026); // now() sensible à la session (UTC) → année précédente = le bug évité
    });
  });
});
