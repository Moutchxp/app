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
/**
 * 🔴 LOT RECHERCHE-LIGNES — LES FRAGMENTS SONT IMPORTÉS, JAMAIS RECOPIÉS. Arno : « un seul composant de ligne pour
 * toutes les listes […] pas de copie divergente ». Le composant l'était déjà ; ce lot fait que la DONNÉE l'est
 * aussi — mêmes jointures, mêmes pièces, mêmes règles, écrites une seule fois dans `boiteRepo`.
 */
import {
  piecesVraiesDesFils, sqlAppartenance, sqlJointureClassement, sqlJointureHorsGestion,
  type CurseurBoite, type LigneBoite, type PageBoite,
} from './boiteRepo';
// LOT BOITE-INTERNE-CORBEILLE — « nous », lu à la MÊME source que la capture et que la boîte.
import { chargerConfigGestion } from './config';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';
import { nonRemisesDesFils } from './nonRemiseRepo';
// 🔴 LOT RATTACHER-EN-ECRIVANT — la règle « vraie pièce », rendue en SQL depuis sa définition UNIQUE.
import { sqlEstVraiePiece } from './lisibilite';
import { sqlCleIdentitePiece } from './piecesConversation';
// 🔴 LOT NOM-UNIQUE-DES-PIECES — la recherche trouve la pièce par ses DEUX noms (usage et origine).
import { nomsCherchablesAvec, sqlNomAffiche } from './nomUsageSql';
import { nomUsageDisponible, pieceIntegreeDisponible } from './schema';
// 🔴 LOT RATTACHER-EN-ECRIVANT — la marque « Interne » de l'ÉCHANGE, par la jointure écrite UNE fois.
import { sqlColonneInterne, sqlJointureInterne } from './interneRepo';
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

/**
 * Combien de résultats par page. Même pas que la boîte : on passe de l'une à l'autre sans changer de rythme.
 * 🔴 LOT LISTE-PAGINATION — 25, comme `PAGE_BOITE`. Les deux nombres sont tenus égaux par une épreuve dédiée :
 * une pagination qui changerait de rythme en passant aux résultats se lirait comme un défaut.
 */
export const PAGE_RECHERCHE = 25;
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
  /** LOT RECHERCHE-LIGNES — la capsule de statut, lue par les MÊMES jointures que la liste (voir `boiteRepo`). */
  cl_n: number | null; cl_humain: boolean | null; cl_detail: string | null;
  hg_marque: boolean | null; hg_motif: string | null;
  /** LOT RATTACHER-EN-ECRIVANT — `null` quand la migration 281 est absente : la table n'est nommée nulle part. */
  itn_marque: boolean | null;
}

/**
 * Construit les conditions de filtrage et leurs paramètres LIÉS. Chaque valeur saisie devient un `$n`, jamais un
 * morceau de SQL — c'est la seule façon de rendre une injection impossible, et pas seulement improbable. PUR.
 */
