/**
 * ══ 🔴🔴 LOT MONGA-LIEN-PAR-LE-GESTE (26/10/2026) — LE PREMIER GESTE HUMAIN SUR UN MAIL MONGA RELIE SA RÉFÉRENCE ══════
 *
 * DEMANDE D'ARNO : « le lien reste déclenché par un HUMAIN, jamais par la relève. Mais ce geste humain n'est PAS un
 * bouton “Relier” séparé : c'est (a) rattacher ce mail (ou l'échange qui le contient) à un événement OUVERT, ou (b)
 * créer un événement depuis ce mail. Dès ce geste, si la référence n'a AUCUN lien actif : créer le lien. »
 *
 * CONSTAT QUI L'A FAIT NAÎTRE (prod, 26/10/2026) : GES-2026-000011 rattaché à la main depuis la file le 23/10, sans
 * lien ; les étapes de MNG-25126 (une ouverture, cinq commentaires) étaient enregistrées mais la frise ne les voyait
 * pas, parce qu'elle ne lit les étapes Monga qu'au travers de `gestion_monga_lien` (`friseDeLEvenement`).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE MODULE ÉCRIT DANS LA TRANSACTION DE L'APPELANT (`gestes.ts`), et n'en ouvre aucune : le lien naît avec le
 * rattachement, ou pas du tout. Il n'ouvre aucune connexion — il reçoit la fonction de requête de la transaction.
 *
 * 🔴 DEUX TEMPS, POUR TENIR « LIRE → REFUSER → ÉCRIRE » : `preparerLiensMonga` LIT et verrouille (`FOR UPDATE`)
 * avant toute écriture du geste ; `poserLiensMonga` n'écrit qu'ensuite. Aucun des deux ne refuse jamais le geste :
 * un lien impossible est un lien qu'on ne pose pas, le rattachement passe quand même.
 *
 * 🔴 AUCUNE CONDITION D'ADRESSE : c'est l'humain qui a choisi l'événement. (Le bouton « Relier à cet événement » de
 * l'encart, qui ne propose que les événements des lots trouvés par l'adresse Monga, reste en place, inchangé.)
 *
 * ⚠️ AUCUN RENOMMAGE. `relierLaReference` fait prendre à l'événement le libellé Monga, mais en l'ANNONÇANT avant le
 * clic (« Le nom deviendra … »). Ici, rien n'a été annoncé : changer un nom sans l'avoir dit serait la seule chose
 * que la règle d'Arno interdit sur ce geste. `nom_avant` reste donc nul, et « Délier » n'a aucun nom à remettre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/* Import de TYPE seulement : effacé à la compilation, il ne fait pas entrer `pg` dans ce module. */
import type { RequeteTx as Requete } from '../db/client';

/** Qui agit (même forme que `Auteur` de `gestes.ts`, décrite ici pour éviter un cycle d'imports). */
export interface AuteurLien { id: number | null; libelle: string }

/** Le format qu'accepte la base (`gestion_monga_lien_reference_chk`). Une référence hors format n'est jamais reliée. */
export const FORMAT_REFERENCE_MONGA = '^MNG-[0-9]{4,6}$';

/** Les motifs écrits au journal, mot pour mot ceux d'Arno. */
export const MOTIF_LIEN_RATTACHEMENT = 'relié par le rattachement du mail';
export const MOTIF_LIEN_OUVERTURE = 'relié par l’ouverture de l’événement';
export function motifLienRattrapage(jour: string): string {
  return `rattrapage du ${jour}`;
}

/** L'action inscrite au journal (`gestion_journal.action`) pour un lien posé par un geste ou par le rattrapage. */
export const ACTION_JOURNAL_LIEN = 'lien_monga';

/**
 * UN HUMAIN, TOUJOURS — la même règle que la contrainte `gestion_monga_lien_humain_chk`, dite AVANT d'écrire. Une
 * violation de contrainte dans la transaction ferait échouer le rattachement entier ; on ne la laisse pas arriver.
 * PUR.
 */
export function auteurHumain(libelle: string | null | undefined): boolean {
  const l = (libelle ?? '').trim();
  return l !== '' && l.toLowerCase() !== 'automatique';
}

