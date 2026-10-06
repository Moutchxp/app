/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 1 — LIRE LE COURRIER MONGA, ET LE GARDER ═════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE FICHIER EST LA SEULE PORTE vers les deux tables de la migration 311. Il ne décide rien : les règles vivent
 * dans `monga.ts` (module pur), les tables gardent ce qu'il a lu, et les écrans lisent ici.
 *
 * ⚠️ TOUTES LES LECTURES RENDENT DU VIDE QUAND LA MIGRATION 311 N'EST PAS APPLIQUÉE, et aucune ne lève. C'est la
 * règle du dépôt (leçon de la migration 251, repayée au lot 4a) : nommer une table absente ferait tomber la file
 * ENTIÈRE, pas seulement l'encart Monga.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

import { query, withTransaction, type RequeteTx } from '../db/client';
import { mongaDisponible } from './schema';
import {
  etapeMonga, lireEnTeteMonga, motDerniereEtape, type EnTeteMonga, type EtapeMonga,
} from './monga';

/**
 * ══ 🔴🔴 QUELS MAILS SONT DES MAILS MONGA — LA MÊME CLAUSE QUE L'AUDIT, MOT POUR MOT ═══════════════════════════
 *
 * Trois branches, et chacune rattrape ce que les deux autres laissent :
 *   ① `de_adresse ILIKE '%monga.io'` — le gabarit actuel, 97 des 156 mails mesurés ;
 *   ② `objet ~* 'MNG-[0-9]{4,6}'` — les TRANSFERTS, qui viennent d'une boîte de la maison et qu'① rate ;
 *   ③ `objet ILIKE '%MONGA%'` — le gabarit B (« Le ticket MONGA 20354 requiert votre attention »), sans tiret.
 *
 * ⚠️ LA BRANCHE ③ RAMÈNE AUSSI DU BRUIT — un mail qui PARLE de Monga sans en être un. C'est voulu : on le lit,
 * `reference` sort à `null`, et il n'entre dans aucune intervention. Le rater aurait coûté beaucoup plus cher.
 */
export const SQL_EST_MAIL_MONGA =
  "(m.de_adresse ILIKE '%monga.io' OR m.objet ~* 'MNG-[0-9]{4,6}' OR m.objet ILIKE '%MONGA%')";

/** Ce qu'une relecture a changé. Sert au script et aux épreuves. */
export interface ReleveMonga {
  mailsLus: number;
  avecReference: number;
  avecLibelle: number;
  avecAdresse: number;
  avecLienMission: number;
  references: number;
}

interface LigneBrute {
  id: string;
  objet: string | null;
  texte: string | null;
}

/**
 * ══ 🔴🔴 LA RELECTURE — on relit les mails, on réécrit la table ══════════════════════════════════════════════════
 *
 * 🔴 C'EST UN `INSERT … ON CONFLICT DO UPDATE`, ET C'EST LE CŒUR DE LA CONCEPTION. `gestion_monga_mail` ne garde
 * que des LECTURES : rien n'y est saisi, rien n'y est décidé. On peut donc la relire en entier à tout moment et
 * retrouver exactement les mêmes lignes — ce qui veut dire qu'une correction de l'extracteur (comme celle du
 * défaut « MNG-20354 ») se rattrape en une commande, sans migration de données et sans rien perdre.
 *
 * ⚠️ ELLE NE TOUCHE JAMAIS `gestion_monga_lien` : les liens sont des décisions d'Arno, pas des lectures. Relire
 * les mails ne peut donc ni poser ni défaire un rattachement — c'est précisément ce qui rend cette commande sans
 * danger.
 *
 * ⚠️ `limite` SERT AUX ÉPREUVES ET À LA MISE AU POINT, pas à la production : sans elle, on relit tout, parce
 * qu'une relecture partielle laisserait la moitié de la table à l'ancienne version de l'extracteur.
 */
export async function relireLesMailsMonga(limite?: number): Promise<ReleveMonga> {
  if (!await mongaDisponible()) {
    return {
      mailsLus: 0, avecReference: 0, avecLibelle: 0, avecAdresse: 0, avecLienMission: 0, references: 0,
    };
  }
  const { rows } = await query<LigneBrute>(
    `SELECT m.id::text AS id, m.objet, m.corps_texte AS texte
       FROM gestion_message m
      WHERE ${SQL_EST_MAIL_MONGA}
      ORDER BY m.recu_le ASC
      ${limite === undefined ? '' : `LIMIT ${Number(limite)}`}`);
  const lectures = rows.map((r) => ({ id: r.id, ...lireUnMail(r.objet, r.texte) }));
  await withTransaction(async (q) => {
    for (const l of lectures) await ecrireLaLecture(q, l);
  });
  const refs = new Set(lectures.map((l) => l.reference).filter((r): r is string => r !== null));
  return {
    mailsLus: lectures.length,
    avecReference: lectures.filter((l) => l.reference !== null).length,
    avecLibelle: lectures.filter((l) => l.libelle !== null).length,
    avecAdresse: lectures.filter((l) => l.adresse !== null).length,
    avecLienMission: lectures.filter((l) => l.lienMission !== null).length,
    references: refs.size,
  };
}

