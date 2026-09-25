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
  objet: `Objet ${n}`,
  interlocuteur: 'Mme Martin',
  interlocuteur_adresse: 'martin@orange.fr',
  dernier_sens: 'recu',
  dernier_le: `2026-09-${String(20 - (n % 19)).padStart(2, '0')}T10:00:00Z`,
  extrait: 'bonjour',
  nb_messages: 3,
  nb_lisibles: 3,
  a_piece: false,
  reference: null,
  sans_suite: false,
  ...o,
});
/** Le 1er appel est la page, le 2e (s'il existe) le total. */
const rendre = (lignes: unknown[], total = 100) => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) => {
    if (String(sql).includes('DISTINCT ON (m.fil_id) m.sens')) return { rows: [{ n: total }] };
    if (String(sql).includes('FILTER (WHERE lisibles > 0)')) return { rows: [{ lisibles: 4944, total: 17206 }] };
    return { rows: lignes };
  });
};
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
    await expect(comptesBoite()).resolves.toEqual({
      lisibles: 4944, automatiques: 17206 - 4944, envoyes: 0, reception: 0,
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
 * LOT 5-BOITE-2 — UNE SEULE BOÎTE PAR ÉCHANGE (décision d'Arno du 25/09, 17h43).
 *
 * 🔴 LE DERNIER MESSAGE DÉCIDE. Dernier reçu → Réception ; dernier envoyé → Envoyés ; jamais les deux. L'échange
 * BASCULE d'une boîte à l'autre à chaque nouveau message, et l'historique complet reste dans la conversation.
 *
 * ⚠️ Le filtre est COURT parce que `m` EST déjà le dernier message de son échange — c'est le prédicat « aucun
 * message plus récent » du CTE `page` qui le garantit. Un EXISTS referait, plus cher, un travail déjà fait.
 */
describe('la règle des deux boîtes', () => {
  it('Réception = le dernier message est REÇU', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    const sql = parcours(sqlPage()).replace(/\s+/g, ' ');
    expect(sql).toContain("AND m.sens = 'recu'");
    expect(sql).not.toContain("AND m.sens = 'envoye'");
  });

  it('Envoyés = le dernier message est ENVOYÉ — le pendant EXACT, jamais un recouvrement', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    const sql = parcours(sqlPage()).replace(/\s+/g, ' ');
    expect(sql).toContain("AND m.sens = 'envoye'");
    expect(sql).not.toContain("AND m.sens = 'recu'");
  });

  /** Les deux filtres sont exclusifs par construction : aucun échange ne peut satisfaire les deux à la fois. */
  it('les deux filtres ne peuvent pas être vrais ensemble : un message a UN sens', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    const rec = parcours(sqlPage()).replace(/\s+/g, ' ');
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    const env = parcours(sqlPage()).replace(/\s+/g, ' ');
    expect(rec).not.toBe(env);
    // …et le filtre porte sur LE message du parcours (`m`), donc sur le dernier — pas sur un EXISTS quelque part.
    expect(rec).not.toContain('EXISTS (SELECT 1 FROM gestion_message mr');
    expect(env).not.toContain('EXISTS (SELECT 1 FROM gestion_message me');
  });

  it('le TOTAL de chaque boîte porte la même règle que sa liste', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    // Le comptage prend UNE ligne par échange, la plus récente, et filtre sur son sens : exactement la liste.
    expect(sqls().some((s) => s.includes('DISTINCT ON (m.fil_id) m.sens') && s.includes('WHERE d.sens = $1'))).toBe(true);
  });
});

describe('ce que chaque ligne porte', () => {
  it('l’identifiant revient en NOMBRE, jamais en chaîne (piège `bigint` de pg)', async () => {
    rendre([ligne(4242)]);
    const p = await lireBoiteMail(null, []);
    expect(p.lignes[0].filId).toBe(4242);
    expect(typeof p.lignes[0].filId).toBe('number');
  });

  it('le correspondant, la date, le nombre de messages, la pièce jointe et la référence de carte', async () => {
    rendre([ligne(1, { reference: 'GES-2026-000012', a_piece: true, nb_messages: 7 })]);
    const [l] = (await lireBoiteMail(null, [])).lignes;
    expect(l.interlocuteur).toBe('Mme Martin');
    expect(l.nbMessages).toBe(7);
    expect(l.aPiece).toBe(true);
    expect(l.reference).toBe('GES-2026-000012');
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
    const appel = queryMock.mock.calls.find((c) => String(c[0]).includes('DISTINCT ON (m.fil_id) m.sens'));
    expect((appel?.[1] as unknown[])?.[0]).toBe('envoye');
    rendre([ligne(1)], 4944);
    await lireBoiteMail(null, []);
    const appel2 = queryMock.mock.calls.find((c) => String(c[0]).includes('DISTINCT ON (m.fil_id) m.sens'));
    expect((appel2?.[1] as unknown[])?.[0]).toBe('recu');
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
   * 🔴 LE RETOUR AUTOMATIQUE, ET IL EST GRATUIT : `m` étant le DERNIER message de son échange, comparer le geste à
   * sa date suffit. Un nouveau message arrive → sa date dépasse celle du geste → l'échange revient dans sa boîte,
   * sans qu'une seule ligne soit écrite, et sans que la relève ait à savoir que la corbeille existe.
   */
  it('la comparaison porte sur le DERNIER message : c’est ce qui fait revenir l’échange tout seul', () => {
    const sql = parcours(sqlPageBoite(false, etiq2('reception'), true)).replace(/\s+/g, ' ');
    expect(sql).toContain('fc.corbeille_le >= m.recu_le');
  });

  it('le total d’une boîte écarte la corbeille par la MÊME règle', async () => {
    rendre([], 4944);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: etiq2('reception') });
    // Sans la migration (la sonde répond « non » sur la base doublée), la colonne n'est pas nommée non plus.
    expect(sqls().some((s) => s.includes('DISTINCT ON (m.fil_id) m.sens'))).toBe(true);
  });
});
