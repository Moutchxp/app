import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * LOT 5c — CHERCHER DANS TOUT LE COURRIER. Trois choses peuvent mal tourner ici, et chacune est éprouvée :
 *   ① une valeur saisie qui finirait CONCATÉNÉE dans le SQL — c'est la seule faille qui compte vraiment ;
 *   ② l'expression du code qui DIVERGE de celle de l'index : PostgreSQL cesse alors de l'utiliser SANS rien dire, et
 *      la recherche passe de 10 ms à 6 secondes. Mesuré : c'est arrivé pendant l'écriture de ce lot ;
 *   ③ une recherche qui échoue en silence quand la migration n'est pas appliquée, au lieu de le dire.
 */

const queryMock = vi.fn();
vi.mock('../db/client', () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock('./schema', () => ({ rechercheTexteDisponible: async () => pleinTexte }));

let pleinTexte = true;

import { chercherDansLeCourrier, conditions, decouperTermes, rechercheUtile, EXPRESSION_INDEXEE } from './rechercheBoite';

const sqlPage = () => String(queryMock.mock.calls.find((c) => String(c[0]).includes('WITH trouves'))?.[0] ?? '');
const paramsPage = () => (queryMock.mock.calls.find((c) => String(c[0]).includes('WITH trouves'))?.[1] ?? []) as unknown[];
const repond = (lignes: unknown[] = []) => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) =>
    (String(sql).includes('count(DISTINCT') ? { rows: [{ n: 0 }] } : { rows: lignes }));
};

beforeEach(() => { pleinTexte = true; queryMock.mockReset(); });

describe('① découper la saisie, comme une messagerie', () => {
  it('plusieurs mots → plusieurs termes, tous exigés', () => {
    expect(decouperTermes('fuite marceau')).toEqual([
      { texte: 'fuite', exact: false }, { texte: 'marceau', exact: false },
    ]);
  });

  it('les accents et la casse sont retirés des DEUX côtés', () => {
    expect(decouperTermes('FENÊTRE')).toEqual([{ texte: 'fenetre', exact: false }]);
    expect(decouperTermes('Gaëlle')).toEqual([{ texte: 'gaelle', exact: false }]);
  });

  it('les guillemets font une EXPRESSION exacte, qui ne se découpe pas', () => {
    expect(decouperTermes('"avenue Marceau" fuite')).toEqual([
      { texte: 'avenue marceau', exact: true }, { texte: 'fuite', exact: false },
    ]);
  });

  it('un mot d’une seule lettre est ignoré : il ne filtrerait rien et ferait balayer la table', () => {
    expect(decouperTermes('a fuite')).toEqual([{ texte: 'fuite', exact: false }]);
  });

  it('une saisie vide ou faite d’espaces ne donne aucun terme', () => {
    for (const v of ['', '   ', '""', ' " " ']) expect(decouperTermes(v)).toEqual([]);
  });

  it('le nombre de termes est BORNÉ : au-delà on ne cherche plus, on fabrique du coût', () => {
    expect(decouperTermes('un deux trois quatre cinq six sept huit neuf dix')).toHaveLength(8);
  });

  it('une recherche est « utile » dès qu’un mot OU un filtre est posé', () => {
    expect(rechercheUtile({ saisie: '' })).toBe(false);
    expect(rechercheUtile({ saisie: 'x' })).toBe(false);            // une seule lettre ne compte pas
    expect(rechercheUtile({ saisie: 'fuite' })).toBe(true);
    expect(rechercheUtile({ saisie: '', expediteur: 'martin' })).toBe(true);
    expect(rechercheUtile({ saisie: '', du: '2026-01-01' })).toBe(true);
  });
});

describe('🔴 ② toute valeur saisie passe en PARAMÈTRE LIÉ', () => {
  it('les mots ne sont jamais dans le SQL, seulement dans les paramètres', () => {
    const { sql, params } = conditions({ saisie: 'fuite marceau' }, true);
    expect(sql.join(' ')).not.toContain('fuite');
    expect(params).toContain('fuite marceau');
  });

  it('une saisie hostile ne peut rien injecter — elle reste une valeur', () => {
    const hostile = "'; DROP TABLE gestion_message; --";
    const { sql, params } = conditions({ saisie: hostile }, true);
    expect(sql.join(' ')).not.toContain('DROP');
    expect(params.some((p) => String(p).includes('drop table'))).toBe(true); // normalisée, mais LIÉE
  });

  it('les dates et l’expéditeur aussi', () => {
    const { sql, params } = conditions({ saisie: '', du: '2026-01-01', au: '2026-03-31', expediteur: 'Martin' }, true);
    expect(sql.join(' ')).not.toContain('2026-01-01');
    expect(params).toContain('2026-01-01');
    expect(params).toContain('2026-03-31');
    expect(params).toContain('martin');
  });

  it('les caractères spéciaux ne cassent rien et restent des valeurs', () => {
    const { params } = conditions({ saisie: "o'brien 100% <script> _x" }, true);
    expect(params).toHaveLength(1);
    expect(String(params[0])).toContain("o'brien");
  });
});

