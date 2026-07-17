import { describe, it, expect, beforeEach, vi } from 'vitest';

// `socle.ts` accède au pool `pg` via `withTransaction`. On le MOCKE (il invoque le callback avec un `q` mocké, routé par
// SQL) pour PROUVER la garde MONOTONE de `parcours` (migration 028 : 'incomplet' | 'complet') : un internaute RÉUTILISÉ
// qui complète MONTE à 'complet' (garde SQL `WHERE parcours = 'incomplet'`), et un 'complet' ne redescend JAMAIS.
// Aucun chemin de consentement n'est touché ici (la boucle tourne normalement via le `q` mocké).
const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock('../db/client', () => ({ withTransaction }));

import { ingererProfil } from './socle';
import type { CorpsIngestion } from './ingestion';

/** Mock du `q` transactionnel : routé par SQL. `reutilise` pilote `creeInternaute` (INSERT internaute → rows vides =
 *  ON CONFLICT DO NOTHING → réutilisation). CAPTURE l'UPDATE de parcours (SQL + params) s'il est émis. */
function installerTx(reutilise: boolean) {
  let updateSql: string | null = null;
  let updateParams: unknown[] | undefined;
  const q = vi.fn(async (sql: string, params?: unknown[]) => {
    if (/INSERT INTO internaute \(prenom/.test(sql)) return { rows: reutilise ? [] : [{ id: 'uuid-neuf' }] };
    if (/SELECT id FROM internaute WHERE lower\(email\)/.test(sql)) return { rows: [{ id: 'uuid-existant' }] };
    if (/UPDATE internaute SET parcours/.test(sql)) { updateSql = sql; updateParams = params; return { rows: [] }; }
    if (/SELECT id FROM internaute_consentement_texte/.test(sql)) return { rows: [{ id: 1 }] };
    if (/INSERT INTO internaute_projet/.test(sql)) return { rows: [{ id: '99' }] };
    return { rows: [] };
  });
  withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
  return { getUpdate: () => ({ sql: updateSql, params: updateParams }) };
}

const CORPS: CorpsIngestion = {
  identite: { prenom: 'Ada', nom: 'Lovelace', email: 'ada@example.com', telephone: null },
  consentements: [{ finalite: 'recontact_interne', version: 1 }],
  projet: {
    versionTunnel: 1, payload: {}, verdict: 'SANS_VIS_A_VIS', score: null, etage: 0, dernierEtage: false,
    residencePrincipale: null, communeInsee: null, lat: null, lon: null, adresseSaisie: null, adresseNormalisee: null,
    azimutDeg: null, hauteurSousPlafondM: null, hauteurVisionM: null, modeOrigine: null,
  },
};

describe('ingererProfil — parcours MONOTONE (migration 028 : incomplet | complet)', () => {
  // Corps de BLOC obligatoire : une arrow concise RENVERRAIT le mock (mockReset retourne le mock, une fonction),
  // que vitest prendrait pour un teardown et rappellerait sans argument → `cb(q)` avec cb=undefined. Cf. cycleVie.test.
  beforeEach(() => { withTransaction.mockReset(); });

  it("(a) internaute RÉUTILISÉ + retour 'complet' → UPDATE parcours='complet', garde SQL WHERE parcours='incomplet'", async () => {
    const t = installerTx(true); // e-mail connu → réutilisé (creeInternaute=false)
    await ingererProfil(CORPS, 'complet', true);
    const u = t.getUpdate();
    expect(u.sql).toMatch(/UPDATE internaute SET parcours = 'complet'/);
    expect(u.sql).toMatch(/WHERE .*parcours = 'incomplet'/); // garde MONOTONE dans le SQL, pas seulement en TS
    expect(u.params?.[0]).toBe('uuid-existant');
  });

  it("(b) internaute RÉUTILISÉ + retour 'incomplet' → AUCUN UPDATE parcours (un 'complet' existant ne redescend jamais)", async () => {
    const t = installerTx(true);
    await ingererProfil(CORPS, 'incomplet', false);
    expect(t.getUpdate().sql).toBeNull();
  });

  it("(c) internaute CRÉÉ + retour 'complet' → AUCUN UPDATE (l'INSERT a déjà posé le bon parcours)", async () => {
    const t = installerTx(false); // e-mail neuf → créé (creeInternaute=true)
    await ingererProfil(CORPS, 'complet', true);
    expect(t.getUpdate().sql).toBeNull();
  });
});
