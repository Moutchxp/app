import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

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

import { comptesBoite, lireBoiteMail, sqlPageBoite, sqlCompteBoite, PAGE_BOITE } from './boiteRepo';
/**
 * 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — ON ÉPROUVE LA SOURCE UNIQUE, PAS SA COPIE. Les épreuves de ce fichier
 * figeaient `('lot', 'proprietaire')` écrit à la main ; c'est-à-dire qu'elles protégeaient la DIVERGENCE qu'on
 * vient de corriger. Elles comparent désormais au fragment que le module PUR rend.
 */
import { sqlSortesBien } from './statutClassement';

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
    // ⚠️ `corbeille: null` (lot BOITE-INTERNE-CORBEILLE) se lit « on ne sait pas » — migration 275 absente dans ce
    //    jeu d'essai — et surtout PAS « la corbeille est vide » : c'est ce `null` qui retire l'entrée de la colonne.
    // 🔴🔴 LOT DOSSIER-A-CLASSER — le SEPTIÈME nombre, celui du dossier « À classer ». Il ne sort pas du même
    //    regroupement que les six autres (la pastille interroge trois tables de plus) : c'est une requête à part,
    //    bâtie par `sqlCompteBoite` — le MÊME constructeur que l'en-tête de la liste. Le jeu d'essai rend 100.
    await expect(comptesBoite()).resolves.toEqual({
      lisibles: 4944, automatiques: 17206 - 4944, envoyes: 0, reception: 0, spam: 0, corbeille: null,
      aClasser: 100,
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
  /**
   * ══ 🔴 RÉÉCRIT PAR LE LOT BOITE-INTERNE-CORBEILLE (29/09/2026) — ET VOICI POURQUOI ════════════════════════════
   *
   * CE QU'IL DISAIT : « Réception = `m.sens = 'recu'` aux deux étages, et le mot `envoye` n'y paraît nulle part. »
   * C'était vrai, et c'est devenu FAUX — pas par relâchement, mais parce que la règle d'Arno a une exception que
   * ce test interdisait : un message que gestion@ s'adresse À ELLE-MÊME (À, Cc ou Cci) est dans notre Réception,
   * exactement comme le fait Gmail. Mesuré sur la vraie base : 51 messages, 49 échanges, dont 32 qui n'avaient
   * AUCUN autre message reçu et n'apparaissaient donc que sous « Envoyés ».
   *
   * CE QU'IL PROTÈGE MAINTENANT, et qui est la même exigence sous une règle plus large : l'appartenance entre aux
   * DEUX étages, `m` comme `m2`. C'était l'objet du lot BOITE-SENS et ça ne bouge pas — dans `m2` seul, l'échange
   * sortirait de la Réception dès qu'on y répond ; dans `m` seul, la ligne serait sur le bon message mais triée
   * sur le mauvais.
   */
  it('Réception = tout message de NOTRE réception, aux DEUX étages du parcours', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    const sql = parcours(sqlPage()).replace(/\s+/g, ' ');
    expect(sql).toContain("(m.sens = 'recu' OR EXISTS");
    expect(sql).toContain("(m2.sens = 'recu' OR EXISTS");
    // 🔴 LES TROIS CHAMPS, aux deux étages : `dest_cci` est précisément la forme des envois groupés.
    for (const etage of ['m', 'm2']) {
      for (const champ of ['dest_a', 'dest_cc', 'dest_cci']) expect(sql).toContain(`${etage}.${champ}`);
    }
    // ⚠️ L'ADRESSE EST LIÉE, jamais collée dans le SQL : elle vient de la base (`gestion_config`).
    expect(sql).toContain("lower(dn ->> 'adresse') = $4");
    expect(sql).not.toContain('gestion@');
    // Et Réception ne réclame toujours RIEN sur le sens contraire : aucun échange n'en est exclu.
    expect(sql).not.toContain("m.sens = 'envoye'");
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

  /**
   * ⚠️ RÉÉCRIT PAR LE LOT BOITE-INTERNE-CORBEILLE. Il exigeait `p.de_adresse AS interlocuteur_adresse` NU sous
   * Réception — vrai tant que toute ligne de Réception était un message reçu. Depuis qu'un envoi qui nous est
   * adressé y entre, lire l'expéditeur sans regarder le sens afficherait « Gestion CRITERIMMO » comme
   * correspondant de nos propres envois groupés. L'exigence n'a pas changé — l'interlocuteur suit le message —,
   * seule sa forme s'adapte au fait qu'une ligne de Réception peut désormais être un envoi.
   */
  it('l’interlocuteur suit le message AFFICHÉ, jamais l’autre sens', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    // Réception : l'expéditeur si le message est reçu, le destinataire si c'est un envoi qui nous est adressé.
    expect(sqlPage().replace(/\s+/g, ' '))
      .toContain("CASE WHEN p.sens = 'recu' THEN p.de_adresse ELSE (p.dest_a -> 0 ->> 'adresse') END");
    /**
     * ⚠️ ET LA JOINTURE LATÉRALE REVIENT SOUS RÉCEPTION — ce test exigeait son ABSENCE. Elle avait disparu au lot
     * BOITE-SENS parce qu'il n'y avait plus rien à chercher ; il y a de nouveau quelque chose, le NOM du
     * destinataire d'un envoi qui nous est adressé. Sans elle, ces lignes-là afficheraient une adresse nue.
     */
    expect(sqlPage()).toContain("r.sens = 'recu'");
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    // Envoyés : le DESTINATAIRE du message de la ligne, jamais un expéditeur.
    expect(sqlPage()).toContain("(p.dest_a -> 0 ->> 'adresse') AS interlocuteur_adresse");
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   * 🔴 LOT ENVOI-DIAG — « ENVOYÉS » NE MONTRE QUE DU COURRIER RÉELLEMENT PARTI.
   *
   * Arno a demandé que l'application n'affiche JAMAIS « envoyé » avant que le serveur d'envoi ait accepté. La
   * liste sort de `gestion_message`, que seule la relève alimente en relisant le dossier « Envoyés » de Gmail :
   * un message refusé n'y est jamais entré.
   *
   * ═══ 🔴 CE QUI A CHANGÉ AU LOT LIGNE-NON-ENVOYE, ET POURQUOI CE N'EST PAS UN RECUL ═════════════════════════════
   * Ce test interdisait toute lecture de `gestion_envoi_file` dans la liste, et il avait raison de le faire : le
   * danger était qu'un mail REFUSÉ apparaisse comme ENVOYÉ. Arno demande maintenant l'inverse exact — qu'un mail
   * refusé apparaisse, en ROUGE, marqué « Non envoyé ».
   *
   * La propriété protégée n'était donc pas « ne pas lire la table » ; c'était « ne jamais faire passer un refus
   * pour un envoi ». C'est ELLE qu'on tient désormais, et plus strictement qu'avant :
   *   · la liste des messages sort toujours de `gestion_message` SEUL — la requête de page ne joint rien d'autre ;
   *   · ce qui vient de la file arrive par une lecture SÉPARÉE, et porte une mention `nonEnvoye` qui ne peut se
   *     rendre qu'en capsule rouge. Aucune ligne de la file ne peut donc se présenter comme un envoi réussi.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  it('🔴 la requête de PAGE ne joint jamais la table des tentatives : la liste sort de gestion_message seul', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'envoyes', evenementId: null } });
    // La requête de page (la première émise) reste la lecture des messages, et elle seule.
    expect(sqlPage()).not.toContain('gestion_envoi');
    expect(sqlPage()).not.toContain('gestion_brouillon');
    expect(sqlPage()).not.toContain("'en_cours'");
  });

  /**
   * 🔴🔴 ET CE QUI REMONTE DE LA FILE NE PEUT PAS PASSER POUR UN ENVOI RÉUSSI : on ne lit QUE les lignes en
   * `echec`, jamais celles en `envoye` ni en `attente`. C'est la protection réelle, celle que le test précédent
   * cherchait à obtenir par l'absence de lecture.
   */
  it('🔴🔴 seules les lignes en ÉCHEC sont lues — jamais un envoi en cours, jamais un envoi réussi', async () => {
    const src = readFileSync('app/lib/gestion/fileEnvoiRepo.ts', 'utf8');
    // ⚠️ LOT BANDEAU-ET-BROUILLONS — la règle est devenue une FONCTION (son texte dépend d'une sonde de schéma).
    //   Ce qu'on éprouve ici n'a pas bougé d'un mot : on ne lit QUE les lignes en échec.
    const bloc = src.slice(src.indexOf('function sqlEchecNonResolu'), src.indexOf('interface LigneEchec'));
    expect(bloc).toContain("f.etat = 'echec'");
    expect(bloc).not.toContain("f.etat = 'attente'");
    expect(bloc).not.toContain("f.etat = 'en_cours'");
  });

  /**
   * 🔴 ET LA CAPSULE DISPARAÎT AU RENVOI RÉUSSI (demande d'Arno). La règle vit dans la REQUÊTE — un échec dont le
   * même brouillon a, depuis, un envoi réussi n'est plus rendu. Rien n'est réécrit : cette tentative-là a bien
   * échoué, et une table qui dirait le contraire mentirait sur ce qui s'est passé.
   */
  it('🔴 un échec RÉPARÉ n’est plus rendu : la règle est dans la requête, pas dans une réécriture', () => {
    const src = readFileSync('app/lib/gestion/fileEnvoiRepo.ts', 'utf8');
    const bloc = src.slice(src.indexOf('function sqlEchecNonResolu'), src.indexOf('interface LigneEchec'));
    expect(bloc).toContain('NOT EXISTS');
    expect(bloc).toContain("f2.etat = 'envoye'");
    expect(bloc).toContain('f2.demande_le > f.demande_le');
    // ⚠️ Deux échecs SANS brouillon ne doivent pas se répondre l'un l'autre.
    expect(bloc).toContain('f2.brouillon_id IS NOT NULL');
  });

  /**
   * ⚠️ RÉÉCRIT PAR LE LOT BOITE-INTERNE-CORBEILLE. Il figeait `m2.sens = m.sens` et `WHERE m.sens = $1`. Cette
   * forme-là disait « du même SENS que le candidat » — ce qui n'a plus de sens depuis qu'un envoi qui nous est
   * adressé appartient à la Réception : un message reçu y serait comparé aux seuls reçus, et un envoi-à-nous-mêmes
   * aux seuls envois, soit deux règles dans une même requête. L'EXIGENCE, elle, est intacte et c'est la seule qui
   * compte : le compteur doit porter EXACTEMENT le prédicat de la liste, au caractère près.
   */
  it('le TOTAL de chaque boîte porte la même règle que sa liste', async () => {
    rendre([]);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: { sorte: 'reception', evenementId: null } });
    const sql = (appelCompte()?.[0] as string).replace(/\s+/g, ' ');
    // 🔴 LE MÊME PRÉDICAT QUE LA LISTE, aux deux étages — il sort de la même fonction (`sqlAppartenance`).
    expect(sql).toContain("(m.sens = 'recu' OR EXISTS");
    expect(sql).toContain("(m2.sens = 'recu' OR EXISTS");
    expect(sql).toContain("lower(dn ->> 'adresse') = $1");
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT LISTE-PAGINATION — LE COMPTE DE LA LISTE EST LA LISTE, COMPTÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 le compte d’une liste emploie EXACTEMENT le prédicat de cette liste', () => {
  /**
   * Ce qui rend ce lot possible sans créer une seconde vérité : `sqlPageBoite` et `sqlCompteBoite` tirent leurs
   * fragments de la MÊME fonction (`predicatsBoite`). L'épreuve le vérifie là où ça compte — sur le SQL émis :
   * chaque morceau du parcours de la page se retrouve mot pour mot dans le compte.
   *
   * 🔴 CE QU'ELLE ATTRAPERAIT : quelqu'un ajoute une condition à la liste (une exclusion de plus, un filtre
   * nouveau) et oublie le compte. La pagination annoncerait alors « sur 8 546 » au-dessus d'une liste qui n'en
   * contient que 8 400, et la dernière page serait à moitié vide — sans la moindre erreur nulle part.
   */
  it('🔴 chaque condition de la page se retrouve dans le compte, mot pour mot', () => {
    const etiq = (sorte: string) => ({ sorte, evenementId: null } as unknown as Parameters<typeof sqlPageBoite>[1]);
    for (const sorte of ['reception', 'envoyes', 'automatique', 'spam', 'corbeille', 'sans_suite']) {
      const page = sqlPageBoite(false, etiq(sorte), true, true, null, true, false, false, 4, true);
      const compte = sqlCompteBoite(false, etiq(sorte), true, true, null, true, 1, true, 1);
      const parc = parcours(page).replace(/\s+/g, ' ');
      for (const fragment of [
        'AND m.exclu_le IS NULL', 'AND m.spam_le IS NULL', 'AND m2.spam_le IS NULL',
      ]) {
        // Le fragment est dans le parcours de la page ⇒ il DOIT être dans le compte. L'inverse serait une
        //   condition que le compte applique et que la liste ignore : tout aussi faux, et dans l'autre sens.
        const plat = compte.replace(/\s+/g, ' ');
        expect(parc.includes(fragment)).toBe(plat.includes(fragment));
      }
      // 🔴 LE PRÉDICAT QUI FAIT COMPTER DES ÉCHANGES ET NON DES MESSAGES est présent des deux côtés.
      expect(compte).toContain('NOT EXISTS');
      expect(compte).toContain('(m2.recu_le, m2.id) > (m.recu_le, m.id)');
      // ⚠️ ET LE COMPTE N'A NI CURSEUR NI `LIMIT` : il compte la liste ENTIÈRE, pas une page.
      expect(compte).not.toContain('LIMIT');
      expect(compte).not.toContain('recu_le, m.fil_id) <');
      expect(compte).not.toContain('ORDER BY');
    }
  });

  /**
   * ⚠️ LES RANGS DE PARAMÈTRES REPARTENT DE 1 DANS LE COMPTE. PostgreSQL refuse une requête à qui l'on fournit un
   * paramètre qu'elle n'utilise pas (« bind message supplies N parameters, but prepared statement requires M ») :
   * un compte qui garderait `$4` pour son étiquette réclamerait quatre paramètres dont trois n'existent pas.
   */
  it('⚠️ le compte numérote ses paramètres à partir de $1, la page à partir de $4', () => {
    const carte = { sorte: 'carte', evenementId: 12 } as unknown as Parameters<typeof sqlPageBoite>[1];
    expect(sqlPageBoite(false, carte)).toContain('a0.evenement_id = $4::bigint');
    expect(sqlCompteBoite(false, carte)).toContain('a0.evenement_id = $1::bigint');
    const aClasser = { sorte: 'a_classer', evenementId: null } as unknown as Parameters<typeof sqlPageBoite>[1];
    expect(sqlPageBoite(false, aClasser)).toContain("($4::int * interval '1 day')");
    expect(sqlCompteBoite(false, aClasser)).toContain("($1::int * interval '1 day')");
  });

  /** 🔴 ET LE TOTAL RENDU EST BIEN CELUI DE CE COMPTE, pour n'importe quelle étiquette. */
  it('🔴 le total rendu sort de la requête de comptage, sous toute étiquette', async () => {
    const etiq2 = (sorte: string) => ({ sorte, evenementId: null } as unknown as { sorte: 'spam'; evenementId: null });
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('count(*)::int AS n')) return { rows: [{ n: 258 }] };
      return { rows: [] };
    });
    const p = await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: etiq2('spam') });
    expect(p.total).toBe(258);
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
      // ⚠️ `sqlPageBoite` appelée DIRECTEMENT, sans rang d'adresse : le prédicat retombe alors mot pour mot sur
      //    celui d'avant le lot BOITE-INTERNE-CORBEILLE. C'est cette propriété-là qui garde tout ce fichier lisible.
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

  /**
   * ⚠️ « Réception » PASSE DE 3 À 4 PARAMÈTRES (lot BOITE-INTERNE-CORBEILLE) : le quatrième est NOTRE adresse, que
   * le prédicat d'appartenance compare aux destinataires. Le reste du tableau ne bouge pas d'une ligne — et c'est
   * bien le compte EXACT qui est vérifié, étiquette par étiquette, parce que c'est lui qui casse en production.
   */
  it('🔴 le compte des paramètres LIÉS est exact — un de trop et PostgreSQL refuse la requête', async () => {
    for (const [sorte, id, attendu] of [
      ['reception', null, 4], ['envoyes', null, 3], ['sans_suite', null, 3], ['automatique', null, 3],
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

  /**
   * 🔴 LE RANG DU FILTRE DES NON-LUS SUIT CELUI DE L'ADRESSE — le décalage d'un cran, en vrai.
   *
   * Sous « Réception », l'adresse prend `$4` : la liste des échanges retenus glisse donc en `$5`. Ce test existe
   * parce que ce décalage-là est EXACTEMENT le défaut que ce dépôt a déjà connu (voir l'encadré `rangRetenus`) —
   * et parce qu'il ne se voit pas : la requête part, PostgreSQL compare un identifiant à une adresse, et la liste
   * des non-lus revient vide sans une seule erreur.
   */
  it('🔴 sous Réception, le filtre des non-lus prend $5 — pas $4, qui porte l’adresse', async () => {
    rendre([]);
    await lireBoiteMail(null, [], 30, { etiquette: etiq('reception'), filsRetenus: [12, 34] });
    expect(paramsPage()).toHaveLength(5);
    expect(paramsPage()[4]).toEqual([12, 34]);
    expect(parcours(sqlPage())).toContain('m.fil_id = ANY($5::bigint[])');
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
   * ══ 🔴🔴 RÉÉCRIT PAR LE LOT LISTE-PAGINATION — TOUTE ÉTIQUETTE PORTE LE TOTAL DE SA LISTE ═══════════════════
   *
   * CE QUI ÉTAIT EXIGÉ ICI, ET QUI NE VAUT PLUS :
   *     expect((await lireBoiteMail(null, [], 30, { etiquette: etiq('sans_suite') })).total).toBeNull();
   * c'est-à-dire « seules Réception et Envoyés savent se compter ; les autres étiquettes s'en remettent à la
   * colonne de gauche ».
   *
   * POURQUOI C'ÉTAIT LA BONNE RÈGLE : le total n'était affiché que dans le titre, où la colonne de gauche
   * fournissait déjà le nombre de chaque étiquette. Le recompter ici aurait donné deux chiffres pour une seule
   * vérité — donc, tôt ou tard, deux chiffres différents.
   *
   * POURQUOI ÇA NE VAUT PLUS : la pagination « 1–25 sur N · ‹ › » vit SOUS TOUTES les étiquettes, et avec ou sans
   * filtre étoilé. Sans total sous « Spam » ou « Corbeille », elle ne saurait pas combien de pages il y a ; avec
   * le total de la colonne de gauche — qui ignore le filtre étoilé — elle annoncerait 8 546 au-dessus de deux
   * lignes étoilées.
   *
   * 🔒 ET LA CRAINTE D'ORIGINE EST LEVÉE À LA SOURCE, pas contournée : ce total-ci est calculé par
   * `sqlCompteBoite`, qui emploie LE MÊME prédicat que la page (`predicatsBoite`). Ce n'est pas un second calcul
   * « équivalent » — c'est la même phrase, comptée au lieu d'être listée. Elle ne peut pas diverger.
   *
   * ⚠️ `null` GARDE SON SENS, et l'épreuve le garde aussi : il se lit « pas la première page, donc pas recompté ».
   */
  it('TOUTE étiquette porte le total de SA liste ; `null` ne veut plus dire que « pas la première page »', async () => {
    rendre([ligne(1)], 4944);
    expect((await lireBoiteMail(null, [], 30, { etiquette: etiq('envoyes') })).total).toBe(4944);
    rendre([ligne(1)], 4944);
    expect((await lireBoiteMail(null, [])).total).toBe(4944);
    // 🔴 LE CHANGEMENT DU LOT : « Sans suite » porte désormais SON nombre, au lieu de renvoyer à la colonne.
    rendre([ligne(1)], 4944);
    expect((await lireBoiteMail(null, [], 30, { etiquette: etiq('sans_suite') })).total).toBe(4944);
    // ⚠️ PAS LA PREMIÈRE PAGE ⇒ toujours `null` : le nombre ne bouge pas entre deux pages, on ne le repaie pas.
    rendre([ligne(1)], 4944);
    expect((await lireBoiteMail({ dernierLe: '2026-01-01T00:00:00Z', filId: '9' }, [])).total).toBeNull();
  });

  /**
   * ⚠️ RÉÉCRIT PAR LE LOT BOITE-INTERNE-CORBEILLE. Il exigeait que le SENS soit un paramètre lié (`$1 = 'recu'`).
   * Sous « Réception », le sens n'est plus à lui seul la règle : le paramètre lié y porte désormais NOTRE ADRESSE,
   * et « Envoyés » n'a plus AUCUN paramètre — son prédicat est un littéral. L'exigence de fond ne change pas :
   * rien qui vienne de la base n'est collé dans le SQL, et le compte des paramètres est exact des deux côtés
   * (un de trop, et PostgreSQL refuse la requête).
   */
  it('chaque boîte compte AVEC SA RÈGLE, et rien de la base n’est collé dans le SQL', async () => {
    rendre([ligne(1)], 4944);
    await lireBoiteMail(null, [], 30, { etiquette: etiq('envoyes') });
    // « Envoyés » : un littéral, donc AUCUN paramètre — en passer un ferait échouer la requête.
    expect(appelCompte()?.[1]).toEqual([]);
    expect(appelCompte()?.[0]).toContain("m.sens = 'envoye'");
    rendre([ligne(1)], 4944);
    await lireBoiteMail(null, []);
    // « Réception » : notre adresse, LIÉE, jamais écrite dans la requête.
    expect((appelCompte()?.[1] as unknown[])?.[0]).toBe('gestion@criterimmo.fr');
    expect(appelCompte()?.[0]).not.toContain('gestion@');
  });
});

/**
 * ══ 🔴🔴 RÉÉCRIT PAR LE LOT BOITE-INTERNE-CORBEILLE (29/09/2026) — LA CORBEILLE A CHANGÉ DE NATURE ═══════════════
 *
 * CE QUE CE BLOC ÉPROUVAIT (lot 5-BOITE-3) : une corbeille INTERNE, posée sur `gestion_fil.corbeille_le`, dont
 * l'appartenance se DÉRIVAIT d'une comparaison de dates — « le geste est-il postérieur au dernier message ? » —,
 * ce qui offrait gratuitement le retour automatique d'un échange recevant un nouveau message.
 *
 * POURQUOI CE N'EST PLUS ÇA. Décision d'Arno : c'est la corbeille de GMAIL qui fait foi, un seul état synchronisé,
 * comme le spam. L'état n'est donc plus le nôtre et n'est plus posé sur un ÉCHANGE mais sur des MESSAGES — il n'y a
 * plus rien à dériver, la relève relit « [Gmail]/Corbeille » à chaque passe. Le retour automatique n'a pas disparu :
 * il est devenu littéral (sortir un mail de la corbeille dans Gmail le fait revenir chez nous à la passe suivante).
 * La corbeille interne n'avait JAMAIS servi — 0 échange sur 36 531 — et ses colonnes restent en base, non lues.
 *
 * CE QUE CE BLOC ÉPROUVE MAINTENANT, et c'est la même exigence sous une règle plus simple : une seule écriture de
 * la règle, deux formes (positive sous son étiquette, négative partout ailleurs), et AUX DEUX ÉTAGES du parcours.
 */
describe('la corbeille dans le parcours', () => {
  const etiq2 = (sorte: string) => ({ sorte, evenementId: null }) as Parameters<typeof sqlPageBoite>[1];

  it('sans la migration 275, la colonne n’est JAMAIS nommée — sinon toute la boîte échouerait', () => {
    for (const sorte of ['reception', 'envoyes', 'a_classer', 'corbeille'] as const) {
      expect(sqlPageBoite(false, etiq2(sorte), false)).not.toContain('corbeille_le');
    }
    // …et l'étiquette rend alors une liste VIDE plutôt qu'une liste fausse, comme « Brouillons ».
    expect(parcours(sqlPageBoite(false, etiq2('corbeille'), false)).replace(/\s+/g, ' ')).toContain('AND false');
  });

  /**
   * 🔴 AUX DEUX ÉTAGES, ET C'EST LE CŒUR — même leçon que le spam, payée une fois. Posée sur le seul message
   * candidat, l'exclusion laisserait un mail supprimé jouer le rôle de « dernier message de l'échange » : la
   * ligne disparaîtrait de la Réception alors que son vrai dernier message est bien là.
   */
  it('avec la migration, les autres étiquettes ÉCARTENT la corbeille, aux DEUX étages', () => {
    for (const sorte of ['reception', 'envoyes', 'a_classer'] as const) {
      const sql = parcours(sqlPageBoite(false, etiq2(sorte), true)).replace(/\s+/g, ' ');
      expect(sql).toContain('AND m.corbeille_le IS NULL');
      expect(sql).toContain('AND m2.corbeille_le IS NULL');
    }
  });

  /**
   * 🔴 ET LA FORME POSITIVE ENTRE AUSSI DANS `m2`. Laissée vide sous « Corbeille », elle comparerait le mail
   * supprimé à TOUS les messages de son échange : un mail jeté au milieu d'une conversation vivante aurait
   * toujours un successeur et n'apparaîtrait NULLE PART. Une corbeille où l'on ne retrouve pas ce qu'on y a mis
   * n'est pas une corbeille.
   */
  it('…et l’étiquette « Corbeille » la MONTRE, par la forme positive de la même règle', () => {
    const sql = parcours(sqlPageBoite(false, etiq2('corbeille'), true)).replace(/\s+/g, ' ');
    expect(sql).toContain('AND m.corbeille_le IS NOT NULL');
    expect(sql).toContain('AND m2.corbeille_le IS NOT NULL');
    expect(sql).not.toContain('m.corbeille_le IS NULL');
  });

  /** ⚠️ LA COLONNE DE LA 251 N'EST PLUS NOMMÉE NULLE PART — elle existe en base, elle n'est plus lue. */
  it('🔴 la corbeille INTERNE de la 251 n’est plus lue nulle part', () => {
    for (const sorte of ['reception', 'envoyes', 'a_classer', 'corbeille'] as const) {
      expect(sqlPageBoite(false, etiq2(sorte), true)).not.toContain('gestion_fil fc');
    }
  });

  it('le total d’une boîte écarte la corbeille par la MÊME règle, aux deux étages', async () => {
    rendre([], 4944);
    await lireBoiteMail(null, [], PAGE_BOITE, { etiquette: etiq2('reception') });
    const sql = (appelCompte()?.[0] as string).replace(/\s+/g, ' ');
    // 🔴 LA MÊME FORMULE QUE LA LISTE, mot pour mot. Deux écritures différentes du même filtre donneraient un
    //   total que la liste ne montre pas — et c'est le total qu'on croit.
    expect(sql).toContain('AND m.corbeille_le IS NULL');
    expect(sql).toContain('AND m2.corbeille_le IS NULL');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DOSSIER-A-CLASSER — LE DOSSIER « À CLASSER » : EXACTEMENT LA RÈGLE DE LA PASTILLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DÉCISION D'ARNO (02/10/2026) : « contenu : exactement les mails au statut “À classer” (même règle que la
   pastille, une seule source de vérité) ».

   🔴 CE QUE CE BLOC PROTÈGE : que le prédicat du dossier soit la TRANSCRIPTION des trois conditions de
   `capsuleStatut`, et qu'il ne nomme AUCUNE table dont la migration pourrait manquer.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le dossier « À classer »', () => {
  const ETIQ = { sorte: 'a_classer_statut' as const, evenementId: null };
  const sql = (o?: { rattachements?: boolean; horsGestion?: boolean; interne?: boolean }) =>
    sqlPageBoite(false, ETIQ, false, false, null, false,
      o?.rattachements ?? true, o?.horsGestion ?? true, null, false, o?.interne ?? true)
      .replace(/\s+/g, ' ');

  it('🔴🔴 il transcrit les TROIS conditions de la pastille, et dans le même sens', () => {
    const s = sql();
    // ① aucun rattachement CONFIRMÉ vers un BIEN, sur TOUT l'échange
    expect(s).toContain("r0.statut = 'confirme'");
    /**
     * 🔴🔴 LOT STATUT-LIGNE-APRES-CLASSEMENT — LA LISTE DES SORTES VIENT DE `SORTES_BIEN`, ET ON L'ÉPROUVE AINSI.
     * Elle était écrite ici à la main (`('lot', 'proprietaire')`) — c'est-à-dire que l'épreuve figeait la COPIE au
     * lieu de vérifier qu'il n'y en a plus qu'une. Si quelqu'un ajoute une sorte de bien, ce test suit tout seul ;
     * si quelqu'un redivise la règle en deux, il tombe.
     */
    expect(s).toContain(`r0.cible_sorte IN (${sqlSortesBien()})`);
    expect(s).toContain("r0.cible_sorte IN ('lot', 'proprietaire', 'locataire')");
    expect(s).toContain('rm0.fil_id = m.fil_id');
    // ② l'échange n'est pas marqué « Interne »
    expect(s).toContain('gestion_fil_interne i0');
    expect(s).toContain('i0.fil_id = m.fil_id');
    // ③ le MESSAGE de la ligne n'est pas « Hors gestion » — le message, pas l'échange
    expect(s).toContain('gestion_hors_gestion h0');
    expect(s).toContain('h0.message_id = m.id');
    // 🔴 LES TROIS SONT DES NÉGATIONS : c'est ce qui en fait « à classer » et non « classé ».
    expect((s.match(/AND NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  /**
   * 🔴🔴 UNE PROPOSITION NE CLASSE RIEN. C'est la moitié de la règle qu'on perdrait le plus facilement, et c'est
   * aussi ce qui distingue ce dossier de « À rattacher » : mesuré sur la base réelle le 02/10/2026, 16 142 mails
   * « à classer » n'entrent dans AUCUNE file de tri, et 2 274 mails de la file sont déjà classés.
   */
  it('🔴🔴 il ne compte QUE les rattachements confirmés — jamais une proposition', () => {
    expect(sql()).not.toContain("r0.statut = 'propose'");
    expect(sql()).toContain("r0.statut = 'confirme'");
  });

  /**
   * 🔴 SANS LA MIGRATION, PAS UNE TABLE NOMMÉE. La règle du module : nommer une table absente ferait échouer TOUTE
   * la boîte — pas seulement ce dossier. Le dépôt l'a déjà payé (les six compteurs disparus du 27/09/2026).
   */
  it('🔴🔴 sans les migrations 257 / 266 / 281, aucune de ces tables n’est nommée', () => {
    const nu = sql({ rattachements: false, horsGestion: false, interne: false });
    expect(nu).not.toContain('gestion_rattachement');
    expect(nu).not.toContain('gestion_hors_gestion');
    expect(nu).not.toContain('gestion_fil_interne');
    // …et chaque sonde se lève SEULE, sans entraîner les deux autres.
    expect(sql({ horsGestion: false, interne: false })).toContain('gestion_rattachement');
    expect(sql({ horsGestion: false, interne: false })).not.toContain('gestion_fil_interne');
  });

  /**
   * 🔴🔴 LE COMPTE POSE LE MÊME PRÉDICAT QUE LA PAGE. Sans cela, la colonne annoncerait « 1–25 sur N » pour une
   * liste qui n'en montre pas N — le défaut du lot LISTE-PAGINATION, et on ne le refait pas.
   */
  it('🔴🔴 le COMPTE et la PAGE posent le même prédicat, au caractère près', () => {
    const page = sqlPageBoite(false, ETIQ, false, false, null, false, true, true, null, false, true)
      .replace(/\s+/g, ' ');
    const compte = sqlCompteBoite(false, ETIQ, false, false, null, false, null, false, 1, true, true, true)
      .replace(/\s+/g, ' ');
    for (const morceau of [
      "r0.statut = 'confirme'", `r0.cible_sorte IN (${sqlSortesBien()})`,
      'gestion_fil_interne i0', 'gestion_hors_gestion h0',
    ]) {
      expect(page).toContain(morceau);
      expect(compte).toContain(morceau);
    }
  });

  /**
   * ⚠️ LES AUTRES ÉTIQUETTES NE BOUGENT PAS D'UN CARACTÈRE. C'est ce qui permet d'ajouter ce dossier sans toucher
   * aux épreuves de forme existantes — et surtout sans changer ce que montrent les six autres listes.
   */
  it('⚠️ aucune autre étiquette n’est touchée par ce dossier', () => {
    for (const sorte of ['reception', 'envoyes', 'automatique', 'spam', 'corbeille', 'a_classer'] as const) {
      const s = sqlPageBoite(false, { sorte, evenementId: null }, true, true, null, false, true, true, null, false, true);
      expect(s).not.toContain('r0.');
      expect(s).not.toContain('i0.');
      expect(s).not.toContain('h0.');
    }
    // 🔴 ET « a_classer » RESTE LE POSTE DE TRI : sa règle est l'ÉTAT de l'échange, pas la pastille d'un mail.
    const posteDeTri = sqlPageBoite(false, { sorte: 'a_classer', evenementId: null }, false, false, null, false,
      true, true, null, false, true).replace(/\s+/g, ' ');
    expect(posteDeTri).toContain("f0.etat = 'a_classer'");
  });
});
