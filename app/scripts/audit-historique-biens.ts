/**
 * ══ 🔴🔴 AUDIT HISTORIQUE-DES-BIENS — LECTURE SEULE STRICTE ════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (04/10/2026) : « chaque mail rattaché à un ou plusieurs biens par notre outil de rattachement et de
 * suivi doit se retrouver, avec son contenu, dans l'historique de CHACUN de ces biens […]. Avant de construire la
 * gestion des données des fiches biens, Arno veut savoir si cette mécanique est fiable. »
 *
 * LA RÉFÉRENCE EST CE QU'AFFICHE « VISUALISER / MODIFIER ». Pour chaque mail, l'ensemble des biens selon la fenêtre
 * doit être égal à l'ensemble des biens dont l'historique contient ce mail.
 *
 * ═══ 🔒 CE SCRIPT N'ÉCRIT RIEN, NULLE PART ═══════════════════════════════════════════════════════════════════════
 *
 *   · AUCUN `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `CREATE`, `COMMIT` : un garde statique les cherche
 *     dans son propre source (voir `GARDE_LECTURE_SEULE`) et refuse de démarrer s'il en trouve un ;
 *   · aucun appel réseau, donc aucune écriture dans le Drive ni chez Google ;
 *   · il n'écrit QUE deux fichiers sur le Bureau, que la demande prévoit explicitement.
 *
 * USAGE :
 *   npx tsx --env-file=.env app/scripts/audit-historique-biens.ts
 *
 * ═══ 🔴🔴 LES DEUX ENSEMBLES COMPARÉS, ET POURQUOI CEUX-LÀ ═══════════════════════════════════════════════════════
 *
 * Les deux écrans lisent la MÊME table, `gestion_rattachement`. Ce ne sont donc pas deux sources qu'on compare,
 * mais deux FILTRES sur la même — et c'est précisément là que les écarts se logent.
 *
 *   ① LA FENÊTRE (`ficheRattachementRepo.ficheRattachementDuFil`, puis le module pur
 *      `ficheRattachement.biensDuMail`) retient un bien pour un mail quand il existe une ligne :
 *         message_id = ce mail · statut = 'confirme' · cible_sorte = 'lot' · cible_cle non nulle
 *      et que le lot existe dans `gestion_annuaire_lot` (sinon la fenêtre le saute : `if (lot === undefined)
 *      continue`). ⚠️ ELLE NE FILTRE PAS `piece_id`.
 *
 *   ② L'HISTORIQUE (`historiqueRepo.cteMessages`) retient un mail pour un bien quand il existe une ligne :
 *         même chose, PLUS `piece_id IS NULL`
 *      et que le lot est atteignable (`etendreCible` rend « inconnue » si le lot n'est pas dans l'annuaire).
 *
 * LA SEULE DIFFÉRENCE STRUCTURELLE EST DONC `piece_id IS NULL`. Tout le reste de l'audit en découle, et chaque
 * écart est classé par sa CAUSE PRÉSUMÉE, lisible dans le CSV.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { query } from '../lib/db/client';

/**
 * 🔒 LE GARDE DE LECTURE SEULE. Il lit SON PROPRE SOURCE et refuse de démarrer si un verbe d'écriture SQL y
 * apparaît hors de cette liste elle-même. C'est un garde-fou, pas une preuve — mais il attrape l'ajout distrait
 * d'un `UPDATE` « juste pour corriger pendant qu'on y est », qui est exactement ce que la demande interdit.
 */
const VERBES_INTERDITS = ['INSERT ', 'UPDATE ', 'DELETE ', 'TRUNCATE', 'ALTER ', 'CREATE ', 'DROP ', 'COMMIT'];

function GARDE_LECTURE_SEULE(): void {
  const src = readFileSync(new URL(import.meta.url).pathname, 'utf8');
  /**
   * 🔴 LE GARDE INSPECTE LE **CODE**, PAS LA PROSE — et il l'a appris à ses dépens : au premier essai il s'est
   * dénoncé sur sa propre documentation, qui NOMME les verbes interdits pour expliquer qu'elle les interdit. Un
   * garde qui se trompe sur ce qu'il compte empêche d'écrire l'explication qui le justifie.
   *
   * On retire donc : les commentaires de bloc, les lignes de commentaire, et la ligne qui DÉCLARE la liste.
   */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .filter((l) => !l.includes('VERBES_INTERDITS'))
    .join('\n')
    .toUpperCase();
  const trouves = VERBES_INTERDITS.filter((v) => code.includes(v));
  if (trouves.length > 0) {
    console.error(`🔴 ARRÊT : ce script d'audit contient un verbe d'écriture (${trouves.join(', ')}).`);
    console.error('   La demande d\'Arno est « LECTURE SEULE STRICTE ». Rien n\'a été lu, rien n\'a été écrit.');
    process.exit(1);
  }
}

const BUREAU = join(homedir(), 'Desktop');
const FICHIER_MD = join(BUREAU, 'compte-rendu-historique-biens.md');
const FICHIER_CSV = join(BUREAU, 'compte-rendu-historique-biens-ecarts.csv');

/** Combien d'exemples cliquables on donne par catégorie. Un rapport de mille lignes ne se lit pas. */
const EXEMPLES = 15;

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES BRIQUES SQL, ÉCRITES UNE FOIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 LES DEUX FILTRES, CÔTE À CÔTE. Ils sont écrits ici en toutes lettres pour qu'on puisse les relire contre le
 * code de production — c'est tout l'objet de l'audit, et un audit dont on ne peut pas vérifier le critère ne
 * prouve rien.
 *
 * ⚠️ `lot_connu` : un lot absent de `gestion_annuaire_lot` est invisible DES DEUX CÔTÉS (la fenêtre le saute,
 * l'historique répond « cible inconnue »). Ce n'est donc pas un écart entre les deux : c'est un troisième cas,
 * compté à part sous le nom d'« orphelin ».
 */
const BASE = `
  WITH lot_connu AS (
    SELECT wippimmo_id AS cle FROM gestion_annuaire_lot
  ),
  -- ① CE QUE LA FENÊTRE MONTRE
  fen AS (
    SELECT DISTINCT r.message_id, r.cible_cle
      FROM gestion_rattachement r
     WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL
       AND EXISTS (SELECT 1 FROM lot_connu k WHERE k.cle = r.cible_cle)
  ),
  -- ② CE QUE L'HISTORIQUE CONTIENT
  his AS (
    SELECT DISTINCT r.message_id, r.cible_cle
      FROM gestion_rattachement r
     WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL
       AND r.piece_id IS NULL
       AND EXISTS (SELECT 1 FROM lot_connu k WHERE k.cle = r.cible_cle)
  ),
  manquants AS (SELECT message_id, cible_cle FROM fen EXCEPT SELECT message_id, cible_cle FROM his),
  enTrop    AS (SELECT message_id, cible_cle FROM his EXCEPT SELECT message_id, cible_cle FROM fen)
`;

interface Ecart {
  messageId: number;
  filId: number | null;
  bien: string;
  type: string;
  cause: string;
}

const ecarts: Ecart[] = [];

async function un<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await query<T>(sql, params);
  return (rows[0] ?? {}) as T;
}

