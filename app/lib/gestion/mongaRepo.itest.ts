/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 1 — LA MESURE SUR LES 97 MAILS RÉELS ═════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : « Tests sur les 97 mails réels (taux ≥ celui de l'audit). »
 *
 * Test d'INTÉGRATION (motif `*.itest.ts`, `npm run test:integration`) : il lui faut la VRAIE base, parce que
 * c'est exactement ce qu'il prouve. Une épreuve à corps simulés dirait que l'extracteur lit ce que j'imagine que
 * Monga écrit ; celle-ci dit ce qu'il lit du courrier réellement reçu, mail par mail.
 *
 * 🔴 IL ÉCRIT, et c'est assumé : il relit les mails et garde ses lectures dans `gestion_monga_mail`. C'est
 * exactement ce que fait le script de rattrapage, et c'est sans conséquence — cette table ne contient que des
 * lectures rejouables. ⚠️ IL NE TOUCHE JAMAIS `gestion_monga_lien` : les liens sont des décisions d'Arno.
 *
 * ⚠️ POURQUOI HORS DE `npm test`, alors qu'Arno demande des tests. Parce qu'une épreuve qui exige la base et
 * les 156 mails de Monga serait ROUGE sur toute machine qui ne les a pas — et une suite rouge pour une raison
 * normale finit par ne plus être lue (précédent `curation.test.ts`, rouge du 14/07 au 03/08/2026). Les règles
 * elles-mêmes sont éprouvées dans `monga.test.ts`, qui tourne, lui, dans `npm test`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../db/client';
import { interventionsMonga, relireLesMailsMonga, SQL_EST_MAIL_MONGA } from './mongaRepo';

/**
 * 🔴 LE TAUX DE L'AUDIT DU 06/10/2026, SUR SA PROPRE POPULATION. L'audit mesurait les **97 mails de
 * `noreply@monga.io`** — le gabarit. Comparer à un taux calculé sur les 156 candidats (transferts et bruit
 * compris) aurait été une comparaison truquée : la population n'est pas la même, et le chiffre serait plus bas
 * sans qu'aucune lecture ait empiré.
 */
const AUDIT = { mails: 97, reference: 95, libelle: 93, adresse: 93, lienMission: 93, references: 40 };

afterAll(async () => { await closePool(); });

describe('mongaRepo — la lecture du courrier Monga réel', () => {
  it(`relit les mails et atteint AU MOINS le taux de l’audit (${AUDIT.reference}/${AUDIT.mails} références)`,
    async () => {
      const releve = await relireLesMailsMonga();
      expect(releve.mailsLus).toBeGreaterThanOrEqual(AUDIT.mails);

      const { rows } = await query<{
        mails: number; ref: number; lib: number; adr: number; lien: number;
      }>(
        `SELECT count(*)::int AS mails, count(mm.reference)::int AS ref, count(mm.libelle)::int AS lib,
                count(mm.adresse)::int AS adr, count(mm.lien_mission)::int AS lien
           FROM gestion_message m
           JOIN gestion_monga_mail mm ON mm.message_id = m.id
          WHERE lower(m.de_adresse) = 'noreply@monga.io'`);
      const g = rows[0];
      expect(g.mails).toBe(AUDIT.mails);
      expect(g.ref).toBeGreaterThanOrEqual(AUDIT.reference);
      expect(g.lib).toBeGreaterThanOrEqual(AUDIT.libelle);
      expect(g.adr).toBeGreaterThanOrEqual(AUDIT.adresse);
      expect(g.lien).toBeGreaterThanOrEqual(AUDIT.lienMission);
      expect(releve.references).toBeGreaterThanOrEqual(AUDIT.references);
    });

  it('🔴🔴 LE DÉFAUT CORRIGÉ : aucune adresse lue n’est une référence MNG', async () => {
    // Avant la correction, 36 des 40 références sortaient « sans bien » parce que leur adresse valait
    // « MNG-20354 ». Cette épreuve interdit le retour du défaut sur l'ENSEMBLE du courrier réel, pas sur un cas.
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_monga_mail WHERE adresse ~* 'MNG-[0-9]{4,6}'`);
    expect(rows[0].n).toBe(0);

    // Et MNG-20354 — le cas qui a révélé le défaut — lit bien son adresse, qui n'a pourtant PAS de numéro.
    const { rows: m } = await query<{ adresse: string | null }>(
      `SELECT DISTINCT adresse FROM gestion_monga_mail
        WHERE reference = 'MNG-20354' AND adresse IS NOT NULL`);
    expect(m.map((r) => r.adresse)).toContain('Rue Camille Deschanel, 92400 Courbevoie');
  });

  it('les 40 interventions sont listées avec leur dernière étape, et AUCUNE n’est reliée d’office', async () => {
    const toutes = await interventionsMonga();
    expect(toutes.length).toBeGreaterThanOrEqual(AUDIT.references);
    for (const i of toutes) {
      expect(i.reference).toMatch(/^MNG-\d{4,6}$/);
      expect(i.nbMails).toBeGreaterThan(0);
      expect(i.derniereEtapeMot).not.toBe('');
    }
    /**
     * 🔴 LA RÈGLE D'ARNO, MESURÉE : « Rien n'est relié automatiquement. » Le point 5 du lot repose entièrement
     * là-dessus — les 40 références reprises doivent apparaître dans le filtre « à relier », pas dans un
     * événement choisi par une machine.
     */
    const aRelier = await interventionsMonga({ reliees: false });
    const reliees = await interventionsMonga({ reliees: true });
    expect(aRelier.length + reliees.length).toBe(toutes.length);
    for (const i of aRelier) expect(i.evenementId).toBeNull();
    for (const i of reliees) expect(i.evenementId).not.toBeNull();
  });

  it('⚠️ la règle entrante n° 2 n’écarte AUCUN mail Monga', async () => {
    /**
     * 🔴 CONSIGNE D'ARNO, À CHAQUE LOT : « Règle entrante n° 2 : toujours éteinte, et elle ne doit JAMAIS
     * écarter les mails Monga. » La règle n° 2 (« adresse sans réponse ») viserait `noreply@monga.io` de plein
     * fouet. Deux mesures, parce qu'elles disent deux choses différentes : la règle est éteinte, ET aucun mail
     * Monga n'est écarté — par elle ou par une autre.
     */
    const { rows: regle } = await query<{ actif: boolean }>(
      `SELECT actif FROM gestion_regle_exclusion WHERE id = 2`);
    expect(regle[0]?.actif).toBe(false);

    const { rows: ecartes } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_message m
        WHERE ${SQL_EST_MAIL_MONGA} AND m.exclu_le IS NOT NULL`);
    expect(ecartes[0].n).toBe(0);
  });
});
