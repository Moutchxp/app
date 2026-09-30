import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT ERGO-BOITE-3 — LE SPAM NE SORT DE NULLE PART, SAUF DE SON ÉTIQUETTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER PROTÈGE, et pourquoi il est écrit en un seul endroit alors qu'il éprouve quatre modules.
 *
 * Un spam relevé chez Gmail entre dans `gestion_message` comme les autres — c'est voulu : Gmail efface son spam au bout
 * de 30 jours, nous le gardons. Mais il ne doit apparaître QUE dans sa liste. Or « ne pas apparaître » se joue à cinq
 * endroits distincts, écrits par cinq requêtes différentes :
 *   ① la LISTE de la boîte (`sqlPageBoite`), aux DEUX étages du parcours ;
 *   ② les COMPTEURS (`compterBoite`, `comptesBoite`) — un compteur qui compte autre chose que sa liste ment ;
 *   ③ le POSTE DE TRI (`messageCompte`, d'où descendent « À classer » et l'attente d'une réponse) ;
 *   ④ le RATTACHEMENT (`chargerPaquet`, `chargerFils`) — sans quoi le programme chercherait à quel propriétaire
 *      rattacher une publicité, et « À rattacher » annoncerait 231 mails de plus à traiter ;
 *   ⑤ la RECHERCHE, où « Spam » est une case à part, cochée par défaut.
 * Les rassembler ici rend visible ce qui, dispersé, s'oublierait au cinquième endroit.
 *
 * ⚠️ ON N'ASSERTE PAS LA FORME DU SQL : on éprouve la PRÉSENCE de fragments sémantiques sur une chaîne dont les espaces
 * sont normalisés, et le comportement sans la migration. Règle d'écriture du dépôt.
 *
 * 🔴 ET LE CAS « MIGRATION 263 ABSENTE » EST ÉPROUVÉ PARTOUT. Nommer une colonne qui n'existe pas ne casse pas la
 * fonction nouvelle : il casse TOUTE la boîte, y compris pour qui arrive par une vieille adresse (leçon de la
 * migration 251). C'est la moitié des assertions de ce fichier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({
  corbeilleDisponible: async () => false,
  // LOT BOITE-INTERNE-CORBEILLE — la 275 n'est pas le sujet de ce fichier : absente, la boîte est celle d'avant.
  corbeilleGmailDisponible: async () => false,
  spamDisponible: async () => spamConnu,
  nonRemiseDisponible: async () => false,
  rattachementsDisponibles: async () => true,
  // LOT STATUT-HORS-GESTION — la 266 n'est pas le sujet de ce fichier : absente, la boîte est celle d'avant.
  horsGestionDisponible: async () => false,
  // 🔴 LOT RATTACHER-EN-ECRIVANT — migration 281 absente par défaut : `gestion_fil_interne` n'est NOMMÉE nulle
  //   part, et les assertions de ce fichier portent donc sur le SQL d'avant ce lot.
  interneDisponible: async () => false,
  deplacementsDeMailsDisponibles: async () => false,
  destinatairesSeparesDisponibles: async () => false,
  /**
   * 🔴 LOT ETOILE-ET-SIGNATURE — migration 277 absente par défaut : le filtre étoile lit alors encore
   * `gestion_fil_etoile` (l'étoile de l'équipe), et les assertions de ce fichier portent donc sur le SQL d'avant
   * ce lot. Les deux sources ne sont JAMAIS lues ensemble — c'est l'une OU l'autre.
   */
  etoileGmailDisponible: async () => false,
}));

let spamConnu = true;

import { comptesBoite, lireBoiteMail, sqlPageBoite } from './boiteRepo';
import { messageCompte } from './attente';
import { chargerFils, chargerPaquet } from './rattachementRepo';
import { conditions } from './rechercheBoite';
import { LISTES_TOUTES } from './rechercheTermes';

