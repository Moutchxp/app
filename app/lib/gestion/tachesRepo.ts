import 'server-only';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { titreLogement } from './annuaireRecherche';
import type { Auteur } from './gestes';
import {
  jourDecale, rappelsParDefaut, rappelsValides,
  type ActionTache, type EtatTache, type RaccourciDecalage, type Rappel, type SaisieTache, type Tache, type TraceTache,
} from './taches';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LE DÉPÔT DES TÂCHES (migration 346) ═══════════════════════════════════════════════════════
 *
 * 🔴 TROIS RÈGLES :
 *   ① ON NE SUPPRIME JAMAIS : faite, décalée, annulée, rouverte sont des CHANGEMENTS D'ÉTAT. La base le garantit
 *     (déclencheur), ce fichier ne le tente même pas ;
 *   ② CHAQUE GESTE ÉCRIT UNE TRACE, datée et signée, dans la MÊME transaction que le changement : un état sans sa
 *     trace, ou une trace sans son état, ne peut pas exister ;
 *   ③ ON LIT (FOR UPDATE) AVANT D'ÉCRIRE : un refus se décide AVANT toute écriture. `withTransaction` valide au
 *     retour normal — un refus rendu après un UPDATE l'aurait laissé passer.
 *
 * ⚠️ AUCUN APPEL GOOGLE. Les colonnes du lot 2 (`google_*`, `synchro_*`) ne sont ni lues ni écrites ici.
 */

/** Un collaborateur à qui l'on peut confier une tâche : compte ACTIF avec l'accès Gestion (ou administrateur). */
export interface Collaborateur { id: number; libelle: string }

const SQL_COLLABORATEURS = `
  SELECT id::int AS id, btrim(prenom || ' ' || nom) AS libelle
    FROM admin_utilisateur
   WHERE actif AND (role = 'administrateur' OR perm_gestion)
   ORDER BY lower(prenom), lower(nom), id`;

export async function listerCollaborateurs(): Promise<Collaborateur[]> {
  const { rows } = await query<Collaborateur>(SQL_COLLABORATEURS);
  return rows;
}

/** Le nom de l'auteur d'un geste : « Prénom Nom » quand il a un compte, son identifiant sinon. */
async function nomAuteur(q: RequeteTx, auteur: Auteur): Promise<string> {
  if (auteur.id !== null) {
    const { rows } = await q<{ l: string }>(
      `SELECT btrim(prenom || ' ' || nom) AS l FROM admin_utilisateur WHERE id = $1`, [auteur.id]);
    const l = (rows[0]?.l ?? '').trim();
    if (l !== '') return l;
  }
  return auteur.libelle.trim() === '' ? 'inconnu' : auteur.libelle;
}

interface LigneTache {
  id: number; lot_id: number; lot_cle: string; adresse: string | null; commune: string | null;
  evenement_id: number | null; ev_reference: string | null; ev_objet: string | null;
  objet: string; note: string | null; jour: string; heure: string | null; rappels: Rappel[]; etat: EtatTache;
  confiee_a: number | null; confiee_a_libelle: string;
  cree_le: Date; cree_par_libelle: string; maj_le: Date;
  faite_le: Date | null; faite_par_libelle: string | null; annulee_le: Date | null; annulee_par_libelle: string | null;
}

const SQL_TACHE = `
  SELECT t.id::int AS id, t.lot_id::int AS lot_id, l.wippimmo_id AS lot_cle, l.adresse, l.commune,
         t.evenement_id::int AS evenement_id, e.reference AS ev_reference, e.objet AS ev_objet,
         t.objet, t.note, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
         t.rappels, t.etat, t.confiee_a::int AS confiee_a, t.confiee_a_libelle,
         t.cree_le, t.cree_par_libelle, t.maj_le, t.faite_le, t.faite_par_libelle, t.annulee_le, t.annulee_par_libelle
    FROM gestion_tache t
    JOIN gestion_annuaire_lot l ON l.id = t.lot_id
    LEFT JOIN gestion_evenement e ON e.id = t.evenement_id`;

const iso = (d: Date | null): string | null => (d === null ? null : new Date(d).toISOString());

