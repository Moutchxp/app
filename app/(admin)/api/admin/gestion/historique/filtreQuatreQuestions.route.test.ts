import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT FILTRE-A-LA-ROUTE — LES QUATRE QUESTIONS DE L'ÉCRAN PASSENT PAR LA MÊME RÈGLE ═══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026), à l'écran et non en base : « sans le filtre, 9 mails portent “Événement ouvert” ;
 * avec le filtre activé, le listing n'en montre que 5. La frise affiche “oct. 0” au lieu de 1. Ta mesure SQL
 * (9 = 9) ne correspond donc pas à ce que l'écran reçoit. »
 *
 * 🔴🔴 CE QUI MANQUAIT, ET C'EST TOUTE LA RAISON D'ÊTRE DE CE FICHIER. Le lot précédent avait mesuré la règle en
 * appelant les fonctions du dépôt À LA MAIN (`pageHistorique`, `enteteHistorique`) — jamais LES ROUTES que
 * l'écran interroge vraiment. Une mesure qui contourne la route ne prouve rien de ce que l'écran reçoit :
 * l'écran passe par `GET`, par la lecture des paramètres d'adresse, par `etendreCible`, et il interroge TROIS
 * routes, pas une. Ce fichier appelle les trois, avec et sans le filtre.
 *
 * ═══ 🔴🔴 CE QU'IL ÉPROUVE : UN SEUL CODE POUR LES QUATRE QUESTIONS ════════════════════════════════════════════
 *
 * L'écran pose quatre questions sur la même sélection, et une seule d'entre elles se voyait : le LISTING. Les
 * trois autres — le COMPTEUR d'en-tête, la FRISE par mois, le RÉSUMÉ DES PIÈCES — se lisent ailleurs sur la
 * page, et c'est par là que le désaccord d'Arno s'est vu (« oct. 0 » au lieu de 1). Ce fichier capture le SQL
 * que chacune des quatre émet RÉELLEMENT, et exige que la condition du filtre y soit, la MÊME, au caractère
 * près — celle que `sqlFiltreEvenementOuvert` fabrique à partir des requêtes de l'étiquette.
 *
 * ⚠️ POURQUOI PAR LE SQL ÉMIS ET NON PAR LES LIGNES RENDUES. Il n'y a pas de base dans cette épreuve-ci : le
 * pilote est remplacé par un enregistreur. L'égalité des ENSEMBLES, elle, se mesure sur la vraie base et sur les
 * vraies routes — c'est `filtreEvenementOuvert.itest.ts`, qui demande « 9 avec le filtre, 9 étiquetés sans ».
 * Les deux épreuves sont complémentaires : celle-ci tourne dans `npm test` à chaque chantier et interdit qu'une
 * des quatre questions reparte avec sa propre règle ; l'autre vérifie le résultat sur les données réelles.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Tout le SQL émis pendant un appel, dans l'ordre. C'est le seul instrument de ce fichier. */
const emis: string[] = [];

vi.mock('../../../../../lib/db/client', () => ({
  query: async (sql: string) => {
    emis.push(sql);
    /* ⚠️ LES SONDES DE SCHÉMA RÉPONDENT « OUI » : sans elles, le module choisit son SQL le plus ancien et l'on
       éprouverait une requête que la production n'émet pas. Voir `schema.ts` — « on demande à la base ce qu'elle
       sait faire, et on choisit le SQL AVANT de l'émettre ». */
    if (sql.includes('information_schema')) return { rows: [{ n: 1 }], rowCount: 1 };
    /* Le logement existe : `etendreCible` doit rendre « ok », sinon la route s'arrête avant les quatre
       questions et ce fichier n'éprouverait rien du tout. */
    if (sql.includes('FROM gestion_annuaire_lot lo')) {
      return {
        rows: [{
          prop: null, prop_nom: null, adresse: '67 rue de Normandie', cp: '92400',
          commune: 'COURBEVOIE', nature: null, type_bien: null, absent: false,
        }],
        rowCount: 1,
      };
    }
    /* ⚠️ UN AGRÉGAT REND TOUJOURS UNE LIGNE, et `compter` la lit sans détour (`rows[0].mails`). Le pilote
       d'épreuve doit donc se comporter comme PostgreSQL ici, sans quoi la route tombe en 503 pour une raison
       qui n'a rien à voir avec ce qu'on éprouve. */
    if (sql.includes('AS mails') && sql.includes('AS pieces')) {
      return { rows: [{ mails: '0', pieces: '0', premier: null, dernier: null }], rowCount: 1 };
    }
    // Tout le reste : aucune ligne. On veut le SQL, pas des données.
    return { rows: [], rowCount: 0 };
  },
  withTransaction: async () => { throw new Error('ce fichier est en lecture seule'); },
}));

vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../lib/admin/session', () => ({ lireSession: async () => null }));

import { GET as GET_HISTORIQUE } from './route';
import { GET as GET_FRISE } from './frise/route';
import { GET as GET_PIECES } from './pieces/route';
import { sqlFiltreEvenementOuvert } from '../../../../../lib/gestion/historiqueRepo';

/** L'adresse que l'écran appelle vraiment, relevée dans l'onglet Réseau de Chrome le 07/10/2026. */
const URL_BASE = 'http://local/api/admin/gestion/historique?taille=100&cible=lot-315';
const URL_FILTRE = 'http://local/api/admin/gestion/historique?evt=ouvert&taille=100&cible=lot-315';

/** La condition telle que le dépôt la fabrique — jamais recopiée ici, sinon on éprouverait sa copie. */
const CONDITION = sqlFiltreEvenementOuvert(true);

