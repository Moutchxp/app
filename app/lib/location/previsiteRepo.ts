import { query, withTransaction, type RequeteTx } from '../db/client';
import { refusSansEmailLocataire } from './emailLocataireRequisRepo';
import type { Auteur } from '../gestion/gestes';
import { rappelsParDefaut, type SaisieTache } from '../gestion/taches';
import { annulerTache, creerTache, decalerTache, listerCollaborateurs, marquerFaite, modifierTache, type Collaborateur, type IssueTache } from '../gestion/tachesRepo';
import { renvoyerInvitation } from '../gestion/invitesRepo';
import { mailTache } from '../gestion/mailTache';
import { colonneExisteMemo } from './sondeLocation';
import { adressesUniques } from './mailsPreavisSortie';
import { envoyerSerie, mailsAvisDisponibles, refusRetouches, type DepsAvis, type EnvoiAvis } from './mailsPreavisSortieRepo';
import type { Retouches } from './texteModifiable';
import { dateFrPreavis } from './preavis';
import { plageFr } from './edls';
import {
  CORPS_MAX, NOM_FICHIER_ICS, OBJET_TACHE_PREVISITE, creneauFr, mailPrevisite, objetAnnulationCollegues, objetCompteRendu, objetRefusPrevisite, paragraphesAnnulationCollegues, paragraphesDuTexte,
  copieInterneLocataires, mailsAuxLocataires, personnaliserTexte,
  texteRefusPrevisite, tousRefusent, verifierRdvPrevisite, type MailPrevisite, type RdvPrevisite, type StatutPrevisite,
} from './previsite';
import {
  SANS_SCHEMA, assurerSuivi, collaborateursInternes, contexte, icsDuRdv, journaliser, lireGroupe, mailLocataires, previsiteDisponible, rdvDuSuivi,
  noteMissionPrevisite, reponsesDesTaches, sansEmail, sequenceTache, suiviOuvert, type Contexte, type Groupe, type IssuePrevisite, type LigneSuivi,
  type MailApercu,
} from './previsiteBase';

export * from './previsiteBase';
export * from './previsiteAuto';

/**
 * ══ 🔴🔴 LA PRÉ-VISITE D'ÉTAT DES LIEUX DE SORTIE — LE DÉPÔT (Arno, 10/11/2026). IMPUR (base + envoi). ═══════════════════════════════
 *
 * Règles et textes : `previsite.ts`. Données : migration 464 (`gestion_location_previsite`, SONDÉE — sans elle, rien ne s'affiche et
 * rien ne s'écrit : les préavis restent comme avant).
 *   · LE RENDEZ-VOUS est une TÂCHE du module de tâches de la Gestion — le chemin de l'état des lieux de sortie planifié : `creerTache`
 *     (le premier collègue en « Confiée à », les suivants en invités ; chacun sa demande Accepter / Refuser, son statut), `decalerTache`
 *     (statuts remis à zéro, « Tâche déplacée »), `modifierTache` (réaffecter). Les mails des collègues partent par la route, après
 *     l'écriture, exactement comme pour l'EDLS (droit d'envoi relu, réglage du module, mode RECETTE).
 *   · LES MAILS AUX LOCATAIRES, À L'ÉQUIPE (alerte, compte rendu, refus / absence) partent par le canal des mails Location
 *     (`envoyerSerie` : gestion@, « Mail envoyé par … », signature Gmail, journal du bien `gestion_location_mail_avis`).
 *   · Ordre : LIRE (FOR UPDATE) → REFUSER → ÉCRIRE ; jamais une ligne effacée ; chaque geste au journal de la Gestion, par locataire.
 */

