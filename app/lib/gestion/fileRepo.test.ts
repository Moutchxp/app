import { describe, it, expect, vi, beforeEach } from 'vitest';

// Base MOCKÉE : aucune connexion réelle. Règle dure du lot : ce module ne doit émettre QUE des SELECT — c'est vérifié.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...args: unknown[]) => queryMock(...args) }));

import { lireEcran, lireEvenements, lireFile, lireReperes, lireSansSuite, PAGE } from './fileRepo';

/** Tous les SQL émis, espaces normalisés (on assertera par FRAGMENTS SÉMANTIQUES, jamais sur la forme exacte). */
function sqls(): string[] {
  return queryMock.mock.calls.map((c) => c[0]).filter((t): t is string => typeof t === 'string').map((s) => s.replace(/\s+/g, ' '));
}
/** Les paramètres LIÉS de chaque requête (le vrai contrat d'une requête paramétrée). */
function params(): unknown[][] {
  return queryMock.mock.calls.map((c) => (Array.isArray(c[1]) ? c[1] : []));
}

beforeEach(() => { queryMock.mockReset(); queryMock.mockResolvedValue({ rows: [] }); });

describe('fileRepo — LECTURE SEULE, sans exception', () => {
  it('n’émet QUE des SELECT : aucune écriture n’est atteignable depuis ce module', async () => {
    await lireEcran();
    expect(sqls().length).toBeGreaterThan(0);
    for (const s of sqls()) {
      expect(s.trimStart().toUpperCase().startsWith('WITH') || s.trimStart().toUpperCase().startsWith('SELECT')).toBe(true);
      expect(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(s)).toBe(false);
    }
  });

  it('ne lit AUCUNE table d’un autre module', async () => {
    await lireEcran();
    for (const s of sqls()) {
      const tables = [...s.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
      // `dernier` est la CTE partagée (le dernier message non exclu d'un fil), pas une table.
      for (const t of tables) expect(t === 'dernier' || t.startsWith('gestion_')).toBe(true);
    }
  });
});

describe('fileRepo — la file (colonne de gauche)', () => {
  it('ne retient que les fils À CLASSER qui portent encore un message non exclu', async () => {
    await lireFile(30);
    const s = sqls()[0];
    expect(s).toContain("WHERE f.etat = 'a_classer'");
    expect(s).toContain('gestion_message m WHERE m.exclu_le IS NULL'); // le dernier message NON EXCLU
    expect(s).toContain('JOIN dernier d ON d.fil_id = f.id');          // un fil tout exclu n'a pas de dernier → écarté
  });

  it('DÉRIVE l’attente (dernier message reçu ET humain) sans lire aucune colonne d’état', async () => {
    await lireFile(30);
    const s = sqls()[0];
    expect(s).toContain("(d.sens = 'recu' AND NOT d.automatique)");
    expect(/\b(en_attente|attend_reponse|f\.attend)\b/i.test(s)).toBe(false); // aucune colonne stockée n'est lue
  });

  it('se sert de l’index prévu : un seul dernier message par fil, le plus récent', async () => {
    await lireFile(30);
    const s = sqls()[0];
    expect(s).toContain('DISTINCT ON (m.fil_id)');
    expect(s).toContain('ORDER BY m.fil_id, m.recu_le DESC');
  });

  it('trie comme demandé : ce qui attend d’abord, du PLUS ANCIEN au plus récent', async () => {
    await lireFile(30);
    const s = sqls()[0];
    expect(s).toContain("ORDER BY (d.sens = 'recu' AND NOT d.automatique) DESC, d.recu_le ASC");
  });

  it('borne le nombre de lignes par un paramètre LIÉ, et renvoie le total à côté', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ dedans: 213, trop_anciens: 0 }] });
    const r = await lireFile(30);
    expect(params()[0]).toEqual([PAGE, 30]);
    expect(r.total).toBe(213); // l'écran peut dire « 50 affichés sur 213 » sans mentir
    const r2 = await lireFile(30, 7);
    expect(params()[2]).toEqual([7, 30]);
    expect(r2.lignes).toEqual([]);
  });

  it('projette une ligne de file complète (un ÉCHANGE, pas un message)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      fil_id: 4, objet: 'Fuite', interlocuteur: 'Mme M.', dernier_le: '2026-09-20T08:00:00Z',
      nb_messages: 6, nb_pieces: 2, attend: true,
    }] }).mockResolvedValueOnce({ rows: [{ dedans: 1, trop_anciens: 0 }] });
    const { lignes } = await lireFile(30);
    expect(lignes[0]).toEqual({
      filId: 4, objet: 'Fuite', interlocuteur: 'Mme M.', dernierLe: '2026-09-20T08:00:00Z',
      nbMessages: 6, nbPieces: 2, attend: true,
    });
  });

  it('total absent (base vide) → 0, jamais NaN ni undefined', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect((await lireFile(30)).total).toBe(0);
  });
});

