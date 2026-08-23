/**
 * Test d'INTÉGRATION (G2) — le millésime du cadastre est LISIBLE sur la vraie base (motif *.itest.ts, `npm run test:integration`).
 *
 * C'est LE test qui aurait attrapé le bug : `to_char(max(millesime), …)` sur la colonne TEXT `cadastre_millesime.millesime`
 * échoue côté PostgreSQL (function to_char(text) does not exist) → la lecture jetait → source « indisponible ». Un test unitaire
 * à requête simulée ne peut pas reproduire ce rejet de type ; seule une vraie connexion l'attrape. AVANT le fix : RED (indisponible).
 * LECTURE SEULE : uniquement des SELECT via lireSourcesFraicheur.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { lireSourcesFraicheur } from './sourcesFraicheurRepo';
import { closePool } from '../db/client';

afterAll(async () => {
  await closePool();
});

describe('sourcesFraicheurRepo — cadastre lisible sur base réelle', () => {
  it('cadastre : millésime réel au format AAAA-MM-JJ, JAMAIS « indisponible »', async () => {
    const lectures = await lireSourcesFraicheur();
    const cad = lectures.find((l) => l.cle === 'cadastre');
    expect(cad).toBeDefined();
    expect(cad!.indisponible).toBeFalsy(); // ← RED avant le fix (to_char(text) jetait → indisponible)
    expect(cad!.millesime).toMatch(/^\d{4}-\d{2}-\d{2}$/); // ex. « 2026-06-01 » lu directement depuis la colonne TEXT
  });
});
