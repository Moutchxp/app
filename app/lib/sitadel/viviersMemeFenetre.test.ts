import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * GARDE-FOU ANTI-RÉCIDIVE — « le compteur du vivier voit des communes que le carrousel ne voit pas ».
 *
 * Cause du bug (recon « carrousel à déposer à la main vide ») : le chemin de PROPOSITION (proposition → lireDossiersPriorite)
 * coupait au cap `nb_candidats_examines` un classement BRUT trié par date/rang, SANS la fenêtre d'ancienneté ; le chemin du
 * COMPTEUR (chargerVivier → lireDossiersDepuis) filtrait DÉJÀ la fenêtre en SQL. Les deux divergeaient : le compteur voyait des
 * permis récents que la proposition n'atteignait jamais (le top-N était saturé de dossiers hors fenêtre).
 *
 * Ce test PROUVE le COMPORTEMENT (jamais la forme complète d'un SQL) : les deux requêtes de candidats bornent leur fenêtre
 * d'ancienneté à la MÊME date (paramètre LIÉ), lue de la config au runtime. On mocke ../db/client, on capture (sql, params) et on
 * extrait la borne via le $N RÉELLEMENT présent dans le SQL (jamais une position figée). Il ÉCHOUE si un chemin perd son filtre.
 */
const { appels, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  return {
    appels,
    queryMock: async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: [] as unknown[] }; },
  };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: async () => undefined, pool: {}, closePool: async () => undefined }));

import { proposition, chargerVivier } from './demandeRepo';
import { CONFIG_VEILLE_DEFAUT, type ConfigVeille } from './veilleConfig';

/** La requête des CANDIDATS est la seule à porter la SELECTION de priorite.ts (alias `AS prada_courriel`). */
const reqCandidats = () => appels.find((a) => a.sql.includes('AS prada_courriel'));
/** Borne de fenêtre LIÉE dans une requête : on lit le $N réellement écrit dans le SQL (jamais une position en dur). */
const borneFenetre = (r?: { sql: string; params: unknown[] }): unknown => {
  if (!r) return undefined;
  const m = r.sql.replace(/\s+/g, ' ').match(/date_reelle_autorisation >= \$(\d+)/);
  return m ? r.params[Number(m[1]) - 1] : undefined;
};

beforeEach(() => { appels.length = 0; });

describe('Vivier — les DEUX chemins de lecture bornent la même fenêtre d’ancienneté', () => {
  it('proposition (carrousel) et chargerVivier (compteur) lient la MÊME date de fenêtre à leur requête candidats', async () => {
    const cfg: ConfigVeille = { ...CONFIG_VEILLE_DEFAUT, ancienneteMaxDemandeAnnees: 2 };

    await proposition(cfg);
    const borneProp = borneFenetre(reqCandidats());
    appels.length = 0;
    await chargerVivier(cfg);
    const borneVivier = borneFenetre(reqCandidats());

    // Les deux chemins DOIVENT filtrer la fenêtre (sinon récidive du bug) …
    expect(borneProp).toBeDefined();
    expect(borneVivier).toBeDefined();
    // … à la MÊME date, au format AAAA-MM-JJ (borne dérivée de la config au runtime, jamais en dur).
    expect(String(borneProp)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(borneProp).toBe(borneVivier);
  });

  it('la fenêtre est appliquée EN AMONT du cap : filtre de fenêtre ET LIMIT/OFFSET dans la même requête candidats', async () => {
    await proposition(CONFIG_VEILLE_DEFAUT);
    const sql = reqCandidats()!.sql.replace(/\s+/g, ' ');
    // Fenêtre (WHERE) ET cap (LIMIT) coexistent → le cap coupe APRÈS le filtre de fenêtre, dans une seule requête SQL.
    expect(sql).toContain('date_reelle_autorisation >=');
    expect(sql).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
  });
});