describe('fileRepo — les cartes (colonne de droite)', () => {
  it('ne compte que les affectations ACTIVES (une affectation défaite ne compte plus)', async () => {
    await lireEvenements();
    expect(sqls()[0]).toContain('LEFT JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif');
  });

  it('une carte attend si AU MOINS UN de ses échanges attend', async () => {
    expect(sqls().length).toBe(0);
    await lireEvenements();
    expect(sqls()[0]).toContain("coalesce(bool_or((d.sens = 'recu' AND NOT d.automatique)), false) AS attend");
  });

  it('trie : ouverts d’abord, puis ce qui attend, puis la PLUS ANCIENNE attente (pas la date d’ouverture)', async () => {
    await lireEvenements();
    const s = sqls()[0];
    expect(s).toContain('ORDER BY (e.traite_le IS NOT NULL) ASC');
    expect(s).toContain("min(d.recu_le) FILTER (WHERE (d.sens = 'recu' AND NOT d.automatique))");
  });

  it('projette une carte complète et retombe sur « à traiter » si l’état est inattendu', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      evenement_id: 9, reference: 'GES-2026-000001', objet: 'Fuite', demandeur: 'Mme M.', adresse_libre: '53 av. des Ternes',
      etat: 'valeur_inconnue', ouvert_le: '2026-09-01T08:00:00Z', dernier_echange_le: null, nb_fils: 2, attend: false,
    }] }).mockResolvedValueOnce({ rows: [{ n: 1 }] });
    const { cartes } = await lireEvenements();
    expect(cartes[0].etat).toBe('a_traiter'); // repli sûr : jamais un état inventé à l'écran
    expect(cartes[0]).toMatchObject({ evenementId: 9, reference: 'GES-2026-000001', nbFils: 2, dernierEchangeLe: null });
  });
});

describe('fileRepo — les repères d’honnêteté', () => {
  it('compte les messages capturés ET ceux tenus hors de la file, et date la dernière relève RÉUSSIE', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ captures: 120, exclus: 87 }] })
      .mockResolvedValueOnce({ rows: [{ le: '2026-09-23T11:00:00Z' }] });
    expect(await lireReperes()).toEqual({ messagesCaptures: 120, messagesExclus: 87, derniereReleveLe: '2026-09-23T11:00:00Z' });
    expect(sqls()[1]).toContain("WHERE resultat = 'ok'"); // une passe en erreur ne « date » rien
  });

  it('aucune relève jamais lancée → null, et surtout pas une date inventée', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lireReperes()).toEqual({ messagesCaptures: 0, messagesExclus: 0, derniereReleveLe: null });
  });

  it('lit le journal des passes du module, JAMAIS celui du module Permis', async () => {
    await lireReperes();
    expect(sqls()[1]).toContain('gestion_releve_run');
    expect(/\bFROM releve_run\b/.test(sqls()[1])).toBe(false);
  });
});

describe('fileRepo — l’écran complet', () => {
  it('assemble les trois lectures en un seul état', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lireEcran()).toEqual({
      file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0,
      sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0,
      messagesCaptures: 0, messagesExclus: 0, derniereReleveLe: null,
    });
  });
});

describe('LOT 4b — la file ne montre que ce qui a BOUGÉ récemment', () => {
  it('borne les lignes à la fenêtre, par un paramètre LIÉ (jamais une durée collée dans le SQL)', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireFile(30);
    const s = sqls()[0];
    expect(s).toContain("d.recu_le >= now() - ($2::int * interval '1 day')");
    expect(params()[0]).toEqual([PAGE, 30]);
  });

  it('compte SÉPARÉMENT ce qu’elle montre et ce qu’elle tait — le second est affiché, jamais tu', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ dedans: 41, trop_anciens: 892 }] });
    const r = await lireFile(30);
    expect(r.total).toBe(41);
    expect(r.tropAnciens).toBe(892);
    expect(sqls()[1]).toContain('FILTER (WHERE');
  });

  it('la fenêtre vient de la CONFIGURATION, jamais du code', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const avant = queryMock.mock.calls.length;
    await lireEcran();
    expect(sqls().slice(avant).some((s) => s.includes('gestion_config'))).toBe(true);
  });

  it('les classés sans suite sont LISIBLES (sinon « classer » serait une suppression déguisée)', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireSansSuite();
    expect(sqls()[0]).toContain("WHERE etat = 'sans_suite'");
    expect(sqls()[0]).toContain('sans_suite_motif');
    expect(sqls()[0]).toContain('sans_suite_par_libelle'); // qui l'a classé : le journal n'est pas le seul à le dire
  });

  it('l’écran complet porte la fenêtre, ce qu’elle écarte, et les classés sans suite', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const e = await lireEcran();
    expect(e).toMatchObject({ fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0 });
  });
});
