import { describe, it, expect, vi, beforeEach } from 'vitest';

// Base MOCKÉE : aucune connexion réelle. Règle dure du lot : ce module ne doit émettre QUE des SELECT — c'est vérifié.
const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...args: unknown[]) => queryMock(...args) }));

import {
  lireDernierePasseAuto, lireEcran, lireEvenements, lireFile, lireReperes, lireSansSuite, lireToleranceVeille, PAGE,
} from './fileRepo';

/**
 * LOT 4d — qui est qui. Par défaut AUCUN partenaire interne : c'est l'état d'avant la migration 233, et les requêtes
 * doivent alors se comporter EXACTEMENT comme avant. Les tests du cas partenaire passent leur propre contexte.
 */
const CTX = { partenaires: [], adresseGestion: 'gestion@criterimmo.fr', deplacements: false };
/** …et le même, une fois la migration 234 appliquée : les mails déplacés sortent du calcul de leur échange. */
const CTX_234 = { ...CTX, deplacements: true };

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
      // Les CTE partagées de `attente.ts` ne sont pas des tables : « le dernier message », « le dernier message hors
      //   partenaire interne », et « les fils où quelqu'un d'extérieur a écrit ».
      const ctes = ['dernier', 'dernier_hors', 'exterieur', 'messages_deplaces'];
      for (const t of tables) expect(ctes.includes(t) || t.startsWith('gestion_')).toBe(true);
    }
  });
});

describe('fileRepo — la file (colonne de gauche)', () => {
  it('ne retient que les fils À CLASSER qui portent encore un message non exclu', async () => {
    await lireFile(30, CTX);
    const s = sqls()[0];
    expect(s).toContain("WHERE f.etat = 'a_classer'");
    expect(s).toContain('gestion_message m WHERE m.exclu_le IS NULL'); // le dernier message NON EXCLU
    expect(s).toContain('JOIN dernier d ON d.fil_id = f.id');          // un fil tout exclu n'a pas de dernier → écarté
  });

  it('DÉRIVE l’attente (dernier message reçu ET humain) sans lire aucune colonne d’état', async () => {
    await lireFile(30, CTX);
    const s = sqls()[0];
    expect(s).toContain("(d.sens = 'recu' AND NOT d.automatique)");
    expect(/\b(en_attente|attend_reponse|f\.attend)\b/i.test(s)).toBe(false); // aucune colonne stockée n'est lue
  });

  it('se sert de l’index prévu : un seul dernier message par fil, le plus récent', async () => {
    await lireFile(30, CTX);
    const s = sqls()[0];
    expect(s).toContain('DISTINCT ON (m.fil_id)');
    expect(s).toContain('ORDER BY m.fil_id, m.recu_le DESC');
  });

  it('trie comme demandé : ce qui attend d’abord, du PLUS ANCIEN au plus récent', async () => {
    await lireFile(30, CTX);
    const s = sqls()[0];
    // Le tri porte sur la MÊME expression que l'affichage — sinon l'écran trierait sur autre chose que ce qu'il montre.
    expect(s).toContain('DESC, d.recu_le ASC');
    expect(s).toContain("CASE WHEN ex.fil_id IS NOT NULL THEN (h.sens = 'recu' AND NOT h.automatique)");
  });

  it('borne le nombre de lignes par un paramètre LIÉ, et renvoie le total à côté', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ dedans: 213, trop_anciens: 0 }] });
    const r = await lireFile(30, CTX);
    // Les deux derniers paramètres sont le CONTEXTE d'expéditeurs (lot 4d) : la liste des partenaires internes,
    //   et notre propre adresse. Liés eux aussi — jamais une adresse collée dans le SQL.
    expect(params()[0]).toEqual([PAGE, 30, [], 'gestion@criterimmo.fr']);
    expect(r.total).toBe(213); // l'écran peut dire « 50 affichés sur 213 » sans mentir
    const r2 = await lireFile(30, CTX, 7);
    expect(params()[2]).toEqual([7, 30, [], 'gestion@criterimmo.fr']);
    expect(r2.lignes).toEqual([]);
  });

  it('projette une ligne de file complète (un ÉCHANGE, pas un message)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      fil_id: 4, objet: 'Fuite', interlocuteur: 'Mme M.', dernier_le: '2026-09-20T08:00:00Z',
      nb_messages: 6, nb_pieces: 2, attend: true,
    }] }).mockResolvedValueOnce({ rows: [{ dedans: 1, trop_anciens: 0 }] });
    const { lignes } = await lireFile(30, CTX);
    expect(lignes[0]).toEqual({
      filId: 4, objet: 'Fuite', interlocuteur: 'Mme M.', dernierLe: '2026-09-20T08:00:00Z',
      nbMessages: 6, nbPieces: 2, attend: true,
    });
  });

  it('total absent (base vide) → 0, jamais NaN ni undefined', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect((await lireFile(30, CTX)).total).toBe(0);
  });
});

