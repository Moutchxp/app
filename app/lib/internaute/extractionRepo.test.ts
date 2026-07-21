import { describe, it, expect, beforeEach, vi } from 'vitest';

// `extractionRepo` est `server-only` + accède au pool `pg` via `../db/client`. Pour tester la GARDE FAIL-CLOSED
// (défense PRIMAIRE, RGPD) SANS base, on neutralise `server-only` et on MOCKE `query`. Preuve visée : une sélection
// de statuts VIDE renvoie un résultat vide EN N'ÉMETTANT AUCUNE requête (jamais de lecture sans contrainte de finalité).
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../db/client', () => ({ query }));

import { lireProfilsFiltres, lireProfilsExport, lireCommunesPresentes, compterProfils } from './extractionRepo';

describe('extractionRepo — GARDE FAIL-CLOSED EXTRACTION : statuts VIDE → résultat vide SANS requête (jamais toute la base commerciale)', () => {
  beforeEach(() => query.mockReset());

  it('lireProfilsExport([]) → [] et `query` JAMAIS appelé', async () => {
    const r = await lireProfilsExport({}, []);
    expect(r).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('lireProfilsExport : statuts uniquement FORGÉS (normalisés → vide) → fail-closed, aucune requête', async () => {
    const r = await lireProfilsExport({}, ["hack'; DROP TABLE internaute" as never]);
    expect(r).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('lireCommunesPresentes([]) → [] et `query` JAMAIS appelé (court-circuit explicite)', async () => {
    const r = await lireCommunesPresentes([]);
    expect(r).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED tient AVEC une recherche `q` : EXPORT statuts vide + q présent → vide, AUCUNE requête (la recherche ne contourne pas le garde)', async () => {
    const rE = await lireProfilsExport({ q: 'thevenin' }, []);
    expect(rE).toEqual([]);
    expect(query).not.toHaveBeenCalled(); // le court-circuit statuts vide précède TOUT (y compris le filtre q)
  });
});

describe('extractionRepo — LISTE DE GESTION : consentement positif (vide = sans consentement) × axe compte, sur `internaute`', () => {
  beforeEach(() => query.mockReset());

  it('PLUS DE GARDE : statuts vide + compte null → REQUÊTE (count + page), « sans consentement » sur `internaute`', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '3' }] }).mockResolvedValueOnce({ rows: [] });
    const r = await lireProfilsFiltres({}, 1, 25, []);
    expect(r.total).toBe(3);
    expect(query).toHaveBeenCalledTimes(2); // n'est plus court-circuité
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain('FROM internaute i'); //                       table brute (surface les one-shots sans consentement)
    expect(sqlCount).toContain('NOT EXISTS (SELECT 1 FROM internaute_consentement_actif ca'); // « sans aucun consentement actif »
    expect(sqlCount).not.toContain('internaute_commercial');
    expect(sqlCount).not.toContain('internaute_gerable');
    expect(sqlCount).not.toContain('WHERE false');
  });

  it('« sans consentement » × compte « avec » → NOT EXISTS(consentement) ET EXISTS(internaute_auth) = comptes sans consentement', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '2' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, [], 'avec');
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain('NOT EXISTS (SELECT 1 FROM internaute_consentement_actif ca'); // axe consentement (vide → NOT)
    expect(sqlCount).toContain('EXISTS (SELECT 1 FROM internaute_auth iac'); //                axe compte « avec »
    expect(sqlCount).not.toMatch(/NOT EXISTS \(SELECT 1 FROM internaute_auth iac/); //          « avec » = EXISTS, pas NOT EXISTS
  });

  it('« sans consentement » × compte « sans » → NOT EXISTS(consentement) ET NOT EXISTS(auth) = one-shots sans consentement', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '1' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, [], 'sans');
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain('NOT EXISTS (SELECT 1 FROM internaute_consentement_actif ca');
    expect(sqlCount).toContain('NOT EXISTS (SELECT 1 FROM internaute_auth iac'); // one-shot
  });

  it('≥1 statut → EXISTS(consentement AND finalite IN (...)) = OR, sur `internaute` ; aucun prédicat compte si indifférent', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '7' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['email_marketing']);
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain('FROM internaute i');
    expect(sqlCount).toContain("ca.finalite IN ('email_marketing')"); // OR (une seule finalité ici)
    expect(sqlCount).not.toContain('NOT EXISTS'); //                    ≥1 statut → EXISTS positif
    expect(sqlCount).not.toContain('internaute_auth iac'); //           aucun axe compte
  });

  it('COMBINAISON statut + compte : F2 + « avec » → EXISTS(F2) ET EXISTS(internaute_auth), croisés en AND', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '2' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['email_marketing'], 'avec');
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain("ca.finalite IN ('email_marketing')"); // axe consentement
    expect(sqlCount).toContain('EXISTS (SELECT 1 FROM internaute_auth iac'); // axe compte, en AND
  });

  it('≥2 statuts, DÉFAUT (mode omis) → ET : un EXISTS PAR finalité (a TOUTES les cochées)', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '1' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['recontact_interne', 'email_marketing']); // mode omis → 'et'
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain("ca_recontact_interne.finalite = 'recontact_interne'");
    expect(sqlCount).toContain("ca_email_marketing.finalite = 'email_marketing'");
    expect(sqlCount).not.toContain('finalite IN'); // ET ≠ forme OU
  });

  it('≥2 statuts, mode « ou » explicite → un seul EXISTS `finalite IN (...)` (a au moins une)', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '3' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['recontact_interne', 'email_marketing'], null, 'ou');
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain("ca.finalite IN ('recontact_interne', 'email_marketing')");
    expect(sqlCount).not.toContain('ca_recontact_interne.finalite'); // pas la forme ET (alias par finalité)
  });

  it('COMBINAISON F1+F2 mode ET × compte « avec » → 2 EXISTS(consentement) ANDés + EXISTS(internaute_auth)', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '1' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['recontact_interne', 'email_marketing'], 'avec', 'et');
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain("ca_recontact_interne.finalite = 'recontact_interne'"); // axe consentement (ET)
    expect(sqlCount).toContain("ca_email_marketing.finalite = 'email_marketing'");
    expect(sqlCount).toContain('EXISTS (SELECT 1 FROM internaute_auth iac'); //         axe compte, en AND par-dessus
  });

  it('le prédicat compte n’ajoute AUCUN paramètre lié → LIMIT/OFFSET restent alignés sur les filtres', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({ q: 'x' }, 2, 25, [], 'avec');
    const paramsPage = query.mock.calls[1][1] as unknown[];
    // 1 param pour `q` (%x%) + taille + offset = 3 ; le prédicat compte est un littéral (aucun $n)
    expect(paramsPage).toHaveLength(3);
    expect(String(query.mock.calls[1][0])).toContain(`LIMIT $2 OFFSET $3`);
  });
});

