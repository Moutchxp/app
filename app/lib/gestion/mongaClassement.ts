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
/* 🔴 LOT URGENCE-EVENEMENT — « le jour de Paris », écrit une seule fois dans le dépôt. Module PUR. */
import { jourCivilParis } from './ecran';
import { personnesDesBiens, poserInterventions } from './contactExterneRepo';
import {
  deplacerMessage, deplacerMessageVersNouveau, modifierEvenement, remettreMessage, type Auteur,
} from './gestes';
import { mailInerte } from './mailInerte';
import {
  motifClassementMonga, motifExamenMonga, personnesEnVigueur, renommageAFaire,
  type RefusClassementMonga,
} from './monga';
import {
  lireEtGarderUnMail, mailsDeLaReference, mongaDuMail, SQL_EST_MAIL_MONGA,
} from './mongaRepo';
/* 🔴🔴 LOT MONGA-2, POINT 2 — l'étape d'un mail Monga est enregistrée à l'arrivée, et lui survit. */
import { enregistrerEtapesDuMail, poserOuvertureDeRepli } from './mongaEtapeRepo';
import { cibleLot } from './rattachement';
import { changerStatut, rattacher } from './rattachementRepo';
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
  /**
   * ══ 🔴🔴 LE MAIL QU'UN HUMAIN REGARDE EN CLIQUANT — « L'ANCRE » ══════════════════════════════════════════════
   *
   * 🔴 LE DÉFAUT TROUVÉ EN PRÉPARANT L'ESSAI RÉEL, ET IL AURAIT ÉTÉ VISIBLE PAR ARNO LE PREMIER JOUR. Le mail
   * 57489 (MNG-23987) est À LA CORBEILLE sans statut, donc INERTE. Arno ouvre sa fenêtre « Classer », clique
   * « Créer l'événement » — et ce mail-là, celui qu'il avait sous les yeux, se faisait refuser par la règle de
   * l'inertie, pendant que les autres mails de la référence se classaient. Il aurait vu l'événement se
   * remplir… sans le mail depuis lequel il venait de cliquer.
   *
   * 🔴 LA RÈGLE EST CELLE D'ARNO, MOT POUR MOT, DU LOT PRÉCÉDENT : « rattacher un mail déjà jeté le réveille
   * aussi, parce qu'il a alors un statut ». L'inertie protège du classement AUTOMATIQUE, pas d'une décision. Un
   * clic EST une décision, et elle porte sur ce mail-ci.
   *
   * ⚠️ ELLE NE LÈVE QUE L'INERTIE, JAMAIS LA MARQUE « INTERNE ». Dire « interne » est un jugement explicite sur
   * le contenu d'un mail ; le défaire a sa propre confirmation à l'écran (lot PHOTOS-ET-INTERNE-INVERSE), et ce
   * n'est pas à l'encart Monga de la contourner au passage.
   *
   * ⚠️ ELLE NE VAUT QUE POUR L'ANCRE. Les autres mails de la référence suivent la règle automatique : le mail
   * 57251, jeté lui aussi, reste donc tranquille — personne n'a cliqué dessus.
   */
  ancre?: boolean;
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
  if (o.ancre !== true && mailInerte(etat)) return { ...RIEN, ...commun, refus: 'mail_inerte' };

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
      /* 🔴 LE MÊME MOTIF QUE LES BIENS : c'est la SIGNATURE du classement, et c'est par elle que l'« Annuler »
         reconnaît ce qu'il a le droit de défaire. Sans elle, le propriétaire et le locataire restaient. */
      motif,
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
  /** Le mail depuis lequel Arno a cliqué : il est classé même s'il dormait à la corbeille (voir `ancre`). */
  ancre?: string | null;
}): Promise<{ classes: number; refuses: { messageId: string; refus: RefusClassementMonga }[] }> {
  const ids = await mailsDeLaReference(o.reference);
  let classes = 0;
  const refuses: { messageId: string; refus: RefusClassementMonga }[] = [];
  for (const messageId of ids) {
    const issue = await classerUnMailMonga({
      messageId, auteur: o.auteur, ancre: messageId === o.ancre,
    });
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
  lus: number; classes: number; aRelier: number; etapes: number;
}> {
  const vide = { lus: 0, classes: 0, aRelier: 0, etapes: 0 };
  if (messageIds.length === 0 || !await mongaDisponible()) return vide;
  try {
    const { rows } = await query<{
      id: string; objet: string | null; texte: string | null; cle: string | null; recu_le: string;
    }>(
      `SELECT m.id::text AS id, m.objet, m.corps_texte AS texte,
              m.message_id AS cle, m.recu_le::text AS recu_le
         FROM gestion_message m
        WHERE m.id = ANY($1::bigint[]) AND ${SQL_EST_MAIL_MONGA}`, [[...messageIds]]);
    if (rows.length === 0) return vide;

    let classes = 0;
    let aRelier = 0;
    let etapes = 0;
    for (const r of rows) {
      const lecture = await lireEtGarderUnMail(r.id, r.objet, r.texte);
      /**
       * ══ 🔴🔴 LOT MONGA-2, POINT 2 — L'ÉTAPE EST ENREGISTRÉE ICI, À L'ARRIVÉE DU MAIL ═══════════════════════
       *
       * RÈGLE D'ARNO : « À l'arrivée de chaque mail Monga, son contenu est lu et l'étape est ENREGISTRÉE dans
       * une table propre aux étapes […] Ensuite, le devenir du mail ne change JAMAIS l'étape enregistrée. »
       *
       * 🔴 C'EST UNE SECONDE ÉCRITURE, ET NON UN REMPLACEMENT DE `lireEtGarderUnMail`. Les deux ne vivent pas
       * le même temps : `gestion_monga_mail` dit ce qu'un mail PRÉSENT contient (et meurt avec lui, par
       * `ON DELETE CASCADE`) ; `gestion_monga_etape` garde ce que l'intervention a VÉCU. 25 des 98 mails
       * gabarités étaient déjà à la corbeille au moment de ce lot, et Gmail les efface à 30 jours.
       *
       * ⚠️ ELLE NE JETTE PAS NON PLUS : même règle que la passe entière — le courrier est arrivé, et un échec
       * d'enregistrement d'étape ne doit pas faire passer la relève pour ratée.
       */
      try {
        etapes += await enregistrerEtapesDuMail({
          messageId: Number(r.id),
          messageCle: r.cle,
          reference: lecture.reference,
          objet: r.objet,
          texte: r.texte,
          recuLe: r.recu_le,
        });
        /* 🔴 ET L'OUVERTURE DE REPLI, pour que la frise commence quelque part : voir `poserOuvertureDeRepli`. */
        if (lecture.reference !== null) await poserOuvertureDeRepli(lecture.reference);
      } catch { /* l'étape attendra la reprise ; la relève, elle, continue */ }
      const issue = await classerUnMailMonga({ messageId: r.id });
      if (issue.classe) classes += 1;
      else if (issue.refus === 'reference_a_relier') aRelier += 1;
    }
    return { lus: rows.length, classes, aRelier, etapes };
  } catch {
    return vide;
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT MONGA-1, POINT 3 — LE CLIC QUI RELIE UNE RÉFÉRENCE, ET L'« ANNULER » QUI LE DÉFAIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   DEMANDE D'ARNO : « Un clic valide le lien référence ↔ événement ; le mail et TOUS LES AUTRES MAILS de la même
   référence se classent alors dans l'événement. “Annuler” quelques secondes après. »

   🔴🔴 CE CLIC EST LE SEUL ENDROIT DU LOT OÙ UN HUMAIN EST EXIGÉ, et la base l'exige elle-même
   (`gestion_monga_lien_humain_chk` refuse « automatique »). C'est la décision n° 1 d'Arno : « premier
   rattachement d'une référence = TOUJOURS un clic d'Arno, même quand le lot est unique ». Tout le reste du lot
   — la lecture, le classement, la reprise des 40 références — découle de ce clic et ne le remplace jamais. */

export type IssueLienMonga =
  | { ok: true; evenementId: string; reference: string; renomme: string | null; classes: number }
  | { ok: false; motif: string };

/** Ce que l'« Annuler » a défait. Les comptes sont dits : « annulé » sans chiffre ne se vérifie pas. */
export interface IssueAnnulationMonga {
  ok: boolean;
  motif?: string;
  /** Les liens NÉS du classement, retirés. */
  liensRetires: number;
  /** 🔴 Les liens que le moteur PROPOSAIT avant le clic, et qui retrouvent leur état de proposition. */
  liensRendus: number;
  mailsRemis: number;
  /** Les lignes d'examen que le classement avait mises à « automatique », et qui reviennent dans la file. */
  examensRepris: number;
  nomRemis: string | null;
  /** Vrai quand l'événement ne porte plus aucun mail — le cas d'une carte née du geste annulé. */
  evenementVide: boolean;
}

/** La lecture Monga la plus récente d'une référence : ce qu'Arno a sous les yeux en cliquant. */
async function lectureDeLaReference(reference: string): Promise<{
  libelle: string | null; adresse: string | null; lienMission: string | null;
} | null> {
  const { rows } = await query<{
    libelle: string | null; adresse: string | null; lien_mission: string | null;
  }>(
    `SELECT mm.libelle, mm.adresse, mm.lien_mission
       FROM gestion_monga_mail mm
       JOIN gestion_message m ON m.id = mm.message_id
      WHERE mm.reference = $1
      ORDER BY (mm.libelle IS NOT NULL) DESC, m.recu_le DESC
      LIMIT 1`, [reference]);
  return rows[0] === undefined ? null : {
    libelle: rows[0].libelle, adresse: rows[0].adresse, lienMission: rows[0].lien_mission,
  };
}

/**
 * ══ 🔴🔴 RELIER UNE RÉFÉRENCE À UN ÉVÉNEMENT **EXISTANT** ════════════════════════════════════════════════════════
 *
 * Trois gestes, dans cet ordre, et chacun par sa porte :
 *   ① le LIEN (`gestion_monga_lien`) — la décision d'Arno, datée et signée ;
 *   ② la RÈGLE DU NOM — l'événement PREND le libellé Monga, par `modifierEvenement`, qui journalise l'ancien nom ;
 *   ③ le CLASSEMENT de TOUS les mails de la référence, par le point 2.
 *
 * 🔴 LE LIEN D'ABORD, ET C'EST NÉCESSAIRE : le classement du point 2 LIT ce lien pour savoir où ranger. Dans
 * l'autre ordre, il refuserait chaque mail avec « référence à relier » — et le clic n'aurait rien classé.
 *
 * 🔴 LE RENOMMAGE PASSE PAR `modifierEvenement`, ET PAR RIEN D'AUTRE. C'est elle qui lit `FOR UPDATE`, n'écrit
 * que les champs qui changent VRAIMENT, et journalise chaque changement avec sa valeur AVANT et APRÈS. « L'ancien
 * nom conservé et visible dans l'historique » (Arno) n'est donc pas quelque chose à construire : c'est ce que
 * cette porte fait déjà, et un UPDATE écrit ici l'aurait perdu.
 *
 * ⚠️ UN ÉCHEC DU RENOMMAGE N'ANNULE PAS LE LIEN. Le lien est la décision ; le nom est une conséquence. On le DIT
 * (`renomme` reste `null`) plutôt que de défaire un geste réussi — et le nom reste modifiable à la main.
 */
export async function relierLaReference(o: {
  reference: string; evenementId: string; auteur: Auteur;
  /** Le mail depuis lequel le clic est parti. Facultatif : sans lui, tous les mails suivent la règle automatique. */
  messageId?: string | null;
}): Promise<IssueLienMonga> {
  if (!await mongaDisponible()) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 311).' };
  }
  const libelleAuteur = (o.auteur.libelle ?? '').trim();
  if (libelleAuteur === '' || libelleAuteur.toLowerCase() === 'automatique') {
    // 🔴 LA MÊME RÈGLE QUE LA BASE, DITE À L'ÉCRAN : ce geste est un clic, et la contrainte le garantit.
    return { ok: false, motif: 'Relier une intervention Monga est un geste humain : identifiez-vous.' };
  }

  const { rows: evt } = await query<{ objet: string; etat: string }>(
    'SELECT objet, etat FROM gestion_evenement WHERE id = $1', [o.evenementId]);
  if (evt[0] === undefined) return { ok: false, motif: 'Cet événement n’existe pas.' };

  const lu = await lectureDeLaReference(o.reference);
  const libelleMonga = lu?.libelle ?? null;
  const renommeVers = libelleMonga === null ? null : renommageAFaire(evt[0].objet, libelleMonga);

  // ① LE LIEN. ⚠️ L'index unique partiel refuse une seconde référence vivante : on le DIT, on ne l'écrase pas.
  try {
    await query(
      `INSERT INTO gestion_monga_lien
         (reference, evenement_id, libelle_lu, adresse_lue, lien_mission_lu, nom_avant,
          relie_par, relie_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [o.reference, o.evenementId, libelleMonga, lu?.adresse ?? null, lu?.lienMission ?? null,
        renommeVers === null ? null : evt[0].objet, o.auteur.id, libelleAuteur]);
  } catch {
    return {
      ok: false,
      motif: `L’intervention ${o.reference} est déjà reliée à un événement. Déliez-la d’abord.`,
    };
  }

  // ② LA RÈGLE DU NOM. Signée par Arno : il a vu « Le nom deviendra … » et il a validé.
  let renomme: string | null = null;
  if (renommeVers !== null) {
    const maj = await modifierEvenement(Number(o.evenementId), { objet: renommeVers }, o.auteur);
    if (maj.ok) renomme = renommeVers;
  }

  // ③ TOUS LES MAILS DE LA RÉFÉRENCE SUIVENT — y compris ceux reçus avant le lien.
  const bilan = await classerLesMailsDeLaReference({
    reference: o.reference, ancre: o.messageId ?? null,
  });
  return { ok: true, evenementId: o.evenementId, reference: o.reference, renomme, classes: bilan.classes };
}

/**
 * ══ 🔴🔴 CRÉER L'ÉVÉNEMENT « <libellé Monga> » SUR LE LOT CHOISI, PUIS RELIER ════════════════════════════════════
 *
 * 🔴 LA CRÉATION PASSE PAR `deplacerMessageVersNouveau` — la porte que la fenêtre « Classer » emploie déjà (route
 * `messages/:id/affectation`, corps `{ nouveau }`). Elle crée la carte ET y met le mail dans UNE transaction :
 * « une carte ouverte dont aucun mail ne dépend est une carte vide que personne n'a demandée ».
 *
 * 🔴 LES PARTIES DISENT SUR QUOI PORTE LA CARTE : le lot choisi, son propriétaire, son locataire du jour — la
 * même règle qu'au lot CONTACTS-ET-EVENEMENT. C'est aussi ce que `biensDeLEvenement` lira en premier pour
 * classer les mails suivants : la carte neuve sait donc tout de suite quel est son bien, sans rien dériver.
 *
 * ⚠️ `nom_avant` RESTE NULL : une carte qui vient de naître n'avait pas de nom d'avant. L'« Annuler » n'a donc
 * aucun nom à remettre, et c'est juste.
 */
export async function creerEvenementEtRelier(o: {
  reference: string; messageId: string; lotCle: string; auteur: Auteur;
  categorie?: string | null; urgence?: string | null; ouvertLe?: string | null;
}): Promise<IssueLienMonga> {
  if (!await mongaDisponible()) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 311).' };
  }
  const lu = await lectureDeLaReference(o.reference);
  const objet = (lu?.libelle ?? '').trim();
  if (objet === '') {
    return {
      ok: false,
      motif: `Monga n’a pas écrit de libellé pour ${o.reference} : donnez un nom à l’événement à la main.`,
    };
  }
  const { rows: deja } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_monga_lien WHERE reference = $1 AND retire_le IS NULL`,
    [o.reference]);
  if ((deja[0]?.n ?? 0) > 0) {
    return { ok: false, motif: `L’intervention ${o.reference} est déjà reliée à un événement.` };
  }

  const fiches = await personnesDesBiens([o.lotCle], jourDuJour());
  const parties: { sorte: 'lot' | 'proprietaire' | 'locataire'; cle: string; libelle?: string | null }[] = [
    { sorte: 'lot', cle: o.lotCle, libelle: fiches[0]?.adresseComplete ?? null },
    ...personnesEnVigueur(fiches.flatMap((b) => b.personnes))
      .map((p) => ({ sorte: p.sorte, cle: p.cle, libelle: p.nom })),
  ];

  const cree = await deplacerMessageVersNouveau(Number(o.messageId), {
    objet,
    adresseLibre: lu?.adresse ?? null,
    categorie: o.categorie ?? null,
    urgence: o.urgence ?? null,
    parties,
    ouvertLe: o.ouvertLe ?? null,
  }, o.auteur, motifClassementMonga(o.reference));
  if (!cree.ok) return { ok: false, motif: cree.motif };
  const evenementId = String(cree.evenementId);

  const lien = await relierLaReference({
    reference: o.reference, evenementId, auteur: o.auteur, messageId: o.messageId,
  });
  if (!lien.ok) return lien;
  return { ...lien, renomme: null };
}

/**
 * Le jour d'aujourd'hui, heure de Paris, en `AAAA-MM-JJ`.
 *
 * 🔴 LOT URGENCE-EVENEMENT — LA PHRASE A DÉMÉNAGÉ DANS `ecran.ts` (`jourCivilParis`), parce que la route du détail
 * d'une carte en a eu besoin à son tour. Deux écritures du « jour de Paris » auraient fini par diverger la nuit du
 * changement d'heure. Ce nom reste : il est lisible là où il est appelé.
 */
function jourDuJour(): string {
  return jourCivilParis();
}

/**
 * ══ 🔴🔴 L'« ANNULER » DES SECONDES QUI SUIVENT — ET LE « DÉLIER » DE PLUS TARD ══════════════════════════════════
 *
 * Il défait, dans l'ordre inverse, exactement ce que le clic a fait :
 *   ① le NOM d'avant est remis (quand le clic l'avait changé) ;
 *   ② les AFFECTATIONS posées par le classement sont désactivées (`remettreMessage`) ;
 *   ③ les RATTACHEMENTS posés par le classement sont retirés (`changerStatut`) ;
 *   ④ le LIEN référence ↔ événement est RETIRÉ (`retire_le`), jamais supprimé ;
 *   ⑤ les LIGNES D'EXAMEN que le classement avait mises à « automatique » reviennent dans la file, et les
 *      échanges concernés sont réexaminés par le moteur, qui recalcule le vrai verdict.
 *
 * 🔴 ON NE RECONNAÎT QUE CE QU'ON A POSÉ, et c'est la règle la plus importante de cette fonction. Le MOTIF
 * (`classé automatiquement — intervention Monga MNG-…`) sert de signature : un bien qu'Arno avait rattaché à la
 * main sur ce mail AVANT le clic garde son lien. C'est la même discipline que les fenêtres de suivi (« une
 * fenêtre ne retire que ce qu'une fenêtre a posé »), et elle est là pour la même raison : un geste humain ne se
 * défait jamais tout seul.
 *
 * ⚠️ UNE CARTE NÉE DU GESTE RESTE, VIDE, et le résultat le DIT (`evenementVide`). Rien n'est supprimé dans ce
 * dépôt — c'est déjà ce que fait « Délier » aujourd'hui. Mieux vaut une carte vide qu'Arno ferme d'un geste
 * visible qu'une suppression dont personne ne saura jamais qu'elle a eu lieu.
 *
 * ⚠️ LA LIGNE D'EXAMEN N'EST PAS REMISE À LA MAIN. Le mail reparaît dans « À rattacher » au prochain réexamen de
 * son échange, qui RECALCULE l'issue — c'est la seule façon de retrouver la vraie, puisque l'ancienne n'est
 * nulle part. Forcer « a_trier » aurait inventé un état que le moteur n'avait peut-être pas conclu.
 */
export async function delierLaReference(o: {
  reference: string; auteur: Auteur; motif?: string;
}): Promise<IssueAnnulationMonga> {
  const vide: IssueAnnulationMonga = {
    ok: false, liensRetires: 0, liensRendus: 0, mailsRemis: 0, examensRepris: 0, nomRemis: null,
    evenementVide: false,
  };
  if (!await mongaDisponible()) return { ...vide, motif: 'Mise à jour de la base à appliquer (migration 311).' };

  const { rows: lien } = await query<{ id: string; evenement_id: string; nom_avant: string | null }>(
    `SELECT id::text, evenement_id::text AS evenement_id, nom_avant
       FROM gestion_monga_lien WHERE reference = $1 AND retire_le IS NULL`, [o.reference]);
  if (lien[0] === undefined) {
    return { ...vide, motif: `L’intervention ${o.reference} n’est reliée à aucun événement.` };
  }
  const evenementId = lien[0].evenement_id;
  const motifPose = motifClassementMonga(o.reference);

  // ① LE NOM D'AVANT, par la même porte que l'aller — donc journalisé, comme le renommage l'a été.
  let nomRemis: string | null = null;
  if (lien[0].nom_avant !== null) {
    const maj = await modifierEvenement(Number(evenementId), { objet: lien[0].nom_avant }, o.auteur);
    if (maj.ok) nomRemis = lien[0].nom_avant;
  }

  // ② LES AFFECTATIONS QUE LE CLASSEMENT A POSÉES — reconnues par leur motif, et elles seules.
  const { rows: affectes } = await query<{ message_id: string }>(
    `SELECT message_id::text AS message_id FROM gestion_affectation
      WHERE evenement_id = $1 AND actif AND message_id IS NOT NULL AND motif = $2`,
    [evenementId, motifPose]);
  let mailsRemis = 0;
  for (const a of affectes) {
    const issue = await remettreMessage(Number(a.message_id), o.auteur);
    if (issue.ok) mailsRemis += 1;
  }

  /**
   * ③ LES RATTACHEMENTS — ET ILS NE SE DÉFONT PAS TOUS DE LA MÊME FAÇON. DÉFAUT MESURÉ PAR L'ESSAI RÉEL.
   *
   * 🔴🔴 LA PORTE `rattacher` NE CRÉE PAS TOUJOURS : quand le moteur avait DÉJÀ PROPOSÉ ce bien — ce qui est le
   * cas de tous les mails Monga, dont le corps porte l'adresse —, elle CONFIRME la ligne existante. Le `motif`
   * reste alors celui du moteur, et c'est `statut_motif` qui porte notre signature. Deux conséquences, et la
   * première a failli passer inaperçue :
   *
   *   · chercher la signature dans `motif` SEUL ne trouvait RIEN : l'annulation laissait les neuf liens en
   *     place (mesuré : `liensRetires: 0`) ;
   *   · et « retirer » un lien que le moteur PROPOSAIT avant le clic ne rétablit PAS l'état d'avant — cela
   *     EFFACE une proposition que personne n'avait refusée. Il faut le remettre à `propose`.
   *
   * 🔴 D'OÙ DEUX GESTES, SELON CE QUE LE CLASSEMENT A VRAIMENT FAIT :
   *   · `motif = <signature>`      ⇒ la ligne est NÉE du classement       ⇒ `retire` ;
   *   · `statut_motif = <signature>` et `motif` autre ⇒ elle était PROPOSÉE ⇒ retour à `propose`.
   *
   * ⚠️ LES PERSONNES D'ABORD, LES LOTS ENSUITE. `changerStatut` déclenche une cascade quand un lien « lot »
   * cesse d'être vivant (elle retire les interventions sans bien) : en traitant les personnes d'abord, c'est
   * NOTRE geste, signé et journalisé, qui les défait — et non un effet de bord qu'on n'aurait pas raconté.
   */
  const { rows: liens } = await query<{ id: string; sorte: string; nee: boolean }>(
    `SELECT id::text, cible_sorte AS sorte, (coalesce(motif, '') = $1) AS nee
       FROM gestion_rattachement
      WHERE statut = 'confirme' AND origine = 'automatique'
        AND (coalesce(motif, '') = $1 OR coalesce(statut_motif, '') = $1)
      ORDER BY (cible_sorte = 'lot'), id`, [motifPose]);
  let liensRetires = 0;
  let liensRendus = 0;
  for (const l of liens) {
    const issue = await changerStatut({
      lienId: Number(l.id),
      statut: l.nee ? 'retire' : 'propose',
      auteur: o.auteur,
      motif: o.motif ?? `lien Monga ${o.reference} annulé`,
    });
    if (!issue.ok) continue;
    if (l.nee) liensRetires += 1; else liensRendus += 1;
  }

  // ④ LE LIEN LUI-MÊME : retiré, daté, signé. Jamais supprimé — et la référence redevient reliable.
  await query(
    `UPDATE gestion_monga_lien
        SET retire_le = now(), retire_par = $2, retire_par_libelle = $3, retire_motif = $4
      WHERE id = $1 AND retire_le IS NULL`,
    [lien[0].id, o.auteur.id, (o.auteur.libelle ?? '').trim(),
      o.motif ?? 'lien annulé depuis l’encart Monga']);

  const { rows: reste } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gestion_affectation WHERE evenement_id = $1 AND actif`, [evenementId]);
  /**
   * ⑤ ET LA LIGNE D'EXAMEN EST **RECALCULÉE**, par le moteur lui-même.
   *
   * 🔴 LE DÉFAUT QUE CECI FERME, mesuré lui aussi : le classement avait mis l'issue à « automatique » pour
   * sortir le mail de « À rattacher ». L'annulation la laissait telle quelle — le mail restait donc dehors,
   * silencieusement, jusqu'à la prochaine relève de son échange. « Annuler » doit rétablir l'état d'avant.
   *
   * 🔴 ON NE REPOSE PAS « a_trier » À LA MAIN : l'ancienne valeur n'est nulle part, et la deviner serait
   * inventer un verdict. On fait REJOUER l'examen des échanges concernés — c'est la seule façon d'obtenir la
   * vraie, et c'est la porte que la relève emprunte à chaque passage.
   *
   * ⚠️ IL NE PEUT PAS FAIRE ÉCHOUER L'ANNULATION : tout est déjà défait quand on arrive ici. Un réexamen qui
   * tombe laisse le mail hors de la file jusqu'à la relève suivante, ce qui est gênant — pas faux.
   */
  /**
   * 🔴🔴 D'ABORD ON REPREND NOS PROPRES LIGNES D'EXAMEN, ET SEULEMENT LES NÔTRES. Le classement les signe avec
   * `motifExamenMonga` : on les reconnaît donc à coup sûr, et on ne touche à aucune autre.
   *
   * 🔴 POURQUOI CE PASSAGE EST NÉCESSAIRE EN PLUS DU RÉEXAMEN, mesuré par l'essai réel : la passe du moteur
   * N'OUVRE PAS les mails à la corbeille (`clauseHorsSpam`). Le mail 57489, jeté, gardait donc son issue
   * « automatique » après l'annulation — invisible, parce qu'un mail jeté sans statut est de toute façon INERTE
   * et ne paraît dans aucune file ; mais faux, et « Annuler » doit rétablir l'état d'avant, pas un état
   * équivalent.
   *
   * ⚠️ « a_trier » EST LE VERDICT JUSTE POUR UN MAIL MONGA : son corps porte l'adresse du bien, donc le moteur
   * lui trouve toujours des candidats — ce qui exclut « sans_candidat » — sans jamais de certitude, ce qui
   * exclut « automatique ». Et pour les mails que le réexamen SAIT ouvrir, c'est lui qui tranche juste après :
   * cette remise n'est qu'un plancher.
   */
  const { rows: repris } = await query<{ message_id: string }>(
    `UPDATE gestion_rattachement_examen
        SET issue = 'a_trier', motif = NULL, examine_le = now()
      WHERE issue = 'automatique' AND motif = $1
      RETURNING message_id::text`, [motifExamenMonga(o.reference)]);

  try {
    const { rows: fils } = await query<{ fil_id: string }>(
      `SELECT DISTINCT m.fil_id::text AS fil_id
         FROM gestion_monga_mail mm JOIN gestion_message m ON m.id = mm.message_id
        WHERE mm.reference = $1`, [o.reference]);
    if (fils.length > 0) {
      const { chargerLibelles, examinerFilsPrecis, COMPTES_VIDES } = await import('./rattachementRepo');
      await examinerFilsPrecis(
        fils.map((f) => Number(f.fil_id)), await chargerLibelles(), { ...COMPTES_VIDES }, true);
    }
  } catch { /* le réexamen est un rattrapage d'état, pas le geste */ }

  return {
    ok: true,
    liensRetires,
    liensRendus,
    mailsRemis,
    examensRepris: repris.length,
    nomRemis,
    evenementVide: (reste[0]?.n ?? 0) === 0,
  };
}
