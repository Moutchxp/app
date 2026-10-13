import 'server-only';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { titreLogement } from './annuaireRecherche';
import type { Auteur } from './gestes';
import { lireDomainesAutorises } from './comptesGoogleRepo';
import { lireDomaines } from './googleCollaborateur';
import {
  collaborateursPourTache, jourDecale, rappelsParDefaut, rappelsValides, type CollaborateurTache,
  type ActionTache, type ChampTache, type EtatTache, type RaccourciDecalage, type Rappel, type SaisieTache, type Tache, type TraceTache,
} from './taches';
/* 🔴 LOT TACHES-1-BIS — les contacts du bien, copiés dans la tâche (migration 347). */
import { contactsTacheDisponible } from './schema';
import { contactsDuBienPourTache } from './contactsTacheRepo';
import { coordonneesLisibles, estFamille, type ContactSource, type ContactTache } from './contactsTache';

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

/**
 * 🔴🔴 À QUI L'ON PEUT CONFIER UNE TÂCHE — décision d'Arno du 13/10/2026 : compte ACTIF de l'application dont
 * l'adresse est dans NOTRE Workspace, accès Gestion ou non. La règle est `peutRecevoirUneTache` (taches.ts), la MÊME
 * pour la liste et pour la vérification ; les domaines sont lus à la source de la connexion Google.
 */
export type Collaborateur = CollaborateurTache;

const SQL_COMPTES = `
  SELECT id::int AS id, btrim(prenom || ' ' || nom) AS libelle, identifiant, actif,
         (role = 'administrateur' OR perm_gestion) AS "accesGestion"
    FROM admin_utilisateur
   WHERE actif
   ORDER BY lower(prenom), lower(nom), id`;

/** Les domaines de notre Workspace, à la source de la connexion Google (`gestion_config`). */
async function domainesWorkspace(): Promise<string[]> {
  return lireDomaines(await lireDomainesAutorises());
}

export async function listerCollaborateurs(moi: number | null = null): Promise<Collaborateur[]> {
  const { rows } = await query<Collaborateur & { actif: boolean; identifiant: string | null }>(SQL_COMPTES);
  return collaborateursPourTache(rows, await domainesWorkspace(), moi);
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
  nb_contacts: number;
}

/** Le nombre de contacts copiés — nommé seulement quand la 347 est là, sinon 0 (une sonde voyage avec sa donnée). */
const sqlTache = (avecContacts: boolean): string => SQL_TACHE.replace('__NB_CONTACTS__', avecContacts
  ? '(SELECT count(*)::int FROM gestion_tache_contact c WHERE c.tache_id = t.id AND c.retire_le IS NULL)'
  : '0');