describe('lireProfilsFiltres — base COMMERCIALE (tableau piloté par l’extraction) vs gestion (défaut)', () => {
  beforeEach(() => query.mockReset());

  it('base=\'commercial\' + statuts VIDE → { total: 0, lignes: [] } SANS requête (fail-closed, comme l’export)', async () => {
    const r = await lireProfilsFiltres({}, 1, 25, [], null, 'et', 'commercial');
    expect(r).toEqual({ total: 0, lignes: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('base=\'commercial\' + [F1] → FROM internaute_commercial (clauseStatuts), paginé, a_un_compte calculé', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '5' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['recontact_interne'], null, 'et', 'commercial');
    expect(query).toHaveBeenCalledTimes(2); // count + page (pas de court-circuit ici : statuts non vide)
    const sqlCount = String(query.mock.calls[0][0]);
    const sqlPage = String(query.mock.calls[1][0]);
    expect(sqlCount).toContain('internaute_commercial'); //                base commerciale
    expect(sqlCount).not.toContain('FROM internaute i'); //                 PAS la table brute (gestion)
    expect(sqlCount).not.toContain('NOT EXISTS (SELECT 1 FROM internaute_consentement_actif'); // pas la sémantique « sans consentement »
    expect(sqlCount).toContain("ca_recontact_interne.finalite = 'recontact_interne'"); // clause commerciale (intersection)
    expect(sqlPage).toContain('EXISTS (SELECT 1 FROM internaute_auth ia'); // a_un_compte (capsule du tableau)
    expect(sqlPage).toContain('LIMIT $1 OFFSET $2'); //                    paginé
  });

  it('base=\'commercial\' IGNORE le filtre compte (aucun prédicat `internaute_auth iac`), même si passé', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '1' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['recontact_interne'], 'avec', 'et', 'commercial');
    expect(String(query.mock.calls[0][0])).not.toContain('internaute_auth iac'); // compte = gestion-only, ignoré en commercial
  });

  it('base=\'commercial\' IGNORE la recherche nom (q) : aucune clause `unaccent`, q pas lié', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '0' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({ q: 'thevenin' }, 1, 25, ['recontact_interne'], null, 'et', 'commercial');
    expect(String(query.mock.calls[0][0])).not.toContain('unaccent'); // q retiré → aucune clause nom
    expect(query.mock.calls[0][1]).not.toContain('%thevenin%');
  });

  it('base=\'commercial\' + [F1,F2] mode « ou » → un seul EXISTS `finalite IN (...)` sur internaute_commercial', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '9' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, ['recontact_interne', 'email_marketing'], null, 'ou', 'commercial');
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain('internaute_commercial');
    expect(sqlCount).toContain("ca.finalite IN ('recontact_interne', 'email_marketing')");
  });

  it('base=\'commercial\' : les filtres SECONDAIRES (score) s’appliquent, liés en paramètre', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '2' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({ scoreMin: 60 }, 1, 25, ['recontact_interne'], null, 'et', 'commercial');
    expect(String(query.mock.calls[0][0])).toContain('p.score >= $1');
    expect(query.mock.calls[0][1]).toContain(60);
  });

  it('base par DÉFAUT = gestion (comportement INCHANGÉ) : FROM internaute brut + NOT EXISTS à 0 pastille', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '3' }] }).mockResolvedValueOnce({ rows: [] });
    await lireProfilsFiltres({}, 1, 25, []); // pas d'argument base → 'gestion'
    const sqlCount = String(query.mock.calls[0][0]);
    expect(sqlCount).toContain('FROM internaute i');
    expect(sqlCount).toContain('NOT EXISTS (SELECT 1 FROM internaute_consentement_actif');
    expect(sqlCount).not.toContain('internaute_commercial');
  });
});