async function sqlDe(appel: () => Promise<Response>): Promise<string[]> {
  emis.length = 0;
  const res = await appel();
  expect(res.status).toBe(200);
  expect((await res.json()).etat).toBe('ok');
  return [...emis];
}

beforeEach(() => { emis.length = 0; });

describe('🔴🔴 le filtre arrive par la ROUTE, et pas seulement par les fonctions du dépôt', () => {
  it('🔴🔴 `evt=ouvert` dans l’adresse ⇒ la condition est dans le SQL du listing', async () => {
    const sql = await sqlDe(() => GET_HISTORIQUE(new Request(URL_FILTRE)));
    expect(sql.some((s) => s.includes(CONDITION))).toBe(true);
  });

  it('⚠️ sans `evt=ouvert`, aucune des requêtes ne la porte — le filtre est bien un filtre', async () => {
    const sql = await sqlDe(() => GET_HISTORIQUE(new Request(URL_BASE)));
    expect(sql.some((s) => s.includes(CONDITION))).toBe(false);
    // Et aucun reste de l'ancienne règle par fil, qui ne connaissait ni le bien ni la fenêtre.
    expect(sql.some((s) => s.includes("af.fil_id = m.fil_id AND af.actif"))).toBe(false);
  });

  /**
   * ══ 🔴🔴 LE COMPTEUR D'EN-TÊTE — « Historique du bien 9 » ═══════════════════════════════════════════════════
   *
   * La route pose DEUX fois la question du compteur : la sélection FILTRÉE et le TOTAL du bien (« 9 sur 140 »).
   * Exactement une des deux doit porter la condition. Les deux la porteraient ⇒ le total mentirait ; aucune ⇒
   * le compteur annoncerait 140 au-dessus d'une liste de 9, ce qu'Arno a vu sous une autre forme.
   */
  it('🔴🔴 le compteur : la sélection filtrée la porte, le total ne la porte pas', async () => {
    const sql = await sqlDe(() => GET_HISTORIQUE(new Request(URL_FILTRE)));
    const compteurs = sql.filter((s) => s.includes('AS mails') && s.includes('AS pieces'));
    expect(compteurs.length).toBe(2);
    expect(compteurs.filter((s) => s.includes(CONDITION)).length).toBe(1);
  });

  /**
   * 🔴🔴 LA FRISE — c'est elle qui disait « oct. 0 » quand le listing en montrait 5. Elle vit dans SA PROPRE
   * ROUTE : une règle corrigée dans `/historique` seul l'aurait laissée en arrière, et le désaccord se serait
   * simplement déplacé.
   */
  it('🔴🔴 la frise, dans sa propre route, porte la MÊME condition', async () => {
    const sql = await sqlDe(() => GET_FRISE(new Request(URL_FILTRE.replace('/historique?', '/historique/frise?'))));
    expect(sql.some((s) => s.includes(CONDITION))).toBe(true);
  });

  /** 🔴 LE RÉSUMÉ DES PIÈCES — troisième route, même exigence : « 1 pièce » doit parler de la même sélection. */
  it('🔴 le résumé des pièces, dans sa propre route, porte la MÊME condition', async () => {
    const sql = await sqlDe(() => GET_PIECES(new Request(URL_FILTRE.replace('/historique?', '/historique/pieces?'))));
    expect(sql.some((s) => s.includes(CONDITION))).toBe(true);
  });

  /**
   * ══ 🔴🔴 UN SEUL CODE : LES QUATRE ENVOIENT LE MÊME TEXTE ═════════════════════════════════════════════════
   *
   * C'est la demande d'Arno, mot pour mot : « que le listing, le compteur, la frise et le résumé des pièces
   * utilisent tous la même règle (un seul code) ». On ne vérifie pas qu'ils filtrent « pareil » : on vérifie
   * qu'ils envoient LE MÊME TEXTE, celui que `sqlFiltreEvenementOuvert` fabrique à partir des deux requêtes de
   * l'étiquette. Deux textes qui se ressemblent finissent par ne plus se ressembler.
   */
  it('🔴🔴 listing, compteur, frise et pièces envoient le MÊME texte, à la lettre', async () => {
    const quatre = [
      ...await sqlDe(() => GET_HISTORIQUE(new Request(URL_FILTRE))),
      ...await sqlDe(() => GET_FRISE(new Request(URL_FILTRE.replace('/historique?', '/historique/frise?')))),
      ...await sqlDe(() => GET_PIECES(new Request(URL_FILTRE.replace('/historique?', '/historique/pieces?')))),
    ].filter((s) => s.includes('EXISTS ( SELECT 1 FROM (') || s.includes(CONDITION));
    // Listing + compteur filtré + interlocuteurs + frise + pièces : toutes les porteuses, et toutes identiques.
    expect(quatre.length).toBeGreaterThanOrEqual(4);
    for (const s of quatre) expect(s).toContain(CONDITION);
  });

  /**
   * ⚠️ ET LA CONDITION EST BIEN CELLE DE L'ÉTIQUETTE, pas une qui lui ressemble : elle nomme les deux voies.
   * La voie du fil (l'affectation qu'un humain a posée) ET la voie du bien avec la fenêtre d'ouverture — c'est
   * la seconde qui manquait au filtre, et ce sont ses quatre mails qu'Arno a vus disparaître.
   */
  it('⚠️ les deux voies de l’étiquette voyagent jusqu’à la base', async () => {
    const sql = (await sqlDe(() => GET_HISTORIQUE(new Request(URL_FILTRE)))).join('\n');
    expect(sql).toContain('ANY(ARRAY[m.fil_id])');
    expect(sql).toContain('ANY(ARRAY[m.id])');
    expect(sql).toContain('msg.recu_le >= ev.ouvert_le');
  });
});
