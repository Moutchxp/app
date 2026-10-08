import 'server-only';
/* 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — LA règle « qu'est-ce qu'un mail rattaché à un bien », écrite une fois. */
import { sqlLiensDuBien } from './rattachement';
import { query } from '../db/client';
import { rattachementsDisponibles } from './schema';
/* 🔴🔴 LOT ETAT-PAR-LA-FRISE — « ouvert » et « clos le » se DÉDUISENT des cartes de borne de la frise, jamais
   plus de `gestion_evenement.etat` / `traite_le`. C'est dans ce module que se voyait le constat d'Arno. */
import { sqlClosLeParLaFrise, sqlEvenementOuvertParLaFrise } from './etatParLaFrise';

/**
 * LOT HISTORIQUE-BIEN-1 — LES ÉVÉNEMENTS D'UN BIEN, **AVEC LEURS DATES**. LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI UN FICHIER NEUF PLUTÔT QU'UNE LIGNE DANS `historiqueRepo`. Le tableau de bord du bloc « Historique »
 * propose de choisir un événement pour RÉGLER LES DEUX DATES (`periodeDeLEvenement`, module pur). Il lui faut donc
 * `ouvert_le` et `traite_le` — deux colonnes qu'aucune lecture existante ne rend : `LigneHistorique.evenements`
 * porte la référence, l'objet et l'état, jamais les dates ; `chercherEvenements` cherche par mots, sans filtrer
 * par bien. Plutôt que d'élargir une réponse que quatre écrans lisent déjà, cette question vit à part.
 *
 * 🔴 LE PRÉDICAT EST **CELUI DU CARTOUCHE DE LA FICHE**, AU MOT PRÈS (`annuaireRepo`, `evenementsOuverts`) : un
 * événement affecté à un échange dont un mail porte un rattachement CONFIRMÉ vers ce lot. Deux définitions de
 * « les événements de ce bien » finiraient par se contredire d'un écran à l'autre — et c'est le compteur du haut
 * de fiche qui aurait l'air faux.
 *
 * ⚠️ LA DIFFÉRENCE AVEC LE CARTOUCHE, ET ELLE EST VOULUE : ici on prend AUSSI les événements **traités**. Arno
 * demande de pouvoir choisir « un événement, en cours ou clos » — on relit l'histoire d'un sinistre réglé bien
 * plus souvent que celle d'un sinistre en cours.
 *
 * 🔒 LECTURE SEULE, UN SEUL SELECT. Aucun chemin d'écriture n'est ouvert ici.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Un événement du bien, tel que le tableau de bord l'offre. `closLe === null` ⇒ il n'est pas clos. */
export interface EvenementDuBien {
  id: number;
  reference: string;
  objet: string;
  etat: string;
  /** `true` = non traité. C'est lui dont le titre s'affiche en tête du bloc. */
  ouvert: boolean;
  ouvertLe: string | null;
  closLe: string | null;
  /** Combien de mails de CE bien portent cet événement — pour que le choix ne mène pas à un fil vide. */
  nbMails: number;
}

/** Combien d'événements au plus. Au-delà, l'écran DIT qu'il y en a d'autres — il ne les cache pas en silence. */
export const EVENEMENTS_DU_BIEN_MAX = 40;

/**
 * 🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — le plafond des couples (locataire, événement).
 *
 * ⚠️ C'est un plafond sur la SOMME de toutes les occupations du bien. Mesuré : aucun bien du portefeuille ne
 * porte plus de deux événements, et lot-146 en porte trois occupations — 200 laisse trente fois la place.
 */
export const EVENEMENTS_PAR_LOCATAIRE_MAX = 200;

