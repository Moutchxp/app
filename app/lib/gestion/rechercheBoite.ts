/**
 * MODULE « GESTION » — LOT 5c : CHERCHER DANS TOUT LE COURRIER. Lecture SEULE (aucun INSERT/UPDATE/DELETE ici).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEUX RÉGIMES, ET AUCUN QUI ÉCHOUE EN SILENCE.
 *   · migration 237 APPLIQUÉE → recherche plein texte servie par l'index GIN : radicaux du français (« fuites » trouve
 *     « fuite »), expressions exactes, et une réponse en quelques millisecondes sur 56 000 messages ;
 *   · migration 237 ABSENTE   → MODE RÉDUIT par `LIKE`, qui balaie. Plus lent, sans radicaux, mais il trouve — et
 *     l'écran DIT qu'il est en mode réduit. Une recherche qui ne marche pas est un défaut ; une recherche qui ne marche
 *     pas SANS LE DIRE est un piège.
 * La sonde de schéma est posée HORS TRANSACTION (règle du module depuis l'incident du lot 4a).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 TOUTE VALEUR SAISIE PASSE EN PARAMÈTRE LIÉ. Rien de ce que tape l'utilisateur n'est concaténé dans le SQL — ni les
 * mots, ni les dates, ni l'adresse d'expéditeur. `websearch_to_tsquery` reçoit la saisie ENTIÈRE comme un paramètre :
 * c'est lui qui interprète les guillemets et les espaces, et il ne peut rien produire d'autre qu'une requête de texte.
 */
import { query } from '../db/client';
import type { CurseurBoite, LigneBoite, PageBoite } from './boiteRepo';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';
import { normaliser, normSql } from './recherche';

/** Combien de résultats par page. Même pas que la boîte : on passe de l'une à l'autre sans changer de rythme. */
export const PAGE_RECHERCHE = 30;
/** Extrait BRUT rapporté du message trouvé. L'écran y met en évidence les mots cherchés. */
const LONGUEUR_EXTRAIT = 600;

/**
 * 🔴 CE QUI EST INDEXÉ — EXPRESSION RECOPIÉE À L'IDENTIQUE DEPUIS LA MIGRATION 237.
 *
 * Si ces deux chaînes divergent, ne serait-ce que d'un espace, PostgreSQL n'utilisera PAS l'index : il balaiera 41 Mo de
 * texte à chaque recherche, SANS erreur et sans avertissement. C'est le pire des défauts — celui qui ne se voit pas. Un
 * test compare les deux, pour qu'une divergence rougisse au lieu de ralentir.
 *
 * Le corps HTML n'y est pas (balisage, et jusqu'à 31,6 M de caractères), et le corps texte est borné à 100 000
 * caractères : au-delà d'1 Mo de lexèmes, PostgreSQL REFUSE d'écrire le `tsvector` — la relève échouerait sur un
 * message. Mesuré : le plus long corps texte de la boîte fait 68 248 caractères, la borne ne coupe rien aujourd'hui.
 */
export const EXPRESSION_INDEXEE = `to_tsvector('french', ${normSql(
  `coalesce(m.objet, '') || ' ' ||
        left(coalesce(m.corps_texte, ''), 100000) || ' ' ||
        coalesce(m.de_nom, '') || ' ' ||
        coalesce(m.de_adresse, '') || ' ' ||
        coalesce(m.destinataires, '') || ' ' ||
        coalesce(regexp_replace(coalesce(m.dest_a::text, '') || ' ' || coalesce(m.dest_cc::text, ''),
                                '"(nom|adresse)":|[][{}",]', ' ', 'g'), '')`,
)})`;

/** Le même texte, pour le MODE RÉDUIT : on y cherche des morceaux plutôt que des lexèmes. */
const TEXTE_CHERCHABLE = normSql(
  `coalesce(m.objet, '') || ' ' ||
        left(coalesce(m.corps_texte, ''), 100000) || ' ' ||
        coalesce(m.de_nom, '') || ' ' ||
        coalesce(m.de_adresse, '') || ' ' ||
        coalesce(m.destinataires, '') || ' ' ||
        coalesce(m.dest_a::text, '') || ' ' || coalesce(m.dest_cc::text, '')`,
);

