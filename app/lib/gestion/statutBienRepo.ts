import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import type { Issue } from '../location/locationRepo';
import { colonneExisteMemo } from '../location/sondeLocation';
import { verifierMandat, type SaisieMandat } from '../location/mandatBien';
import { enregistrerMandatDans } from '../location/mandatBienRepo';
import {
  estStatutBien, gesteDe, gestesPour, mandatPropose, motifTransition, phraseTransition, refusTransition, statutDeduit, verifierDateEffet,
  type GesteStatut, type StatutBien,
} from './statutBien';

/**
 * ══ 🔴🔴 LE STATUT D'UN BIEN — LECTURE ET TRANSITIONS (Arno, 21/10/2026, migration 403). IMPUR (base). ════════════════════════
 *
 * La SEULE vérité est `gestion_annuaire_lot.statut_bien` (+ `statut_bien_depuis`), et chaque changement a sa ligne dans
 * `gestion_bien_statut_transition` (ajout seul) — la base REFUSE un changement sans sa ligne. Les annexes RATTACHÉES suivent
 * leur bien principal (déclencheur de la 403) ; une annexe rattachée ne change donc jamais seule.
 * Sans la 403 : le statut se LIT par la règle de reprise (`statutDeduit`), et aucune transition n'est possible (« sans_schema »).
 * 🔴 Aucun DELETE. Les mails du bien ne sont jamais touchés.
 */

export function statutBienDisponible(): Promise<boolean> {
  return colonneExisteMemo('gestion_annuaire_lot', 'statut_bien');
}

/**
 * L'EXPRESSION SQL du statut d'un bien (alias de `gestion_annuaire_lot`) : la colonne avec la 403 ; sans elle, la règle de
 * reprise écrite en SQL (les colonnes absentes comptent pour « rien »). Une seule écriture pour toutes les requêtes.
 */
