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
    if (String(sql).includes('count(DISTINCT fil_id)')) return { rows: [{ n: total }] };
    if (String(sql).includes('FILTER (WHERE lisibles > 0)')) return { rows: [{ lisibles: 4944, total: 17206 }] };
    return { rows: lignes };
  });
};
const paramsPage = () => (queryMock.mock.calls.findLast((c) => String(c[0]).includes('WITH page'))?.[1] ?? []) as unknown[];
/** Le PARCOURS seul (le CTE `page`) : c'est lui que le mode « courrier automatique » change. Le reste du SELECT compte
 *  toujours les messages lisibles, dans les deux modes — c'est voulu, et ça ne doit pas brouiller l'assertion. */
const parcours = (sql: string) => sql.slice(sql.indexOf('WITH page AS ('), sql.indexOf('LIMIT $3'));
const sqlPage = () => String(queryMock.mock.calls.findLast((c) => String(c[0]).includes('WITH page'))?.[0] ?? '');

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
    await expect(comptesBoite()).resolves.toEqual({ lisibles: 4944, automatiques: 17206 - 4944 });
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
