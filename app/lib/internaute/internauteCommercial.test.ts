import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * INVARIANT DE FRONTIÈRE (Commit 1) — « le code commercial ne lit JAMAIS la table `internaute` brute ; toute lecture
 * commerciale passe par la VUE `internaute_commercial` (migration 044), qui exclut par construction tout internaute sans
 * consentement actif ». On MOCKE `query` (comme extractionRepo.test.ts) et on CAPTURE chaque SQL émis par les fonctions
 * commerciales : chacun DOIT citer `internaute_commercial` et ne JAMAIS lire `internaute` brute. C'est la preuve
 * STRUCTURELLE (indépendante de la base) qu'un destinataire à 0 consentement est absent des extractions PAR CONSTRUCTION :
 * il n'existe pas dans la vue, et aucune requête commerciale ne contourne la vue.
 */
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { lireProfilsFiltres, lireProfilsExport, compterProfils, lireCommunesPresentes, lireBornesDates } from './extractionRepo';

// Détecte une lecture de la table `internaute` BRUTE : `FROM`/`JOIN internaute ` suivi d'un blanc (donc PAS
// `internaute_commercial`, ni `internaute_projet`, ni `internaute_consentement_actif`, dont le caractère suivant est `_`).
const LECTURE_BRUTE = /(FROM|JOIN)\s+internaute\s/i;

const F1 = 'recontact_interne' as const;

/** Toutes les requêtes émises par le dernier appel citent la vue commerciale et AUCUNE ne lit `internaute` brute. */
function attendreCloisonnement(): void {
  const sqls = query.mock.calls.map((c) => String(c[0]));
  expect(sqls.length).toBeGreaterThan(0); // le chemin a bien émis du SQL (pas court-circuité)
  for (const sql of sqls) {
    expect(sql).toMatch(/internaute_commercial/); // lit la VUE
    expect(sql).not.toMatch(LECTURE_BRUTE); //       jamais la table brute
  }
}

describe('Frontière commercial/livraison — toute lecture commerciale passe par internaute_commercial, jamais internaute brut', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] }); // shape neutre : on ne veut QUE le SQL émis, aucune fonction ne doit planter
  });

  it('lireProfilsFiltres (liste) — count + lignes citent la vue, jamais internaute brut', async () => {
    await lireProfilsFiltres({}, 1, 25, [F1]);
    attendreCloisonnement();
  });

  it('lireProfilsExport (export CSV) — cite la vue, jamais internaute brut', async () => {
    await lireProfilsExport({}, [F1]);
    attendreCloisonnement();
  });

  it('compterProfils (compteur live) — cite la vue, jamais internaute brut', async () => {
    await compterProfils({}, [F1]);
    attendreCloisonnement();
  });

  it('lireCommunesPresentes (picker géo) — cite la vue, jamais internaute brut', async () => {
    await lireCommunesPresentes([F1]);
    attendreCloisonnement();
  });

  it('lireBornesDates (« depuis toujours ») — cite la vue, jamais internaute brut', async () => {
    await lireBornesDates();
    attendreCloisonnement();
  });

  it('le détecteur LECTURE_BRUTE distingue bien la vue de la table brute (garde-fou du test lui-même)', () => {
    expect('FROM internaute i').toMatch(LECTURE_BRUTE); //              table brute → détectée
    expect('FROM internaute_commercial i').not.toMatch(LECTURE_BRUTE); // vue → ignorée
    expect('FROM internaute_projet pr').not.toMatch(LECTURE_BRUTE); //   table liée → ignorée
    expect('FROM internaute_consentement_actif ca').not.toMatch(LECTURE_BRUTE);
  });
});