export async function sqlStatutBien(alias: string): Promise<string> {
  if (await statutBienDisponible()) return `${alias}.statut_bien`;
  const enGestion = (await colonneExisteMemo('gestion_annuaire_lot', 'en_gestion')) ? `${alias}.en_gestion = false` : 'false';
  const sorti = (await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? ` OR ${alias}.sorti_portefeuille_le IS NOT NULL` : '';
  return `(CASE WHEN ${enGestion} THEN 'location_seule' WHEN ${alias}.gestion_fin IS NOT NULL${sorti} THEN 'ancienne_gestion' ELSE 'en_gestion' END)`;
}

export interface TransitionLue {
  id: number; avant: StatutBien | null; apres: StatutBien; effetLe: string; source: string; viaLotId: number | null;
  motif: string | null; mandat: string | null; par: string; quand: string;
}

export interface LectureStatut {
  /** La 403 est-elle appliquée (sinon : statut déduit, aucun geste) ? */
  disponible: boolean;
  lotId: number;
  statut: StatutBien;
  depuis: string | null;
  /** Annexe RATTACHÉE : son bien principal, dont elle suit le statut (aucun geste sur elle). */
  suitLot: { id: number; adresse: string | null; commune: string | null } | null;
  gestes: GesteStatut[];
}

export async function lireStatutBien(lotId: number): Promise<LectureStatut | null> {
  const disponible = await statutBienDisponible();
  const avecAnnexe = await colonneExisteMemo('gestion_lot_annexe', 'annexe_id');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  const enGestion = (await colonneExisteMemo('gestion_annuaire_lot', 'en_gestion')) ? 'lo.en_gestion' : 'NULL::boolean';
  const sorti = (await colonneExisteMemo('gestion_annuaire_lot', 'sorti_portefeuille_le')) ? 'lo.sorti_portefeuille_le::text' : 'NULL::text';
  const { rows } = await query<{ statut: string | null; depuis: string | null; en_gestion: boolean | null; fin: string | null; sorti: string | null;
    principal_id: string | null; principal_adresse: string | null; principal_commune: string | null }>(
    `SELECT ${disponible ? 'lo.statut_bien' : 'NULL::text'} AS statut, ${disponible ? 'lo.statut_bien_depuis::text' : 'NULL::text'} AS depuis,
            ${enGestion} AS en_gestion, lo.gestion_fin::text AS fin, ${sorti} AS sorti,
            ${avecAnnexe ? `pa.id::text` : 'NULL::text'} AS principal_id, ${avecAnnexe ? 'pa.adresse' : 'NULL::text'} AS principal_adresse,
            ${avecAnnexe ? 'pa.commune' : 'NULL::text'} AS principal_commune
       FROM gestion_annuaire_lot lo
       ${avecAnnexe ? `LEFT JOIN gestion_lot_annexe ax ON ax.annexe_id = lo.id${avecDetache ? ' AND lo.annexe_detachee_le IS NULL' : ''}
       LEFT JOIN gestion_annuaire_lot pa ON pa.id = ax.parent_id` : ''}
      WHERE lo.id = $1`, [lotId]);
  const r = rows[0];
  if (r === undefined) return null;
  const statut: StatutBien = estStatutBien(r.statut) ? r.statut : statutDeduit(r.en_gestion, r.fin, r.sorti);
  const suitLot = r.principal_id === null ? null : { id: Number(r.principal_id), adresse: r.principal_adresse, commune: r.principal_commune };
  return { disponible, lotId, statut, depuis: r.depuis, suitLot, gestes: disponible && suitLot === null ? gestesPour(statut) : [] };
}

/** Le journal des transitions de CE bien, du plus récent (l'Historique). Vide sans la 403. */
export async function transitionsDuBien(lotId: number): Promise<TransitionLue[]> {
  if (!(await statutBienDisponible())) return [];
  const { rows } = await query<{ id: string; avant: string | null; apres: string; effet_le: string; source: string; via_lot_id: string | null;
    motif: string | null; mandat: string | null; auteur_libelle: string; survenu_le: string }>(
    `SELECT id::text, avant, apres, effet_le::text, source, via_lot_id::text, motif, mandat, auteur_libelle, survenu_le::text
       FROM gestion_bien_statut_transition WHERE lot_id = $1 ORDER BY survenu_le DESC, id DESC LIMIT 200`, [lotId]);
  return rows.filter((t) => estStatutBien(t.apres)).map((t) => ({
    id: Number(t.id), avant: estStatutBien(t.avant) ? t.avant : null, apres: t.apres as StatutBien, effetLe: t.effet_le, source: t.source,
    viaLotId: t.via_lot_id === null ? null : Number(t.via_lot_id), motif: t.motif, mandat: t.mandat, par: t.auteur_libelle, quand: t.survenu_le,
  }));
}

class Refus extends Error {}

export interface SaisieTransition { vers: unknown; effetLe: unknown; motif?: unknown; mandat?: unknown }

export interface IssueTransition {
  avant: StatutBien;
  apres: StatutBien;
  effetLe: string;
  /** Le bien et ses annexes rattachées qui l'ont suivi : ceux dont le dossier Drive est à déplacer. */
  lots: number[];
  /** Le mandat n'a pas pu être complètement enregistré (ex. date sans la 397). */
  avertissement: string | null;
}

/** Les propriétaires actuels du bien (titulaire + co-propriétaires en cours). */
async function proprietairesDuLot(q: RequeteTx, lotId: number): Promise<number[]> {
  const avecCo = await colonneExisteMemo('gestion_annuaire_lot_proprietaire', 'lot_id');
  const { rows } = await q<{ id: string }>(
    `SELECT proprietaire_id::text AS id FROM gestion_annuaire_lot WHERE id = $1 AND proprietaire_id IS NOT NULL
     ${avecCo ? 'UNION SELECT proprietaire_id::text FROM gestion_annuaire_lot_proprietaire WHERE lot_id = $1 AND jusqu_a IS NULL' : ''}`, [lotId]);
  return [...new Set(rows.map((r) => Number(r.id)))];
}

/**
 * LA TRANSITION d'un bien, en UNE transaction : lu et verrouillé AVANT toute écriture (un refus n'écrit rien), la ligne au
 * journal des transitions, le statut, le journal de la fiche pour le bien et chaque annexe qui l'a suivi ; le mandat proposé
 * (facultatif) sur les propriétaires du bien. Le déplacement du dossier Drive est l'affaire de l'appelant (APRÈS l'écriture :
 * le statut est enregistré même si le Drive échoue).
 */
export async function changerStatutBien(lotId: number, s: SaisieTransition, auteur: Auteur, maintenant: Date = new Date()): Promise<Issue<IssueTransition>> {
  if (!(await statutBienDisponible())) return { etat: 'sans_schema' };
  const date = verifierDateEffet(s.effetLe, maintenant);
  if (!date.ok) return { etat: 'refus', motif: date.motif };
  if (!estStatutBien(s.vers)) return { etat: 'refus', motif: refusTransition('en_gestion', s.vers) ?? 'Choisissez la destination du bien.' };
  const vers = s.vers;
  const motif = motifTransition(s.motif);
  const m = verifierMandat(s.mandat);
  if (!m.ok) return { etat: 'refus', motif: m.motif };
  const avecAnnexe = await colonneExisteMemo('gestion_lot_annexe', 'annexe_id');
  const avecDetache = await colonneExisteMemo('gestion_annuaire_lot', 'annexe_detachee_le');
  try {
    return await withTransaction(async (q) => {
      const { rows } = await q<{ statut: string; principal: string | null }>(
        `SELECT lo.statut_bien AS statut,
                ${avecAnnexe ? `(SELECT ax.parent_id::text FROM gestion_lot_annexe ax WHERE ax.annexe_id = lo.id${avecDetache ? ' AND lo.annexe_detachee_le IS NULL' : ''})` : 'NULL::text'} AS principal
           FROM gestion_annuaire_lot lo WHERE lo.id = $1 FOR UPDATE`, [lotId]);
      const r = rows[0];
      if (r === undefined) throw new Refus('Ce bien n’existe pas.');
      if (r.principal !== null) throw new Refus(`Cette annexe suit son bien principal (bien ${r.principal}) : changez le statut de ce bien-là.`);
      if (!estStatutBien(r.statut)) throw new Refus('Statut du bien illisible.');
      const avant = r.statut;
      const refus = refusTransition(avant, vers);
      if (refus !== null) throw new Refus(refus);
      const propose = mandatPropose(avant, vers);
      const mandat: SaisieMandat | null = m.mandat !== null && propose !== null && m.mandat.sorte === propose ? m.mandat : null;
      const libelleMandat = mandat === null ? null : [mandat.numero ? `n° ${mandat.numero}` : null, mandat.signeLe ? `signé le ${mandat.signeLe.split('-').reverse().join('/')}` : null]
        .filter((x) => x !== null).join(', ') || null;
      await q(`INSERT INTO gestion_bien_statut_transition (lot_id, avant, apres, effet_le, source, motif, mandat, auteur_id, auteur_libelle)
               VALUES ($1, $2, $3, $4::date, 'geste', $5, $6, $7, $8)`,
        [lotId, avant, vers, date.date, motif, libelleMandat === null ? null : `${propose === 'gestion' ? 'Mandat de gestion' : 'Mandat de transaction locative'} ${libelleMandat}`,
          auteur.id, auteur.libelle]);
      await q('UPDATE gestion_annuaire_lot SET statut_bien = $2, statut_bien_depuis = $3::date WHERE id = $1', [lotId, vers, date.date]);
      // Les annexes rattachées ont suivi (déclencheur de la 403) : leurs lignes « annexe » de CETTE transaction.
      const { rows: suivies } = await q<{ id: string }>(
        `SELECT lot_id::text AS id FROM gestion_bien_statut_transition WHERE via_lot_id = $1 AND source = 'annexe' AND survenu_le = now() ORDER BY lot_id`, [lotId]);
      const annexes = suivies.map((x) => Number(x.id));
      const phrase = phraseTransition(avant, vers, date.date, motif);
      for (const id of [lotId, ...annexes]) {
        await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
                 VALUES ('annuaire_lot', $1, 'location_statut_bien', $2, $3, $4, $5, $6)`,
          [id, avant, vers, id === lotId ? phrase : `${phrase} (annexe : suit le bien ${lotId})`, auteur.id, auteur.libelle]);
      }
      let avertissement: string | null = null;
      if (mandat !== null) {
        const ids = await proprietairesDuLot(q, lotId);
        avertissement = await enregistrerMandatDans(q, ids, mandat, lotId, auteur, `au geste « ${gesteDe(avant, vers)?.libelle ?? 'statut'} » du bien ${lotId}`);
      }
      return { etat: 'ok' as const, data: { avant, apres: vers, effetLe: date.date, lots: [lotId, ...annexes], avertissement } };
    });
  } catch (e) {
    if (e instanceof Refus) return { etat: 'refus', motif: e.message };
    throw e;
  }
}
