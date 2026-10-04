import 'server-only';
import { query } from '../db/client';
import { rattachementsDisponibles } from './schema';

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

export async function evenementsDuBien(
  lotCle: string,
): Promise<{ liste: EvenementDuBien[]; tronque: boolean }> {
  /* ⚠️ UNE SONDE VOYAGE AVEC SA DONNÉE (règle du module) : sans la migration 257, la table des rattachements
     n'est nommée nulle part, et la liste revient vide — l'écran n'offre alors simplement aucun événement. */
  if (lotCle.trim() === '' || !(await rattachementsDisponibles())) return { liste: [], tronque: false };

  const { rows } = await query<{
    id: string; reference: string; objet: string; etat: string;
    ouvert_le: string | null; traite_le: string | null; n: string;
  }>(
    `SELECT e.id::text, e.reference, e.objet, e.etat,
            to_char(e.ouvert_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ouvert_le,
            to_char(e.traite_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS traite_le,
            count(DISTINCT m2.id)::text AS n
       FROM gestion_evenement e
       JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif
       JOIN gestion_message m2 ON m2.fil_id = a.fil_id
       JOIN gestion_rattachement r2 ON r2.message_id = m2.id
      WHERE r2.cible_sorte = 'lot' AND r2.cible_cle = $1 AND r2.statut = 'confirme' AND r2.piece_id IS NULL
      GROUP BY e.id, e.reference, e.objet, e.etat, e.ouvert_le, e.traite_le
      -- LES OUVERTS D'ABORD, puis du plus récemment ouvert au plus ancien : c'est l'ordre dans lequel on cherche.
      ORDER BY (e.etat = 'traite') ASC, e.ouvert_le DESC, e.id DESC
      LIMIT $2`,
    [lotCle, EVENEMENTS_DU_BIEN_MAX + 1]);

  return {
    tronque: rows.length > EVENEMENTS_DU_BIEN_MAX,
    liste: rows.slice(0, EVENEMENTS_DU_BIEN_MAX).map((r) => ({
      id: Number(r.id), reference: r.reference, objet: r.objet, etat: r.etat,
      ouvert: r.etat !== 'traite',
      ouvertLe: r.ouvert_le,
      /* ⚠️ « CLOS » SE LIT SUR `traite_le`, PAS SUR L'ÉTAT : un événement peut être marqué traité sans que la date
         ait été posée (reprises anciennes). `null` se lit « pas de borne haute connue », et `periodeDeLEvenement`
         retombe alors sur aujourd'hui — plutôt que d'inventer une date de clôture. */
      closLe: r.traite_le,
      nbMails: Number(r.n),
    })),
  };
}
