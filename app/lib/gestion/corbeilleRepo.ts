/**
 * MODULE « GESTION » — LA CORBEILLE. IMPUR (base).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 RÉÉCRIT PAR LE LOT BOITE-INTERNE-CORBEILLE (29/09/2026), ET IL FAUT DIRE CE QUI A CHANGÉ.
 *
 * CE FICHIER PORTAIT (lot 5-BOITE-3, 25/09) une corbeille ENTIÈREMENT INTERNE : « Supprimer » voulait dire « je ne
 * veux plus voir cet échange dans mes boîtes », on posait une date sur `gestion_fil`, et le mail ne bougeait pas
 * d'un octet dans Gmail. C'était le choix d'Arno à l'époque, et il était cohérent : la portée qui aurait permis de
 * toucher Gmail n'était pas demandée.
 *
 * DÉCISION D'ARNO DU 29/09/2026 : c'est la corbeille de GMAIL qui fait foi — un seul état, synchronisé, comme le
 * spam et comme le lu/non lu. La raison est celle qui gouverne tout ce module depuis le lot 5-FIDÈLE : quand deux
 * états racontent la même chose, l'un des deux finit par mentir, et c'est toujours celui qu'on regarde.
 *
 * 🔒 LA CORBEILLE INTERNE N'AVAIT JAMAIS SERVI : 0 échange sur 36 531, mesuré avant de la remplacer. Rien à migrer,
 * rien à reprendre, personne à prévenir. Ses colonnes restent en base (voir la migration 275) — un invariant dépassé
 * se RÉÉCRIT, il ne s'efface pas.
 *
 * ═══ CE QUE CE FICHIER FAIT MAINTENANT ══════════════════════════════════════════════════════════════════════════
 *
 * Il tient le MIROIR de la corbeille de Gmail dans `gestion_message.corbeille_le`, et rien d'autre :
 *   · `marquerCorbeille`    — après qu'un geste a RÉUSSI chez Gmail, on note l'état ici ;
 *   · `reconcilier`         — la relève relit « [Gmail]/Corbeille » et fait coïncider les deux ;
 *   · `idsDeLaCorbeille`    — « tout sélectionner », au-delà de la page affichée ;
 *   · `tracerSuppression`   — ce qu'on GARDE d'un mail supprimé définitivement.
 *
 * 🔴 ON N'ÉCRIT JAMAIS ICI AVANT GMAIL. L'ordre est : Gmail d'abord, notre base ensuite. L'inverse afficherait un
 * mail à la corbeille alors qu'il est resté en Réception dans la vraie boîte — et personne ne le découvrirait
 * avant la passe suivante.
 *
 * 🔴 TOUT PASSE PAR LA SONDE DE SCHÉMA, HORS TRANSACTION. Sans la migration 275, ces fonctions rendent « pas
 * disponible » et n'émettent AUCUNE requête : nommer une colonne absente ferait échouer toute la boîte, pas
 * seulement le geste nouveau. C'est la leçon de la 251, et elle a déjà coûté assez cher.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { corbeilleGmailDisponible } from './schema';

/** Ce qu'un geste rapporte. `sans_schema` = la migration 275 n'est pas là ; l'écran ne propose alors pas le geste. */
export type IssueCorbeille =
  | { etat: 'ok'; touches: number }
  | { etat: 'sans_schema' };

/** Qui a fait le geste. Le libellé est FIGÉ : des années après, on doit pouvoir le lire même si le compte a disparu. */
export interface AuteurGeste { id: number | null; libelle: string }

/**
 * NOTE L'ÉTAT DE LA CORBEILLE SUR DES MESSAGES — APRÈS que Gmail l'a accepté, jamais avant.
 *
 * ⚠️ `maj_le` est touché aussi : c'est la colonne que le reste du module lit pour savoir quand un message a bougé.
 *
 * ⚠️ `coalesce(corbeille_le, now())` À LA POSE, et non `now()` sec : repasser sur un message DÉJÀ à la corbeille ne
 * doit pas rajeunir sa date. Elle dit « depuis quand », et c'est elle qui permettra un jour de prévenir qu'un mail
 * approche des 30 jours au bout desquels GMAIL l'efface lui-même.
 */