// ══ LES COLLÈGUES ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * « Destinataires » du rendez-vous : les collègues qui peuvent recevoir une tâche (actifs, adresse de notre Workspace — LA règle du
 * module de tâches) ET qui ont accès à Gestion et/ou Location. Moi en tête (par défaut à l'écran).
 */
export async function collegesPrevisite(moi: number | null): Promise<Collaborateur[]> {
  const location = (await colonneExisteMemo('admin_utilisateur', 'perm_location')) ? ' OR perm_location IS TRUE' : '';
  const { rows } = await query<{ id: number }>(
    `SELECT id::int AS id FROM admin_utilisateur WHERE actif AND (role = 'administrateur' OR perm_gestion IS TRUE${location})`);
  const permis = new Set(rows.map((r) => Number(r.id)));
  return (await listerCollaborateurs(moi)).filter((c) => permis.has(Number(c.id)));
}

/** Tous les collaborateurs ayant accès à Gestion et/ou Location — chaque adresse une fois. */
/** Le texte de l'invitation des collègues (le mail du module de tâches), pour le récapitulatif : les liens y sont personnels. */
function texteInvitationCollegue(c: Contexte, rdv: RdvPrevisite, libelle: string, invites: readonly string[], ancien: RdvPrevisite | null, note: string): string {
  const t = mailTache({
    sorte: 'invitation', destinataire: libelle, expediteur: c.qui.nom, demandeLe: new Date().toISOString(), jour: rdv.jour, heure: rdv.heure,
    // 🔴 Arno (11/11/2026, lot 2) — la note de la tâche = la fiche d'intervention (la même que celle qui partira).
    dureeMinutes: rdv.dureeMinutes, titre: OBJET_TACHE_PREVISITE, notes: note, adresse: c.adresse, contacts: [],
    invites: invites.map((x) => ({ libelle: x, statut: 'en_attente' as const, moi: x === libelle })), pieces: [],
    liens: { accepter: '[lien personnel « Accepter »]', refuser: '[lien personnel « Refuser »]', expireLe: new Date(Date.now() + 7 * 86_400_000).toISOString() },
    ...(ancien !== null ? { deplacement: ancien } : {}),
  });
  return t.texte;
}

// ══ PROGRAMMER — DÉPLACER — RÉAFFECTER ═════════════════════════════════════════════════════════════════════════════════

const refusTache = (r: Extract<IssueTache, { ok: false }>): IssuePrevisite<never> => ({ etat: 'refus', motif: r.motif, champ: r.champ === 'confieeA' ? 'destinataires' : (r.champ ?? null) });

async function verifierCollegues(ids: readonly number[], auteur: Auteur): Promise<string | null> {
  const permis = await collegesPrevisite(auteur.id);
  const hors = ids.filter((id) => !permis.some((c) => Number(c.id) === id));
  return hors.length === 0 ? null : 'Un des collègues choisis n’a pas accès à Gestion ou Location avec une adresse de notre Workspace.';
}

const saisieRdv = (rdv: RdvPrevisite, destinataires: readonly number[], note: string): SaisieTache => ({
  objet: OBJET_TACHE_PREVISITE, jour: rdv.jour, heure: rdv.heure, dureeMinutes: rdv.dureeMinutes, note,
  confieeA: destinataires[0], invites: destinataires.slice(1), evenementId: null, rappels: rappelsParDefaut(true),
  // 🔴 Arno (11/11/2026, lot C) — la pré-visite est un RENDEZ-VOUS (« RDV » dans le module RDV / Tâches).
  sorte: 'rdv',
});

export interface ResultatRdv { previsiteId: number; tacheId: number; rdv: RdvPrevisite; ancien: RdvPrevisite | null; occupationIds: number[] }

/** L'APERÇU d'un rendez-vous (programmer ou déplacer) : les textes intégraux, sans rien écrire ni envoyer. */
export async function apercuRdvPrevisite(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string; destinataires?: readonly number[]; deplacer?: boolean; retouches?: Retouches }, auteur: Auteur, deps: DepsAvis = {},
): Promise<IssuePrevisite<{ mails: MailApercu[]; sansEmail: string[] }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  // 🔴 Arno (11/11/2026) — aucun locataire avec un e-mail : refus AVANT toute écriture (ni rendez-vous, ni tâche, ni mail).
  const sansEmailLoc = await refusSansEmailLocataire(ids);
  if (sansEmailLoc !== null) return sansEmailLoc;
  const lu = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    return g.ok ? { ok: true as const, g: g.g, s: await suiviOuvert(q, g.g.cle) } : g;
  });
  if (!lu.ok) return lu.issue;
  const ancien = d.deplacer ? rdvDuSuivi(lu.s) : null;
  if (d.deplacer && (ancien === null || lu.s?.tache_etat !== 'a_faire')) return { etat: 'refus', motif: 'Aucune pré-visite programmée à déplacer pour ce préavis.' };
  const reponses = d.deplacer && lu.s?.tache_id ? (await reponsesDesTaches([Number(lu.s.tache_id)])).get(Number(lu.s.tache_id)) ?? [] : [];
  const dest = d.deplacer ? reponses.map((r) => r.collaborateurId ?? 0) : [...(d.destinataires ?? [])];
  const v = verifierRdvPrevisite({ jour: d.jour, debut: d.debut, fin: d.fin, destinataires: dest.length > 0 ? dest : [0] }, [{ recuLe: lu.g.recuLe, dateMax: lu.g.dateMax }]);
  if (!v.ok && v.champ !== 'destinataires') return { etat: 'refus', motif: v.motif, champ: v.champ };
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const rdv = { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes };
  const c = await contexte(ids, auteur, deps);
  if (c === null) return { etat: 'inconnu' };
  const libelles = d.deplacer ? reponses.map((r) => r.libelle)
    : (await collegesPrevisite(auteur.id)).filter((x) => dest.includes(Number(x.id))).map((x) => x.libelle);
  const objetCollegue = `${ancien ? 'Rendez-vous déplacé — ' : ''}${OBJET_TACHE_PREVISITE} — ${c.adresse} — ${plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes)}`;
  const note = await noteMissionPrevisite(ids, c, { recuLe: lu.g.recuLe, dateMax: lu.g.dateMax });
  const mails: MailApercu[] = libelles.map((l) => ({
    sorte: 'previsite_invitation', objet: objetCollegue, a: [l], cc: [], piece: NOM_FICHIER_ICS,
    texte: `${texteInvitationCollegue(c, rdv, l, libelles, ancien, note)}\n\n${c.qui.email ? `Mail envoyé par ${c.qui.nom} (${c.qui.email})` : ''}`.trim(),
  }));
  // 🔴 Arno (10/11/2026, texte modifiable) — les retouches : CONTRÔLÉES ici comme à l'envoi (même code) ; refusées, rien n'est montré comme parti.
  const auxLocataires = mailLocataires(c, 0, rdv, 0, ancien, new Date(), d.retouches);
  const refus = await refusRetouches(auxLocataires, d.retouches);
  if (refus !== null) return { etat: 'refus', motif: refus };
  for (const loc of auxLocataires) {
    mails.push({ sorte: loc.sorte, objet: loc.objet, a: loc.a, cc: loc.cc, texte: loc.texte, piece: loc.ics ? NOM_FICHIER_ICS : null,
      ...(loc.edition ? { edition: loc.edition } : {}), ...(loc.texteOrigine ? { modifie: true } : {}) });
  }
  return { etat: 'ok', data: { mails, sansEmail: sansEmail(c) } };
}

