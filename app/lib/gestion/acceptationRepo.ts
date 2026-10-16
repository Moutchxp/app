import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { query, withTransaction, type RequeteTx } from '../db/client';
import { chargerConfigGestion } from './config';
import { titreLogement } from './annuaireRecherche';
import type { Auteur } from './gestes';
import {
  acceptationInitiale, corpsDemande, erreurMotif, liensDemande, messageIdDemande, objetDemande, verdictLien,
  type AcceptationTache, type EtatMail, type StatutAcceptation, type TacheRecue, type VerdictLien,
} from './acceptationTache';
import { echeanceLisible, horodatageLisible } from './taches';
import { texteCompletTache, coordonneesLisibles, estFamille, type ContactSource } from './contactsTache';
import { transportParDefaut, type TransportDemande } from './envoiDemandeTache';
import { peutRecevoirUneTache } from './taches';
import { lireDomainesAutorises } from './comptesGoogleRepo';
import { lireDomaines } from './googleCollaborateur';
/* 🔴 LOT TACHES-AGENDA — accepter ou refuser change la place de la tâche dans l'agenda : on le marque dans la transaction. */
import { marquerASynchroniser } from './agendaSynchroRepo';
import { adresseApplication, MENTION_LIEN_LOCAL } from './adresseApplication';

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

export interface DemandePosee { demandeId: number; statut: StatutAcceptation; jeton: string | null }

/**
 * POSE la demande COURANTE d'une tâche, en remplaçant la précédente. Confiée à soi-même ⇒ « Acceptée » d'office ;
 * sinon « En attente », avec un jeton neuf (rendu en clair UNE fois, pour le mail).
 */
