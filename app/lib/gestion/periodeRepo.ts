import { query, withTransaction } from '../db/client';
import {
  periodesDisponibles, rattachementsDisponibles, interventionsDisponibles, interneDuMessageDisponible,
} from './schema';
import {
  effetDuChoix, periodeEnCours, projeter, reprendre, repriseFidele, simplifierLeSuivi,
  type ChoixSuivi, type Classement, type ExceptionMail, type Periode, type PersonneClassee,
  type Simplification,
} from './periodesConversation';
import { rattacher, changerStatut } from './rattachementRepo';
import { marquerInterne, annulerInterne, lireInterne } from './interneRepo';
import { marquerHorsGestion, annulerHorsGestion } from './horsGestionRepo';
/**
 * 🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — « interne » par MAIL, jumeau de « hors gestion ». La règle du
 * repli, elle, vit dans le module PUR `interneDuMail` : une seule écriture pour la liste, la modale et l'écran.
 */
/**
 * 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 2 — `declarerNonInterneDesMessages` écrit la ligne NÉE RETIRÉE qui dit
 * « on s'est prononcé sur ce mail ». C'est elle qui empêche le REPLI sur la marque d'échange de redonner
 * « Interne » à un mail — présent ou À VENIR — qu'une fenêtre a classé sur un bien. Voir son encadré, et celui de
 * la boucle de projection.
 */
import {
  marquerInterneDesMessages, annulerInterneDesMessages, declarerNonInterneDesMessages,
} from './interneMessageRepo';
import { MOTIF_INTERNE_PAR_SUIVI } from './interneDuMail';
/**
 * 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — le motif que `rattacher()` écrit quand il lève la marque d'un mail
 * auquel on vient de rattacher un bien. L'annulation doit le reconnaître : c'est lui, et non celui de la
 * projection, que portent les lignes écrites pendant le geste (voir l'encadré de la réouverture).
 */
import { MOTIF_LEVE_PAR_RATTACHEMENT } from './interneLevee';
import type { Auteur } from './gestes';
// 🔴🔴 LOT DOCUMENTS-HORS-BIENS — « ce mail est-il un de nos envois automatiques ? ». Module PUR.
import { estDocumentEnvoye } from './documentsAuto';
// 🔴🔴 LOT CONTACTS-EXTERNES — les interventions que la fenêtre projette, et le rôle recalculé mail par mail.
import {
  aDesInterventions, cleRole, poserInterventions, retirerInterventionsSansBien, rolesALaDateDesMails,
} from './contactExterneRepo';

/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION — LES PÉRIODES EN BASE, ET LEUR PROJECTION SUR LES MAILS ═══════════════════════
 *
 * ⚠️ PAS DE `import 'server-only'` ICI — convention du module (voir `horsGestionRepo.ts`).
 *
 * ═══ 🔴🔴 LE PARTAGE DES RÔLES, ET IL EST TOUT ════════════════════════════════════════════════════════════════
 *
 *   · `periodesConversation.ts` (PUR) DÉCIDE : quelle période s'applique à quel mail, ce que fait chaque choix,
 *     ce que devient l'existant. Tout s'y éprouve sur une table de cas, sans base.
 *   · CE FICHIER ÉCRIT : il range les périodes, puis les PROJETTE sur `gestion_rattachement`,
 *     `gestion_fil_interne` et `gestion_hors_gestion` — les tables que tout le reste de l'application lit.
 *
 * 🔴 POURQUOI PROJETER PLUTÔT QUE REMPLACER. La capsule d'une ligne de liste, l'historique d'un bien, les
 * compteurs, l'arbre du Drive et la file à trier lisent TOUS le classement d'un MAIL. En projetant, on répond à
 * la demande d'Arno (« un mail est dans l'historique d'un bien si sa période ou son exception contient ce
 * bien ») sans toucher à une seule de ces lectures — et sans risquer d'en oublier une.
 *
 * 🔴 LA PROJECTION PASSE PAR `rattacher` ET `changerStatut`, jamais par un `INSERT` direct. Ces deux fonctions
 * portent le journal, la levée du « hors gestion » au rattachement, le refus des cibles « personne » et
 * l'idempotence. Les contourner aurait créé un second chemin d'écriture, avec ses propres oublis.
 *
 * ⚠️ TANT QUE LA MIGRATION 290 MANQUE, TOUT ICI REND UN RÉSULTAT VIDE SANS NOMMER UNE SEULE TABLE : l'écran ne
 * rend pas le bloc « Suivi dans la conversation », et le classement se comporte comme avant ce lot.
 */

/** Ce qu'une conversation porte comme périodes et exceptions, déjà prêt pour le module pur. */
export interface SuiviDuFil {
  periodes: Periode[];
  exceptions: ExceptionMail[];
}

const VIDE: SuiviDuFil = { periodes: [], exceptions: [] };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA LECTURE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * LES PÉRIODES ET EXCEPTIONS VIVANTES D'UNE CONVERSATION. LECTURE SEULE.
 *
 * ⚠️ DEUX REQUÊTES POUR TOUT LE FIL, jamais deux par mail : un échange porte parfois trente messages.
 */
export async function suiviDuFil(filId: number): Promise<SuiviDuFil> {
  if (!(await periodesDisponibles())) return VIDE;
  try {
    /**
     * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES PERSONNES QUE LA FENÊTRE PORTE, LUES DANS LA MÊME REQUÊTE ═══════════
     *
     * ⚠️ LA SOUS-REQUÊTE N'EST ÉCRITE QUE SI LA MIGRATION 293 EST LÀ. Sans elle, `gestion_fil_periode_personne`
     * n'est NOMMÉE NULLE PART, et la lecture rend `NULL` — donc un classement sans personne, c'est-à-dire
     * exactement ce que ce fichier rendait avant ce lot. Nommer une table absente ferait échouer la lecture du
     * suivi, donc le bloc « Suivi dans la conversation » de CHAQUE mail (leçon du lot 4a).
     */
    const avecPersonnes = await interventionsDisponibles();
    const sqlPersonnesPeriode = avecPersonnes
      ? `(SELECT json_agg(json_build_object('sorte', x.cible_sorte, 'cle', x.cible_cle,
                                            'libelle', coalesce(x.cible_libelle, x.cible_cle),
                                            'contactExterneId', x.contact_externe_id))
            FROM gestion_fil_periode_personne x WHERE x.periode_id = p.id)`
      : 'NULL::json';
    const sqlPersonnesException = avecPersonnes
      ? `(SELECT json_agg(json_build_object('sorte', x.cible_sorte, 'cle', x.cible_cle,
                                            'libelle', coalesce(x.cible_libelle, x.cible_cle),
                                            'contactExterneId', x.contact_externe_id))
            FROM gestion_message_exception_personne x WHERE x.exception_id = e.id)`
      : 'NULL::json';

    const { rows: pr } = await query<{
      id: string; depuis_message_id: string; sorte: string; cree_par_libelle: string; cree_le: string;
      biens: { cle: string; libelle: string }[] | null;
      personnes: PersonneClassee[] | null;
    }>(
      `SELECT p.id::text, p.depuis_message_id::text, p.sorte, p.cree_par_libelle,
              to_char(p.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le,
              (SELECT json_agg(json_build_object('cle', b.cible_cle, 'libelle', b.cible_libelle))
                 FROM gestion_fil_periode_bien b WHERE b.periode_id = p.id) AS biens,
              ${sqlPersonnesPeriode} AS personnes
         FROM gestion_fil_periode p
        WHERE p.fil_id = $1 AND p.remplacee_le IS NULL
        ORDER BY p.id`, [filId]);

    const { rows: er } = await query<{
      id: string; message_id: string; sorte: string; cree_par_libelle: string; cree_le: string;
      biens: { cle: string; libelle: string }[] | null;
      personnes: PersonneClassee[] | null;
    }>(
      `SELECT e.id::text, e.message_id::text, e.sorte, e.cree_par_libelle,
              to_char(e.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le,
              (SELECT json_agg(json_build_object('cle', b.cible_cle, 'libelle', b.cible_libelle))
                 FROM gestion_message_exception_bien b WHERE b.exception_id = e.id) AS biens,
              ${sqlPersonnesException} AS personnes
         FROM gestion_message_exception e
         JOIN gestion_message m ON m.id = e.message_id
        WHERE m.fil_id = $1 AND e.retiree_le IS NULL
        ORDER BY e.id`, [filId]);

    return {
      periodes: pr.map((r) => ({
        id: Number(r.id), depuisMessageId: Number(r.depuis_message_id),
        classement: classementDe(r.sorte, r.biens, r.personnes),
        parLibelle: r.cree_par_libelle, le: r.cree_le,
      })),
      exceptions: er.map((r) => ({
        messageId: Number(r.message_id),
        classement: classementDe(r.sorte, r.biens, r.personnes),
        parLibelle: r.cree_par_libelle, le: r.cree_le,
      })),
    };
  } catch (e) {
    // ⚠️ SILENCIEUX : le suivi est un RENSEIGNEMENT de plus sur une conversation. Une lecture en échec ne doit pas
    //   empêcher de lire le courrier — l'écran se comporte alors comme avant ce lot.
    console.error('[gestion/periodes] lecture impossible (fil=%d)', filId, e);
    return VIDE;
  }
}

/**
 * ⚠️ « Interne » ET « Hors gestion » NE PORTENT AUCUNE PERSONNE, et ce n'est pas un oubli : une fenêtre qui dit
 * « cet échange ne concerne aucun logement » ne peut porter aucune intervention — la base l'exige (une
 * intervention sans bien vivant est refusée, migration 293). Les ignorer ici est donc la même règle, dite plus
 * tôt, et cela évite de projeter des liens que la base rejetterait un par un.
 */
