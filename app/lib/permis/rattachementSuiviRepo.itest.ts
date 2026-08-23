/**
 * Test d'INTÉGRATION (L8) — le millésime BÂTI affiché par l'écran Rattachement vient du REGISTRE `bdtopo_edition.courante`
 * (autorité), et NON du proxy `permis_bati_capture.source_millesime` (max(date_modification) figé au gel). Motif *.itest.ts
 * (`npm run test:integration`) ; LECTURE SEULE. Se saute proprement si la base n'est pas peuplée.
 *
 * Bug corrigé : l'écran affichait « bâti 2026-06-18 » (proxy gelé le 21/08) alors que l'édition courante est 2026-06-15.
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { lireDetailSuivi } from './rattachementSuiviRepo';
import { millesimeEditionCourante } from './editionBdTopo';
import { query, closePool } from '../db/client';

const DOSSIER = 11430; // 07512024V0037 (cf. R0)

let dispo = false;
let registre = '';

beforeAll(async () => {
  try {
    registre = await millesimeEditionCourante(query);
    const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM permis_empreinte WHERE dossier_id = $1`, [DOSSIER]);
    dispo = (rows[0]?.n ?? 0) === 1 && registre !== 'inconnu';
  } catch { dispo = false; }
});
afterAll(async () => { await closePool(); });

describe('L8 — lireDetailSuivi.millesimeBati vient du registre, pas du proxy', () => {
  it('affiche le millésime de l’édition COURANTE (registre), pas la valeur figée dans permis_bati_capture', async () => {
    if (!dispo) { expect(dispo).toBe(false); return; } // base non peuplée : test neutralisé
    const detail = await lireDetailSuivi(DOSSIER);
    expect(detail).not.toBeNull();
    expect(detail!.millesimeBati).toBe(registre); // = bdtopo_edition.courante (autorité)

    // Le proxy figé dans la capture PEUT différer (c'est justement le bug) : on vérifie que l'affichage ne le suit PAS.
    const { rows } = await query<{ m: string | null }>(`SELECT source_millesime AS m FROM permis_bati_capture WHERE dossier_id = $1`, [DOSSIER]);
    const proxyFige = rows[0]?.m ?? null;
    if (proxyFige !== null && proxyFige !== registre) expect(detail!.millesimeBati).not.toBe(proxyFige);
  });
});