/** PROGRAMMER la pré-visite : la tâche (rendez-vous) et ses invités, le suivi (date de PREMIÈRE saisie), le journal. */
export async function programmerPrevisite(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string; destinataires: readonly number[] }, auteur: Auteur,
): Promise<IssuePrevisite<ResultatRdv>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  if (ids.length === 0) return { etat: 'refus', motif: 'Demande incomplète.' };
  // 🔴 Arno (11/11/2026) — aucun locataire avec un e-mail : refus AVANT toute écriture (ni rendez-vous, ni tâche, ni mail).
  const sansEmailLoc = await refusSansEmailLocataire(ids);
  if (sansEmailLoc !== null) return sansEmailLoc;
  const avant = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return g;
    const s = await suiviOuvert(q, g.g.cle, true);
    if (s !== null && s.tache_etat === 'a_faire') return { ok: false as const, issue: { etat: 'refus' as const, motif: 'Une pré-visite est déjà programmée pour ce préavis : déplacez-la.' } };
    return g;
  });
  if (!avant.ok) return avant.issue;
  const v = verifierRdvPrevisite({ jour: d.jour, debut: d.debut, fin: d.fin, destinataires: d.destinataires }, [{ recuLe: avant.g.recuLe, dateMax: avant.g.dateMax }]);
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const horsDroit = await verifierCollegues(v.destinataires, auteur);
  if (horsDroit !== null) return { etat: 'refus', motif: horsDroit, champ: 'destinataires' };
  const rdv = { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes };
  const c = await contexte(ids, auteur, {});
  // 🔴 Arno (11/11/2026, lot 2) — la note de la tâche = la mission et la FICHE D'INTERVENTION (réservée aux collègues).
  const t = await creerTache(avant.g.lotId, saisieRdv(rdv, v.destinataires, await noteMissionPrevisite(ids, c, { recuLe: avant.g.recuLe, dateMax: avant.g.dateMax })), auteur);
  if (!t.ok) return refusTache(t);
  const lien = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return { ok: false as const, issue: g.issue };
    const s = await assurerSuivi(q, g.g);
    if (s.tache_id !== null && s.tache_etat === 'a_faire') {
      return { ok: false as const, issue: { etat: 'refus' as const, motif: 'Une pré-visite vient d’être programmée par quelqu’un d’autre pour ce préavis.' } };
    }
    await q(
      `UPDATE gestion_location_previsite SET tache_id = $2, occupation_ids = $3::bigint[], rdv_saisi_le = coalesce(rdv_saisi_le, now()),
              rdv_saisi_par_libelle = coalesce(rdv_saisi_par_libelle, $4), rdv_modifie_le = now(), cr_invitation_le = NULL
        WHERE id = $1`, [Number(s.id), t.id, g.g.ids, auteur.libelle]);
    await journaliser(q, g.g.lignes, 'location_previsite_programmee', null, plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes),
      `pré-visite d’état des lieux de sortie programmée le ${plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes)} — tâche ${t.id}`, auteur);
    return { ok: true as const, id: Number(s.id) };
  });
  if (!lien.ok) { await annulerTache(t.id, auteur); return lien.issue; }
  return { etat: 'ok', data: { previsiteId: lien.id, tacheId: t.id, rdv, ancien: null, occupationIds: ids }, demandes: t.demandes ?? (t.demande ? [t.demande] : []) };
}