/** Ce qu'on cherche. Tous les champs sont facultatifs ; tout ce qui est fourni se COMBINE (ET). */
export interface CritereRecherche {
  /** La saisie, telle quelle. Les guillemets y font une expression exacte, comme dans une messagerie. */
  saisie: string;
  /** Bornes de période, en ISO (`YYYY-MM-DD`). Incluses toutes les deux. */
  du?: string | null;
  au?: string | null;
  /** Fragment d'adresse ou de nom d'expéditeur. */
  expediteur?: string | null;
  /** Comme dans la liste : écarté par défaut, ramené sur demande. */
  inclureAutomatiques?: boolean;
}

/** Un terme cherché : un mot, ou une expression entre guillemets. */
export interface Terme { texte: string; exact: boolean }

/**
 * DÉCOUPE LA SAISIE en termes, comme le ferait une messagerie : ce qui est entre guillemets reste ensemble, le reste se
 * découpe aux espaces. Les termes sont NORMALISÉS (minuscules, accents retirés) — la même normalisation que celle de
 * l'index et que celle des cartes, donc « Marceau », « marceau » et « MARCEAU » sont un seul et même mot.
 *
 * Sert à DEUX choses : le mode réduit (un `LIKE` par terme) et la mise en évidence à l'écran. Le mode plein texte, lui,
 * confie la saisie entière à `websearch_to_tsquery`. PUR.
 */
export function decouperTermes(saisie: string): Terme[] {
  const termes: Terme[] = [];
  // Les guillemets d'abord : ce qu'ils entourent ne se découpe pas.
  const reste = saisie.replace(/"([^"]*)"/g, (_, contenu: string) => {
    const t = normaliser(contenu).trim();
    if (t !== '') termes.push({ texte: t, exact: true });
    return ' ';
  });
  for (const mot of normaliser(reste).split(/\s+/)) {
    const t = mot.trim();
    // Un mot d'une seule lettre ne filtre rien et ferait balayer toute la table pour rien.
    if (t.length >= 2) termes.push({ texte: t, exact: false });
  }
  // Borne de sûreté : au-delà, on n'affine plus une recherche, on fabrique une requête coûteuse.
  return termes.slice(0, 8);
}

/** Y a-t-il quelque chose à chercher ? Une saisie vide ou faite d'un seul caractère ne lance aucune requête. PUR. */
export function rechercheUtile(c: CritereRecherche): boolean {
  return decouperTermes(c.saisie).length > 0
    || (c.expediteur ?? '').trim() !== ''
    || (c.du ?? '') !== '' || (c.au ?? '') !== '';
}

/** Une ligne de résultat : la même forme qu'une ligne de boîte, plus le message qui a fait mouche. */
export interface LigneResultat extends LigneBoite {
  /** Identifiant du message trouvé — l'écran peut y revenir, et l'extrait vient de lui. */
  messageTrouveId: number;
  /** Objet du message trouvé, quand il diffère de celui de l'échange. */
  objetTrouve: string | null;
}

export interface PageRecherche extends Omit<PageBoite, 'lignes'> {
  lignes: LigneResultat[];
  /** `false` quand la migration 237 n'est pas appliquée : l'écran le DIT, il ne fait pas semblant. */
  pleinTexte: boolean;
  /** Résultats écartés parce qu'ils ne contiennent que du courrier automatique. Annoncé en toutes lettres. */
  automatiquesMasques: number | null;
}

interface LigneDB {
  fil_id: string; message_id: number; objet: string | null; objet_trouve: string | null;
  interlocuteur: string | null; interlocuteur_adresse: string | null;
  dernier_sens: string; dernier_le: string; extrait: string | null;
  nb_messages: number; nb_lisibles: number; a_piece: boolean; reference: string | null; sans_suite: boolean;
}

/**
 * Construit les conditions de filtrage et leurs paramètres LIÉS. Chaque valeur saisie devient un `$n`, jamais un
 * morceau de SQL — c'est la seule façon de rendre une injection impossible, et pas seulement improbable. PUR.
 */
