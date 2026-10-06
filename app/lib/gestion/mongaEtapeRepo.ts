/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 2 — LE DÉPÔT DES ÉTAPES MONGA ════════════════════════════════════════════════════════
 *
 * 🔴 CE FICHIER TOUCHE `pg`. Il ne doit JAMAIS être importé depuis un composant `'use client'` — règle du dépôt
 * depuis l'incident du 24/09/2026, tenue par `clientBoundary.guard.test.ts`. Les écrans passent par les routes.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO : « le devenir du mail (boîte, corbeille, inerte, supprimé, réintégré) ne change JAMAIS l'étape
 * enregistrée. Quand une référence est reliée plus tard à un événement, toutes ses étapes déjà enregistrées y
 * apparaissent. Aucun doublon si un même mail est relu. »
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { query } from '../db/client';
import {
  etapesDuMailMonga, ouvertureDeRepli, rangsDesDevis,
  type Certitude, type TypeEtape,
} from './mongaEtape';

/** Une étape telle que l'écran la reçoit. */
export interface EtapeEcran {
  id: number;
  reference: string | null;
  type: TypeEtape;
  survenuLe: string;
  heureConnue: boolean;
  heureFin: string | null;
  numero: string | null;
  rang: number | null;
  montantCents: number | null;
  texte: string | null;
  auteur: string | null;
  source: 'monga' | 'manuelle';
  certitude: Certitude | 'confirmee' | 'ecartee';
  statut: 'vif' | 'retire';
  /** `null` = le mail n'existe plus. L'écran dit alors « mail supprimé — étape conservée » (Arno). */
  messageId: number | null;
  /**
   * 🔴🔴 CETTE ÉTAPE A-T-ELLE **JAMAIS** EU UN MAIL ? Défaut trouvé à l'écran le 06/10/2026 : les 33 ouvertures
   * de repli n'ont pas de message (elles sont DÉDUITES de la date du premier mail), et l'écran leur écrivait
   * « mail supprimé — étape conservée ». C'est faux, et c'est le genre de fausseté qui discrédite tout le reste :
   * on annonce une suppression qui n'a pas eu lieu.
   *
   * `message_cle` tranche : elle est posée à l'enregistrement et SURVIT à la suppression de la ligne du mail.
   * Absente, l'étape n'a jamais eu de mail.
   */
  aEuUnMail: boolean;
  filId: number | null;
  pieceNom: string | null;
  creeParLibelle: string | null;
  /**
   * 🔴 LOT FRISE-CONSTRUCTIBLE — QUAND LA CARTE A ÉTÉ POSÉE (Arno, point 3 : « ajoutée le 06/10 à 22:31 par
   * Arnaud », visible au survol). À ne pas confondre avec `survenuLe`, la date de ce qui s'est PASSÉ : les deux
   * diffèrent dès qu'on rattrape un oubli, et c'est justement là qu'on a besoin de les distinguer.
   */
  creeLe: string | null;
  /** 🔴 LOT FRISE-CONSTRUCTIBLE — le titre saisi d'une carte LIBRE. `null` partout ailleurs (migration 315). */
  titre: string | null;
  /** Le rang du devis dans sa référence (« Devis 2 »), calculé par le module pur. */
  rangDevis: number | null;
}

/**
 * ══ 🔴🔴 ENREGISTRER LES ÉTAPES D'UN MAIL. APPELÉE PAR LA RELÈVE, À CHAQUE MAIL MONGA ════════════════════════════
 *
 * 🔴 `ON CONFLICT DO NOTHING` PLUTÔT QU'UN `SELECT` PRÉALABLE : la relève tourne en boucle et peut se croiser avec
 * la reprise. Un test d'existence suivi d'une insertion laisse une fenêtre entre les deux ; l'index unique, lui,
 * ne laisse rien passer, et c'est la base qui tranche — pas l'ordre d'exécution.
 *
 * ⚠️ ON N'ÉCRIT RIEN SANS RÉFÉRENCE : une étape qui ne vise ni une référence ni un événement n'est retrouvable
 * par personne. 4 des 98 mails gabarités n'en portent pas (mesuré) ; ils sont ignorés, et c'est volontaire.
 *
 * Rend le nombre d'étapes réellement écrites (0 si le mail avait déjà été lu).
 */
