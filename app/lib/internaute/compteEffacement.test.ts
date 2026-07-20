import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * TITULAIRE DE COMPTE × EFFACEMENT (Commit B) — `cycleVie` est `server-only` + pool `pg` ; on MOCKE
 * `withTransaction`/`query` (routés par SQL) pour PROUVER, sans base réelle :
 *  (b) un internaute AVEC `internaute_auth` est EXCLU de l'auto-effacement post-envoi (garde son identité) ;
 *  (c) un internaute SANS compte reste auto-effacé (NON-RÉGRESSION du Commit 4) ET son credential est nettoyé (no-op) ;
 *  (d) l'effacement ADMIN d'un titulaire SUPPRIME sa ligne `internaute_auth` (le hash ne survit pas au compte effacé) ;
 *  (e) la purge à échéance EXCLUT aussi les titulaires de compte (même règle absolue « jamais anonymisé automatiquement »).
 */
const { withTransaction, query } = vi.hoisted(() => ({ withTransaction: vi.fn(), query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ withTransaction, query }));

import { effacerIdentiteLivraisonSiEligible, effacerInternaute, purgerEchus } from './cycleVie';

const A_ANONYMISE = /UPDATE internaute\s+SET prenom = NULL/; // l'identité passe à NULL
const SUPPRIME_CREDENTIAL = /DELETE FROM internaute_auth/i; // credential effacé (Commit B)

/** `q` transactionnel routé par SQL : capture toutes les requêtes de la transaction. `existe` pilote la présence du profil. */
function installerTx(existe = true, candidats: Array<{ id: string }> = []) {
  const sqls: string[] = [];
  const q = vi.fn(async (sql: string) => {
    sqls.push(sql);
    if (/SELECT 1 FROM internaute WHERE id = \$1/.test(sql)) return { rows: existe ? [{ un: 1 }] : [] };
    if (/FROM internaute i/.test(sql)) return { rows: candidats }; // sélection des candidats de purge
    return { rows: [] };
  });
  withTransaction.mockImplementation(async (cb: (q: unknown) => Promise<unknown>) => cb(q));
  return { sqls };
}

/** Routage des lectures HORS transaction : consentement actif ? compte ? rétention. */
function routerLectures(opts: { consentActif?: boolean; aCompte?: boolean; retentionJours?: number }) {
  query.mockImplementation(async (sql: string) => {
    if (/internaute_consentement_actif/.test(sql)) return { rows: opts.consentActif ? [{ un: 1 }] : [] };
    if (/FROM internaute_auth/.test(sql)) return { rows: opts.aCompte ? [{ un: 1 }] : [] };
    if (/internaute_retention/.test(sql)) return { rows: [{ jours: opts.retentionJours ?? 365 }] };
    return { rows: [] };
  });
}

describe('Titulaire de compte × effacement (Commit B)', () => {
  beforeEach(() => {
    withTransaction.mockReset();
    query.mockReset();
  });

  it('(b) internaute AVEC compte, envoi confirmé, non-consentant → EXCLU de l’auto-effacement (identité conservée)', async () => {
    routerLectures({ consentActif: false, aCompte: true }); // non-consentant MAIS titulaire de compte
    installerTx(true);
    await effacerIdentiteLivraisonSiEligible('uuid-titulaire');
    expect(withTransaction).not.toHaveBeenCalled(); // aucune anonymisation → l'identité survit
  });

  it('(c) internaute SANS compte, non-consentant → auto-effacé (non-régression) + credential nettoyé (no-op)', async () => {
    routerLectures({ consentActif: false, aCompte: false });
    const { sqls } = installerTx(true);
    await effacerIdentiteLivraisonSiEligible('uuid-sans-compte');
    expect(withTransaction).toHaveBeenCalledTimes(1); // anonymisation déclenchée comme avant
    expect(sqls.some((s) => A_ANONYMISE.test(s))).toBe(true);
    expect(sqls.some((s) => SUPPRIME_CREDENTIAL.test(s))).toBe(true); // DELETE credential émis (no-op ici)
  });

  it('(d) effacement ADMIN d’un titulaire → anonymise l’identité ET SUPPRIME internaute_auth', async () => {
    routerLectures({});
    const { sqls } = installerTx(true);
    const r = await effacerInternaute('uuid-titulaire', 7);
    expect(r.efface).toBe(true);
    expect(sqls.some((s) => A_ANONYMISE.test(s))).toBe(true);
    expect(sqls.some((s) => SUPPRIME_CREDENTIAL.test(s))).toBe(true); // le hash ne survit pas au compte effacé
  });

  it('(e) purge à échéance → la sélection des candidats EXCLUT les titulaires de compte (NOT EXISTS internaute_auth)', async () => {
    routerLectures({ retentionJours: 365 });
    const { sqls } = installerTx(true, []); // aucun candidat : on inspecte seulement le SQL de sélection
    const r = await purgerEchus(9);
    expect(r.purges).toBe(0);
    const selection = sqls.find((s) => /FROM internaute i/.test(s)) ?? '';
    expect(/internaute_auth/i.test(selection)).toBe(true); // l'exclusion titulaire est câblée dans la requête de purge
  });
});