function versTache(r: LigneTache): Tache {
  return {
    id: Number(r.id), lotId: Number(r.lot_id), lotCle: r.lot_cle, adresseBien: titreLogement(r.adresse, r.commune),
    evenement: r.evenement_id === null ? null
      : { id: Number(r.evenement_id), reference: r.ev_reference ?? '', objet: r.ev_objet ?? '' },
    objet: r.objet, note: r.note, jour: r.jour, heure: r.heure, rappels: Array.isArray(r.rappels) ? r.rappels : [],
    etat: r.etat, confieeA: r.confiee_a === null ? null : Number(r.confiee_a), confieeALibelle: r.confiee_a_libelle,
    creeLe: iso(r.cree_le) ?? '', creeParLibelle: r.cree_par_libelle, majLe: iso(r.maj_le) ?? '',
    faiteLe: iso(r.faite_le), faiteParLibelle: r.faite_par_libelle,
    annuleeLe: iso(r.annulee_le), annuleeParLibelle: r.annulee_par_libelle,
  };
}

/** Combien de tâches TERMINÉES au plus dans une liste : elles sont repliées, et l'écran dit qu'il y en a d'autres. */
export const TERMINEES_MAX = 100;
/** Garde-fou : une liste de tâches à faire au-delà de ce nombre dit qu'elle est tronquée, elle ne se tait pas. */
export const OUVERTES_MAX = 1000;

/**
 * LES TÂCHES : toutes celles À FAIRE, et les plus récentes des TERMINÉES. `lotId` = celles d'un bien ; `null` =
 * celles de tous les biens (récapitulatif général).
 */
export async function listerTaches(lotId: number | null): Promise<{ taches: Tache[]; tronque: boolean }> {
  const [o, t] = await Promise.all([
    query<LigneTache>(
      `${SQL_TACHE} WHERE t.etat = 'a_faire' AND ($1::bigint IS NULL OR t.lot_id = $1)
        ORDER BY t.jour, t.heure NULLS FIRST, t.id LIMIT ${OUVERTES_MAX + 1}`, [lotId]),
    query<LigneTache>(
      `${SQL_TACHE} WHERE t.etat <> 'a_faire' AND ($1::bigint IS NULL OR t.lot_id = $1)
        ORDER BY coalesce(t.faite_le, t.annulee_le, t.maj_le) DESC, t.id DESC LIMIT ${TERMINEES_MAX}`, [lotId]),
  ]);
  const tronque = o.rows.length > OUVERTES_MAX;
  return { taches: [...o.rows.slice(0, OUVERTES_MAX), ...t.rows].map(versTache), tronque };
}

export async function lireTache(id: number): Promise<{ tache: Tache; traces: TraceTache[] } | null> {
  const { rows } = await query<LigneTache>(`${SQL_TACHE} WHERE t.id = $1`, [id]);
  if (rows.length === 0) return null;
  const tr = await query<{ action: ActionTache; avant: Record<string, unknown> | null; apres: Record<string, unknown> | null; survenu_le: Date; auteur_libelle: string }>(
    `SELECT action, avant, apres, survenu_le, auteur_libelle FROM gestion_tache_action
      WHERE tache_id = $1 ORDER BY survenu_le, id`, [id]);
  return {
    tache: versTache(rows[0]),
    traces: tr.rows.map((r) => ({
      action: r.action, avant: r.avant, apres: r.apres, survenuLe: iso(r.survenu_le) ?? '', auteurLibelle: r.auteur_libelle,
    })),
  };
}

export type IssueTache = { ok: true; id: number } | { ok: false; statut: number; motif: string };

