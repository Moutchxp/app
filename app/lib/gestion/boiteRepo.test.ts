import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT 5a — LA BOÎTE MAIL. Ce qui est protégé ici tient en trois points, et chacun casse d'une façon reconnaissable :
 *   ① la pagination est par CURSEUR, jamais par `OFFSET` — sinon deux pages se chevauchent ou sautent une ligne ;
 *   ② le curseur porte la DATE **et** l'IDENTIFIANT : deux échanges au même instant sont fréquents dans une boîte
 *      alimentée par un logiciel, et la date seule en perdrait un à chaque page ;
 *   ③ le courrier automatique est ÉCARTÉ par défaut mais JAMAIS supprimé — un geste le ramène.
 *
 * On teste le COMPORTEMENT (paramètres liés, découpage des pages, curseur rendu), jamais la forme du SQL.
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { comptesBoite, lireBoiteMail, sqlPageBoite, PAGE_BOITE } from './boiteRepo';

/** Une ligne telle que PostgreSQL la rend : `fil_id` en CHAÎNE (piège `bigint` du dépôt). */
const ligne = (n: number, o: Record<string, unknown> = {}) => ({
  fil_id: String(n),
  // LOT MESSAGE-CLIQUÉ — le message que la ligne représente, en CHAÎNE comme tout bigint rendu par pg.
  message_id: String(n * 10),
  objet: `Objet ${n}`,
  interlocuteur: 'Mme Martin',
  interlocuteur_adresse: 'martin@orange.fr',
  dernier_sens: 'recu',
  dernier_le: `2026-09-${String(20 - (n % 19)).padStart(2, '0')}T10:00:00Z`,
  extrait: 'bonjour',
  nb_messages: 3,
  nb_lisibles: 3,
  // LOT LISTE-GMAIL — la base rend désormais un NOMBRE de pièces ; `aPiece` s'en déduit (> 0).
  nb_pieces: 0,
  reference: null,
  sans_suite: false,
  ...o,
});
/**
 * Le 1er appel est la page, le 2e (s'il existe) le total.
 *
 * ⚠️ LES MARQUEURS SONT DES FRAGMENTS SÉMANTIQUES, pas la forme du SQL — règle du dépôt. `compterBoite` se
 * reconnaît à ce qu'il compte (`count(*)::int AS n` sur `gestion_message`), pas à la façon dont il regroupe :
 * c'est justement ce regroupement qui a changé au lot BOITE-SENS.
 */
const COMPTE_BOITE = 'count(*)::int AS n';
const rendre = (lignes: unknown[], total = 100) => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    const s = String(sql);
    if (s.includes(COMPTE_BOITE) && !s.includes('WITH page')) return { rows: [{ n: total }] };
    if (s.includes('FILTER (WHERE lisibles > 0)')) return { rows: [{ lisibles: 4944, total: 17206 }] };
    return { rows: lignes };
  });
};
/** L'appel qui compte une boîte (`compterBoite`), quel qu'en soit le rang. */
const appelCompte = () => queryMock.mock.calls.find(
  (c) => String(c[0]).includes(COMPTE_BOITE) && !String(c[0]).includes('WITH page'));
const paramsPage = () => (queryMock.mock.calls.findLast((c) => String(c[0]).includes('WITH page'))?.[1] ?? []) as unknown[];
/** Le PARCOURS seul (le CTE `page`) : c'est lui que le mode « courrier automatique » change. Le reste du SELECT compte
 *  toujours les messages lisibles, dans les deux modes — c'est voulu, et ça ne doit pas brouiller l'assertion. */
const parcours = (sql: string) => sql.slice(sql.indexOf('WITH page AS ('), sql.indexOf('LIMIT $3'));
const sqlPage = () => String(queryMock.mock.calls.findLast((c) => String(c[0]).includes('WITH page'))?.[0] ?? '');
/** TOUS les SQL émis, espaces normalisés — on assertera par FRAGMENTS SÉMANTIQUES, jamais sur la forme exacte. */
const sqls = (): string[] => queryMock.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));