/** Le lien vivant d'une référence, tel qu'il est lu (verrouillé) avant le geste. */
export interface LienExistant { evenementId: number; evenementReference: string }

/** Ce qu'on fera de chaque référence. PUR. */
export type DecisionLien = 'creer' | 'deja' | 'ailleurs';

/**
 * ══ LES CAS LIMITES TRANCHÉS PAR ARNO ═══════════════════════════════════════════════════════════════════════════════
 *   · aucune référence vivante            → on crée le lien ;
 *   · déjà reliée au MÊME événement       → rien ;
 *   · déjà reliée à un AUTRE événement    → on ne déplace pas le lien (le mail est rattaché quand même, et la frise
 *                                            de l'événement cible le dit : « MNG-… est suivie dans GES-… »).
 * PUR.
 */
export function decisionDuLien(existant: LienExistant | null, evenementId: number): DecisionLien {
  if (existant === null) return 'creer';
  return existant.evenementId === evenementId ? 'deja' : 'ailleurs';
}

/** Une ligne du plan, puis du résultat. */
export interface LienParGeste {
  reference: string;
  issue: 'cree' | 'deja' | 'ailleurs';
  /** Pour `ailleurs` : l'événement qui suit déjà la référence. */
  evenementReference: string | null;
}

/** Le plan préparé avant l'écriture du geste. */
export interface PlanLiensMonga {
  lignes: { reference: string; decision: DecisionLien; existant: LienExistant | null }[];
}

export const PLAN_VIDE: PlanLiensMonga = { lignes: [] };

/**
 * LES RÉFÉRENCES MONGA D'UN ÉCHANGE, telles qu'un rattachement de l'échange les emporte.
 *
 * ⚠️ UN MAIL DÉPLACÉ VERS UNE AUTRE CARTE N'EN FAIT PAS PARTIE : son affectation propre prime sur celle de son
 * échange (règle du lot 4d-B2). Rattacher l'échange ne le fait pas venir ici, il ne doit donc pas y relier sa
 * référence.
 */
export async function referencesMongaDuFil(q: Requete, filId: number, evenementId: number): Promise<string[]> {
  const { rows } = await q<{ reference: string }>(
    `SELECT DISTINCT mm.reference
       FROM gestion_monga_mail mm
       JOIN gestion_message m ON m.id = mm.message_id
      WHERE m.fil_id = $1 AND mm.reference ~ $3
        AND NOT EXISTS (SELECT 1 FROM gestion_affectation a
                         WHERE a.message_id = m.id AND a.actif AND a.evenement_id <> $2)
      ORDER BY 1`, [filId, evenementId, FORMAT_REFERENCE_MONGA]);
  return rows.map((r) => r.reference);
}

/** LA RÉFÉRENCE MONGA D'UN MAIL (zéro ou une : `gestion_monga_mail` en porte une par mail). */
export async function referencesMongaDuMail(q: Requete, messageId: number): Promise<string[]> {
  const { rows } = await q<{ reference: string }>(
    `SELECT DISTINCT mm.reference FROM gestion_monga_mail mm
      WHERE mm.message_id = $1 AND mm.reference ~ $2
      ORDER BY 1`, [messageId, FORMAT_REFERENCE_MONGA]);
  return rows.map((r) => r.reference);
}

/** Lit (verrouillé) le lien vivant d'une référence. */
async function lienVivant(q: Requete, reference: string): Promise<LienExistant | null> {
  const { rows } = await q<{ evenement_id: number; reference_evenement: string }>(
    `SELECT l.evenement_id::int AS evenement_id, e.reference AS reference_evenement
       FROM gestion_monga_lien l
       JOIN gestion_evenement e ON e.id = l.evenement_id
      WHERE l.reference = $1 AND l.retire_le IS NULL
      FOR UPDATE OF l`, [reference]);
  return rows[0] === undefined ? null
    : { evenementId: rows[0].evenement_id, evenementReference: rows[0].reference_evenement };
}