/** Ce qu'un mail dit, lu par le module pur. Une seule porte de lecture, pour la passe comme pour un mail seul. */
export function lireUnMail(objet: string | null, texte: string | null): EnTeteMonga & { etape: EtapeMonga } {
  return { ...lireEnTeteMonga(objet, texte), etape: etapeMonga(objet, texte) };
}

async function ecrireLaLecture(
  q: RequeteTx, l: { id: string } & EnTeteMonga & { etape: EtapeMonga },
): Promise<void> {
  await q(
    `INSERT INTO gestion_monga_mail (message_id, reference, libelle, adresse, lien_mission, etape)
          VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (message_id) DO UPDATE
            SET reference = excluded.reference, libelle = excluded.libelle, adresse = excluded.adresse,
                lien_mission = excluded.lien_mission, etape = excluded.etape, lu_le = now()`,
    [l.id, l.reference, l.libelle, l.adresse, l.lienMission, l.etape]);
}

/**
 * Relit UN mail et garde sa lecture. Sert à la relève : un mail Monga qui arrive est lu tout de suite.
 *
 * ⚠️ ELLE REND LA LECTURE MÊME SANS LA MIGRATION, en ne gardant rien. L'appelant peut donc toujours savoir ce
 * que le mail dit — ce qui compte pour l'affichage — sans que l'absence de table ne fasse échouer la relève.
 */
export async function lireEtGarderUnMail(
  messageId: string, objet: string | null, texte: string | null,
): Promise<EnTeteMonga & { etape: EtapeMonga }> {
  const lecture = lireUnMail(objet, texte);
  if (await mongaDisponible()) {
    await withTransaction((q) => ecrireLaLecture(q, { id: messageId, ...lecture }));
  }
  return lecture;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES LECTURES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ce que l'écran sait d'un mail Monga. `null` = ce mail n'est pas un mail Monga (ou la 311 n'est pas là). */
export interface MongaDuMail {
  reference: string | null;
  libelle: string | null;
  adresse: string | null;
  lienMission: string | null;
  etape: EtapeMonga;
  /** L'événement de la référence, quand Arno l'a déjà reliée. `null` = référence à relier. */
  evenementId: string | null;
}

export async function mongaDuMail(messageId: string): Promise<MongaDuMail | null> {
  if (!await mongaDisponible()) return null;
  const { rows } = await query<{
    reference: string | null; libelle: string | null; adresse: string | null;
    lien_mission: string | null; etape: EtapeMonga; evenement_id: string | null;
  }>(
    `SELECT mm.reference, mm.libelle, mm.adresse, mm.lien_mission, mm.etape, ml.evenement_id::text AS evenement_id
       FROM gestion_monga_mail mm
       LEFT JOIN gestion_monga_lien ml
              ON ml.reference = mm.reference AND ml.retire_le IS NULL
      WHERE mm.message_id = $1`, [messageId]);
  const r = rows[0];
  if (r === undefined) return null;
  return {
    reference: r.reference,
    libelle: r.libelle,
    adresse: r.adresse,
    lienMission: r.lien_mission,
    etape: r.etape,
    evenementId: r.evenement_id,
  };
}

/**
 * ══ 🔴🔴 UNE INTERVENTION MONGA, VUE DE L'EXTÉRIEUR ══════════════════════════════════════════════════════════════
 *
 * 🔴 LE LIBELLÉ, L'ADRESSE ET LE LIEN SONT CEUX DU MAIL LE PLUS RÉCENT QUI EN PORTE UN — pas ceux du premier, et
 * pas ceux du dernier mail tout court. Mesuré : les rappels de devis et les relances de facture n'ont ni adresse
 * ni lien dans leur corps ; prendre le dernier mail aurait vidé l'encart des interventions les plus actives,
 * c'est-à-dire exactement celles qu'on veut relier.
 *
 * 🔴 LA DERNIÈRE ÉTAPE, ELLE, EST CELLE DU DERNIER MAIL TOUT COURT — c'est le sens du mot « dernière étape » :
 * où en est l'intervention aujourd'hui. Un rappel de devis EST une étape, même sans adresse.
 */
export interface InterventionMonga {
  reference: string;
  libelle: string | null;
  adresse: string | null;
  lienMission: string | null;
  nbMails: number;
  derniereEtape: EtapeMonga;
  derniereEtapeLe: string;
  /** Le mot tout fait : « Devis en attente de validation · 05/10 ». */
  derniereEtapeMot: string;
  /** `null` tant qu'Arno n'a pas cliqué. 19 références sur 40 sont dans ce cas (audit du 06/10). */
  evenementId: string | null;
  /** Le « quoi » de l'événement — `gestion_evenement.objet`, le champ que la RÈGLE DU NOM d'Arno harmonise. */
  evenementNom: string | null;
}