const plat = (s: string) => s.replace(/\s+/g, ' ');
const etiq = (sorte: string) => ({ sorte, evenementId: null }) as Parameters<typeof sqlPageBoite>[1];
/** Le PARCOURS seul (le CTE `page`) : c'est lui qui décide ce qui entre dans la liste. */
const parcours = (sql: string) => sql.slice(sql.indexOf('WITH page AS ('), sql.indexOf('LIMIT $3'));
const sqls = () => queryMock.mock.calls.map((c) => plat(String(c[0])));

beforeEach(() => {
  spamConnu = true;
  queryMock.mockReset();
  queryMock.mockImplementation(async () => ({ rows: [] }));
});

describe('① la LISTE : le spam est écarté de toutes les étiquettes, et montré par la sienne', () => {
  const AUTRES = ['reception', 'envoyes', 'a_classer', 'automatique', 'sans_suite'] as const;

  it.each(AUTRES)('« %s » écarte le spam AUX DEUX ÉTAGES du parcours', (sorte) => {
    const p = plat(parcours(sqlPageBoite(false, etiq(sorte), false, true)));
    expect(p).toContain('m.spam_le IS NULL');
    expect(p).toContain('m2.spam_le IS NULL');
  });

  /**
   * 🔴 LES DEUX ÉTAGES, ET C'EST LE CŒUR. Posé sur le seul message candidat, le filtre laisserait un spam jouer le
   * rôle de « dernier message de l'échange » : la ligne disparaîtrait de la Réception sans que rien ne l'explique —
   * le défaut exact que le lot BOITE-SENS avait déjà réparé pour le sens des messages.
   */
  it('« Spam » est la forme POSITIVE, et n’exclut évidemment pas le spam de lui-même', () => {
    const p = plat(parcours(sqlPageBoite(false, etiq('spam'), false, true)));
    expect(p).toContain('m.spam_le IS NOT NULL');
    expect(p).not.toContain('m.spam_le IS NULL');
  });

  it('🔴 SANS LA MIGRATION 263, la colonne n’est nommée NULLE PART — pas même sous « Spam »', () => {
    for (const sorte of [...AUTRES, 'spam']) {
      expect(sqlPageBoite(false, etiq(sorte), false, false)).not.toContain('spam_le');
    }
    // …et l'étiquette « Spam » rend alors une liste VIDE plutôt qu'une liste fausse.
    expect(plat(parcours(sqlPageBoite(false, etiq('spam'), false, false)))).toContain('AND false');
  });
});