export async function enregistrerEtapesDuMail(m: {
  messageId: number;
  messageCle: string | null;
  reference: string | null;
  objet: string | null;
  texte: string | null;
  recuLe: string;
}): Promise<number> {
  if (m.reference === null) return 0;
  const lues = etapesDuMailMonga(m.objet, m.texte);
  if (lues.length === 0) return 0;
  let ecrites = 0;
  for (const e of lues) {
    /**
     * 🔴 LA DATE DE L'ÉTAPE, ET NON CELLE DU MAIL, QUAND LE MAIL LA DONNE. Le mail du 06/10 annonce un
     * rendez-vous le 09/10 : c'est le 09/10 qui doit se lire sur la frise. Le module pur rend le jour ; l'heure
     * s'y ajoute ici, parce qu'elle vient du même texte.
     */
    const jour = e.jour;
    const survenu = jour === null
      ? m.recuLe
      : `${jour}T${e.heure?.de ?? '00:00'}:00`;
    const r = await query(
      `INSERT INTO gestion_monga_etape
         (reference, type, survenu_le, heure_connue, heure_fin, numero, rang, texte, auteur,
          source, message_id, message_cle, certitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'monga',$10,$11,$12)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [m.reference, e.type, survenu, e.heure !== null, e.heure?.a ?? null,
        e.numero, e.rang, e.texte, e.auteur, m.messageId, m.messageCle, e.certitude],
    );
    ecrites += r.rowCount ?? 0;
  }
  return ecrites;
}

/**
 * ══ 🔴 L'OUVERTURE DE REPLI, POSÉE UNE SEULE FOIS PAR RÉFÉRENCE ══════════════════════════════════════════════════
 *
 * DÉCISION D'ARNO : « L'ouverture prend l'accusé de réception s'il existe, sinon la date du premier mail Monga de
 * la référence, avec la mention “à confirmer”. »
 *
 * ⚠️ ON NE LA POSE PAS S'IL Y A DÉJÀ UNE OUVERTURE, accusé ou repli : c'est ce qui fait qu'un accusé de réception
 * arrivé APRÈS la pose du repli ne crée pas une seconde ouverture. Mesuré : 31 des 33 références n'ont aucun
 * accusé, le repli est donc le cas ordinaire et non l'exception.
 */
export async function poserOuvertureDeRepli(reference: string): Promise<boolean> {
  const { rows } = await query<{ premier: string | null }>(
    `SELECT min(survenu_le)::text AS premier
       FROM gestion_monga_etape WHERE reference = $1 AND statut = 'vif'`, [reference]);
  const premier = rows[0]?.premier ?? null;
  if (premier === null) return false;
  const deja = await query(
    `SELECT 1 FROM gestion_monga_etape
      WHERE reference = $1 AND type = 'ouverture' AND statut = 'vif' LIMIT 1`, [reference]);
  if ((deja.rowCount ?? 0) > 0) return false;
  const e = ouvertureDeRepli(premier);
  const r = await query(
    `INSERT INTO gestion_monga_etape (reference, type, survenu_le, texte, source, certitude)
     VALUES ($1,'ouverture',$2,$3,'monga','a_confirmer') RETURNING id`,
    [reference, premier, e.texte]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * ══ 🔴🔴 LA FRISE D'UN ÉVÉNEMENT ═════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 DEUX SOURCES EN UNE SEULE LECTURE, et c'est le cœur de la règle d'Arno : les étapes rattachées aux
 * RÉFÉRENCES reliées à cet événement (par `gestion_monga_lien`), PLUS les étapes manuelles posées sur
 * l'événement lui-même. Relier une référence plus tard fait donc apparaître d'un coup tout son passé, sans
 * qu'une seule ligne soit réécrite.
 *
 * ⚠️ `LEFT JOIN` SUR LE MESSAGE : l'étape dont le mail a été supprimé doit sortir quand même, avec `filId` à
 * `null` — c'est ce qui permet d'afficher « mail supprimé — étape conservée ». Un `INNER JOIN` l'aurait fait
 * disparaître, c'est-à-dire exactement ce que ce lot répare.
 */
export async function friseDeLEvenement(evenementId: number): Promise<EtapeEcran[]> {
  const { rows } = await query<{
    id: string; reference: string | null; type: TypeEtape; survenu_le: string;
    heure_connue: boolean; heure_fin: string | null; numero: string | null; rang: number | null;
    montant_cents: string | null; texte: string | null; auteur: string | null;
    source: 'monga' | 'manuelle'; certitude: EtapeEcran['certitude']; statut: 'vif' | 'retire';
    message_id: string | null; message_cle: string | null; fil_id: string | null;
    piece_nom: string | null; cree_par_libelle: string | null;
    cree_le: string | null; titre: string | null;
  }>(
    `SELECT e.id, e.reference, e.type, e.survenu_le::text, e.heure_connue, e.heure_fin,
            e.numero, e.rang, e.montant_cents, e.texte, e.auteur, e.source, e.certitude, e.statut,
            e.message_id, e.message_cle, m.fil_id, e.piece_nom, e.cree_par_libelle,
            e.cree_le::text, e.titre
       FROM gestion_monga_etape e
       LEFT JOIN gestion_message m ON m.id = e.message_id
      WHERE e.statut = 'vif'
        AND (e.evenement_id = $1
             OR e.reference IN (SELECT reference FROM gestion_monga_lien
                                 WHERE evenement_id = $1 AND retire_le IS NULL))
      ORDER BY e.survenu_le, e.id`, [evenementId]);

  /**
   * ══ 🔴🔴 LE RANG DES DEVIS SE COMPTE **PAR RÉFÉRENCE**, ET C'EST UN DÉFAUT TROUVÉ À L'ÉCRAN ═════════════════
   *
   * Première écriture : un seul appel à `rangsDesDevis` sur TOUS les devis de l'événement. Vérifié le 06/10/2026
   * sur l'événement 1, trois références reliées — la frise affichait « Devis 1 », « Devis 2 », « Devis 3 » pour
   * trois devis appartenant à TROIS INTERVENTIONS DIFFÉRENTES. Lu de bonne foi, cela raconte un devis refusé
   * deux fois, alors que chaque intervention n'en a qu'un.
   *
   * 🔴 UN ÉVÉNEMENT PEUT PORTER PLUSIEURS RÉFÉRENCES (c'est tout l'objet de `gestion_monga_lien`), et le rang
   * d'un devis n'a de sens que DANS SON INTERVENTION. On groupe donc avant de compter.
   */
  const parReference = new Map<string, { id: number; numero: string | null; jour: string }[]>();
  for (const r of rows) {
    if (r.type !== 'devis_recu') continue;
    const cle = r.reference ?? '(manuelle)';
    const liste = parReference.get(cle) ?? [];
    liste.push({ id: Number(r.id), numero: r.numero, jour: r.survenu_le.slice(0, 10) });
    parReference.set(cle, liste);
  }
  const rangs = new Map<number, number>();
  for (const [, liste] of parReference) {
    for (const [id, rang] of rangsDesDevis(liste)) rangs.set(id, rang);
  }

  return rows.map((r) => ({
    id: Number(r.id),
    reference: r.reference,
    type: r.type,
    survenuLe: r.survenu_le,
    heureConnue: r.heure_connue,
    heureFin: r.heure_fin,
    numero: r.numero,
    rang: r.rang,
    /* ⚠️ `bigint` RENDU EN CHAÎNE PAR `pg` : la convertir ici, sinon le montant s'afficherait « 12500 » puis
       servirait à une division qui rendrait `NaN`. Piège déjà consigné pour les identifiants. */
    montantCents: r.montant_cents === null ? null : Number(r.montant_cents),
    texte: r.texte,
    auteur: r.auteur,
    source: r.source,
    certitude: r.certitude,
    statut: r.statut,
    messageId: r.message_id === null ? null : Number(r.message_id),
    aEuUnMail: r.message_cle !== null,
    filId: r.fil_id === null ? null : Number(r.fil_id),
    pieceNom: r.piece_nom,
    creeParLibelle: r.cree_par_libelle,
    creeLe: r.cree_le,
    titre: r.titre,
    rangDevis: rangs.get(Number(r.id)) ?? null,
  }));
}

/** AJOUTER UNE ÉTAPE À LA MAIN (Arno : « + Ajouter une étape »). */
export async function ajouterEtapeManuelle(a: {
  evenementId: number;
  type: TypeEtape;
  survenuLe: string;
  heureConnue: boolean;
  texte: string | null;
  montantCents: number | null;
  pieceNom: string | null;
  /** 🔴 LOT FRISE-CONSTRUCTIBLE — le titre d'une carte LIBRE. `null` pour tous les autres types. */
  titre: string | null;
  parId: number | null;
  parLibelle: string;
}): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_monga_etape
       (evenement_id, type, survenu_le, heure_connue, texte, montant_cents, piece_nom, titre,
        source, certitude, cree_par, cree_par_libelle)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manuelle','fiable',$9,$10) RETURNING id`,
    [a.evenementId, a.type, a.survenuLe, a.heureConnue, a.texte, a.montantCents, a.pieceNom, a.titre,
      a.parId, a.parLibelle]);
  return Number(rows[0].id);
}

/**
 * MODIFIER UNE ÉTAPE MANUELLE.
 *
 * 🔴 UNE ÉTAPE MONGA NE SE MODIFIE PAS (Arno), ET LA GARDE EST DANS LE `WHERE`, pas dans l'appelant : une règle
 * métier tenue par l'écran seul finit par être contournée par la deuxième route qui l'oublie.
 *
 * ⚠️ LE MONTANT FAIT EXCEPTION, et c'est la décision d'Arno du 06/10 : « Devis automatique (numéro + date),
 * montant complété à la main. » Il se pose donc sur une étape Monga — voir `completerMontant`.
 */
export async function modifierEtapeManuelle(a: {
  id: number; type: TypeEtape; survenuLe: string; heureConnue: boolean;
  texte: string | null; montantCents: number | null; titre: string | null; parLibelle: string;
}): Promise<boolean> {
  const r = await query(
    `UPDATE gestion_monga_etape
        SET type = $2, survenu_le = $3, heure_connue = $4, texte = $5, montant_cents = $6, titre = $7,
            maj_le = now(), maj_par_libelle = $8
      WHERE id = $1 AND source = 'manuelle' AND statut = 'vif'`,
    [a.id, a.type, a.survenuLe, a.heureConnue, a.texte, a.montantCents, a.titre, a.parLibelle]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * 🔴 LE MONTANT D'UN DEVIS, COMPLÉTÉ À LA MAIN — y compris sur une étape Monga.
 *
 * L'audit a mesuré que le montant n'est JAMAIS dans le mail (2 sur 120, et ce sont des phrases humaines). Arno a
 * tranché : le devis automatique porte son numéro et sa date, et l'on complète le montant. C'est donc la seule
 * chose qu'une main pose sur une étape Monga — tout le reste y est en lecture seule.
 */
export async function completerMontant(id: number, montantCents: number | null, parLibelle: string): Promise<boolean> {
  const r = await query(
    `UPDATE gestion_monga_etape SET montant_cents = $2, maj_le = now(), maj_par_libelle = $3
      WHERE id = $1 AND type = 'devis_recu' AND statut = 'vif'`, [id, montantCents, parLibelle]);
  return (r.rowCount ?? 0) > 0;
}

/** RETIRER une étape manuelle. `statut = 'retire'`, jamais un DELETE (Arno). */
export async function retirerEtapeManuelle(id: number, parLibelle: string): Promise<boolean> {
  const r = await query(
    `UPDATE gestion_monga_etape
        SET statut = 'retire', retire_le = now(), retire_par_libelle = $2
      WHERE id = $1 AND source = 'manuelle' AND statut = 'vif'`, [id, parLibelle]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * CONFIRMER OU ÉCARTER une étape « à confirmer » (Arno : deux boutons).
 *
 * ⚠️ UNE ÉTAPE ÉCARTÉE N'EST PAS SUPPRIMÉE : elle passe en `statut = 'retire'` ET `certitude = 'ecartee'`. Les
 * deux, parce qu'ils disent deux choses différentes — elle quitte la frise, et le MOTIF qui l'a produite vient
 * de se tromper. C'est ce second fait qui alimente le décompte du passage en fiable.
 */
export async function trancherEtape(
  id: number, geste: 'confirmer' | 'ecarter', parLibelle: string,
): Promise<boolean> {
  const r = geste === 'confirmer'
    ? await query(
      `UPDATE gestion_monga_etape
          SET certitude = 'confirmee', confirme_le = now(), confirme_par_libelle = $2
        WHERE id = $1 AND certitude = 'a_confirmer'`, [id, parLibelle])
    : await query(
      `UPDATE gestion_monga_etape
          SET certitude = 'ecartee', statut = 'retire', retire_le = now(), retire_par_libelle = $2
        WHERE id = $1 AND certitude = 'a_confirmer'`, [id, parLibelle]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * ══ 🔴🔴 LE DÉCOMPTE QUI FAIT LA PROPOSITION D'ARNO ══════════════════════════════════════════════════════════════
 *
 * « Quand une étape du même type a été confirmée 5 fois sans être écartée, propose-moi (sans l'appliquer) de la
 * passer en automatique fiable. »
 *
 * 🔴 CETTE FONCTION NE CHANGE RIEN. Elle compte, et c'est tout — la décision est un geste d'Arno, et le module
 * pur (`proposerPassageEnFiable`) dit seulement s'il y a lieu de la lui poser.
 */
export async function decompteConfirmations(): Promise<{ type: TypeEtape; confirmees: number; ecartees: number }[]> {
  const { rows } = await query<{ type: TypeEtape; confirmees: string; ecartees: string }>(
    `SELECT type,
            count(*) FILTER (WHERE certitude = 'confirmee') AS confirmees,
            count(*) FILTER (WHERE certitude = 'ecartee')   AS ecartees
       FROM gestion_monga_etape
      WHERE source = 'monga'
      GROUP BY type`);
  return rows.map((r) => ({
    type: r.type, confirmees: Number(r.confirmees), ecartees: Number(r.ecartees),
  }));
}

/**
 * LES ÉVÉNEMENTS D'UN BIEN, pour le bloc du point 4.
 *
 * ⚠️ `UNIQUEMENT SI LE BIEN A AU MOINS UN ÉVÉNEMENT` (Arno) : la liste vide est la réponse, et c'est l'écran qui
 * en déduit qu'il n'affiche rien du tout. Rendre un bloc vide aurait ajouté un titre sur toutes les fiches.
 */
/**
 * ══ 🔴🔴 UN BIEN N'A PAS D'`evenement_id`, ET C'EST LE PIÈGE DE CE MODULE ════════════════════════════════════════
 *
 * `gestion_affectation` relie un FIL à un ÉVÉNEMENT — elle ne porte aucune colonne de bien. Première écriture de
 * cette fonction, j'y ai mis `a.bien_id = $1` : la colonne n'existe pas, et c'est exactement l'erreur d'axe déjà
 * commise au lot MONGA-1 (un `gestion_rattachement` lu sur le mauvais axe avait rendu 0 ligne).
 *
 * 🔴 LE CHEMIN RÉEL EST CELUI DE `biensDeLEvenement`, PRIS À L'ENVERS : un bien est une CLÉ de lot
 * (`cible_cle`, « lot-315 »), reliée à l'événement de deux façons — par les PARTIES déclarées de l'événement, et
 * par les RATTACHEMENTS confirmés de ses mails. Les deux comptent, et il faut les deux : un événement qualifié
 * par ses parties n'a pas forcément de mail rattaché, et l'inverse est vrai aussi.
 *
 * ⚠️ `UNIQUEMENT SI LE BIEN A AU MOINS UN ÉVÉNEMENT` (Arno) : la liste vide EST la réponse, et c'est l'écran qui
 * en déduit qu'il n'affiche aucun bloc. Rendre un bloc vide aurait ajouté un titre sur toutes les fiches — ce que
 * la preuve d'empreintes du point 4 interdit.
 */
export async function evenementsDuBien(cleBien: string): Promise<{
  id: number; reference: string; objet: string; etat: string; ouvertLe: string; traiteLe: string | null;
}[]> {
  const { rows } = await query<{
    id: string; reference: string; objet: string; etat: string; ouvert_le: string; traite_le: string | null;
  }>(
    `WITH par_partie AS (
        SELECT DISTINCT p.evenement_id
          FROM gestion_evenement_partie p
         WHERE p.sorte = 'lot' AND p.retire_le IS NULL AND p.cle = $1
     ), par_mail AS (
        SELECT DISTINCT a.evenement_id
          FROM gestion_rattachement r
          JOIN gestion_message m ON m.id = r.message_id
          JOIN gestion_affectation a
            ON (a.message_id = m.id OR (a.message_id IS NULL AND a.fil_id = m.fil_id))
         WHERE r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
           AND r.cible_cle = $1 AND a.actif
     )
     SELECT e.id, e.reference, e.objet, e.etat, e.ouvert_le::text, e.traite_le::text
       FROM gestion_evenement e
      WHERE e.id IN (SELECT evenement_id FROM par_partie
                     UNION SELECT evenement_id FROM par_mail)
      ORDER BY e.ouvert_le DESC`, [cleBien]);
  return rows.map((r) => ({
    id: Number(r.id), reference: r.reference, objet: r.objet, etat: r.etat,
    ouvertLe: r.ouvert_le, traiteLe: r.traite_le,
  }));
}