export async function evenementsDuBien(
  lotCle: string,
): Promise<{ liste: EvenementDuBien[]; tronque: boolean }> {
  /* ⚠️ UNE SONDE VOYAGE AVEC SA DONNÉE (règle du module) : sans la migration 257, la table des rattachements
     n'est nommée nulle part, et la liste revient vide — l'écran n'offre alors simplement aucun événement. */
  if (lotCle.trim() === '' || !(await rattachementsDisponibles())) return { liste: [], tronque: false };

  /**
   * 🔴🔴 LOT ETAT-PAR-LA-FRISE — « ouvert » ET « clos le » VIENNENT DE LA FRISE, PLUS DE LA COLONNE.
   *
   * C'est ICI que se voyait le constat d'Arno du 08/10/2026 : GES-2026-000001 s'affichait « clos · clos le
   * 08/10/2026 » dans le bloc Événements de la fiche du bien 315, alors que sa carte Clôture n'existait plus.
   *
   * ⚠️ `closLe` GAGNE AU PASSAGE EN JUSTESSE : `traite_le` portait l'instant du CLIC, jamais la date écrite sur
   * la carte. La carte Clôture de cet événement était datée du 14/10/2026 ; l'écran disait 08/10.
   */
  const { rows } = await query<{
    id: string; reference: string; objet: string; etat: string; ouvert: boolean;
    ouvert_le: string | null; clos_le: string | null; n: string;
  }>(
    `SELECT e.id::text, e.reference, e.objet, e.etat,
            ${sqlEvenementOuvertParLaFrise('e')} AS ouvert,
            to_char(e.ouvert_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ouvert_le,
            to_char(${sqlClosLeParLaFrise('e')} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS clos_le,
            count(DISTINCT m2.id)::text AS n
       FROM gestion_evenement e
       JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif
       JOIN gestion_message m2 ON m2.fil_id = a.fil_id
       JOIN gestion_rattachement r2 ON r2.message_id = m2.id
      WHERE r2.cible_sorte = 'lot' AND r2.cible_cle = $1 AND r2.statut = 'confirme' AND r2.piece_id IS NULL
      GROUP BY e.id, e.reference, e.objet, e.etat, e.ouvert_le, e.traite_le
      -- LES OUVERTS D'ABORD, puis du plus récemment ouvert au plus ancien : c'est l'ordre dans lequel on cherche.
      ORDER BY NOT ${sqlEvenementOuvertParLaFrise('e')}, e.ouvert_le DESC, e.id DESC
      LIMIT $2`,
    [lotCle, EVENEMENTS_DU_BIEN_MAX + 1]);

  return {
    tronque: rows.length > EVENEMENTS_DU_BIEN_MAX,
    liste: rows.slice(0, EVENEMENTS_DU_BIEN_MAX).map((r) => ({
      id: Number(r.id), reference: r.reference, objet: r.objet, etat: r.etat,
      ouvert: r.ouvert,
      ouvertLe: r.ouvert_le,
      /* ⚠️ « CLOS » SE LIT SUR LA DERNIÈRE CARTE CLÔTURE, et `null` se lit « pas de borne haute » — la période
         court alors jusqu'à aujourd'hui (`periodeDeLEvenement`), plutôt que d'inventer une date de clôture. */
      closLe: r.clos_le,
      nbMails: Number(r.n),
    })),
  };
}

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — QUELS ÉVÉNEMENTS CONCERNENT QUEL LOCATAIRE ════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (05/10/2026) : « si un ÉVÉNEMENT le concerne et se poursuit APRÈS sa sortie (litige, dépôt de
 * garantie, n'importe quel type), la date de fin devient la date de CLÔTURE de cet événement, ou AUJOURD'HUI
 * s'il n'est pas clos. […] "Le concerne" = événement ouvert pendant son occupation, OU lié à un mail où figure
 * une adresse de sa carte ou de ses contacts annexes. »
 *
 * ═══ 🔴 LA DÉFINITION RETENUE, MOT POUR MOT, ET SES DEUX BRANCHES ═══════════════════════════════════════════════
 *
 * Un événement CONCERNE une occupation si AU MOINS L'UNE des deux est vraie :
 *   ① SON OUVERTURE TOMBE DANS L'OCCUPATION — entre l'entrée et la sortie (ou aujourd'hui si le bail court).
 *      C'est le cas ordinaire : un dégât des eaux pendant le bail.
 *   ② UN DE SES MAILS PORTE UNE ADRESSE DE SA CARTE OU D'UN DE SES CONTACTS ANNEXES. C'est le cas du dépôt de
 *      garantie : l'événement s'ouvre APRÈS le départ, et seule la présence du locataire dans le fil le rattache.
 *
 * ⚠️ LES « CONTACTS ANNEXES » SONT CEUX DU LOT 16, par la MÊME règle de co-participation : les adresses qui
 * paraissent dans les mails où paraissent celles de la carte. Une seconde définition de « contact d'un
 * locataire » aurait fini par rattacher un événement à une location et pas à ses contacts.
 *
 * ⚠️ AUCUNE CONDITION DE PÉRIODE SUR LA BRANCHE ② : c'est tout son objet. La borner à l'occupation aurait
 * reproduit exactement le défaut que le lot 16 a fermé — le courrier du dépôt de garantie est postérieur au bail.
 *
 * ⚠️ LES ADRESSES INTERNES SONT ÉCARTÉES de la branche ② : nous paraissons dans tous les événements de toutes
 * les locations, et chacun serait alors rattaché à chacune.
 *
 * ═══ 🔴🔴 ET LES ADRESSES D'UNE **AUTRE PARTIE** DU BIEN AUSSI — DÉFAUT TROUVÉ À L'ESSAI, PAS DEVINÉ ════════════
 *
 * Mesuré sur lot-146 avec un événement d'essai posé sur le fil 3366 (le dépôt de garantie de VAGLIO) : il
 * remontait pour les TROIS cartes du bien, dont **ACKET GOEMAERE - DERRIEN**, partie le 31/01/2025 et totalement
 * étrangère à ce dépôt. Une seule adresse l'y traînait : `blandine.piriou@gmail.com` — qui est la
 * **PROPRIÉTAIRE** du lot (annuaire, propriétaire 233). La co-participation du lot 16 est volontairement large :
 * elle rend toutes les adresses non internes des mails de la carte, bailleur et artisans compris.
 *
 * 🔴 CE QUI EST SANS CONSÉQUENCE DANS L'ENCART EN A UNE ICI. Dans l'encart, une adresse rangée « propriétaire »
 * part dans le groupe du propriétaire et n'atteint jamais la carte du locataire : la catégorie fait le tri en
 * amont. Ici, rien ne le faisait — et tout événement touchant le bailleur aurait prolongé la période de TOUS les
 * anciens locataires jusqu'à aujourd'hui, c'est-à-dire ramené le défaut que le lot 13 avait fermé.
 *
 * ⚠️ LA BRANCHE ② ÉCARTE DONC LES ADRESSES QUI APPARTIENNENT À UNE AUTRE PARTIE DU BIEN : les contacts du
 * PROPRIÉTAIRE du lot, et ceux des AUTRES cartes de locataires. Les adresses de SA carte restent, évidemment.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface EvenementDuLocataire {
  /** La clé de la carte, dans la forme de l'écran : `occ-<id d'occupation>`. */
  cle: string;
  evenementId: number;
  reference: string;
  objet: string;
  ouvert: boolean;
  ouvertLe: string | null;
  closLe: string | null;
  /** Par quelle branche il est rattaché — c'est ce qui permet d'expliquer un rattachement surprenant. */
  par: 'occupation' | 'adresse';
}

export async function evenementsParLocataire(lotCle: string): Promise<EvenementDuLocataire[]> {
  const cle = (lotCle ?? '').trim();
  if (cle === '' || !(await rattachementsDisponibles())) return [];

  const { rows } = await query<{
    occ: string; id: string; reference: string; objet: string; etat: string; ouvert: boolean;
    ouvert_le: string | null; clos_le: string | null; par: string;
  }>(
    `WITH mails AS (
       SELECT DISTINCT r.message_id
         FROM gestion_rattachement r
        WHERE ${sqlLiensDuBien('r')} AND r.cible_cle = $1
     ),
     cartes AS (
       SELECT o.id AS occ, o.entree, o.sortie, lower(btrim(c.valeur)) AS adresse
         FROM gestion_annuaire_occupation o
         JOIN gestion_annuaire_lot l ON l.id = o.lot_id AND l.wippimmo_id = $1
         JOIN gestion_annuaire_contact c
           ON c.sujet = 'locataire' AND c.sujet_id = o.locataire_id
          AND c.sorte = 'email' AND c.absent_le IS NULL
        WHERE o.absent_le IS NULL AND btrim(c.valeur) <> ''
     ),
     bornes AS (SELECT occ, min(entree) AS entree, max(sortie) AS sortie FROM cartes GROUP BY occ),
     /* Les mails où une adresse de la carte participe — la même mesure que \`contactsParLocataire\` (lot 16). */
     partages AS (
       SELECT DISTINCT ca.occ, a.message_id
         FROM cartes ca
         JOIN gestion_message_adresse a ON a.adresse = ca.adresse
         JOIN mails ON mails.message_id = a.message_id
     ),
     /* 🔴🔴 LES ADRESSES DES AUTRES PARTIES DU BIEN — le propriétaire du lot, et les autres cartes. Voir
        l'encadré : sans ce tri, la propriétaire traînait l'événement du dépôt de garantie de VAGLIO jusqu'à la
        carte d'ACKET, partie neuf mois plus tôt. */
     autres AS (
       SELECT lower(btrim(c.valeur)) AS adresse
         FROM gestion_annuaire_lot l
         JOIN gestion_annuaire_contact c
           ON c.sujet = 'proprietaire' AND c.sujet_id = l.proprietaire_id
          AND c.sorte = 'email' AND c.absent_le IS NULL
        WHERE l.wippimmo_id = $1 AND btrim(c.valeur) <> ''
     ),
     /* …et toutes les adresses NON INTERNES de ces mails : la carte ET ses contacts annexes, d'un coup. */
     siennes AS (
       SELECT DISTINCT p.occ, a.adresse
         FROM partages p
         JOIN gestion_message_adresse a ON a.message_id = p.message_id
        WHERE a.interne = false
          /* ⚠️ SAUF SI C'EST UNE ADRESSE DE SA PROPRE CARTE : elle est à elle, quoi qu'elle soit par ailleurs. */
          AND (EXISTS (SELECT 1 FROM cartes mi WHERE mi.occ = p.occ AND mi.adresse = a.adresse)
            OR (NOT EXISTS (SELECT 1 FROM autres au WHERE au.adresse = a.adresse)
                AND NOT EXISTS (SELECT 1 FROM cartes ad WHERE ad.adresse = a.adresse)))
     ),
     evts AS (
       SELECT e.id, e.reference, e.objet, e.etat, e.ouvert_le, e.traite_le, af.fil_id
         FROM gestion_evenement e
         JOIN gestion_affectation af ON af.evenement_id = e.id AND af.actif
     ),
     mails_evt AS (
       SELECT DISTINCT ev.id AS evt, m.id AS message_id
         FROM evts ev
         JOIN gestion_message m ON m.fil_id = ev.fil_id
         JOIN mails ON mails.message_id = m.id
     )
     SELECT b.occ::text AS occ, ev.id::text AS id, ev.reference, ev.objet, ev.etat,
            /* 🔴 LOT ETAT-PAR-LA-FRISE — « ouvert » et « clos le » viennent des cartes de BORNE, comme partout
               ailleurs. Le sous-ensemble ev porte id et ouvert_le, les deux colonnes dont la regle a besoin.
               AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit. */
            ${sqlEvenementOuvertParLaFrise('ev')} AS ouvert,
            to_char(ev.ouvert_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ouvert_le,
            to_char(${sqlClosLeParLaFrise('ev')} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS clos_le,
            /* ① l'ouverture tombe dans l'occupation ; ② sinon, c'est une adresse qui l'a rattaché. */
            CASE WHEN ev.ouvert_le::date >= b.entree
                  AND ev.ouvert_le::date <= coalesce(b.sortie, current_date)
                 THEN 'occupation' ELSE 'adresse' END AS par
       FROM bornes b
       JOIN (SELECT DISTINCT id, reference, objet, etat, ouvert_le, traite_le FROM evts) ev ON true
      WHERE EXISTS (SELECT 1 FROM mails_evt me WHERE me.evt = ev.id)
        AND (
          (b.entree IS NOT NULL AND ev.ouvert_le::date >= b.entree
             AND ev.ouvert_le::date <= coalesce(b.sortie, current_date))
          OR EXISTS (
            SELECT 1 FROM mails_evt me
              JOIN gestion_message_adresse a ON a.message_id = me.message_id
              JOIN siennes s ON s.occ = b.occ AND s.adresse = a.adresse
             WHERE me.evt = ev.id)
        )
      ORDER BY b.occ, ev.ouvert_le DESC
      LIMIT $2`,
    [cle, EVENEMENTS_PAR_LOCATAIRE_MAX]);

  return rows.map((r) => ({
    cle: `occ-${r.occ}`,
    evenementId: Number(r.id),
    reference: r.reference,
    objet: r.objet,
    ouvert: r.ouvert,
    ouvertLe: r.ouvert_le,
    closLe: r.clos_le,
    par: r.par === 'occupation' ? 'occupation' : 'adresse',
  }));
}
