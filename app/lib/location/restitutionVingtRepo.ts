import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { colonneExisteMemo } from './sondeLocation';
import { montantsDesSorties } from './montantVingtRepo';
import { montantFr, MOTIF_SANS_513, verifierRestitution, type RestitutionFaite } from './vingtPourcent';

/**
 * ══ 🔴🔴 « RESTITUTION FAITE » DES 20 % RETENUS — L'ÉCRITURE (Arno, 24/11/2026). IMPUR (base). ═══════════════════════════════════════════════════
 * Table de gestes en AJOUT SEUL (migration 513) : « faite », puis éventuellement « annulee » (la restitution annulée reste en base). Chaque geste est
 * journalisé dans le dossier de CHAQUE locataire de la sortie (gestion_journal, entité « annuaire ») ET, depuis le 25/11/2026 (décision d'Arno), dans
 * l'historique du BIEN de la sortie (entité « annuaire_lot », `s.lot_id` posé à la validation — jamais le bail en cours) : rien n'est supprimé. Une restitution en
 * cours retire la sortie de l'écran « 20 % à restituer » (et donc de toute alerte) ; son annulation l'y remet. Sans la 513 : refus, rien n'est écrit.
 */

export const restitutionVingtDisponible = (): Promise<boolean> => colonneExisteMemo('gestion_location_restitution_vingt', 'sortie_validee_id');

/** Le filtre SQL « aucune restitution EN COURS pour cette sortie » (alias de la sortie validée `s`). */
export const SQL_SANS_RESTITUTION_EN_COURS = `NOT EXISTS (SELECT 1 FROM gestion_location_restitution_vingt f WHERE f.sortie_validee_id = s.id AND f.geste = 'faite'
          AND NOT EXISTS (SELECT 1 FROM gestion_location_restitution_vingt a WHERE a.annule_id = f.id))`;

export type IssueRestitution = { etat: 'ok'; data: { id: number } } | { etat: 'refus'; motif: string; champ?: string };

const ident = (x: unknown): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d{1,15}$/.test(x) ? Number(x) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
type Q = typeof query;