/** Le suivi et sa tâche À FAIRE, sous verrou, ou le refus. */
async function rdvCourant(q: RequeteTx, ids: readonly number[]): Promise<{ ok: true; g: Groupe; s: LigneSuivi; rdv: RdvPrevisite } | { ok: false; issue: IssuePrevisite<never> }> {
  const g = await lireGroupe(q, ids);
  if (!g.ok) return g;
  const s = await suiviOuvert(q, g.g.cle, true);
  const rdv = rdvDuSuivi(s);
  if (s === null || rdv === null || s.tache_etat !== 'a_faire') return { ok: false, issue: { etat: 'refus', motif: 'Aucune pré-visite programmée pour ce préavis.' } };
  return { ok: true, g: g.g, s, rdv };
}

/** La note de la tâche remise à jour (fiche d'intervention), si elle a changé : mêmes date, créneau et collègues — seule la note bouge. */
async function rafraichirNoteMission(tacheId: number, ids: readonly number[], rdv: RdvPrevisite, preavis: { recuLe: string; dateMax: string }, auteur: Auteur): Promise<void> {
  try {
    const note = await noteMissionPrevisite(ids, null, preavis);
    const { rows } = await query<{ note: string | null; confiee: number | null }>('SELECT note, confiee_a::int AS confiee FROM gestion_tache WHERE id = $1', [tacheId]);
    if ((rows[0]?.note ?? '') === note) return;
    // La personne à qui la tâche est confiée reste EN TÊTE (aucun changement de personne, donc aucune nouvelle demande d'acceptation).
    const autres = ((await reponsesDesTaches([tacheId])).get(tacheId) ?? []).map((r) => r.collaborateurId).filter((x): x is number => typeof x === 'number' && x > 0);
    const confiee = rows[0]?.confiee ?? null;
    const dest = confiee === null ? autres : [confiee, ...autres.filter((x) => x !== confiee)];
    if (dest.length === 0) return;
    await modifierTache(tacheId, saisieRdv(rdv, dest, note), auteur);
  } catch (e) {
    console.error('[pré-visite] note de la tâche non remise à jour', (e as Error)?.message);
  }
}

/**
 * DÉPLACER le rendez-vous : nouvelle date / créneau — le module de tâches remet les statuts à zéro et renvoie « Tâche déplacée » à
 * chaque collègue ; le suivi garde sa date de PREMIÈRE saisie ; l'invitation au compte rendu redevient à faire.
 */
export async function deplacerPrevisite(
  d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string }, auteur: Auteur,
): Promise<IssuePrevisite<ResultatRdv>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  // 🔴 Arno (11/11/2026) — aucun locataire avec un e-mail : refus AVANT toute écriture (ni rendez-vous, ni tâche, ni mail).
  const sansEmailLoc = await refusSansEmailLocataire(ids);
  if (sansEmailLoc !== null) return sansEmailLoc;
  const avant = await withTransaction(async (q) => rdvCourant(q, ids));
  if (!avant.ok) return avant.issue;
  const v = verifierRdvPrevisite({ jour: d.jour, debut: d.debut, fin: d.fin, destinataires: [1] }, [{ recuLe: avant.g.recuLe, dateMax: avant.g.dateMax }]);
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const rdv = { jour: v.jour, heure: v.heure, dureeMinutes: v.dureeMinutes };
  if (rdv.jour === avant.rdv.jour && rdv.heure === avant.rdv.heure && rdv.dureeMinutes === avant.rdv.dureeMinutes) {
    return { etat: 'refus', motif: 'La pré-visite est déjà à cette date et à ce créneau.' };
  }
  const tacheId = Number(avant.s.tache_id);
  // 🔴 Arno (11/11/2026, lot 2) — le même contenu au déplacement : la note est remise à jour (fiche d'intervention) AVANT le décalage, qui
  //    envoie « Tâche déplacée » aux collègues ; la date ne change que par le décalage.
  await rafraichirNoteMission(tacheId, ids, avant.rdv, { recuLe: avant.g.recuLe, dateMax: avant.g.dateMax }, auteur);
  const t = await decalerTache(tacheId, { jour: rdv.jour, heure: rdv.heure, dureeMinutes: rdv.dureeMinutes }, auteur);
  if (!t.ok) return refusTache(t);
  await withTransaction(async (q) => {
    await q('UPDATE gestion_location_previsite SET rdv_modifie_le = now(), cr_invitation_le = NULL WHERE id = $1', [Number(avant.s.id)]);
    await journaliser(q, avant.g.lignes, 'location_previsite_deplacee', plageFr(avant.rdv.jour, avant.rdv.heure, avant.rdv.dureeMinutes),
      plageFr(rdv.jour, rdv.heure, rdv.dureeMinutes), `pré-visite déplacée — tâche ${tacheId}`, auteur);
  });
  return { etat: 'ok', data: { previsiteId: Number(avant.s.id), tacheId, rdv, ancien: avant.rdv, occupationIds: ids }, demandes: t.demandes ?? (t.demande ? [t.demande] : []) };
}