beforeEach(() => queryMock.mockReset());

describe('① la pagination par curseur', () => {
  it('PREMIÈRE page : pas de curseur → on part de l’infini, et le total est compté', async () => {
    rendre([ligne(1), ligne(2)], 4944);
    const p = await lireBoiteMail(null, []);
    expect(paramsPage()[0]).toBe('infinity');            // aucun message n'existe après l'infini
    expect(paramsPage()[1]).toBe('9223372036854775807'); // et aucun identifiant au-delà
    expect(p.total).toBe(4944);
    expect(p.lignes).toHaveLength(2);
  });

  it('PAGE SUIVANTE : le curseur est transmis TEL QUEL, et le total n’est plus recompté', async () => {
    rendre([ligne(5)]);
    const p = await lireBoiteMail({ dernierLe: '2026-08-01T09:00:00Z', filId: '412' }, []);
    expect(paramsPage()[0]).toBe('2026-08-01T09:00:00Z');
    expect(paramsPage()[1]).toBe('412');
    expect(p.total).toBeNull(); // il ne bouge pas entre deux pages : le redemander serait payer pour rien
  });

  it('🔴 AUCUN `OFFSET` nulle part — c’est ce qui écroule une liste de 17 000 lignes', async () => {
    rendre([ligne(1)]);
    await lireBoiteMail(null, []);
    expect(sqlPage().toUpperCase()).not.toContain('OFFSET');
  });

  it('on demande UNE ligne de plus que la page : sa présence dit « il y a une suite », sans rien compter', async () => {
    rendre([ligne(1)]);
    await lireBoiteMail(null, [], 30);
    expect(paramsPage()[2]).toBe(31);
  });

  it('la ligne en trop n’est PAS rendue : elle sert de sonde, pas de contenu', async () => {
    const lignes = Array.from({ length: 4 }, (_, i) => ligne(i + 1));
    rendre(lignes);
    const p = await lireBoiteMail(null, [], 3);
    expect(p.lignes).toHaveLength(3);
    expect(p.suivant).not.toBeNull();
  });

  it('dernière page : moins de lignes que demandé → plus de suite', async () => {
    rendre([ligne(1), ligne(2)]);
    const p = await lireBoiteMail(null, [], 30);
    expect(p.suivant).toBeNull();
  });

  it('liste VIDE → aucune ligne, aucune suite, et surtout aucune erreur', async () => {
    rendre([], 0);
    const p = await lireBoiteMail(null, []);
    expect(p.lignes).toEqual([]);
    expect(p.suivant).toBeNull();
    expect(p.total).toBe(0);
  });

  it('la taille de page est BORNÉE : une demande farfelue ne fait pas lire toute la table', async () => {
    rendre([ligne(1)]);
    await lireBoiteMail(null, [], 10_000);
    expect(paramsPage()[2]).toBe(101); // plafonnée à 100, + la ligne sonde
    rendre([ligne(1)]);
    await lireBoiteMail(null, [], -5);
    expect(paramsPage()[2]).toBe(2);   // plancher à 1, + la ligne sonde
  });
});

