import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { chargerConfigGestion } from './config';
import { titreLogement } from './annuaireRecherche';
import type { Auteur } from './gestes';
import {
  acceptationInitiale, erreurMotif, verdictLien,
  type AcceptationTache, type EtatMail, type StatutAcceptation, type TacheRecue, type VerdictLien,
} from './acceptationTache';
import { transportParDefaut, type TransportDemande } from './envoiDemandeTache';
import { peutRecevoirUneTache } from './taches';
import { lireDomainesAutorises } from './comptesGoogleRepo';
import { lireDomaines } from './googleCollaborateur';
/* 🔴 LOT TACHES-AGENDA — accepter ou refuser change la place de la tâche dans l'agenda : on le marque dans la transaction. */
import { marquerASynchroniser } from './agendaSynchroRepo';
/* 🔴 LOT GESTION-INVITATIONS-TACHES — plusieurs invités par tâche (migration 365) : une demande courante PAR INVITÉ. */
import { invitesTacheDisponible } from './schema';
/* 🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — le contenu du mail (invitation, récapitulatif), ses pièces jointes. */
import { adresseDuDemandeur, destinatairesConfirmation, messageDeLaDemande, type LecteurPiecesTache } from './mailTacheRepo';

/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — LE DÉPÔT DES DEMANDES D'ACCEPTATION (migration 349) ══════════════════════════════
 *
 * 🔴 TROIS RÈGLES :
 *   ① une demande ne s'efface pas : la remplacer (renvoyer, réattribuer, changer la date) la marque « remplacée », et
 *     son lien cesse AUSSITÔT d'agir ; tout est tracé dans l'historique de la tâche ;
 *   ② le JETON n'existe en clair que dans le mail : la base ne garde que son empreinte SHA-256 ; il n'agit que pour
 *     le destinataire, une fois, avant son expiration (`verdictLien`, règle pure) ;
 *   ③ RIEN NE PART tant que le réglage « Envoyer les demandes d'acceptation par mail » est désactivé (défaut) : la
 *     demande existe, se voit dans l'application avec « mail non envoyé (envoi désactivé) », et c'est tout.
 */

export const empreinteJeton = (jeton: string): string => createHash('sha256').update(jeton).digest('hex');

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE RÉGLAGE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ReglageTaches { envoiMail: boolean; dureeLienJours: number; modifieLe: string | null; modifieParLibelle: string | null }

export async function lireReglageTaches(q: RequeteTx = query): Promise<ReglageTaches> {
  const { rows } = await q<{ e: boolean; d: number; le: Date; par: string }>(
    `SELECT envoi_mail_acceptation AS e, duree_lien_jours AS d, modifie_le AS le, modifie_par_libelle AS par
       FROM gestion_tache_reglage WHERE id = 1`);
  const r = rows[0];
  // Ligne absente : envoi COUPÉ (fermé par défaut), 7 jours.
  return r === undefined ? { envoiMail: false, dureeLienJours: 7, modifieLe: null, modifieParLibelle: null }
    : { envoiMail: r.e === true, dureeLienJours: Number(r.d), modifieLe: iso(r.le), modifieParLibelle: r.par };
}