describe('compterProfils — COUNT du compteur LIVE : fail-closed + réutilisation des builders partagés', () => {
  beforeEach(() => query.mockReset());

  it('statuts VIDE → 0 SANS requête (jamais toute la base)', async () => {
    expect(await compterProfils({}, [])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('statuts uniquement FORGÉS (normalisés → vide) → 0, aucune requête', async () => {
    expect(await compterProfils({}, ["hack'; DROP TABLE internaute" as never])).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('statuts valides → COUNT via clauseStatuts (EXISTS, PAS un FROM brut) ; total coercé en number', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '7' }] });
    const total = await compterProfils({ scoreMin: 60 }, ['recontact_interne']);
    expect(total).toBe(7);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('count(*)');
    expect(sql).toContain('internaute_consentement_actif'); // preuve : passe par clauseStatuts (intersection), pas un FROM brut
    expect(sql).not.toMatch(/\bOR\b/); // zéro OR entre statuts (un seul statut ici ; jamais d'élargissement)
    // le filtre secondaire (score) est LIÉ en paramètre (anti-injection), jamais interpolé
    expect(query.mock.calls[0][1]).toContain(60);
  });

  it('résultat vide/absent → 0 (jamais NaN)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await compterProfils({}, ['recontact_interne'])).toBe(0);
  });
});

describe('EXTRACTION ET/OU (export + compteur) — même clause, base commerciale, défaut ET inchangé', () => {
  beforeEach(() => query.mockReset());

  it('compterProfils ≥2 statuts, DÉFAUT (mode omis) → ET : un EXISTS par finalité (intersection), sur internaute_commercial', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '3' }] });
    await compterProfils({}, ['recontact_interne', 'email_marketing']); // mode omis → 'et'
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('internaute_commercial');
    expect(sql).toContain("ca_recontact_interne.finalite = 'recontact_interne'");
    expect(sql).toContain("ca_email_marketing.finalite = 'email_marketing'");
    expect(sql).not.toContain('finalite IN');
  });

  it('compterProfils ≥2 statuts, mode « ou » → un seul EXISTS `finalite IN (...)`, TOUJOURS sur internaute_commercial (fail-closed)', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '9' }] });
    await compterProfils({}, ['recontact_interne', 'email_marketing'], 'ou');
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('internaute_commercial'); //                    OU reste consentants-only
    expect(sql).toContain("ca.finalite IN ('recontact_interne', 'email_marketing')");
    expect(sql).not.toMatch(/(FROM|JOIN)\s+internaute\s/i); //            jamais la table brute
  });

  it('lireProfilsExport suit le MÊME mode que le compteur (mode passé → clauseStatuts) : ET vs OU', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await lireProfilsExport({}, ['recontact_interne', 'email_marketing'], 'ou');
    expect(String(query.mock.calls[0][0])).toContain("ca.finalite IN ('recontact_interne', 'email_marketing')");
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });
    await lireProfilsExport({}, ['recontact_interne', 'email_marketing']); // défaut 'et'
    expect(String(query.mock.calls[0][0])).toContain("ca_recontact_interne.finalite = 'recontact_interne'");
  });

  it('mode « ou » NE contourne PAS le fail-closed : statuts vide → export [] / compteur 0 SANS requête', async () => {
    expect(await lireProfilsExport({}, [], 'ou')).toEqual([]);
    expect(await compterProfils({}, [], 'ou')).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