describe('② le curseur reste STABLE quand deux échanges portent la même date', () => {
  it('le curseur rendu porte la date ET l’identifiant du dernier échange de la page', async () => {
    const memeInstant = '2026-09-10T08:00:00Z';
    rendre([
      ligne(9, { dernier_le: memeInstant }),
      ligne(8, { dernier_le: memeInstant }),
      ligne(7, { dernier_le: memeInstant }), // la sonde
    ]);
    const p = await lireBoiteMail(null, [], 2);
    expect(p.lignes.map((l) => l.filId)).toEqual([9, 8]);
    // Sans l'identifiant, la page suivante repartirait de la même date et rendrait de nouveau les échanges 9 et 8.
    expect(p.suivant).toEqual({ dernierLe: memeInstant, filId: '8' });
  });

  it('la comparaison est un COUPLE (date, identifiant), pas deux conditions indépendantes', async () => {
    rendre([ligne(1)]);
    await lireBoiteMail({ dernierLe: '2026-09-10T08:00:00Z', filId: '8' }, []);
    const sql = sqlPage().replace(/\s+/g, ' ');
    expect(sql).toContain('(m.recu_le, m.fil_id) < ($1::timestamptz, $2::bigint)');
  });

  it('l’ordre demandé est le MÊME couple, sinon la pagination ne veut rien dire', async () => {
    rendre([ligne(1)]);
    await lireBoiteMail(null, []);
    expect(sqlPage().replace(/\s+/g, ' ')).toContain('ORDER BY m.recu_le DESC, m.fil_id DESC');
  });
});

describe('③ le courrier automatique : écarté par défaut, jamais supprimé', () => {
  it('par DÉFAUT, les messages écartés par une règle sont hors du parcours', async () => {
    rendre([ligne(1)]);
    await lireBoiteMail(null, []);
    expect(parcours(sqlPage())).toContain('AND m.exclu_le IS NULL');
    expect(parcours(sqlPage())).toContain('AND m2.exclu_le IS NULL');
  });

  it('sur demande, ils reviennent — aux DEUX étages du parcours', async () => {
    rendre([ligne(1)]);
    await lireBoiteMail(null, [], 30, { inclureAutomatiques: true });
    expect(parcours(sqlPage())).not.toContain('exclu_le IS NULL');
  });

  it('🔴 le filtre ne peut PAS être dissocié : un seul des deux étages donnerait un aperçu faux', () => {
    // Si `m` était filtré mais pas `m2`, un échange dont le dernier message est écarté sortirait avec l'avant-dernier
    //   comme aperçu — une ligne qui ment sur ce qui s'est dit en dernier. Les deux vont donc ensemble, toujours.
    expect((parcours(sqlPageBoite(false)).match(/exclu_le IS NULL/g) ?? []).length).toBe(2);
    expect(parcours(sqlPageBoite(true))).not.toContain('exclu_le IS NULL');
  });

  it('…et le compte des messages LISIBLES garde son filtre dans les deux modes : c’est lui qui dit « tout automatique »', () => {
    for (const tous of [false, true]) {
      expect(sqlPageBoite(tous)).toContain('AND c.exclu_le IS NULL)::int AS nb_lisibles');
    }
  });

  it('les deux comptes sont rendus pour que l’écran puisse dire ce qu’il ne montre pas', async () => {
    rendre([]);
    // LOT 5-FUSION — « Envoyés » s'est ajouté au MÊME regroupement : trois nombres, une seule lecture, donc trois
    //   nombres qui ne peuvent pas se contredire. Le jeu d'essai ne rend pas `envoyes` → repli à 0, pas d'exception.
    // LOT 5-BOITE — « reception » s'y ajoute de la même façon : un FILTER de plus sur le même regroupement.
    // LOT ERGO-BOITE-3 — et « spam » aussi. Le jeu d'essai ne le rend pas → repli à 0, jamais une exception : c'est
    //   exactement ce que rend une base sans la migration 263.
    await expect(comptesBoite()).resolves.toEqual({
      lisibles: 4944, automatiques: 17206 - 4944, envoyes: 0, reception: 0, spam: 0,
    });
  });
});

/**
 * LOT 5-BOITE — LA RÉCEPTION NE MONTRE QUE CE QU'ON NOUS A ÉCRIT.
 *
 * 🔴 LE DÉFAUT RÉPARÉ, vu à l'écran le 25/09/2026 : l'échange « Coucou », un seul message, ENVOYÉ par gestion@ à un
 * collègue, s'affichait en tête de Réception. Le `case 'reception'` rendait une chaîne vide : ce n'était pas une
 * étiquette, c'était la boîte entière.
 */