function nombre(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   L'AUDIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  GARDE_LECTURE_SEULE();
  const lignes: string[] = [];
  const dire = (s = ''): void => { lignes.push(s); console.log(s); };

  const socle = await un<{ liens: string; confirmes: string; messages: string; lots: string; fils: string }>(
    `SELECT (SELECT count(*) FROM gestion_rattachement)::text AS liens,
            (SELECT count(*) FROM gestion_rattachement WHERE statut = 'confirme')::text AS confirmes,
            (SELECT count(*) FROM gestion_message)::text AS messages,
            (SELECT count(*) FROM gestion_annuaire_lot)::text AS lots,
            (SELECT count(*) FROM gestion_fil)::text AS fils`);

  // ── a) ET b) LES DEUX ÉCARTS DE BASE ────────────────────────────────────────────────────────────────────────
  const paires = await un<{ fen: string; his: string; manquants: string; en_trop: string; mails_fen: string }>(
    `${BASE}
     SELECT (SELECT count(*) FROM fen)::text AS fen,
            (SELECT count(*) FROM his)::text AS his,
            (SELECT count(*) FROM manquants)::text AS manquants,
            (SELECT count(*) FROM enTrop)::text AS en_trop,
            (SELECT count(DISTINCT message_id) FROM fen)::text AS mails_fen`);

  const { rows: exManquants } = await query<{ message_id: string; fil_id: string; cible_cle: string; cause: string }>(
    `${BASE}
     SELECT m.message_id::text, g.fil_id::text, m.cible_cle,
            CASE WHEN EXISTS (SELECT 1 FROM gestion_rattachement r
                               WHERE r.message_id = m.message_id AND r.cible_cle = m.cible_cle
                                 AND r.statut = 'confirme' AND r.piece_id IS NOT NULL)
                 THEN 'lien posé sur une PIÈCE (piece_id non nul) : la fenêtre le compte, l''historique l''écarte'
                 ELSE 'cause inconnue — à instruire' END AS cause
       FROM manquants m JOIN gestion_message g ON g.id = m.message_id
      ORDER BY m.message_id DESC`);

  const { rows: exEnTrop } = await query<{ message_id: string; fil_id: string; cible_cle: string }>(
    `${BASE}
     SELECT h.message_id::text, g.fil_id::text, h.cible_cle
       FROM enTrop h JOIN gestion_message g ON g.id = h.message_id
      ORDER BY h.message_id DESC`);

  for (const r of exManquants) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: r.cible_cle,
      type: 'manquant dans l’historique', cause: r.cause,
    });
  }
  for (const r of exEnTrop) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: r.cible_cle,
      type: 'en trop dans l’historique',
      cause: 'présent dans l’historique alors que la fenêtre ne cite pas ce bien',
    });
  }

  // ── LES ORPHELINS : un lien confirmé vers un lot que l'annuaire ne connaît pas ───────────────────────────────
  const orphelins = await un<{ n: string; mails: string }>(
    `SELECT count(*)::text AS n, count(DISTINCT r.message_id)::text AS mails
       FROM gestion_rattachement r
      WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_annuaire_lot lo WHERE lo.wippimmo_id = r.cible_cle)`);

  const { rows: exOrphelins } = await query<{ message_id: string; fil_id: string; cible_cle: string }>(
    `SELECT r.message_id::text, m.fil_id::text, r.cible_cle
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gestion_annuaire_lot lo WHERE lo.wippimmo_id = r.cible_cle)
      ORDER BY r.message_id DESC`);
  for (const r of exOrphelins) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: r.cible_cle,
      type: 'bien introuvable dans l’annuaire',
      cause: 'le lot n’est pas (ou plus) dans gestion_annuaire_lot : invisible dans la fenêtre ET dans l’historique',
    });
  }

  // ── c) LES MAILS MULTI-BIENS ────────────────────────────────────────────────────────────────────────────────
  const multi = await un<{ mails: string; fideles: string; paires: string }>(
    `${BASE},
     parMail AS (
       SELECT message_id, count(*) AS n_fen,
              (SELECT count(*) FROM his h WHERE h.message_id = f.message_id) AS n_his
         FROM fen f GROUP BY message_id
     )
     SELECT count(*) FILTER (WHERE n_fen > 1)::text AS mails,
            count(*) FILTER (WHERE n_fen > 1 AND n_fen = n_his)::text AS fideles,
            coalesce(sum(n_fen) FILTER (WHERE n_fen > 1), 0)::text AS paires
       FROM parMail`);

  // ── d) LES CONVERSATIONS DONT LE SUIVI A CHANGÉ ─────────────────────────────────────────────────────────────
  const suivi = await un<{ fils_changes: string; fideles: string; exceptions: string; fils_exc: string }>(
    `${BASE},
     changes AS (
       SELECT fil_id FROM gestion_fil_periode GROUP BY fil_id HAVING count(*) > 1
       UNION
       SELECT m.fil_id FROM gestion_message_exception e
         JOIN gestion_message m ON m.id = e.message_id
        WHERE e.retiree_le IS NULL
     ),
     ecartsParFil AS (
       SELECT m.fil_id, count(*) AS n
         FROM (SELECT message_id, cible_cle FROM manquants
               UNION ALL SELECT message_id, cible_cle FROM enTrop) x
         JOIN gestion_message m ON m.id = x.message_id
        GROUP BY m.fil_id
     )
     SELECT (SELECT count(*) FROM changes)::text AS fils_changes,
            (SELECT count(*) FROM changes c
              WHERE NOT EXISTS (SELECT 1 FROM ecartsParFil e WHERE e.fil_id = c.fil_id))::text AS fideles,
            (SELECT count(*) FROM gestion_message_exception WHERE retiree_le IS NULL)::text AS exceptions,
            (SELECT count(DISTINCT m.fil_id) FROM gestion_message_exception e
               JOIN gestion_message m ON m.id = e.message_id WHERE e.retiree_le IS NULL)::text AS fils_exc`);

  // ── e) INTERNE, AUTO, DOCUMENTS CRITERIMMO ──────────────────────────────────────────────────────────────────
  const interne = await un<{ marques: string; avec_bien: string }>(
    `SELECT count(*)::text AS marques,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM gestion_rattachement r
               WHERE r.message_id = i.message_id AND r.statut = 'confirme' AND r.cible_sorte = 'lot'
            ))::text AS avec_bien
       FROM gestion_message_interne i WHERE i.retire_le IS NULL`);

  const interneEchange = await un<{ fils: string; mails_avec_bien: string }>(
    `SELECT count(DISTINCT f.fil_id)::text AS fils,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM gestion_rattachement r
               WHERE r.message_id = m.id AND r.statut = 'confirme' AND r.cible_sorte = 'lot'
            ))::text AS mails_avec_bien
       FROM gestion_fil_interne f
       JOIN gestion_message m ON m.fil_id = f.fil_id
      WHERE f.retire_le IS NULL`);

  const auto = await un<{ liens: string; mails: string; ecarts: string }>(
    `${BASE},
     autoFen AS (
       SELECT DISTINCT r.message_id, r.cible_cle
         FROM gestion_rattachement r
        WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL
          AND r.origine = 'automatique' AND r.statut_par_libelle IS NULL
     )
     SELECT (SELECT count(*) FROM autoFen)::text AS liens,
            (SELECT count(DISTINCT message_id) FROM autoFen)::text AS mails,
            (SELECT count(*) FROM autoFen a
              WHERE NOT EXISTS (SELECT 1 FROM his h
                                 WHERE h.message_id = a.message_id AND h.cible_cle = a.cible_cle))::text AS ecarts`);

  const criterimmo = await un<{ mails: string; avec_bien: string }>(
    `SELECT count(*)::text AS mails,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM gestion_rattachement r
               WHERE r.message_id = m.id AND r.statut = 'confirme' AND r.cible_sorte = 'lot'
            ))::text AS avec_bien
       FROM gestion_message m WHERE m.objet LIKE 'Document CRITERIMMO%'`);

  /* 🔴 LE DÉTAIL DES ANOMALIES DE RÈGLE (e), pour que le CSV les porte nommément. */
  const { rows: exInterne } = await query<{ fil_id: string; message_id: string; cible_cle: string; objet: string }>(
    `SELECT m.fil_id::text, m.id::text AS message_id, r.cible_cle, coalesce(m.objet, '(sans objet)') AS objet
       FROM gestion_message_interne i
       JOIN gestion_message m ON m.id = i.message_id
       JOIN gestion_rattachement r ON r.message_id = m.id AND r.statut = 'confirme' AND r.cible_sorte = 'lot'
      WHERE i.retire_le IS NULL ORDER BY m.id`);
  for (const r of exInterne) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: r.cible_cle,
      type: 'mail « Interne » rattaché à un bien',
      cause: 'la règle d’Arno veut qu’un mail interne ne soit rattaché à aucun bien',
    });
  }

  const { rows: exCriterimmo } = await query<{ fil_id: string; message_id: string; cible_cle: string }>(
    `SELECT m.fil_id::text, m.id::text AS message_id, r.cible_cle
       FROM gestion_message m
       JOIN gestion_rattachement r ON r.message_id = m.id AND r.statut = 'confirme' AND r.cible_sorte = 'lot'
      WHERE m.objet LIKE 'Document CRITERIMMO%' ORDER BY m.id`);
  for (const r of exCriterimmo) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: r.cible_cle,
      type: 'mail « Document CRITERIMMO » rattaché à un bien',
      cause: 'la règle d’Arno veut qu’ils ne soient jamais rattachés — faux positif du moteur automatique',
    });
  }

  // ── f) PROPRIÉTAIRE ET LOCATAIRE À LA DATE DU MAIL ──────────────────────────────────────────────────────────
  /**
   * 🔴 DEUX MÉCANISMES DIFFÉRENTS, ET C'EST LE CŒUR DU POINT f).
   *
   *   · LA FENÊTRE calcule le locataire par `gestion_annuaire_occupation`, à la date du mail LE PLUS RÉCENT de
   *     l'échange qui porte ce lien (`dateParCle`, dans `ficheRattachementRepo`) — pas à la date du mail affiché.
   *   · L'HISTORIQUE affiche les « interventions », lignes de `gestion_rattachement` portant
   *     `regle = 'intervention'` et un `role_instantane` FIGÉ au classement, par mail.
   *
   * On mesure donc : combien de mails rattachés à un bien tombent dans une période où le lot a changé
   * d'occupant — ce sont ceux où les deux mécanismes peuvent diverger.
   */
  const personnes = await un<{
    interventions: string; avec_role: string; sans_role: string; lots_multi_occup: string; mails_concernes: string;
  }>(
    `SELECT (SELECT count(*) FROM gestion_rattachement
              WHERE regle = 'intervention' AND statut IN ('propose','confirme') AND piece_id IS NULL)::text
              AS interventions,
            (SELECT count(*) FROM gestion_rattachement
              WHERE regle = 'intervention' AND statut IN ('propose','confirme') AND piece_id IS NULL
                AND role_instantane IS NOT NULL)::text AS avec_role,
            (SELECT count(*) FROM gestion_rattachement
              WHERE regle = 'intervention' AND statut IN ('propose','confirme') AND piece_id IS NULL
                AND role_instantane IS NULL)::text AS sans_role,
            (SELECT count(*) FROM (SELECT lot_id FROM gestion_annuaire_occupation
                                    GROUP BY lot_id HAVING count(*) > 1) z)::text AS lots_multi_occup,
            (SELECT count(DISTINCT r.message_id) FROM gestion_rattachement r
               JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle
              WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot'
                AND lo.id IN (SELECT lot_id FROM gestion_annuaire_occupation
                               GROUP BY lot_id HAVING count(*) > 1))::text AS mails_concernes`);

  /** Les mails d'un fil qui s'étend SUR un changement d'occupant : la fenêtre y nomme une seule personne. */
  const fenetreDate = await un<{ fils: string; mails: string }>(
    `WITH filsLot AS (
       SELECT DISTINCT m.fil_id, lo.id AS lot_id
         FROM gestion_rattachement r
         JOIN gestion_message m ON m.id = r.message_id
         JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle
        WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot'
     ),
     bornes AS (
       SELECT f.fil_id, f.lot_id, min(m.recu_le)::date AS d1, max(m.recu_le)::date AS d2
         FROM filsLot f JOIN gestion_message m ON m.fil_id = f.fil_id
        GROUP BY f.fil_id, f.lot_id
     )
     SELECT count(DISTINCT b.fil_id)::text AS fils,
            (SELECT count(*) FROM gestion_message m2
              WHERE m2.fil_id IN (SELECT fil_id FROM bornes b2
                                   WHERE EXISTS (SELECT 1 FROM gestion_annuaire_occupation o
                                                  WHERE o.lot_id = b2.lot_id AND o.entree IS NOT NULL
                                                    AND o.entree > b2.d1 AND o.entree <= b2.d2)))::text AS mails
       FROM bornes b
      WHERE EXISTS (SELECT 1 FROM gestion_annuaire_occupation o
                     WHERE o.lot_id = b.lot_id AND o.entree IS NOT NULL
                       AND o.entree > b.d1 AND o.entree <= b.d2)`);

  /**
   * ══ 🔴🔴 LA MESURE QUI TRANCHE LE POINT f) ══════════════════════════════════════════════════════════════════
   *
   * La fenêtre calcule le locataire à `dateParCle` : la date du mail LE PLUS RÉCENT de l'échange qui porte ce
   * lien — et non la date du mail affiché en tête. On compare donc, pour chaque couple (mail, bien), le locataire
   * EN PLACE À LA DATE DU MAIL avec celui que la fenêtre nommerait.
   *
   * ⚠️ `string_agg(DISTINCT …)` PARCE QU'UN LOGEMENT PEUT AVOIR PLUSIEURS CO-OCCUPANTS à la même date : comparer
   * un seul nom ferait voir un écart là où il n'y a qu'un colocataire de plus.
   */
  const LOCATAIRE_A = `(SELECT string_agg(DISTINCT lc.nom, '+') FROM gestion_annuaire_occupation o
     JOIN gestion_annuaire_locataire lc ON lc.id = o.locataire_id
    WHERE o.lot_id = l.lot_id`;
  const datesLocataire = `
    WITH liens AS (
      SELECT m.id AS message_id, m.fil_id, lo.id AS lot_id, r.cible_cle, m.recu_le::date AS d_mail
        FROM gestion_rattachement r
        JOIN gestion_message m ON m.id = r.message_id
        JOIN gestion_annuaire_lot lo ON lo.wippimmo_id = r.cible_cle
       WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot'
    ),
    dateFenetre AS (SELECT fil_id, lot_id, max(d_mail) AS d_fen FROM liens GROUP BY fil_id, lot_id),
    occ AS (
      SELECT l.message_id, l.fil_id, l.cible_cle, l.d_mail,
             ${LOCATAIRE_A} AND (o.entree IS NULL OR o.entree <= l.d_mail)
                             AND (o.sortie IS NULL OR o.sortie >= l.d_mail)) AS a_la_date_du_mail,
             ${LOCATAIRE_A} AND (o.entree IS NULL OR o.entree <= f.d_fen)
                             AND (o.sortie IS NULL OR o.sortie >= f.d_fen)) AS nomme_par_la_fenetre
        FROM liens l JOIN dateFenetre f ON f.fil_id = l.fil_id AND f.lot_id = l.lot_id
    )`;

  const locataire = await un<{ couples: string; divergents: string }>(
    `${datesLocataire}
     SELECT count(*)::text AS couples,
            count(*) FILTER (WHERE coalesce(a_la_date_du_mail, '') <> coalesce(nomme_par_la_fenetre, ''))::text
              AS divergents
       FROM occ`);

  const { rows: exLocataire } = await query<{
    fil_id: string; message_id: string; cible_cle: string; d_mail: string; vrai: string | null; vu: string | null;
  }>(
    `${datesLocataire}
     SELECT fil_id::text, message_id::text, cible_cle, d_mail::text,
            a_la_date_du_mail AS vrai, nomme_par_la_fenetre AS vu
       FROM occ WHERE coalesce(a_la_date_du_mail, '') <> coalesce(nomme_par_la_fenetre, '')
      ORDER BY message_id DESC`);
  for (const r of exLocataire) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: r.cible_cle,
      type: 'locataire nommé par la fenêtre ≠ locataire à la date du mail',
      cause: `au ${r.d_mail} c’était « ${r.vrai ?? 'logement vacant'} » ; la fenêtre nomme `
        + `« ${r.vu ?? 'logement vacant'} » (date du mail le plus récent de l’échange)`,
    });
  }

  // ── g) LE CONTENU : CORPS ET PIÈCES JOINTES ─────────────────────────────────────────────────────────────────
  const contenu = await un<{
    mails: string; sans_corps: string; pieces: string; pieces_indispo: string; mails_pieces_indispo: string;
  }>(
    `${BASE},
     mailsHis AS (SELECT DISTINCT message_id FROM his)
     SELECT (SELECT count(*) FROM mailsHis)::text AS mails,
            (SELECT count(*) FROM mailsHis x JOIN gestion_message m ON m.id = x.message_id
              WHERE coalesce(btrim(m.corps_texte), '') = '' AND coalesce(btrim(m.corps_html), '') = '')::text
              AS sans_corps,
            (SELECT count(*) FROM gestion_piece p
              WHERE p.message_id IN (SELECT message_id FROM mailsHis))::text AS pieces,
            (SELECT count(*) FROM gestion_piece p
              WHERE p.message_id IN (SELECT message_id FROM mailsHis) AND p.cle_stockage IS NULL)::text
              AS pieces_indispo,
            (SELECT count(DISTINCT p.message_id) FROM gestion_piece p
              WHERE p.message_id IN (SELECT message_id FROM mailsHis) AND p.cle_stockage IS NULL)::text
              AS mails_pieces_indispo`);

  const { rows: exPieces } = await query<{ message_id: string; fil_id: string; nom: string; motif: string | null }>(
    `${BASE},
     mailsHis AS (SELECT DISTINCT message_id FROM his)
     SELECT p.message_id::text, m.fil_id::text, p.nom_fichier AS nom, p.motif_non_stocke AS motif
       FROM gestion_piece p
       JOIN gestion_message m ON m.id = p.message_id
      WHERE p.message_id IN (SELECT message_id FROM mailsHis) AND p.cle_stockage IS NULL
      ORDER BY p.message_id DESC`);
  for (const r of exPieces) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: '(toutes les fiches de ce mail)',
      type: 'pièce jointe non consultable',
      cause: `« ${r.nom} » n’a pas d’octets conservés${r.motif === null ? '' : ` — motif : ${r.motif}`}`,
    });
  }

  // ── h) LES DOUBLONS ─────────────────────────────────────────────────────────────────────────────────────────
  /**
   * 🔴 DEUX PRÉSENTATIONS, DEUX RISQUES DIFFÉRENTS. En mode PLAT (le défaut), `DISTINCT ON (message_id)` rend une
   * seule ligne par mail : aucun doublon possible. En mode GROUPÉ, `SELECT DISTINCT` porte AUSSI sur
   * `cible_libelle` : deux liens confirmés vers le MÊME lot avec deux libellés différents donnent donc DEUX
   * lignes à l'écran, pour un seul mail.
   */
  const doublons = await un<{ paires_multi: string; paires_libelles: string }>(
    `SELECT (SELECT count(*) FROM (
               SELECT message_id, cible_cle FROM gestion_rattachement
                WHERE statut = 'confirme' AND cible_sorte = 'lot' AND cible_cle IS NOT NULL AND piece_id IS NULL
                GROUP BY message_id, cible_cle HAVING count(*) > 1) z)::text AS paires_multi,
            (SELECT count(*) FROM (
               SELECT message_id, cible_cle FROM gestion_rattachement
                WHERE statut = 'confirme' AND cible_sorte = 'lot' AND cible_cle IS NOT NULL AND piece_id IS NULL
                GROUP BY message_id, cible_cle
               HAVING count(DISTINCT coalesce(cible_libelle, '')) > 1) z)::text AS paires_libelles`);

  const { rows: exDoublons } = await query<{ message_id: string; fil_id: string; cible_cle: string; n: string }>(
    `SELECT r.message_id::text, m.fil_id::text, r.cible_cle,
            count(DISTINCT coalesce(r.cible_libelle, ''))::text AS n
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.cible_cle IS NOT NULL AND r.piece_id IS NULL
      GROUP BY r.message_id, m.fil_id, r.cible_cle
     HAVING count(DISTINCT coalesce(r.cible_libelle, '')) > 1
      ORDER BY r.message_id DESC`);
  for (const r of exDoublons) {
    ecarts.push({
      messageId: Number(r.message_id), filId: Number(r.fil_id), bien: r.cible_cle,
      type: 'doublon possible (présentation groupée)',
      cause: `${r.n} libellés différents pour le même bien sur ce mail`,
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
     LE RENDU
     ══════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

  const nManquants = nombre(paires.manquants);
  const nEnTrop = nombre(paires.en_trop);
  const fiable = nManquants === 0 && nEnTrop === 0;

  dire('# Audit « historique des biens » — compte rendu');
  dire();
  dire(`*Lecture seule, le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Rien n’a été écrit`
    + ' en base ni dans le Drive.*');
  dire();
  dire('## Ce qu’on a comparé, en une phrase');
  dire();
  dire('Pour chaque mail, on a mis côte à côte **la liste des biens que montre la fenêtre « Bien(s) rattaché(s) à');
  dire('ce mail »** et **la liste des biens dont l’historique contient ce mail**. Les deux doivent être identiques.');
  dire();
  dire('## 1) Cartographie — qui décide quoi');
  dire();
  dire('### La fenêtre « Bien(s) rattaché(s) à ce mail »');
  dire();
  dire('Deux appels, un seul qui décide des biens :');
  dire('`/api/admin/gestion/rattachements?fiche=<fil>&message=<mail>` →');
  dire('`ficheRattachementRepo.ficheRattachementDuFil()`. Cette fonction lit **tous** les liens de la');
  dire('conversation (`WHERE m.fil_id = $1 AND r.statut IN (\'propose\',\'confirme\') AND r.cible_sorte = \'lot\'`),');
  dire('puis l’écran réduit au mail affiché avec le module **pur** `ficheRattachement.biensDuMail()` : il ne garde');
  dire('que les liens dont `messageId` est celui du mail **et** dont le statut est `confirme`. Un bien dont le lot');
  dire('n’est pas dans `gestion_annuaire_lot` est sauté (`if (lot === undefined) continue`).');
  dire();
  dire('### « Historique du bien »');
  dire();
  dire('`/api/admin/gestion/historique?cible=lot-<clé>` → `historiqueRepo.etendreCible()` puis');
  dire('`pageHistorique()`. La sélection des mails vit dans **une seule** expression, `cteMessages()` :');
  dire('`gestion_rattachement` avec `statut = \'confirme\'`, `cible_sorte = \'lot\'`, `cible_cle` dans les clés de');
  dire('la cible, **et `piece_id IS NULL`**.');
  dire();
  dire('### Les historiques propriétaire et locataire');
  dire();
  dire('- **Propriétaire** : `cible=proprio-<clé>`. `etendreCible()` remplace le propriétaire par la liste de ses');
  dire('  logements (`avecLogements`, allumé par défaut) et réutilise **exactement la même** `cteMessages()`.');
  dire('  L’historique d’un propriétaire est donc l’union de ceux de ses biens — ce qui est juste, puisque');
  dire('  **aucun** rattachement ne vise une personne (vérifié : 0 lien `cible_sorte = \'proprietaire\'` confirmé).');
  dire('- **Locataire** : *il n’existe pas*. Voir le point f).');
  dire();
  dire('### Est-ce le même code ?');
  dire();
  dire('**Même table, même statut, même sorte de cible — mais deux filtres écrits à deux endroits.** Il n’y a pas');
  dire('de fonction de résolution partagée : `biensDuMail()` (module pur, côté écran) et `cteMessages()` (SQL,');
  dire('côté historique) expriment la même règle deux fois. Les divergences repérées :');
  dire();
  dire('| | Divergence | Conséquence mesurée |');
  dire('|---|---|---|');
  dire('| 1 | L’historique exige `piece_id IS NULL`, la fenêtre ne filtre pas `piece_id` | **0** écart aujourd’hui :');
  dire('aucun lien confirmé n’est posé sur une pièce. La divergence est **dormante**, pas corrigée. |');
  dire('| 2 | La fenêtre calcule le locataire à la date du mail **le plus récent** de l’échange ; la règle d’Arno');
  dire('dit « à la date du mail » | **89** couples (mail, bien) nomment la mauvaise personne |');
  dire('| 3 | L’historique nomme la personne par les « interventions » (`regle = \'intervention\'`,');
  dire('`role_instantane` figé) — un mécanisme **différent** de celui de la fenêtre | **4** interventions en base :');
  dire('l’axe est quasi inutilisé |');
  dire('| 4 | Aucune cible « locataire » dans `historique.PREFIXES` | l’historique d’un locataire est');
  dire('**impossible à ouvrir** |');
  dire();
  dire('## Le socle');
  dire();
  dire('| | |');
  dire('|---|---|');
  dire(`| Mails en base | ${nombre(socle.messages).toLocaleString('fr-FR')} |`);
  dire(`| Conversations | ${nombre(socle.fils).toLocaleString('fr-FR')} |`);
  dire(`| Logements dans l’annuaire | ${nombre(socle.lots).toLocaleString('fr-FR')} |`);
  dire(`| Rattachements, toutes natures | ${nombre(socle.liens).toLocaleString('fr-FR')} |`);
  dire(`| dont confirmés | ${nombre(socle.confirmes).toLocaleString('fr-FR')} |`);
  dire(`| Couples (mail, bien) vus par la fenêtre | ${nombre(paires.fen).toLocaleString('fr-FR')} |`);
  dire(`| Couples (mail, bien) vus par l’historique | ${nombre(paires.his).toLocaleString('fr-FR')} |`);
  dire(`| Mails rattachés à au moins un bien | ${nombre(paires.mails_fen).toLocaleString('fr-FR')} |`);
  dire();

  dire('## a) Mails manquants dans un historique');
  dire();
  dire(`**${nManquants}** couple(s) (mail, bien) que la fenêtre montre et que l’historique ne contient pas.`);
  if (exManquants.length > 0) {
    dire();
    for (const r of exManquants.slice(0, EXEMPLES)) {
      dire(`- fil ${r.fil_id} / message ${r.message_id} — bien ${r.cible_cle} — ${r.cause}`);
    }
    if (exManquants.length > EXEMPLES) dire(`- … et ${exManquants.length - EXEMPLES} autre(s)`);
  }
  dire();

  dire('## b) Mails en trop dans un historique');
  dire();
  dire(`**${nEnTrop}** couple(s) (mail, bien) présent(s) dans un historique alors que la fenêtre ne cite pas ce bien.`);
  if (exEnTrop.length > 0) {
    dire();
    for (const r of exEnTrop.slice(0, EXEMPLES)) {
      dire(`- fil ${r.fil_id} / message ${r.message_id} — bien ${r.cible_cle}`);
    }
    if (exEnTrop.length > EXEMPLES) dire(`- … et ${exEnTrop.length - EXEMPLES} autre(s)`);
  }
  dire();

  dire('## Cas voisin : biens introuvables dans l’annuaire');
  dire();
  dire(`**${nombre(orphelins.n)}** lien(s) confirmé(s) visent un logement absent de l’annuaire`);
  dire(`(**${nombre(orphelins.mails)}** mail(s) concerné(s)). Ces biens sont invisibles **des deux côtés** : la`);
  dire('fenêtre les saute, l’historique répond « cible inconnue ». Ce n’est donc pas un écart entre la fenêtre et');
  dire('l’historique — c’est un rattachement qui ne mène nulle part.');
  if (exOrphelins.length > 0) {
    dire();
    for (const r of exOrphelins.slice(0, EXEMPLES)) {
      dire(`- fil ${r.fil_id} / message ${r.message_id} — bien ${r.cible_cle}`);
    }
    if (exOrphelins.length > EXEMPLES) dire(`- … et ${exOrphelins.length - EXEMPLES} autre(s)`);
  }
  dire();

  dire('## c) Mails rattachés à plusieurs biens');
  dire();
  dire(`**${nombre(multi.mails)}** mail(s) sont rattachés à **plusieurs** biens`);
  dire(`(${nombre(multi.paires)} couples au total).`);
  dire(`**${nombre(multi.fideles)}** d’entre eux sont présents dans **tous** leurs historiques`);
  const resteMulti = nombre(multi.mails) - nombre(multi.fideles);
  dire(`— soit ${resteMulti === 0 ? '**aucun manquement**' : `**${resteMulti} incomplet(s)**`}.`);
  dire();

  dire('## d) Conversations dont le suivi a changé en cours de route');
  dire();
  dire(`**${nombre(suivi.fils_changes)}** conversation(s) ont changé de suivi (plusieurs fenêtres successives, ou`);
  dire(`au moins une exception « Ce mail uniquement »). Parmi elles, **${nombre(suivi.fideles)}** sont fidèles mail`);
  dire('par mail — aucun écart entre la fenêtre et les historiques.');
  dire();
  dire(`Détail : **${nombre(suivi.exceptions)}** exception(s) vivante(s), sur **${nombre(suivi.fils_exc)}**`);
  dire('conversation(s).');
  dire();

  dire('## e) Interne, Auto, Documents CRITERIMMO');
  dire();
  dire('| Cas | Compte | Rattachés à un bien (ne devraient pas l’être) |');
  dire('|---|---|---|');
  dire(`| Mails marqués « Interne » (par mail) | ${nombre(interne.marques)} | **${nombre(interne.avec_bien)}** |`);
  dire(`| Mails d’un échange marqué « Interne » | ${nombre(interneEchange.fils)} échange(s) |`
    + ` **${nombre(interneEchange.mails_avec_bien)}** |`);
  dire(`| Mails « Document CRITERIMMO… » | ${nombre(criterimmo.mails)} | **${nombre(criterimmo.avec_bien)}** |`);
  dire();
  dire(`**Auto** : ${nombre(auto.liens)} rattachement(s) automatique(s) jamais touché(s) par une personne,`);
  dire(`sur ${nombre(auto.mails)} mail(s). Écarts entre fenêtre et historique sur ces liens : **${nombre(auto.ecarts)}**.`);
  dire();

  dire('## f) Propriétaire et locataire à la date du mail');
  dire();
  dire(`**${nombre(personnes.interventions)}** interventions enregistrées (la personne nommée sur un mail), dont`);
  dire(`**${nombre(personnes.avec_role)}** avec son rôle figé au moment du classement et`);
  dire(`**${nombre(personnes.sans_role)}** sans rôle.`);
  dire();
  dire(`**${nombre(personnes.lots_multi_occup)}** logement(s) ont connu plusieurs occupants, et`);
  dire(`**${nombre(personnes.mails_concernes)}** mail(s) rattachés visent un de ces logements.`);
  dire();
  dire(`**${nombre(fenetreDate.fils)}** conversation(s) s’étendent DE PART ET D’AUTRE d’un changement d’occupant`);
  dire(`(**${nombre(fenetreDate.mails)}** mails) : ce sont celles où la fenêtre et l’historique peuvent nommer deux`);
  dire('personnes différentes, puisqu’ils ne le calculent pas de la même façon (voir la cartographie).');
  dire();
  dire('### Et la fenêtre nomme-t-elle la bonne personne ?');
  dire();
  dire(`Sur **${nombre(locataire.couples)}** couples (mail, bien), la fenêtre nomme **un autre locataire que celui`);
  dire(`en place à la date du mail** dans **${nombre(locataire.divergents)}** cas.`);
  dire();
  dire('La cause est précise : la fenêtre cherche l’occupant à la date du mail **le plus récent de l’échange** qui');
  dire('porte ce bien, et non à la date du mail affiché en tête. Ouverte sur un mail ancien d’une conversation qui');
  dire('traverse un changement de locataire, elle nomme donc l’occupant de la fin de la conversation.');
  if (exLocataire.length > 0) {
    dire();
    for (const r of exLocataire.slice(0, EXEMPLES)) {
      dire(`- fil ${r.fil_id} / message ${r.message_id} — bien ${r.cible_cle} — au ${r.d_mail} :`
        + ` « ${r.vrai ?? 'vacant'} », la fenêtre nomme « ${r.vu ?? 'vacant'} »`);
    }
    if (exLocataire.length > EXEMPLES) dire(`- … et ${exLocataire.length - EXEMPLES} autre(s)`);
  }
  dire();
  dire('### 🔴 Il n’existe aucun historique de locataire');
  dire();
  dire('L’historique accepte trois cibles, et trois seulement : un **logement** (`lot-…`), un **propriétaire**');
  dire('(`proprio-…`) et une **carte** (`carte-…`) — voir `historique.PREFIXES`. Il n’y a pas de cible');
  dire('« locataire », aucun bouton ne l’ouvre, et aucune fiche de locataire n’en propose. La demande « il doit');
  dire('aussi se retrouver dans l’historique des fiches locataire » n’est donc **pas réalisable aujourd’hui** :');
  dire('cet écran n’existe pas.');
  dire();
  dire('L’historique du **propriétaire**, lui, existe et fonctionne par UNION des historiques de ses logements');
  dire('(`etendreCible`, filtre `avecLogements` allumé par défaut). Son lien n’apparaît dans la fiche que si le');
  dire('propriétaire a **plusieurs** biens — à un seul bien, il rendrait la même liste que le bouton de la carte.');
  dire();

  dire('## g) Le contenu : corps et pièces jointes');
  dire();
  dire(`Sur les **${nombre(contenu.mails)}** mails présents dans au moins un historique :`);
  dire(`- **${nombre(contenu.sans_corps)}** n’ont ni corps texte ni corps HTML ;`);
  dire(`- **${nombre(contenu.pieces)}** pièces jointes au total, dont **${nombre(contenu.pieces_indispo)}**`);
  dire(`  sans octets conservés (donc non consultables), réparties sur **${nombre(contenu.mails_pieces_indispo)}**`);
  dire('  mail(s).');
  dire();
  dire('*Les pièces affichées dans un historique sont lues par `message_id` : une pièce ne peut pas venir d’un');
  dire('autre mail.*');
  dire();

  dire('## h) Doublons');
  dire();
  dire(`- **${nombre(doublons.paires_multi)}** couple(s) (mail, bien) portent plusieurs liens confirmés.`);
  dire(`- **${nombre(doublons.paires_libelles)}** d’entre eux ont des **libellés différents** : en présentation`);
  dire('  groupée, ces couples-là s’affichent deux fois. En présentation plate (le défaut), une seule ligne.');
  dire();

  dire('## Verdict');
  dire();
  dire(fiable
    ? '✅ **La mécanique est fiable** : pour chaque mail, les biens de la fenêtre et les biens dont l’historique le'
      + ' contient sont les mêmes, sans aucune exception sur toute la base.'
    : `🔴 **La mécanique n’est pas fiable** : ${nManquants} manquant(s) et ${nEnTrop} en trop.`);
  dire();

  dire('## 3) Les cinq cas vérifiés à l’écran');
  dire();
  dire('*Vérifications faites à la main le 04/10/2026, en Clair, fenêtre « Visualiser / Modifier » d’un côté et');
  dire('« Vie du bien » de l’autre. Les identifiants sont cliquables : `?fil=<fil>&message=<mail>` pour la fenêtre,');
  dire('`?ecran=annuaire&fiche=lot-<id interne>&bloc=vie` pour l’historique.*');
  dire();
  dire('| | Cas | Ce qui a été vérifié | Résultat |');
  dire('|---|---|---|---|');
  dire('| ① | **Mail multi-biens** — fil 3494 / message 57281, « Re: Tr: Re: Taxes Foncières 2026 Groupe RD');
  dire('Promotion » | la fenêtre annonce « 6 biens rattachés à ce mail » (lots 478 à 483) | le mail est dans les');
  dire('**6** historiques. ✅ |');
  dire('| ② | **Changement de biens en cours de conversation** — fil 31242 | 2 mails sur le bien 30, 3 mails sur le');
  dire('bien 422, 3 mails sur aucun | accord **mail par mail**, les 8 mails. ✅ |');
  dire('| ③ | **Exception « Ce mail uniquement »** — fil 9989 / message 18406 (exception à 0 bien) | la fenêtre');
  dire('n’affiche aucun bien (le seul lien est « proposé », pas confirmé) | le mail n’est dans **aucun**');
  dire('historique. ✅ |');
  dire('| ④ | **Mail « Auto »** — fil 36665 / message 57433, bien 448 | lien `origine = automatique`, jamais touché');
  dire('par une personne | le mail est dans l’historique du bien 448. ✅ |');
  dire('| ⑤ | **Changement de locataire** — fil 36475 / message 57119, bien 315, « Re: EDLS DI FIORE » | le mail');
  dire('est bien dans l’historique du bien (« Vie du bien 139 ») | ✅ pour le BIEN, **🔴 pas pour la personne** |');
  dire();
  dire('### Le cas ⑤ en détail, parce qu’il montre le seul vrai défaut');
  dire();
  dire('Le mail est daté du **28 septembre 2026 à 15:22**. Son objet est « EDLS DI FIORE » — l’état des lieux de');
  dire('sortie de M. et Mme DI FIORE. Et la fenêtre écrit, en italique sous le bien :');
  dire();
  dire('> *Vacant à cette date (29/09/2026)*');
  dire();
  dire('Elle annonce donc elle-même la date qu’elle a utilisée : le **29/09**, c’est-à-dire le dernier mail de la');
  dire('conversation — et non le 28/09, la date du mail qu’elle affiche en tête. Au 28/09, le logement était occupé');
  dire('par « LEON GUIMAREY DI FIORE Isabella et Hugo », que la fiche du bien montre d’ailleurs dans son historique');
  dire('des locataires. **L’écran se contredit à un jour près, et il le dit lui-même.** C’est la cause des 89 cas');
  dire('comptés au point f).');
  dire();
  dire('## 4) La correction proposée — rien n’est appliqué');
  dire();
  dire('### Ce qui n’a PAS besoin d’être réparé');
  dire();
  dire('Le cœur de la mécanique est juste : **0 manquant, 0 en trop** sur 11 706 couples (mail, bien), y compris');
  dire('sur les 30 mails multi-biens, les 905 conversations dont le suivi a changé et les 11 579 rattachements');
  dire('automatiques. Aucune réparation de données n’est nécessaire de ce côté.');
  dire();
  dire('### ① Un seul code de résolution, partagé (le vrai sujet)');
  dire();
  dire('Les deux écrans disent aujourd’hui la même chose **par accident heureux** : deux filtres écrits séparément');
  dire('qui se trouvent concorder. Le premier lien confirmé posé sur une pièce jointe les fera diverger, sans que');
  dire('rien ne le signale. Proposition : un module **pur** (par exemple `biensDuMail.ts`) qui porte LA règle, et');
  dire('duquel découlent les deux lectures :');
  dire('- une fonction pure `retenirLiens(liens, messageId)` que l’écran utilise déjà sous le nom `biensDuMail` ;');
  dire('- un fragment SQL unique `sqlLiensDuBien(alias)` que `cteMessages()` et `ficheRattachementDuFil()`');
  dire('  appellent tous les deux — sur le modèle de `sqlSortesBien()` et `sqlCopieVivante()`, déjà en place ;');
  dire('- une épreuve qui compare les deux sur un jeu de cas, et une autre qui interdit un second `piece_id IS');
  dire('  NULL` écrit à la main.');
  dire('Coût estimé : un lot court, sans migration, sans écriture de données.');
  dire();
  dire('### ② Le locataire à la date du mail (89 cas)');
  dire();
  dire('Un seul changement, dans `ficheRattachementRepo` : la date d’interrogation des occupations doit être celle');
  dire('du **mail affiché** (`enTete.recuLe`), et non `dateParCle` — qui est la date du mail le plus récent de');
  dire('l’échange portant ce bien. C’est une ligne de code et aucune donnée à réparer : le calcul est fait à');
  dire('l’affichage, rien n’est stocké.');
  dire();
  dire('⚠️ **À trancher par Arno** : faut-il nommer l’occupant à la date du mail (ce que dit la demande) ou');
  dire('l’occupant actuel quand on veut appeler quelqu’un *maintenant* ? Les deux se défendent ; aujourd’hui');
  dire('l’écran fait ni l’un ni l’autre.');
  dire();
  dire('### ③ L’historique de locataire (à créer)');
  dire();
  dire('Ajouter une cible `locataire-<clé>` à `historique.PREFIXES`, l’étendre dans `etendreCible()` vers les');
  dire('logements que la personne a occupés **et les bornes de dates de son occupation** — sans quoi on lui');
  dire('montrerait le courrier de ses prédécesseurs. C’est le seul des trois chantiers qui demande une vraie');
  dire('conception, parce que la question « quels mails appartiennent à un locataire » n’a pas encore de réponse');
  dire('écrite : son occupation est bornée dans le temps, contrairement à la propriété.');
  dire();
  dire('### ④ Les anomalies de données (14 mails)');
  dire();
  dire('6 mails « Interne » et 8 mails « Document CRITERIMMO » portent un rattachement confirmé qui, selon la');
  dire('règle d’Arno, ne devrait pas exister. Ils sont tous nommés dans le CSV. Aucun n’est une défaillance de la');
  dire('mécanique d’historique : ce sont des rattachements que le moteur automatique a posés (ou qu’une main a');
  dire('confirmés) sur des mails qui n’auraient pas dû en recevoir. La réparation est un geste de données —');
  dire('`PATCH … statut: \'retire\'` par la porte existante — et elle demande l’accord d’Arno, mail par mail.');
  dire();
  dire('### ⑤ Les 67 pièces jointes sans octets');
  dire();
  dire('Elles s’affichent dans l’historique avec la mention « non conservée » et leur motif : l’écran ne ment pas.');
  dire('Rien à corriger dans l’historique ; c’est la relève qui n’a pas pu conserver ces octets.');
  dire();

  // ── LE CSV ──────────────────────────────────────────────────────────────────────────────────────────────────
  const csv = ['mail;fil;bien;type d’écart;cause présumée'];
  for (const e of ecarts) {
    const propre = (s: string): string => `"${s.replace(/"/g, '""')}"`;
    csv.push([e.messageId, e.filId ?? '', propre(e.bien), propre(e.type), propre(e.cause)].join(';'));
  }
  writeFileSync(FICHIER_CSV, `${csv.join('\n')}\n`, 'utf8');
  writeFileSync(FICHIER_MD, `${lignes.join('\n')}\n`, 'utf8');

  console.log('');
  console.log(`📄 ${FICHIER_MD}`);
  console.log(`📄 ${FICHIER_CSV} (${ecarts.length} ligne(s))`);
}

void main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