describe('② les COMPTEURS comptent exactement ce que leur liste montre', () => {
  it('le total de Réception écarte le spam, aux deux étages', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('reception') });
    const compte = sqls().find((s) => s.includes('count(*)::int AS n')) ?? '';
    expect(compte).toContain('m.spam_le IS NULL');
    expect(compte).toContain('m2.spam_le IS NULL');
  });

  it('les comptes de la colonne rendent le spam À PART, et l’écartent des quatre autres', async () => {
    queryMock.mockImplementation(async () => ({ rows: [{ lisibles: 10, total: 12, envoyes: 3, reception: 8, spam: 231 }] }));
    const c = await comptesBoite();
    expect(c.spam).toBe(231);
    const sql = sqls().find((s) => s.includes('FILTER (WHERE lisibles > 0)')) ?? '';
    /**
     * ══ 🔴🔴 RÉÉCRIT PAR LE LOT LISTE-PAGINATION — LE SPAM SE COMPTE EN ÉCHANGES ═════════════════════════════
     *
     * CE QUI ÉTAIT EXIGÉ ICI, ET QUI ÉTAIT FAUX :
     *     expect(sql).toContain("FILTER (WHERE spam_le IS NOT NULL)");
     * c'est-à-dire un `count(*)` de MESSAGES marqués spam.
     *
     * POURQUOI C'ÉTAIT FAUX : la liste « Spam » est une liste d'ÉCHANGES, comme les six autres — le `NOT EXISTS`
     * de `sqlPageBoite` n'y fait aucune exception. MESURÉ en base le 30/09/2026 : 261 messages marqués spam pour
     * 258 échanges. La colonne annonçait donc 261 au-dessus de 258 lignes, et la pagination aurait hérité de
     * l'écart. C'est la même famille d'erreur que le « 1–25 sur 291 354 » signalé par Arno : un nombre de
     * MESSAGES là où la liste montre des ÉCHANGES.
     *
     * Le titre de ce `describe` — « les COMPTEURS comptent exactement ce que leur liste montre » — est donc
     * enfin vrai pour le spam aussi.
     */
    expect(sql).toContain('count(DISTINCT fil_id)::int FROM gestion_message WHERE spam_le IS NOT NULL');
    expect(sql).not.toContain('FILTER (WHERE spam_le IS NOT NULL)');
    expect(sql).toContain('WHERE spam_le IS NULL');  // le regroupement des quatre autres l'ignore
  });

  it('sans la migration, le compte de spam vaut 0 et aucune colonne n’est nommée', async () => {
    spamConnu = false;
    queryMock.mockImplementation(async () => ({ rows: [{ lisibles: 10, total: 12, envoyes: 3, reception: 8 }] }));
    const c = await comptesBoite();
    expect(c.spam).toBe(0);
    expect(sqls().join(' ')).not.toContain('spam_le');
  });

  /**
   * 🔴 LE DÉFAUT VU À L'ÉCRAN LE 27/09/2026, et qu'aucune assertion ne voyait. Sans la migration, le compte de spam
   * s'écrivait `(SELECT 0 FROM gestion_message)` : une sous-requête SCALAIRE qui rend 56 821 lignes. PostgreSQL
   * refuse (« more than one row returned by a subquery used as an expression »), la route rend 503, et TOUS les
   * compteurs de la colonne disparaissent — Réception, Envoyés, Courrier automatique compris. Le test d'à côté
   * passait : il vérifiait qu'aucune colonne absente n'était nommée, ce qui était vrai et hors sujet.
   *
   * On éprouve donc la seule chose qui compte ici : le compte est une CONSTANTE, jamais une lecture de table.
   */
  it('🔴 sans la migration, le compte de spam est une constante — jamais une sous-requête sur la table', async () => {
    spamConnu = false;
    queryMock.mockImplementation(async () => ({ rows: [{ lisibles: 10, total: 12, envoyes: 3, reception: 8 }] }));
    await comptesBoite();
    const sql = sqls().find((x) => x.includes('FILTER (WHERE lisibles > 0)')) ?? '';
    expect(sql).toContain('0::int AS spam');
    expect(sql).not.toMatch(/\(SELECT 0 FROM/);
  });
});

describe('③ le POSTE DE TRI : un spam ne « compte » pas', () => {
  /**
   * `messageCompte` EST la définition de « un message qui compte » pour tout le poste de tri : le dernier message
   * d'un fil, le dernier hors partenaire, l'existence d'un correspondant extérieur. L'éprouver ici, c'est éprouver
   * les trois — et c'est pour cela que la règle est écrite à cet endroit unique.
   */
  it('le fragment partagé écarte le spam quand la migration est là, et rien sinon', () => {
    expect(messageCompte(false, true)).toContain('m.spam_le IS NULL');
    expect(messageCompte(true, true)).toContain('m.spam_le IS NULL');
    expect(messageCompte(false, false)).toBe('m.exclu_le IS NULL');
  });
});