describe('fileRepo — les cartes (colonne de droite)', () => {
  it('ne compte que les affectations ACTIVES (une affectation défaite ne compte plus)', async () => {
    await lireEvenements(CTX);
    expect(sqls()[0]).toContain('LEFT JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif');
  });

  it('une carte attend si AU MOINS UN de ses échanges attend', async () => {
    expect(sqls().length).toBe(0);
    await lireEvenements(CTX);
    expect(sqls()[0]).toContain('coalesce(bool_or( CASE WHEN ex.fil_id IS NOT NULL');
    // LOT 4d — …ou le dernier mail DÉPLACÉ vers cette carte : sinon déplacer un mail le ferait disparaître des
    //   choses à traiter, ce qui est exactement le contraire du but.
    expect(sqls()[0]).toContain("bool_or(md.sens = 'recu' AND NOT md.automatique)");
    expect(sqls()[0]).toContain('AS attend');
  });

  it('trie : ouverts d’abord, puis ce qui attend, puis la PLUS ANCIENNE attente (pas la date d’ouverture)', async () => {
    await lireEvenements(CTX);
    const s = sqls()[0];
    expect(s).toContain('ORDER BY (e.traite_le IS NOT NULL) ASC');
    expect(s).toContain('min(d.recu_le) FILTER (WHERE CASE WHEN ex.fil_id IS NOT NULL');
  });

  it('projette une carte complète et retombe sur « à traiter » si l’état est inattendu', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      evenement_id: 9, reference: 'GES-2026-000001', objet: 'Fuite', demandeur: 'Mme M.', adresse_libre: '53 av. des Ternes',
      etat: 'valeur_inconnue', ouvert_le: '2026-09-01T08:00:00Z', dernier_echange_le: null, nb_fils: 2, attend: false,
    }] }).mockResolvedValueOnce({ rows: [{ n: 1 }] });
    const { cartes } = await lireEvenements(CTX);
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
  it('assemble les lectures en un seul état, COMPLET', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await lireEcran()).toEqual({
      file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0,
      sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0,
      messagesCaptures: 0, messagesExclus: 0, derniereReleveLe: null,
      // LOT 5-VEILLE — l'état de la relève AUTOMATIQUE fait partie de l'écran : le taire laisserait la vue deviner,
      //   et c'est exactement ce que le bandeau existe pour empêcher.
      veille: {
        derniereLe: null, resultat: null, erreur: null,
        intervalleS: 60, toleranceIntervalles: 10,
      },
      // LOT RATTACHEMENT-2 — ce que la passe a fait APRÈS l'import (adresses, rattachement) en fait partie aussi.
      //   Tout à `null` veut dire « on ne sait pas » (migration 258 absente, ou aucune passe depuis ce lot) — et non
      //   « tout va bien » : c'est la distinction que le bandeau lit pour se taire plutôt que pour rassurer.
      suite: { resultat: null, detail: null, ms: null },
      // LOT COPIE-SURV — l'état de la copie des pièces en fait partie aussi : `derniere: null` veut dire
      //   « aucune passe n'a jamais tourné », donc bandeau muet — et non « tout est copié ».
      copie: { derniere: null, restantes: null, motifs: [] },
    });
  });
});

describe('LOT 4b — la file ne montre que ce qui a BOUGÉ récemment', () => {
  it('borne les lignes à la fenêtre, par un paramètre LIÉ (jamais une durée collée dans le SQL)', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await lireFile(30, CTX);
    const s = sqls()[0];
    expect(s).toContain("d.recu_le >= now() - ($2::int * interval '1 day')");
    // Les deux derniers paramètres sont le CONTEXTE d'expéditeurs (lot 4d) : la liste des partenaires internes,
    //   et notre propre adresse. Liés eux aussi — jamais une adresse collée dans le SQL.
    expect(params()[0]).toEqual([PAGE, 30, [], 'gestion@criterimmo.fr']);
  });

  it('compte SÉPARÉMENT ce qu’elle montre et ce qu’elle tait — le second est affiché, jamais tu', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ dedans: 41, trop_anciens: 892 }] });
    const r = await lireFile(30, CTX);
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

/**
 * LOT 4d-B2 — UN MAIL DÉPLACÉ NE COMPTE PLUS POUR SON ÉCHANGE. Sans quoi un fil réclamerait une réponse à une
 * question partie ailleurs. La bascule est un DRAPEAU, pas une branche de code : tant que la migration 234 n'est pas
 * appliquée, la colonne n'existe pas et le SQL ne doit surtout pas la nommer.
 */