/**
 * RÉAFFECTER après que TOUS ont refusé : d'autres collègues (ou les mêmes) — chacun une nouvelle demande, un nouveau mail. Rien
 * n'est supprimé : le module de tâches garde les refus dans sa trace.
 */
export async function reaffecterPrevisite(d: { occupationIds: readonly number[]; destinataires: readonly number[] }, auteur: Auteur): Promise<IssuePrevisite<ResultatRdv>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const ids = [...new Set(d.occupationIds)];
  const dest = [...new Set(d.destinataires.filter((x) => Number.isSafeInteger(x) && x > 0))];
  if (dest.length === 0) return { etat: 'refus', motif: 'Choisissez au moins un collègue.', champ: 'destinataires' };
  // 🔴 Arno (11/11/2026) — aucun locataire avec un e-mail : refus AVANT toute écriture (ni rendez-vous, ni tâche, ni mail).
  const sansEmailLoc = await refusSansEmailLocataire(ids);
  if (sansEmailLoc !== null) return sansEmailLoc;
  const avant = await withTransaction(async (q) => rdvCourant(q, ids));
  if (!avant.ok) return avant.issue;
  const tacheId = Number(avant.s.tache_id);
  const reponses = (await reponsesDesTaches([tacheId])).get(tacheId) ?? [];
  if (!tousRefusent(reponses.map((r) => r.statut))) return { etat: 'refus', motif: 'Tous les collègues n’ont pas refusé : déplacez la pré-visite pour changer de personne.' };
  const horsDroit = await verifierCollegues(dest, auteur);
  if (horsDroit !== null) return { etat: 'refus', motif: horsDroit, champ: 'destinataires' };
  // 🔴 Arno (11/11/2026, lot 2) — la note relue À JOUR (fiche d'intervention) pour les collègues de la réaffectation.
  const t = await modifierTache(tacheId, saisieRdv(avant.rdv, dest, await noteMissionPrevisite(ids, null, { recuLe: avant.g.recuLe, dateMax: avant.g.dateMax })), auteur);
  if (!t.ok) return refusTache(t);
  const demandes = [...(t.demandes ?? (t.demande ? [t.demande] : []))];
  // Un collègue gardé qui avait refusé : son invitation est renvoyée (nouvelle demande, statut remis « en attente »).
  if (await colonneExisteMemo('gestion_tache_demande', 'invite_id')) {
    const { rows: inv } = await query<{ id: string; collaborateur_id: string | null; statut: string | null }>(
      `SELECT i.id::text, i.collaborateur_id::text, (SELECT d.statut FROM gestion_tache_demande d WHERE d.invite_id = i.id AND d.statut <> 'remplacee' LIMIT 1) AS statut
         FROM gestion_tache_invite i WHERE i.tache_id = $1 AND i.retire_le IS NULL`, [tacheId]);
    for (const i of inv.filter((x) => x.statut === 'refusee' && dest.includes(Number(x.collaborateur_id)))) {
      const r = await renvoyerInvitation(tacheId, Number(i.id), auteur);
      if (r.ok) demandes.push(...r.demandes);
    }
  }
  await withTransaction(async (q) => journaliser(q, avant.g.lignes, 'location_previsite_reaffectee', reponses.map((r) => r.libelle).join(', '), dest.join(', '),
    `pré-visite réaffectée après le refus de tous les collègues — tâche ${tacheId}`, auteur));
  return { etat: 'ok', data: { previsiteId: Number(avant.s.id), tacheId, rdv: avant.rdv, ancien: null, occupationIds: ids }, demandes };
}

/** APRÈS le rendez-vous écrit : le mail aux locataires (confirmation, ou modification avec l'ancien créneau). Ne lève jamais. */
export async function envoyerMailLocatairesPrevisite(r: ResultatRdv, auteur: Auteur, deps: DepsAvis & { maintenant?: Date } = {}, retouches?: Retouches): Promise<{ envois: EnvoiAvis[]; sansEmail: string[] }> {
  try {
    if (!(await mailsAvisDisponibles())) return { envois: [], sansEmail: [] };
    const c = await contexte(r.occupationIds, auteur, deps);
    if (c === null) return { envois: [], sansEmail: [] };
    const m = mailLocataires(c, r.previsiteId, r.rdv, await sequenceTache(r.tacheId), r.ancien, deps.maintenant ?? new Date(), retouches);
    const refus = await refusRetouches(m, retouches);
    if (refus !== null) return { envois: [{ sorte: r.ancien === null ? 'previsite_locataires' : 'previsite_locataires_modif', objet: 'Mail aux locataires', a: [], cc: [], envoye: false, motif: refus }], sansEmail: [] };
    return { envois: m.length === 0 ? [] : await envoyerSerie(m, c.brute, { lotId: c.lotId, occupationIds: r.occupationIds, auteur }, deps), sansEmail: sansEmail(c) };
  } catch (e) {
    return { envois: [{ sorte: 'previsite_locataires', objet: 'Mail aux locataires', a: [], cc: [], envoye: false, motif: (e as Error)?.message || 'erreur inattendue' }], sansEmail: [] };
  }
}