/** Les locataires d'une sortie (leurs identifiants, pour le journal de leur dossier). */
async function locatairesDeLaSortie(q: Q, sortieId: number): Promise<number[]> {
  const { rows } = await q<{ id: string }>(
    `SELECT DISTINCT o.locataire_id::text AS id FROM gestion_location_sortie_validee s JOIN gestion_annuaire_occupation o ON o.id = ANY(s.occupation_ids)
      WHERE s.id = $1 ORDER BY 1`, [sortieId]);
  return rows.map((r) => Number(r.id));
}
async function journaliser(q: Q, locataires: readonly number[], action: string, apres: string, commentaire: string, auteur: Auteur): Promise<void> {
  for (const id of locataires) {
    await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
             VALUES ('annuaire', $1, $2, NULL, $3, $4, $5, $6)`, [id, action, apres, commentaire, auteur.id, auteur.libelle]);
  }
}

/**
 * 🔴 (Arno, 25/11/2026) « inscris aussi la restitution dans l'historique du bien » : la même ligne au journal du bien de la sortie (`s.lot_id`, figé à la
 * validation : un logement reloué depuis garde la trace sur le bon bien). Dans la transaction du geste.
 */
async function journaliserBien(q: Q, sortieId: number, action: string, apres: string, commentaire: string, auteur: Auteur): Promise<void> {
  await q(`INSERT INTO gestion_journal (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
           SELECT 'annuaire_lot', s.lot_id, $2, NULL, $3, $4, $5, $6 FROM gestion_location_sortie_validee s WHERE s.id = $1`,
    [sortieId, action, apres, commentaire, auteur.id, auteur.libelle]);
}

/** ENREGISTRE « Restitution faite » pour une sortie validée avec retenue (une seule en cours par sortie). */
export async function enregistrerRestitution(d: Record<string, unknown>, auteur: Auteur): Promise<IssueRestitution> {
  if (!(await restitutionVingtDisponible())) return { etat: 'refus', motif: MOTIF_SANS_513 };
  const sortieId = ident(d.sortieId);
  if (sortieId === null) return { etat: 'refus', motif: 'Sortie inconnue : rechargez la page.' };
  return withTransaction(async (q) => {
    // un geste à la fois par sortie (deux clics, deux onglets)
    await q('SELECT pg_advisory_xact_lock(513, $1::int)', [sortieId]);
    const { rows } = await q<{ date_sortie: string; retenue: boolean; j: string }>(
      `SELECT s.date_sortie::text, s.retenue_20 AS retenue, ${SQL_AUJOURDHUI_PARIS}::text AS j FROM gestion_location_sortie_validee s WHERE s.id = $1`, [sortieId]);
    const s = rows[0];
    if (s === undefined || !s.retenue) return { etat: 'refus', motif: 'Cette sortie n’a pas de retenue de 20 % : rien n’est enregistré.' } as IssueRestitution;
    const v = verifierRestitution({ date: d.date, montantRestitue: d.montantRestitue, montantRetenuCharges: d.montantRetenuCharges, commentaire: d.commentaire },
      { dateSortie: s.date_sortie, aujourdhui: s.j });
    if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ } as IssueRestitution;
    const { rows: deja } = await q<{ id: string }>(`SELECT 1 AS id FROM gestion_location_sortie_validee s WHERE s.id = $1 AND NOT (${SQL_SANS_RESTITUTION_EN_COURS})`, [sortieId]);
    if (deja.length > 0) return { etat: 'refus', motif: 'Cette restitution est déjà enregistrée : rechargez la page.' } as IssueRestitution;
    const x = v.valeur;
    const { rows: ins } = await q<{ id: string }>(
      `INSERT INTO gestion_location_restitution_vingt (sortie_validee_id, geste, date_restitution, montant_restitue, montant_retenu_charges, commentaire, saisie_par, saisie_par_libelle)
       VALUES ($1, 'faite', $2, $3, $4, $5, $6, $7) RETURNING id::text`,
      [sortieId, x.date, x.montantRestitue, x.montantRetenuCharges, x.commentaire, auteur.id, auteur.libelle]);
    const id = Number(ins[0].id);
    // 🔴 (Arno, 25/11/2026, 22h06) le montant des 20 % retenus à la sortie suit jusqu'à l'historique (dossier du locataire, bien)
    const vingt = (await montantsDesSorties([sortieId]).catch(() => new Map())).get(sortieId) ?? null;
    const texte = `restitution des 20 % faite le ${x.date.slice(8, 10)}/${x.date.slice(5, 7)}/${x.date.slice(0, 4)} : ${montantFr(x.montantRestitue)} restitués`
      + (vingt !== null ? ` sur ${montantFr(vingt.montant)} retenus à la sortie` : '')
      + (x.montantRetenuCharges !== null ? `, ${montantFr(x.montantRetenuCharges)} retenus au titre des charges` : '');
    const commentaire = `${x.commentaire ?? 'Restitution des 20 % du dépôt de garantie'} — sortie validée ${sortieId}, restitution ${id}`;
    await journaliser(q, await locatairesDeLaSortie(q, sortieId), 'location_restitution_20_faite', texte, commentaire, auteur);
    await journaliserBien(q, sortieId, 'location_restitution_20_faite', texte, commentaire, auteur);
    return { etat: 'ok', data: { id } } as IssueRestitution;
  });
}

/** ANNULE une restitution en cours (elle reste en base ; la sortie revient sur l'écran). */
export async function annulerRestitution(d: Record<string, unknown>, auteur: Auteur): Promise<IssueRestitution> {
  if (!(await restitutionVingtDisponible())) return { etat: 'refus', motif: MOTIF_SANS_513 };
  const restitutionId = ident(d.restitutionId);
  if (restitutionId === null) return { etat: 'refus', motif: 'Restitution inconnue : rechargez la page.' };
  return withTransaction(async (q) => {
    const { rows } = await q<{ sortie: string; date: string; montant: string }>(
      `SELECT f.sortie_validee_id::text AS sortie, f.date_restitution::text AS date, f.montant_restitue::text AS montant FROM gestion_location_restitution_vingt f
        WHERE f.id = $1 AND f.geste = 'faite'`, [restitutionId]);
    const f = rows[0];
    if (f === undefined) return { etat: 'refus', motif: 'Restitution inconnue : rechargez la page.' } as IssueRestitution;
    await q('SELECT pg_advisory_xact_lock(513, $1::int)', [Number(f.sortie)]);
    const { rows: ins } = await q<{ id: string }>(
      `INSERT INTO gestion_location_restitution_vingt (sortie_validee_id, geste, annule_id, saisie_par, saisie_par_libelle)
       SELECT $1, 'annulee', $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM gestion_location_restitution_vingt a WHERE a.annule_id = $2) RETURNING id::text`,
      [Number(f.sortie), restitutionId, auteur.id, auteur.libelle]);
    if (ins.length === 0) return { etat: 'refus', motif: 'Cette restitution est déjà annulée : rechargez la page.' } as IssueRestitution;
    const texte = `restitution des 20 % du ${f.date.slice(8, 10)}/${f.date.slice(5, 7)}/${f.date.slice(0, 4)} (${montantFr(Number(f.montant))}) annulée`;
    const commentaire = `Restitution ${restitutionId} annulée (erreur de saisie) — la sortie ${f.sortie} revient sur « 20 % à restituer »`;
    await journaliser(q, await locatairesDeLaSortie(q, Number(f.sortie)), 'location_restitution_20_annulee', texte, commentaire, auteur);
    await journaliserBien(q, Number(f.sortie), 'location_restitution_20_annulee', texte, commentaire, auteur);
    return { etat: 'ok', data: { id: Number(ins[0].id) } } as IssueRestitution;
  });
}

/** Les restitutions EN COURS (section « Restitutions faites »), les plus récentes d'abord. Sans la 513 : aucune. */
export async function lireRestitutionsFaites(): Promise<RestitutionFaite[]> {
  if (!(await restitutionVingtDisponible())) return [];
  const { rows } = await query<{ id: string; sortie: string; noms: string[] | null; logement: string | null; date_sortie: string; date: string; restitue: string; retenu: string | null;
    commentaire: string | null; par: string; le: string }>(
    `SELECT f.id::text, s.id::text AS sortie,
            (SELECT array_agg(l.nom ORDER BY l.nom_normalise) FROM gestion_annuaire_occupation o JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
              WHERE o.id = ANY(s.occupation_ids)) AS noms,
            nullif(concat_ws(', ', lo.adresse, nullif(concat_ws(' ', lo.code_postal, lo.commune), '')), '') AS logement,
            s.date_sortie::text, f.date_restitution::text AS date, f.montant_restitue::text AS restitue, f.montant_retenu_charges::text AS retenu,
            f.commentaire, f.saisie_par_libelle AS par, (f.saisie_le AT TIME ZONE 'Europe/Paris')::text AS le
       FROM gestion_location_restitution_vingt f JOIN gestion_location_sortie_validee s ON s.id = f.sortie_validee_id JOIN gestion_annuaire_lot lo ON lo.id = s.lot_id
      WHERE f.geste = 'faite' AND NOT EXISTS (SELECT 1 FROM gestion_location_restitution_vingt a WHERE a.annule_id = f.id)
      ORDER BY f.date_restitution DESC, f.id DESC`);
  return rows.map((r) => ({ id: Number(r.id), sortieId: Number(r.sortie), locataires: r.noms ?? [], logement: r.logement, dateSortie: r.date_sortie, date: r.date,
    montantRestitue: Number(r.restitue), montantRetenuCharges: r.retenu === null ? null : Number(r.retenu), commentaire: r.commentaire, par: r.par, le: r.le.slice(0, 16) }));
}
