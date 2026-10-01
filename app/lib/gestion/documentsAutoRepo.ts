import { query, withTransaction } from '../db/client';
import { documentsAutoDisponible } from './schema';
import {
  attribuer, estDocumentGarant, indexerNoms, MENTION_GARANT, objetCourt, REGLE_DOCUMENT_AUTO, sousTypeLisible,
  type AnnuaireAdresses, type Attribution, type DocumentDeFiche, type FicheDestinataire,
  type MotifNonAttribue, type VoieAttribution,
} from './documentsAuto';

export type { DocumentDeFiche };

/**
 * ══ 🔴🔴 LOT DOCUMENTS-AUTO-PAR-FICHE — LIRE L'ANNUAIRE, RANGER LES DOCUMENTS, LES RELIRE PAR FICHE ════════════
 *
 * Le module PUR (`documentsAuto`) décide à qui un document est destiné ; celui-ci lui donne l'annuaire, écrit ce
 * qu'il a décidé, et sait relire les documents d'une fiche.
 *
 * 🔴 SANS LA MIGRATION 291, RIEN NE SE PASSE. Chaque fonction sonde d'abord : la lecture rend une liste vide, le
 * rangement ne range rien. L'écran se tait, et le module se comporte exactement comme avant ce lot.
 */

/** 🔴 NOS ADRESSES : elles ne désignent personne. Écrites une fois, employées partout. */
export const NOS_ADRESSES: readonly string[] = ['@criterimmo.fr', '@sansvisavis.com', 'gestion.criterimmo@gmail.com'];

/** La règle d'exclusion qui marque un « Document CRITERIMMO ». C'est elle qui définit « document automatique ». */
export const REGLE_EXCLUSION_DOCUMENT = 5;

/**
 * L'ANNUAIRE DES ADRESSES → LES FICHES QUI LES PORTENT. Une seule lecture par passe.
 *
 * ⚠️ `nbBiens` EST LU ICI, et c'est lui qui distingue « document d'un bien » de « compte rendu multi-biens ». Le
 * compter à l'écran obligerait à relire l'annuaire à chaque affichage.
 */
export async function chargerAnnuaireFiches(): Promise<AnnuaireAdresses> {
  const { rows } = await query<{
    email: string; sorte: string; cle: string; libelle: string; nb: number;
  }>(
    `SELECT lower(btrim(c.valeur)) AS email, 'proprietaire' AS sorte, p.wippimmo_id AS cle,
            p.nom_complet AS libelle,
            (SELECT count(*)::int FROM gestion_annuaire_lot l WHERE l.proprietaire_id = p.id) AS nb
       FROM gestion_annuaire_contact c JOIN gestion_annuaire_proprietaire p ON p.id = c.sujet_id
      WHERE c.sorte = 'email' AND c.sujet = 'proprietaire' AND c.archive_le IS NULL
        AND p.supprime_le IS NULL AND coalesce(btrim(c.valeur), '') <> ''
      UNION ALL
     SELECT lower(btrim(c.valeur)), 'locataire', lo.cle_personne, lo.nom,
            (SELECT count(DISTINCT o.lot_id)::int FROM gestion_annuaire_occupation o WHERE o.locataire_id = lo.id)
       FROM gestion_annuaire_contact c JOIN gestion_annuaire_locataire lo ON lo.id = c.sujet_id
      WHERE c.sorte = 'email' AND c.sujet = 'locataire' AND c.archive_le IS NULL
        AND lo.supprime_le IS NULL AND coalesce(btrim(c.valeur), '') <> ''`);

  const m = new Map<string, FicheDestinataire[]>();
  for (const r of rows) {
    if ((r.cle ?? '').trim() === '') continue;
    const f: FicheDestinataire = {
      sorte: r.sorte === 'proprietaire' ? 'proprietaire' : 'locataire',
      cle: r.cle, libelle: r.libelle ?? r.cle, nbBiens: r.nb,
    };
    const deja = m.get(r.email) ?? [];
    // Une même fiche peut porter deux adresses identiques (doublon d'import) : on ne la compte qu'une fois.
    if (!deja.some((x) => x.sorte === f.sorte && x.cle === f.cle)) m.set(r.email, [...deja, f]);
  }
  return m;
}

/** Un document automatique, tel qu'on le lit pour le ranger. */
export interface DocumentARanger {
  messageId: number;
  objet: string | null;
  destinataires: string[];
  /**
   * 🔴 EST-IL ACTUELLEMENT CACHÉ dans « Courrier automatique » ? Lu ICI, et c'est une question de coût autant que
   * de justesse : sans lui, chaque passe au fil de l'eau émettrait un UPDATE par document non rangé — plus de
   * 3 000 écritures toutes les trente secondes pour ne rien changer. On n'écrit que ce qui bouge.
   */
  cache: boolean;
}