// ══ LE COMPTE RENDU ═════════════════════════════════════════════════════════════════════════════════════════════════════

async function mailCompteRendu(ids: readonly number[], corps: string, aussiLocataires: boolean, auteur: Auteur, deps: DepsAvis):
  Promise<IssuePrevisite<{ mails: MailPrevisite[]; c: Contexte; s: LigneSuivi; g: Groupe; rdv: RdvPrevisite; sansEmail: string[] }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const texte = (corps ?? '').trim();
  if (texte === '') return { etat: 'refus', motif: 'Écrivez le compte rendu.', champ: 'corps' };
  if (texte.length > CORPS_MAX) return { etat: 'refus', motif: `Le compte rendu dépasse ${CORPS_MAX} caractères.`, champ: 'corps' };
  const lu = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    return g.ok ? { ok: true as const, g: g.g, s: await suiviOuvert(q, g.g.cle) } : g;
  });
  if (!lu.ok) return lu.issue;
  const rdv = rdvDuSuivi(lu.s);
  if (lu.s === null || rdv === null) return { etat: 'refus', motif: 'Aucune pré-visite programmée pour ce préavis.' };
  const c = await contexte(ids, auteur, deps);
  if (c === null) return { etat: 'inconnu' };
  const internes = await collaborateursInternes();
  /* 🔴 Arno (10/11/2026, confidentialité) — les collaborateurs : UN mail interne (complet, « Mail envoyé par … ») ; « Envoyer aussi aux
     locataires » : en plus, UN mail PAR locataire, seul destinataire, sans copie, avec « Mail envoyé par … » (l'expéditeur de l'agence) — jamais les adresses des autres collaborateurs. */
  const interne = mailPrevisite({ sorte: 'previsite_compte_rendu', de: c.expediteur, a: internes, cc: [], objet: objetCompteRendu(rdv),
    paragraphes: paragraphesDuTexte(texte), qui: c.qui, signature: c.signature });
  const auxLocataires = aussiLocataires ? mailsAuxLocataires({ sorte: 'previsite_compte_rendu', de: c.expediteur, locataires: c.locataires, objet: objetCompteRendu(rdv),
    paragraphesDe: (l) => paragraphesDuTexte(personnaliserTexte(texte, l)), qui: c.qui, signature: c.signature }) : [];
  return { etat: 'ok', data: { mails: [...(internes.length > 0 ? [interne] : []), ...auxLocataires], c, s: lu.s, g: lu.g, rdv, sansEmail: aussiLocataires ? sansEmail(c) : [] } };
}

export async function apercuCompteRendu(d: { occupationIds: readonly number[]; corps: string; aussiLocataires: boolean }, auteur: Auteur, deps: DepsAvis = {}):
  Promise<IssuePrevisite<{ mails: MailApercu[]; sansEmail: string[] }>> {
  const r = await mailCompteRendu([...new Set(d.occupationIds)], d.corps, d.aussiLocataires, auteur, deps);
  if (r.etat !== 'ok') return r;
  return { etat: 'ok', data: { mails: r.data.mails.map((m) => ({ sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc, texte: m.texte })), sansEmail: r.data.sansEmail } };
}

/** ENVOIE le compte rendu ; dès qu'il est parti, le préavis passe en « Pré-visite effectuée » (et la tâche est faite). */
export async function envoyerCompteRendu(d: { occupationIds: readonly number[]; corps: string; aussiLocataires: boolean }, auteur: Auteur, deps: DepsAvis = {}):
  Promise<IssuePrevisite<{ envois: EnvoiAvis[]; statut: StatutPrevisite | null }>> {
  const ids = [...new Set(d.occupationIds)];
  const r = await mailCompteRendu(ids, d.corps, d.aussiLocataires, auteur, deps);
  if (r.etat !== 'ok') return r;
  if (!(await mailsAvisDisponibles())) return { etat: 'refus', motif: 'Les mails de la Location demandent la migration 457 : rien n’est parti.' };
  if (r.data.mails.length === 0) return { etat: 'refus', motif: 'Aucun destinataire : ni collaborateur, ni locataire avec une adresse.' };
  const envois = await envoyerSerie(r.data.mails, r.data.c.brute, { lotId: r.data.c.lotId, occupationIds: ids, auteur }, deps);
  if (!envois.some((e) => e.envoye)) return { etat: 'ok', data: { envois, statut: null } };
  await withTransaction(async (q) => {
    await q('UPDATE gestion_location_previsite SET effectuee_le = now(), effectuee_par_libelle = $2 WHERE id = $1 AND effectuee_le IS NULL', [Number(r.data.s.id), auteur.libelle]);
    await journaliser(q, r.data.g.lignes, 'location_previsite_effectuee', null, r.data.mails[0].objet,
      `compte rendu de pré-visite envoyé à ${envois.filter((e) => e.envoye).flatMap((e) => e.a).join(', ')}`, auteur);
  });
  if (r.data.s.tache_etat === 'a_faire') await marquerFaite(Number(r.data.s.tache_id), auteur).catch(() => null);
  return { etat: 'ok', data: { envois, statut: 'effectuee' } };
}

