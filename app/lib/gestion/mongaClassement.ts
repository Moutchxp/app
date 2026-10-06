/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 2 — LE CLASSEMENT AUTOMATIQUE D'UN MAIL MONGA ════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (06/10/2026), mot pour mot : « Un mail Monga dont la référence est DÉJÀ reliée est rattaché
 * automatiquement à l'événement, à son ou ses biens, avec le propriétaire et le locataire à la date du mail,
 * statut « Auto », PAR LA PORTE D'ÉCRITURE EXISTANTE (la porte de ce mail uniquement : aucune fenêtre de suivi de
 * conversation créée ni modifiée). Il ne passe plus par « À classer » ni par « À rattacher ». »
 *
 * ═══ 🔴🔴 CE FICHIER N'ÉCRIT RIEN LUI-MÊME. IL APPELLE TROIS PORTES, DANS CET ORDRE ═════════════════════════════
 *
 *   ① `rattacher` → le ou les LOTS de l'événement ;
 *   ② `rattacher` → l'ÉVÉNEMENT (cible `evenement`) ;
 *   ③ `poserInterventions` → le PROPRIÉTAIRE et le LOCATAIRE à la date du mail.
 *
 * 🔴🔴 L'ORDRE N'EST PAS UN GOÛT : LE LOT AVANT LA PERSONNE. La base REFUSE une intervention sur un mail qui ne
 * porte aucun lien « bien » vivant (contrainte de la migration 293, et la même leçon est déjà écrite dans
 * `periodeRepo`). Poser la personne d'abord ferait échouer le classement, et pas toujours — seulement sur les
 * mails qui n'avaient encore aucun bien, c'est-à-dire précisément ceux que ce lot vient classer.
 *
 * 🔴 AUCUNE QUATRIÈME PORTE N'EST ÉCRITE, et c'est le point le plus important de ce fichier. `rattacher` porte
 * l'index unique partiel, le journal, la confirmation d'un candidat déjà posé plutôt qu'un doublon, le libellé
 * figé de la cible. `poserInterventions` porte le rôle instantané et le diff. Une porte parallèle aurait recopié
 * tout cela — et en aurait oublié une part.
 *
 * ⚠️ AUCUNE FENÊTRE DE SUIVI, ET C'EST VÉRIFIÉ DEUX FOIS : on n'appelle NI `poserClassement` NI aucune fonction
 * de `periodeRepo`. Ce n'est d'ailleurs pas possible — `poserClassement` refuse en première ligne un auteur
 * automatique (« un suivi de conversation ne se pose qu'à la main »). La porte employée ici est celle du MAIL,
 * qui équivaut au choix « Ce mail uniquement » (`ChoixSuivi = 'mail'`) : elle ne crée ni ne modifie aucune ligne
 * de `gestion_fil_periode`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { query } from '../db/client';
import { personnesDesBiens, poserInterventions } from './contactExterneRepo';
import { deplacerMessage, type Auteur } from './gestes';
import { mailInerte } from './mailInerte';
import {
  motifClassementMonga, motifExamenMonga, personnesEnVigueur,
  type RefusClassementMonga,
} from './monga';
import {
  lireEtGarderUnMail, mailsDeLaReference, mongaDuMail, SQL_EST_MAIL_MONGA,
} from './mongaRepo';
import { cibleLot } from './rattachement';
import { rattacher } from './rattachementRepo';
import { evenementQualifieDisponible, mongaDisponible } from './schema';

/**
 * 🔴 QUI SIGNE UN CLASSEMENT MONGA. Un nom PROPRE, et non « automatique » :
 *   · il se lit dans le journal et sur le lien (« posé automatiquement », statut touché par…) ;
 *   · il dit LAQUELLE des automatisations a agi — le moteur de rattachement signe « moteur de rattachement », et
 *     confondre les deux rendrait illisible le jour où l'une des deux se trompe.
 *
 * ⚠️ IL NE PEUT PAS POSER DE LIEN référence ↔ événement : `gestion_monga_lien_humain_chk` refuse tout libellé
 * valant « automatique », et cette porte-ci n'écrit de toute façon jamais dans cette table.
 */
export const AUTEUR_MONGA: Auteur = { id: null, libelle: 'classement Monga' };

export interface IssueClassementMonga {
  classe: boolean;
  /** Renseigné quand `classe` est faux : POURQUOI ce mail n'a pas été classé. */
  refus: RefusClassementMonga | null;
  reference: string | null;
  evenementId: string | null;
  /** Les clés des lots rattachés. */
  biens: string[];
  /** Combien de personnes (propriétaire, locataire) ont été posées. */
  personnes: number;
}

const RIEN: IssueClassementMonga = {
  classe: false, refus: null, reference: null, evenementId: null, biens: [], personnes: 0,
};

/**
 * ══ 🔴🔴 LES BIENS D'UN ÉVÉNEMENT — DEUX SOURCES, DANS CET ORDRE ═════════════════════════════════════════════════
 *
 * ① LES **PARTIES** DE LA CARTE (`gestion_evenement_partie`, migration 268). C'est la vérité DÉCLARÉE : « sur quoi
 *    porte cette carte », écrite à sa création — demande d'Arno au lot CONTACTS-ET-EVENEMENT (« le nouvel
 *    événement est rattaché au bien identifié, à son propriétaire et à son locataire »). Le point 3 de ce lot
 *    crée justement l'événement AVEC le lot choisi par Arno : c'est cette ligne-là qu'il écrit.
 *
 * ② À DÉFAUT, LES LOTS DE SES MAILS. Les deux seuls événements qui existaient le 06/10/2026 n'ont AUCUNE partie
 *    (table mesurée vide) : une lecture qui s'arrêterait à ① ne trouverait rien pour eux, et tout classement
 *    Monga vers une de ces cartes serait refusé « événement sans bien ».
 *
 * 🔴🔴 LES MAILS D'UN ÉVÉNEMENT SONT CEUX DE `gestion_affectation`, ET C'EST UNE CORRECTION MESURÉE. La première
 * écriture de ce point lisait `gestion_rattachement` avec `cible_sorte = 'evenement'`. Cet axe existe au schéma
 * mais ne porte AUCUNE ligne en base (0, mesuré le 06/10/2026), et `carteRepo` — l'écran de la carte — ne le lit
 * jamais. Ce sont deux axes distincts, et un seul fait entrer un mail dans une carte.
 *
 * ⚠️ UNE AFFECTATION DE MAIL PRIME SUR CELLE DE SON ÉCHANGE, et la lecture le respecte : un mail déplacé vers une
 * autre carte ne compte plus pour la carte de son fil. Sans ce détail, le bien d'un mail parti ailleurs
 * reviendrait par la fenêtre.
 *
 * ⚠️ RÉPONSE VIDE = REFUS, PAS DÉDUCTION. On ne cherche JAMAIS le lot dans l'adresse du mail Monga : « aucune
 * déduction automatique » (Arno). Le mail reste à classer, et le refus le dit.
 */
export async function biensDeLEvenement(evenementId: string): Promise<string[]> {
  const avecParties = await evenementQualifieDisponible();
  const desParties = avecParties ? `, des_parties AS (
        SELECT DISTINCT p.cle
          FROM gestion_evenement_partie p
         WHERE p.evenement_id = $1 AND p.sorte = 'lot' AND p.retire_le IS NULL
           AND btrim(coalesce(p.cle, '')) <> ''
     )` : '';
  const choix = avecParties
    ? `SELECT cle FROM des_parties
        UNION
       SELECT cle FROM des_mails WHERE NOT EXISTS (SELECT 1 FROM des_parties)
       ORDER BY 1`
    : 'SELECT cle FROM des_mails ORDER BY 1';
  const { rows } = await query<{ cle: string }>(
    `WITH mails AS (
        SELECT m.id
          FROM gestion_affectation a
          JOIN gestion_message m
            ON (a.message_id IS NOT NULL AND m.id = a.message_id)
            OR (a.message_id IS NULL AND m.fil_id = a.fil_id
                AND NOT EXISTS (SELECT 1 FROM gestion_affectation a2
                                 WHERE a2.message_id = m.id AND a2.actif))
         WHERE a.evenement_id = $1 AND a.actif
     ), des_mails AS (
        SELECT DISTINCT r.cible_cle AS cle
          FROM gestion_rattachement r
          JOIN mails ON mails.id = r.message_id
         WHERE r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
           AND btrim(coalesce(r.cible_cle, '')) <> ''
     )${desParties}
     ${choix}`, [evenementId]);
  return rows.map((r) => r.cle);
}

/** Ce que la base sait du mail, pour décider s'il se classe. */
interface EtatDuMail {
  recuLe: string;
  aLaCorbeille: boolean;
  aUnBienRattache: boolean;
  estInterne: boolean;
}

async function etatDuMail(messageId: string): Promise<EtatDuMail | null> {
  const { rows } = await query<{
    recu_le: string; corbeille: boolean; a_un_bien: boolean; interne: boolean;
  }>(
    `SELECT to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS recu_le,
            (m.corbeille_le IS NOT NULL) AS corbeille,
            EXISTS (SELECT 1 FROM gestion_rattachement r
                     WHERE r.message_id = m.id AND r.statut = 'confirme'
                       AND r.cible_sorte IN ('lot', 'proprietaire', 'locataire')) AS a_un_bien,
            /* 🔴 LA MÊME RÈGLE QUE interneDuMail : la marque du MAIL l'emporte sur celle de l'échange, et une
               marque RETIRÉE sur ce mail compte comme une décision. (Pas de guillemet oblique dans ce
               commentaire : il vit dans un littéral gabarit, qu'un seul accent grave terminerait.) */
            (CASE
               WHEN EXISTS (SELECT 1 FROM gestion_message_interne mi
                             WHERE mi.message_id = m.id AND mi.retire_le IS NULL) THEN true
               WHEN EXISTS (SELECT 1 FROM gestion_message_interne mi
                             WHERE mi.message_id = m.id) THEN false
               WHEN EXISTS (SELECT 1 FROM gestion_fil_interne fi
                             WHERE fi.fil_id = m.fil_id AND fi.retire_le IS NULL) THEN true
               ELSE false END) AS interne
       FROM gestion_message m WHERE m.id = $1`, [messageId]);
  const r = rows[0];
  return r === undefined ? null : {
    recuLe: r.recu_le,
    aLaCorbeille: r.corbeille === true,
    aUnBienRattache: r.a_un_bien === true,
    estInterne: r.interne === true,
  };
}

/**
 * ══ 🔴🔴 CLASSER UN MAIL MONGA ═══════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ELLE EST IDEMPOTENTE, et elle le doit : le même mail peut repasser (relève rejouée, reprise d'une
 * référence). `rattacher` confirme un lien déjà vivant au lieu d'en créer un second, et `poserInterventions`
 * fait un diff. Rejouer ne produit donc aucun doublon, et aucun retrait.
 */
export async function classerUnMailMonga(o: {
  messageId: string; auteur?: Auteur;
}): Promise<IssueClassementMonga> {
  if (!await mongaDisponible()) return RIEN;
  const auteur = o.auteur ?? AUTEUR_MONGA;

  const lecture = await mongaDuMail(o.messageId);
  if (lecture === null) return { ...RIEN, refus: 'pas_un_mail_monga' };
  if (lecture.reference === null) return { ...RIEN, refus: 'sans_reference' };
  if (lecture.evenementId === null) {
    return { ...RIEN, refus: 'reference_a_relier', reference: lecture.reference };
  }
  const commun = { reference: lecture.reference, evenementId: lecture.evenementId };

  const etat = await etatDuMail(o.messageId);
  if (etat === null) return { ...RIEN, ...commun, refus: 'pas_un_mail_monga' };
  /**
   * 🔴🔴 DEUX DÉCISIONS HUMAINES ARRÊTENT LE CLASSEMENT, et ce sont les deux seules.
   *
   * · « INTERNE » : quelqu'un a lu ce mail et dit qu'il ne concerne pas un dossier client. Le ranger quand même
   *   dans le dossier d'un locataire défferait ce jugement sans que personne l'ait demandé.
   * · « INERTE » (lot CORBEILLE-SANS-STATUT) : jeté sans statut, « il ne demande plus de classement ». Le
   *   classer le ferait reparaître dans un historique de bien — exactement ce que ce lot-là a retiré.
   *
   * ⚠️ NI L'UN NI L'AUTRE N'EST DÉFINITIF : lever la marque, ou réintégrer le mail, et le classement se fait au
   * passage suivant. Rien n'est à défaire, parce que rien n'a été écrit.
   */
  if (etat.estInterne) return { ...RIEN, ...commun, refus: 'mail_interne' };
  if (mailInerte(etat)) return { ...RIEN, ...commun, refus: 'mail_inerte' };

  const biens = await biensDeLEvenement(lecture.evenementId);
  if (biens.length === 0) return { ...RIEN, ...commun, refus: 'evenement_sans_bien' };

  const motif = motifClassementMonga(lecture.reference);
  const messageId = Number(o.messageId);

  // ① LES LOTS D'ABORD — la base refuse une intervention sans lien « bien » vivant sur le même mail.
  const poses: string[] = [];
  for (const cle of biens) {
    const issue = await rattacher({
      messageId, cible: cibleLot(cle), auteur, motif, origine: 'automatique',
    });
    if (issue.ok) poses.push(cle);
  }
  if (poses.length === 0) return { ...RIEN, ...commun, refus: 'evenement_sans_bien' };

  /**
   * ② L'ÉVÉNEMENT — PAR `gestion_affectation`, ET PAR ELLE SEULE.
   *
   * 🔴🔴 C'EST L'AXE QUE L'ÉCRAN DE LA CARTE LIT. `carteRepo` nomme `gestion_affectation` sept fois et ne regarde
   * JAMAIS `gestion_rattachement.cible_sorte = 'evenement'` — un axe qui, mesuré le 06/10/2026, ne porte aucune
   * ligne en base. Un mail « rattaché » par cet autre axe n'apparaîtrait nulle part dans son événement : classé
   * pour la base, et invisible pour Arno. C'est aussi la porte qu'emploient la fenêtre « Classer » et le bloc
   * « Événement rattaché » (route `messages/:id/affectation`) — donc le même journal, et la même réversibilité.
   *
   * ⚠️ « DÉJÀ RATTACHÉ À CET ÉVÉNEMENT » N'EST PAS UNE ERREUR ICI : c'est l'état voulu. La porte le refuse pour
   * épargner à un clic humain un doublon ; pour une passe qui peut rejouer, c'est un succès.
   */
  const lien = await deplacerMessage(messageId, Number(lecture.evenementId), auteur, motif);
  if (!lien.ok && !lien.motif.includes('déjà rattaché à cet événement')) {
    return { ...RIEN, ...commun, refus: 'evenement_sans_bien' };
  }

  // ③ LE PROPRIÉTAIRE ET LE LOCATAIRE **À LA DATE DU MAIL**. Le module pur ne retient que ceux-là.
  const fiches = await personnesDesBiens(poses, etat.recuLe);
  const personnes = personnesEnVigueur(fiches.flatMap((b) => b.personnes));
  let posees = 0;
  if (personnes.length > 0) {
    const issue = await poserInterventions({
      messageId,
      personnes: personnes.map((p) => ({
        sorte: p.sorte, cle: p.cle, libelle: p.nom, role: p.role, contactExterneId: null,
      })),
      contact: null,
      auteur,
      origine: 'automatique',
    });
    if (issue.ok) posees = issue.posees;
  }

  /**
   * ④ ET IL SORT DE « À RATTACHER ». La file lit `gestion_rattachement_examen.issue` : tant que la ligne dit
   * « a_trier », le mail reste dans la file même rattaché. `'automatique'` est la valeur EXISTANTE qui signifie
   * « la machine a tranché, il n'y a rien à trier » — celle que le moteur écrit déjà pour les mails qu'il résout
   * seul. On n'invente donc aucune quatrième issue.
   *
   * ⚠️ « À CLASSER » SE RÈGLE TOUT SEUL : cette liste montre les mails sans statut, et ce mail porte désormais
   * des liens confirmés. Il n'y avait rien à y ajouter — c'était déjà vrai.
   */
  await query(
    `INSERT INTO gestion_rattachement_examen (message_id, issue, candidats, adresses_utiles, motif, examine_le)
          VALUES ($1, 'automatique', 0, 0, $2, now())
     ON CONFLICT (message_id) DO UPDATE
            SET issue = 'automatique', motif = excluded.motif, examine_le = now()`,
    [messageId, motifExamenMonga(lecture.reference)]);

  return { classe: true, refus: null, ...commun, biens: poses, personnes: posees };
}

/**
 * TOUS LES MAILS D'UNE RÉFÉRENCE, du plus ancien au plus récent.
 *
 * 🔴 C'EST LA SECONDE MOITIÉ DU POINT 3 : « un clic valide le lien référence ↔ événement ; le mail ET TOUS LES
 * AUTRES MAILS DE LA MÊME RÉFÉRENCE se classent alors dans l'événement ». Le lien se pose une fois, et tout
 * l'historique de l'intervention rejoint son dossier — y compris les mails reçus avant le lien.
 *
 * ⚠️ UN MAIL REFUSÉ N'ARRÊTE PAS LES AUTRES : si l'un est « interne » ou inerte, les autres se classent quand
 * même. Le bilan rend les deux comptes, et les refus avec leur motif.
 */
export async function classerLesMailsDeLaReference(o: {
  reference: string; auteur?: Auteur;
}): Promise<{ classes: number; refuses: { messageId: string; refus: RefusClassementMonga }[] }> {
  const ids = await mailsDeLaReference(o.reference);
  let classes = 0;
  const refuses: { messageId: string; refus: RefusClassementMonga }[] = [];
  for (const messageId of ids) {
    const issue = await classerUnMailMonga({ messageId, auteur: o.auteur });
    if (issue.classe) classes += 1;
    else if (issue.refus !== null) refuses.push({ messageId, refus: issue.refus });
  }
  return { classes, refuses };
}

/**
 * ══ 🔴🔴 LA PASSE MONGA DE LA RELÈVE — LIRE, PUIS CLASSER CE QUI EST DÉJÀ RELIÉ ══════════════════════════════════
 *
 * Deux temps, et l'ordre compte :
 *   ① on LIT les mails Monga qui viennent d'arriver (`gestion_monga_mail`) — y compris ceux dont la référence
 *      n'est pas reliée, parce que c'est ce qui les fera apparaître dans « Interventions Monga à relier » ;
 *   ② on CLASSE ceux dont la référence porte déjà un événement.
 *
 * 🔴🔴 ELLE PASSE **APRÈS** LE RÉEXAMEN, ET C'EST UNE NÉCESSITÉ, PAS UNE PRÉFÉRENCE. `examinerFilsPrecis`
 * réécrit `gestion_rattachement_examen` pour chaque mail qu'il examine. Classer avant lui aurait posé les liens,
 * puis le réexamen aurait remis l'issue à « a_trier » — et le mail serait revenu dans « À rattacher », classé mais
 * réclamé. Mesuré en lisant son code avant d'écrire celui-ci.
 *
 * ⚠️ ELLE NE JETTE JAMAIS. Le courrier est arrivé ; le classement est du confort. Un échec ici ne doit pas faire
 * passer la relève pour ratée — c'est la règle de toute la passe de suite.
 */
export async function passeMongaSurLesMails(messageIds: readonly number[]): Promise<{
  lus: number; classes: number; aRelier: number;
}> {
  const vide = { lus: 0, classes: 0, aRelier: 0 };
  if (messageIds.length === 0 || !await mongaDisponible()) return vide;
  try {
    const { rows } = await query<{ id: string; objet: string | null; texte: string | null }>(
      `SELECT m.id::text AS id, m.objet, m.corps_texte AS texte
         FROM gestion_message m
        WHERE m.id = ANY($1::bigint[]) AND ${SQL_EST_MAIL_MONGA}`, [[...messageIds]]);
    if (rows.length === 0) return vide;

    let classes = 0;
    let aRelier = 0;
    for (const r of rows) {
      await lireEtGarderUnMail(r.id, r.objet, r.texte);
      const issue = await classerUnMailMonga({ messageId: r.id });
      if (issue.classe) classes += 1;
      else if (issue.refus === 'reference_a_relier') aRelier += 1;
    }
    return { lus: rows.length, classes, aRelier };
  } catch {
    return vide;
  }
}