const SQL_TACHE = `
  SELECT t.id::int AS id, t.lot_id::int AS lot_id, l.wippimmo_id AS lot_cle, l.adresse, l.commune,
         t.evenement_id::int AS evenement_id, e.reference AS ev_reference, e.objet AS ev_objet,
         t.objet, t.note, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
         t.rappels, t.etat, t.confiee_a::int AS confiee_a, t.confiee_a_libelle,
         t.cree_le, t.cree_par_libelle, t.maj_le, t.faite_le, t.faite_par_libelle, t.annulee_le, t.annulee_par_libelle,
         __NB_CONTACTS__ AS nb_contacts
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
    nbContacts: Number(r.nb_contacts ?? 0),
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
  const SQL = sqlTache(await contactsTacheDisponible());
  const [o, t] = await Promise.all([
    query<LigneTache>(
      `${SQL} WHERE t.etat = 'a_faire' AND ($1::bigint IS NULL OR t.lot_id = $1)
        ORDER BY t.jour, t.heure NULLS FIRST, t.id LIMIT ${OUVERTES_MAX + 1}`, [lotId]),
    query<LigneTache>(
      `${SQL} WHERE t.etat <> 'a_faire' AND ($1::bigint IS NULL OR t.lot_id = $1)
        ORDER BY coalesce(t.faite_le, t.annulee_le, t.maj_le) DESC, t.id DESC LIMIT ${TERMINEES_MAX}`, [lotId]),
  ]);
  const tronque = o.rows.length > OUVERTES_MAX;
  return { taches: [...o.rows.slice(0, OUVERTES_MAX), ...t.rows].map(versTache), tronque };
}

export async function lireTache(id: number): Promise<{ tache: Tache; traces: TraceTache[]; contacts: ContactTache[] } | null> {
  const avecContacts = await contactsTacheDisponible();
  const { rows } = await query<LigneTache>(`${sqlTache(avecContacts)} WHERE t.id = $1`, [id]);
  if (rows.length === 0) return null;
  const tr = await query<{ action: ActionTache; avant: Record<string, unknown> | null; apres: Record<string, unknown> | null; survenu_le: Date; auteur_libelle: string }>(
    `SELECT action, avant, apres, survenu_le, auteur_libelle FROM gestion_tache_action
      WHERE tache_id = $1 ORDER BY survenu_le, id`, [id]);
  return {
    tache: versTache(rows[0]),
    traces: tr.rows.map((r) => ({
      action: r.action, avant: r.avant, apres: r.apres, survenuLe: iso(r.survenu_le) ?? '', auteurLibelle: r.auteur_libelle,
    })),
    contacts: avecContacts ? await contactsCopies(id) : [],
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT TACHES-1-BIS — LES CONTACTS COPIÉS DANS UNE TÂCHE (migration 347)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

interface LigneContact {
  cle: string; famille: string; nom: string; qualite: string | null; organisation: string | null; adresse: string | null;
  coordonnees: unknown; copie_le: Date;
}

/** Les contacts ACTIFS d'une tâche, tels qu'ils ont été copiés (et quand). */
export async function contactsCopies(tacheId: number, q: RequeteTx = query): Promise<ContactTache[]> {
  const { rows } = await q<LigneContact>(
    `SELECT cle, famille, nom, qualite, organisation, adresse, coordonnees, copie_le
       FROM gestion_tache_contact WHERE tache_id = $1 AND retire_le IS NULL ORDER BY rang, id`, [tacheId]);
  return rows.filter((r) => estFamille(r.famille)).map((r) => ({
    cle: r.cle, famille: r.famille as ContactTache['famille'], nom: r.nom, qualite: r.qualite,
    organisation: r.organisation, adresse: r.adresse, coordonnees: coordonneesLisibles(r.coordonnees),
    copieLe: iso(r.copie_le) ?? '',
  }));
}

/**
 * ALIGNE les contacts actifs d'une tâche sur les clés cochées, dans la transaction du geste :
 *   · une clé nouvelle ⇒ une COPIE datée, prise dans la fiche d'aujourd'hui (`sources`), et une trace ;
 *   · une clé décochée ⇒ la ligne est marquée RETIRÉE (jamais effacée), et une trace ;
 *   · une clé déjà là ⇒ rien : sa copie garde sa date (« Mettre à jour » est un geste à part) ;
 *   · une clé inconnue de la fiche et absente de la tâche ⇒ ignorée (on ne copie pas ce qu'on ne peut pas lire).
 */
async function synchroniserContacts(
  q: RequeteTx, tacheId: number, cles: readonly string[], sources: readonly ContactSource[], auteur: Auteur, nom: string,
): Promise<void> {
  const actifs = await contactsCopies(tacheId, q);
  const voulues = new Set(cles);
  for (const c of actifs) {
    if (voulues.has(c.cle)) continue;
    await q(`UPDATE gestion_tache_contact SET retire_le = now(), retire_par_libelle = $3
              WHERE tache_id = $1 AND cle = $2 AND retire_le IS NULL`, [tacheId, c.cle, nom]);
    await tracer(q, tacheId, 'modification', { contact: c.cle }, { contactRetire: c.nom }, auteur, nom);
  }
  const presentes = new Set(actifs.map((c) => c.cle));
  let rang = actifs.length;
  for (const cle of cles) {
    if (presentes.has(cle)) continue;
    const s = sources.find((x) => x.cle === cle);
    if (s === undefined) continue;
    rang += 1;
    await q(
      `INSERT INTO gestion_tache_contact (tache_id, cle, famille, nom, qualite, organisation, adresse, coordonnees, rang,
                                          ajoute_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
      [tacheId, s.cle, s.famille, s.nom, s.qualite, s.organisation, s.adresse, JSON.stringify(s.coordonnees), rang, nom]);
    await tracer(q, tacheId, 'modification', null, { contactAjoute: s.nom }, auteur, nom);
  }
}