// ══ LE REFUS / L'ABSENCE DE PRÉ-VISITE ══════════════════════════════════════════════════════════════════════════════════

/** Le texte prérempli de la modale (lecture seule). */
export async function texteRefusPropose(ids: readonly number[], auteur: Auteur): Promise<IssuePrevisite<{ texte: string; objet: string; sansEmail: string[] }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const c = await contexte([...new Set(ids)], auteur, { signatureBrute: async () => '' });
  if (c === null) return { etat: 'inconnu' };
  return { etat: 'ok', data: { texte: texteRefusPrevisite({ adresse: c.adresse, locataires: c.locataires }), objet: objetRefusPrevisite(c.adresse), sansEmail: sansEmail(c) } };
}

/**
 * 🔴 Arno (10/11/2026) — UN RENDEZ-VOUS PROGRAMMÉ au moment du refus / de l'absence : la tâche des collègues est ANNULÉE et chaque collègue
 * destinataire reçoit un mail d'annulation (invitation d'agenda d'annulation jointe : même UID, l'agenda retire le rendez-vous), rangé dans
 * l'historique du bien et des locataires — comme un déplacement.
 */
interface AnnulationRdv { tacheId: number; previsiteId: number; mail: MailPrevisite }

async function mailRefus(ids: readonly number[], texte: string, auteur: Auteur, deps: DepsAvis):
  Promise<IssuePrevisite<{ mails: MailPrevisite[]; c: Contexte; g: Groupe; sansEmail: string[]; annulation: AnnulationRdv | null }>> {
  if (!(await previsiteDisponible())) return SANS_SCHEMA;
  const t = (texte ?? '').trim();
  if (t === '') return { etat: 'refus', motif: 'Le texte du mail est vide.', champ: 'texte' };
  if (t.length > CORPS_MAX) return { etat: 'refus', motif: `Le texte dépasse ${CORPS_MAX} caractères.`, champ: 'texte' };
  const lu = await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    return g.ok ? { ok: true as const, g: g.g, s: await suiviOuvert(q, g.g.cle) } : g;
  });
  if (!lu.ok) return lu.issue;
  const c = await contexte(ids, auteur, deps);
  if (c === null) return { etat: 'inconnu' };
  const internes = await collaborateursInternes();
  /* 🔴 Arno (10/11/2026, confidentialité) — UN mail PAR locataire (seul destinataire, son nom à la place du repère, sans copie, avec « Mail envoyé par … ») ;
     la copie aux collaborateurs part SÉPARÉMENT (copie interne : à qui, et le texte). Aucun locataire joignable : aux seuls collaborateurs. */
  const objet = objetRefusPrevisite(c.adresse);
  const auxLocataires = mailsAuxLocataires({ sorte: 'previsite_refus', de: c.expediteur, locataires: c.locataires, objet,
    paragraphesDe: (l) => paragraphesDuTexte(personnaliserTexte(t, l)), qui: c.qui, signature: c.signature });
  const premier = c.locataires.find((l) => adressesUniques(l.emails).length > 0);
  const copie = premier === undefined ? null : copieInterneLocataires({ sorte: 'previsite_refus', de: c.expediteur, a: internes, objet, envois: auxLocataires,
    locataires: c.locataires, paragraphes: paragraphesDuTexte(personnaliserTexte(t, premier)), qui: c.qui, signature: c.signature });
  const mails = auxLocataires.length > 0 ? [...auxLocataires, ...(copie !== null ? [copie] : [])]
    : internes.length > 0 ? [mailPrevisite({ sorte: 'previsite_refus', de: c.expediteur, a: internes, cc: [], objet, paragraphes: paragraphesDuTexte(t), qui: c.qui, signature: c.signature })] : [];
  let annulation: AnnulationRdv | null = null;
  const rdv = rdvDuSuivi(lu.s);
  if (lu.s !== null && rdv !== null && lu.s.tache_etat === 'a_faire') {
    const tacheId = Number(lu.s.tache_id);
    const collegues = adressesUniques(((await reponsesDesTaches([tacheId])).get(tacheId) ?? []).map((x) => x.email));
    const ics = icsDuRdv(c, Number(lu.s.id), rdv, (await sequenceTache(tacheId)) + 1, new Date());
    annulation = { tacheId, previsiteId: Number(lu.s.id), mail: mailPrevisite({
      sorte: 'previsite_annulation', de: c.expediteur, a: collegues, cc: [], objet: objetAnnulationCollegues(c.adresse, rdv),
      paragraphes: paragraphesAnnulationCollegues({ adresse: c.adresse, locataires: c.locataires, rdv }), qui: c.qui, signature: c.signature,
      ics: ics ? { nom: ics.nom, contenu: ics.contenu.replace('METHOD:PUBLISH', 'METHOD:CANCEL').replace('STATUS:CONFIRMED', 'STATUS:CANCELLED') } : null,
    }) };
  }
  return { etat: 'ok', data: { mails, c, g: lu.g, sansEmail: sansEmail(c), annulation } };
}