/**
 * ══ 🔴🔴 TOUS LES « DOCUMENT CRITERIMMO » ENVOYÉS — RANGÉS OU NON, VISIBLES OU NON. LECTURE SEULE ══════════════
 *
 * 🔴 LE CRITÈRE N'EST PLUS L'EXCLUSION, ET C'EST TOUT L'ENJEU DU LOT DOCUMENTS-AUTO-SUITE. Jusqu'ici la liste se
 * lisait « `exclu_par_regle_id = 5` », c'est-à-dire « ce qui est caché dans Courrier automatique ». Depuis la
 * décision d'Arno du 01/10/2026, un document non rangé est RENDU VISIBLE : son `exclu_par_regle_id` repasse à
 * NULL. Garder l'ancien critère reviendrait à ne plus jamais le relire — et une fiche complétée plus tard ne le
 * rangerait jamais, alors qu'Arno demande exactement l'inverse.
 *
 * ⚠️ ON REPÈRE DONC LE DOCUMENT PAR CE QU'IL EST, non par l'endroit où il se trouve : un envoi dont l'objet porte
 * « Document CRITERIMMO », réponses et transferts compris (`Re:`, `Fwd:` — c'est la règle n° 5 elle-même qui
 * normalise ainsi, cf. `reprendre-reponses-automatiques`). Le `exclu_par_regle_id = 5` reste accepté pour les
 * documents encore cachés, dont l'objet aurait une autre forme.
 */
export async function documentsARanger(limite?: number, seulementNonRanges = false): Promise<DocumentARanger[]> {
  const { rows } = await query<{ id: number; objet: string | null; dest: string[] | null; cache: boolean }>(
    `SELECT m.id::int, m.objet, (m.exclu_le IS NOT NULL) AS cache,
            ARRAY(SELECT lower(btrim(x->>'adresse'))
                    FROM jsonb_array_elements(coalesce(m.dest_a, '[]'::jsonb)) x) AS dest
       FROM gestion_message m
      WHERE m.sens = 'envoye'
        AND (m.exclu_par_regle_id = $1 OR m.objet ILIKE '%Document CRITERIMMO%')
        ${seulementNonRanges ? `AND NOT EXISTS (
          SELECT 1 FROM gestion_rattachement r
           WHERE r.message_id = m.id AND r.regle = $2
             AND r.statut IN ('propose', 'confirme'))` : ''}
      ORDER BY m.id ${limite === undefined ? '' : `LIMIT ${Number(limite)}`}`,
    // ⚠️ $2 N'EST LIÉ QUE S'IL EST ÉCRIT : PostgreSQL refuse un paramètre fourni que la requête ne nomme pas
    //   (« bind message supplies 2 parameters, but prepared statement requires 1 »).
    seulementNonRanges ? [REGLE_EXCLUSION_DOCUMENT, REGLE_DOCUMENT_AUTO] : [REGLE_EXCLUSION_DOCUMENT]);
  return rows.map((r) => ({
    messageId: r.id, objet: r.objet, destinataires: r.dest ?? [], cache: r.cache === true,
  }));
}

export interface ChiffresRangement {
  examines: number;
  locataire: number;
  proprietaireMono: number;
  proprietaireMulti: number;
  nonAttribues: Record<MotifNonAttribue, number>;
  ecrits: number;
  /** Par quelle voie la fiche a été reconnue — l'adresse, ou le nom lu dans l'objet (décision d'Arno). */
  parVoie: Record<VoieAttribution, number>;
  /** Ce que le NOM rattrape, ventilé par la cause qui avait fait échouer l'adresse. */
  gagnesParNomSelonCause: Record<MotifNonAttribue, number>;
  /** Combien de documents de garant, rangés et non rangés. */
  garants: { total: number; ranges: number };
  /** Combien de documents sont sortis de « Courrier automatique » vers la Réception, et combien y sont rentrés. */
  rendusVisibles: number;
  remisEnAutomatique: number;
  /** Quelques cas lisibles, pour qu'Arno vérifie sur pièces plutôt que sur parole. */
  exemples: ExempleRangement[];
}

/** Un cas montré à Arno : ce qu'on a lu, et ce qu'on en a conclu. */
export interface ExempleRangement {
  messageId: number;
  objet: string;
  /** « rangé par l'adresse », « rangé par le nom », « Réception ». */
  issue: string;
  /** La fiche retenue, ou la cause du refus. */
  vers: string;
  garant: boolean;
}