function classementDe(
  sorte: string,
  biens: { cle: string; libelle: string }[] | null,
  personnes: PersonneClassee[] | null = null,
): Classement {
  if (sorte === 'interne') return { sorte: 'interne', biens: [] };
  if (sorte === 'hors_gestion') return { sorte: 'hors_gestion', biens: [] };
  const qui = (personnes ?? []).filter(
    (p) => (p.cle ?? '').trim() !== '' && (p.sorte === 'proprietaire' || p.sorte === 'locataire'));
  return qui.length === 0
    ? { sorte: 'biens', biens: biens ?? [] }
    : { sorte: 'biens', biens: biens ?? [], personnes: qui };
}

/**
 * ══ 🔴🔴 LOT BULLE-INFO-ET-S12 — CE QUE LA FENÊTRE DIT DE CHAQUE MAIL, POUR TOUT UN PAQUET ════════════════════
 *
 * Le moteur de rattachement en a besoin pour appliquer la décision d'Arno : « la fenêtre gagne ». Il lit donc,
 * pour les conversations qu'il examine, le classement projeté de chaque mail.
 *
 * ⚠️ DEUX REQUÊTES POUR TOUT LE PAQUET, jamais deux par mail : une passe en examine des centaines.
 *
 * ⚠️ SANS LA MIGRATION 290, RIEN N'EST NOMMÉ et la carte est VIDE : le moteur se comporte alors exactement comme
 * avant cette règle, puisque `faceALaFenetre(undefined, …)` rend « confirme ».
 */
export async function classementParMail(filIds: readonly number[]): Promise<Map<number, Classement>> {
  const parMail = new Map<number, Classement>();
  if (filIds.length === 0 || !(await periodesDisponibles())) return parMail;
  try {
    const { rows: mails } = await query<{ fil_id: string; id: string }>(
      `SELECT fil_id::text, id::text FROM gestion_message
        WHERE fil_id = ANY($1::bigint[]) ORDER BY recu_le, id`, [filIds]);
    const parFil = new Map<number, number[]>();
    for (const m of mails) {
      const f = Number(m.fil_id);
      parFil.set(f, [...(parFil.get(f) ?? []), Number(m.id)]);
    }
    for (const [filId, liste] of parFil) {
      const { periodes, exceptions } = await suiviDuFil(filId);
      if (periodes.length === 0 && exceptions.length === 0) continue;
      for (const [id, c] of projeter(liste, periodes, exceptions)) parMail.set(id, c);
    }
  } catch (e) {
    // ⚠️ SILENCIEUX : une lecture en échec ne doit pas arrêter une passe de 37 000 liens. Sans carte, le moteur
    //   retombe sur son comportement d'avant — jamais sur un comportement inventé.
    console.error('[gestion/periodes] classement par mail illisible', e);
  }
  return parMail;
}

/**
 * ══ 🔴🔴 LOT SUIVI-CONVERSATION-NON-RATTACHEE — CETTE CONVERSATION A-T-ELLE DÉJÀ UN RATTACHEMENT VALIDÉ ? ═════
 *
 * Demande d'Arno (02/10/2026) : « conversation DÉJÀ rattachée (au moins une période OU un rattachement
 * validé) ». Les périodes et les exceptions se lisent déjà ailleurs ; il manquait ce troisième fait.
 *
 * 🔴 « VALIDÉ » VEUT DIRE **CONFIRMÉ**, ET SEULEMENT CONFIRMÉ. Arno l'écrit noir sur blanc : « une proposition
 * pré-cochée par le moteur ne compte pas comme un rattachement validé ». Les lignes `propose` sont donc exclues —
 * c'est toute la différence entre « le moteur a une idée » et « quelqu'un a tranché ».
 *
 * ⚠️ `piece_id IS NULL` : un rattachement de PIÈCE JOINTE range un fichier dans un dossier, il ne classe pas le
 * mail. Le compter ferait passer pour « rattachée » une conversation dont aucun message ne l'est.
 *
 * ⚠️ `EXISTS` ET NON `count(*)` : on ne veut savoir que s'il y en a UN. Sur un fil de trente mails portant chacun
 * soixante-seize propositions, compter coûterait pour rien.
 *
 * ⚠️ SANS LA MIGRATION 257, on répond « non » sans nommer la table : la conversation est alors traitée comme
 * jamais rattachée, ce qui est exactement ce qu'elle est pour une base qui n'a pas de rattachements.
 */