export async function apercuRefus(d: { occupationIds: readonly number[]; texte: string }, auteur: Auteur, deps: DepsAvis = {}): Promise<IssuePrevisite<{ mails: MailApercu[]; sansEmail: string[] }>> {
  const r = await mailRefus([...new Set(d.occupationIds)], d.texte, auteur, deps);
  if (r.etat !== 'ok') return r;
  const mails: MailApercu[] = [...r.data.mails, ...(r.data.annulation !== null ? [r.data.annulation.mail] : [])]
    .map((m) => ({ sorte: m.sorte, objet: m.objet, a: m.a, cc: m.cc, texte: m.texte, ...(m.ics ? { piece: m.ics.nom } : {}) }));
  return { etat: 'ok', data: { mails, sansEmail: r.data.sansEmail } };
}

/**
 * ENVOIE le mail de refus / absence ; parti, le préavis passe en « Pré-visite refusée / absente » et l'alerte tombe. Un rendez-vous était
 * programmé : sa tâche est ANNULÉE (module de tâches, tracée), puis le mail d'annulation part aux collègues destinataires.
 */
export async function envoyerRefus(d: { occupationIds: readonly number[]; texte: string }, auteur: Auteur, deps: DepsAvis = {}):
  Promise<IssuePrevisite<{ envois: EnvoiAvis[]; statut: StatutPrevisite | null; tacheAnnulee: number | null }>> {
  const ids = [...new Set(d.occupationIds)];
  const r = await mailRefus(ids, d.texte, auteur, deps);
  if (r.etat !== 'ok') return r;
  if (!(await mailsAvisDisponibles())) return { etat: 'refus', motif: 'Les mails de la Location demandent la migration 457 : rien n’est parti.' };
  if (r.data.mails.length === 0) return { etat: 'refus', motif: 'Aucun destinataire : ni locataire avec une adresse, ni collaborateur.' };
  const envois = await envoyerSerie(r.data.mails, r.data.c.brute, { lotId: r.data.c.lotId, occupationIds: ids, auteur }, deps);
  if (!envois.some((e) => e.envoye)) return { etat: 'ok', data: { envois, statut: null, tacheAnnulee: null } };
  await withTransaction(async (q) => {
    const g = await lireGroupe(q, ids);
    if (!g.ok) return;
    const s = await assurerSuivi(q, g.g);
    await q('UPDATE gestion_location_previsite SET refus_le = now(), refus_par_libelle = $2 WHERE id = $1', [Number(s.id), auteur.libelle]);
    await journaliser(q, g.g.lignes, 'location_previsite_refusee', null, r.data.mails[0].objet,
      `mail de refus / absence de pré-visite envoyé à ${envois.filter((e) => e.envoye).flatMap((e) => e.a).join(', ')}`, auteur);
  });
  let tacheAnnulee: number | null = null;
  const an = r.data.annulation;
  if (an !== null) {
    const t = await annulerTache(an.tacheId, auteur);
    if (t.ok) {
      tacheAnnulee = an.tacheId;
      await withTransaction(async (q) => journaliser(q, r.data.g.lignes, 'location_previsite_annulee', null, an.mail.objet,
        `pré-visite annulée après le refus / l’absence — tâche ${an.tacheId} annulée${an.mail.a.length > 0 ? ` — mail d’annulation à ${an.mail.a.join(', ')}` : ''}`, auteur));
      if (an.mail.a.length > 0) envois.push(...await envoyerSerie([an.mail], r.data.c.brute, { lotId: r.data.c.lotId, occupationIds: ids, auteur }, deps));
    } else {
      envois.push({ sorte: 'previsite_annulation', objet: an.mail.objet, a: an.mail.a, cc: [], envoye: false, motif: `la tâche n’a pas pu être annulée : ${t.motif}` });
    }
  }
  return { etat: 'ok', data: { envois, statut: 'refusee', tacheAnnulee } };
}

/** « 12/11/2026 de 10h00 à 11h00 » (réexport pour l'écran du résultat). */
export const libelleRdv = (r: RdvPrevisite): string => creneauFr(r);
export const libelleRecu = (iso: string): string => dateFrPreavis(iso);