const MOTIFS_VIDES = (): Record<MotifNonAttribue, number> => ({
  nos_adresses: 0, adresse_inconnue: 0, adresse_partagee: 0, fiches_differentes: 0,
});

/**
 * ══ 🔴🔴 RANGER LES DOCUMENTS DANS LEUR FICHE, ET MONTRER CEUX QU'ON NE SAIT PAS RANGER ════════════════════════
 *
 * `appliquer = false` ⇒ SIMULATION : elle compte, elle n'écrit rien. C'est le mode par défaut.
 *
 * ═══ 🔴 L'INVARIANT DU LOT DOCUMENTS-AUTO-SUITE, EN UNE PHRASE ══════════════════════════════════════════════════
 *
 *     UN « Document CRITERIMMO » ENVOYÉ EST CACHÉ DANS « COURRIER AUTOMATIQUE »
 *     SI ET SEULEMENT S'IL EST RANGÉ DANS UNE FICHE.
 *
 * DÉCISION D'ARNO (01/10/2026) : « Tout le reste va dans la Réception principale. Un “Document CRITERIMMO” qui
 * n'est pas rangé avec certitude dans une fiche n'est PLUS caché dans “Courrier automatique”. »
 *
 * 🔴 CET INVARIANT SE TIENT DANS LES DEUX SENS, et le second est celui qu'on oublie :
 *   · rangé et visible      → on le REMET en « Courrier automatique » (il a trouvé sa fiche) ;
 *   · non rangé et caché    → on le REND VISIBLE (personne ne doit le perdre de vue).
 * C'est ce second sens qui réalise la dernière phrase d'Arno — « une fiche complétée plus tard range
 * automatiquement les documents devenus certains, QUI QUITTENT ALORS LA RÉCEPTION pour leur fiche ». Sans lui, un
 * document resterait dans la Réception pour toujours après avoir été rangé, et la Réception ne se viderait jamais.
 *
 * ⚠️ LE COMPTEUR « NON LUS » NE BOUGE PAS, et ce n'est pas une chance : un document est un message ENVOYÉ, et
 * `PREDICAT_NON_LU` (lectureRepo) exige `sens = 'recu'`. Rendre un envoi visible ne peut donc pas le mettre en
 * gras. La demande d'Arno « sans gonfler le compteur non lus » est tenue par construction.
 *
 * 🔴 SEULE UNE FICHE CERTAINE EST RANGÉE. Un document rangé « à peu près » chez quelqu'un donne une certitude
 * fausse, et personne n'y reviendra. Les incertains ne sont plus cachés pour autant : ils vont à la Réception.
 */