async function tracer(
  q: RequeteTx, tacheId: number, action: ActionTache, avant: unknown, apres: unknown, auteur: Auteur, nom: string,
): Promise<void> {
  await q(
    `INSERT INTO gestion_tache_action (tache_id, action, avant, apres, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
    [tacheId, action, avant === null ? null : JSON.stringify(avant), apres === null ? null : JSON.stringify(apres),
      auteur.id, nom]);
}

/** Le collaborateur choisi, relu en base : actif ET avec l'accès Gestion. Jamais cru sur parole du navigateur. */
async function collaborateurValide(q: RequeteTx, id: number | null): Promise<Collaborateur | null> {
  if (id === null) return null;
  const { rows } = await q<Collaborateur>(`SELECT * FROM (${SQL_COLLABORATEURS}) c WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

async function evenementExiste(q: RequeteTx, id: number | null): Promise<boolean> {
  if (id === null) return true;
  const { rows } = await q(`SELECT 1 FROM gestion_evenement WHERE id = $1`, [id]);
  return rows.length > 0;
}

/** CRÉER une tâche sur un bien. La saisie a déjà été vérifiée par `erreurSaisie` (route). */
export async function creerTache(lotId: number, s: SaisieTache, auteur: Auteur): Promise<IssueTache> {
  return withTransaction(async (q) => {
    const lot = await q(`SELECT 1 FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
    if (lot.rows.length === 0) return { ok: false, statut: 404, motif: 'Bien introuvable.' };
    const c = await collaborateurValide(q, s.confieeA);
    if (c === null) return { ok: false, statut: 400, motif: 'Cette personne n’a pas l’accès Gestion.' };
    if (!await evenementExiste(q, s.evenementId)) return { ok: false, statut: 400, motif: 'Événement introuvable.' };
    const nom = await nomAuteur(q, auteur);
    const rappels = rappelsValides(s.rappels, s.heure !== null);
    const { rows } = await q<{ id: number }>(
      `INSERT INTO gestion_tache (lot_id, evenement_id, objet, note, jour, heure, rappels, confiee_a, confiee_a_libelle,
                                  cree_par, cree_par_libelle)
       VALUES ($1, $2, $3, $4, $5::date, $6::time, $7::jsonb, $8, $9, $10, $11) RETURNING id::int AS id`,
      [lotId, s.evenementId, s.objet.trim(), vide(s.note), s.jour, s.heure, JSON.stringify(rappels), c.id, c.libelle,
        auteur.id, nom]);
    const id = Number(rows[0].id);
    await tracer(q, id, 'creation', null, {
      objet: s.objet.trim(), jour: s.jour, heure: s.heure, confieeA: c.libelle, evenementId: s.evenementId, rappels,
    }, auteur, nom);
    return { ok: true, id };
  });
}

const vide = (x: string | null): string | null => ((x ?? '').trim() === '' ? null : (x ?? '').trim());

interface Courante {
  etat: EtatTache; objet: string; note: string | null; jour: string; heure: string | null; rappels: Rappel[];
  confiee_a: number | null; confiee_a_libelle: string; evenement_id: number | null;
}

async function lirePourGeste(q: RequeteTx, id: number): Promise<Courante | null> {
  const { rows } = await q<Courante>(
    `SELECT etat, objet, note, to_char(jour, 'YYYY-MM-DD') AS jour, to_char(heure, 'HH24:MI') AS heure, rappels,
            confiee_a::int AS confiee_a, confiee_a_libelle, evenement_id::int AS evenement_id
       FROM gestion_tache WHERE id = $1 FOR UPDATE`, [id]);
  return rows[0] ?? null;
}

const INTROUVABLE: IssueTache = { ok: false, statut: 404, motif: 'Tâche introuvable.' };
const DEJA_TERMINEE: IssueTache = { ok: false, statut: 409, motif: 'Cette tâche n’est plus à faire.' };

/** « FAITE » — par la personne connectée, maintenant. */
export async function marquerFaite(id: number, auteur: Auteur): Promise<IssueTache> {
  return withTransaction(async (q) => {
    const t = await lirePourGeste(q, id);
    if (t === null) return INTROUVABLE;
    if (t.etat !== 'a_faire') return DEJA_TERMINEE;
    const nom = await nomAuteur(q, auteur);
    await q(`UPDATE gestion_tache SET etat = 'faite', faite_le = now(), faite_par_libelle = $2, maj_le = now() WHERE id = $1`,
      [id, nom]);
    await tracer(q, id, 'faite', { etat: 'a_faire' }, { etat: 'faite' }, auteur, nom);
    return { ok: true, id };
  });
}

/** « ANNULER » — la tâche reste en base, grisée, avec sa trace. */
export async function annulerTache(id: number, auteur: Auteur): Promise<IssueTache> {
  return withTransaction(async (q) => {
    const t = await lirePourGeste(q, id);
    if (t === null) return INTROUVABLE;
    if (t.etat !== 'a_faire') return DEJA_TERMINEE;
    const nom = await nomAuteur(q, auteur);
    await q(`UPDATE gestion_tache SET etat = 'annulee', annulee_le = now(), annulee_par_libelle = $2, maj_le = now() WHERE id = $1`,
      [id, nom]);
    await tracer(q, id, 'annulation', { etat: 'a_faire' }, { etat: 'annulee' }, auteur, nom);
    return { ok: true, id };
  });
}

/** « ROUVRIR » une tâche faite ou annulée — le droit à l'erreur d'un clic sur « Faite ». */
export async function rouvrirTache(id: number, auteur: Auteur): Promise<IssueTache> {
  return withTransaction(async (q) => {
    const t = await lirePourGeste(q, id);
    if (t === null) return INTROUVABLE;
    if (t.etat === 'a_faire') return { ok: false, statut: 409, motif: 'Cette tâche est déjà à faire.' };
    const nom = await nomAuteur(q, auteur);
    await q(
      `UPDATE gestion_tache SET etat = 'a_faire', faite_le = NULL, faite_par_libelle = NULL,
              annulee_le = NULL, annulee_par_libelle = NULL, maj_le = now() WHERE id = $1`, [id]);
    await tracer(q, id, 'reouverture', { etat: t.etat }, { etat: 'a_faire' }, auteur, nom);
    return { ok: true, id };
  });
}

/**
 * « DÉCALER » — par un raccourci (+1 jour, +2 jours, +1 semaine) ou vers une date (et heure) choisie. La trace garde
 * l'ancienne ET la nouvelle date. Passer d'un rendez-vous à un repère (ou l'inverse) recalcule les rappels qui n'ont
 * plus de sens, et remet ceux par défaut s'il n'en reste aucun.
 */
export async function decalerTache(
  id: number, vers: { raccourci: RaccourciDecalage } | { jour: string; heure: string | null }, auteur: Auteur,
  maintenant: Date = new Date(),
): Promise<IssueTache> {
  return withTransaction(async (q) => {
    const t = await lirePourGeste(q, id);
    if (t === null) return INTROUVABLE;
    if (t.etat !== 'a_faire') return DEJA_TERMINEE;
    const jour = 'raccourci' in vers ? jourDecale(t.jour, vers.raccourci, maintenant) : vers.jour;
    const heure = 'raccourci' in vers ? t.heure : vers.heure;
    if (jour === t.jour && heure === t.heure) return { ok: false, statut: 400, motif: 'La date est la même.' };
    const nom = await nomAuteur(q, auteur);
    const avecHeure = heure !== null;
    let rappels = rappelsValides(t.rappels, avecHeure);
    if (rappels.length === 0 && (t.heure !== null) !== avecHeure) rappels = rappelsParDefaut(avecHeure);
    await q(
      `UPDATE gestion_tache SET jour = $2::date, heure = $3::time, rappels = $4::jsonb, maj_le = now() WHERE id = $1`,
      [id, jour, heure, JSON.stringify(rappels)]);
    await tracer(q, id, 'decalage', { jour: t.jour, heure: t.heure }, { jour, heure }, auteur, nom);
    return { ok: true, id };
  });
}

/**
 * « MODIFIER » — tout ce que la fenêtre de création propose. Seuls les champs qui CHANGENT sont tracés ; une
 * modification qui ne change rien n'écrit rien.
 */
export async function modifierTache(id: number, s: SaisieTache, auteur: Auteur): Promise<IssueTache> {
  return withTransaction(async (q) => {
    const t = await lirePourGeste(q, id);
    if (t === null) return INTROUVABLE;
    if (t.etat !== 'a_faire') return DEJA_TERMINEE;
    const c = await collaborateurValide(q, s.confieeA);
    if (c === null) return { ok: false, statut: 400, motif: 'Cette personne n’a pas l’accès Gestion.' };
    if (!await evenementExiste(q, s.evenementId)) return { ok: false, statut: 400, motif: 'Événement introuvable.' };
    const rappels = rappelsValides(s.rappels, s.heure !== null);
    const nouveau = {
      objet: s.objet.trim(), note: vide(s.note), jour: s.jour, heure: s.heure,
      confieeA: c.id, evenementId: s.evenementId, rappels,
    };
    const ancien = {
      objet: t.objet, note: t.note, jour: t.jour, heure: t.heure,
      confieeA: t.confiee_a === null ? null : Number(t.confiee_a),
      evenementId: t.evenement_id === null ? null : Number(t.evenement_id), rappels: t.rappels,
    };
    const avant: Record<string, unknown> = {};
    const apres: Record<string, unknown> = {};
    for (const k of Object.keys(nouveau) as (keyof typeof nouveau)[]) {
      if (JSON.stringify(nouveau[k]) !== JSON.stringify(ancien[k])) {
        avant[k] = k === 'confieeA' ? t.confiee_a_libelle : ancien[k];
        apres[k] = k === 'confieeA' ? c.libelle : nouveau[k];
      }
    }
    if (Object.keys(apres).length === 0) return { ok: true, id };
    const nom = await nomAuteur(q, auteur);
    await q(
      `UPDATE gestion_tache SET objet = $2, note = $3, jour = $4::date, heure = $5::time, confiee_a = $6,
              confiee_a_libelle = $7, evenement_id = $8, rappels = $9::jsonb, maj_le = now() WHERE id = $1`,
      [id, nouveau.objet, nouveau.note, nouveau.jour, nouveau.heure, c.id, c.libelle, nouveau.evenementId,
        JSON.stringify(rappels)]);
    await tracer(q, id, 'modification', avant, apres, auteur, nom);
    return { ok: true, id };
  });
}
