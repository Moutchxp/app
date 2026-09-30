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
// LOT ENVOI-DIAG — `nonRemiseDisponible: false` : la recherche demande les avis de non-remise de ses résultats, et
//   migration absente elle n'émet aucune requête. Les assertions portent donc sur le SQL d'avant ce lot.
vi.mock('./schema', () => ({
  // LOT BOITE-INTERNE-CORBEILLE — la 275 n'est pas le sujet de ce fichier : absente, la boîte est celle d'avant.
  corbeilleGmailDisponible: async () => false,
  rechercheTexteDisponible: async () => pleinTexte,
  nonRemiseDisponible: async () => false,
  // LOT ERGO-BOITE-3 — par défaut « migration 263 absente » : les assertions de ce fichier portent donc sur le SQL
  //   d'avant ce lot, et les cas de spam sont éprouvés là où ils sont posés explicitement.
  spamDisponible: async () => spamConnu,
  // LOT LISTE-GMAIL — migration 264 absente par défaut : `etoilesDesFils` rend alors un ensemble vide SANS rien
  //   demander à la base, et les assertions de ce fichier portent donc sur le SQL d'avant ce lot.
  etoileDisponible: async () => false,
  /**
   * 🔴 LOT ETOILE-ET-SIGNATURE — migration 277 absente par défaut : le filtre étoile lit alors encore
   * `gestion_fil_etoile` (l'étoile de l'équipe), et les assertions de ce fichier portent donc sur le SQL d'avant
   * ce lot. Les deux sources ne sont JAMAIS lues ensemble — c'est l'une OU l'autre.
   */
  etoileGmailDisponible: async () => false,
  /**
   * 🔴 LOT RECHERCHE-LIGNES — LES DEUX SONDES DE LA CAPSULE, absentes par défaut : les assertions de ce fichier
   * portent donc sur le SQL d'avant ce lot, mot pour mot. Les cas où elles sont là sont éprouvés en les posant
   * explicitement — c'est la convention de ce fichier depuis le spam et l'étoile.
   */
  rattachementsDisponibles: async () => rattachementsConnus,
  horsGestionDisponible: async () => horsGestionConnu,
}));

let pleinTexte = true;
let spamConnu = false;
let rattachementsConnus = false;
let horsGestionConnu = false;

import { chercherDansLeCourrier, conditions, decouperTermes, rechercheUtile, EXPRESSION_INDEXEE } from './rechercheBoite';

const sqlPage = () => String(queryMock.mock.calls.find((c) => String(c[0]).includes('WITH trouves'))?.[0] ?? '');
const paramsPage = () => (queryMock.mock.calls.find((c) => String(c[0]).includes('WITH trouves'))?.[1] ?? []) as unknown[];
const repond = (lignes: unknown[] = []) => {
  queryMock.mockReset();
  queryMock.mockImplementation(async (sql: string) =>
    (String(sql).includes('count(DISTINCT') ? { rows: [{ n: 0 }] } : { rows: lignes }));
};