export function conditions(c: CritereRecherche, pleinTexte: boolean): { sql: string[]; params: unknown[] } {
  const sql: string[] = [];
  const params: unknown[] = [];
  const lier = (v: unknown): string => { params.push(v); return `$${params.length}`; };

  if (c.inclureAutomatiques !== true) sql.push('m.exclu_le IS NULL');

  const termes = decouperTermes(c.saisie);
  if (termes.length > 0) {
    if (pleinTexte) {
      // La saisie ENTIÈRE, normalisée, confiée à `websearch_to_tsquery` : c'est lui qui comprend les guillemets et les
      //   espaces, exactement comme un champ de recherche de messagerie. Et il ne peut rien produire d'autre.
      sql.push(`${EXPRESSION_INDEXEE} @@ websearch_to_tsquery('french', ${lier(normaliser(c.saisie))})`);
    } else {
      // MODE RÉDUIT : un morceau par terme, tous exigés. Pas de radicaux, mais les accents et la casse sont couverts,
      //   et une expression entre guillemets se cherche telle quelle — mieux que le plein texte sur ce point précis.
      for (const t of termes) sql.push(`${TEXTE_CHERCHABLE} LIKE '%' || ${lier(t.texte)} || '%'`);
    }
  }

  const exp = (c.expediteur ?? '').trim();
  if (exp !== '') {
    sql.push(`(${normSql('m.de_adresse')} LIKE '%' || ${lier(normaliser(exp))} || '%'
           OR ${normSql('m.de_nom')} LIKE '%' || ${lier(normaliser(exp))} || '%')`);
  }
  // Période INCLUSE des deux côtés : « du 1er au 3 » comprend le 3 en entier, ce que tout le monde attend.
  if ((c.du ?? '') !== '') sql.push(`m.recu_le >= ${lier(c.du)}::date`);
  if ((c.au ?? '') !== '') sql.push(`m.recu_le < (${lier(c.au)}::date + interval '1 day')`);

  return { sql, params };
}

/**
 * UNE PAGE DE RÉSULTATS. Un résultat = UN ÉCHANGE, jamais un message isolé : chercher « fuite » dans une conversation
 * de douze messages doit rendre UNE ligne, pas douze. On garde, par échange, le message trouvé LE PLUS RÉCENT — c'est
 * lui qui date le résultat et qui fournit l'extrait.
 */