export async function marquerCorbeille(
  messageIds: readonly number[], aLaCorbeille: boolean, auteur: AuteurGeste,
): Promise<IssueCorbeille> {
  if (!await corbeilleGmailDisponible()) return { etat: 'sans_schema' };
  if (messageIds.length === 0) return { etat: 'ok', touches: 0 };

  const { rowCount } = await query(
    aLaCorbeille
      ? `UPDATE gestion_message SET corbeille_le = coalesce(corbeille_le, now()), maj_le = now()
          WHERE id = ANY($1::bigint[])`
      : `UPDATE gestion_message SET corbeille_le = NULL, maj_le = now()
          WHERE id = ANY($1::bigint[])`,
    [[...messageIds]]);

  // Le journal, au mieux-effort : il ne doit JAMAIS défaire un geste qui a eu lieu dans la vraie boîte.
  await journaliser(messageIds, aLaCorbeille ? 'corbeille' : 'corbeille_reintegration', auteur,
    aLaCorbeille
      ? 'Mail mis à la corbeille de GMAIL — il y part donc pour toute l’équipe. Notre copie, elle, reste en base, '
        + 'et la réintégration est à un clic. Passé 30 jours, Gmail efface le contenu de sa corbeille lui-même.'
      : 'Mail réintégré depuis la corbeille de Gmail : il a retrouvé sa place, en Réception ou dans Envoyés.',
    aLaCorbeille ? 'dans ses boîtes' : 'à la corbeille',
    aLaCorbeille ? 'à la corbeille' : 'dans ses boîtes');

  return { etat: 'ok', touches: rowCount ?? 0 };
}

/**
 * ══ 🔴 CE QU'ON GARDE D'UN MAIL SUPPRIMÉ DÉFINITIVEMENT ════════════════════════════════════════════════════════
 *
 * Demande d'Arno : « on garde une trace minimale (id, date, supprimé définitivement par Arno) ». Cette fonction est
 * TOUTE la trace, et elle n'efface rien par elle-même — l'effacement en base, s'il a lieu un jour, sera un geste
 * distinct et demandé explicitement.
 *
 * 🔴 LA COPIE DRIVE DES PIÈCES N'EST PAS TOUCHÉE. Aucune ligne de ce fichier, ni d'aucun fichier de ce lot,
 * n'atteint le Drive. Une pièce versée dans le dossier d'un client appartient au dossier du client, pas au mail
 * qui l'a apportée : supprimer le mail ne peut pas retirer la pièce du dossier.
 */
export async function tracerSuppression(
  messageIds: readonly number[], auteur: AuteurGeste,
): Promise<void> {
  if (messageIds.length === 0) return;
  await journaliser(messageIds, 'suppression_definitive', auteur,
    'Mail supprimé DÉFINITIVEMENT de Gmail, à la demande d’un humain. Irréversible côté Gmail. '
    + 'Aucune copie Drive n’a été touchée. Notre copie en base n’est pas effacée par ce geste.',
    'à la corbeille', 'supprimé définitivement de Gmail');
}

/**
 * LE JOURNAL, EN APPEND-ONLY. Une ligne par message : c'est ce qui permet, des mois après, de répondre à « qui a
 * supprimé ce mail, et quand ? » sans dépendre d'une colonne qu'on a pu remettre à NULL entre-temps.
 *
 * ⚠️ IL NE DOIT JAMAIS DÉFAIRE UN GESTE QUI A EU LIEU. Le geste, lui, s'est produit dans la vraie boîte Gmail :
 * échouer à l'écrire ici est regrettable, le remonter comme une erreur serait faux.
 */