/**
 * LOT BOITE-SENS — LA RÈGLE DE GMAIL (décision d'Arno du 26/09/2026), qui REMPLACE l'exclusivité du 25/09.
 *
 * 🔴 UN ÉCHANGE EST DANS LES DEUX BOÎTES s'il porte du courrier dans les deux sens. Réception montre son dernier
 * message REÇU, Envoyés son dernier message ENVOYÉ. Répondre ne fait plus disparaître un mail de la Réception —
 * c'était le défaut signalé, et c'est le seul retrait de ce lot.
 *
 * ⚠️ CE QUI EST PROTÉGÉ ICI : que le sens entre aux DEUX étages du parcours. Dans `m2` seul il manquerait l'essentiel
 * (l'échange sortirait de la Réception dès qu'on répond) ; dans `m` seul, la ligne serait sur le bon message mais
 * triée sur le mauvais.
 */
describe('la règle des deux boîtes', () => {
  it('Réception = le dernier message REÇU de l’échange, aux DEUX étages du parcours', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    const sql = parcours(sqlPage()).replace(/\s+/g, ' ');
    expect(sql).toContain("AND m.sens = 'recu'");
    expect(sql).toContain("AND m2.sens = 'recu'");
    expect(sql).not.toContain("'envoye'");
  });

  it('Envoyés = le dernier message ENVOYÉ, le pendant EXACT', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    const sql = parcours(sqlPage()).replace(/\s+/g, ' ');
    expect(sql).toContain("AND m.sens = 'envoye'");
    expect(sql).toContain("AND m2.sens = 'envoye'");
    expect(sql).not.toContain("'recu'");
  });

  /**
   * 🔴 LE TEST QUI DIT QUE L'EXCLUSIVITÉ EST BIEN PARTIE. Il n'existe AUCUNE condition, dans le parcours de
   * Réception, qui exclurait un échange au motif qu'il contient aussi un envoi — et réciproquement. C'est
   * exactement ce qu'on a retiré, et ce qu'on ne doit pas voir revenir « par optimisation ».
   */
  it('aucune des deux boîtes n’exclut l’autre : les listes se RECOUVRENT désormais', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    const rec = parcours(sqlPage()).replace(/\s+/g, ' ');
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    const env = parcours(sqlPage()).replace(/\s+/g, ' ');
    expect(rec).not.toBe(env);
    // Ni un NOT EXISTS sur le sens contraire, ni une condition sur le dernier message tous sens confondus.
    expect(rec).not.toContain("NOT EXISTS (SELECT 1 FROM gestion_message m3");
    expect(env).not.toContain("NOT EXISTS (SELECT 1 FROM gestion_message m3");
  });

  it('l’interlocuteur suit le message AFFICHÉ, jamais l’autre sens', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    // Réception : l'expéditeur du message de la ligne, lu directement — la jointure latérale n'a plus rien à chercher.
    expect(sqlPage()).toContain('p.de_adresse AS interlocuteur_adresse');
    expect(sqlPage()).not.toContain("r.sens = 'recu'");
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    // Envoyés : le DESTINATAIRE du message de la ligne, jamais un expéditeur.
    expect(sqlPage()).toContain("(p.dest_a -> 0 ->> 'adresse') AS interlocuteur_adresse");
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 LOT ENVOI-DIAG — « ENVOYÉS » NE MONTRE QUE DU COURRIER RÉELLEMENT PARTI.
   *
   * Arno a demandé que l'application n'affiche JAMAIS « envoyé » avant que le serveur d'envoi ait accepté. C'est
   * vrai aujourd'hui, mais par ARCHITECTURE et non par intention : la liste sort de `gestion_message`, que seule la
   * relève alimente en relisant le dossier « Envoyés » de Gmail — un message refusé n'y est jamais entré.
   * `gestion_envoi`, qui porte les tentatives (`en_cours`, `echec`), n'est pas lu ici.
   *
   * Sans ce test, la propriété tiendrait par chance : il suffirait qu'un jour quelqu'un joigne `gestion_envoi` à la
   * liste « pour montrer les envois en cours » pour qu'un mail refusé apparaisse comme envoyé — précisément le
   * mensonge signalé le 26/09/2026.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 la liste ne lit JAMAIS la table des tentatives d’envoi : un envoi refusé n’y paraît pas', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    for (const s of sqls()) {
      expect(s).not.toContain('gestion_envoi');
      expect(s).not.toContain('gestion_brouillon');
      // Et aucune trace des états de tentative, qui n'existent que dans cette table-là.
      expect(s).not.toContain("'en_cours'");
    }
  });

  it('le TOTAL de chaque boîte porte la même règle que sa liste', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    // Le comptage compte les messages qui sont le dernier DE LEUR SENS : une ligne par échange, exactement la liste.
    const sql = (appelCompte()?.[0] as string).replace(/\s+/g, ' ');
    expect(sql).toContain('m2.sens = m.sens');
    expect(sql).toContain('WHERE m.sens = $1');
    // 🔴 Et plus aucune trace du regroupement de l'exclusivité, qui comptait le dernier message TOUS SENS CONFONDUS.
    expect(sql).not.toContain('DISTINCT ON (m.fil_id)');
  });
});