/** Les contacts du bien, lus AVANT la transaction (la lecture est longue et n'écrit rien). `null` = ne rien toucher. */
async function sourcesPour(lotId: number, s: SaisieTache): Promise<ContactSource[] | null> {
  if (s.contacts === undefined || !(await contactsTacheDisponible())) return null;
  return contactsDuBienPourTache(lotId);
}

/**
 * « METTRE À JOUR » la copie d'un contact : la fiche a changé depuis, on recopie ce qu'elle dit aujourd'hui, avec
 * la date du jour, et on le trace. Un contact qui n'est plus lié au bien ne se met pas à jour — sa copie reste.
 */
export async function actualiserContact(id: number, cle: string, auteur: Auteur): Promise<IssueTache> {
  if (!(await contactsTacheDisponible())) return { ok: false, statut: 503, motif: 'Contacts non installés (migration 347).' };
  const { rows } = await query<{ lot_id: number }>(`SELECT lot_id::int AS lot_id FROM gestion_tache WHERE id = $1`, [id]);
  if (rows.length === 0) return INTROUVABLE;
  const s = (await contactsDuBienPourTache(Number(rows[0].lot_id))).find((x) => x.cle === cle);
  if (s === undefined) return { ok: false, statut: 409, motif: 'Ce contact n’est plus lié au bien : ses coordonnées restent celles copiées.' };
  return withTransaction(async (q) => {
    const t = await lirePourGeste(q, id);
    if (t === null) return INTROUVABLE;
    const nom = await nomAuteur(q, auteur);
    const r = await q(
      `UPDATE gestion_tache_contact SET nom = $3, qualite = $4, organisation = $5, adresse = $6, coordonnees = $7::jsonb,
              famille = $8, copie_le = now()
        WHERE tache_id = $1 AND cle = $2 AND retire_le IS NULL`,
      [id, cle, s.nom, s.qualite, s.organisation, s.adresse, JSON.stringify(s.coordonnees), s.famille]);
    if ((r.rowCount ?? 0) === 0) return { ok: false, statut: 404, motif: 'Ce contact n’est pas dans la tâche.' };
    await tracer(q, id, 'modification', { contact: cle }, { contactMisAJour: s.nom }, auteur, nom);
    return { ok: true, id };
  });
}

export type IssueTache = { ok: true; id: number }
  /** `champ` : le champ de la fenêtre à qui le refus se rattache (affiché À CÔTÉ de lui), quand il y en a un. */
  | { ok: false; statut: number; motif: string; champ?: ChampTache };