export async function filRattache(filId: number): Promise<boolean> {
  if (!(await rattachementsDisponibles())) return false;
  try {
    const { rows } = await query<{ rattache: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
          WHERE m.fil_id = $1 AND r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
       ) AS rattache`, [filId]);
    return rows[0]?.rattache === true;
  } catch (e) {
    /**
     * ⚠️ SILENCIEUX, ET « NON » PLUTÔT QUE « OUI ». Une lecture en échec ne doit pas empêcher de classer ; et
     * entre les deux réponses possibles, « jamais rattachée » MONTRE le bloc au lieu de le cacher. On préfère
     * offrir un choix de trop qu'en escamoter un.
     */
    console.error('[gestion/periodes] rattachement du fil illisible (fil=%d)', filId, e);
    return false;
  }
}

/** Les mails d'une conversation, DANS L'ORDRE DE LECTURE. C'est cet ordre qui range les périodes. */
export async function mailsDuFil(filId: number): Promise<number[]> {
  const { rows } = await query<{ id: string }>(
    'SELECT id::text FROM gestion_message WHERE fil_id = $1 ORDER BY recu_le, id', [filId]);
  return rows.map((r) => Number(r.id));
}

/**
 * ══ 🔴🔴 LOT DOCUMENTS-HORS-BIENS — LES MAILS DE CE FIL QUI SONT DE NOS ENVOIS AUTOMATIQUES ════════════════════
 *
 * Une seule requête par conversation, et la décision reste au module PUR (`estDocumentEnvoye`) : le SQL se
 * contente de rapporter le sens, l'objet et la règle d'exclusion. Un jour où la définition changera, elle ne
 * changera qu'à un seul endroit.
 */
async function documentsDuFil(filId: number): Promise<Set<number>> {
  const { rows } = await query<{
    id: string; sens: string | null; objet: string | null; exclu_par_regle_id: number | null;
  }>(
    'SELECT id::text, sens, objet, exclu_par_regle_id FROM gestion_message WHERE fil_id = $1', [filId]);
  const docs = new Set<number>();
  for (const r of rows) {
    if (estDocumentEnvoye({ sens: r.sens, objet: r.objet, exclusionRegleId: r.exclu_par_regle_id })) {
      docs.add(Number(r.id));
    }
  }
  return docs;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 L'ÉCRITURE : POSER UN CLASSEMENT AVEC SON SUIVI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — CE QU'UN CLASSEMENT A ÉCRIT, POUR POUVOIR LE DÉFAIRE ════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DÉCISION D'ARNO (04/10/2026) : « “Annuler” REJOUE AUSSI LA DÉCISION DE SUIVI D'AVANT. Après Annuler, l'état est
 * exactement celui d'avant le geste : liens, interventions, marque Interne, ET décision de suivi (fenêtre,
 * personnes, en-tête du bandeau). Aucune “décision vide” ni fausse exception ne doit rester. »
 *
 * ═══ 🔴🔴 POURQUOI UNE TRACE D'IDENTIFIANTS, ET PAS UN « REJOUER LA DÉCISION D'AVANT » ══════════════════════════
 *
 * La tentation était de reposer l'ancienne décision par `poserClassement`. Elle ne tient pas, et c'est mesuré :
 * reposer une décision est un GESTE, qui passe par `effetDuChoix` — donc par la « règle du dernier choix ». Sur le
 * mail d'essai du lot précédent, reposer une décision VIDE a créé une exception « aucun bien » là où il n'y en
 * avait AUCUNE : la fausse exception que ce point interdit, fabriquée par la tentative de l'éviter.
 *
 * 🔴 ON DÉFAIT DONC LES ÉCRITURES, UNE PAR UNE, PAR LEUR IDENTIFIANT : on retire les lignes que le geste a
 * créées, et l'on ROUVRE celles qu'il avait fermées. L'état revient alors au bit près — mêmes lignes, mêmes
 * dates, mêmes auteurs, même en-tête de bandeau — ce qu'aucun nouveau geste ne peut faire.
 *
 * ⚠️ ET OUI, ROUVRIR EFFACE UNE DATE DE FERMETURE, ce qui est la seule exception du module à « on ne défait
 * jamais, on date et on signe ». Elle est bornée à ce que ce geste-ci a fermé, dans les deux minutes, sur sa
 * propre conversation — trois gardes, vérifiés en SQL. La trace de l'aller-retour reste lisible : la période
 * créée garde sa ligne, datée et refermée. Garder la fermeture aurait laissé la conversation sans aucune décision
 * vivante — c'est-à-dire un état que personne n'a choisi, et pire que celui qu'on répare.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface TraceClassement {
  filId: number;
  messageId: number;
  /** La période que le geste a insérée, s'il en a inséré une. */
  periodeCreee: number | null;
  /** L'exception que le geste a insérée, s'il en a inséré une. */
  exceptionCreee: number | null;
  /** Les périodes que le geste a DATÉES (`remplacee_le`) — à rouvrir. */
  periodesRemplacees: number[];
  /** Les exceptions que le geste a RETIRÉES (`retiree_le`) — à rouvrir. */
  exceptionsRetirees: number[];
}

/** Une trace vide : le geste n'a rien écrit du tout (règle 2 d'`effetDuChoix` sur une configuration identique). */
export function traceVide(filId: number, messageId: number): TraceClassement {
  return {
    filId, messageId, periodeCreee: null, exceptionCreee: null,
    periodesRemplacees: [], exceptionsRetirees: [],
  };
}

export type IssueSuivi =
  | { ok: true; projetes: number; trace: TraceClassement }
  | { ok: false; motif: string };

/**
 * ══ 🔴🔴 POSER UN CLASSEMENT, AVEC LE SUIVI CHOISI ════════════════════════════════════════════════════════════
 *
 * Les trois choix d'Arno, et ce que chacun écrit, sont décidés par le module PUR (`effetDuChoix`). Ici, on
 * range — puis on projette.
 *
 * 🔴 L'ORDRE DES GESTES EST LA FONCTIONNALITÉ, comme pour l'envoi :
 *   ① on écrit la PÉRIODE ou l'EXCEPTION (l'intention, celle qui survit et qui s'explique) ;
 *   ② on PROJETTE sur les mails concernés (l'effet, celui que tout le reste lit).
 * L'inverse laisserait, en cas d'incident entre les deux, des mails classés sans qu'on sache pourquoi — c'est
 * exactement l'état d'avant ce lot, et c'est lui qu'on répare.
 *
 * ⚠️ RIEN N'EST SUPPRIMÉ. Une période remplacée est DATÉE (`remplacee_le`), une exception retirée aussi. Et la
 * projection passe par `changerStatut('retire')`, qui date le lien au lieu de l'effacer.
 */
export async function poserClassement(o: {
  filId: number;
  messageId: number;
  classement: Classement;
  choix: ChoixSuivi;
  auteur: Auteur;
}): Promise<IssueSuivi> {
  if (!(await periodesDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 290).' };
  }
  if (!(await rattachementsDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 257).' };
  }
  const libelle = (o.auteur.libelle ?? '').trim();
  // 🔴 JAMAIS AUTOMATIQUE : une période est une décision humaine. La base le refuse aussi — on ne lui envoie pas
  //   une ligne qu'elle rejettera.
  if (libelle === '' || libelle.toLowerCase() === 'automatique') {
    return { ok: false, motif: 'Un suivi de conversation ne se pose qu’à la main : l’auteur doit être identifié.' };
  }

  const mails = await mailsDuFil(o.filId);
  if (!mails.includes(o.messageId)) return { ok: false, motif: 'Ce mail n’appartient pas à cette conversation.' };
  /**
   * 🔴 LOT CONTACTS-EXTERNES — LA SONDE EST LUE **UNE FOIS**, AVANT LA TRANSACTION. La lire dedans ferait une
   * requête `information_schema` au milieu d'une écriture ; et surtout, une sonde qui échouerait abandonnerait
   * TOUTE la transaction (PostgreSQL abandonne à la première erreur) — le piège du lot 4a, inscrit en tête de
   * `schema.ts`.
   */
  const avecPersonnes = await interventionsDisponibles();
  const avant = await suiviDuFil(o.filId);
  /**
   * 🔴🔴 LOT SUIVI-DERNIER-CHOIX — `mails` EST LA SEULE LIGNE NOUVELLE DE CETTE ÉCRITURE.
   *
   * C'est lui qui permet au module pur de répondre à la question d'Arno : « ce choix aboutit-il à la MÊME
   * configuration que celle en vigueur juste avant ce mail ? ». Sans l'ordre des mails, la question n'a pas de
   * sens — et la règle 2 se tait (voir `effetDuChoix`).
   */
  const effet = effetDuChoix({
    choix: o.choix, messageId: o.messageId, classement: o.classement,
    periodes: avant.periodes, exceptions: avant.exceptions, mails,
  });

  /**
   * 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — LA TRACE EST REMPLIE PAR LES ÉCRITURES ELLES-MÊMES.
   *
   * ⚠️ `RETURNING id` SUR CHAQUE `UPDATE`, ET NON LA LISTE DEMANDÉE À `effetDuChoix` : les deux ne sont pas la
   * même chose. `effetDuChoix` dit ce qu'il FAUT fermer ; le `RETURNING` dit ce qui a RÉELLEMENT été fermé — une
   * période déjà remplacée entre-temps, ou une exception déjà retirée, ne figure pas dans la seconde. Rouvrir
   * d'après la première ressusciterait une ligne que ce geste-ci n'avait pas fermée.
   */
  const trace = traceVide(o.filId, o.messageId);

  await withTransaction(async (q) => {
    // ① « Toute la conversation » : les périodes existantes sont DATÉES, jamais supprimées.
    if (effet.periodesRemplacees.length > 0) {
      const { rows } = await q<{ id: string }>(
        `UPDATE gestion_fil_periode SET remplacee_le = now(), remplacee_par_libelle = $2
          WHERE id = ANY($1::bigint[]) AND remplacee_le IS NULL RETURNING id::text`,
        [effet.periodesRemplacees, libelle]);
      trace.periodesRemplacees = rows.map((r) => Number(r.id));
    }
    // ② L'exception du mail qu'on reclasse en période : retirée, sinon elle masquerait la règle qu'on pose.
    if (effet.exceptionRetiree !== null) {
      const { rows } = await q<{ id: string }>(
        `UPDATE gestion_message_exception SET retiree_le = now()
          WHERE message_id = $1 AND retiree_le IS NULL RETURNING id::text`,
        [effet.exceptionRetiree]);
      trace.exceptionsRetirees = rows.map((r) => Number(r.id));
    }
    // ③ LA NOUVELLE PÉRIODE. « Toute la conversation » part du PREMIER mail de la conversation.
    if (effet.nouvellePeriode !== null) {
      const depuis = effet.nouvellePeriode.depuisMessageId === 0 ? mails[0] : effet.nouvellePeriode.depuisMessageId;
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_fil_periode (fil_id, depuis_message_id, sorte, cree_par, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
        [o.filId, depuis, o.classement.sorte, o.auteur.id, libelle]);
      trace.periodeCreee = Number(rows[0].id);
      await ecrireBiens(q, 'gestion_fil_periode_bien', 'periode_id', Number(rows[0].id), o.classement);
      // 🔴 LOT CONTACTS-EXTERNES — les personnes que cette fenêtre porte. Sans la 293, la fonction sort avant sa
      //   requête : aucune table nouvelle n'est nommée, et la fenêtre ne porte que ses biens, comme avant.
      await ecrirePersonnes(q, 'gestion_fil_periode_personne', 'periode_id', Number(rows[0].id), o.classement,
        avecPersonnes);
    }
    // ④ LA NOUVELLE EXCEPTION. Une seule vivante par mail — l'index unique partiel le garantit.
    if (effet.nouvelleException !== null) {
      /* ⚠️ CE RETRAIT-CI COMPTE AUSSI DANS LA TRACE : il ferme l'exception précédente du mail, et `effetDuChoix`
         ne le dit pas (`exceptionRetiree` vaut `null` pour « ce mail uniquement », parce que l'écriture s'en
         charge). Sans cette ligne, l'annulation rouvrirait la nouvelle et laisserait l'ancienne fermée. */
      const { rows: fermees } = await q<{ id: string }>(
        `UPDATE gestion_message_exception SET retiree_le = now()
          WHERE message_id = $1 AND retiree_le IS NULL RETURNING id::text`,
        [o.messageId]);
      trace.exceptionsRetirees = [...trace.exceptionsRetirees, ...fermees.map((r) => Number(r.id))];
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_message_exception (message_id, sorte, cree_par, cree_par_libelle)
         VALUES ($1, $2, $3, $4) RETURNING id::text`,
        [o.messageId, o.classement.sorte, o.auteur.id, libelle]);
      trace.exceptionCreee = Number(rows[0].id);
      await ecrireBiens(q, 'gestion_message_exception_bien', 'exception_id', Number(rows[0].id), o.classement);
      await ecrirePersonnes(q, 'gestion_message_exception_personne', 'exception_id', Number(rows[0].id),
        o.classement, avecPersonnes);
    }
  });

  const projetes = await projeterLeFil(o.filId, o.auteur, {
    // 🔴 SEUL « Toute la conversation » remplace un lien posé à la main — et il l'annonce avant (voir la modale).
    remplacerLesLiensManuels: o.choix === 'conversation',
  });
  return { ok: true, projetes, trace };
}

/**
 * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 1 — DÉFAIRE UN CLASSEMENT, EXACTEMENT ══════════════════════════════
 *
 * Arno : « Après Annuler, l'état est exactement celui d'avant le geste : liens, interventions, marque Interne, ET
 * décision de suivi (fenêtre, personnes, en-tête du bandeau). »
 *
 * ═══ 🔴 CE QU'ELLE FAIT, DANS CET ORDRE, ET POURQUOI CET ORDRE ══════════════════════════════════════════════════
 *
 *   ① ON RETIRE CE QUE LE GESTE A CRÉÉ (la période, l'exception). D'ABORD, et c'est la base qui l'impose :
 *      `gestion_message_exception_vivante_idx` n'accepte QU'UNE exception vivante par mail. Rouvrir l'ancienne
 *      avant de refermer la nouvelle échouerait sur l'index unique.
 *   ② ON ROUVRE CE QUE LE GESTE A FERMÉ (les périodes remplacées, les exceptions retirées).
 *   ③ ON REPROJETTE. 🔴🔴 ET C'EST LA CLÉ DU POINT : les LIENS et les INTERVENTIONS n'ont pas à être restaurés
 *      un par un — la projection est un DIFF vers la décision vivante. La décision étant redevenue celle
 *      d'avant, elle retire les liens que le geste avait posés, remet ceux qu'il avait retirés, et la cascade de
 *      la migration 293 suit pour les interventions. Un second chemin qui restaurerait les liens à la main
 *      divergerait de la projection au premier ajustement.
 *
 * ═══ 🔒 LES TROIS GARDES DE LA RÉOUVERTURE ══════════════════════════════════════════════════════════════════════
 *
 * Rouvrir une ligne fermée est la seule exception du module à « on ne défait jamais ». Elle est donc bornée :
 *   · aux identifiants que l'appelant NOMME (ceux que `poserClassement` a rendus) ;
 *   · à la CONVERSATION de la trace (`fil_id`, et pour une exception le `fil_id` de son mail) ;
 *   · aux fermetures de MOINS DE DEUX MINUTES. L'« Annuler » n'est offert que douze secondes ; deux minutes
 *     couvrent largement un clic tardif, et refusent un appel forgé qui voudrait ressusciter une décision
 *     d'hier.
 *
 * ⚠️ ELLE N'EST JAMAIS AUTOMATIQUE : comme `poserClassement`, elle refuse un auteur anonyme ou « automatique ».
 */