describe('ce que chaque ligne porte', () => {
  it('l’identifiant revient en NOMBRE, jamais en chaîne (piège `bigint` de pg)', async () => {
    rendre([ligne(4242)]);
    const p = await lireBoiteMail(null, []);
    expect(p.lignes[0].filId).toBe(4242);
    expect(typeof p.lignes[0].filId).toBe('number');
  });

  it('le correspondant, la date, le nombre de messages, les pièces jointes et la référence de carte', async () => {
    rendre([ligne(1, { reference: 'GES-2026-000012', nb_pieces: 2, nb_messages: 7 })]);
    const [l] = (await lireBoiteMail(null, [])).lignes;
    expect(l.interlocuteur).toBe('Mme Martin');
    expect(l.nbMessages).toBe(7);
    // LOT LISTE-GMAIL — la ligne affiche « 📎 2 » : le NOMBRE, pas seulement « il y en a ».
    expect(l.nbPieces).toBe(2);
    expect(l.aPiece).toBe(true);
    expect(l.reference).toBe('GES-2026-000012');
  });

  it('aucune pièce : le trombone ne s’affiche pas, et le compte est 0', async () => {
    rendre([ligne(1, { nb_pieces: 0 })]);
    const [l] = (await lireBoiteMail(null, [])).lignes;
    expect(l.nbPieces).toBe(0);
    expect(l.aPiece).toBe(false);
  });

  it('un extrait vide devient `null` — l’écran n’affiche pas une ligne d’aperçu creuse', async () => {
    rendre([ligne(1, { extrait: '   ' })]);
    expect((await lireBoiteMail(null, [])).lignes[0].extrait).toBeNull();
  });

  it('le libellé d’un partenaire interne PRIME sur le nom porté par le mail', async () => {
    rendre([ligne(1, { interlocuteur: 'Service Gestion', interlocuteur_adresse: 'compta@adhoc.fr' })]);
    const p = await lireBoiteMail(null, [{ adresse: 'compta@adhoc.fr', libelle: 'Comptabilité (ADHOC Gestion)' }]);
    expect(p.lignes[0].interlocuteur).toBe('Comptabilité (ADHOC Gestion)');
  });

  it('un échange sans aucun message reçu garde le nom rendu par le SQL (les destinataires), sans planter', async () => {
    rendre([ligne(1, { interlocuteur: 'proprio@x.fr', interlocuteur_adresse: null })]);
    expect((await lireBoiteMail(null, [])).lignes[0].interlocuteur).toBe('proprio@x.fr');
  });

  it('un échange classé sans suite est RENDU, et signalé — la boîte montre tout', async () => {
    rendre([ligne(1, { sans_suite: true })]);
    expect((await lireBoiteMail(null, [])).lignes[0].sansSuite).toBe(true);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 LOT MESSAGE-CLIQUÉ — LA LIGNE DIT QUEL MESSAGE ELLE REPRÉSENTE.
   *
   * C'est ce que l'écran ouvrira au clic. Le message est CELUI DU PARCOURS (`p.message_id`), c'est-à-dire celui que
   * le prédicat « dernier de son échange, dans ce sens » a désigné pour construire toute la ligne — sa date, son
   * expéditeur, son extrait. Le prendre ailleurs donnerait une ligne qui montre un message et en ouvre un autre :
   * c'est exactement le défaut qu'Arno a relevé sur le fil 354.
   *
   * (Que le parcours soit bien borné au sens sous Réception et sous Envoyés est éprouvé plus haut, dans
   * « la règle des deux boîtes » : ces deux blocs se tiennent, et aucun ne vaut sans l'autre.)
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 la ligne porte SON message — et en NOMBRE (piège `bigint` de pg)', async () => {
    rendre([ligne(354, { message_id: '8123' })]);
    const [l] = (await lireBoiteMail(null, [])).lignes;
    expect(l.messageAffiche).toBe(8123);
    expect(typeof l.messageAffiche).toBe('number');
  });

  it('c’est le message DU PARCOURS qui est rendu, celui-là même qui a fourni la ligne', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    const sql = sqlPage().replace(/\s+/g, ' ');
    // Le CTE le désigne déjà ; le SELECT final ne fait que cesser de le jeter — aucune seconde lecture.
    expect(sql).toContain('m.id AS message_id');
    expect(sql).toContain('p.message_id::text AS message_id');
  });
});

