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
import { nonRemisesDesFils } from './nonRemiseRepo';
import {
  automatiquesInclus, decouperTermes, listesChoisies, normaliser, normSql, type CritereRecherche, type SorteListe,
} from './rechercheTermes';

/**
 * 🔴 CE FICHIER EST STRICTEMENT SERVEUR : il importe `db/client`, donc le pilote `pg`, donc `dns`. Un composant client
 * qui l'importerait ferait échouer la construction de TOUTE l'application (incident du 24/09/2026). Ce dont le
 * navigateur a besoin — découpage de la saisie, normalisation des accents, types — vit dans `rechercheTermes.ts`,
 * qui n'importe rien. RÉEXPORTÉ ici pour les appelants SERVEUR, jamais à importer depuis un `'use client'`.
 */
export { decouperTermes, rechercheUtile, filtresAvancesActifs, listesChoisies, automatiquesInclus, LISTES_TOUTES } from './rechercheTermes';
export type { Terme, CritereRecherche, SorteListe, FiltrePiece } from './rechercheTermes';

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

/** Une ligne de résultat : la même forme qu'une ligne de boîte, plus le message qui a fait mouche. */
export interface LigneResultat extends LigneBoite {
  /** Identifiant du message trouvé — l'écran peut y revenir, et l'extrait vient de lui. */
  messageTrouveId: number;
  /** Objet du message trouvé, quand il diffère de celui de l'échange. */
  objetTrouve: string | null;
  /**
   * LOT RECHERCHE-AVANCEE — DE QUELLE LISTE VIENT CE RÉSULTAT. C'est le MESSAGE TROUVÉ qui le dit, pas l'échange :
   * une conversation vit dans « Réception » et dans « Envoyés » à la fois (règle Gmail du lot BOITE-SENS), mais le
   * message qui a fait mouche, lui, est d'un seul côté. L'écran ne l'affiche que si plusieurs listes sont cochées.
   */
  provenance: SorteListe;
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
  nb_messages: number; nb_lisibles: number; nb_pieces: number; reference: string | null; sans_suite: boolean;
  provenance: string;
}

/**
 * Construit les conditions de filtrage et leurs paramètres LIÉS. Chaque valeur saisie devient un `$n`, jamais un
 * morceau de SQL — c'est la seule façon de rendre une injection impossible, et pas seulement improbable. PUR.
 */