async function journaliser(
  messageIds: readonly number[], action: string, auteur: AuteurGeste,
  commentaire: string, avant: string, apres: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire,
                                    auteur_id, auteur_libelle)
       SELECT 'message', id, $2, $3, $4, $5, $6, $7 FROM unnest($1::bigint[]) AS t(id)`,
      [[...messageIds], action, avant, apres, commentaire, auteur.id, auteur.libelle]);
  } catch (e) {
    console.error('[gestion/corbeille] geste accompli mais NON journalisé', { action, n: messageIds.length, e });
  }
}

/**
 * ══ 🔴 « SÉLECTIONNER LES N ÉCHANGES DE LA CORBEILLE » ══════════════════════════════════════════════════════════
 *
 * Rend les identifiants de TOUS les échanges de la corbeille, pas seulement ceux de la page affichée.
 *
 * 🔴 LA LISTE EST RENDUE AU CLIENT, ET C'EST DÉLIBÉRÉ. On aurait pu faire agir le serveur sur « tout ce qui est à
 * la corbeille » sans jamais nommer ce qu'on vise — c'est plus court, et c'est précisément ce qu'il ne faut pas
 * faire pour un geste irréversible : entre le clic sur « tout sélectionner » et la confirmation, la relève peut
 * passer et en ajouter trois. L'écran doit supprimer CE QU'IL A MONTRÉ, pas « ce qui s'y trouvera ».
 *
 * ⚠️ BORNÉE. Au-delà, l'écran dit combien il en a pris — il ne prétend jamais avoir tout sélectionné.
 */
export const SELECTION_MAX = 1_000;

export async function idsDeLaCorbeille(
  limite = SELECTION_MAX,
): Promise<{ ids: number[]; total: number; mails: number } | null> {
  if (!await corbeilleGmailDisponible()) return null;
  /**
   * ⚠️ DES ÉCHANGES, PAS DES MESSAGES — la liste rend une ligne par échange, et « tout sélectionner » doit
   * sélectionner ce que la liste montre. Le geste, lui, portera sur TOUS les mails supprimés de ces échanges
   * (`messagesDuFil(..., seulementCorbeille)`) : rien n'est laissé derrière.
   */
  /**
   * ⚠️ `mails` EST RENDU AUSSI, et ce n'est pas une curiosité : la confirmation d'une suppression définitive
   * annonce un nombre de MAILS, et « tout sélectionner » porte sur des échanges qui en contiennent parfois
   * plusieurs. Le compter ici, dans la MÊME lecture que la liste, évite d'avoir à le redemander — et surtout
   * évite qu'il soit calculé par une seconde requête qui dirait, un jour, autre chose.
   */
  const { rows } = await query<{ fil_id: string; total: string; mails: string }>(
    `SELECT fil_id::text, count(*) OVER ()::text AS total,
            (SELECT count(*)::text FROM gestion_message WHERE corbeille_le IS NOT NULL) AS mails
       FROM (SELECT fil_id, max(recu_le) AS le FROM gestion_message
              WHERE corbeille_le IS NOT NULL GROUP BY fil_id) x
      ORDER BY le DESC, fil_id DESC
      LIMIT $1`, [Math.min(Math.max(1, limite), SELECTION_MAX)]);
  return {
    ids: rows.map((r) => Number(r.fil_id)),
    total: Number(rows[0]?.total ?? 0),
    mails: Number(rows[0]?.mails ?? 0),
  };
}

/**
 * ══ 🔴 LA RÉCONCILIATION — CE QUI FAIT DE NOTRE COLONNE UN MIROIR, ET NON UNE OPINION ═══════════════════════════
 *
 * La relève lit le dossier « [Gmail]/Corbeille » EN ENTIER et passe ici la liste des `Message-ID` qui s'y trouvent.
 * On pose la marque sur ceux-là, et ON LA RETIRE DE TOUS LES AUTRES.
 *
 * 🔴 LES DEUX SENS, ET C'EST TOUT L'INTÉRÊT. Poser seulement laisserait à la corbeille un mail que quelqu'un a
 * réintégré depuis Gmail sur son téléphone — il y resterait pour toujours, invisible dans ses vraies boîtes. Gmail
 * fait foi : ce qui n'est plus dans son dossier n'est plus à la corbeille, sans discussion.
 *
 * 🔴 ET LE DOSSIER EST LU EN ENTIER, JAMAIS SUR UNE FENÊTRE DE DATES. La corbeille de Gmail se vide toute seule au
 * bout de 30 jours, mais ce délai court depuis la MISE à la corbeille — on y met parfaitement un mail vieux de deux
 * ans. Une fenêtre sur `recu_le` en aurait donc manqué, et la réconciliation les aurait « sortis » de la corbeille
 * sans que personne ne l'ait demandé. C'est bon marché : 201 messages au 29/09/2026.
 *
 * ⚠️ RIEN N'EST SUPPRIMÉ, DANS AUCUN DES DEUX SENS. On pose ou l'on retire une date, c'est tout.
 */
export async function reconcilier(messageIdsRfc: readonly string[]): Promise<{
  poses: number; retires: number; refuse?: 'aucune_correspondance';
} | null> {
  if (!await corbeilleGmailDisponible()) return null;
  const presents = deuxEcritures(messageIdsRfc);

  /**
   * ══ 🔴🔴 LE GARDE-FOU, ET IL VIENT D'UN DÉFAUT RÉEL DU 29/09/2026 ══════════════════════════════════════════════
   *
   * PREMIÈRE VERSION, en production locale : le dossier de Gmail contenait 16 mails, la capture venait de les
   * écrire… et la réconciliation A VIDÉ LA COLONNE ENTIÈRE. Aucune erreur, aucun message : `corbeille_le` est
   * simplement passée de 10 à 0. La cause est en dessous (`deuxEcritures`) ; ce qui compte ici est qu'AUCUNE
   * alarme ne s'est déclenchée — un effacement total ressemblait exactement à un travail bien fait.
   *
   * LA RÈGLE QUI EN SORT : « le dossier n'est pas vide, et pourtant rien ne correspond » n'est pas un ÉTAT, c'est
   * une SIGNATURE DE PANNE. On refuse alors de retirer quoi que ce soit, et on le DIT. Une corbeille réellement
   * vide, elle, passe sans encombre — c'est `messageIdsRfc.length === 0`, et il vide bien la colonne, parce que
   * c'est la vérité.
   */
  const { rows: corr } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_message WHERE message_id = ANY($1::text[])`, [presents]);
  if (messageIdsRfc.length > 0 && (corr[0]?.n ?? 0) === 0) {
    console.error('[gestion/corbeille] réconciliation REFUSÉE : le dossier porte des mails, aucun ne correspond '
      + 'chez nous. Rien n’a été retiré.', { lus: messageIdsRfc.length });
    return { poses: 0, retires: 0, refuse: 'aucune_correspondance' };
  }

  const pose = await query(
    `UPDATE gestion_message SET corbeille_le = coalesce(corbeille_le, now()), maj_le = now()
      WHERE message_id = ANY($1::text[]) AND corbeille_le IS NULL`, [presents]);
  const retire = await query(
    `UPDATE gestion_message SET corbeille_le = NULL, maj_le = now()
      WHERE corbeille_le IS NOT NULL AND NOT (message_id = ANY($1::text[]))`, [presents]);

  return { poses: pose.rowCount ?? 0, retires: retire.rowCount ?? 0 };
}