export async function poserDemande(q: RequeteTx, o: {
  tacheId: number; confieeA: number | null; confieeLibelle: string; auteur: Auteur; nom: string; motifTrace?: string;
}): Promise<DemandePosee> {
  await q(`UPDATE gestion_tache_demande SET statut = 'remplacee', remplacee_le = now()
            WHERE tache_id = $1 AND statut <> 'remplacee'`, [o.tacheId]);
  const statut = acceptationInitiale(o.confieeA, o.auteur.id);
  const email = o.confieeA === null ? null
    : (await q<{ e: string }>(`SELECT identifiant AS e FROM admin_utilisateur WHERE id = $1`, [o.confieeA])).rows[0]?.e ?? null;
  if (statut === 'acceptee') {
    const { rows } = await q<{ id: number }>(
      `INSERT INTO gestion_tache_demande (tache_id, destinataire_id, destinataire_libelle, destinataire_email, demandeur_id,
         demandeur_libelle, statut, automatique, repondu_le, repondu_par_libelle)
       VALUES ($1, $2, $3, $4, $5, $6, 'acceptee', true, now(), $6) RETURNING id::int AS id`,
      [o.tacheId, o.confieeA, o.confieeLibelle, email, o.auteur.id, o.nom]);
    await tracer(q, o.tacheId, null, { acceptation: 'acceptee', automatique: true }, o.auteur, o.nom);
    return { demandeId: Number(rows[0].id), statut, jeton: null };
  }
  const reglage = await lireReglageTaches(q);
  const jeton = randomBytes(32).toString('base64url');
  const { rows } = await q<{ id: number }>(
    `INSERT INTO gestion_tache_demande (tache_id, destinataire_id, destinataire_libelle, destinataire_email, demandeur_id,
       demandeur_libelle, statut, jeton_empreinte, expire_le)
     VALUES ($1, $2, $3, $4, $5, $6, 'en_attente', $7, now() + ($8::int * interval '1 day')) RETURNING id::int AS id`,
    [o.tacheId, o.confieeA, o.confieeLibelle, email, o.auteur.id, o.nom, empreinteJeton(jeton), reglage.dureeLienJours]);
  await tracer(q, o.tacheId, null, { demandeAcceptation: o.confieeLibelle, ...(o.motifTrace ? { raison: o.motifTrace } : {}) }, o.auteur, o.nom);
  return { demandeId: Number(rows[0].id), statut, jeton };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ENVOYER LE MAIL (après la transaction ; un échec n'annule pas la demande, il se DIT)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export async function envoyerDemande(
  demandeId: number, jeton: string, transport: TransportDemande | null = null, maintenant: Date = new Date(),
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

  const { rows } = await query<{
    tache_id: number; destinataire_libelle: string; destinataire_email: string | null; demandeur_libelle: string;
    expire_le: Date; objet: string; jour: string; heure: string | null; note: string | null; adresse: string | null; commune: string | null;
  }>(
    `SELECT d.tache_id::int AS tache_id, d.destinataire_libelle, d.destinataire_email, d.demandeur_libelle, d.expire_le,
            t.objet, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure, t.note, l.adresse, l.commune
       FROM gestion_tache_demande d JOIN gestion_tache t ON t.id = d.tache_id JOIN gestion_annuaire_lot l ON l.id = t.lot_id
      WHERE d.id = $1`, [demandeId]);
  const d = rows[0];
  if (d === undefined) return 'aucun';
  if ((d.destinataire_email ?? '').trim() === '') return marquer('echec', 'Le destinataire n’a pas d’adresse.');
  /* 🔴 LOT AGENDA-TITRE-ET-LIENS — la MÊME adresse de base que l'agenda (jamais un tunnel temporaire ; défaut localhost). */
  const { base, locale } = adresseApplication();

  const [contacts, pieces] = await Promise.all([contactsDeLaDemande(d.tache_id), piecesDeLaDemande(d.tache_id)]);
  const config = await chargerConfigGestion();
  const echeance = echeanceLisible(d.jour, d.heure, maintenant);
  const adresseCourte = (d.adresse ?? '').trim() || titreLogement(d.adresse, d.commune);
  const liens = liensDemande(base, jeton);
  const corps = corpsDemande({
    echeance, adresseBien: titreLogement(d.adresse, d.commune), objet: d.objet, demandeur: d.demandeur_libelle,
    destinataire: d.destinataire_libelle, texte: texteCompletTache(d.note, contacts), pieces,
    lienAccepter: liens.accepter, lienRefuser: liens.refuser, expireLe: horodatageLisible(iso(d.expire_le) ?? ''),
    ...(locale ? { mentionLiens: MENTION_LIEN_LOCAL } : {}),
  });
  const de = config.adresseGestion;
  const r = await t.envoyer({
    de, deNom: 'Gestion', a: [d.destinataire_email ?? ''], cc: [], cci: [],
    objet: objetDemande({ adresseCourte, objet: d.objet, echeance }),
    corps: corps.texte, corpsHtml: corps.html,
    messageId: messageIdDemande(de.split('@')[1] ?? '', randomBytes(12).toString('hex')),
  });
  if (!r.ok) return marquer('echec', r.motif);
  return marquer(r.factice ? 'factice' : 'envoye', null, r.id);
}

/**
 * APRÈS UN GESTE QUI A POSÉ UNE DEMANDE EN ATTENTE : préparer (et, réglage activé, envoyer) son mail. Ne lève jamais :
 * un échec d'envoi n'annule pas la tâche, il se lit sur la demande (« mail non envoyé »).
 */
export async function envoyerSiBesoin(demande: DemandePosee | null | undefined): Promise<EtatMail | null> {
  if (!demande || demande.jeton === null) return null;
  try {
    return await envoyerDemande(demande.demandeId, demande.jeton);
  } catch (e) {
    console.error('[taches/acceptation] préparation du mail impossible', e);
    await query(`UPDATE gestion_tache_demande SET mail_etat = 'echec', mail_le = now(), mail_erreur = $2 WHERE id = $1`,
      [demande.demandeId, e instanceof Error ? e.message.slice(0, 300) : 'erreur']).catch(() => {});
    return 'echec';
  }
}

async function contactsDeLaDemande(tacheId: number): Promise<ContactSource[]> {
  const { rows } = await query<{ cle: string; famille: string; nom: string; qualite: string | null; organisation: string | null;
    adresse: string | null; coordonnees: unknown }>(
    `SELECT cle, famille, nom, qualite, organisation, adresse, coordonnees FROM gestion_tache_contact
      WHERE tache_id = $1 AND retire_le IS NULL ORDER BY rang, id`, [tacheId]).catch(() => ({ rows: [] }));
  return rows.filter((r) => estFamille(r.famille)).map((r) => ({
    cle: r.cle, famille: r.famille as ContactSource['famille'], nom: r.nom, qualite: r.qualite, organisation: r.organisation,
    adresse: r.adresse, coordonnees: coordonneesLisibles(r.coordonnees),
  }));
}

async function piecesDeLaDemande(tacheId: number): Promise<{ nom: string; lien: string | null }[]> {
  const { rows } = await query<{ nom: string; lien: string | null }>(
    `SELECT nom, lien FROM gestion_tache_piece WHERE tache_id = $1 AND retire_le IS NULL ORDER BY id`, [tacheId])
    .catch(() => ({ rows: [] }));
  return rows;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   RÉPONDRE : ACCEPTER, REFUSER (motif obligatoire)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type IssueReponse =
  | { ok: true; statut: StatutAcceptation; message: string; tacheId?: number }
  | { ok: false; statut: number; message: string; cause?: Exclude<VerdictLien, { ok: true }>['cause'] };

interface LigneDemande {
  id: number; tache_id: number; statut: string; destinataire_id: number | null; destinataire_libelle: string | null;
  expire_le: Date | null; utilise_le: Date | null; tache_etat: string;
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
  return withTransaction(async (q) => {
    const parJeton = (o.jeton ?? '').trim() !== '';
    const { rows } = await q<LigneDemande>(
      `SELECT d.id::int AS id, d.tache_id::int AS tache_id, d.statut, d.destinataire_id::int AS destinataire_id,
              d.destinataire_libelle, d.expire_le, d.utilise_le, t.etat AS tache_etat
         FROM gestion_tache_demande d JOIN gestion_tache t ON t.id = d.tache_id
        WHERE ${parJeton ? 'd.jeton_empreinte = $1' : "d.tache_id = $1 AND d.statut <> 'remplacee'"}
        FOR UPDATE OF d`, [parJeton ? empreinteJeton(o.jeton ?? '') : o.tacheId ?? 0]);
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
        expireLe: parJeton ? iso(d.expire_le) : null, utiliseLe: iso(d.utilise_le),
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
      ok: true, statut, tacheId: Number(d!.tache_id),
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
         t.etat, t.note, l.adresse, l.commune, d.demandeur_libelle, d.statut, d.cree_le, d.repondu_le, d.motif
    FROM gestion_tache t
    JOIN gestion_annuaire_lot l ON l.id = t.lot_id
    JOIN gestion_tache_demande d ON d.tache_id = t.id AND d.statut <> 'remplacee'`;

type LigneRecue = { tache_id: number; objet: string; jour: string; heure: string | null; etat: string; note: string | null;
  adresse: string | null; commune: string | null; demandeur_libelle: string; statut: StatutAcceptation; cree_le: Date;
  repondu_le: Date | null; motif: string | null };

const versRecue = (r: LigneRecue): TacheRecue => ({
  tacheId: Number(r.tache_id), objet: r.objet, jour: r.jour, heure: r.heure, etat: r.etat, note: r.note,
  adresseBien: titreLogement(r.adresse, r.commune), demandeurLibelle: r.demandeur_libelle, statut: r.statut,
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
  const { rows } = await query<LigneRecue & { destinataire_id: number | null; expire_le: Date | null; utilise_le: Date | null; statut_brut: string }>(
    `SELECT t.id::int AS tache_id, t.objet, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure,
            t.etat, t.note, l.adresse, l.commune, d.demandeur_libelle, d.statut, d.statut AS statut_brut, d.cree_le,
            d.repondu_le, d.motif, d.destinataire_id::int AS destinataire_id, d.expire_le, d.utilise_le
       FROM gestion_tache_demande d JOIN gestion_tache t ON t.id = d.tache_id JOIN gestion_annuaire_lot l ON l.id = t.lot_id
      WHERE d.jeton_empreinte = $1`, [empreinteJeton(jeton)]);
  const r = rows[0];
  const verdict = verdictLien(r === undefined ? null : {
    statut: r.statut_brut, destinataireId: r.destinataire_id, expireLe: iso(r.expire_le), utiliseLe: iso(r.utilise_le),
  }, r?.etat ?? null, utilisateurId === 'destinataire' ? (r?.destinataire_id ?? null) : utilisateurId, new Date());
  // Une autre personne ne voit RIEN de la tâche : seulement le refus.
  return { tache: r === undefined || (!verdict.ok && verdict.cause === 'autre_personne') ? null : versRecue(r), verdict };
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
