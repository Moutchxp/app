import { describe, it, expect, vi } from 'vitest';

/**
 * LIVRAISON SANS CONSENTEMENT (Commit 2) — `socle.ts` accède au pool via `withTransaction` ; on le MOCKE (`q` routé par
 * SQL) pour PROUVER que, sans AUCUN consentement, `ingererProfil` CRÉE quand même internaute + projet (le PDF est dû à
 * tous) MAIS n'insère AUCUNE ligne `internaute_consentement`. Conséquence directe (Commit 1) : l'internaute est ABSENT
 * de la vue `internaute_commercial` PAR CONSTRUCTION (la vue exige `EXISTS(consentement actif)`). Aucune base réelle.
 */
const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock('../db/client', () => ({ withTransaction }));

import { ingererProfil } from './socle';
import type { CorpsIngestion } from './ingestion';

/** Mock du `q` transactionnel routé par SQL : capture TOUTES les requêtes émises. INSERT internaute → e-mail neuf (créé). */
function installerTx() {
  const sqls: string[] = [];
  const q = vi.fn(async (sql: string) => {
    sqls.push(sql);
    if (/INSERT INTO internaute \(prenom/.test(sql)) return { rows: [{ id: 'uuid-livraison' }] };
    if (/INSERT INTO internaute_projet/.test(sql)) return { rows: [{ id: '77' }] };
    return { rows: [] };
  });
  withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
  return { sqls };
}

const CORPS_SANS_CONSENTEMENT: CorpsIngestion = {
  identite: { prenom: 'Sans', nom: 'Consentement', email: 'livraison@example.com', telephone: null },
  consentements: [], // AUCUN des 3
  projet: {
    versionTunnel: 1, payload: {}, verdict: 'SANS_VIS_A_VIS', score: null, etage: 0, dernierEtage: false,
    residencePrincipale: null, communeInsee: null, lat: null, lon: null, adresseSaisie: null, adresseNormalisee: null,
    azimutDeg: null, hauteurSousPlafondM: null, hauteurVisionM: null, modeOrigine: null,
  },
};

describe('ingererProfil — LIVRAISON sans consentement (Commit 2 : PDF pour tous, classement conditionné au consentement)', () => {
  it('crée internaute + projet SANS lever d’erreur, et n’insère AUCUN consentement → absent de internaute_commercial', async () => {
    const { sqls } = installerTx();

    const r = await ingererProfil(CORPS_SANS_CONSENTEMENT); // AVANT Commit 2 : levait ErreurAucunConsentement

    // Le profil + projet existent → le PDF pourra être émis (jeton d'émission frappé par la route).
    expect(r.projetId).toBe(77);
    expect(r.creeInternaute).toBe(true);
    expect(sqls.some((s) => /INSERT INTO internaute \(prenom/.test(s))).toBe(true); // internaute créé
    expect(sqls.some((s) => /INSERT INTO internaute_projet/.test(s))).toBe(true); //  projet créé

    // MAIS AUCUNE ligne de consentement (la boucle ne tourne pas) → hors vue commerciale PAR CONSTRUCTION (Commit 1).
    expect(sqls.some((s) => /INSERT INTO internaute_consentement\b/.test(s))).toBe(false);
  });
});
