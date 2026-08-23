/**
 * Test d'INTÉGRATION (L4) — `lireAffectationOrigine` construit le schéma « Configuration d'origine » à partir du SNAPSHOT FIGÉ
 * (permis_bati_snapshot), et NON de la couche bâti vivante (motif *.itest.ts, `npm run test:integration`). LECTURE SEULE : aucune
 * écriture, aucun DDL. S'appuie sur deux dossiers RÉELS de la base locale (cf. R0) — se saute proprement s'ils sont absents.
 *
 * Angle mort visé : une requête simulée ne prouverait pas que les repères A/B/C… restent IDENTIQUES entre snapshot et live (même
 * ordre déterministe). Seule une vraie base, sur le même jeu de 16 polygones, le démontre.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { lireAffectation, lireAffectationOrigine, lireComparaison } from './affectationRepo';
import { query, closePool } from '../db/client';

const DOSSIER_SNAPSHOT = 11430; // 07512024V0037 : 16 polygones gelés ET 16 en live (mêmes cleabs) — cf. R0
const DOSSIER_TERRAIN_NU = 11434; // 07512025V0035 : capture faite, 0 bâtiment (terrain nu au moment du gel)

let dispo = false;

beforeAll(async () => {
  // Ne joue que si les deux dossiers réels ET leur capture existent (base locale peuplée) ; sinon on saute sans échouer.
  try {
    const { rows } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM permis_bati_capture WHERE dossier_id = ANY($1) AND capture = true`, [[DOSSIER_SNAPSHOT, DOSSIER_TERRAIN_NU]]);
    dispo = (rows[0]?.n ?? 0) === 2;
  } catch { dispo = false; }
});
afterAll(async () => { await closePool(); });

describe('L4 — lireAffectationOrigine lit le snapshot figé (lecture seule)', () => {
  it('11430 : schéma d’origine depuis le snapshot — figé, 16 polygones, millésime du gel écrit', async () => {
    if (!dispo) { expect(dispo).toBe(false); return; } // base non peuplée : test neutralisé (pas un faux échec)
    const o = await lireAffectationOrigine(DOSSIER_SNAPSHOT);
    expect(o.figee).toBe(true);
    expect(o.captureVide).toBe(false);
    expect(o.millesimeGel).toBe('2026-06-18');
    expect(o.polygones.length).toBe(16);
    expect(o.schema.polygones.length).toBe(16);
  });

  it('11430 : repères IDENTIQUES entre origine (snapshot) et live — aucun repère n’a bougé', async () => {
    if (!dispo) { expect(dispo).toBe(false); return; }
    const [origine, live] = await Promise.all([lireAffectationOrigine(DOSSIER_SNAPSHOT), lireAffectation(DOSSIER_SNAPSHOT)]);
    const clef = (p: { repere: string; cleabs: string | null }) => `${p.repere}:${p.cleabs}`;
    expect(origine.polygones.map(clef)).toEqual(live.polygones.map(clef)); // même repère → même cleabs des deux côtés
  });

  it('11434 : capture faite mais terrain nu → figé, captureVide=true, 0 polygone, millésime présent (≠ « aucune capture »)', async () => {
    if (!dispo) { expect(dispo).toBe(false); return; }
    const o = await lireAffectationOrigine(DOSSIER_TERRAIN_NU);
    expect(o.figee).toBe(true);
    expect(o.captureVide).toBe(true);
    expect(o.polygones.length).toBe(0);
    expect(o.millesimeGel).toBe('2026-06-18');
  });

  it('L5 — 11430 : snapshot == live aujourd’hui → aChange=false, AUCUN polygone rouge (comportement CORRECT, pas un bug)', async () => {
    if (!dispo) { expect(dispo).toBe(false); return; }
    const c = await lireComparaison(DOSSIER_SNAPSHOT);
    expect(c.origine.figee).toBe(true);
    expect(c.origine.polygones.length).toBe(16);
    expect(c.nouvelle.polygones.length).toBe(16);
    expect(c.polygonesModifies).toEqual([]); // rien n'a bougé depuis le gel → rien en rouge
    expect(c.aChange).toBe(false);            // pas de second schéma jumeau
    // Cadre COMMUN : les deux schémas projettent l'empreinte à l'identique (même échelle/cadrage).
    expect(c.origine.schema.empreintePath).toBe(c.nouvelle.schema.empreintePath);
  });
});