describe('garanties STATIQUES', () => {
  it('ce dépôt ne fait QUE lire : aucune écriture n’est atteignable', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/lib/gestion/boiteRepo.ts', 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|--)/.test(l.trim())).join('\n');
    expect(/INSERT INTO|UPDATE\s+gestion_|DELETE\s+FROM|withTransaction/i.test(code)).toBe(false);
  });

  it('le poste de tri n’est pas touché : la boîte a son propre dépôt', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('app/lib/gestion/fileRepo.ts', 'utf8')).not.toContain('boiteRepo');
  });

  it('la page par défaut tient sur un écran sans faire attendre', () => {
    expect(PAGE_BOITE).toBeGreaterThanOrEqual(20);
    expect(PAGE_BOITE).toBeLessThanOrEqual(50);
  });
});

/**
 * LOT 5-FUSION — LES ÉTIQUETTES. Ce qui casse, et comment on le reconnaît :
 *   ① le filtre se pose APRÈS le `LIMIT` → la page rend deux lignes au lieu de trente, sans erreur, et la suivante
 *      repart du mauvais endroit. On vérifie donc qu'il entre dans le PARCOURS, pas dans le `SELECT` final ;
 *   ② on passe à PostgreSQL un paramètre de plus que la requête n'en utilise → « bind message supplies 4 parameters,
 *      but prepared statement requires 3 ». On vérifie le compte exact, étiquette par étiquette ;
 *   ③ « À classer » cesse d'être le poste de tri (fenêtre d'activité oubliée, courrier automatique laissé entrer) →
 *      deux listes qui portent le même nom et ne disent pas la même chose.
 */