describe('④ le RATTACHEMENT n’examine jamais un spam', () => {
  it('le paquet ne retient que des fils portant du courrier ordinaire', async () => {
    await chargerPaquet(0, 50);
    expect(sqls()[0]).toContain('m.spam_le IS NULL');
  });

  /**
   * ⚠️ ON ÉCARTE LE MESSAGE, PAS LE FIL. Gmail range par conversation : un fil peut mêler du courrier légitime et un
   * spam. Écarter le fil entier ferait disparaître de « À rattacher » un échange parfaitement valide.
   */
  it('dans un fil mixte, c’est le MESSAGE de spam qui est écarté, pas l’échange', async () => {
    await chargerFils([12, 13]);
    expect(sqls()[0]).toContain('m.spam_le IS NULL');
    expect(sqls()[0]).toContain('m.fil_id = ANY($1::bigint[])');
  });

  it('sans la migration, aucune colonne n’est nommée et le comportement est celui d’avant', async () => {
    spamConnu = false;
    await chargerPaquet(0, 50);
    await chargerFils([12]);
    expect(sqls().join(' ')).not.toContain('spam_le');
  });
});

describe('⑤ la RECHERCHE : « Spam » est une case, cochée par défaut', () => {
  it('🔴 elle fait partie des listes par DÉFAUT — un mail mal classé par Gmail doit rester trouvable', () => {
    expect(LISTES_TOUTES).toContain('spam');
  });

  it('case décochée ⇒ le spam est exclu ; cochée ⇒ aucune condition, il s’ajoute au reste', () => {
    const sans = plat(conditions({ saisie: 'bail', listes: ['reception'] }, true, true).sql.join(' '));
    expect(sans).toContain('m.spam_le IS NULL');
    const avec = plat(conditions({ saisie: 'bail', listes: ['reception', 'spam'] }, true, true).sql.join(' '));
    expect(avec).not.toContain('m.spam_le IS NULL');
  });

  /**
   * 🔴 LE SPAM N'EST PAS UNE BRANCHE DE PLUS DU « OU » DES LISTES. Il a un sens (reçu) : mis en OU avec les autres
   * cases, il serait ressorti sous « Réception » dès que celle-ci était cochée — c'est-à-dire par défaut, et donc
   * partout. C'est une dimension à part, comme à l'écran.
   */
  it('« Réception » cochée et « Spam » décochée ne ramène AUCUN spam', () => {
    const sql = plat(conditions({ saisie: 'bail', listes: ['reception'] }, true, true).sql.join(' '));
    expect(sql).toContain("m.sens = 'recu'");
    expect(sql).toContain('m.spam_le IS NULL');
  });

  it('sans la migration, la case ne produit aucune condition — jamais une colonne absente', () => {
    const sql = plat(conditions({ saisie: 'bail', listes: ['reception'] }, true, false).sql.join(' '));
    expect(sql).not.toContain('spam_le');
  });
});

describe('LOT FILTRE-ETOILE — ne garder que les échanges étoilés', () => {
  /**
   * 🔴 LA LISTE ET SON COMPTEUR PARTAGENT LE MÊME PRÉDICAT. Un compteur calculé « autrement mais équivalent »
   * annonce tôt ou tard un nombre que la liste ne montre pas — et c'est toujours le compteur qu'on croit.
   */
  it('le filtre pose le même prédicat dans la liste et dans le compteur', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('reception'), etoilesSeules: true });
    const page = sqls().find((s) => s.includes('WITH page')) ?? '';
    const compte = sqls().find((s) => s.includes('count(*)::int AS n')) ?? '';
    for (const sql of [page, compte]) {
      expect(sql).toContain('EXISTS (SELECT 1 FROM gestion_fil_etoile fe WHERE fe.fil_id = m.fil_id AND fe.etoilee)');
    }
  });

  it('sans le filtre, la table des étoiles n’est NOMMÉE nulle part', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('reception') });
    expect(sqls().join(' ')).not.toContain('gestion_fil_etoile');
  });

  /** ⚠️ IL SE COMBINE : sous « Réception », on garde le sens ET l'étoile. C'est une restriction de plus. */
  it('il s’ajoute au filtre de l’étiquette, il ne le remplace pas', async () => {
    await lireBoiteMail(null, [], 30, { etiquette: etiq('reception'), etoilesSeules: true });
    const page = sqls().find((s) => s.includes('WITH page')) ?? '';
    expect(page).toContain("m.sens = 'recu'");
    expect(page).toContain('fe.etoilee');
  });
});