export async function rangerLesDocuments(o: {
  appliquer: boolean;
  limite?: number;
  auteurLibelle?: string;
  /** Ne relire que les documents qui n'ont pas encore de fiche. Le mode du fil de l'eau : une passe quasi gratuite. */
  seulementNonRanges?: boolean;
}): Promise<ChiffresRangement> {
  const c: ChiffresRangement = {
    examines: 0, locataire: 0, proprietaireMono: 0, proprietaireMulti: 0,
    nonAttribues: MOTIFS_VIDES(), ecrits: 0,
    parVoie: { adresse: 0, nom: 0 }, gagnesParNomSelonCause: MOTIFS_VIDES(),
    garants: { total: 0, ranges: 0 }, rendusVisibles: 0, remisEnAutomatique: 0, exemples: [],
  };
  /**
   * ⚠️ UN QUOTA PAR FAMILLE, et non les quinze premiers venus. Arno demande « 15 exemples vérifiés, dont 5 résolus
   * par le nom et 3 de garant » : pris dans l'ordre des identifiants, les quinze premiers seraient tous de la même
   * famille (les plus anciens documents se ressemblent), et ne montreraient rien.
   */
  const quotas: Record<string, number> = { adresse: 4, nom: 5, garant: 3, reception: 3 };
  const retenir = (famille: string, e: ExempleRangement): void => {
    if ((quotas[famille] ?? 0) <= 0) return;
    quotas[famille] -= 1;
    c.exemples.push(e);
  };
  if (o.appliquer && !(await documentsAutoDisponible())) return c;

  const annuaire = await chargerAnnuaireFiches();
  const indexNoms = indexerNoms(annuaire);
  const docs = await documentsARanger(o.limite, o.seulementNonRanges === true);
  const auteur = o.auteurLibelle ?? 'classement des documents automatiques';

  for (const d of docs) {
    c.examines += 1;
    const a: Attribution = attribuer({
      destinataires: d.destinataires, annuaire, nosAdresses: NOS_ADRESSES, objet: d.objet, indexNoms,
    });
    if (a.garant) c.garants.total += 1;

    if (a.sorte === 'non_attribue') {
      c.nonAttribues[a.motif] += 1;
      retenir(a.garant ? 'garant' : 'reception', {
        messageId: d.messageId, objet: objetCourt(d.objet), issue: 'Réception',
        vers: a.motif, garant: a.garant,
      });
      // ⚠️ On n'écrit que si l'état CHANGE : un document déjà visible n'a pas besoin d'être rendu visible.
      if (o.appliquer && d.cache) c.rendusVisibles += await rendreVisible(d.messageId);
      continue;
    }

    if (a.fiche.sorte === 'locataire') c.locataire += 1;
    else if (a.multiBiens) c.proprietaireMulti += 1;
    else c.proprietaireMono += 1;
    c.parVoie[a.voie] += 1;
    if (a.motifAdresse !== null) c.gagnesParNomSelonCause[a.motifAdresse] += 1;
    if (a.garant) c.garants.ranges += 1;
    retenir(a.garant ? 'garant' : a.voie, {
      messageId: d.messageId, objet: objetCourt(d.objet),
      issue: a.voie === 'nom' ? `rangé par le nom (adresse : ${a.motifAdresse})` : 'rangé par l’adresse',
      vers: `${a.fiche.sorte} ${a.fiche.libelle}`, garant: a.garant,
    });
    if (!o.appliquer) continue;
    c.ecrits += await poserLien(d, a.fiche, auteur, a.voie, a.garant);
    if (!d.cache) c.remisEnAutomatique += await remettreEnAutomatique(d.messageId);
  }
  return c;
}

/**
 * ══ 🔴 RENDRE UN DOCUMENT VISIBLE — IL ENTRE DANS LA RÉCEPTION ═════════════════════════════════════════════════
 *
 * « Courrier automatique » se définit, dans `boiteRepo`, comme « l'échange dont AUCUN message n'est lisible ».
 * Remettre `exclu_le` à vide suffit donc à faire sortir la conversation de cette étiquette et à la faire
 * apparaître dans la Réception et dans « À rattacher », À SA DATE D'ORIGINE — `recu_le` n'est pas touché, et c'est
 * ce qui tient la demande d'Arno : la conversation ne remonte pas en tête comme si elle venait d'arriver.
 *
 * ⚠️ RIEN D'AUTRE N'EST ÉCRIT. Pas de classement, pas de rattachement, pas de marque de lecture : le document
 * redevient simplement visible. C'est le même contrat que la reprise des réponses humaines du lot précédent.
 */
async function rendreVisible(messageId: number): Promise<number> {
  const { rowCount } = await query(
    `UPDATE gestion_message
        SET exclu_le = NULL, exclu_par_regle_id = NULL, exclu_motif = NULL
      WHERE id = $1 AND exclu_le IS NOT NULL`, [messageId]);
  return rowCount ?? 0;
}

/**
 * ══ 🔴 LE DOCUMENT A TROUVÉ SA FICHE : IL QUITTE LA RÉCEPTION ══════════════════════════════════════════════════
 *
 * L'autre sens de l'invariant. Arno : « une fiche complétée plus tard range automatiquement les documents devenus
 * certains, qui quittent alors la Réception pour leur fiche ».
 *
 * ⚠️ ON RÉÉCRIT LA RÈGLE N° 5 ET SON MOTIF, pas seulement la date : un message qui porterait `exclu_le` sans sa
 * règle serait invisible ET inexplicable — et aucune reprise ne saurait plus par quoi il a été écarté.
 */
async function remettreEnAutomatique(messageId: number): Promise<number> {
  const { rowCount } = await query(
    `UPDATE gestion_message
        SET exclu_le = now(), exclu_par_regle_id = $2, exclu_motif = $3
      WHERE id = $1 AND exclu_le IS NULL`,
    [messageId, REGLE_EXCLUSION_DOCUMENT, 'Document CRITERIMMO rangé dans sa fiche']);
  return rowCount ?? 0;
}

