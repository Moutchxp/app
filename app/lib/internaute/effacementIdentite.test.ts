import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * EFFACEMENT DE L'IDENTITÉ — CONSERVE projet + certificat (Commit 4 — A). `cycleVie` est `server-only` + pool `pg` ; on
 * MOCKE `withTransaction`/`query` (routés par SQL) pour PROUVER : (a) l'effacement admin d'un porteur de certificat
 * anonymise l'identité SANS supprimer le projet (le mur `certificat.projet_id` NO ACTION n'est pas heurté → le certificat
 * survit) ; (b) un non-consentant après envoi confirmé est anonymisé AUTOMATIQUEMENT ; (c) un consentant ne l'est JAMAIS
 * automatiquement (droit à l'oubli sur demande admin uniquement). Aucune base réelle.
 */
const { withTransaction, query } = vi.hoisted(() => ({ withTransaction: vi.fn(), query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ withTransaction, query }));

import { effacerInternaute, effacerIdentiteLivraisonSiEligible } from './cycleVie';

/** `q` transactionnel routé par SQL : capture TOUTES les requêtes émises dans la transaction. `existe` pilote la présence du profil. */
function installerTx(existe = true) {
  const sqls: string[] = [];
  const q = vi.fn(async (sql: string) => {
    sqls.push(sql);
    if (/SELECT 1 FROM internaute WHERE id = \$1/.test(sql)) return { rows: existe ? [{ un: 1 }] : [] };
    return { rows: [] };
  });
  withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
  return { sqls };
}

const A_ANONYMISE = /UPDATE internaute\s+SET prenom = NULL/;      // l'identité passe à NULL
const SUPPRIME_PROJET = /DELETE FROM internaute_projet/i;         // le geste INTERDIT (mur) — ne doit jamais apparaître

describe('Effacement identité — CONSERVE projet + certificat (Commit 4 — A)', () => {
  beforeEach(() => {
    withTransaction.mockReset();
    query.mockReset();
  });

  it('(a) effacement ADMIN d’un porteur de certificat → anonymise l’identité, NE SUPPRIME PAS le projet (mur évité)', async () => {
    const { sqls } = installerTx(true);
    const r = await effacerInternaute('uuid-1', 7);
    expect(r.efface).toBe(true);
    expect(sqls.some((s) => A_ANONYMISE.test(s))).toBe(true); //  identité anonymisée
    expect(sqls.some((s) => SUPPRIME_PROJET.test(s))).toBe(false); // projet CONSERVÉ → aucune violation FK, certificat survit
  });

  it('(b) NON-consentant, envoi confirmé → identité anonymisée AUTOMATIQUEMENT (projet + certificat intacts)', async () => {
    query.mockResolvedValue({ rows: [] }); // 0 consentement actif → non-consentant
    const { sqls } = installerTx(true);
    await effacerIdentiteLivraisonSiEligible('uuid-livraison');
    expect(withTransaction).toHaveBeenCalledTimes(1); //  anonymisation déclenchée
    expect(sqls.some((s) => A_ANONYMISE.test(s))).toBe(true);
    expect(sqls.some((s) => SUPPRIME_PROJET.test(s))).toBe(false);
  });

  it('(c) CONSENTANT → AUCUN effacement automatique (droit à l’oubli sur demande admin uniquement)', async () => {
    query.mockResolvedValue({ rows: [{ un: 1 }] }); // ≥1 consentement actif
    await effacerIdentiteLivraisonSiEligible('uuid-consentant');
    expect(withTransaction).not.toHaveBeenCalled(); // rien anonymisé
  });
});
