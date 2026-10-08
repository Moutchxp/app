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

import { query, withTransaction } from '../db/client';
import {
  etapesDuMailMonga, ouvertureDeRepli, rangsDesDevis,
  type Certitude, type TypeEtape,
} from './mongaEtape';
/* 🔴 LOT URGENCE-EVENEMENT — la sonde de la migration 268 (`categorie` / `urgence`), celle de tout le module. */
import { evenementQualifieDisponible } from './schema';
/* 🔴🔴 LOT ETAT-PAR-LA-FRISE — « ouvert ? » se deduit des cartes de borne de la frise, jamais de la colonne. */
import { sqlClosLeParLaFrise, sqlEvenementOuvertParLaFrise } from './etatParLaFrise';

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
    cree_le: string | null; titre: string | null; rang_pose: string | null;
  }>(
    `SELECT e.id, e.reference, e.type, e.survenu_le::text, e.heure_connue, e.heure_fin,
            e.numero, e.rang, e.montant_cents, e.texte, e.auteur, e.source, e.certitude, e.statut,
            e.message_id, e.message_cle, m.fil_id, e.piece_nom, e.cree_par_libelle,
            -- LOT FRISE-HORODATAGE-SECONDE-ET-PICTOS, POINT 1 : l'heure de creation s'affiche a la SECONDE, et
            -- Arno nomme le fuseau : Europe/Paris. Elle valait e.cree_le::text, qui rend l'horodatage dans le
            -- fuseau de la SESSION -- Europe/Paris sur ce poste (verifie : SHOW TimeZone), mais UTC sur un
            -- serveur ordinaire, ce qui aurait decale de deux heures l'heure lue par l'internaute l'ete.
            -- Le fuseau est donc EXPRIME ICI, la ou la donnee est lue, et jamais recalcule dans le navigateur.
            -- AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit.
            to_char(e.cree_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD HH24:MI:SS') AS cree_le,
            e.titre, e.rang_pose::text
       FROM gestion_monga_etape e
       LEFT JOIN gestion_message m ON m.id = e.message_id
      WHERE e.statut = 'vif'
        AND (e.evenement_id = $1
             OR e.reference IN (SELECT reference FROM gestion_monga_lien
                                 WHERE evenement_id = $1 AND retire_le IS NULL))
      -- 🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — L'ORDRE DE POSE. La date ne departage plus que les cartes d'avant
      -- la migration 321, que celle-ci remplit toutes. Ce tri n'est qu'un PRE-TRI de confort : c'est le module
      -- pur (parOrdreDePose) qui fait foi, et l'ecran ne depend pas de l'ordre du SELECT.
      -- AUCUN ACCENT GRAVE ICI : ce commentaire vit DANS un litteral gabarit.
      ORDER BY e.rang_pose NULLS LAST, e.survenu_le, e.id`, [evenementId]);

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
    /* ⚠️ `numeric` RENDU EN CHAÎNE PAR `pg` : le convertir ici, sinon le comparateur trierait « 10 » avant
       « 9 ». Même piège que le montant juste au-dessus, et que les identifiants `bigint` du dépôt. */
    rangPose: r.rang_pose === null ? null : Number(r.rang_pose),
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
  /**
   * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — LA CARTE NEUVE SE POSE AU BOUT À DROITE ════════════════════════
   *
   * ARNO, POINT 1 : « Une carte ajoutée se place TOUJOURS au bout à droite de la frise (juste avant le carré
   * “+”). » Son rang est donc le plus grand de l'événement, plus un.
   *
   * 🔴 LE CALCUL EST DANS LA MÊME REQUÊTE QUE L'INSERTION, et c'est ce qui le rend sûr : lire le maximum puis
   * insérer en deux temps laisserait deux ajouts simultanés prendre le même rang. Ici, PostgreSQL évalue le
   * sous-`SELECT` au moment de l'écriture.
   *
   * ⚠️ `coalesce(max, 0) + 1` : la première carte d'un événement prend 1. Et le maximum se cherche sur TOUTES
   * les cartes de l'événement, retirées comprises — une carte rétablie à la main ne doit pas se retrouver avec
   * le rang d'une autre.
   */
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_monga_etape
       (evenement_id, type, survenu_le, heure_connue, texte, montant_cents, piece_nom, titre,
        source, certitude, cree_par, cree_par_libelle, rang_pose)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manuelle','fiable',$9,$10,
             (SELECT coalesce(max(x.rang_pose), 0) + 1 FROM gestion_monga_etape x
               WHERE x.evenement_id = $1))
     RETURNING id`,
    [a.evenementId, a.type, a.survenuLe, a.heureConnue, a.texte, a.montantCents, a.pieceNom, a.titre,
      a.parId, a.parLibelle]);
  return Number(rows[0].id);
}

/**
 * ══ 🔴🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER — ENREGISTRER UN NOUVEL ORDRE (Arno, point 8) ═══════════════════════════
 *
 * « Une carte posée peut être saisie par clic maintenu et glissée à une autre place dans la frise ; au
 * relâchement, sa nouvelle place est enregistrée. »
 *
 * 🔴 ON REÇOIT L'ORDRE COMPLET, ET NON « telle carte après telle autre ». Un ordre complet est IDEMPOTENT : le
 * rejouer deux fois donne le même résultat, et il n'y a pas d'état intermédiaire où deux cartes se disputent une
 * place. C'est aussi ce qui permet au serveur de VÉRIFIER l'ensemble reçu d'un coup.
 *
 * 🔴 ET IL EST REFUSÉ EN BLOC SI L'ENSEMBLE NE CORRESPOND PAS, à la carte près : ni une carte en plus (venue
 * d'un autre événement), ni une en moins (un écran resté ouvert pendant qu'une carte était retirée ailleurs).
 * Renuméroter sur un ensemble incomplet aurait écrasé l'ordre des absentes.
 *
 * ⚠️ LES GARDES MÉTIER — bornes immobiles, rien avant l'Ouverture — sont posées par la ROUTE, qui connaît les
 * types et le module pur. Ici on tient l'intégrité de l'ensemble, et c'est une garde de dépôt.
 *
 * ⚠️ UNE SEULE TRANSACTION : une renumérotation à moitié écrite laisserait deux cartes au même rang.
 */
export async function reordonnerCartes(
  evenementId: number, ordre: readonly number[], parLibelle: string,
): Promise<{ ok: true } | { ok: false; motif: string }> {
  return withTransaction(async (q) => {
    /* ⚠️ ON LIT AVANT D'ÉCRIRE, ET SOUS VERROU : `withTransaction` commite au retour (db/client.ts), donc un
       refus rendu après une écriture serait un refus qui a écrit. Piège consigné dans `gestes.ts`. */
    const { rows } = await q<{ id: string }>(
      `SELECT id::text FROM gestion_monga_etape
        WHERE evenement_id = $1 AND statut = 'vif' ORDER BY id FOR UPDATE`, [evenementId]);
    const vives = new Set(rows.map((r) => Number(r.id)));
    const recu = new Set(ordre);
    if (recu.size !== ordre.length) return { ok: false, motif: 'Deux fois la même carte dans l’ordre reçu.' };
    if (recu.size !== vives.size || [...recu].some((id) => !vives.has(id))) {
      return { ok: false, motif: 'La frise a changé entre-temps : rechargez-la avant de déplacer une carte.' };
    }
    await q(
      `UPDATE gestion_monga_etape e
          SET rang_pose = o.n, maj_le = now(), maj_par_libelle = $3
         FROM unnest($2::bigint[]) WITH ORDINALITY AS o(id, n)
        WHERE e.id = o.id AND e.evenement_id = $1`,
      [evenementId, ordre, parLibelle]);
    return { ok: true };
  });
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
 * LA DATE ENREGISTRÉE D'UNE ÉTAPE, telle quelle. LECTURE SEULE.
 *
 * 🔴 LOT FRISE-ORDRE-POSE-ET-GLISSER, POINT 5 — elle sert au crayon : la date d'une carte de BORNE n'est plus
 * modifiable, et la route la relit pour la réécrire À L'IDENTIQUE plutôt que de refuser la modification entière
 * (le texte, lui, reste modifiable). `null` = étape inconnue ou retirée.
 *
 * ⚠️ `::text` ET NON UN `Date` : la chaîne repart telle quelle vers l'UPDATE, sans aller-retour de fuseau.
 */
export async function dateDeLEtape(id: number): Promise<string | null> {
  const { rows } = await query<{ survenu_le: string }>(
    `SELECT survenu_le::text FROM gestion_monga_etape WHERE id = $1 AND statut = 'vif'`, [id]);
  return rows[0]?.survenu_le ?? null;
}

/**
 * ══ 🔴🔴 LOT ETAT-PAR-LA-FRISE — CE QU'UNE ÉTAPE PÈSE SUR L'ÉTAT, AVANT D'Y TOUCHER ══════════════════════════════
 *
 * ARNO, POINT 2 : « Supprimer la carte Clôture d'un événement clos le ROUVRE, sans carte Réouverture.
 * Confirmation avant suppression : “Supprimer cette clôture rouvrira l'événement.” »
 *
 * 🔴 L'ÉCRAN A BESOIN DE SAVOIR À QUOI IL TOUCHE **AVANT** DE DEMANDER. Il ne peut pas le déduire du seul type :
 * retirer une Clôture ne rouvre que si c'est elle qui ferme — une Clôture suivie d'une Réouverture ne ferme
 * rien, et promettre une réouverture là serait une phrase fausse. On rend donc l'événement et son état ACTUEL,
 * et la route tranche avec la même règle que partout.
 *
 * ⚠️ `evenementId` PEUT ÊTRE `null` : une étape Monga rattachée par RÉFÉRENCE n'en porte pas. Elle n'est de
 * toute façon pas retirable à la main (la garde `source = 'manuelle'` du dépôt la refuse), mais la lecture, elle,
 * doit pouvoir répondre sans inventer un identifiant.
 */
export async function etapePourRetrait(
  id: number,
): Promise<{ type: TypeEtape; source: 'monga' | 'manuelle'; evenementId: number | null } | null> {
  const { rows } = await query<{ type: TypeEtape; source: 'monga' | 'manuelle'; evenement_id: string | null }>(
    `SELECT type, source, evenement_id::text FROM gestion_monga_etape WHERE id = $1 AND statut = 'vif'`, [id]);
  if (!rows[0]) return null;
  return {
    type: rows[0].type, source: rows[0].source,
    evenementId: rows[0].evenement_id === null ? null : Number(rows[0].evenement_id),
  };
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
/**
 * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 1 — LES BIENS D'UN ÉVÉNEMENT, NOMMÉS ══════════════════════════════════════
 *
 * Arno : « un GROS bouton pleine largeur “Ouvrir la fiche du bien sur cet événement →” […] Si l'événement
 * concerne plusieurs biens : petit choix du bien d'abord. »
 *
 * 🔴 C'EST `evenementsDuBien` PRIS À L'ENVERS, et les deux axes sont les mêmes — à dessein : un bien est une CLÉ
 * de lot reliée à l'événement de deux façons, par les PARTIES déclarées et par les RATTACHEMENTS confirmés de ses
 * mails. Les deux comptent. Si la liste rendue ici différait de celle qui fait apparaître l'événement dans la
 * fiche, le bouton mènerait à une fiche où l'événement n'est pas.
 *
 * ⚠️ IL REND AUSSI L'ADRESSE, et pas seulement la clé : quand il y a plusieurs biens, Arno demande un choix — et
 * « 315 ou 457 ? » n'est pas une question à laquelle on peut répondre. Avec la rue et la commune, si.
 *
 * ⚠️ UN BIEN DONT LA CLÉ N'EST PAS UN NOMBRE EST RENDU QUAND MÊME : c'est l'écran qui décide s'il sait l'adresser
 * (`fiche=bien-<clé>` attend un nombre). Le taire ici ferait disparaître un bien de la liste sans rien dire.
 */
export async function biensNommesDeLEvenement(evenementId: number): Promise<{
  cle: string; adresse: string | null; commune: string | null;
}[]> {
  const { rows } = await query<{ cle: string; adresse: string | null; commune: string | null }>(
    `WITH par_partie AS (
        SELECT DISTINCT p.cle
          FROM gestion_evenement_partie p
         WHERE p.evenement_id = $1 AND p.sorte = 'lot' AND p.retire_le IS NULL
           AND btrim(coalesce(p.cle, '')) <> ''
     ), mails AS (
        SELECT m.id
          FROM gestion_affectation a
          JOIN gestion_message m
            ON (a.message_id IS NOT NULL AND m.id = a.message_id)
            OR (a.message_id IS NULL AND m.fil_id = a.fil_id
                AND NOT EXISTS (SELECT 1 FROM gestion_affectation a2
                                 WHERE a2.message_id = m.id AND a2.actif))
         WHERE a.evenement_id = $1 AND a.actif
     ), par_mail AS (
        SELECT DISTINCT r.cible_cle AS cle
          FROM gestion_rattachement r
          JOIN mails ON mails.id = r.message_id
         WHERE r.cible_sorte = 'lot' AND r.statut = 'confirme' AND r.piece_id IS NULL
           AND btrim(coalesce(r.cible_cle, '')) <> ''
     ), toutes AS (
        SELECT cle FROM par_partie UNION SELECT cle FROM par_mail
     )
     SELECT t.cle, l.adresse, l.commune
       FROM toutes t
       LEFT JOIN gestion_annuaire_lot l ON l.wippimmo_id = t.cle
      ORDER BY t.cle`, [evenementId]);
  return rows;
}

export async function evenementsDuBien(cleBien: string): Promise<{
  id: number; reference: string; objet: string; etat: string; ouvertLe: string; traiteLe: string | null;
  /**
   * 🔴🔴 LOT ETAT-PAR-LA-FRISE — « ouvert ? » se DÉDUIT des cartes de borne, plus de `etat` ni de `traite_le`.
   * Les deux colonnes restent rendues (l'écran affiche l'avancement et la vieille date), mais c'est CE champ
   * qui décide de ce qui se replie dans le bloc « Événements » de la fiche du bien.
   */
  ouvert: boolean;
  /**
   * 🔴🔴 LOT ETAT-PAR-LA-FRISE — LA DATE DE LA DERNIÈRE CARTE CLÔTURE, ou `null` si l'événement est ouvert.
   *
   * ⚠️ À NE PAS CONFONDRE AVEC `traiteLe`, qui reste rendue : celle-là portait l'instant du CLIC de fermeture,
   * et elle survit à une carte retirée — c'est elle qui faisait écrire « clos le 08/10/2026 » sur un dossier
   * qu'Arno venait de rouvrir en supprimant sa carte.
   */
  closLe: string | null;
  mongaRefs: string[];
  /**
   * 🔴 LOT URGENCE-EVENEMENT, POINT 3b — le niveau d'urgence, pour que le sélecteur de la fiche du bien montre
   * lequel est enregistré. `null` sans la migration 268 (la colonne n'existe pas) comme pour un événement sans
   * niveau : les deux se lisent pareil à l'écran, et c'est juste dans les deux cas.
   */
  urgence: string | null;
}[]> {
  /* 🔴 LOT URGENCE-EVENEMENT — `urgence` n'est NOMMÉE que si la migration 268 est là. Sans elle, la colonne
     n'existe pas et la nommer ferait échouer TOUTE la lecture du bloc « Événements », pas seulement son niveau.
     Même témoin que `categorie` partout ailleurs dans le module : c'est la même migration. */
  const avecUrgence = await evenementQualifieDisponible();
  const { rows } = await query<{
    id: string; reference: string; objet: string; etat: string; ouvert: boolean;
    ouvert_le: string; traite_le: string | null; clos_le: string | null;
    monga_refs: string[] | null; urgence: string | null;
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
     SELECT e.id, e.reference, e.objet, e.etat, ${sqlEvenementOuvertParLaFrise('e')} AS ouvert,
            e.ouvert_le::text, e.traite_le::text, ${sqlClosLeParLaFrise('e')}::text AS clos_le,
            /* 🔴 LOT EVENEMENT-MINIMALISTE, POINT 1 — « si l'événement est suivi par Monga (au moins une
               référence MNG reliée) : une vignette MONGA […] avec la référence au survol » (Arno). On rend
               les références reliées, dans l'ordre, et l'écran décide quoi en montrer. */
            (SELECT array_agg(l.reference ORDER BY l.reference)
               FROM (SELECT DISTINCT reference FROM gestion_monga_lien
                      WHERE evenement_id = e.id AND retire_le IS NULL) l) AS monga_refs,
            ${avecUrgence ? 'e.urgence' : 'NULL::text AS urgence'}
       FROM gestion_evenement e
      WHERE e.id IN (SELECT evenement_id FROM par_partie
                     UNION SELECT evenement_id FROM par_mail)
      ORDER BY e.ouvert_le DESC`, [cleBien]);
  return rows.map((r) => ({
    id: Number(r.id), reference: r.reference, objet: r.objet, etat: r.etat, ouvert: r.ouvert,
    ouvertLe: r.ouvert_le, traiteLe: r.traite_le, closLe: r.clos_le,
    /* ⚠️ `null` DE POSTGRES ⇒ TABLEAU VIDE : l'écran ne doit pas avoir à distinguer « aucune référence » de
       « colonne absente ». Un événement sans Monga est le cas ordinaire, et de très loin. */
    mongaRefs: r.monga_refs ?? [],
    urgence: r.urgence,
  }));
}