export async function modifierReglageTaches(envoiMail: boolean, auteur: Auteur, nom: string): Promise<void> {
  await withTransaction(async (q) => {
    const avant = await lireReglageTaches(q);
    await q(`UPDATE gestion_tache_reglage SET envoi_mail_acceptation = $1, modifie_le = now(), modifie_par_libelle = $2 WHERE id = 1`,
      [envoiMail, nom]);
    console.info('[taches/reglage] envoi des demandes par mail : %s → %s, par %s (compte %s)',
      avant.envoiMail, envoiMail, nom, auteur.id ?? 'secours');
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   POSER UNE DEMANDE (dans la transaction du geste qui la provoque)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

async function tracer(q: RequeteTx, tacheId: number, avant: unknown, apres: unknown, auteur: Auteur, nom: string): Promise<void> {
  await q(
    `INSERT INTO gestion_tache_action (tache_id, action, avant, apres, auteur_id, auteur_libelle)
     VALUES ($1, 'modification', $2::jsonb, $3::jsonb, $4, $5)`,
    [tacheId, avant === null ? null : JSON.stringify(avant), JSON.stringify(apres), auteur.id, nom]);
}

export interface DemandePosee {
  demandeId: number; statut: StatutAcceptation; jeton: string | null;
  /** 🔴 LOT GESTION-INVITATIONS-TACHES — l'invité à qui elle est adressée (migration 365), et son nom. */
  inviteId?: number | null; destinataireLibelle?: string;
  /**
   * 🔴 LOT GESTION-DECALER-TACHE — la date d'AVANT, quand la demande est une RELANCE après un décalage (même invité,
   * nouvelle date) : son mail est alors « Tâche déplacée » (ancienne date barrée → nouvelle). Absente pour une
   * invitation neuve (nouvel invité) : son mail ne dit rien de l'ancienne date.
   */
  ancienneDate?: AncienneDate;
}

/** 🔴 LOT GESTION-DECALER-TACHE — la date d'une tâche AVANT son décalage. */
export interface AncienneDate { jour: string; heure: string | null; dureeMinutes: number | null }

/** Pourquoi une demande est posée (colonne `raison`, migration 365). */
export type RaisonDemande = 'creation' | 'ajout' | 'relance' | 'renvoi' | 'destinataire_change';

/**
 * POSE la demande COURANTE d'une tâche, en remplaçant la précédente. Confiée à soi-même ⇒ « Acceptée » d'office ;
 * sinon « En attente », avec un jeton neuf (rendu en clair UNE fois, pour le mail).
 * 🔴 LOT GESTION-INVITATIONS-TACHES — avec `inviteId` (migration 365), la demande est celle de CET invité : seule SA
 * demande précédente est remplacée, celles des autres invités ne bougent pas.
 */
export async function poserDemande(q: RequeteTx, o: {
  tacheId: number; confieeA: number | null; confieeLibelle: string; auteur: Auteur; nom: string; motifTrace?: string;
  inviteId?: number | null; raison?: RaisonDemande;
  /** 🔴 LOT GESTION-DECALER-TACHE — la date d'avant, pour une relance après décalage (mail « Tâche déplacée »). */
  ancienneDate?: AncienneDate;
}): Promise<DemandePosee> {
  const deplacement = o.ancienneDate !== undefined ? { ancienneDate: o.ancienneDate } : {};
  const parInvite = o.inviteId !== undefined && o.inviteId !== null;
  if (parInvite) {
    await q(`UPDATE gestion_tache_demande SET statut = 'remplacee', remplacee_le = now()
              WHERE invite_id = $1 AND statut <> 'remplacee'`, [o.inviteId]);
  } else {
    await q(`UPDATE gestion_tache_demande SET statut = 'remplacee', remplacee_le = now()
              WHERE tache_id = $1 AND statut <> 'remplacee'`, [o.tacheId]);
  }
  const colonnes = parInvite ? ', invite_id, raison' : '';
  const extra = parInvite ? [o.inviteId, o.raison ?? null] : [];
  const statut = acceptationInitiale(o.confieeA, o.auteur.id);
  const email = o.confieeA === null ? null
    : (await q<{ e: string }>(`SELECT identifiant AS e FROM admin_utilisateur WHERE id = $1`, [o.confieeA])).rows[0]?.e ?? null;
  if (statut === 'acceptee') {
    const { rows } = await q<{ id: number }>(
      `INSERT INTO gestion_tache_demande (tache_id, destinataire_id, destinataire_libelle, destinataire_email, demandeur_id,
         demandeur_libelle, statut, automatique, repondu_le, repondu_par_libelle${colonnes})
       VALUES ($1, $2, $3, $4, $5, $6, 'acceptee', true, now(), $6${parInvite ? ', $7, $8' : ''}) RETURNING id::int AS id`,
      [o.tacheId, o.confieeA, o.confieeLibelle, email, o.auteur.id, o.nom, ...extra]);
    await tracer(q, o.tacheId, null, { acceptation: 'acceptee', automatique: true }, o.auteur, o.nom);
    return { demandeId: Number(rows[0].id), statut, jeton: null, inviteId: o.inviteId ?? null, destinataireLibelle: o.confieeLibelle, ...deplacement };
  }
  const reglage = await lireReglageTaches(q);
  const jeton = randomBytes(32).toString('base64url');
  const { rows } = await q<{ id: number }>(
    `INSERT INTO gestion_tache_demande (tache_id, destinataire_id, destinataire_libelle, destinataire_email, demandeur_id,
       demandeur_libelle, statut, jeton_empreinte, expire_le${colonnes})
     VALUES ($1, $2, $3, $4, $5, $6, 'en_attente', $7, now() + ($8::int * interval '1 day')${parInvite ? ', $9, $10' : ''}) RETURNING id::int AS id`,
    [o.tacheId, o.confieeA, o.confieeLibelle, email, o.auteur.id, o.nom, empreinteJeton(jeton), reglage.dureeLienJours, ...extra]);
  await tracer(q, o.tacheId, null, { demandeAcceptation: o.confieeLibelle, ...(o.motifTrace ? { raison: o.motifTrace } : {}) }, o.auteur, o.nom);
  return { demandeId: Number(rows[0].id), statut, jeton, inviteId: o.inviteId ?? null, destinataireLibelle: o.confieeLibelle, ...deplacement };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ENVOYER LE MAIL (après la transaction ; un échec n'annule pas la demande, il se DIT)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export async function envoyerDemande(
  demandeId: number, jeton: string, transport: TransportDemande | null = null, maintenant: Date = new Date(),
  lecteur?: LecteurPiecesTache,
  /** 🔴 LOT GESTION-DECALER-TACHE — relance après décalage : mail « Tâche déplacée » (ancienne date barrée). */
  ancienneDate?: AncienneDate,
): Promise<EtatMail> {
  const reglage = await lireReglageTaches();
  const marquer = async (etat: EtatMail, erreur: string | null = null, gmailId: string | null = null) => {
    await query(`UPDATE gestion_tache_demande SET mail_etat = $2, mail_le = now(), mail_erreur = $3, gmail_message_id = $4 WHERE id = $1`,
      [demandeId, etat, erreur, gmailId]);
    return etat;
  };
  // 🔴 RÉGLAGE DÉSACTIVÉ (défaut) : RIEN NE PART, jamais. La demande existe et le dit (« envoi désactivé »).
  if (!reglage.envoiMail) return marquer('desactive');
  // Réglage activé : le transport réel — sauf sous les tests, où il est TOUJOURS factice (`transportParDefaut`).
  const t = transport ?? transportParDefaut();
  /* 🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — le mail structuré par sections (`mailTache.ts`), ses pièces jointes ou
     leurs liens signés ; la MÊME adresse de base que l'agenda (jamais un tunnel temporaire ; défaut localhost). */
  const config = await chargerConfigGestion();
  /* 🔴 LOT GESTION-DECALER-TACHE (Arno) — la boîte gestion@ ne reçoit jamais d'invitation : rien ne part vers elle. */
  const vers = (await query<{ e: string | null }>(`SELECT destinataire_email AS e FROM gestion_tache_demande WHERE id = $1`, [demandeId])).rows[0]?.e ?? '';
  if (vers.trim().toLowerCase() === config.adresseGestion.trim().toLowerCase()) return marquer('aucun');
  const r0 = await messageDeLaDemande({ demandeId, sorte: 'invitation', jeton, de: config.adresseGestion, lecteur, maintenant, ancienneDate });
  if (!r0.ok) return r0.motif === 'Demande introuvable.' ? 'aucun' : marquer('echec', r0.motif);
  const r = await t.envoyer(r0.m.message);
  if (!r.ok) return marquer('echec', r.motif);
  return marquer(r.factice ? 'factice' : 'envoye', null, r.id);
}

/**
 * 🔴 LOT GESTION-INVITATIONS-TACHES (lot 3) — LE RÉCAPITULATIF, après une acceptation : la même structure que
 * l'invitation, avec l'état connu des autres invités et « Tâche acceptée, ajoutée à votre agenda ».
 * Il suit le CANAL de l'invitation : réglage d'envoi actif ET invitation réellement partie (ou préparée en essai) —
 * jamais pour une demande acceptée d'office, ni quand l'invitation elle-même n'est pas partie. Ne lève jamais ; le
 * résultat est tracé dans l'historique de la tâche.
 */
export async function envoyerRecapitulatif(
  demandeId: number, agenda: 'ajoutee' | 'bientot' | 'sans_agenda', transport: TransportDemande | null = null,
  lecteur?: LecteurPiecesTache, maintenant: Date = new Date(),
): Promise<EtatMail | null> {
  try {
    const reglage = await lireReglageTaches();
    if (!reglage.envoiMail) return null;
    const { rows } = await query<{ tache_id: number; statut: string; automatique: boolean; mail_etat: string; destinataire_id: number | null; destinataire_libelle: string }>(
      `SELECT tache_id::int AS tache_id, statut, automatique, mail_etat, destinataire_id::int AS destinataire_id, destinataire_libelle
         FROM gestion_tache_demande WHERE id = $1`, [demandeId]);
    const d = rows[0];
    if (d === undefined || d.statut !== 'acceptee' || d.automatique || !['envoye', 'factice'].includes(d.mail_etat)) return null;
    const config = await chargerConfigGestion();
    const m = await messageDeLaDemande({
      demandeId, sorte: 'recapitulatif', agenda, de: config.adresseGestion, lecteur, maintenant, dureeLienJours: reglage.dureeLienJours,
    });
    const auteur: Auteur = { id: d.destinataire_id, libelle: d.destinataire_libelle };
    if (!m.ok) {
      await tracer(query, Number(d.tache_id), null, { recapitulatif: d.destinataire_libelle, etat: 'echec', erreur: m.motif }, auteur, d.destinataire_libelle);
      return 'echec';
    }
    const r = await (transport ?? transportParDefaut()).envoyer(m.m.message);
    const etat: EtatMail = !r.ok ? 'echec' : r.factice ? 'factice' : 'envoye';
    await tracer(query, Number(d.tache_id), null,
      { recapitulatif: d.destinataire_libelle, etat, ...(r.ok ? {} : { erreur: r.motif }) }, auteur, d.destinataire_libelle);
    return etat;
  } catch (e) {
    console.error('[taches/acceptation] récapitulatif impossible', e);
    return 'echec';
  }
}

/**
 * ══ 🔴🔴 LOT GESTION-CONFIRMATION-ACCEPTATION (17/10/2026) — LE MAIL DE CONFIRMATION D'UNE ACCEPTATION ═════════════
 *
 * ARNO : « Quand un invité accepte une tâche, un mail de confirmation part à DEUX destinataires : la boîte
 * gestion@criterimmo.fr, et l'adresse e-mail du collaborateur qui a créé / envoyé l'invitation. Un mail par
 * acceptation. Pas de doublon : même adresse, un seul envoi. »
 *
 * Il part dès qu'un invité ACCEPTE (jamais pour une acceptation d'office, qui n'est pas une réponse), sous le réglage
 * « Envoyer les demandes d'acceptation par mail » — rien ne part tant qu'il est coupé. Ne lève jamais ; tracé dans
 * l'historique de la tâche (destinataires, état, et « sans adresse du créateur » le cas échéant).
 */
export async function envoyerConfirmationAcceptation(
  demandeId: number, transport: TransportDemande | null = null, lecteur?: LecteurPiecesTache, maintenant: Date = new Date(),
): Promise<EtatMail | null> {
  try {
    const reglage = await lireReglageTaches();
    if (!reglage.envoiMail) return null;
    const { rows } = await query<{ tache_id: number; statut: string; automatique: boolean; destinataire_id: number | null; destinataire_libelle: string }>(
      `SELECT tache_id::int AS tache_id, statut, automatique, destinataire_id::int AS destinataire_id, destinataire_libelle
         FROM gestion_tache_demande WHERE id = $1`, [demandeId]);
    const d = rows[0];
    /* 🔴 LOT GESTION-DECALER-TACHE — à chaque ACCEPTATION et à chaque REFUS (jamais pour une acceptation d'office). */
    if (d === undefined || (d.statut !== 'acceptee' && d.statut !== 'refusee') || d.automatique) return null;
    const config = await chargerConfigGestion();
    const createur = await adresseDuDemandeur(demandeId);
    const { a, sansCreateur } = destinatairesConfirmation(config.adresseGestion, createur?.email ?? null);
    const auteur: Auteur = { id: d.destinataire_id, libelle: d.destinataire_libelle };
    const trace = (etat: EtatMail, erreur?: string) => tracer(query, Number(d.tache_id), null, {
      confirmationAcceptation: d.destinataire_libelle, a, etat, ...(d.statut === 'refusee' ? { refus: true } : {}), ...(sansCreateur ? { sansAdresseCreateur: true } : {}),
      ...(erreur ? { erreur } : {}),
    }, auteur, d.destinataire_libelle);
    const m = await messageDeLaDemande({
      demandeId, sorte: 'confirmation', de: config.adresseGestion, a, lecteur, maintenant, dureeLienJours: reglage.dureeLienJours,
    });
    if (!m.ok) { await trace('echec', m.motif); return 'echec'; }
    const r = await (transport ?? transportParDefaut()).envoyer(m.m.message);
    const etat: EtatMail = !r.ok ? 'echec' : r.factice ? 'factice' : 'envoye';
    await trace(etat, r.ok ? undefined : r.motif);
    return etat;
  } catch (e) {
    console.error('[taches/acceptation] confirmation impossible', e);
    return 'echec';
  }
}

/** 🔴 LOT GESTION-DECALER-TACHE — le même envoi, nommé pour ce qu'il fait : la confirmation d'une RÉPONSE (acceptée ou refusée). */
export const envoyerConfirmationReponse = envoyerConfirmationAcceptation;

/** La place dans l'agenda après une acceptation, d'après la phrase de la synchronisation existante. PUR. */
export function agendaApresAcceptation(phraseSynchro: string): 'ajoutee' | 'bientot' | 'sans_agenda' {
  if (phraseSynchro.includes('Agenda Google à jour')) return 'ajoutee';
  if (phraseSynchro.includes('resynchroniser')) return 'bientot';
  return 'sans_agenda';
}

/**
 * APRÈS UN GESTE QUI A POSÉ UNE DEMANDE EN ATTENTE : préparer (et, réglage activé, envoyer) son mail. Ne lève jamais :
 * un échec d'envoi n'annule pas la tâche, il se lit sur la demande (« mail non envoyé »).
 */
export async function envoyerSiBesoin(demande: DemandePosee | null | undefined): Promise<EtatMail | null> {
  if (!demande || demande.jeton === null) return null;
  try {
    return await envoyerDemande(demande.demandeId, demande.jeton, null, new Date(), undefined, demande.ancienneDate);
  } catch (e) {
    console.error('[taches/acceptation] préparation du mail impossible', e);
    await query(`UPDATE gestion_tache_demande SET mail_etat = 'echec', mail_le = now(), mail_erreur = $2 WHERE id = $1`,
      [demande.demandeId, e instanceof Error ? e.message.slice(0, 300) : 'erreur']).catch(() => {});
    return 'echec';
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   RÉPONDRE : ACCEPTER, REFUSER (motif obligatoire)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type IssueReponse =
  | { ok: true; statut: StatutAcceptation; message: string; tacheId?: number; demandeId?: number }
  | { ok: false; statut: number; message: string; cause?: Exclude<VerdictLien, { ok: true }>['cause'] };

interface LigneDemande {
  id: number; tache_id: number; statut: string; destinataire_id: number | null; destinataire_libelle: string | null;
  expire_le: Date | null; utilise_le: Date | null; tache_etat: string; invite_retire?: boolean | null;
}

/**
 * RÉPONDRE à une demande — par le JETON du mail, ou (depuis « Mes tâches », sans jeton) par la tâche, pour son
 * destinataire connecté. Les mêmes refus dans les deux cas, sauf l'expiration, qui ne concerne que le lien.
 *
 * 🔴 LOT GESTION-ACCEPTATION (16/10/2026) — `identiteParJeton` : le lien du mail suffit, SANS connexion. Le jeton (32
 * octets aléatoires, empreinte seule en base) est propre à CETTE demande, donc à ce destinataire et à cette tâche : c'est
 * lui qui désigne la personne qui répond (le destinataire de la demande). Les autres règles ne changent pas : une seule
 * fois (verrou de ligne + `utilise_le`), avant l'expiration, jamais une demande remplacée ou une tâche terminée.
 */
export async function repondreDemande(o: {
  jeton?: string | null; tacheId?: number | null; decision: 'accepter' | 'refuser'; motif?: string | null;
  utilisateur: Auteur | null; nom: string | null; maintenant?: Date; identiteParJeton?: boolean;
}): Promise<IssueReponse> {
  if (o.decision === 'refuser') {
    const e = erreurMotif(o.motif);
    if (e !== null) return { ok: false, statut: 400, message: e };
  }
  const avecInvites = await invitesTacheDisponible();
  return withTransaction(async (q) => {
    const parJeton = (o.jeton ?? '').trim() !== '';
    /* 🔴 LOT GESTION-INVITATIONS-TACHES — sans jeton (« Mes tâches »), une tâche peut avoir PLUSIEURS demandes courantes
       (une par invité) : on prend celle de la personne connectée, jamais celle d'un autre invité. */
    const { rows } = await q<LigneDemande>(
      `SELECT d.id::int AS id, d.tache_id::int AS tache_id, d.statut, d.destinataire_id::int AS destinataire_id,
              d.destinataire_libelle, d.expire_le, d.utilise_le, t.etat AS tache_etat,
              ${avecInvites ? '(i.retire_le IS NOT NULL)' : 'false'} AS invite_retire
         FROM gestion_tache_demande d JOIN gestion_tache t ON t.id = d.tache_id
         ${avecInvites ? 'LEFT JOIN gestion_tache_invite i ON i.id = d.invite_id' : ''}
        WHERE ${parJeton ? 'd.jeton_empreinte = $1'
          : `d.tache_id = $1 AND d.statut <> 'remplacee'${avecInvites ? ' AND d.destinataire_id IS NOT DISTINCT FROM $2::bigint' : ''}`}
        FOR UPDATE OF d`,
      parJeton ? [empreinteJeton(o.jeton ?? '')]
        : avecInvites ? [o.tacheId ?? 0, o.utilisateur?.id ?? null] : [o.tacheId ?? 0]);
    const d = rows[0] ?? null;
    // Par le lien seul (sans connexion) : la personne qui répond EST le destinataire désigné par le jeton.
    const parLien = parJeton && o.identiteParJeton === true;
    const utilisateur: Auteur = parLien
      ? { id: d?.destinataire_id ?? null, libelle: d?.destinataire_libelle ?? '' }
      : o.utilisateur ?? { id: null, libelle: '' };
    const nom = parLien ? (d?.destinataire_libelle ?? '') : (o.nom ?? '');
    const v: VerdictLien = verdictLien(
      d === null ? null : {
        statut: d.statut, destinataireId: d.destinataire_id,
        expireLe: parJeton ? iso(d.expire_le) : null, utiliseLe: iso(d.utilise_le), inviteRetire: d.invite_retire === true,
      },
      d?.tache_etat ?? null, utilisateur.id, o.maintenant ?? new Date());
    if (!v.ok) return { ok: false, statut: v.cause === 'autre_personne' ? 403 : 409, message: v.message, cause: v.cause };
    const statut: StatutAcceptation = o.decision === 'accepter' ? 'acceptee' : 'refusee';
    const motif = o.decision === 'refuser' ? (o.motif ?? '').trim() : null;
    await q(
      `UPDATE gestion_tache_demande SET statut = $2, repondu_le = now(), repondu_par_libelle = $3, motif = $4, utilise_le = now()
        WHERE id = $1`, [d!.id, statut, nom, motif]);
    await tracer(q, d!.tache_id, { acceptation: 'en_attente' },
      { acceptation: statut, ...(motif ? { motif } : {}), ...(parLien ? { canal: 'lien du mail' } : {}) }, utilisateur, nom);
    await marquerASynchroniser(q, Number(d!.tache_id));
    return {
      ok: true, statut, tacheId: Number(d!.tache_id), demandeId: Number(d!.id),
      message: statut === 'acceptee' ? 'Tâche acceptée. Merci !' : 'Refus enregistré : la personne qui vous l’a confiée va la réattribuer.',
    };
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   CE QUE LA PAGE « MES TÂCHES » LIT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type { TacheRecue } from './acceptationTache';

const SQL_RECUES = `
  SELECT t.id::int AS tache_id, t.objet, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
         t.etat, t.note, t.lot_id::int AS lot_id, l.adresse, l.commune, d.demandeur_libelle, d.statut, d.cree_le, d.repondu_le, d.motif
    FROM gestion_tache t
    LEFT JOIN gestion_annuaire_lot l ON l.id = t.lot_id
    JOIN gestion_tache_demande d ON d.tache_id = t.id AND d.statut <> 'remplacee'`;

type LigneRecue = { tache_id: number; objet: string; jour: string; heure: string | null; etat: string; note: string | null;
  adresse: string | null; commune: string | null; demandeur_libelle: string; statut: StatutAcceptation; cree_le: Date;
  repondu_le: Date | null; motif: string | null; lot_id?: number | null };

const versRecue = (r: LigneRecue): TacheRecue => ({
  tacheId: Number(r.tache_id), objet: r.objet, jour: r.jour, heure: r.heure, etat: r.etat, note: r.note,
  /* 🔴 LOT GESTION-TACHES-SANS-BIEN — sans bien : aucune adresse (jamais « Adresse non renseignée »). */
  adresseBien: r.lot_id === null ? '' : titreLogement(r.adresse, r.commune), demandeurLibelle: r.demandeur_libelle, statut: r.statut,
  demandeLe: iso(r.cree_le) ?? '', reponduLe: iso(r.repondu_le), motif: r.motif,
});

/** 🔴 SES PROPRES TÂCHES, ET RIEN D'AUTRE : celles dont la demande courante lui est adressée (non annulées). */
export async function mesTachesRecues(utilisateurId: number): Promise<TacheRecue[]> {
  const { rows } = await query<LigneRecue>(
    `${SQL_RECUES} WHERE d.destinataire_id = $1 AND t.etat <> 'annulee'
      ORDER BY (t.etat = 'a_faire') DESC, t.jour, t.heure NULLS FIRST, t.id LIMIT 200`, [utilisateurId]);
  return rows.map(versRecue);
}

/**
 * La demande d'un jeton, pour l'afficher sur la page — avec le verdict pour CETTE personne. `'destinataire'` (page
 * publique du lien, sans connexion) : le verdict est rendu pour le destinataire désigné par le jeton.
 */
export async function demandeDuJeton(jeton: string, utilisateurId: number | null | 'destinataire'): Promise<{ tache: TacheRecue | null; verdict: VerdictLien }> {
  const avecInvites = await invitesTacheDisponible();
  const { rows } = await query<LigneRecue & { destinataire_id: number | null; expire_le: Date | null; utilise_le: Date | null; statut_brut: string; invite_retire: boolean | null }>(
    `SELECT t.id::int AS tache_id, t.objet, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
            t.etat, t.note, t.lot_id::int AS lot_id, l.adresse, l.commune, d.demandeur_libelle, d.statut, d.statut AS statut_brut, d.cree_le,
            d.repondu_le, d.motif, d.destinataire_id::int AS destinataire_id, d.expire_le, d.utilise_le,
            ${avecInvites ? '(i.retire_le IS NOT NULL)' : 'false'} AS invite_retire
       FROM gestion_tache_demande d JOIN gestion_tache t ON t.id = d.tache_id LEFT JOIN gestion_annuaire_lot l ON l.id = t.lot_id
       ${avecInvites ? 'LEFT JOIN gestion_tache_invite i ON i.id = d.invite_id' : ''}
      WHERE d.jeton_empreinte = $1`, [empreinteJeton(jeton)]);
  const r = rows[0];
  const verdict = verdictLien(r === undefined ? null : {
    statut: r.statut_brut, destinataireId: r.destinataire_id, expireLe: iso(r.expire_le), utiliseLe: iso(r.utilise_le),
    inviteRetire: r.invite_retire === true,
  }, r?.etat ?? null, utilisateurId === 'destinataire' ? (r?.destinataire_id ?? null) : utilisateurId, new Date());
  // Une autre personne — ou un ancien invité dont la place a été donnée — ne voit RIEN de la tâche : seulement le refus.
  const cache = !verdict.ok && (verdict.cause === 'autre_personne' || verdict.cause === 'plus_destinee');
  return { tache: r === undefined || cache ? null : versRecue(r), verdict };
}

/** La demande courante d'une tâche, pour les écrans de Gestion. */
export function versAcceptation(r: {
  statut: string | null; automatique: boolean | null; destinataire_id: number | null; destinataire_libelle: string | null;
  demandeur_id: number | null; demandeur_libelle: string | null; demande_le: Date | null; repondu_le: Date | null;
  repondu_par_libelle: string | null; motif: string | null; mail_etat: string | null; mail_le: Date | null;
}): AcceptationTache | null {
  if (r.statut === null || r.statut === 'remplacee') return null;
  return {
    statut: r.statut as StatutAcceptation, automatique: r.automatique === true,
    destinataireId: r.destinataire_id === null ? null : Number(r.destinataire_id), destinataireLibelle: r.destinataire_libelle ?? '',
    demandeurId: r.demandeur_id === null ? null : Number(r.demandeur_id), demandeurLibelle: r.demandeur_libelle ?? '',
    demandeLe: iso(r.demande_le) ?? '', reponduLe: iso(r.repondu_le), reponduParLibelle: r.repondu_par_libelle, motif: r.motif,
    mailEtat: (r.mail_etat ?? 'aucun') as EtatMail, mailLe: iso(r.mail_le),
  };
}

/**
 * 🔴 QUI PEUT OUVRIR « MES TÂCHES » ET RÉPONDRE : tout compte qui remplit la règle « Confiée à » (`peutRecevoirUneTache` :
 * actif, adresse de notre Workspace) — MÊME SANS la tuile Gestion. Relu en base à chaque appel. `null` sinon.
 */
export async function compteSelonRegle(sub: number | null): Promise<{ id: number; nom: string } | null> {
  if (sub === null) return null;
  const { rows } = await query<{ id: number; identifiant: string; actif: boolean; nom: string }>(
    `SELECT id::int AS id, identifiant, actif, btrim(prenom || ' ' || nom) AS nom FROM admin_utilisateur WHERE id = $1`, [sub]);
  const c = rows[0];
  if (c === undefined) return null;
  return peutRecevoirUneTache(c, lireDomaines(await lireDomainesAutorises())) ? { id: Number(c.id), nom: c.nom } : null;
}