describe('③ les deux régimes, et aucun qui mente', () => {
  it('PLEIN TEXTE : la saisie ENTIÈRE va à `websearch_to_tsquery` (c’est lui qui lit les guillemets)', () => {
    const { sql, params } = conditions({ saisie: '"avenue marceau" fuite' }, true);
    expect(sql.join(' ')).toContain("websearch_to_tsquery('french'");
    expect(params[0]).toBe('"avenue marceau" fuite');
  });

  it('MODE RÉDUIT : un morceau par terme, tous exigés — plus lent, mais il trouve', () => {
    const { sql, params } = conditions({ saisie: 'fuite marceau' }, false);
    expect(sql.join(' ')).not.toContain('websearch_to_tsquery');
    expect((sql.join(' ').match(/LIKE/g) ?? []).length).toBe(2);
    expect(params).toEqual(['fuite', 'marceau']);
  });

  it('la réponse DIT dans quel régime elle est — l’écran ne fait jamais semblant', async () => {
    pleinTexte = false;
    repond([]);
    expect((await chercherDansLeCourrier({ saisie: 'fuite' }, null, [])).pleinTexte).toBe(false);
    pleinTexte = true;
    repond([]);
    expect((await chercherDansLeCourrier({ saisie: 'fuite' }, null, [])).pleinTexte).toBe(true);
  });
});

describe('le courrier automatique : même règle que la liste', () => {
  it('écarté par DÉFAUT', () => {
    expect(conditions({ saisie: 'fuite' }, true).sql.join(' ')).toContain('m.exclu_le IS NULL');
  });

  it('ramené sur demande explicite', () => {
    expect(conditions({ saisie: 'fuite', inclureAutomatiques: true }, true).sql.join(' ')).not.toContain('exclu_le');
  });

  it('le nombre de résultats masqués est compté, pour être dit en toutes lettres', async () => {
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('count(DISTINCT')) {
        // 1er appel = AVEC l'automatique, 2e = SANS. La différence est ce qu'on masque.
        const n = queryMock.mock.calls.filter((c) => String(c[0]).includes('count(DISTINCT')).length;
        return { rows: [{ n: n === 1 ? 120 : 30 }] };
      }
      return { rows: [] };
    });
    const p = await chercherDansLeCourrier({ saisie: 'fuite' }, null, []);
    expect(p.automatiquesMasques).toBe(90);
  });

  it('…et il n’est PAS recompté aux pages suivantes', async () => {
    repond([]);
    const p = await chercherDansLeCourrier({ saisie: 'fuite' }, { dernierLe: '2026-01-01T00:00:00Z', filId: '5' }, []);
    expect(p.automatiquesMasques).toBeNull();
  });
});

describe('les filtres se COMBINENT avec les mots', () => {
  it('mots + période + expéditeur : tout est exigé en même temps', () => {
    const { sql } = conditions({ saisie: 'fuite', du: '2026-01-01', au: '2026-03-31', expediteur: 'martin' }, true);
    expect(sql.join(' ')).toContain('websearch_to_tsquery');
    expect(sql.join(' ')).toContain('m.recu_le >=');
    expect(sql.join(' ')).toContain('m.recu_le <');
    expect(sql.join(' ')).toContain('m.de_adresse');
  });

  it('la période est INCLUSE des deux côtés : « au 31 mars » comprend le 31 en entier', () => {
    expect(conditions({ saisie: '', au: '2026-03-31' }, true).sql.join(' '))
      .toContain("+ interval '1 day'");
  });

  it('un filtre seul, sans mot, cherche quand même', () => {
    const { sql } = conditions({ saisie: '', expediteur: 'martin' }, true);
    expect(sql.join(' ')).not.toContain('websearch_to_tsquery');
    expect(sql.join(' ')).toContain('m.de_adresse');
  });
});