describe('④ les étiquettes', () => {
  const etiq = (sorte: string, evenementId: number | null = null) =>
    ({ sorte, evenementId }) as Parameters<typeof sqlPageBoite>[1];

  it('🔴 le filtre entre dans le PARCOURS, avant le LIMIT — sinon la page rend moins que ce qu’on a demandé', () => {
    for (const [sorte, marqueur] of [
      ['envoyes', "m.sens = 'envoye'"],  // LOT 5-BOITE-2 : le dernier message décide, et `m` EST ce dernier
      ['reception', "m.sens = 'recu'"],
      ['sans_suite', "f0.etat = 'sans_suite'"],
      ['automatique', 'ml.exclu_le IS NULL'],
      ['a_classer', "f0.etat = 'a_classer'"],
    ] as const) {
      expect(parcours(sqlPageBoite(false, etiq(sorte)))).toContain(marqueur);
    }
    expect(parcours(sqlPageBoite(false, etiq('carte', 7)))).toContain('a0.evenement_id = $4::bigint');
  });

  it('« Réception » n’ajoute AUCUN filtre : c’est la boîte du lot 5a, inchangée', () => {
    expect(sqlPageBoite(false, etiq('reception'))).toBe(sqlPageBoite(false));
  });

  it('🔴 le compte des paramètres LIÉS est exact — un de trop et PostgreSQL refuse la requête', async () => {
    for (const [sorte, id, attendu] of [
      ['reception', null, 3], ['envoyes', null, 3], ['sans_suite', null, 3], ['automatique', null, 3],
      ['a_classer', null, 4], ['carte', 7, 4],
    ] as const) {
      rendre([]);
      await lireBoiteMail(null, [], 30, { etiquette: etiq(sorte, id), fenetreJours: 45 });
      const sql = sqlPage();
      expect(paramsPage()).toHaveLength(attendu);
      // …et le SQL n'utilise QUE les paramètres qu'on lui passe : aucun `$5`, jamais un `$4` orphelin.
      expect(sql.includes('$4')).toBe(attendu === 4);
      expect(sql).not.toContain('$5');
    }
  });

  it('une CARTE porte son identifiant en $4, et ne compte QUE ses échanges (pas les mails isolés)', async () => {
    rendre([]);
    await lireBoiteMail(null, [], 30, { etiquette: etiq('carte', 77) });
    expect(paramsPage()[3]).toBe(77);
    expect(sqlPage()).toContain('a0.message_id IS NULL');
  });

  it('🔴 « À classer » EST le poste de tri : sa fenêtre vient de l’appelant, et l’automatique reste dehors', async () => {
    rendre([]);
    await lireBoiteMail(null, [], 30, { etiquette: etiq('a_classer'), fenetreJours: 45, inclureAutomatiques: true });
    expect(paramsPage()[3]).toBe(45);                                  // la fenêtre LUE EN BASE, pas 30 en dur
    expect(parcours(sqlPage())).toContain('AND m.exclu_le IS NULL');   // …et l'interrupteur n'y peut rien
  });

  it('🔴 « Courrier automatique » impose l’inverse : sans ça, l’étiquette serait vide par construction', async () => {
    rendre([]);
    await lireBoiteMail(null, [], 30, { etiquette: etiq('automatique'), inclureAutomatiques: false });
    expect(parcours(sqlPage())).not.toContain('AND m.exclu_le IS NULL');
    expect(parcours(sqlPage())).not.toContain('AND m2.exclu_le IS NULL');
    expect(parcours(sqlPage())).toContain('NOT EXISTS (SELECT 1 FROM gestion_message ml');
  });

  /**
   * LOT 5-BOITE-2 — « Envoyés » porte désormais SON total, comme Réception : les deux boîtes sont symétriques et
   * disjointes, il n'y a plus de raison que l'une sache se compter et pas l'autre. Les AUTRES étiquettes s'en
   * remettent toujours à la colonne de gauche — la recompter ici donnerait deux chiffres pour une seule vérité.
   */
  it('les deux BOÎTES portent leur total ; les autres étiquettes s’en remettent à la colonne de gauche', async () => {
    rendre([ligne(1)], 4944);
    expect((await lireBoiteMail(null, [], 30, { etiquette: etiq('envoyes') })).total).toBe(4944);
    rendre([ligne(1)], 4944);
    expect((await lireBoiteMail(null, [])).total).toBe(4944);
    rendre([ligne(1)], 4944);
    expect((await lireBoiteMail(null, [], 30, { etiquette: etiq('sans_suite') })).total).toBeNull();
  });

  it('chaque boîte compte AVEC SA RÈGLE : le sens est un paramètre LIÉ, jamais collé dans le SQL', async () => {
    rendre([ligne(1)], 4944);
    await lireBoiteMail(null, [], 30, { etiquette: etiq('envoyes') });
    expect((appelCompte()?.[1] as unknown[])?.[0]).toBe('envoye');
    rendre([ligne(1)], 4944);
    await lireBoiteMail(null, []);
    expect((appelCompte()?.[1] as unknown[])?.[0]).toBe('recu');
  });
});