describe('la migration 234, appliquée ou non', () => {
  it('NON appliquée → le SQL ne nomme JAMAIS la colonne absente (sinon tout l’écran tombe)', async () => {
    await lireFile(30, CTX);
    await lireEvenements(CTX);
    // C'est `gestion_affectation.message_id` qui n'existe pas encore. `gestion_piece.message_id`, lui, est là depuis
    //   la migration 228 : la nuance est tout l'objet de ce test.
    for (const s of sqls()) {
      expect(s).not.toContain('am.message_id');
      expect(s).not.toContain('a.message_id');
      expect(s).not.toContain('am2.message_id');
      expect(s).not.toContain('am3.message_id');
    }
  });

  it('appliquée → les mails déplacés sortent du calcul de leur échange', async () => {
    await lireFile(30, CTX_234);
    const s = sqls()[0];
    expect(s).toContain('NOT EXISTS (SELECT 1 FROM gestion_affectation am WHERE am.message_id = m.id AND am.actif)');
    // …et les compteurs affichés suivent la même règle : ils disent ce que l'écran montrera.
    expect(s).toContain('am2.message_id = m2.id');
    expect(s).toContain('am3.message_id = m3.id');
  });

  it('appliquée → une affectation de MAIL ne compte pas comme un échange rattaché sur une carte', async () => {
    await lireEvenements(CTX_234);
    expect(sqls()[0]).toContain('a.actif AND a.message_id IS NULL');
  });

  it('appliquée → le dernier mail déplacé pèse sur l’attente de la carte', async () => {
    await lireEvenements(CTX_234);
    expect(sqls()[0]).toContain("bool_or(md.sens = 'recu' AND NOT md.automatique)");
  });
});

/**
 * LOT 5-VEILLE — CE QUI PERMET DE DIRE « LA RELÈVE AUTOMATIQUE EST ARRÊTÉE ».
 *
 * 🔴 Le repère est la dernière PASSE de l'ordonnanceur, jamais le dernier message capturé : une boîte calme un
 * dimanche ne doit rien déclencher. C'est la seule règle qui compte ici, et les assertions portent sur les
 * FRAGMENTS SÉMANTIQUES de la requête, jamais sur sa forme exacte.
 */
describe('la dernière passe AUTOMATIQUE', () => {
  it('ne regarde que les passes « planifie » — ni un clic, ni un rattrapage', async () => {
    await lireDernierePasseAuto();
    const s = sqls()[0];
    expect(s).toContain("declencheur = 'planifie'");
    expect(s).toContain('FROM gestion_releve_run');
    expect(s).toContain('ORDER BY termine_le DESC');
    expect(s).toContain('LIMIT 1');
  });

  /** Ne garder que les réussites masquerait le cas qu'il faut justement voir : elle tourne et elle échoue. */
  it('prend la dernière passe TERMINÉE, réussie OU en échec', async () => {
    const s0 = (await (async () => { await lireDernierePasseAuto(); return sqls()[0]; })());
    expect(s0).toContain("resultat IN ('ok', 'erreur')");
    expect(s0).toContain('termine_le IS NOT NULL'); // une passe « en_cours » n'est pas encore une preuve
  });

  it('rend l’issue et le motif tels qu’enregistrés', async () => {
    queryMock.mockResolvedValue({ rows: [{ le: '2026-09-25T14:00:00Z', resultat: 'erreur', erreur: 'Socket timeout' }] });
    expect(await lireDernierePasseAuto()).toEqual({
      le: '2026-09-25T14:00:00Z', resultat: 'erreur', erreur: 'Socket timeout',
    });
  });

  it('aucune passe automatique → tout à null, et l’écran le DIT autrement', async () => {
    expect(await lireDernierePasseAuto()).toEqual({ le: null, resultat: null, erreur: null });
  });
});

describe('la tolérance de la veille', () => {
  /** Migration 249 non appliquée : la sonde répond « non » et on se replie, sans jamais nommer la colonne absente. */
  it('sans la migration 249, le défaut de dix, et aucune requête sur la colonne', async () => {
    expect(await lireToleranceVeille()).toBe(10);
    expect(sqls().some((s) => s.includes('veille_releve_intervalles FROM gestion_config'))).toBe(false);
  });

  it('l’écran complet porte l’état de la veille, cadence comprise', async () => {
    const e = await lireEcran();
    expect(e.veille).toMatchObject({ derniereLe: null, resultat: null, toleranceIntervalles: 10 });
    expect(e.veille.intervalleS).toBeGreaterThan(0);
  });
});