export async function chercherDansLeCourrier(
  critere: CritereRecherche,
  curseur: CurseurBoite | null,
  partenaires: readonly PartenaireInterne[] = [],
  limite = PAGE_RECHERCHE,
): Promise<PageRecherche> {
  const { rechercheTexteDisponible } = await import('./schema');
  const pleinTexte = await rechercheTexteDisponible();
  const aLire = Math.min(Math.max(1, limite), 100) + 1;

  const { sql: filtres, params } = conditions(critere, pleinTexte);
  const lier = (v: unknown): string => { params.push(v); return `$${params.length}`; };
  const where = filtres.length > 0 ? `WHERE ${filtres.join(' AND ')}` : '';
  const curseurSql = curseur === null ? '' :
    `WHERE (t.recu_le, t.fil_id) < (${lier(curseur.dernierLe)}::timestamptz, ${lier(curseur.filId)}::bigint)`;

  const { rows } = await query<LigneDB>(
    `WITH trouves AS (
       -- UN message par échange : le plus récent de ceux qui correspondent. C'est lui qui date le résultat.
       SELECT DISTINCT ON (m.fil_id)
              m.fil_id, m.id AS message_id, m.recu_le, m.sens, m.de_adresse, m.de_nom, m.destinataires,
              m.objet AS objet_trouve, left(coalesce(m.corps_texte, ''), ${LONGUEUR_EXTRAIT}) AS extrait
         FROM gestion_message m
         ${where}
        ORDER BY m.fil_id, m.recu_le DESC, m.id DESC
     )
     SELECT t.fil_id::text AS fil_id, t.message_id, f.objet_initial AS objet, t.objet_trouve,
            coalesce(nullif(btrim(i.de_nom), ''), i.de_adresse, nullif(btrim(t.destinataires), '')) AS interlocuteur,
            i.de_adresse AS interlocuteur_adresse,
            t.sens AS dernier_sens,
            to_char(t.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            t.extrait,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = t.fil_id)::int AS nb_messages,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = t.fil_id AND c.exclu_le IS NULL)::int AS nb_lisibles,
            EXISTS (SELECT 1 FROM gestion_message pm JOIN gestion_piece pc ON pc.message_id = pm.id
                     WHERE pm.fil_id = t.fil_id) AS a_piece,
            (SELECT e.reference FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
              WHERE a.fil_id = t.fil_id AND a.actif AND a.message_id IS NULL LIMIT 1) AS reference,
            (f.etat = 'sans_suite') AS sans_suite
       FROM trouves t
       JOIN gestion_fil f ON f.id = t.fil_id
  LEFT JOIN LATERAL (
         SELECT r.de_adresse, r.de_nom FROM gestion_message r
          WHERE r.fil_id = t.fil_id AND r.sens = 'recu'
          ORDER BY r.recu_le DESC, r.id DESC LIMIT 1
       ) i ON true
       ${curseurSql}
      ORDER BY t.recu_le DESC, t.fil_id DESC
      LIMIT ${lier(aLire)}`,
    params,
  );

  const aSuite = rows.length === aLire;
  const gardees = aSuite ? rows.slice(0, aLire - 1) : rows;
  const dernier = gardees[gardees.length - 1];

  return {
    lignes: gardees.map((r) => ({
      // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans conversion, les clés React et les comparaisons mentiraient.
      filId: Number(r.fil_id),
      messageTrouveId: r.message_id,
      objet: r.objet,
      objetTrouve: r.objet_trouve,
      interlocuteur: r.interlocuteur_adresse === null
        ? r.interlocuteur
        : libelleExpediteur(partenaires, r.interlocuteur_adresse, r.interlocuteur) || r.interlocuteur,
      dernierSens: r.dernier_sens === 'envoye' ? 'envoye' : 'recu',
      dernierLe: r.dernier_le,
      extrait: r.extrait && r.extrait.trim() !== '' ? r.extrait : null,
      nbMessages: r.nb_messages,
      nbLisibles: r.nb_lisibles,
      aPiece: r.a_piece === true,
      reference: r.reference,
      sansSuite: r.sans_suite === true,
    })),
    suivant: aSuite && dernier ? { dernierLe: dernier.dernier_le, filId: dernier.fil_id } : null,
    total: null, // compter TOUS les résultats coûterait le prix de la recherche une seconde fois, pour un chiffre
    pleinTexte,
    // Combien de résultats la règle « pas de courrier automatique » écarte : dit en toutes lettres, comme dans la liste.
    automatiquesMasques: curseur === null && critere.inclureAutomatiques !== true
      ? await compterAutomatiquesMasques(critere, pleinTexte)
      : null,
  };
}

/**
 * Combien d'échanges la recherche aurait rendus EN PLUS avec le courrier automatique. Calculé seulement à la première
 * page : c'est une phrase d'écran, pas une donnée dont dépend la suite.
 */
async function compterAutomatiquesMasques(critere: CritereRecherche, pleinTexte: boolean): Promise<number> {
  const avec = conditions({ ...critere, inclureAutomatiques: true }, pleinTexte);
  const sans = conditions({ ...critere, inclureAutomatiques: false }, pleinTexte);
  const compte = async (c: { sql: string[]; params: unknown[] }): Promise<number> => {
    const where = c.sql.length > 0 ? `WHERE ${c.sql.join(' AND ')}` : '';
    const { rows } = await query<{ n: number }>(
      `SELECT count(DISTINCT m.fil_id)::int AS n FROM gestion_message m ${where}`, c.params);
    return rows[0]?.n ?? 0;
  };
  return Math.max(0, (await compte(avec)) - (await compte(sans)));
}