/**
 * Pose le lien d'un document vers sa fiche. Idempotent : repasser ne crée pas de doublon.
 *
 * 🔴🔴 LE `NOT EXISTS` NE REGARDE QUE LES LIENS **VIVANTS**, ET CE DÉTAIL A COÛTÉ 7 330 DOCUMENTS.
 *
 * MESURÉ À LA PREMIÈRE APPLICATION (01/10/2026) : 23 510 fiches certaines, mais 16 180 liens écrits
 * seulement. Cause : 8 943 de ces documents portaient déjà un lien « fiche » **retiré** le 28/09 par la
 * conversion de masse vers les biens (`statut_par_libelle = 'conversion règle bien 28/09'`, aucun geste
 * humain). Le garde, qui ne filtrait pas le statut, prenait ce lien MORT pour une présence et sautait le
 * document — qui n'apparaissait alors dans aucune fiche, puisque la lecture ne retient que les vivants.
 *
 * ⚠️ UN LIEN RETIRÉ EST UN HISTORIQUE, PAS UNE PRÉSENCE. C'est d'ailleurs exactement ce que dit la table :
 * son unique contrainte d'unicité (`gestion_rattachement_vivant_idx`) est PARTIELLE sur
 * `statut IN ('propose','confirme')`. Le garde s'aligne donc sur elle, ni plus large ni plus étroit.
 */
async function poserLien(
  d: DocumentARanger, f: FicheDestinataire, auteur: string, voie: VoieAttribution, garant: boolean,
): Promise<number> {
  /**
   * 🔴 LE MOTIF DIT COMMENT ON A SU, et il le dira encore dans deux ans. « par le nom lu dans l'objet » n'est pas
   * la même certitude que « par l'adresse du destinataire » : qui relira ce lien doit pouvoir faire la différence
   * sans rejouer le moteur. La mention « envoyé au garant » y figure pour la même raison.
   */
  const motif = `document automatique ${voie === 'nom' ? 'nommant' : 'adressé à'} ${f.libelle}`
    + (garant ? ` (${MENTION_GARANT})` : '');
  return withTransaction(async (q) => {
    const { rowCount } = await q(
      `INSERT INTO gestion_rattachement
         (message_id, piece_id, cible_sorte, cible_cle, cible_libelle, origine, regle, confiance,
          motif, statut, cree_par_libelle)
       SELECT $1, NULL, $2, $3, $4, 'automatique', $5, 'haute', $6, 'confirme', $7
        WHERE NOT EXISTS (
          SELECT 1 FROM gestion_rattachement r
           WHERE r.message_id = $1 AND r.cible_sorte = $2 AND coalesce(r.cible_cle,'') = $3
             AND coalesce(r.piece_id, 0) = 0
             AND r.statut IN ('propose', 'confirme'))`,
      [d.messageId, f.sorte, f.cle, f.libelle, REGLE_DOCUMENT_AUTO, motif, auteur]);
    return rowCount ?? 0;
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA LECTURE : LES DOCUMENTS D'UNE FICHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES DOCUMENTS AUTOMATIQUES D'UNE FICHE, du plus récent au plus ancien. LECTURE SEULE.
 *
 * ⚠️ RETOURNE UNE LISTE VIDE SANS LA MIGRATION, et ne nomme alors AUCUNE colonne nouvelle : la sonde répond
 * « non » et la fonction sort avant la requête. Nommer ce qui n'existe pas ferait échouer la fiche entière —
 * règle du module depuis l'incident du lot 4a.
 */
export async function documentsDeLaFiche(
  sorte: 'proprietaire' | 'locataire', cle: string, limite = 300,
): Promise<DocumentDeFiche[]> {
  if (!(await documentsAutoDisponible())) return [];
  const { rows } = await query<{
    message_id: number; fil_id: number; le: string; objet: string | null;
  }>(
    `SELECT r.message_id::int, m.fil_id::int, m.recu_le::date::text AS le, m.objet
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.cible_sorte = $1 AND r.cible_cle = $2 AND r.regle = $3
        AND r.statut IN ('propose', 'confirme') AND r.piece_id IS NULL
      ORDER BY m.recu_le DESC, m.id DESC LIMIT $4`,
    [sorte, cle, REGLE_DOCUMENT_AUTO, limite]);
  return rows.map((r) => ({
    messageId: r.message_id, filId: r.fil_id, le: r.le,
    sousType: sousTypeLisible(r.objet), objet: objetCourt(r.objet),
    /**
     * 🔴 LA MENTION SE RELIT DE L'OBJET, elle ne se stocke pas. Le motif du lien la porte déjà en toutes lettres,
     * mais un motif est un texte libre d'audit : le relire pour en tirer un booléen d'affichage ferait dépendre
     * l'écran d'une phrase qu'on peut reformuler. L'objet, lui, est le document lui-même.
     */
    garant: estDocumentGarant(r.objet),
  }));
}