beforeEach(() => {
  pleinTexte = true; spamConnu = false;
  rattachementsConnus = false; horsGestionConnu = false;
  queryMock.mockReset();
});

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
      nb_pieces: 0, reference: null, sans_suite: false,
    }]);
    const p = await chercherDansLeCourrier({ saisie: 'fuite' }, null, []);
    expect(p.lignes[0].filId).toBe(4242);
    expect(typeof p.lignes[0].filId).toBe('number');
    expect(p.lignes[0].messageTrouveId).toBe(7);
  });

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════
     🔴🔴 LOT RECHERCHE-LIGNES — UN RÉSULTAT EST UNE LIGNE DE COURRIER COMME LES AUTRES
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * 🔴🔴 LE DÉFAUT D'ARNO, ÉPROUVÉ LÀ OÙ IL NAISSAIT. « Il manque le trombone avec le nombre de pièces et la
   * capsule de statut. » Le composant de ligne était pourtant le même depuis toujours : ce sont ces trois
   * valeurs-là que la recherche rendait en dur — `piecesDuMessage: 0`, `piecesAilleurs: 0`, `classement: null` —
   * si bien que la ligne affichait fidèlement… rien.
   *
   * ⚠️ AVEC `0` ET `0`, IL N'Y AVAIT MÊME PAS DE TROMBONE GRIS : `etatTrombone(0, 0)` rend « aucune ». Le
   * commentaire d'alors annonçait un trombone gris ; l'écran n'en montrait aucun.
   */
  it('🔴 un résultat porte ses PIÈCES, comme une ligne de liste', async () => {
    queryMock.mockReset();
    queryMock.mockImplementation(async (sql: string) => {
      const q = String(sql);
      if (q.includes('count(DISTINCT')) return { rows: [{ n: 0 }] };
      // La lecture des pièces, partagée avec la liste : deux pièces sur le message trouvé, une ailleurs.
      if (q.includes('FROM gestion_piece p')) {
        return { rows: [
          { fil_id: '4242', message_id: '7', nom_fichier: 'bail.pdf', type_mime: 'application/pdf', taille_octets: '90000' },
          { fil_id: '4242', message_id: '7', nom_fichier: 'edl.pdf', type_mime: 'application/pdf', taille_octets: '80000' },
          { fil_id: '4242', message_id: '9', nom_fichier: 'quittance.pdf', type_mime: 'application/pdf', taille_octets: '70000' },
        ] };
      }
      return { rows: [{
        fil_id: '4242', message_id: 7, objet: 'Fuite', objet_trouve: 'Re: Fuite',
        interlocuteur: 'Mme M.', interlocuteur_adresse: 'm@x.fr', dernier_sens: 'recu',
        dernier_le: '2026-09-20T08:00:00Z', extrait: 'bonjour', nb_messages: 3, nb_lisibles: 3,
        nb_pieces: 3, reference: null, sans_suite: false,
      }] };
    });
    const p = await chercherDansLeCourrier({ saisie: 'fuite' }, null, []);
    expect(p.lignes[0].piecesDuMessage).toBe(2);
    expect(p.lignes[0].piecesAilleurs).toBe(1);
  });

  /**
   * 🔴 LA CAPSULE VIENT DES MÊMES JOINTURES QUE LA LISTE — importées, jamais recopiées : deux écritures de
   * « qu'est-ce qu'un échange classé ? » finiraient par ne plus dire la même chose.
   */
  it('🔴 un résultat porte sa CAPSULE de statut', async () => {
    rattachementsConnus = true;
    horsGestionConnu = true;
    repond([{
      fil_id: '4242', message_id: 7, objet: 'Fuite', objet_trouve: 'Re: Fuite',
      interlocuteur: 'Mme M.', interlocuteur_adresse: 'm@x.fr', dernier_sens: 'recu',
      dernier_le: '2026-09-20T08:00:00Z', extrait: 'bonjour', nb_messages: 3, nb_lisibles: 3,
      nb_pieces: 0, reference: null, sans_suite: false,
      cl_n: 1, cl_humain: true, cl_detail: 'lot 219 — à la main',
      hg_marque: false, hg_motif: null,
    }]);
    const p = await chercherDansLeCourrier({ saisie: 'fuite' }, null, []);
    expect(p.lignes[0].classement).toEqual({ nbActifs: 1, parUnHumain: true, detail: 'lot 219 — à la main' });
    expect(p.lignes[0].horsGestion).toBe(false);
    // Et les jointures sont bien celles de la liste : le SQL les porte.
    const sql = sqlPage().replace(/\s+/g, ' ');
    expect(sql).toContain('cl.n AS cl_n');
    expect(sql).toContain('gestion_rattachement r');
    expect(sql).toContain('gestion_hors_gestion h');
  });

  /**
   * ⚠️ SANS LES MIGRATIONS, RIEN N'EST INVENTÉ — et les tables ne sont NOMMÉES NULLE PART : la requête est mot
   * pour mot celle d'avant, et la ligne n'affiche simplement pas de capsule. `null` se lit « je ne sais pas »,
   * jamais « à classer ».
   */
  it('🔴 sonde absente ⇒ aucune capsule, et aucune table nommée', async () => {
    repond([{
      fil_id: '4242', message_id: 7, objet: 'Fuite', objet_trouve: null,
      interlocuteur: 'Mme M.', interlocuteur_adresse: 'm@x.fr', dernier_sens: 'recu',
      dernier_le: '2026-09-20T08:00:00Z', extrait: 'bonjour', nb_messages: 1, nb_lisibles: 1,
      nb_pieces: 0, reference: null, sans_suite: false,
      cl_n: null, cl_humain: null, cl_detail: null, hg_marque: null, hg_motif: null,
    }]);
    const p = await chercherDansLeCourrier({ saisie: 'fuite' }, null, []);
    expect(p.lignes[0].classement).toBeNull();
    expect(sqlPage()).not.toContain('gestion_rattachement');
    expect(sqlPage()).not.toContain('gestion_hors_gestion');
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

  it('la normalisation des accents est celle du module PARTAGÉ, pas une copie', () => {
    const src = readFileSync('app/lib/gestion/rechercheBoite.ts', 'utf8');
    // LOT 5c-fix — elle vient désormais de `rechercheTermes`, le module PUR que le navigateur peut aussi charger :
    //   une seule table d'accents pour les deux côtés de la frontière, sinon « Marceau » se trouverait d'un seul côté.
    expect(src).toContain("from './rechercheTermes'");
    expect(src).not.toContain('àâäáãå');
  });

  /**
   * 🔴 LOT 5c-fix — LA FRONTIÈRE CLIENT / SERVEUR, après l'incident du 24/09/2026 : ce fichier porte le SQL, donc `pg`,
   * donc `dns`. Un composant `'use client'` qui l'importe fait échouer la construction de TOUTE l'application.
   * Le garde de graphe (`clientBoundary.guard.test.ts`) le prouve sur le dépôt entier ; ces deux-ci disent l'intention
   * à l'endroit où quelqu'un serait tenté de refaire l'erreur.
   */
  describe('la frontière client / serveur', () => {
    it('le module PUR n’importe RIEN — c’est ce qui le rend chargeable par le navigateur', () => {
      const pur = readFileSync('app/lib/gestion/rechercheTermes.ts', 'utf8');
      expect(pur.split('\n').filter((l) => /^\s*import\b/.test(l))).toEqual([]);
    });

    it('le composant de la boîte importe le module PUR, jamais celui qui porte le SQL', () => {
      const ecran = readFileSync('app/(admin)/admin/(protected)/gestion/BoiteMail.tsx', 'utf8');
      expect(ecran).toContain("from '../../../../lib/gestion/rechercheTermes'");
      // Un `import type` serait effacé à la compilation ; un import de VALEUR, non — c'est celui-là qui a tout cassé.
      expect(/^\s*import\s+(?!type\b)[^;]*from\s+'[^']*rechercheBoite'/m.test(ecran)).toBe(false);
    });
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT RECHERCHE-AVANCEE — LES QUATRE RÉGLAGES DU PANNEAU, ÉPROUVÉS SUR LE COMPORTEMENT

   ⚠️ ON N'ASSERTE PAS LA FORME DU SQL. Ni regex sur le WHERE complet, ni ordre des conditions : ce sont des choses
   qui changent au premier reformatage. On éprouve (1) ce qui est passé en PARAMÈTRE LIÉ, (2) la présence de
   FRAGMENTS SÉMANTIQUES sur une chaîne dont les espaces sont normalisés. C'est la règle d'écriture du dépôt.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */
const plat = (sql: string) => sql.replace(/\s+/g, ' ');

describe('LOT RECHERCHE-AVANCEE — « ne contient pas »', () => {
  /**
   * 🔴 LE TEST QUI PROTÈGE LA PERFORMANCE, pas seulement le résultat. Écrite en deux conditions séparées
   * (`… @@ 'fuite'` puis `NOT (… @@ 'facture')`), cette recherche prenait 2,8 s : la négation ne peut pas être
   * servie par l'index GIN, donc `to_tsvector` était RECALCULÉ sur 100 000 caractères par candidat. Fondue dans la
   * même `websearch_to_tsquery` (`fuite -facture`), elle prend 11 ms — mesuré sur les 56 000 messages réels.
   * Si quelqu'un rescinde un jour les deux conditions, ce test rougit AVANT que la lenteur ne revienne.
   */
  it('voyage DANS la même requête indexée que l’inclusion, jamais dans un NOT séparé', () => {
    const { sql, params } = conditions({ saisie: 'fuite', sansMots: 'facture' }, true);
    expect(params).toContain('fuite -facture');
    expect(plat(sql.join(' '))).toContain('websearch_to_tsquery');
    // La marque du défaut qu'on ne veut plus : une négation posée à part.
    expect(plat(sql.join(' '))).not.toContain('NOT (to_tsvector');
  });

  it('plusieurs mots exclus s’additionnent en « ni l’un ni l’autre »', () => {
    const { params } = conditions({ saisie: 'bail', sansMots: 'facture relance' }, true);
    expect(params).toContain('bail -facture -relance');
  });

  it('une expression exacte exclue garde ses guillemets', () => {
    const { params } = conditions({ saisie: 'bail', sansMots: '"sans suite"' }, true);
    expect(params).toContain('bail -"sans suite"');
  });

  /**
   * SANS AUCUN MOT POSITIF, l'exclusion ne peut pas voyager avec quoi que ce soit : elle passe alors par `LIKE`,
   * MÊME en plein texte. Une `tsquery` purement négative n'est servie par aucun index et ferait revenir la lenteur.
   */
  it('sans mot à inclure, l’exclusion passe par LIKE — jamais par une tsquery purement négative', () => {
    const { sql, params } = conditions({ saisie: '', sansMots: 'facture', du: '2026-01-01' }, true);
    const s = plat(sql.join(' '));
    expect(s).toContain('NOT (');
    expect(s).not.toContain('websearch_to_tsquery');
    expect(params).toContain('facture');
  });

  it('en mode réduit aussi, l’exclusion retire dès qu’UN mot est présent (OU nié, pas ET)', () => {
    const { sql } = conditions({ saisie: 'bail', sansMots: 'facture relance' }, false);
    const negation = plat(sql.join(' ')).match(/NOT \((.*?)\)\s*$/)?.[1] ?? plat(sql.join(' '));
    expect(negation).toContain(' OR ');
  });
});

describe('LOT RECHERCHE-AVANCEE — les listes où chercher', () => {
  it('sans listes, le critère se comporte EXACTEMENT comme avant le lot', () => {
    expect(plat(conditions({ saisie: 'fuite' }, true).sql.join(' '))).toContain('m.exclu_le IS NULL');
    expect(plat(conditions({ saisie: 'fuite', inclureAutomatiques: true }, true).sql.join(' ')))
      .not.toContain('m.exclu_le IS NULL');
  });

  it('« Réception » seule ne ramène que du courrier reçu et ordinaire', () => {
    const s = plat(conditions({ saisie: 'fuite', listes: ['reception'] }, true).sql.join(' '));
    expect(s).toContain("m.sens = 'recu'");
    expect(s).not.toContain("m.sens = 'envoye'");
    expect(s).toContain('m.exclu_le IS NULL');
  });

  it('« Courrier automatique » coché ramène ce que les règles ont écarté, quel qu’en soit le sens', () => {
    const s = plat(conditions({ saisie: 'fuite', listes: ['automatique'] }, true).sql.join(' '));
    expect(s).toContain('m.exclu_le IS NOT NULL');
    expect(s).not.toContain("m.sens =");
  });

  it('deux listes se cumulent en OU, pas en ET — sinon aucun message ne pourrait être les deux', () => {
    const s = plat(conditions({ saisie: 'fuite', listes: ['reception', 'envoyes'] }, true).sql.join(' '));
    expect(s).toMatch(/recu.*OR.*envoye/);
  });

  /** 🔴 AUCUNE CASE ⇒ AUCUN RÉSULTAT. Rendre « tout » ferait le contraire exact de ce qui est demandé. */
  it('aucune liste cochée ne ramène RIEN, et ne ramène pas « tout »', () => {
    expect(plat(conditions({ saisie: 'fuite', listes: [] }, true).sql.join(' '))).toContain('false');
  });

  /** « Brouillons » ne vit pas dans cette table : cocher lui seul ne rend aucun MESSAGE, et c'est juste. */
  it('« Brouillons » seul ne ramène aucun message de la table des messages', () => {
    expect(plat(conditions({ saisie: 'fuite', listes: ['brouillons'] }, true).sql.join(' '))).toContain('false');
  });
});

describe('LOT RECHERCHE-AVANCEE — pièce jointe et période', () => {
  it('« Avec » exige une pièce, « Sans » l’interdit, « Indifférent » n’écrit rien', () => {
    expect(plat(conditions({ saisie: 'bail', piece: 'avec' }, true).sql.join(' ')))
      .toContain('EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
    expect(plat(conditions({ saisie: 'bail', piece: 'sans' }, true).sql.join(' ')))
      .toContain('NOT EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)');
    expect(plat(conditions({ saisie: 'bail', piece: 'indifferent' }, true).sql.join(' ')))
      .not.toContain('gestion_piece');
  });

  it('la période est INCLUSE des deux côtés, et ses bornes sont des paramètres liés', () => {
    const { sql, params } = conditions({ saisie: 'bail', du: '2026-01-01', au: '2026-03-31' }, true);
    const s = plat(sql.join(' '));
    expect(s).toContain('m.recu_le >=');
    expect(s).toContain("interval '1 day'"); // le dernier jour compte en ENTIER
    expect(params).toContain('2026-01-01');
    expect(params).toContain('2026-03-31');
  });
});

describe('LOT RECHERCHE-AVANCEE — le compte du courrier automatique masqué suit les CASES', () => {
  /**
   * 🔴 LE DÉFAUT QU'IL ATTRAPE. Le compte se fait en comparant deux critères, l'un « avec » et l'autre « sans »
   * automatique. Tant qu'on ne touchait que `inclureAutomatiques`, un critère portant des `listes` ne bougeait pas
   * d'un iota (`automatiquesInclus` lit la case en priorité) : les deux comptes étaient identiques et l'écran
   * annonçait éternellement « 0 résultat masqué », en silence. C'est le pire genre de défaut — celui qui se tait.
   */
  it('les deux comptes diffèrent quand les listes portent la décision', async () => {
    repond([]);
    await chercherDansLeCourrier({ saisie: 'fuite', listes: ['reception'] }, null, [], 5);
    const comptes = queryMock.mock.calls.filter((c) => String(c[0]).includes('count(DISTINCT')).map((c) => plat(String(c[0])));
    expect(comptes).toHaveLength(2);
    expect(comptes.filter((s) => s.includes('m.exclu_le IS NOT NULL'))).toHaveLength(1);
  });
});