/**
 * Les interventions Monga. `reliees` filtre : `false` = celles qui restent à relier (points 4 et 5), `true` =
 * celles qui ont leur événement, `undefined` = toutes.
 *
 * ⚠️ LES MAILS SANS RÉFÉRENCE N'EN SONT PAS : ils sont lus, gardés, et ils ne forment aucune intervention. On ne
 * peut rien relier à une référence qu'on n'a pas.
 */
export async function interventionsMonga(options?: { reliees?: boolean }): Promise<InterventionMonga[]> {
  if (!await mongaDisponible()) return [];
  const filtre = options?.reliees === true ? 'AND ml.id IS NOT NULL'
    : options?.reliees === false ? 'AND ml.id IS NULL' : '';
  const { rows } = await query<{
    reference: string; libelle: string | null; adresse: string | null; lien_mission: string | null;
    nb_mails: number; derniere_etape: EtapeMonga; derniere_etape_le: string;
    evenement_id: string | null; evenement_nom: string | null;
  }>(
    /**
     * 🔴 `DISTINCT ON` TROIS FOIS, SUR TROIS TRIS DIFFÉRENTS, et c'est la traduction exacte de la règle ci-dessus :
     * le libellé le plus récent qui existe, l'adresse la plus récente qui existe, le lien le plus récent qui
     * existe — puis l'étape du dernier mail, sans condition. Un seul `DISTINCT ON` aurait imposé un tri unique,
     * donc une seule de ces quatre réponses.
     */
    `WITH mails AS (
        SELECT mm.reference, mm.libelle, mm.adresse, mm.lien_mission, mm.etape, m.recu_le
          FROM gestion_monga_mail mm
          JOIN gestion_message m ON m.id = mm.message_id
         WHERE mm.reference IS NOT NULL
     ), dernier_libelle AS (
        SELECT DISTINCT ON (reference) reference, libelle FROM mails
         WHERE libelle IS NOT NULL ORDER BY reference, recu_le DESC
     ), derniere_adresse AS (
        SELECT DISTINCT ON (reference) reference, adresse FROM mails
         WHERE adresse IS NOT NULL ORDER BY reference, recu_le DESC
     ), dernier_lien AS (
        SELECT DISTINCT ON (reference) reference, lien_mission FROM mails
         WHERE lien_mission IS NOT NULL ORDER BY reference, recu_le DESC
     ), derniere_etape AS (
        SELECT DISTINCT ON (reference) reference, etape, recu_le FROM mails
         ORDER BY reference, recu_le DESC
     ), compte AS (
        SELECT reference, count(*)::int AS nb_mails FROM mails GROUP BY reference
     )
     SELECT c.reference, dl.libelle, da.adresse, dli.lien_mission, c.nb_mails,
            de.etape AS derniere_etape, de.recu_le::text AS derniere_etape_le,
            ml.evenement_id::text AS evenement_id, e.objet AS evenement_nom
       FROM compte c
       JOIN derniere_etape de ON de.reference = c.reference
       LEFT JOIN dernier_libelle dl ON dl.reference = c.reference
       LEFT JOIN derniere_adresse da ON da.reference = c.reference
       LEFT JOIN dernier_lien dli ON dli.reference = c.reference
       LEFT JOIN gestion_monga_lien ml ON ml.reference = c.reference AND ml.retire_le IS NULL
       LEFT JOIN gestion_evenement e ON e.id = ml.evenement_id
      WHERE true ${filtre}
      ORDER BY de.recu_le DESC`);
  return rows.map((r) => ({
    reference: r.reference,
    libelle: r.libelle,
    adresse: r.adresse,
    lienMission: r.lien_mission,
    nbMails: r.nb_mails,
    derniereEtape: r.derniere_etape,
    derniereEtapeLe: r.derniere_etape_le,
    derniereEtapeMot: motDerniereEtape(r.derniere_etape, r.derniere_etape_le) ?? '',
    evenementId: r.evenement_id,
    evenementNom: r.evenement_nom,
  }));
}

/** Les mails d'une référence, du plus ancien au plus récent. Sert au classement « tous les mails suivent ». */
export async function mailsDeLaReference(reference: string): Promise<string[]> {
  if (!await mongaDisponible()) return [];
  const { rows } = await query<{ id: string }>(
    `SELECT mm.message_id::text AS id
       FROM gestion_monga_mail mm
       JOIN gestion_message m ON m.id = mm.message_id
      WHERE mm.reference = $1
      ORDER BY m.recu_le ASC`, [reference]);
  return rows.map((r) => r.id);
}
