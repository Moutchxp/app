import 'server-only';
import { query, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { sqlEvenementOuvertParLaFrise } from './etatParLaFrise';
import { evenementsDuBien } from './mongaEtapeRepo';
import { titreLogement } from './annuaireRecherche';
import { coordonneesLisibles, estFamille, MOT_FAMILLE } from './contactsTache';
import { evenementsTacheDisponible, invitesTacheDisponible } from './schema';
import { tacheValidee, type TacheFrise } from './tacheFrise';
import type { StatutAcceptation } from './acceptationTache';

/**
 * ══ 🔴🔴 LOT GESTION-TACHES-EVENEMENTS (17/10/2026) — LES ÉVÉNEMENTS EN COURS D'UNE TÂCHE (migration 366) ═══════════
 *
 * ARNO : « dans la fenêtre de création de la tâche ET après coup (depuis “Modifier”), le créateur peut rattacher la
 * tâche à un ou plusieurs événements EN COURS (sélecteur multiple ; proposer en premier les événements du bien de la
 * tâche). On peut aussi retirer un rattachement (trace au journal, rien n'est supprimé physiquement). »
 *
 * 🔴 RÈGLES :
 *   ① « EN COURS » se demande à la FRISE (cartes de borne, `sqlEvenementOuvertParLaFrise`), comme partout ailleurs ;
 *     un rattachement NEUF vers un événement clos est refusé, un rattachement DÉJÀ posé reste si l'événement se clôt ;
 *   ② retirer MARQUE la ligne (`retire_le`), jamais de suppression ; rattacher de nouveau pose une ligne neuve ;
 *   ③ chaque ajout et chaque retrait écrit sa trace dans `gestion_tache_action`, dans la transaction du geste.
 * La colonne `gestion_tache.evenement_id` (« Événement du bien lié », un seul) n'est pas touchée.
 */

export interface EvenementDeTache { id: number; reference: string; objet: string; ouvert: boolean }
export interface EvenementPropose { id: number; reference: string; objet: string; duBien: boolean }

/** Les événements EN COURS proposés au sélecteur : ceux du bien d'abord, puis les autres (les plus récents d'abord). */
export async function evenementsProposes(cleBien: string | null, limite = 200): Promise<EvenementPropose[]> {
  const { rows } = await query<{ id: number; reference: string; objet: string }>(
    `SELECT e.id::int AS id, e.reference, e.objet FROM gestion_evenement e
      WHERE ${sqlEvenementOuvertParLaFrise('e')} ORDER BY e.ouvert_le DESC, e.id DESC LIMIT $1`, [limite]);
  const duBien = new Set<number>();
  if (cleBien !== null && cleBien.trim() !== '') {
    for (const e of await evenementsDuBien(cleBien).catch(() => [])) if (e.ouvert) duBien.add(Number(e.id));
  }
  const tous = rows.map((r) => ({ id: Number(r.id), reference: r.reference, objet: r.objet, duBien: duBien.has(Number(r.id)) }));
  return [...tous.filter((e) => e.duBien), ...tous.filter((e) => !e.duBien)];
}

/**
 * 🔴 LOT GESTION-TACHES-EVENEMENTS-FUSION — LA REPRISE DE L'ANCIEN CHAMP EST-ELLE FAITE (migration 367) ? Vrai quand
 * chaque tâche qui porte un « Événement du bien lié » a une ligne de rattachement pour ce couple — active OU retirée
 * depuis (retirer le rattachement ne fait pas « défaire » la reprise). Tant que ce n'est pas vrai, la fenêtre garde
 * l'ancien champ (décision d'Arno : il ne disparaît qu'une fois la reprise faite).
 */
export async function repriseAncienLienFaite(): Promise<boolean> {
  if (!(await evenementsTacheDisponible())) return false;
  const { rows } = await query<{ faite: boolean }>(
    `SELECT NOT EXISTS (SELECT 1 FROM gestion_tache t
                         WHERE t.evenement_id IS NOT NULL
                           AND NOT EXISTS (SELECT 1 FROM gestion_tache_evenement x
                                            WHERE x.tache_id = t.id AND x.evenement_id = t.evenement_id)) AS faite`);
  return rows[0]?.faite === true;
}

/**
 * Un événement posé par le champ d'avant (`evenementId`, par un appelant qui l'envoie encore) devient AUSSI un
 * rattachement, s'il n'en est pas déjà un : c'est le sélecteur qui fait foi, et le point de la frise doit suivre.
 */
export async function assurerRattachement(q: RequeteTx, tacheId: number, evenementId: number, auteur: Auteur, nom: string): Promise<void> {
  const deja = await q(`SELECT 1 FROM gestion_tache_evenement WHERE tache_id = $1 AND evenement_id = $2 AND retire_le IS NULL`, [tacheId, evenementId]);
  if (deja.rows.length > 0) return;
  const e = (await q<{ reference: string }>(`SELECT reference FROM gestion_evenement WHERE id = $1`, [evenementId])).rows[0];
  if (e === undefined) return;
  await q(`INSERT INTO gestion_tache_evenement (tache_id, evenement_id, ajoute_par, ajoute_par_libelle) VALUES ($1, $2, $3, $4)`,
    [tacheId, evenementId, auteur.id, nom]);
  await tracer(q, tacheId, null, { evenementRattache: e.reference }, auteur, nom);
}

/** Les événements rattachés (actifs) de chaque tâche. Une requête pour toute la liste. */
export async function evenementsDesTaches(ids: readonly number[]): Promise<Map<number, EvenementDeTache[]>> {
  const m = new Map<number, EvenementDeTache[]>();
  if (ids.length === 0 || !(await evenementsTacheDisponible())) return m;
  const { rows } = await query<{ tache_id: number; id: number; reference: string; objet: string; ouvert: boolean }>(
    `SELECT l.tache_id::int AS tache_id, e.id::int AS id, e.reference, e.objet, ${sqlEvenementOuvertParLaFrise('e')} AS ouvert
       FROM gestion_tache_evenement l JOIN gestion_evenement e ON e.id = l.evenement_id
      WHERE l.tache_id = ANY($1::bigint[]) AND l.retire_le IS NULL
      ORDER BY l.tache_id, l.ajoute_le, l.id`, [ids]);
  for (const r of rows) {
    const l = m.get(Number(r.tache_id)) ?? [];
    l.push({ id: Number(r.id), reference: r.reference, objet: r.objet, ouvert: r.ouvert === true });
    m.set(Number(r.tache_id), l);
  }
  return m;
}

async function tracer(q: RequeteTx, tacheId: number, avant: unknown, apres: unknown, auteur: Auteur, nom: string): Promise<void> {
  await q(
    `INSERT INTO gestion_tache_action (tache_id, action, avant, apres, auteur_id, auteur_libelle)
     VALUES ($1, 'modification', $2::jsonb, $3::jsonb, $4, $5)`,
    [tacheId, avant === null ? null : JSON.stringify(avant), JSON.stringify(apres), auteur.id, nom]);
}

/**
 * ALIGNE les rattachements actifs d'une tâche sur la liste voulue, dans la transaction du geste. Rend `null` si tout va
 * bien, sinon le refus (rien n'est écrit : on lit et l'on vérifie AVANT d'écrire).
 */
export async function alignerEvenements(
  q: RequeteTx, tacheId: number, voulus: readonly number[], auteur: Auteur, nom: string,
): Promise<string | null> {
  const actifs = (await q<{ evenement_id: number; reference: string }>(
    `SELECT l.evenement_id::int AS evenement_id, e.reference FROM gestion_tache_evenement l
       JOIN gestion_evenement e ON e.id = l.evenement_id
      WHERE l.tache_id = $1 AND l.retire_le IS NULL FOR UPDATE OF l`, [tacheId])).rows;
  const deja = new Set(actifs.map((a) => Number(a.evenement_id)));
  const voulusSet = new Set(voulus.map(Number));
  const nouveaux = [...voulusSet].filter((id) => !deja.has(id));
  const verifies = nouveaux.length === 0 ? [] : (await q<{ id: number; reference: string; ouvert: boolean }>(
    `SELECT e.id::int AS id, e.reference, ${sqlEvenementOuvertParLaFrise('e')} AS ouvert
       FROM gestion_evenement e WHERE e.id = ANY($1::bigint[])`, [nouveaux])).rows;
  for (const id of nouveaux) {
    const e = verifies.find((x) => Number(x.id) === id);
    if (e === undefined) return 'Un des événements choisis est introuvable.';
    if (e.ouvert !== true) return `L’événement ${e.reference} n’est plus en cours : on ne peut pas y rattacher la tâche.`;
  }
  for (const a of actifs) {
    if (voulusSet.has(Number(a.evenement_id))) continue;
    await q(`UPDATE gestion_tache_evenement SET retire_le = now(), retire_par_libelle = $3
              WHERE tache_id = $1 AND evenement_id = $2 AND retire_le IS NULL`, [tacheId, a.evenement_id, nom]);
    await tracer(q, tacheId, { evenement: a.reference }, { evenementRetire: a.reference }, auteur, nom);
  }
  for (const id of nouveaux) {
    const e = verifies.find((x) => Number(x.id) === id)!;
    await q(`INSERT INTO gestion_tache_evenement (tache_id, evenement_id, ajoute_par, ajoute_par_libelle) VALUES ($1, $2, $3, $4)`,
      [tacheId, id, auteur.id, nom]);
    await tracer(q, tacheId, null, { evenementRattache: e.reference }, auteur, nom);
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES TÂCHES D'UN ÉVÉNEMENT, POUR SA FRISE (le point rouge et sa bulle)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export async function tachesDeLEvenement(evenementId: number): Promise<TacheFrise[]> {
  if (!(await evenementsTacheDisponible())) return [];
  const { rows } = await query<{
    id: number; objet: string; jour: string; heure: string | null; duree_minutes: number | null; etat: TacheFrise['etat'];
    cree_par_libelle: string; adresse: string | null; commune: string | null; confiee_a_libelle: string; lot_id: number | null;
  }>(
    `SELECT t.id::int AS id, t.objet, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
            t.duree_minutes, t.etat, t.cree_par_libelle, t.lot_id::int AS lot_id, l.adresse, l.commune, t.confiee_a_libelle
       FROM gestion_tache_evenement x
       JOIN gestion_tache t ON t.id = x.tache_id
       LEFT JOIN gestion_annuaire_lot l ON l.id = t.lot_id
      WHERE x.evenement_id = $1 AND x.retire_le IS NULL
      ORDER BY t.jour, t.heure NULLS FIRST, t.id`, [evenementId]);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => Number(r.id));
  const avecInvites = await invitesTacheDisponible();
  const [inv, dem, con, pie] = await Promise.all([
    avecInvites ? query<{ tache_id: number; libelle: string; statut: string | null }>(
      `SELECT i.tache_id::int AS tache_id, i.libelle,
              (SELECT d.statut FROM gestion_tache_demande d WHERE d.invite_id = i.id AND d.statut <> 'remplacee' LIMIT 1) AS statut
         FROM gestion_tache_invite i JOIN gestion_tache t ON t.id = i.tache_id
        WHERE i.tache_id = ANY($1::bigint[]) AND i.retire_le IS NULL
        ORDER BY i.tache_id, (i.collaborateur_id IS NOT DISTINCT FROM t.confiee_a) DESC, i.rang, i.id`, [ids]) : Promise.resolve({ rows: [] }),
    // L'expéditeur : celui qui a envoyé la dernière demande (à défaut, le créateur).
    query<{ tache_id: number; demandeur: string }>(
      `SELECT DISTINCT ON (tache_id) tache_id::int AS tache_id, demandeur_libelle AS demandeur
         FROM gestion_tache_demande WHERE tache_id = ANY($1::bigint[]) ORDER BY tache_id, cree_le DESC, id DESC`, [ids])
      .catch(() => ({ rows: [] as { tache_id: number; demandeur: string }[] })),
    query<{ tache_id: number; famille: string; nom: string; qualite: string | null; organisation: string | null; coordonnees: unknown }>(
      `SELECT tache_id::int AS tache_id, famille, nom, qualite, organisation, coordonnees FROM gestion_tache_contact
        WHERE tache_id = ANY($1::bigint[]) AND retire_le IS NULL ORDER BY tache_id, rang, id`, [ids]).catch(() => ({ rows: [] as never[] })),
    query<{ tache_id: number; nom: string }>(
      `SELECT tache_id::int AS tache_id, nom FROM gestion_tache_piece WHERE tache_id = ANY($1::bigint[]) AND retire_le IS NULL ORDER BY tache_id, id`, [ids])
      .catch(() => ({ rows: [] as { tache_id: number; nom: string }[] })),
  ]);
  /* 🔴 LOT GESTION-HISTORIQUE-TACHES (accord d'Arno, 17/10/2026) — SEULES LES TÂCHES VALIDÉES vont dans la frise : en
     attente, refusée par tous ou annulée, elle n'y est pas (cela remplace le point gris). Le rattachement reste en base. */
  return rows.map((r) => {
    const id = Number(r.id);
    const invites = (inv.rows as { tache_id: number; libelle: string; statut: string | null }[]).filter((i) => Number(i.tache_id) === id)
      .map((i) => ({ libelle: i.libelle, statut: (i.statut === 'en_attente' || i.statut === 'acceptee' || i.statut === 'refusee' ? i.statut : null) as StatutAcceptation | null }));
    return {
      id, objet: r.objet, jour: r.jour, heure: r.heure, dureeMinutes: r.duree_minutes === null ? null : Number(r.duree_minutes), etat: r.etat,
      expediteur: dem.rows.find((d) => Number(d.tache_id) === id)?.demandeur ?? r.cree_par_libelle,
      adresse: r.lot_id === null ? '' : titreLogement(r.adresse, r.commune),
      invites: invites.length > 0 ? invites : [{ libelle: r.confiee_a_libelle, statut: null }],
      contacts: con.rows.filter((c) => Number(c.tache_id) === id && estFamille(c.famille)).map((c) => ({
        nom: c.nom,
        role: [MOT_FAMILLE[c.famille as keyof typeof MOT_FAMILLE], (c.qualite ?? '').trim(), (c.organisation ?? '').trim()].filter((x) => x !== '').join(' · '),
        coordonnees: coordonneesLisibles(c.coordonnees).map((x) => x.affichage ?? x.valeur),
      })),
      pieces: pie.rows.filter((p) => Number(p.tache_id) === id).map((p) => p.nom),
    };
  }).filter(tacheValidee);
}