/**
 * ══ 🔴 LES DEUX ÉCRITURES D'UN `Message-ID` : AVEC ET SANS CHEVRONS ════════════════════════════════════════════
 *
 * LE DÉFAUT, MESURÉ LE 29/09/2026. Notre colonne `gestion_message.message_id` garde le `Message-ID` TEL QU'IL EST
 * DANS L'EN-TÊTE, chevrons compris : `<CAJ6+kPH…@mail.gmail.com>`. La relève, elle, lisait l'enveloppe IMAP et
 * ÔTAIT les chevrons avant de comparer. Résultat : zéro correspondance sur 16 mails, et la colonne vidée.
 *
 * ⚠️ POURQUOI PAS `btrim(message_id, '<>')` DANS LA REQUÊTE. Ce serait plus court, et ce serait une erreur : la
 * colonne porte une contrainte UNIQUE, donc un index, et une fonction appliquée à la colonne l'écarte — chaque
 * passe balaierait les 57 000 messages, deux fois. En envoyant les DEUX écritures dans le paramètre, l'égalité
 * reste une égalité, et l'index sert.
 *
 * ⚠️ ON N'IMPOSE PAS UNE FORME : on accepte les deux, des deux côtés. C'est la seule façon de ne pas dépendre de
 * ce que tel serveur IMAP renvoie tel jour. PUR (au sens : aucune lecture, aucun effet).
 */
export function deuxEcritures(messageIdsRfc: readonly string[]): string[] {
  const out = new Set<string>();
  for (const brut of messageIdsRfc) {
    const nu = (brut ?? '').trim().replace(/^</, '').replace(/>$/, '').trim();
    if (nu === '') continue;
    out.add(nu);
    out.add(`<${nu}>`);
  }
  return [...out];
}

/**
 * COMBIEN DE MAILS SONT À LA CORBEILLE. `null` = on ne sait pas (migration absente) : l'entrée ne s'affiche alors
 * pas du tout, plutôt qu'un zéro qui se lirait « la corbeille est vide ».
 *
 * ⚠️ MÊME NOMBRE QUE `comptesBoite().corbeille`, et c'est la MÊME condition écrite au même endroit : un compteur
 * qui compterait autrement annoncerait tôt ou tard un nombre que la liste ne montre pas.
 */
export async function compterCorbeille(): Promise<number | null> {
  if (!await corbeilleGmailDisponible()) return null;
  const { rows } = await query<{ n: number }>(
    `SELECT count(DISTINCT fil_id)::int AS n FROM gestion_message WHERE corbeille_le IS NOT NULL`);
  return rows[0]?.n ?? 0;
}