async function tracer(
  q: RequeteTx, tacheId: number, action: ActionTache, avant: unknown, apres: unknown, auteur: Auteur, nom: string,
): Promise<void> {
  await q(
    `INSERT INTO gestion_tache_action (tache_id, action, avant, apres, auteur_id, auteur_libelle)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
    [tacheId, action, avant === null ? null : JSON.stringify(avant), apres === null ? null : JSON.stringify(apres),
      auteur.id, nom]);
}

/** Le collaborateur choisi, relu en base et passé à LA règle (`peutRecevoirUneTache`). Jamais cru sur parole. */
async function collaborateurValide(q: RequeteTx, id: number | null): Promise<Collaborateur | null> {
  if (id === null) return null;
  const { rows } = await q<Collaborateur & { actif: boolean; identifiant: string | null }>(
    `SELECT * FROM (${SQL_COMPTES}) c WHERE c.id = $1`, [id]);
  return collaborateursPourTache(rows, await domainesWorkspace(), null)[0] ?? null;
}

async function evenementExiste(q: RequeteTx, id: number | null): Promise<boolean> {
  if (id === null) return true;
  const { rows } = await q(`SELECT 1 FROM gestion_evenement WHERE id = $1`, [id]);
  return rows.length > 0;
}

/** CRÉER une tâche sur un bien. La saisie a déjà été vérifiée par `erreurSaisie` (route). */
export async function creerTache(lotId: number, s: SaisieTache, auteur: Auteur): Promise<IssueTache> {
  const sources = await sourcesPour(lotId, s);
  return withTransaction(async (q) => {
    const lot = await q(`SELECT 1 FROM gestion_annuaire_lot WHERE id = $1`, [lotId]);
    if (lot.rows.length === 0) return { ok: false, statut: 404, motif: 'Bien introuvable.' };
    const c = await collaborateurValide(q, s.confieeA);
    if (c === null) return { ok: false, statut: 400, motif: 'Cette personne n’a pas de compte actif avec une adresse de notre Workspace.', champ: 'confieeA' };
    if (!await evenementExiste(q, s.evenementId)) return { ok: false, statut: 400, motif: 'Événement introuvable.', champ: 'evenementId' };
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
    if (sources !== null) await synchroniserContacts(q, id, s.contacts ?? [], sources, auteur, nom);
    return { ok: true, id };
  });
}

const vide = (x: string | null): string | null => ((x ?? '').trim() === '' ? null : (x ?? '').trim());

interface Courante {
  lot_id: number;
  etat: EtatTache; objet: string; note: string | null; jour: string; heure: string | null; rappels: Rappel[];
  confiee_a: number | null; confiee_a_libelle: string; evenement_id: number | null;
}

async function lirePourGeste(q: RequeteTx, id: number): Promise<Courante | null> {
  const { rows } = await q<Courante>(
    `SELECT lot_id::int AS lot_id, etat, objet, note, to_char(jour, 'YYYY-MM-DD') AS jour, to_char(heure, 'HH24:MI') AS heure, rappels,
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
  const lot = await query<{ lot_id: number }>(`SELECT lot_id::int AS lot_id FROM gestion_tache WHERE id = $1`, [id]);
  const sources = lot.rows.length === 0 ? null : await sourcesPour(Number(lot.rows[0].lot_id), s);
  return withTransaction(async (q) => {
    const t = await lirePourGeste(q, id);
    if (t === null) return INTROUVABLE;
    if (t.etat !== 'a_faire') return DEJA_TERMINEE;
    const c = await collaborateurValide(q, s.confieeA);
    if (c === null) return { ok: false, statut: 400, motif: 'Cette personne n’a pas de compte actif avec une adresse de notre Workspace.', champ: 'confieeA' };
    if (!await evenementExiste(q, s.evenementId)) return { ok: false, statut: 400, motif: 'Événement introuvable.', champ: 'evenementId' };
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
    const nom = await nomAuteur(q, auteur);
    if (sources !== null) await synchroniserContacts(q, id, s.contacts ?? [], sources, auteur, nom);
    if (Object.keys(apres).length === 0) return { ok: true, id };
    await q(
      `UPDATE gestion_tache SET objet = $2, note = $3, jour = $4::date, heure = $5::time, confiee_a = $6,
              confiee_a_libelle = $7, evenement_id = $8, rappels = $9::jsonb, maj_le = now() WHERE id = $1`,
      [id, nouveau.objet, nouveau.note, nouveau.jour, nouveau.heure, c.id, c.libelle, nouveau.evenementId,
        JSON.stringify(rappels)]);
    await tracer(q, id, 'modification', avant, apres, auteur, nom);
    return { ok: true, id };
  });
}