export async function annulerClassement(o: {
  trace: TraceClassement; auteur: Auteur;
}): Promise<IssueSuivi> {
  if (!(await periodesDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 290).' };
  }
  const libelle = (o.auteur.libelle ?? '').trim();
  if (libelle === '' || libelle.toLowerCase() === 'automatique') {
    return { ok: false, motif: 'Annuler un suivi de conversation ne se fait qu’à la main.' };
  }
  const t = o.trace;
  if (!Number.isSafeInteger(t.filId) || t.filId <= 0) return { ok: false, motif: 'Conversation inconnue.' };
  const ids = (l: readonly number[]): number[] =>
    [...new Set(l.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 500);

  await withTransaction(async (q) => {
    // ① CE QUE LE GESTE A CRÉÉ — refermé, jamais supprimé : la ligne reste, datée et signée.
    if (t.periodeCreee !== null) {
      await q(
        `UPDATE gestion_fil_periode SET remplacee_le = now(), remplacee_par_libelle = $3
          WHERE id = $1 AND fil_id = $2 AND remplacee_le IS NULL
            AND cree_le > now() - interval '2 minutes'`,
        [t.periodeCreee, t.filId, libelle]);
    }
    if (t.exceptionCreee !== null) {
      await q(
        `UPDATE gestion_message_exception e SET retiree_le = now()
          WHERE e.id = $1 AND e.retiree_le IS NULL AND e.cree_le > now() - interval '2 minutes'
            AND EXISTS (SELECT 1 FROM gestion_message m WHERE m.id = e.message_id AND m.fil_id = $2)`,
        [t.exceptionCreee, t.filId]);
    }
    // ② CE QUE LE GESTE A FERMÉ — rouvert, sous les trois gardes.
    const periodes = ids(t.periodesRemplacees);
    if (periodes.length > 0) {
      await q(
        `UPDATE gestion_fil_periode SET remplacee_le = NULL, remplacee_par_libelle = NULL
          WHERE id = ANY($1::bigint[]) AND fil_id = $2
            AND remplacee_le IS NOT NULL AND remplacee_le > now() - interval '2 minutes'`,
        [periodes, t.filId]);
    }
    const exceptions = ids(t.exceptionsRetirees);
    if (exceptions.length > 0) {
      await q(
        `UPDATE gestion_message_exception e SET retiree_le = NULL
          WHERE e.id = ANY($1::bigint[])
            AND e.retiree_le IS NOT NULL AND e.retiree_le > now() - interval '2 minutes'
            AND EXISTS (SELECT 1 FROM gestion_message m WHERE m.id = e.message_id AND m.fil_id = $2)`,
        [exceptions, t.filId]);
    }
  });

  /**
   * ③ ON REPROJETTE, et `remplacerLesLiensManuels` EST VRAI : le geste qu'on défait a pu être « Toute la
   * conversation », qui déplace les liens posés à la main. Sans cette permission, l'annulation ne pourrait pas
   * les rendre — elle laisserait exactement les liens que le geste avait posés par-dessus eux.
   */
  const projetes = await projeterLeFil(t.filId, o.auteur, { remplacerLesLiensManuels: true });

  /**
   * ══ 🔴🔴 LE CAS QUE LA PROJECTION SEULE NE PEUT PAS TRAITER, ET IL EST FRÉQUENT ════════════════════════════
   *
   * ⚠️ `projeterLeFil` SORT À ZÉRO QUAND LA CONVERSATION N'A PLUS AUCUNE DÉCISION VIVANTE (« if (periodes.length
   * === 0 && exceptions.length === 0) return 0 »), et c'est juste : sans fenêtre, elle n'a rien à dire. Or
   * c'est exactement l'état où l'annulation nous laisse quand le geste avait posé la PREMIÈRE décision de la
   * conversation — le cas du mail d'essai du lot précédent. La projection ne retirerait alors AUCUN lien, et le
   * bien posé resterait, avec ses interventions.
   *
   * 🔴 ON LE FAIT DONC ICI, ET SOUS LES MÊMES GARDES : les liens que la PROJECTION a posés (son motif, écrit
   * nulle part ailleurs), créés dans les deux dernières minutes, sur les mails de cette conversation. Un lien
   * posé à la main, ou posé hier, n'est pas touché — ce ne sont pas ceux que ce geste-ci a créés.
   *
   * 🔴 PUIS LA CASCADE DES INTERVENTIONS, dans le même ordre que la projection : la base refuse une intervention
   * sans lien vivant vers un bien sur le même mail (migration 293).
   */
  const restant = await suiviDuFil(t.filId);
  const tousLesMails = await mailsDuFil(t.filId);

  /**
   * ══ 🔴🔴 ET LA MARQUE « INTERNE » QUE LA PROJECTION DU GESTE AVAIT ÉCARTÉE ═════════════════════════════════
   *
   * ⚠️ DÉFAUT TROUVÉ PAR L'ÉPREUVE, PAS PAR UN RAISONNEMENT (`interneAnnulerEtSuite.itest.ts`, scénario « une
   * conversation SANS décision ») : le point 2 de ce lot fait écrire à la projection, sur chaque mail couvert
   * d'une conversation marquée interne, une ligne qui dit « on s'est prononcé ». Après l'annulation, ces lignes
   * restaient — et les mails restaient NON interne, alors que plus aucune fenêtre ne les couvrait.
   *
   * 🔴 ON ROUVRE DONC CES MARQUES, et SEULEMENT pour les mails que la décision RESTAURÉE ne couvre plus : ceux
   * que la fenêtre couvre encore doivent évidemment rester non interne — c'est ce que leur fenêtre dit.
   *
   * 🔴🔴 DEUX MOTIFS, ET IL EN FAUT DEUX — MESURÉ, PAS DEVINÉ. En posant le bien, la projection appelle
   * `rattacher()`, qui lève lui-même la marque du mail (lot PHOTOS-ET-INTERNE-INVERSE) : la ligne porte alors
   * `MOTIF_LEVE_PAR_RATTACHEMENT`, et la ligne de la projection n'est jamais écrite — `declarerNon…` ne
   * double pas une ligne existante. Le diagnostic du 04/10/2026 l'a montré : les lignes trouvées après le geste
   * portaient « levé en rattachant un bien à ce mail », et un filtre sur le seul motif de la projection ne
   * rouvrait donc RIEN. Les deux motifs désignent le même fait — « ce geste-ci a écarté la marque » — et l'on
   * défait les deux.
   *
   * 🔴 ET SEULEMENT CELLES-LÀ, reconnues à leur motif et à leur fraîcheur : une marque retirée à la main, ou il y
   * a une heure, n'a pas à ressusciter ici.
   *
   * ⚠️ UNE CHOSE NE REVIENT PAS À L'IDENTIQUE, ET IL FAUT LE SAVOIR : un mail qui était interne par le REPLI
   * redevient interne par SA PROPRE marque — la ligne que la projection avait écrite est rouverte au lieu d'être
   * effacée. L'écran dit exactement la même chose (`interneDuMail` rend « interne » dans les deux cas) ; la
   * provenance, elle, est plus précise qu'avant. C'est la même réserve que `remettreInterneApresAnnulation`, et
   * elle vient de la même règle : ce module ne supprime jamais une ligne.
   *
   * 🔒 `DISTINCT ON` ET LE `NOT EXISTS` : l'index unique partiel n'accepte qu'UNE marque vivante par mail. On ne
   * rouvre donc que la PLUS RÉCENTE, et jamais si le mail porte déjà une marque vivante.
   */
  if (tousLesMails.length > 0) {
    const couverts = projeter(tousLesMails, restant.periodes, restant.exceptions);
    const orphelins = tousLesMails.filter((m) => couverts.get(m) === undefined);
    if (orphelins.length > 0 && (await interneDuMessageDisponible())) {
      await query(
        `UPDATE gestion_message_interne
            SET retire_le = NULL, retire_par = NULL, retire_par_libelle = NULL, retire_motif = NULL
          WHERE id IN (
            SELECT DISTINCT ON (mi.message_id) mi.id
              FROM gestion_message_interne mi
             WHERE mi.message_id = ANY($1::bigint[])
               AND mi.retire_le IS NOT NULL
               AND mi.retire_le > now() - interval '2 minutes'
               AND coalesce(mi.retire_motif, '') = ANY($2::text[])
               AND NOT EXISTS (SELECT 1 FROM gestion_message_interne x
                                WHERE x.message_id = mi.message_id AND x.retire_le IS NULL)
             ORDER BY mi.message_id, mi.retire_le DESC, mi.id DESC)`,
        [orphelins, [MOTIF_INTERNE_PAR_SUIVI, MOTIF_LEVE_PAR_RATTACHEMENT]]);
    }
  }

  if (restant.periodes.length === 0 && restant.exceptions.length === 0) {
    const mails = tousLesMails;
    if (mails.length > 0) {
      const { changerStatut } = await import('./rattachementRepo');
      const { rows } = await query<{ id: string }>(
        `SELECT id::text FROM gestion_rattachement
          WHERE message_id = ANY($1::bigint[]) AND cible_sorte = 'lot' AND piece_id IS NULL
            AND statut = 'confirme' AND coalesce(motif, '') = $2
            AND cree_le > now() - interval '2 minutes'
          ORDER BY id`, [mails, MOTIF_POSE_PAR_SUIVI]);
      for (const r of rows) {
        await changerStatut({
          lienId: Number(r.id), statut: 'retire', auteur: o.auteur, motif: MOTIF_RETIRE_PAR_SUIVI,
        });
      }
      await retirerInterventionsSansBien(mails, o.auteur);
    }
  }
  return { ok: true, projetes, trace: traceVide(t.filId, t.messageId) };
}

type Requete = Parameters<Parameters<typeof withTransaction>[0]>[0];

async function ecrireBiens(
  q: Requete, table: string, colonne: string, id: number, c: Classement,
): Promise<void> {
  if (c.sorte !== 'biens' || c.biens.length === 0) return;
  // ⚠️ `jsonb_to_recordset` PLUTÔT QU'UNE BOUCLE : un seul aller-retour, et aucune interpolation de valeur.
  await q(
    `INSERT INTO ${table} (${colonne}, cible_cle, cible_libelle)
     SELECT $1, c.cle, c.libelle FROM jsonb_to_recordset($2::jsonb) AS c(cle text, libelle text)
     ON CONFLICT DO NOTHING`,
    [id, JSON.stringify(c.biens.map((b) => ({ cle: b.cle, libelle: b.libelle })))]);
}

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES PERSONNES D'UNE FENÊTRE OU D'UNE EXCEPTION ═══════════════════════════════
 *
 * La jumelle d'`ecrireBiens`, à la ligne près, et pour la même raison : un seul aller-retour, aucune
 * interpolation de valeur, `ON CONFLICT DO NOTHING` (l'index unique porte sur le triplet).
 *
 * ⚠️ `disponible` EST PASSÉ, PAS SONDÉ ICI : on est DANS une transaction, et une sonde qui échouerait
 * l'abandonnerait tout entière. L'appelant la lit avant d'ouvrir (voir `poserClassement`).
 *
 * ⚠️ UN CLASSEMENT « interne » OU « hors gestion » NE PORTE AUCUNE PERSONNE : `c.sorte !== 'biens'` sort, et
 * c'est la même règle que `classementDe` — une fenêtre sans logement ne peut porter aucune intervention.
 */
async function ecrirePersonnes(
  q: Requete, table: string, colonne: string, id: number, c: Classement, disponible: boolean,
): Promise<void> {
  if (!disponible) return;
  const qui = c.sorte === 'biens' ? (c.personnes ?? []) : [];
  if (qui.length === 0) return;
  await q(
    `INSERT INTO ${table} (${colonne}, cible_sorte, cible_cle, cible_libelle, contact_externe_id)
     SELECT $1, p.sorte, p.cle, p.libelle, p.contact
       FROM jsonb_to_recordset($2::jsonb) AS p(sorte text, cle text, libelle text, contact bigint)
     ON CONFLICT DO NOTHING`,
    [id, JSON.stringify(qui.map((p) => ({
      sorte: p.sorte, cle: p.cle, libelle: p.libelle, contact: p.contactExterneId ?? null,
    })))]);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA PROJECTION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 PROJETER LES PÉRIODES SUR LES MAILS DE LA CONVERSATION ═══════════════════════════════════════════════
 *
 * Pour chaque mail, on compare ce que la projection DEMANDE à ce que la base PORTE, et l'on ne touche qu'à la
 * différence. Rend le nombre de gestes réellement posés.
 *
 * 🔴 UN DIFF, ET NON UNE RÉÉCRITURE. Reposer un lien identique lui ferait perdre sa date, son auteur et son
 * motif d'origine — tout ce qui permet de dire, six mois plus tard, d'où vient un rattachement. C'est la même
 * règle que la modale de rattachement, et pour la même raison.
 *
 * ⚠️ ON NE TOUCHE QU'AUX LOTS. Les liens « événement » et les vieux liens « personne » ne sont pas du ressort
 * des périodes : les retirer au nom d'un classement qui ne parle pas d'eux serait une perte silencieuse.
 *
 * ⚠️ LES PROPOSITIONS DE L'AUTOMATISATION NE SONT PAS TOUCHÉES NON PLUS (point 3 d'Arno : « Les propositions
 * automatiques n'écrasent jamais une période ou une exception posée à la main » — et réciproquement, une
 * période ne rejette pas une proposition que personne n'a tranchée).
 */
/**
 * 🔴🔴 LA SIGNATURE DES LIENS QUE LA PROJECTION A POSÉS ELLE-MÊME — et c'est elle qui protège le geste humain.
 *
 * LE DÉFAUT QU'ELLE FERME, trouvé le 01/10/2026 par le scénario S11 du lot PREUVE-SUIVI-CONVERSATION : la
 * projection retirait TOUT lien confirmé qu'une fenêtre ne voulait plus — y compris celui qu'une personne avait
 * posé à la main. Arno : « Un rattachement posé à la main n'est jamais déplacé par un changement de fenêtre. »
 *
 * ⚠️ POURQUOI LE MOTIF, ET NON `origine`. Les liens de la projection passent par `rattacher`, qui écrit toujours
 * `origine = 'manuel'` (le geste est signé par la personne qui a posé la fenêtre). Le motif est donc le SEUL
 * marqueur qui distingue « posé par une fenêtre » de « posé à la main » — et il est écrit ici, une fois.
 *
 * ⚠️ MESURÉ SUR LA BASE RÉELLE AVANT LE CORRECTIF : 2 liens retirés par le suivi, tous deux posés par le suivi
 * lui-même. AUCUN lien humain n'a été touché en production — le défaut existait, il n'avait pas encore servi.
 */
export const MOTIF_POSE_PAR_SUIVI = 'posé par le suivi de la conversation';
export const MOTIF_RETIRE_PAR_SUIVI = 'retiré par le suivi de la conversation';

export async function projeterLeFil(filId: number, auteur: Auteur, o?: {
  /**
   * 🔴 « TOUTE LA CONVERSATION » REMPLACE AUSSI CE QUI A ÉTÉ POSÉ À LA MAIN (décision d'Arno). C'est le seul
   * geste qui l'autorise, parce que c'est le seul qui annonce sa portée et demande une confirmation écrite.
   */
  remplacerLesLiensManuels?: boolean;
}): Promise<number> {
  if (!(await periodesDisponibles())) return 0;
  const mails = await mailsDuFil(filId);
  if (mails.length === 0) return 0;
  const { periodes, exceptions } = await suiviDuFil(filId);
  if (periodes.length === 0 && exceptions.length === 0) return 0;
  // 🔴🔴 LOT DOCUMENTS-HORS-BIENS — lus UNE fois pour toute la conversation (voir la boucle de pose plus bas).
  const documents = await documentsDuFil(filId);
  /**
   * 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 2 — LA MARQUE D'ÉCHANGE EST-ELLE VIVANTE ? Lue UNE fois ici, et
   * utilisée tout en bas de la boucle (voir son encadré) : c'est elle qui dit si le REPLI a quelque chose à dire
   * sur les mails de cette conversation, et donc s'il faut écrire « on s'est prononcé » pour l'empêcher de
   * répondre là où une fenêtre a parlé.
   *
   * ⚠️ SANS LA MIGRATION 281, `lireInterne` REND UNE CARTE VIDE sans nommer la table : le garde vaut `false`, et
   * la projection se comporte exactement comme avant ce lot.
   */
  /**
   * ══ 🔴🔴 LOT ORDRE-DE-LA-PROJECTION (04/10/2026) — « VA-T-ELLE L'ÊTRE ? » COMPTE AUTANT QUE « L'EST-ELLE ? » ══
   *
   * ═══ LE DÉFAUT CORRIGÉ, ET IL ÉTAIT UN ORDRE, PAS UNE RÈGLE ════════════════════════════════════════════════
   *
   * La marque d'ÉCHANGE est LUE ici, avant la boucle, et POSÉE tout en bas (`marquerInterne`, quand la fenêtre en
   * cours est « interne »). Sur la passe qui rend une conversation interne, la lecture répondait donc « non » :
   * le garde `echangeInterne` était faux, la ligne « on s'est prononcé » n'était PAS écrite sur les mails qu'une
   * fenêtre « biens » couvre — et ces mails-là se lisaient « interne » TOUT EN PORTANT UN BIEN, par le REPLI,
   * jusqu'à la passe suivante. Mesuré par le scénario S8 de `suiviConversation.itest.ts`.
   *
   * ═══ 🔴 LA CORRECTION : ON DEMANDE AUSSI CE QUE CETTE PASSE VA POSER ═══════════════════════════════════════
   *
   * L'information est déjà là : `periodeEnCours` est PUR et ne lit que `mails` et `periodes`, tous deux chargés
   * au-dessus. Le garde vaut donc vrai dès que le repli AURA quelque chose à dire à la fin de cette passe.
   *
   * ⚠️ RIEN N'A ÉTÉ DÉPLACÉ NI RETIRÉ : la POSE reste en bas, la marque d'échange n'est toujours pas retirée par
   * la projection (correction du 03/10, commit 559d394a, confirmée par Arno le 04/10), et
   * `declarerNonInterneDesMessages` n'écrit que sur un mail qui ne porte AUCUNE ligne — la passe reste un diff.
   */
  const encoursEstInterne = (() => {
    const p = periodeEnCours(mails, periodes);
    return p !== null && p.classement.sorte === 'interne';
  })();
  const echangeInterne = (await lireInterne([filId])).has(filId) || encoursEstInterne;
  const voulu = projeter(mails, periodes, exceptions);

  // CE QUE LA BASE PORTE AUJOURD'HUI : les liens « lot » CONFIRMÉS de chaque mail du fil.
  const { rows } = await query<{ id: string; message_id: string; cible_cle: string; par_le_suivi: boolean }>(
    `SELECT id::text, message_id::text, cible_cle,
            (coalesce(motif, '') = $2) AS par_le_suivi
       FROM gestion_rattachement
      WHERE message_id = ANY($1::bigint[]) AND cible_sorte = 'lot' AND statut = 'confirme'
        AND piece_id IS NULL`, [mails, MOTIF_POSE_PAR_SUIVI]);
  const porte = new Map<number, { id: number; cle: string; parLeSuivi: boolean }[]>();
  for (const r of rows) {
    const m = Number(r.message_id);
    porte.set(m, [...(porte.get(m) ?? []),
      { id: Number(r.id), cle: r.cible_cle, parLeSuivi: r.par_le_suivi === true }]);
  }

  let gestes = 0;
  for (const m of mails) {
    const c = voulu.get(m);
    if (c === undefined) continue; // mail antérieur à toute période : on ne touche à rien
    const cibles = c.sorte === 'biens' ? c.biens : [];
    const voulues = new Set(cibles.map((b) => b.cle));
    const actuelles = porte.get(m) ?? [];

    for (const l of actuelles) {
      if (voulues.has(l.cle)) continue;
      /**
       * 🔴🔴 ON NE RETIRE QUE CE QUE LA FENÊTRE A POSÉ. Un lien venu d'une personne — ou du moteur de
       * rattachement — reste : il a été décidé en regardant le mail, ce que la fenêtre ne fait pas.
       */
      if (!l.parLeSuivi && o?.remplacerLesLiensManuels !== true) continue;
      const issue = await changerStatut({
        lienId: l.id, statut: 'retire', auteur, motif: MOTIF_RETIRE_PAR_SUIVI,
      });
      if (issue.ok) gestes += 1;
    }
    /**
     * ══ 🔴🔴 LOT DOCUMENTS-HORS-BIENS — LA FENÊTRE NE POSE JAMAIS DE BIEN SUR UN DE NOS DOCUMENTS ══════════════
     *
     * RÈGLE D'ARNO (01/10/2026) : un « Document CRITERIMMO » que NOUS envoyons n'entre dans la fiche d'aucun bien.
     *
     * 🔴 SANS CE GARDE, LE RETRAIT SERAIT DÉFAIT AU PREMIER GESTE. 20 206 fenêtres vivantes ont été ouvertes PAR
     * un document (reprise 290) : chacune reposerait son lien à la prochaine projection, et les documents
     * reviendraient dans « Vie du bien » sans que personne comprenne pourquoi.
     *
     * ⚠️ ON NE FERME AUCUNE FENÊTRE, et c'est la demande explicite d'Arno : « on ne leur retire PAS leurs biens ».
     * Les 1 805 réponses humaines de ces mêmes conversations continuent d'en recevoir leurs biens, exactement
     * comme avant. Seul le document est sauté — la fenêtre, elle, vit sa vie.
     */
    for (const b of cibles) {
      if (documents.has(m)) break;
      if (actuelles.some((l) => l.cle === b.cle)) continue;
      const issue = await rattacher({
        messageId: m, cible: { sorte: 'lot', cle: b.cle, id: null }, auteur,
        motif: MOTIF_POSE_PAR_SUIVI,
      });
      if (issue.ok) gestes += 1;
    }

    // ⚠️ « HORS GESTION » PORTE SUR LE MAIL (migration 266) : il se projette mail par mail.
    if (c.sorte === 'hors_gestion') {
      const issue = await marquerHorsGestion({ messageIds: [m], auteur });
      if (issue.ok && issue.nb > 0) gestes += 1;
    } else {
      const issue = await annulerHorsGestion({ messageIds: [m], auteur, motif: 'suivi de la conversation' });
      if (issue.ok && issue.nb > 0) gestes += 1;
    }

    /**
     * ══ 🔴🔴 LOT RENOMMER-PARTOUT-ET-FINITIONS, POINT 7 — « INTERNE » SE PROJETTE MAIL PAR MAIL ════════════════
     *
     * RÈGLE D'ARNO (04/10/2026) : « Interne est un statut PAR MAIL. Le choix fait sur un mail s'applique selon les
     * 3 fenêtres. Un choix ultérieur ne doit JAMAIS effacer le statut Interne d'un mail antérieur. »
     *
     * 🔴 ET LA SECONDE PHRASE EST TENUE PAR LA FORME MÊME DE CETTE BOUCLE, pas par une précaution ajoutée : on
     * écrit ce que la fenêtre qui COUVRE CE MAIL demande, et rien d'autre. Une fenêtre « biens » ouverte au mail N
     * ne couvre que les mails ≥ N ; les mails 1…N-1 restent sous leur propre fenêtre, et gardent donc leur
     * « interne ». C'est exactement ce que le commit 559d394a n'avait pas pu faire — la marque était alors une
     * marque d'ÉCHANGE, et la retirer la retirait partout.
     *
     * ⚠️ `voulu.get(m)` EST `undefined` POUR UN MAIL ANTÉRIEUR À TOUTE FENÊTRE : la boucle est sortie plus haut
     * (`continue`), donc on ne touche à rien. Ces mails-là relèvent du REPLI sur la marque d'échange, et c'est
     * `interneDuMail` qui le dit — jamais une écriture.
     *
     * 🔴 LA MARQUE D'ÉCHANGE N'EST PLUS TOUCHÉE ICI, ET SURTOUT PAS RETIRÉE. C'est la correction du 03/10
     * (559d394a) et elle ne bouge pas d'un iota : elle reste le repli, et un repli qu'une projection effacerait ne
     * serait pas un repli.
     */
    if (c.sorte === 'interne') {
      const issue = await marquerInterneDesMessages({ messageIds: [m], auteur });
      if (issue.ok && issue.nb > 0) gestes += 1;
    } else {
      const issue = await annulerInterneDesMessages({
        messageIds: [m], auteur, motif: MOTIF_INTERNE_PAR_SUIVI,
      });
      if (issue.ok && issue.nb > 0) gestes += 1;
      /**
       * ══ 🔴🔴 LOT INTERNE-ANNULER-ET-SUITE, POINT 2 — LA FENÊTRE VAUT AUSSI CONTRE LE **REPLI** ═════════════
       *
       * ═══════════════════════════════════════════════════════════════════════════════════════════════════════
       * DÉCISION D'ARNO (04/10/2026) : « fenêtre “Ce mail et la conversation à venir” ou “Toute la
       * conversation” : les mails À VENIR suivent le nouveau choix (le bien) et n'héritent plus de la marque
       * Interne. C'est le même principe que pour le suivi des biens : le dernier choix vaut pour la suite. »
       *
       * ═══ 🔴🔴 LE TROU QUE CES TROIS LIGNES FERMENT ══════════════════════════════════════════════════════════
       *
       * `annulerInterneDesMessages` ne sait RETIRER qu'une marque qui existe. Or un mail peut être « interne »
       * SANS porter aucune marque par mail : c'est le cas ③ d'`interneDuMail`, le REPLI sur la marque de
       * l'ÉCHANGE. Sur un tel mail, l'`UPDATE` ci-dessus ne trouve rien, ne lève rien — et ne le dit pas.
       *
       * 🔴 CONSÉQUENCE MESURÉE AVANT CORRECTION : une conversation marquée interne par la case du bandeau, puis
       * classée sur un bien « pour la suite », redonnait « Interne » à chaque RÉPONSE À VENIR. Le dernier choix
       * ne valait pas pour la suite — il ne valait que pour les mails qui portaient déjà une marque.
       *
       * 🔴 ON ÉCRIT DONC UNE LIGNE NÉE RETIRÉE, qui dit « on s'est prononcé sur ce mail » : le repli ne répond
       * plus pour lui. C'est le MÊME mécanisme que la levée après un rattachement humain
       * (`declarerNonInterneDesMessages`), au même grain, avec le motif de la projection.
       *
       * 🔴🔴 ET C'EST LA FENÊTRE SEULE QUI DÉCIDE, SANS UNE LIGNE DE PLUS :
       *   · « Ce mail et la conversation à venir » / « Toute la conversation » posent une PÉRIODE — un mail à
       *     venir est donc COUVERT, la boucle passe ici, et il n'hérite plus de la marque ;
       *   · « Ce mail uniquement » pose une EXCEPTION — un mail à venir n'est couvert par rien, la boucle sort
       *     plus haut (`c === undefined` ⇒ `continue`), et la conversation garde sa marque pour la suite.
       * C'est exactement la règle d'Arno, et elle est TENUE PAR LE MÉCANISME EXISTANT, pas par un second chemin.
       *
       * ⚠️ LA MARQUE D'ÉCHANGE N'EST TOUJOURS PAS TOUCHÉE (correction du 03/10, juste au-dessus) : elle reste le
       * repli pour les conversations et les mails dont personne ne s'est occupé. On ne la retire pas, on cesse
       * de la laisser répondre là où une fenêtre a parlé.
       *
       * ⚠️ RIEN POUR UN MAIL QUI S'EST DÉJÀ PRONONCÉ : `declarerNonInterneDesMessages` n'écrit que si le mail ne
       * porte AUCUNE ligne (`NOT EXISTS`). Un mail dont la marque vient d'être retirée juste au-dessus, ou qui
       * en porte une vivante, n'en reçoit pas une seconde — et la projection reste un diff.
       */
      /**
       * 🔴🔴 ET SEULEMENT SI LE REPLI A QUELQUE CHOSE À DIRE, ce qui est la différence entre une correction et
       * une écriture de masse. Sans ce garde, la prochaine projection de CHAQUE conversation classée sur un bien
       * écrirait une ligne « on s'est prononcé » sur chacun de ses mails — plus de onze mille lignes, pour dire
       * « ce mail n'est pas interne » là où personne n'avait jamais prétendu le contraire.
       *
       * Lu UNE fois pour toute la conversation, avant la boucle : la marque d'échange ne change pas en cours de
       * projection, et une requête par mail coûterait un aller-retour par ligne.
       */
      if (echangeInterne) {
        const aussi = await declarerNonInterneDesMessages({
          messageIds: [m], auteur, motif: MOTIF_INTERNE_PAR_SUIVI,
        });
        if (aussi.ok && aussi.nb > 0) gestes += 1;
      }
    }
  }

  /**
   * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES INTERVENTIONS, PROJETÉES COMME LES BIENS ══════════════════════════════
   *
   * ⚠️ **APRÈS** LA BOUCLE DES BIENS, ET CE N'EST PAS UN CHOIX DE STYLE : la base refuse une intervention sans
   * lien vivant vers un bien sur le même mail (migration 293). Projeter les personnes avant les biens ferait
   * échouer chaque pose, une par une, sur une conversation entièrement neuve.
   *
   * ⚠️ UN SEUL APPEL, GARDÉ PAR LA SONDE : sans la migration 293, la fonction sort à sa première ligne et la
   * projection se comporte EXACTEMENT comme avant ce lot. Aucune autre ligne de `projeterLeFil` n'a changé.
   */
  gestes += await projeterLesInterventions(mails, voulu, documents, auteur);

  /**
   * 🔴🔴 LA CASCADE : UNE INTERVENTION NE SURVIT PAS AU DÉPART DE SON BIEN. La boucle ci-dessus a pu retirer des
   * liens « bien » (une fenêtre qui change de logement, « Toute la conversation ») : les interventions des mails
   * qui n'ont plus aucun bien vivant sont retirées, datées et signées. La base ne peut pas le faire — l'encadré
   * de la migration 293 dit pourquoi —, donc c'est ici.
   *
   * ⚠️ ELLE N'EST PAS COMPTÉE DANS `gestes` : ce n'est pas une décision, c'est la conséquence mécanique d'une
   * décision déjà comptée. L'annoncer deux fois ferait un compte rendu qui exagère.
   */
  await retirerInterventionsSansBien(mails, auteur);

  /**
   * ══ 🔴🔴 LOT FENETRES-INDEPENDANTES — UNE FENÊTRE NE TOUCHE PLUS À CE QUI LA PRÉCÈDE ═══════════════════════
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   * RÈGLE D'ARNO (03/10/2026) : « Chaque fenêtre est TOTALEMENT indépendante des autres : ni la distribution des
   * mails aux biens, ni le statut (Classé / Interne / Hors gestion / À classer), ni les personnes d'une fenêtre
   * ne sont modifiés par la création ou la modification d'une autre fenêtre. »
   *
   * CE QUE CES LIGNES FAISAIENT, ET LE DÉFAUT EXACT. La marque « Interne » suivait la période EN COURS — la
   * DERNIÈRE —, et elle porte sur l'ÉCHANGE TOUT ENTIER (`gestion_fil_interne.fil_id`). Ouvrir une fenêtre
   * « biens » au mail N la retirait donc à TOUS les mails, 1 à N-1 compris.
   *
   * MESURÉ EN PRODUCTION, échange 36671 : marque posée à 10:18:14 par notre envoi, RETIRÉE à 10:19:37 avec le
   * motif « suivi de la conversation » — c'est-à-dire par ces lignes-ci, et par rien d'autre.
   *
   * ═══ 🔴 CE QUI CHANGE, ET CE QUI NE CHANGE PAS ═════════════════════════════════════════════════════════════
   *
   * · UNE FENÊTRE « interne » POSE TOUJOURS LA MARQUE — c'est son rôle, et il est inchangé ;
   * · UNE FENÊTRE D'UNE AUTRE NATURE NE LA RETIRE PLUS. Elle ne décide rien sur les mails qu'elle ne couvre pas,
   *   et la marque d'un échange n'est pas à elle.
   *
   * 🔴 ET L'ÉCRAN RESTE JUSTE SANS RIEN D'AUTRE, parce que la capsule d'un mail regarde ses biens EN PREMIER
   * (`capsuleDuMessage`) : un mail rattaché au lot 26 est « Classé » même si son échange porte la marque, et un
   * mail qui n'a aucun bien retombe sur « Interne ». C'est exactement ce qu'Arno décrit — mail 1 Interne,
   * mail 2 Classé — sans qu'il faille une seule migration.
   *
   * ⚠️ CE N'EST PAS LE MODÈLE COMPLET, ET IL NE FAUT PAS LE CROIRE. « Interne » reste une marque d'ÉCHANGE : on
   * ne peut pas encore écrire « interne du mail 1 au mail 4, puis plus ». Le modèle entier demande une marque
   * PAR MAIL, donc une migration — livrée (297) et NON APPLIQUÉE, en attente de l'accord d'Arno. Ces lignes
   * ferment le défaut qui efface un statut ; elles n'ouvrent pas la fenêtre qui le borne.
   *
   * ⚠️ RETIRER LA MARQUE RESTE POSSIBLE, et par le geste qui l'a posée : la case « Interne » de l'échange. Ce
   * qu'on refuse ici, c'est qu'une décision prise sur UN mail en défasse une autre, prise ailleurs.
   * ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
   */
  /**
   * ⚠️ LA MÊME QUESTION QUE LE GARDE DU HAUT, ET UNE SEULE RÉPONSE (lot ORDRE-DE-LA-PROJECTION) : `encoursEstInterne`
   * est calculé avant la boucle et réutilisé ici. La POSE n'a pas bougé d'une ligne — seule la LECTURE sait
   * désormais ce que cette passe va poser. Deux expressions séparées pourraient diverger ; celle-ci ne peut pas.
   */
  if (encoursEstInterne) {
    const issue = await marquerInterne({ filIds: [filId], auteur });
    if (issue.ok && issue.nb > 0) gestes += 1;
  }
  return gestes;
}

/**
 * ══ 🔴🔴 LOT CONTACTS-EXTERNES — LES INTERVENTIONS QUE LES FENÊTRES DEMANDENT, MAIL PAR MAIL ══════════════════
 *
 * Demande d'Arno : « “Suivi automatique” ouvre une fenêtre qui porte le(s) bien(s) ET les relations aux
 * personnes. Les mails suivants de la conversation (dans les deux sens) en héritent, rôle instantané RECALCULÉ à
 * la date de chaque mail. »
 *
 * 🔴 LE RÔLE EST RECALCULÉ ICI, ET C'EST TOUT L'OBJET DE CETTE FONCTION. La fenêtre porte des PERSONNES, jamais
 * des rôles : un courrier de mars et un courrier de septembre, sous la même fenêtre, peuvent concerner la même
 * personne comme OCCUPANTE puis comme SORTANTE. Chaque lien reçoit donc son propre mot, figé à SA date.
 *
 * ⚠️ UN MAIL SANS AUCUNE PERSONNE PASSE QUAND MÊME PAR LE DIFF, et il le faut : c'est ainsi qu'une fenêtre dont
 * on a DÉCOCHÉ toutes les personnes retire celles qu'elle avait posées. Sortir tôt sur `personnes.length === 0`
 * laisserait des interventions que plus aucune règle ne demande.
 *
 * ⚠️ MAIS UN MAIL QUE LA FENÊTRE NE COUVRE PAS EST ÉPARGNÉ (`voulu.get(m) === undefined`), comme pour les biens :
 * un mail antérieur à toute période n'est pas classé, et on ne lui invente rien.
 *
 * ⚠️ ET UN « Document CRITERIMMO » EST SAUTÉ, pour la raison qui le fait sauter côté biens : il ne porte aucun
 * bien, donc la base refuserait l'intervention — et surtout il ne concerne aucun logement.
 */
async function projeterLesInterventions(
  mails: readonly number[],
  voulu: Map<number, Classement>,
  documents: Set<number>,
  auteur: Auteur,
): Promise<number> {
  if (!(await interventionsDisponibles())) return 0;

  const demandes: { messageId: number; biens: string[]; personnes: readonly PersonneClassee[] }[] = [];
  for (const m of mails) {
    const c = voulu.get(m);
    if (c === undefined || c.sorte !== 'biens' || documents.has(m)) continue;
    demandes.push({
      messageId: m,
      biens: c.biens.map((b) => b.cle),
      personnes: c.personnes ?? [],
    });
  }
  /**
   * ══ 🔴🔴 LE RACCOURCI, ET SA CONDITION — UN DÉFAUT TROUVÉ PAR L'ÉPREUVE C-5 ════════════════════════════════
   *
   * Aucune fenêtre ne porte de personne : c'est le cas de l'immense majorité du courrier, et l'on ne veut pas
   * lire les dates de trente mails puis les occupations de leurs biens pour ne rien trouver.
   *
   * 🔴🔴 MAIS « AUCUNE PERSONNE VOULUE » NE VEUT PAS DIRE « RIEN À FAIRE ». C'est exactement l'état d'une fenêtre
   * dont on vient de DÉCOCHER toutes les personnes : le diff doit alors RETIRER ce qu'elle avait posé. La
   * première écriture de cette fonction sortait ici sans condition, et le lien restait — défaut mesuré par
   * l'épreuve « décocher toutes les personnes d'une fenêtre retire ce qu'elle avait posé ».
   *
   * ⚠️ LA QUESTION COÛTE UNE REQUÊTE INDEXÉE, et une seule, sur les mails de cette conversation.
   */
  if (!demandes.some((d) => d.personnes.length > 0)
    && !(await aDesInterventions(demandes.map((d) => d.messageId)))) return 0;

  const dates = await datesDesMails(demandes.map((d) => d.messageId));
  const roles = await rolesALaDateDesMails(demandes.map((d) => ({
    messageId: d.messageId,
    dateMail: dates.get(d.messageId) ?? '',
    biens: d.biens,
    personnes: d.personnes.map((p) => ({ sorte: p.sorte, cle: p.cle })),
  })));

  let gestes = 0;
  for (const d of demandes) {
    const issue = await poserInterventions({
      messageId: d.messageId,
      personnes: d.personnes.map((p) => ({
        sorte: p.sorte, cle: p.cle, libelle: p.libelle,
        // ⚠️ `locataire_a_venir` EN DERNIER RECOURS : un rôle qu'on n'a pas su calculer ne doit pas se déguiser
        //   en « occupant ». La pastille grise le dit, et la ligne reste corrigeable.
        role: roles.get(cleRole(d.messageId, p)) ?? 'locataire_a_venir',
        contactExterneId: p.contactExterneId ?? null,
      })),
      contact: null,
      auteur,
      parLeSuivi: true,
    });
    if (issue.ok) gestes += issue.posees + issue.retirees;
  }
  return gestes;
}

/**
 * LES DATES DE RÉCEPTION D'UN PAQUET DE MAILS, en jours ISO. LECTURE SEULE.
 *
 * ⚠️ UN JOUR ISO, PAS UN HORODATAGE : le rôle instantané se décide sur des dates CIVILES (entrée, sortie), et
 * comparer un horodatage UTC à une date civile recule d'un jour sur une sortie à minuit. C'est le piège consigné
 * au lot LOT-1 du module « permis », et il vaut ici mot pour mot.
 */
async function datesDesMails(messageIds: readonly number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [...new Set(messageIds)];
  if (ids.length === 0) return out;
  const { rows } = await query<{ id: string; le: string | null }>(
    `SELECT id::text, to_char(recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS le
       FROM gestion_message WHERE id = ANY($1::bigint[])`, [ids]);
  for (const r of rows) if (r.le !== null) out.set(Number(r.id), r.le);
  return out;
}

/**
 * ══ 🔴🔴 UN MAIL QUI ARRIVE HÉRITE DE LA PÉRIODE EN COURS (point 3 d'Arno) ════════════════════════════════════
 *
 * Appelée après la relève, et après un envoi capturé. Elle ne touche QUE les mails qui ne portent encore aucun
 * classement manuel : une proposition de l'automatisation n'est pas un classement, mais un rattachement
 * confirmé à la main en est un, et la période ne doit pas le défaire.
 *
 * ⚠️ `periodeEnCours` NE REND JAMAIS UNE EXCEPTION : c'est la moitié qui compte de la règle d'Arno.
 */
export async function heriterLesNouveauxMails(filId: number, auteur: Auteur): Promise<number> {
  if (!(await periodesDisponibles())) return 0;
  const mails = await mailsDuFil(filId);
  const { periodes } = await suiviDuFil(filId);
  const encours = periodeEnCours(mails, periodes);
  if (encours === null) return 0;
  return projeterLeFil(filId, auteur);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LA REPRISE DE L'EXISTANT (point 6 d'Arno)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ChiffresReprise {
  filsVus: number;
  filsRepris: number;
  periodes: number;
  exceptions: number;
  /** 🔴 LE SEUL CHIFFRE QUI COMPTE VRAIMENT : combien de conversations la reprise n'aurait pas rendues à l'identique. */
  filsInfideles: number;
}

/**
 * REPREND LES RATTACHEMENTS EXISTANTS EN PÉRIODES ET EXCEPTIONS.
 *
 * 🔴 ELLE NE S'APPLIQUE QUE SI ELLE EST FIDÈLE, conversation par conversation : `repriseFidele` reprojette ce
 * qu'on s'apprête à écrire et le compare à l'existant, couple par couple. Une conversation que la reprise ne
 * rendrait pas à l'identique est LAISSÉE TELLE QUELLE et comptée — mieux vaut une conversation sans période
 * qu'une conversation dont on aurait perdu un rattachement.
 *
 * ⚠️ `simulation` PAR DÉFAUT : elle compte sans rien écrire. C'est ce qui permet de donner les chiffres avant /
 * après sans engager la base.
 */
export async function reprendreExistant(o: {
  auteur: Auteur; appliquer?: boolean; limite?: number;
}): Promise<ChiffresReprise> {
  const c: ChiffresReprise = { filsVus: 0, filsRepris: 0, periodes: 0, exceptions: 0, filsInfideles: 0 };
  if (!(await periodesDisponibles())) return c;

  const { rows: fils } = await query<{ fil_id: string }>(
    `SELECT DISTINCT m.fil_id::text AS fil_id
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.piece_id IS NULL
        AND m.fil_id IS NOT NULL
      ORDER BY 1` + (o.limite ? ` LIMIT ${Number(o.limite)}` : ''));

  for (const f of fils) {
    const filId = Number(f.fil_id);
    c.filsVus += 1;
    // ⚠️ DÉJÀ REPRIS ? On ne repasse pas dessus : la commande doit pouvoir se relancer sans rien abîmer.
    const { rows: deja } = await query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestion_fil_periode WHERE fil_id = $1', [filId]);
    if ((deja[0]?.n ?? 0) > 0) continue;

    const { rows: liens } = await query<{ message_id: string; cible_cle: string; cible_libelle: string | null }>(
      `SELECT r.message_id::text, r.cible_cle, r.cible_libelle
         FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
        WHERE m.fil_id = $1 AND r.statut = 'confirme' AND r.cible_sorte = 'lot' AND r.piece_id IS NULL`,
      [filId]);
    const parMail = new Map<number, { cle: string; libelle: string }[]>();
    for (const l of liens) {
      const m = Number(l.message_id);
      parMail.set(m, [...(parMail.get(m) ?? []),
        { cle: l.cible_cle ?? '', libelle: l.cible_libelle ?? l.cible_cle ?? '' }]);
    }
    const mails = await mailsDuFil(filId);
    const existante = { mails: mails.map((messageId) => ({ messageId, biens: parMail.get(messageId) ?? [] })) };
    const reprise = reprendre(existante);
    if (!repriseFidele(existante, reprise)) { c.filsInfideles += 1; continue; }
    if (reprise.periodes.length === 0 && reprise.exceptions.length === 0) continue;

    c.filsRepris += 1;
    c.periodes += reprise.periodes.length;
    c.exceptions += reprise.exceptions.length;
    if (o.appliquer !== true) continue;

    await withTransaction(async (q) => {
      for (const p of reprise.periodes) {
        const { rows } = await q<{ id: string }>(
          `INSERT INTO gestion_fil_periode (fil_id, depuis_message_id, sorte, cree_par, cree_par_libelle)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
          [filId, p.depuisMessageId, p.classement.sorte, o.auteur.id, o.auteur.libelle]);
        await ecrireBiens(q, 'gestion_fil_periode_bien', 'periode_id', Number(rows[0].id), p.classement);
      }
      for (const e of reprise.exceptions) {
        const { rows } = await q<{ id: string }>(
          `INSERT INTO gestion_message_exception (message_id, sorte, cree_par, cree_par_libelle)
           VALUES ($1, $2, $3, $4) RETURNING id::text`,
          [e.messageId, e.classement.sorte, o.auteur.id, o.auteur.libelle]);
        await ecrireBiens(q, 'gestion_message_exception_bien', 'exception_id', Number(rows[0].id), e.classement);
      }
    });
  }
  return c;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT SUIVI-DERNIER-CHOIX — DÉSEMPILER UNE CONVERSATION DÉJÀ ACCUMULÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface IssueSimplification extends Simplification {
  /** Combien de gestes la reprojection a réellement posés ou retirés sur `gestion_rattachement`. */
  projetes: number;
}

const RIEN: IssueSimplification = {
  periodesRetirees: [], exceptionsRetirees: [], pointsEmpiles: 0, decisionsRedondantes: 0, projetes: 0,
};

/**
 * NE LAISSE QU'UN SEUL REPÈRE PAR POINT DE DÉPART, ET AUCUN QUI NE CHANGE RIEN.
 *
 * Le module PUR (`simplifierLeSuivi`) DÉCIDE ce qui tombe ; ici on écrit, puis on REPROJETTE — parce que retirer
 * une décision peut rendre des mails à la configuration précédente, et que `gestion_rattachement` est la table
 * que tout le reste de l'application lit.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ : une période est DATÉE et SIGNÉE (`remplacee_le`, `remplacee_par_libelle`), une
 * exception est datée (`retiree_le` — sa table ne porte pas de signataire, c'est le journal qui la porte). Tout
 * est donc relisible, et rien n'est perdu.
 *
 * ⚠️ `appliquer` N'EST PAS LE DÉFAUT : par défaut elle COMPTE sans rien écrire. C'est ce qui permet de donner les
 * chiffres avant d'engager la base.
 */
export async function simplifierLeFil(o: {
  filId: number; auteur: Auteur; appliquer?: boolean;
}): Promise<IssueSimplification> {
  if (!(await periodesDisponibles())) return RIEN;
  const mails = await mailsDuFil(o.filId);
  if (mails.length === 0) return RIEN;
  const { periodes, exceptions } = await suiviDuFil(o.filId);
  const quoi = simplifierLeSuivi({ mails, periodes, exceptions });
  if (quoi.periodesRetirees.length === 0 && quoi.exceptionsRetirees.length === 0) return { ...quoi, projetes: 0 };
  if (o.appliquer !== true) return { ...quoi, projetes: 0 };

  const libelle = (o.auteur.libelle ?? '').trim() || 'reprise « dernier choix »';
  await withTransaction(async (q) => {
    if (quoi.periodesRetirees.length > 0) {
      await q(
        `UPDATE gestion_fil_periode SET remplacee_le = now(), remplacee_par_libelle = $2
          WHERE id = ANY($1::bigint[]) AND remplacee_le IS NULL`, [quoi.periodesRetirees, libelle]);
    }
    if (quoi.exceptionsRetirees.length > 0) {
      await q(
        `UPDATE gestion_message_exception SET retiree_le = now()
          WHERE message_id = ANY($1::bigint[]) AND retiree_le IS NULL`, [quoi.exceptionsRetirees]);
    }
    /**
     * 🔴 LE JOURNAL PORTE LA TRACE, ET C'EST LE POINT 3 D'ARNO : « Pas d'historique affiché des choix
     * intermédiaires. Le journal technique interne peut garder la trace (annulation, audit), mais il n'apparaît
     * jamais dans le fil. » Une ligne par conversation reprise suffit à répondre, six mois plus tard, à « qui a
     * retiré ce repère, et pourquoi ».
     */
    await q(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
       VALUES ('fil', $1, 'simplifier le suivi', $2, $3, $4, $5)`,
      [o.filId, String(periodes.length + exceptions.length),
        String(periodes.length + exceptions.length - quoi.periodesRetirees.length
          - quoi.exceptionsRetirees.length),
        `${quoi.pointsEmpiles} point(s) de départ empilé(s), ${quoi.decisionsRedondantes} décision(s) sans effet`,
        libelle]);
  });

  const projetes = await projeterLeFil(o.filId, o.auteur);
  return { ...quoi, projetes };
}