/**
 * LOT 5-BOITE-3 — LA CORBEILLE DANS LE PARCOURS DE LA BOÎTE.
 *
 * 🔴 UNE SEULE RÈGLE, DEUX FORMES : l'étiquette « Corbeille » la MONTRE, toutes les autres l'ÉCARTENT. Écrites au
 * même endroit, elles ne peuvent pas diverger et laisser un échange invisible partout.
 */
describe('la corbeille dans le parcours', () => {
  const etiq2 = (sorte: string) => ({ sorte, evenementId: null }) as Parameters<typeof sqlPageBoite>[1];

  it('sans la migration 251, la colonne n’est JAMAIS nommée — sinon toute la boîte échouerait', () => {
    for (const sorte of ['reception', 'envoyes', 'a_classer', 'corbeille'] as const) {
      expect(sqlPageBoite(false, etiq2(sorte), false)).not.toContain('corbeille_le');
    }
  });

  it('avec la migration, les autres étiquettes ÉCARTENT la corbeille', () => {
    for (const sorte of ['reception', 'envoyes', 'a_classer'] as const) {
      const sql = parcours(sqlPageBoite(false, etiq2(sorte), true)).replace(/\s+/g, ' ');
      expect(sql).toContain('AND NOT EXISTS (SELECT 1 FROM gestion_fil fc');
      expect(sql).toContain('fc.corbeille_le >= m.recu_le');
    }
  });

  it('…et l’étiquette « Corbeille » la MONTRE, par la forme positive de la même règle', () => {
    const sql = parcours(sqlPageBoite(false, etiq2('corbeille'), true)).replace(/\s+/g, ' ');
    expect(sql).toContain('AND EXISTS (SELECT 1 FROM gestion_fil fc');
    expect(sql).not.toContain('AND NOT EXISTS (SELECT 1 FROM gestion_fil fc');
  });

  /**
   * 🔴 LE RETOUR AUTOMATIQUE, ET IL EST GRATUIT : le message de la ligne étant le DERNIER de son échange (au lot
   * BOITE-SENS : le dernier DANS SON SENS), comparer le geste à sa date suffit. Un nouveau message arrive → sa date
   * dépasse celle du geste → l'échange revient dans sa boîte, sans qu'une seule ligne soit écrite, et sans que la
   * relève ait à savoir que la corbeille existe.
   */
  it('la comparaison porte sur le message AFFICHÉ : c’est ce qui fait revenir l’échange tout seul', () => {
    const sql = parcours(sqlPageBoite(false, etiq2('reception'), true)).replace(/\s+/g, ' ');
    expect(sql).toContain('fc.corbeille_le >= m.recu_le');
  });

  it('le total d’une boîte écarte la corbeille par la MÊME règle', async () => {
    rendre([], 4944);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: etiq2('reception') });
    const sql = (appelCompte()?.[0] as string).replace(/\s+/g, ' ');
    expect(sql).toContain('m2.sens = m.sens');
    // 🔴 LA MÊME FORMULE QUE LA LISTE, mot pour mot : le geste comparé à la date du message affiché. Deux écritures
    //   différentes du même filtre donneraient un total que la liste ne montre pas — et c'est le total qu'on croit.
    expect(sql).toContain('fc.corbeille_le >= m.recu_le');
  });
});