export function conditions(
  c: CritereRecherche, pleinTexte: boolean, spamConnu = false,
): { sql: string[]; params: unknown[] } {
  const sql: string[] = [];
  const params: unknown[] = [];
  const lier = (v: unknown): string => { params.push(v); return `$${params.length}`; };

  /**
   * ══ LOT RECHERCHE-AVANCEE — DANS QUELLES LISTES ON CHERCHE ══════════════════════════════════════════════════
   * ⚠️ DEUX RÉGIMES, ET LE PREMIER EST L'ANCIEN À LA LETTRE. Sans `listes` (tous les appels d'avant ce lot, et la
   * route quand le panneau n'a rien dit), la seule règle reste « pas de courrier automatique sauf demande ».
   *
   * Avec `listes`, les cases décident, en OU : « Réception » et « Envoyés » sont les deux sens du courrier ORDINAIRE
   * (`exclu_le IS NULL`), « Courrier automatique » est ce que les règles ont écarté — quel qu'en soit le sens.
   *
   * 🔴 AUCUNE CASE COCHÉE ⇒ `false`, donc zéro résultat. C'est la seule réponse honnête : rendre « tout » parce qu'on
   * n'a rien coché ferait exactement le contraire de ce qu'on a demandé. « Brouillons » ne vit pas dans cette table
   * (voir `chercherDansLesBrouillons`) : ici, ne cocher que lui ne rend aucun message, et c'est juste.
   *
   * ⚠️ Rien n'est LIÉ ici parce que rien ne vient de l'utilisateur : ces morceaux sont choisis par le code parmi un
   * ensemble fermé. Toute VALEUR saisie, elle, passe par `lier` — cf. l'en-tête du fichier.
   */
  if (c.listes === undefined) {
    if (!automatiquesInclus(c)) sql.push('m.exclu_le IS NULL');
  } else {
    const branches: string[] = [];
    if (c.listes.includes('reception')) branches.push("(m.sens = 'recu' AND m.exclu_le IS NULL)");
    if (c.listes.includes('envoyes')) branches.push("(m.sens = 'envoye' AND m.exclu_le IS NULL)");
    if (c.listes.includes('automatique')) branches.push('m.exclu_le IS NOT NULL');
    sql.push(branches.length === 0 ? 'false' : `(${branches.join(' OR ')})`);
  }
  /**
   * 🔴 LOT ERGO-BOITE-3 — LE SPAM EST UNE DIMENSION À PART, PAS UNE BRANCHE DE PLUS.
   *
   * Un spam a un sens (reçu) et peut être exclu par une règle : le mettre en OU avec les autres listes l'aurait fait
   * ressortir sous « Réception » dès que cette case était cochée — c'est-à-dire par défaut. La règle est donc :
   * « Spam » décochée ⇒ on EXCLUT le spam ; cochée ⇒ on ne dit rien, et il s'ajoute à ce que les autres cases ont
   * retenu. C'est la même grammaire que l'écran, où le spam est une liste séparée et jamais un sous-ensemble.
   *
   * ⚠️ `spamConnu` faux (migration 263 absente) ⇒ aucune colonne nommée, aucune condition : comportement d'avant.
   */
  if (spamConnu && c.listes !== undefined && !c.listes.includes('spam')) sql.push('m.spam_le IS NULL');

  const termes = decouperTermes(c.saisie);
  const negatifs = decouperTermes(c.sansMots ?? '');
  /**
   * ══ 🔴 LOT RECHERCHE-AVANCEE — L'EXCLUSION VOYAGE DANS LA MÊME REQUÊTE QUE L'INCLUSION ══════════════════════
   * MESURÉ, et c'est tout l'intérêt de ce bloc : écrit en deux conditions (`… @@ 'fuite'` puis
   * `NOT (… @@ 'facture')`), la recherche « fuite sans facture » prenait **2,8 s** — la négation ne peut pas être
   * servie par l'index GIN, donc PostgreSQL RECALCULAIT `to_tsvector` sur 100 000 caractères pour chaque candidat.
   * Écrite en UNE seule requête `websearch_to_tsquery('french', 'fuite -facture')`, la même recherche prend
   * **11,5 ms** : l'index sert les deux moitiés d'un coup (EXPLAIN : Bitmap Index Scan sur
   * `gestion_message_recherche_idx`, 240 fois plus rapide).
   *
   * La syntaxe `-mot` de `websearch_to_tsquery` EST la négation, et plusieurs `-mot` se cumulent en « ni l'un ni
   * l'autre » — exactement le OU nié qu'on veut. Les expressions exactes gardent leurs guillemets : `-"sans suite"`.
   */
  const negatifWebsearch = negatifs.map((t) => (t.exact ? `-"${t.texte}"` : `-${t.texte}`)).join(' ');

  if (termes.length > 0) {
    if (pleinTexte) {
      // La saisie ENTIÈRE, normalisée, confiée à `websearch_to_tsquery` : c'est lui qui comprend les guillemets et les
      //   espaces, exactement comme un champ de recherche de messagerie. Et il ne peut rien produire d'autre.
      const requete = negatifWebsearch === ''
        ? normaliser(c.saisie)
        : `${normaliser(c.saisie)} ${negatifWebsearch}`;
      sql.push(`${EXPRESSION_INDEXEE} @@ websearch_to_tsquery('french', ${lier(requete)})`);
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
  /**
   * ══ LOT RECHERCHE-AVANCEE — « NE CONTIENT PAS » ═════════════════════════════════════════════════════════════
   * Les mots sont pris en OU puis NIÉS : le mail part dès qu'il contient l'UN d'eux. Écrire « ET » ici serait le
   * piège classique — « sans facture ni relance » ne retirerait que les mails contenant les DEUX mots, c'est-à-dire
   * presque aucun, et l'exclusion aurait l'air de ne pas marcher.
   *
   * ⚠️ EN PLEIN TEXTE, L'EXCLUSION EST PLUS LARGE QUE L'INCLUSION, exprès : elle passe par les mêmes radicaux du
   * français, donc exclure « fuite » retire aussi « fuites ». Pour retrancher, mieux vaut trop que pas assez —
   * l'inverse laisserait passer ce qu'on voulait précisément ne plus voir.
   */
  /**
   * L'EXCLUSION SANS RIEN À INCLURE — le cas où elle n'a pas pu voyager avec l'inclusion ci-dessus (personne n'a tapé
   * de mots : on cherche par expéditeur ou par période, et on retranche). On passe alors par `LIKE`, MÊME en plein
   * texte : une `tsquery` purement négative (`!facture`) ne peut être servie par aucun index, et ferait recalculer
   * `to_tsvector` ligne à ligne — le défaut de 2,8 s décrit plus haut. Le `LIKE`, lui, ne coûte qu'une comparaison de
   * texte, sur un ensemble que l'expéditeur ou la date ont déjà réduit.
   */
  if (negatifs.length > 0 && !(pleinTexte && termes.length > 0)) {
    const ou = negatifs.map((t) => `${TEXTE_CHERCHABLE} LIKE '%' || ${lier(t.texte)} || '%'`);
    sql.push(`NOT (${ou.join(' OR ')})`);
  }

  /**
   * LOT RECHERCHE-AVANCEE — PIÈCE JOINTE. `EXISTS` plutôt qu'une jointure : la question est « y en a-t-il ? », pas
   * « combien ? », et l'index `gestion_piece_message_idx` la sert directement. `indifferent` n'écrit aucune
   * condition — un filtre neutre ne doit rien coûter.
   */
  if (c.piece === 'avec' || c.piece === 'sans') {
    const existe = 'EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)';
    sql.push(c.piece === 'avec' ? existe : `NOT ${existe}`);
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
  const { rechercheTexteDisponible, spamDisponible } = await import('./schema');
  const [pleinTexte, spamConnu] = await Promise.all([rechercheTexteDisponible(), spamDisponible()]);
  const aLire = Math.min(Math.max(1, limite), 100) + 1;

  const { sql: filtres, params } = conditions(critere, pleinTexte, spamConnu);
  const lier = (v: unknown): string => { params.push(v); return `$${params.length}`; };
  const where = filtres.length > 0 ? `WHERE ${filtres.join(' AND ')}` : '';
  const curseurSql = curseur === null ? '' :
    `WHERE (t.recu_le, t.fil_id) < (${lier(curseur.dernierLe)}::timestamptz, ${lier(curseur.filId)}::bigint)`;

  const { rows } = await query<LigneDB>(
    `WITH trouves AS (
       -- UN message par échange : le plus récent de ceux qui correspondent. C'est lui qui date le résultat.
       SELECT DISTINCT ON (m.fil_id)
              m.fil_id, m.id AS message_id, m.recu_le, m.sens, m.de_adresse, m.de_nom, m.destinataires,
              m.objet AS objet_trouve, left(coalesce(m.corps_texte, ''), ${LONGUEUR_EXTRAIT}) AS extrait,
              -- LOT RECHERCHE-AVANCEE — d'où vient le résultat. Calculé sur le MESSAGE trouvé, à la source, plutôt
              --   que redéduit par l'écran : le navigateur ne connaît ni exclu_le ni la règle qui l'écrit.
              -- ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un littéral gabarit, qu'un seul backtick
              --   refermerait (TS1005). Le piège s'est refermé cinq fois sur ce module.
              CASE WHEN ${spamConnu ? 'm.spam_le IS NOT NULL' : 'false'} THEN 'spam'
                   WHEN m.exclu_le IS NOT NULL THEN 'automatique'
                   WHEN m.sens = 'envoye' THEN 'envoyes' ELSE 'reception' END AS provenance
         FROM gestion_message m
         ${where}
        ORDER BY m.fil_id, m.recu_le DESC, m.id DESC
     )
     SELECT t.fil_id::text AS fil_id, t.message_id, f.objet_initial AS objet, t.objet_trouve,
            coalesce(nullif(btrim(i.de_nom), ''), i.de_adresse, nullif(btrim(t.destinataires), '')) AS interlocuteur,
            i.de_adresse AS interlocuteur_adresse,
            t.sens AS dernier_sens,
            to_char(t.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            t.extrait, t.provenance,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = t.fil_id)::int AS nb_messages,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = t.fil_id AND c.exclu_le IS NULL)::int AS nb_lisibles,
            -- LOT LISTE-GMAIL — le NOMBRE, comme dans la liste : les deux écrans montrent la même ligne, ils
            --   doivent la calculer pareil.
            (SELECT count(*) FROM gestion_message pm JOIN gestion_piece pc ON pc.message_id = pm.id
              WHERE pm.fil_id = t.fil_id)::int AS nb_pieces,
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

  // LOT ENVOI-DIAG — un envoi refusé se voit AUSSI dans un résultat de recherche. Le signaler dans la liste et pas
  //   ici aurait fait d'une recherche le seul endroit où un mail non distribué a l'air normal.
  const filsDeLaPage = gardees.map((r) => Number(r.fil_id));
  // LOT LISTE-GMAIL — les mêmes lignes que la liste, donc les mêmes étoiles : un résultat de recherche et une ligne
  //   de boîte montrent le même échange et ne doivent pas se contredire.
  const [avis, etoiles] = await Promise.all([
    nonRemisesDesFils(filsDeLaPage),
    (await import('./etoileRepo')).etoilesDesFils(filsDeLaPage),
  ]);

  return {
    lignes: gardees.map((r) => ({
      // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans conversion, les clés React et les comparaisons mentiraient.
      filId: Number(r.fil_id),
      messageTrouveId: r.message_id,
      objet: r.objet,
      objetTrouve: r.objet_trouve,
      // La base rend un mot d'un ensemble fermé ; on le REFUSE s'il n'en fait pas partie plutôt que de le croire.
      provenance: (['reception', 'envoyes', 'automatique', 'spam'] as const).includes(r.provenance as 'reception')
        ? (r.provenance as SorteListe) : 'reception',
      interlocuteur: r.interlocuteur_adresse === null
        ? r.interlocuteur
        : libelleExpediteur(partenaires, r.interlocuteur_adresse, r.interlocuteur) || r.interlocuteur,
      dernierSens: r.dernier_sens === 'envoye' ? 'envoye' : 'recu',
      dernierLe: r.dernier_le,
      extrait: r.extrait && r.extrait.trim() !== '' ? r.extrait : null,
      nbMessages: r.nb_messages,
      nbLisibles: r.nb_lisibles,
      aPiece: r.nb_pieces > 0,
      nbPieces: r.nb_pieces,
      reference: r.reference,
      sansSuite: r.sans_suite === true,
      nonRemise: avis.get(Number(r.fil_id)) ?? null,
      etoilee: etoiles.has(Number(r.fil_id)),
    })),
    suivant: aSuite && dernier ? { dernierLe: dernier.dernier_le, filId: dernier.fil_id } : null,
    total: null, // compter TOUS les résultats coûterait le prix de la recherche une seconde fois, pour un chiffre
    pleinTexte,
    // Combien de résultats la règle « pas de courrier automatique » écarte : dit en toutes lettres, comme dans la liste.
    automatiquesMasques: curseur === null && critere.inclureAutomatiques !== true
      ? await compterAutomatiquesMasques(critere, pleinTexte, spamConnu)
      : null,
  };
}

/**
 * LE MÊME CRITÈRE, AVEC OU SANS LE COURRIER AUTOMATIQUE. Il faut toucher le champ qui FAIT FOI — la case de `listes`
 * quand elle existe, l'ancien booléen sinon. Régler `inclureAutomatiques` sur un critère qui porte des `listes` ne
 * changerait RIEN (cf. `automatiquesInclus`) : les deux comptes seraient identiques et la phrase de l'écran
 * annoncerait toujours « 0 résultat masqué », en silence. PUR.
 */
function avecAutomatiques(c: CritereRecherche, oui: boolean): CritereRecherche {
  if (c.listes === undefined) return { ...c, inclureAutomatiques: oui };
  const sans = c.listes.filter((l) => l !== 'automatique');
  return { ...c, listes: oui ? [...sans, 'automatique'] : sans };
}

/**
 * Combien d'échanges la recherche aurait rendus EN PLUS avec le courrier automatique. Calculé seulement à la première
 * page : c'est une phrase d'écran, pas une donnée dont dépend la suite.
 */
async function compterAutomatiquesMasques(
  critere: CritereRecherche, pleinTexte: boolean, spamConnu = false,
): Promise<number> {
  const avec = conditions(avecAutomatiques(critere, true), pleinTexte, spamConnu);
  const sans = conditions(avecAutomatiques(critere, false), pleinTexte, spamConnu);
  const compte = async (c: { sql: string[]; params: unknown[] }): Promise<number> => {
    const where = c.sql.length > 0 ? `WHERE ${c.sql.join(' AND ')}` : '';
    const { rows } = await query<{ n: number }>(
      `SELECT count(DISTINCT m.fil_id)::int AS n FROM gestion_message m ${where}`, c.params);
    return rows[0]?.n ?? 0;
  };
  return Math.max(0, (await compte(avec)) - (await compte(sans)));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LOT RECHERCHE-AVANCEE — CHERCHER DANS LES BROUILLONS

   🔴 POURQUOI UNE REQUÊTE À PART, ET PAS UNE BRANCHE DE PLUS DANS LA RECHERCHE.
   Un brouillon n'est pas un message : il vit dans `gestion_brouillon`, il peut n'appartenir à AUCUN échange
   (`fil_id IS NULL` pour un courrier neuf), et il n'a ni expéditeur ni date de réception. Le faire entrer dans la
   requête principale demanderait de l'unir à `gestion_message` puis de le regrouper par échange — or le
   `DISTINCT ON (m.fil_id)` fondrait TOUS les brouillons sans échange en un seul, silencieusement. Un résultat perdu
   sans erreur est précisément ce qu'on ne veut pas.

   LE CHOIX PRUDENT est donc : une requête dédiée, un bloc de résultats à part sur l'écran, et une VÉRITÉ dite —
   le bloc annonce combien il montre et s'il en reste. Les brouillons vivants se comptent en dizaines (3 aujourd'hui),
   jamais en milliers : un plafond franc vaut mieux qu'une pagination qui mêlerait deux horloges (`recu_le` d'un
   côté, `maj_le` de l'autre).

   ⚠️ TOUJOURS EN MODE RÉDUIT (LIKE). L'index plein texte de la migration 237 couvre `gestion_message`, pas cette
   table. Sur trois lignes, le balayage est instantané ; le dire ici évite de croire plus tard à un oubli.

   ⚠️ LE FILTRE « EXPÉDITEUR » ÉCARTE LES BROUILLONS, exprès. Un brouillon n'a pas encore d'expéditeur : le rapprocher
   de son AUTEUR répondrait à une autre question que celle posée. Mieux vaut n'en rendre aucun que d'en rendre un
   pour une raison que personne n'a demandée.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le plafond de brouillons rapportés. Au-delà, le bloc le DIT plutôt que de couper en silence. */
export const PLAFOND_BROUILLONS = 20;

/** Un brouillon trouvé. Assez pour l'afficher et pour l'ouvrir — l'écran le rouvre par son identifiant. */
export interface BrouillonTrouve {
  brouillonId: number;
  /** L'échange auquel il répond, ou `null` pour un courrier neuf. */
  filId: number | null;
  objet: string | null;
  /** À qui il est adressé, tel qu'il sera envoyé. Vide tant que personne n'a été saisi. */
  destinataire: string | null;
  majLe: string;
  extrait: string | null;
  aPiece: boolean;
}

export interface ResultatBrouillons {
  lignes: BrouillonTrouve[];
  /** Vrai quand le plafond a coupé : l'écran l'annonce, il ne laisse pas croire qu'il n'y en avait que vingt. */
  tronque: boolean;
}

/** Le texte cherchable d'un brouillon : objet, corps, et les destinataires déjà saisis. */
const TEXTE_BROUILLON = normSql("b.objet || ' ' || b.corps || ' ' || coalesce(b.dest_a::text, '')");

interface BrouillonDB {
  id: string; fil_id: string | null; objet: string | null; dest: string | null;
  maj_le: string; extrait: string | null; a_piece: boolean;
}

export async function chercherDansLesBrouillons(
  critere: CritereRecherche, limite = PLAFOND_BROUILLONS,
): Promise<ResultatBrouillons> {
  const vide: ResultatBrouillons = { lignes: [], tronque: false };
  if (!listesChoisies(critere).includes('brouillons')) return vide;
  if ((critere.expediteur ?? '').trim() !== '') return vide; // voir l'en-tête : un brouillon n'a pas d'expéditeur

  const params: unknown[] = [];
  const lier = (v: unknown): string => { params.push(v); return `$${params.length}`; };
  // Un brouillon VIVANT : ni abandonné, ni déjà parti. La même définition que la liste « Brouillons ».
  const filtres: string[] = ['b.abandonne_le IS NULL', 'b.envoye_le IS NULL'];

  for (const t of decouperTermes(critere.saisie)) {
    filtres.push(`${TEXTE_BROUILLON} LIKE '%' || ${lier(t.texte)} || '%'`);
  }
  const negatifs = decouperTermes(critere.sansMots ?? '');
  if (negatifs.length > 0) {
    const ou = negatifs.map((t) => `${TEXTE_BROUILLON} LIKE '%' || ${lier(t.texte)} || '%'`);
    filtres.push(`NOT (${ou.join(' OR ')})`);
  }
  if (critere.piece === 'avec' || critere.piece === 'sans') {
    const existe = 'EXISTS (SELECT 1 FROM gestion_brouillon_piece bp WHERE bp.brouillon_id = b.id)';
    filtres.push(critere.piece === 'avec' ? existe : `NOT ${existe}`);
  }
  // La période porte sur la DERNIÈRE MODIFICATION : c'est la seule date qu'un brouillon possède.
  if ((critere.du ?? '') !== '') filtres.push(`b.maj_le >= ${lier(critere.du)}::date`);
  if ((critere.au ?? '') !== '') filtres.push(`b.maj_le < (${lier(critere.au)}::date + interval '1 day')`);

  const aLire = Math.min(Math.max(1, limite), 100) + 1;
  const { rows } = await query<BrouillonDB>(
    `SELECT b.id::text AS id, b.fil_id::text AS fil_id, nullif(btrim(b.objet), '') AS objet,
            nullif(btrim(coalesce(b.dest_a->0->>'adresse', b.dest_a->>0, '')), '') AS dest,
            to_char(b.maj_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS maj_le,
            left(b.corps, ${LONGUEUR_EXTRAIT}) AS extrait,
            EXISTS (SELECT 1 FROM gestion_brouillon_piece bp WHERE bp.brouillon_id = b.id) AS a_piece
       FROM gestion_brouillon b
      WHERE ${filtres.join(' AND ')}
      ORDER BY b.maj_le DESC, b.id DESC
      LIMIT ${lier(aLire)}`,
    params,
  );

  const tronque = rows.length === aLire;
  return {
    lignes: (tronque ? rows.slice(0, aLire - 1) : rows).map((r) => ({
      brouillonId: Number(r.id),
      filId: r.fil_id === null ? null : Number(r.fil_id),
      objet: r.objet,
      destinataire: r.dest,
      majLe: r.maj_le,
      extrait: r.extrait && r.extrait.trim() !== '' ? r.extrait : null,
      aPiece: r.a_piece === true,
    })),
    tronque,
  };
}
