import { query, withTransaction } from '../db/client';
import { periodesDisponibles, rattachementsDisponibles } from './schema';
import {
  effetDuChoix, periodeEnCours, projeter, reprendre, repriseFidele,
  type ChoixSuivi, type Classement, type ExceptionMail, type Periode,
} from './periodesConversation';
import { rattacher, changerStatut } from './rattachementRepo';
import { marquerInterne, annulerInterne } from './interneRepo';
import { marquerHorsGestion, annulerHorsGestion } from './horsGestionRepo';
import type { Auteur } from './gestes';
// 🔴🔴 LOT DOCUMENTS-HORS-BIENS — « ce mail est-il un de nos envois automatiques ? ». Module PUR.
import { estDocumentEnvoye } from './documentsAuto';

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
    const { rows: pr } = await query<{
      id: string; depuis_message_id: string; sorte: string; cree_par_libelle: string; cree_le: string;
      biens: { cle: string; libelle: string }[] | null;
    }>(
      `SELECT p.id::text, p.depuis_message_id::text, p.sorte, p.cree_par_libelle,
              to_char(p.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le,
              (SELECT json_agg(json_build_object('cle', b.cible_cle, 'libelle', b.cible_libelle))
                 FROM gestion_fil_periode_bien b WHERE b.periode_id = p.id) AS biens
         FROM gestion_fil_periode p
        WHERE p.fil_id = $1 AND p.remplacee_le IS NULL
        ORDER BY p.id`, [filId]);

    const { rows: er } = await query<{
      id: string; message_id: string; sorte: string; cree_par_libelle: string; cree_le: string;
      biens: { cle: string; libelle: string }[] | null;
    }>(
      `SELECT e.id::text, e.message_id::text, e.sorte, e.cree_par_libelle,
              to_char(e.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le,
              (SELECT json_agg(json_build_object('cle', b.cible_cle, 'libelle', b.cible_libelle))
                 FROM gestion_message_exception_bien b WHERE b.exception_id = e.id) AS biens
         FROM gestion_message_exception e
         JOIN gestion_message m ON m.id = e.message_id
        WHERE m.fil_id = $1 AND e.retiree_le IS NULL
        ORDER BY e.id`, [filId]);

    return {
      periodes: pr.map((r) => ({
        id: Number(r.id), depuisMessageId: Number(r.depuis_message_id),
        classement: classementDe(r.sorte, r.biens),
        parLibelle: r.cree_par_libelle, le: r.cree_le,
      })),
      exceptions: er.map((r) => ({
        messageId: Number(r.message_id),
        classement: classementDe(r.sorte, r.biens),
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

function classementDe(sorte: string, biens: { cle: string; libelle: string }[] | null): Classement {
  if (sorte === 'interne') return { sorte: 'interne', biens: [] };
  if (sorte === 'hors_gestion') return { sorte: 'hors_gestion', biens: [] };
  return { sorte: 'biens', biens: biens ?? [] };
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

export type IssueSuivi = { ok: true; projetes: number } | { ok: false; motif: string };

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
  const avant = await suiviDuFil(o.filId);
  const effet = effetDuChoix({
    choix: o.choix, messageId: o.messageId, classement: o.classement,
    periodes: avant.periodes, exceptions: avant.exceptions,
  });

  await withTransaction(async (q) => {
    // ① « Toute la conversation » : les périodes existantes sont DATÉES, jamais supprimées.
    if (effet.periodesRemplacees.length > 0) {
      await q(
        `UPDATE gestion_fil_periode SET remplacee_le = now(), remplacee_par_libelle = $2
          WHERE id = ANY($1::bigint[]) AND remplacee_le IS NULL`,
        [effet.periodesRemplacees, libelle]);
    }
    // ② L'exception du mail qu'on reclasse en période : retirée, sinon elle masquerait la règle qu'on pose.
    if (effet.exceptionRetiree !== null) {
      await q(
        'UPDATE gestion_message_exception SET retiree_le = now() WHERE message_id = $1 AND retiree_le IS NULL',
        [effet.exceptionRetiree]);
    }
    // ③ LA NOUVELLE PÉRIODE. « Toute la conversation » part du PREMIER mail de la conversation.
    if (effet.nouvellePeriode !== null) {
      const depuis = effet.nouvellePeriode.depuisMessageId === 0 ? mails[0] : effet.nouvellePeriode.depuisMessageId;
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_fil_periode (fil_id, depuis_message_id, sorte, cree_par, cree_par_libelle)
         VALUES ($1, $2, $3, $4, $5) RETURNING id::text`,
        [o.filId, depuis, o.classement.sorte, o.auteur.id, libelle]);
      await ecrireBiens(q, 'gestion_fil_periode_bien', 'periode_id', Number(rows[0].id), o.classement);
    }
    // ④ LA NOUVELLE EXCEPTION. Une seule vivante par mail — l'index unique partiel le garantit.
    if (effet.nouvelleException !== null) {
      await q(
        'UPDATE gestion_message_exception SET retiree_le = now() WHERE message_id = $1 AND retiree_le IS NULL',
        [o.messageId]);
      const { rows } = await q<{ id: string }>(
        `INSERT INTO gestion_message_exception (message_id, sorte, cree_par, cree_par_libelle)
         VALUES ($1, $2, $3, $4) RETURNING id::text`,
        [o.messageId, o.classement.sorte, o.auteur.id, libelle]);
      await ecrireBiens(q, 'gestion_message_exception_bien', 'exception_id', Number(rows[0].id), o.classement);
    }
  });

  const projetes = await projeterLeFil(o.filId, o.auteur, {
    // 🔴 SEUL « Toute la conversation » remplace un lien posé à la main — et il l'annonce avant (voir la modale).
    remplacerLesLiensManuels: o.choix === 'conversation',
  });
  return { ok: true, projetes };
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

    // ⚠️ « INTERNE » PORTE SUR L'ÉCHANGE (migration 281) : on le pose ou on le retire une fois, pas par mail.
    // ⚠️ « HORS GESTION » PORTE SUR LE MAIL (migration 266) : lui se projette mail par mail.
    if (c.sorte === 'hors_gestion') {
      const issue = await marquerHorsGestion({ messageIds: [m], auteur });
      if (issue.ok && issue.nb > 0) gestes += 1;
    } else {
      const issue = await annulerHorsGestion({ messageIds: [m], auteur, motif: 'suivi de la conversation' });
      if (issue.ok && issue.nb > 0) gestes += 1;
    }
  }

  // LA MARQUE « INTERNE » DE L'ÉCHANGE : elle suit la période EN COURS, qui est celle du fil tout entier.
  const encours = periodeEnCours(mails, periodes);
  if (encours !== null) {
    const issue = encours.classement.sorte === 'interne'
      ? await marquerInterne({ filIds: [filId], auteur })
      : await annulerInterne({ filIds: [filId], auteur, motif: 'suivi de la conversation' });
    if (issue.ok && issue.nb > 0) gestes += 1;
  }
  return gestes;
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