/**
 * ① LIRE. Verrouille le lien vivant de chaque référence et décide. Dans l'ordre alphabétique : deux gestes
 * simultanés sur deux échanges portant les mêmes références verrouillent dans le même ordre, et ne s'attendent
 * jamais l'un l'autre en croix.
 */
export async function preparerLiensMonga(
  q: Requete, references: readonly string[], evenementId: number, auteur: AuteurLien,
): Promise<PlanLiensMonga> {
  if (!auteurHumain(auteur.libelle)) return PLAN_VIDE;
  const refs = [...new Set(references)].sort();
  const lignes: PlanLiensMonga['lignes'] = [];
  for (const reference of refs) {
    const existant = await lienVivant(q, reference);
    lignes.push({ reference, decision: decisionDuLien(existant, evenementId), existant });
  }
  return { lignes };
}

/**
 * ② ÉCRIRE. Pose les liens décidés, et journalise chacun.
 *
 * 🔴 `ON CONFLICT … DO NOTHING` SUR L'INDEX UNIQUE PARTIEL : le `FOR UPDATE` ne verrouille pas une ligne qui
 * n'existe pas encore. Si un autre geste a posé le lien entre la lecture et l'écriture, la base le dit sans lever
 * — une erreur ici annulerait le rattachement entier — et on relit qui le tient.
 *
 * 🔴 CE QUE L'HUMAIN AVAIT SOUS LES YEUX EST FIGÉ SUR LE LIEN (libellé, adresse, lien Mission), comme pour le clic
 * « Relier » : la lecture Monga la plus récente de la référence.
 */
export async function poserLiensMonga(
  q: Requete, plan: PlanLiensMonga,
  o: { evenementId: number; evenementReference: string; auteur: AuteurLien; motif: string },
): Promise<LienParGeste[]> {
  const out: LienParGeste[] = [];
  for (const l of plan.lignes) {
    if (l.decision === 'deja') { out.push({ reference: l.reference, issue: 'deja', evenementReference: null }); continue; }
    if (l.decision === 'ailleurs') {
      out.push({ reference: l.reference, issue: 'ailleurs', evenementReference: l.existant?.evenementReference ?? null });
      continue;
    }
    const { rows } = await q<{ id: number }>(
      `INSERT INTO gestion_monga_lien
         (reference, evenement_id, libelle_lu, adresse_lue, lien_mission_lu, relie_par, relie_par_libelle)
       SELECT $1, $2, lu.libelle, lu.adresse, lu.lien_mission, $3, $4
         FROM (SELECT 1) AS un
         LEFT JOIN LATERAL (
           SELECT mm.libelle, mm.adresse, mm.lien_mission
             FROM gestion_monga_mail mm
             JOIN gestion_message m ON m.id = mm.message_id
            WHERE mm.reference = $1
            ORDER BY (mm.libelle IS NOT NULL) DESC, m.recu_le DESC
            LIMIT 1) AS lu ON true
       ON CONFLICT (reference) WHERE retire_le IS NULL DO NOTHING
       RETURNING id::int AS id`,
      [l.reference, o.evenementId, o.auteur.id, o.auteur.libelle.trim()]);
    if (rows[0] === undefined) {
      const tenu = await lienVivant(q, l.reference);
      const d = decisionDuLien(tenu, o.evenementId);
      out.push({ reference: l.reference, issue: d === 'ailleurs' ? 'ailleurs' : 'deja', evenementReference: d === 'ailleurs' ? tenu?.evenementReference ?? null : null });
      continue;
    }
    await q(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
       VALUES ('evenement', $1, $2, NULL, $3, $4, $5, $6)`,
      [o.evenementId, ACTION_JOURNAL_LIEN, l.reference,
        `intervention ${l.reference} reliée à ${o.evenementReference} — ${o.motif}`,
        o.auteur.id, o.auteur.libelle.trim()]);
    out.push({ reference: l.reference, issue: 'cree', evenementReference: null });
  }
  return out;
}

/** Les références dont le lien vient d'être CRÉÉ : ce sont elles dont les anciens mails doivent être classés. PUR. */
export function referencesCreees(liens: readonly LienParGeste[] | undefined): string[] {
  return (liens ?? []).filter((l) => l.issue === 'cree').map((l) => l.reference);
}