export function conditions(
  c: CritereRecherche, pleinTexte: boolean, spamConnu = false,
  /**
   * LOT BOITE-INTERNE-CORBEILLE — NOTRE adresse, pour que la case « Réception » cherche exactement ce que
   * l'étiquette « Réception » montre. `null` = l'appelant ne l'a pas lue : le prédicat retombe alors mot pour mot
   * sur celui d'avant ce lot. Ce module est PUR — l'adresse vient donc de l'appelant, jamais d'une lecture d'ici.
   */
  adresseGestion: string | null = null,
  /** LOT BOITE-INTERNE-CORBEILLE — la migration 275 est-elle là ? Sinon la colonne n'est nommée nulle part. */
  corbeilleConnue = false,
  /**
   * 🔴 LOT NOM-UNIQUE-DES-PIECES — la migration 286 est-elle là ? Sinon `nom_usage` n'est nommée nulle part, et la
   * recherche ne porte que sur le nom d'origine — c'est-à-dire exactement ce qu'elle faisait avant ce lot.
   *
   * ⚠️ REÇU EN PARAMÈTRE, JAMAIS SONDÉ ICI : ce module est PUR, et c'est ce qui permet d'éprouver tout le
   * prédicat de recherche sans base. Même patron que `spamConnu` et `corbeilleConnue` juste au-dessus.
   */
  nomUsageConnu = false,
  /**
   * ══ 🔴🔴 LOT SOMBRE-ET-RECHERCHE — LES MESSAGES TROUVÉS PAR UN NOM DE PIÈCE, DÉJÀ CALCULÉS ═══════════════
   *
   * CONSTAT D'ARNO (01/10/2026) : « “scan” tapé dans Chercher dans le courrier, la liste reste sur Réception
   * 1–25 sur 8 561, sans aucun filtrage » — et une autre fois « bloqué sur Chargement de la boîte… ».
   *
   * 🔴 MESURÉ, ET CE N'ÉTAIT NI UN DÉFAUT D'AFFICHAGE NI MA SESSION DE DÉBOGAGE : la requête RÉPONDAIT, en
   * 41,7 SECONDES. L'écran montrait donc l'état précédent pendant quarante secondes, puis se mettait à jour —
   * ce qui se lit exactement comme « la recherche ne filtre pas », ou comme un écran figé si l'on attend moins.
   *
   * 🔴 LA CAUSE : le `OR EXISTS (…noms de pièces…)` ajouté au lot NOM-UNIQUE-DES-PIECES. Son encadré affirmait
   * « LE COÛT EST BORNÉ : EXISTS […] sur un ensemble que le plein texte a déjà réduit ». C'EST FAUX, et c'est
   * le piège même du `OR` : le plein texte ne réduit RIEN quand il est en alternative. PostgreSQL ne peut plus
   * se servir de l'index GIN, il recalcule `to_tsvector` sur les 26 603 messages et exécute l'EXISTS pour
   * chacun. Mesuré le 01/10/2026, `EXPLAIN (ANALYZE)` sur la vraie base :
   *
   *     plein texte seul (index GIN)                 4,8 ms
   *     plein texte OR EXISTS (le code d'avant)  12 458 ms      ← et la recherche le fait TROIS fois
   *     plein texte OR m.id = ANY(tableau)          13,8 ms     ← BitmapOr : les DEUX index servent
   *
   * 🔴 CE QUI LE REMPLACE : les identifiants sont cherchés UNE fois, à part (105 ms, balayage de 27 000 pièces),
   * puis passés ICI comme un tableau LIÉ. Le prédicat redevient `A OR m.id = ANY($n)` — deux branches indexables,
   * que PostgreSQL réunit par un `BitmapOr`. La règle métier ne bouge pas d'un mot : on cherche toujours par le
   * nom d'usage ET par le nom d'origine.
   *
   * ⚠️ `null` ⇒ ON NE CHERCHE PAS PAR NOM DE PIÈCE DU TOUT (et l'on n'écrit aucune condition pour cela). C'est
   * ce que fait un appelant qui n'a pas encore fait la lecture — jamais un appelant qui voudrait « tout ».
   */
  idsParNomDePiece: readonly number[] | null = null,
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
    /**
     * ⚠️ LOT BOITE-INTERNE-CORBEILLE — « RÉCEPTION » DIT ICI CE QU'ELLE DIT DANS LA COLONNE DE GAUCHE.
     * Le prédicat sort de `sqlAppartenance`, la MÊME fonction que la liste et les deux compteurs : un message que
     * gestion@ s'adresse à elle-même est dans notre Réception. Écrire `m.sens = 'recu'` ici aurait donné une case
     * « Réception » qui ne trouve pas ce que l'étiquette « Réception » montre — la divergence exacte que ce
     * module a déjà payée une fois. L'adresse est LIÉE, comme toute valeur venue de la base.
     */
    if (c.listes.includes('reception')) {
      const rang = adresseGestion === null ? null : (params.push(adresseGestion), params.length);
      branches.push(`(${sqlAppartenance('m', 'recu', rang)} AND m.exclu_le IS NULL)`);
    }
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
  /**
   * 🔴 LOT BOITE-INTERNE-CORBEILLE — LA CORBEILLE NE SORT JAMAIS DE LA RECHERCHE, et il n'y a pas de case pour
   * elle. C'est un écart ASSUMÉ avec le spam : le spam a sa case parce qu'on va parfois y repêcher un vrai mail
   * classé à tort ; la corbeille, elle, contient ce que quelqu'un a décidé de jeter, et une recherche qui le
   * remonterait ferait rouvrir des échanges qu'on venait de clore. On la consulte par son étiquette, qui la
   * montre en entier — c'est là qu'on répare une erreur, pas au détour d'une recherche sur un autre sujet.
   *
   * ⚠️ Sans la migration 275, la colonne n'est nommée nulle part : la requête est celle d'avant ce lot.
   */
  if (corbeilleConnue) sql.push('m.corbeille_le IS NULL');

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

  /**
   * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LA RECHERCHE TROUVE AUSSI PAR LE NOM DES PIÈCES ═══════════════════════
   *
   * Arno : « La recherche trouve la pièce par son nom d'usage ET par son nom d'origine. »
   *
   * 🔴 CE QUI MANQUAIT : l'index plein texte (migration 237) porte l'objet, le corps, l'expéditeur et les
   * destinataires — et PAS les noms de pièces. Chercher « quittance juillet » ne trouvait donc rien si le mot
   * n'était que dans le nom du fichier, ce qui est le cas le plus fréquent une fois la pièce renommée.
   *
   * 🔴 POURQUOI UN `OR` ET PAS UN AJOUT À L'INDEX. Toucher à `EXPRESSION_INDEXEE` sans toucher à la migration 237
   * ferait diverger les deux chaînes — et PostgreSQL cesserait alors d'utiliser l'index EN SILENCE, balayant
   * 41 Mo de texte à chaque recherche. C'est le défaut que l'encadré de `EXPRESSION_INDEXEE` décrit en toutes
   * lettres. On ajoute donc une condition À CÔTÉ, qui ne touche pas à l'index.
   *
   * ⚠️ LE COÛT EST BORNÉ : `EXISTS` sur `gestion_piece`, servi par `gestion_piece_message_idx`, sur un ensemble
   * que le plein texte a déjà réduit. Et il ne s'écrit QUE si quelqu'un a tapé des mots.
   *
   * ⚠️ LES DEUX NOMS, ET C'EST LE POINT : on cherche sous le nom qu'on a donné (« Quittance juillet »), mais
   * aussi sous celui du correspondant (« scan_0042 ») quand c'est ce dont on se souvient — ou ce qu'on lit dans
   * le mail, qui n'a pas changé.
   */
  /**
   * 🔴 LA BRANCHE « NOM DE PIÈCE », DEVENUE UN TABLEAU D'IDENTIFIANTS. Voir l'encadré du paramètre
   * `idsParNomDePiece` : écrite en `EXISTS`, elle coûtait 12,5 s par requête ; écrite ainsi, 13,8 ms.
   *
   * ⚠️ UN TABLEAU VIDE N'EST PAS « RIEN À AJOUTER » MAIS « AUCUN MESSAGE » : `= ANY('{}')` est faux pour tout le
   * monde, ce qui est exactement juste. On l'écrit quand même plutôt que de sauter la branche — le SQL dit alors
   * la même chose dans les deux cas, et l'on ne se demande pas un jour pourquoi il change de forme.
   */
  const nomsPieces = (): string => (idsParNomDePiece === null
    ? 'false'
    : `m.id = ANY(${lier([...idsParNomDePiece])}::bigint[])`);

  if (termes.length > 0) {
    if (pleinTexte) {
      // La saisie ENTIÈRE, normalisée, confiée à `websearch_to_tsquery` : c'est lui qui comprend les guillemets et les
      //   espaces, exactement comme un champ de recherche de messagerie. Et il ne peut rien produire d'autre.
      const requete = negatifWebsearch === ''
        ? normaliser(c.saisie)
        : `${normaliser(c.saisie)} ${negatifWebsearch}`;
      sql.push(`(${EXPRESSION_INDEXEE} @@ websearch_to_tsquery('french', ${lier(requete)})
        OR ${nomsPieces()})`);
    } else {
      // MODE RÉDUIT : un morceau par terme, tous exigés. Pas de radicaux, mais les accents et la casse sont couverts,
      //   et une expression entre guillemets se cherche telle quelle — mieux que le plein texte sur ce point précis.
      // ⚠️ EN MODE RÉDUIT, LE `OR` PORTE SUR L'ENSEMBLE DES TERMES, pas terme par terme : « quittance juillet »
      //   doit trouver un mail dont le NOM DE PIÈCE porte les deux mots, pas un mail qui a l'un dans son corps et
      //   l'autre dans un nom de fichier.
      const tous = termes.map((t) => `${TEXTE_CHERCHABLE} LIKE '%' || ${lier(t.texte)} || '%'`).join(' AND ');
      sql.push(`((${tous}) OR ${nomsPieces()})`);
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
   *
   * ══ 🔴🔴 LOT RATTACHER-EN-ECRIVANT — « UNE VRAIE PIÈCE », ET SUR LE MESSAGE TROUVÉ ═══════════════════════════
   *
   * CE QUI ÉTAIT ÉCRIT ICI, ET QUI ÉTAIT INCOMPLET :
   *     const existe = 'EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id)';
   *
   * 🔴 CE QUI MANQUAIT : la condition comptait TOUTE ligne de `gestion_piece` — y compris les logos de signature
   * (image001.png, outlook-xxxx.gif) et les jumeaux macOS (« ._bail.pdf »). Or l'ÉCRAN, lui, ne les compte pas :
   * c'est `trierPieces` qui décide ce qu'est une pièce, et lui les écarte. Deux définitions, donc deux réponses.
   *
   * CE QUE ÇA DONNAIT À L'ÉCRAN, et c'est le constat d'Arno : « Pièce jointe = Avec » rendait des échanges dont
   * le message trouvé ne portait qu'un logo de signature. La ligne affichait alors un trombone GRIS — « les
   * pièces sont ailleurs dans la conversation » — sur un résultat censé, précisément, en porter une lui-même.
   * Le filtre disait donc le contraire de ce que la ligne montrait, sur la même ligne.
   *
   * 🔒 LA CORRECTION N'INTRODUIT PAS UNE TROISIÈME DÉFINITION : `sqlEstVraiePiece` est rendu à partir des MÊMES
   * motifs et de la MÊME constante de taille que `estImageDeSignature` (voir son encadré dans `lisibilite.ts`).
   *
   * ⚠️ LA CONDITION PORTE SUR `m`, LE MESSAGE TROUVÉ — jamais sur son échange. C'est déjà ce qu'elle faisait, et
   * c'est ce qui garantit « jamais un échange où seule une autre partie de la conversation en a » : le `DISTINCT
   * ON (m.fil_id)` ne garde qu'un message PARMI CEUX QUI PASSENT CE `WHERE`.
   *
   * ⚠️ « SANS » EST LA NÉGATION EXACTE DE « AVEC », et c'est pour cela qu'on écrit `NOT (…)` plutôt qu'une
   * seconde condition : un mail dont la seule pièce est un logo est un mail SANS pièce jointe, dans les deux
   * sens du filtre. Deux écritures indépendantes laisseraient un jour un mail dans aucun des deux.
   */
  if (c.piece === 'avec' || c.piece === 'sans') {
    const existe = `EXISTS (SELECT 1 FROM gestion_piece p WHERE p.message_id = m.id AND ${sqlEstVraiePiece('p')})`;
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
/**
 * ══ 🔴🔴 LES MESSAGES DONT UNE PIÈCE PORTE CES MOTS — UNE SEULE LECTURE, PARTAGÉE ══════════════════════════
 *
 * Arno (lot NOM-UNIQUE-DES-PIECES) : « La recherche trouve la pièce par son nom d'usage ET par son nom d'origine. »
 * La règle ne change pas ; ce qui change est le MOMENT où on l'applique — voir l'encadré de `idsParNomDePiece`.
 *
 * ⚠️ UNE FOIS POUR LES TROIS REQUÊTES (la page et les deux comptes). Les trois partagent ensuite le même tableau :
 * refaire la lecture à chaque requête aurait rendu trois fois les 105 ms mesurés, pour le même résultat.
 *
 * ⚠️ TOUS LES TERMES SONT EXIGÉS, sur le MÊME nom : « quittance juillet » doit trouver une pièce dont le nom porte
 * les deux mots, pas deux pièces qui en portent un chacune. C'est la règle d'avant ce lot, déplacée telle quelle.
 *
 * ⚠️ ELLE NE LÈVE JAMAIS. Une recherche qui échouerait parce qu'on n'a pas su lire les noms de pièces vaudrait
 * moins qu'une recherche qui ne cherche que dans le texte : on rend un tableau vide, et le plein texte répond seul.
 */
async function messagesParNomDePiece(
  termes: readonly { texte: string }[], nomUsageConnu: boolean,
): Promise<number[]> {
  if (termes.length === 0) return [];
  const params: unknown[] = [];
  const cherchable = normSql(nomsCherchablesAvec(nomUsageConnu, 'pn'));
  const conditions = termes.map((t) => {
    params.push(normaliser(t.texte));
    return `${cherchable} LIKE '%' || $${params.length} || '%'`;
  }).join(' AND ');
  try {
    const { rows } = await query<{ message_id: string }>(
      `SELECT DISTINCT pn.message_id::text FROM gestion_piece pn WHERE ${conditions}`, params);
    return rows.map((r) => Number(r.message_id)).filter((n) => Number.isSafeInteger(n));
  } catch (e) {
    console.error('[gestion/recherche] lecture des noms de pièces impossible', e);
    return [];
  }
}

export async function chercherDansLeCourrier(
  critere: CritereRecherche,
  curseur: CurseurBoite | null,
  partenaires: readonly PartenaireInterne[] = [],
  limite = PAGE_RECHERCHE,
): Promise<PageRecherche> {
  /**
   * 🔴 LOT RECHERCHE-LIGNES — LES DEUX SONDES DE LA CAPSULE VOYAGENT AVEC LA PAGE. Même règle que partout dans le
   * module : une sonde se pose AVEC la donnée qu'elle conditionne, et une sonde négative ne NOMME pas la table —
   * la requête est alors mot pour mot celle d'avant la migration, et la ligne n'affiche simplement pas de capsule.
   */
  const {
    rechercheTexteDisponible, spamDisponible, corbeilleGmailDisponible,
    rattachementsDisponibles, horsGestionDisponible, interneDisponible,
  } = await import('./schema');
  const [pleinTexte, spamConnu, corbeilleConnue, config, rattachements, horsGestion, interne] = await Promise.all([
    rechercheTexteDisponible(), spamDisponible(), corbeilleGmailDisponible(), chargerConfigGestion(),
    rattachementsDisponibles(), horsGestionDisponible(), interneDisponible()]);
  const aLire = Math.min(Math.max(1, limite), 100) + 1;

  /**
   * 🔴 LES NOMS DE PIÈCES, LUS UNE SEULE FOIS ET AVANT TOUT. Le tableau part ensuite dans les TROIS requêtes —
   * la page et les deux comptes —, qui redeviennent ainsi servies par l'index. Voir `messagesParNomDePiece`.
   */
  const nomUsageConnu = await nomUsageDisponible();
  const idsParNom = await messagesParNomDePiece(decouperTermes(critere.saisie), nomUsageConnu);

  const { sql: filtres, params } = conditions(
    critere, pleinTexte, spamConnu, config.adresseGestion, corbeilleConnue, nomUsageConnu, idsParNom);
  const lier = (v: unknown): string => { params.push(v); return `$${params.length}`; };
  const where = filtres.length > 0 ? `WHERE ${filtres.join(' AND ')}` : '';
  const curseurSql = curseur === null ? '' :
    `WHERE (t.recu_le, t.fil_id) < (${lier(curseur.dernierLe)}::timestamptz, ${lier(curseur.filId)}::bigint)`;

  /* 🔴 LOT ETOILE-SIGNATURES-PIECES — la colonne `integree` n'est NOMMÉE que si la migration 296 est là.
     Sans elle, le compteur retombe mot pour mot sur la règle de nom/taille d'avant ce lot. */
  const avecPieceIntegree = await pieceIntegreeDisponible();
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
            (SELECT count(DISTINCT ${sqlCleIdentitePiece('pc', await sqlNomAffiche('pc'))})
               FROM gestion_message pm JOIN gestion_piece pc ON pc.message_id = pm.id
              WHERE pm.fil_id = t.fil_id AND ${sqlEstVraiePiece('pc', avecPieceIntegree)})::int AS nb_pieces,
            (SELECT e.reference FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
              WHERE a.fil_id = t.fil_id AND a.actif AND a.message_id IS NULL LIMIT 1) AS reference,
            (f.etat = 'sans_suite') AS sans_suite,
            -- LOT RECHERCHE-LIGNES — la capsule de statut, par les MEMES jointures que la liste (voir boiteRepo).
            --   Constat d'Arno : elle manquait dans les resultats. Ce n'etait pas le composant de ligne, c'etait
            --   la donnee : la recherche rendait classement=null, donc la ligne n'affichait rien, fidelement.
            -- ⚠️ AUCUN ACCENT GRAVE DANS CE COMMENTAIRE : il vit dans un litteral gabarit.
            cl.n AS cl_n, cl.humain AS cl_humain, cl.detail AS cl_detail,
            ${horsGestion ? 'hg.motif IS NOT NULL AS hg_marque, hg.motif AS hg_motif' : 'NULL::boolean AS hg_marque, NULL::text AS hg_motif'},
            ${sqlColonneInterne(interne)}
       FROM trouves t
       JOIN gestion_fil f ON f.id = t.fil_id
       ${sqlJointureClassement(rattachements, 't')}
       ${sqlJointureHorsGestion(horsGestion, 't')}
       ${sqlJointureInterne(interne, 't')}
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
  /**
   * 🔴 LOT LISTE-PAGINATION — LES DEUX COMPTES, À LA PREMIÈRE PAGE SEULEMENT. Posés ICI, après la page et avant
   * les lectures qui l'enrichissent, pour que l'ORDRE des requêtes reste celui d'avant ce lot : la page, puis les
   * comptes, puis le reste. Un ordre qui bouge sans raison fait tomber des épreuves qui n'avaient rien à voir.
   */
  const comptes = curseur === null
    ? await comptesDeLaRecherche(
      critere, pleinTexte, spamConnu, config.adresseGestion, corbeilleConnue, nomUsageConnu, idsParNom)
    : { total: null as number | null, masques: null as number | null };

  const filsDeLaPage = gardees.map((r) => Number(r.fil_id));
  // LOT LISTE-GMAIL — les mêmes lignes que la liste, donc les mêmes étoiles : un résultat de recherche et une ligne
  //   de boîte montrent le même échange et ne doivent pas se contredire.
  /**
   * 🔴 LOT RECHERCHE-LIGNES — LES PIÈCES SONT LUES COMME DANS LA LISTE, par `piecesVraiesDesFils` : UNE requête
   * pour toute la page, et surtout la MÊME règle — c'est `trierPieces` qui dit ce qu'est une vraie pièce, pas un
   * `count(*)` qui compterait les logos de signature. Sans elle, le trombone d'un résultat ne pouvait rien dire.
   */
  const [avis, etoiles, piecesDesFils, brouillons] = await Promise.all([
    nonRemisesDesFils(filsDeLaPage),
    (await import('./etoileRepo')).etoilesDesFils(filsDeLaPage),
    piecesVraiesDesFils(filsDeLaPage),
    /* 🔴 LOT BROUILLON-REPONSE-ET-REPERE — le picto vaut AUSSI dans les résultats de recherche : une réponse
       commencée ne doit pas disparaître parce qu'on est arrivé à la ligne par la recherche. */
    (await import('./brouillonEnAttenteRepo')).filsAvecBrouillonEnAttente(filsDeLaPage),
  ]);

  return {
    lignes: gardees.map((r) => ({
      // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans conversion, les clés React et les comparaisons mentiraient.
      filId: Number(r.fil_id),
      brouillonEnAttente: brouillons.has(Number(r.fil_id)),
      messageTrouveId: Number(r.message_id),
      /**
       * LOT MESSAGE-CLIQUÉ — DANS UNE RECHERCHE, LE MESSAGE DE LA LIGNE EST LE MESSAGE TROUVÉ. La même valeur sous
       * les deux noms, et c'est voulu : `messageAffiche` est la question que l'ÉCRAN pose à toute ligne de liste
       * (« lequel dois-je ouvrir ? »), à laquelle chaque liste répond selon sa règle ; `messageTrouveId` est ce que
       * la RECHERCHE sait dire d'elle-même. L'écran n'a ainsi qu'une seule chose à lire, d'où qu'il vienne.
       */
      messageAffiche: Number(r.message_id),
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
      /**
       * ══ 🔴🔴 RÉÉCRIT (lot RECHERCHE-LIGNES, 30/09/2026) — ET C'EST UN RENVERSEMENT ═══════════════════════════
       *
       * CE QUI ÉTAIT ÉCRIT ICI : « la recherche ne distingue pas où est la pièce, et le trombone y reste donc
       * GRIS […] la question y demanderait une lecture de plus, pour une liste qu'on parcourt autrement. »
       * Deux choses étaient fausses. ① Le trombone ne restait pas gris : avec `0` et `0`, `etatTrombone` rend
       * « aucune » — il n'y avait AUCUN trombone, et l'on ne voyait pas qu'un résultat portait une pièce.
       * ② La lecture de plus est la même que celle de la liste, pour la même page : une requête, pas trente.
       *
       * CONSTAT D'ARNO : « il manque le trombone avec le nombre de pièces ». Les résultats sont des lignes de
       * courrier comme les autres, et on les parcourt pour les mêmes raisons.
       */
      piecesDuMessage: piecesDesFils.get(Number(r.fil_id))?.get(Number(r.message_id))?.length ?? 0,
      piecesAilleurs: [...(piecesDesFils.get(Number(r.fil_id)) ?? new Map<number, unknown[]>()).entries()]
        .filter(([msg]) => msg !== Number(r.message_id))
        .reduce((n, [, liste]) => n + liste.length, 0),
      reference: r.reference,
      sansSuite: r.sans_suite === true,
      nonRemise: avis.get(Number(r.fil_id)) ?? null,
      etoilee: etoiles.has(Number(r.fil_id)),
      /**
       * ══ 🔴🔴 RÉÉCRIT (lot RECHERCHE-LIGNES, 30/09/2026) ═══════════════════════════════════════════════════════
       *
       * CE QUI ÉTAIT ÉCRIT ICI : « pas de capsule dans les résultats de recherche, et c'est un choix […] la
       * recherche traverse toutes les listes, y compris les brouillons et le spam, où la capsule n'a pas de
       * sens ». Le raisonnement confondait deux choses : les BROUILLONS sont cherchés à part et rendus par un
       * autre bloc (`chercherDansLesBrouillons`) — ils ne passent jamais par ici ; et le spam reste du courrier,
       * dont on veut justement savoir s'il a été classé.
       *
       * CONSTAT D'ARNO : « il manque […] la capsule de statut (À classer / Auto / Classé / Hors gestion) ». La
       * capsule se lit maintenant par les MÊMES jointures que la liste, à quoi s'ajoute `horsGestion`, sans quoi
       * un mail marqué « ne concerne aucun bien » serait annoncé « à classer » dans les seuls résultats.
       *
       * ⚠️ `null` GARDE SON SENS : sans la migration 257, il n'y a pas de capsule du tout — jamais une capsule
       * rouge qui accuserait à tort.
       */
      classement: r.cl_n === null && r.cl_humain === null && r.cl_detail === null
        ? null
        : { nbActifs: r.cl_n ?? 0, parUnHumain: r.cl_humain === true, detail: r.cl_detail },
      horsGestion: r.hg_marque === true,
      motifHorsGestion: r.hg_motif,
      // 🔴 LOT RATTACHER-EN-ECRIVANT — la MÊME capsule qu'en liste : un résultat et une ligne de boîte montrent
      //   le même échange, et ne doivent jamais se contredire (règle du lot RECHERCHE-LIGNES).
      interne: r.itn_marque === true,
    })),
    suivant: aSuite && dernier ? { dernierLe: dernier.dernier_le, filId: dernier.fil_id } : null,
    /**
     * 🔴 LOT LISTE-PAGINATION — LES DEUX NOMBRES SORTENT D'UNE SEULE LECTURE (voir `comptesDeLaRecherche`), et
     * seulement à la PREMIÈRE PAGE : ils ne bougent pas d'une page à l'autre, et les redemander à chaque `‹ ›`
     * paierait deux fois le prix de la recherche. `null` garde son sens exact — « on ne l'a pas recompté ».
     */
    total: comptes.total,
    pleinTexte,
    // Combien de résultats la règle « pas de courrier automatique » écarte : dit en toutes lettres, comme dans la liste.
    automatiquesMasques: comptes.masques,
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
/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — LES DEUX NOMBRES DE LA RECHERCHE, EN UNE SEULE LECTURE ══════════════════════════
 *
 * Deux questions, et elles se répondent avec les MÊMES requêtes :
 *
 *   · `total`   — combien d'ÉCHANGES la recherche trouve, tels qu'on les affiche. C'est le N de « 1–25 sur N » ;
 *   · `masques` — combien la règle du courrier automatique en écarte, pour le dire en toutes lettres.
 *
 * 🔴 `count(DISTINCT m.fil_id)` ET NON `count(*)`, et c'est tout l'enjeu du défaut signalé par Arno (« 1–25 sur
 * 291 354 » pour une liste d'échanges). La recherche rend UN résultat par ÉCHANGE — c'est ce que fait son
 * `DISTINCT ON (m.fil_id)` — alors qu'un même échange peut porter cinquante messages qui correspondent tous.
 * Compter les messages donnerait un nombre sans rapport avec le nombre de lignes.
 *
 * ⚠️ LE TOTAL EST CELUI DE LA LISTE AFFICHÉE, donc celui du critère TEL QU'IL EST — jamais celui du critère
 * « avec les automatiques », qui ne sert qu'à mesurer l'écart. C'est la même exigence que partout dans ce lot :
 * le compteur compte ce qu'on voit.
 *
 * ⚠️ AUCUNE REQUÊTE DE PLUS QU'AVANT CE LOT, et l'ordre des deux lectures n'a pas bougé (« avec » puis « sans ») :
 * le total était déjà calculé, il était simplement jeté après la soustraction. Quand le courrier automatique EST
 * inclus, une seule lecture suffit — il n'y a rien à soustraire, et `masques` vaut `null` (« sans objet »), jamais
 * zéro.
 *
 * ⚠️ CE QUI ÉTAIT ÉCRIT LÀ OÙ LE TOTAL MANQUAIT : « compter TOUS les résultats coûterait le prix de la recherche
 * une seconde fois, pour un chiffre ». C'était vrai tant que le chiffre ne servait à rien — et il se trouve qu'on
 * le payait déjà. Il sert maintenant à dire combien de pages il y a : sans lui, « › » ne saurait pas quand
 * s'éteindre.
 */
async function comptesDeLaRecherche(
  critere: CritereRecherche, pleinTexte: boolean, spamConnu = false, adresseGestion: string | null = null,
  corbeilleConnue = false, nomUsageConnu = false, idsParNomDePiece: readonly number[] | null = null,
): Promise<{ total: number; masques: number | null }> {
  const compte = async (c: CritereRecherche): Promise<number> => {
    const { sql, params } = conditions(
      c, pleinTexte, spamConnu, adresseGestion, corbeilleConnue, nomUsageConnu, idsParNomDePiece);
    const where = sql.length > 0 ? `WHERE ${sql.join(' AND ')}` : '';
    const { rows } = await query<{ n: number }>(
      `SELECT count(DISTINCT m.fil_id)::int AS n FROM gestion_message m ${where}`, params);
    return rows[0]?.n ?? 0;
  };
  // Le courrier automatique est DÉJÀ dedans : la liste affichée EST « avec », et rien n'est écarté à mesurer.
  if (automatiquesInclus(critere)) return { total: await compte(critere), masques: null };
  // ⚠️ L'ORDRE EST CELUI D'AVANT CE LOT — « avec » d'abord, « sans » ensuite. Le changer déplacerait les deux
  //    lectures l'une par rapport à l'autre sans rien apporter.
  const avec = await compte(avecAutomatiques(critere, true));
  const sans = await compte(avecAutomatiques(critere, false));
  return { total: sans, masques: Math.max(0, avec - sans) };
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