describe('un résultat = UN ÉCHANGE, pas un message', () => {
  it('on garde, par échange, le message trouvé le plus récent', async () => {
    repond([]);
    await chercherDansLeCourrier({ saisie: 'fuite' }, null, []);
    const sql = sqlPage().replace(/\s+/g, ' ');
    expect(sql).toContain('DISTINCT ON (m.fil_id)');
    expect(sql).toContain('ORDER BY m.fil_id, m.recu_le DESC, m.id DESC');
  });

  it('la pagination est par CURSEUR, jamais par OFFSET', async () => {
    repond([]);
    await chercherDansLeCourrier({ saisie: 'fuite' }, { dernierLe: '2026-08-01T09:00:00Z', filId: '412' }, []);
    expect(sqlPage().toUpperCase()).not.toContain('OFFSET');
    expect(paramsPage()).toContain('2026-08-01T09:00:00Z');
    expect(paramsPage()).toContain('412');
  });

  it('l’identifiant revient en NOMBRE (piège `bigint` de pg)', async () => {
    repond([{
      fil_id: '4242', message_id: 7, objet: 'Fuite', objet_trouve: 'Re: Fuite',
      interlocuteur: 'Mme M.', interlocuteur_adresse: 'm@x.fr', dernier_sens: 'recu',
      dernier_le: '2026-09-20T08:00:00Z', extrait: 'bonjour', nb_messages: 3, nb_lisibles: 3,
      a_piece: false, reference: null, sans_suite: false,
    }]);
    const p = await chercherDansLeCourrier({ saisie: 'fuite' }, null, []);
    expect(p.lignes[0].filId).toBe(4242);
    expect(typeof p.lignes[0].filId).toBe('number');
    expect(p.lignes[0].messageTrouveId).toBe(7);
  });

  it('recherche sans résultat : une page vide, aucune erreur', async () => {
    repond([]);
    const p = await chercherDansLeCourrier({ saisie: 'zzzintrouvable' }, null, []);
    expect(p.lignes).toEqual([]);
    expect(p.suivant).toBeNull();
  });
});

describe('🔴 l’expression du code et celle de l’index ne doivent JAMAIS diverger', () => {
  const migration = readFileSync('db/migrations/237_gestion_recherche_plein_texte.sql', 'utf8');
  /** Comparaison au caractère près, hors espaces et hors alias de table (l'index n'en a pas). */
  const n = (s: string) => s.replace(/\bm\./g, '').replace(/\s+/g, ' ').trim();

  it('l’expression indexée du code figure TELLE QUELLE dans la migration', () => {
    // Si ce test rougit, PostgreSQL n'utilisera plus l'index — sans erreur, sans avertissement, juste 600 fois plus
    //   lent. C'est exactement ce qui s'est produit pendant l'écriture de ce lot (un `coalesce` de trop).
    const debut = migration.indexOf('USING gin (');
    const fin = migration.indexOf('COMMENT ON INDEX');
    expect(n(migration.slice(debut, fin))).toContain(n(EXPRESSION_INDEXEE));
  });

  it('le corps HTML n’est JAMAIS indexé, et le corps texte est BORNÉ', () => {
    expect(EXPRESSION_INDEXEE).not.toContain('corps_html');
    expect(EXPRESSION_INDEXEE).toContain("left(coalesce(m.corps_texte, ''), 100000)");
    expect(n(migration)).toContain("left(coalesce(corps_texte, ''), 100000)");
  });

  it('la configuration de recherche est NOMMÉE en dur (sinon l’expression n’est pas indexable)', () => {
    expect(EXPRESSION_INDEXEE).toContain("to_tsvector('french'");
  });

  it('les accents passent par `translate`, pas par `unaccent` (qui n’est pas IMMUTABLE)', () => {
    expect(EXPRESSION_INDEXEE).toContain('translate(lower(');
    expect(EXPRESSION_INDEXEE).not.toContain('unaccent');
  });
});

describe('garanties STATIQUES', () => {
  it('ce dépôt ne fait QUE lire', () => {
    const src = readFileSync('app/lib/gestion/rechercheBoite.ts', 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/|--)/.test(l.trim())).join('\n');
    expect(/INSERT INTO|UPDATE\s+gestion_|DELETE\s+FROM|withTransaction/i.test(code)).toBe(false);
  });

  it('la normalisation des accents est celle du module, pas une copie', () => {
    const src = readFileSync('app/lib/gestion/rechercheBoite.ts', 'utf8');
    expect(src).toContain("from './recherche'");
    // Aucune table d'accents recopiée ici : une seconde copie divergerait un jour.
    expect(src).not.toContain('àâäáãå');
  });
});
