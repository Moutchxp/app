import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { adresseApplication } from '../gestion/adresseApplication';
import { colonneExisteMemo } from './sondeLocation';
import { adressesUniques, copiesAvis, prenomNom, REPERE_NOM, unMailParAdresse } from './mailsPreavisSortie';
import { envoyerSerie, mailsAvisDisponibles, type DepsAvis, type EnvoiAvis } from './mailsPreavisSortieRepo';
import { avecPerimetreTest } from './perimetreTest';
import { perimetreDuGeste } from './preavisTestRepo';
import {
  MENTION_AUTOMATIQUE, copieInterneLocataires, creneauFr, debutDuRendezVous, invitationIcs, mailPrevisite, mailRdvLocataire, type MailPrevisite, type RdvPrevisite,
} from './previsite';
import { collaborateursInternes, contexte, lienLignePreavis, sansEmail, sequenceTache, type Contexte } from './previsiteBase';
import { paragraphesDesParties } from './texteModifiable';
import type { LignePreavisAccueil } from './preavis';
import {
  NOM_FICHIER_ICS_EDLS, creneauDe, etatReponsesRdv, jetonRdvBienForme, liensReponseRdv, notificationApres, objetEdlsLocataires, objetEdlsLocatairesModif,
  objetInterneRdv, paragraphesInterneRdv, partiesEdlsLocataires, partiesEdlsLocatairesModif, uidEdls, verdictJetonRdv,
  LIENS_APERCU, type ApercuLocataires, type CauseRefusJeton, type ChoixLocataires, type Decision, type EtatLocataires, type EvenementRdv, type LiensReponse,
  type NatureEvenementRdv, type SorteRdv,
} from './reponsesRdv';

/**
 * ══ 🔴🔴 LA RÉPONSE DES LOCATAIRES À UN RENDEZ-VOUS — LE DÉPÔT (Arno, 18/11/2026, migration 495). ═══════════════════════════════════════════
 * Les liens personnels (empreinte seule en base), le journal des réponses en ajout seul, l'état des rendez-vous pour les lignes de préavis, la
 * validation à la main, les mails internes et l'invitation des locataires à l'état des lieux. Les règles sont dans `reponsesRdv.ts` (PUR).
 * Sans la 495 : rien ne change (aucun lien, aucun cartouche, les mails d'avant). Aucun DELETE, aucun UPDATE : tout s'ajoute.
 * 🔴 Arno (18/11/2026, 2e lot) — c'est le CHOIX « Envoyer l'invitation aux locataires : Oui / Non », fait à chaque rendez-vous fixé ou déplacé,
 * qui décide des envois aux locataires. Le réglage `gestion_config.reponses_rdv_actives` (495) n'est PLUS lu : il est remplacé par ce choix.
 */

export const AUTEUR_REPONSES_RDV: Auteur = { id: null, libelle: 'Réponse des locataires (rendez-vous)' };

export const reponsesRdvDisponible = async (): Promise<boolean> =>
  (await colonneExisteMemo('gestion_rdv_reponse', 'nature')) && (await colonneExisteMemo('gestion_rdv_jeton', 'jeton_empreinte'));

/** Les boutons de réponse peuvent-ils partir (liens personnels) ? Avec la 495. Ne lève jamais. */
export async function boutonsRdvPossibles(): Promise<boolean> {
  try { return await reponsesRdvDisponible(); } catch { return false; }
}

/** 🔴 (497) — le journal accepte-t-il le choix « Non » (`non_invite`) ? Lu une fois par processus. */
let non497: boolean | null = null;
export async function nonInvitesDisponible(): Promise<boolean> {
  if (non497 === true) return true;
  try {
    if (!(await reponsesRdvDisponible())) return false;
    const { rows } = await query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestion_rdv_reponse_nature_check' AND pg_get_constraintdef(oid) LIKE '%non_invite%') AS ok`);
    non497 = rows[0]?.ok === true;
    return non497;
  } catch { return false; }
}

/**
 * 🔴 Arno (18/11/2026, 2e lot) — « Envoyer l'invitation aux locataires : Non » : le choix est JOURNALISÉ pour le créneau du rendez-vous (cartouche
 * « Locataires non invités ») ; aucun mail. Sans la 497 : rien n'est écrit (et aucun mail ne part quand même). Ne lève jamais.
 */
export async function marquerNonInvites(sorte: SorteRdv, tacheId: number, auteur: Auteur): Promise<boolean> {
  try {
    if (!(await nonInvitesDisponible())) return false;
    const t = await tacheDuRdv(tacheId);
    if (t === null || t.jour === null) return false;
    await query(`INSERT INTO gestion_rdv_reponse (tache_id, sorte, creneau, nature, par_id, par_libelle) VALUES ($1, $2, $3, 'non_invite', $4, $5)`,
      [tacheId, sorte, creneauDe(t.jour, t.heure), auteur.id, auteur.libelle]);
    return true;
  } catch (e) {
    console.error('[réponses rdv] choix « Non »', (e as Error)?.message);
    return false;
  }
}

const empreinte = (jeton: string): string => createHash('sha256').update(jeton).digest('hex');

/** Les liens personnels des locataires (avec une adresse) pour CE créneau du rendez-vous : un jeton chacun, expirant à l'heure du rendez-vous. */
export async function creerJetons(o: { tacheId: number; sorte: SorteRdv; rdv: RdvPrevisite; occupationIds: readonly number[];
  locataires: readonly { occupationId: number; emails: readonly string[] }[]; auteur: Auteur }): Promise<Map<number, LiensReponse>> {
  const liens = new Map<number, LiensReponse>();
  const base = adresseApplication().base;
  const expire = debutDuRendezVous(o.rdv.jour, o.rdv.heure).toISOString();
  for (const l of o.locataires) {
    if (adressesUniques(l.emails).length === 0) continue;
    const jeton = randomBytes(32).toString('base64url');
    await query(
      `INSERT INTO gestion_rdv_jeton (tache_id, sorte, occupation_id, occupation_ids, creneau, duree_minutes, jeton_empreinte, expire_le, cree_par_libelle)
       VALUES ($1, $2, $3, $4::bigint[], $5, $6, $7, $8::timestamptz, $9)`,
      [o.tacheId, o.sorte, l.occupationId, [...o.occupationIds], creneauDe(o.rdv.jour, o.rdv.heure), o.rdv.dureeMinutes, empreinte(jeton), expire, o.auteur.libelle]);
    liens.set(l.occupationId, liensReponseRdv(base, jeton));
  }
  return liens;
}

// ══ L'ÉTAT DES RENDEZ-VOUS (lignes de préavis) ═════════════════════════════════════════════════════════════════════════════════════════

interface Cible { sorte: SorteRdv; tacheId: number; jour: string; heure: string | null }
const cleCible = (c: Pick<Cible, 'sorte' | 'tacheId'>): string => `${c.sorte}:${c.tacheId}`;

/** L'état côté locataires de chaque rendez-vous (créneau en cours seulement). LECTURE SEULE. */
export async function etatsDesRdv(cibles: readonly Cible[]): Promise<Map<string, EtatLocataires | null>> {
  const m = new Map<string, EtatLocataires | null>();
  if (cibles.length === 0 || !(await reponsesRdvDisponible())) return m;
  const ids = [...new Set(cibles.map((c) => c.tacheId))];
  const { rows: jetons } = await query<{ tache_id: string; sorte: SorteRdv; creneau: string; occupation_id: string; nom: string; prenom: string | null }>(
    `SELECT DISTINCT j.tache_id::text, j.sorte, j.creneau, j.occupation_id::text, l.nom, l.prenom
       FROM gestion_rdv_jeton j JOIN gestion_annuaire_occupation o ON o.id = j.occupation_id JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
      WHERE j.tache_id = ANY($1::bigint[])`, [ids]);
  const { rows: evts } = await query<{ tache_id: string; sorte: SorteRdv; creneau: string; nature: NatureEvenementRdv; occupation_id: string | null; par_libelle: string; le: string }>(
    `SELECT tache_id::text, sorte, creneau, nature, occupation_id::text, par_libelle, to_char(le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS le
       FROM gestion_rdv_reponse WHERE tache_id = ANY($1::bigint[])`, [ids]);
  for (const c of cibles) {
    const cr = creneauDe(c.jour, c.heure);
    const invites = new Map<number, string>();
    for (const j of jetons) if (Number(j.tache_id) === c.tacheId && j.sorte === c.sorte && j.creneau === cr) invites.set(Number(j.occupation_id), prenomNom(j));
    const evenements: EvenementRdv[] = evts.filter((e) => Number(e.tache_id) === c.tacheId && e.sorte === c.sorte && e.creneau === cr)
      .map((e) => ({ nature: e.nature, occupationId: e.occupation_id === null ? null : Number(e.occupation_id), parLibelle: e.par_libelle, le: e.le }));
    m.set(cleCible(c), etatReponsesRdv([...invites].map(([occupationId, nom]) => ({ occupationId, nom })), evenements));
  }
  return m;
}

/** Les lignes de préavis, avec l'état côté locataires de leur pré-visite et de leur état des lieux (sans la 495 : telles quelles). */
export async function avecReponsesRdv<T extends { lignes: LignePreavisAccueil[] }>(r: T): Promise<T> {
  try {
    const cibles: Cible[] = [];
    for (const l of r.lignes) {
      if (l.previsite?.rdv && l.previsite.tacheId) cibles.push({ sorte: 'previsite', tacheId: l.previsite.tacheId, jour: l.previsite.rdv.jour, heure: l.previsite.rdv.heure });
      if (l.edls) cibles.push({ sorte: 'edl', tacheId: l.edls.tacheId, jour: l.edls.jour, heure: l.edls.heure });
    }
    const etats = await etatsDesRdv(cibles);
    if (etats.size === 0) return r;
    for (const l of r.lignes) {
      l.reponsesRdv = {
        previsite: l.previsite?.tacheId ? etats.get(cleCible({ sorte: 'previsite', tacheId: l.previsite.tacheId })) ?? null : null,
        edl: l.edls ? etats.get(cleCible({ sorte: 'edl', tacheId: l.edls.tacheId })) ?? null : null,
        disponible: true,
      };
    }
    return r;
  } catch (e) {
    console.error('[réponses rdv] lecture', (e as Error)?.message);
    return r;
  }
}

/** La tâche d'un rendez-vous (son état et son créneau), ou `null`. */
async function tacheDuRdv(tacheId: number): Promise<{ etat: string; jour: string | null; heure: string | null; duree: number | null } | null> {
  const { rows } = await query<{ etat: string; jour: string | null; heure: string | null; duree: number | null }>(
    `SELECT etat, to_char(jour, 'YYYY-MM-DD') AS jour, to_char(heure, 'HH24:MI') AS heure, duree_minutes AS duree FROM gestion_tache WHERE id = $1`, [tacheId]);
  return rows[0] ?? null;
}

// ══ LA RÉPONSE PAR LE LIEN (page publique, sans connexion) ═════════════════════════════════════════════════════════════════════════════

export interface RdvDuLien {
  sorte: SorteRdv; jour: string | null; heure: string | null; adresse: string | null; nom: string;
  /** La réponse COURANTE de ce locataire pour ce créneau (`null` : pas encore). */
  reponse: 'accepte' | 'refuse' | null;
}
export type LectureJeton = { ok: true; rdv: RdvDuLien } | { ok: false; cause: CauseRefusJeton; message: string; rdv: RdvDuLien | null };

interface LigneJeton { id: string; tache_id: string; sorte: SorteRdv; occupation_id: string; occupation_ids: string[]; creneau: string; expire_le: string;
  nom: string; prenom: string | null; adresse: string | null }

async function ligneDuJeton(jeton: string): Promise<LigneJeton | null> {
  if (!jetonRdvBienForme(jeton) || !(await reponsesRdvDisponible())) return null;
  const { rows } = await query<LigneJeton>(
    `SELECT j.id::text, j.tache_id::text, j.sorte, j.occupation_id::text, j.occupation_ids::text[] AS occupation_ids, j.creneau, j.expire_le::text, l.nom, l.prenom,
            nullif(concat_ws(', ', lo.adresse, nullif(concat_ws(' ', lo.code_postal, lo.commune), '')), '') AS adresse
       FROM gestion_rdv_jeton j
       JOIN gestion_annuaire_occupation o ON o.id = j.occupation_id JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
       LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
      WHERE j.jeton_empreinte = $1`, [empreinte(jeton)]);
  return rows[0] ?? null;
}

async function reponseCourante(j: LigneJeton): Promise<'accepte' | 'refuse' | null> {
  const { rows } = await query<{ nature: 'accepte' | 'refuse' }>(
    `SELECT nature FROM gestion_rdv_reponse WHERE tache_id = $1 AND creneau = $2 AND occupation_id = $3 AND nature IN ('accepte', 'refuse')
      ORDER BY le DESC, id DESC LIMIT 1`, [Number(j.tache_id), j.creneau, Number(j.occupation_id)]);
  return rows[0]?.nature ?? null;
}

/** LECTURE du lien (la page l'appelle à l'ouverture) : N'ÉCRIT RIEN — une messagerie qui visite le lien ne répond jamais à la place du locataire. */
export async function lireJetonRdv(jeton: string, maintenant: Date = new Date()): Promise<LectureJeton> {
  const j = await ligneDuJeton(jeton);
  const t = j === null ? null : await tacheDuRdv(Number(j.tache_id));
  const v = verdictJetonRdv({ jeton: j === null ? null : { creneau: j.creneau, expireLe: j.expire_le }, tache: t, maintenant });
  const [jour, heure] = j === null ? [null, null] : j.creneau.split('T');
  const rdv: RdvDuLien | null = j === null ? null : { sorte: j.sorte, jour, heure, adresse: j.adresse, nom: prenomNom(j), reponse: await reponseCourante(j) };
  return v.ok ? { ok: true, rdv: rdv as RdvDuLien } : { ...v, rdv };
}

/** La RÉPONSE, au seul clic sur le bouton de la page : enregistrée (datée), puis le mail interne si l'état du rendez-vous change. */
export async function repondreParJeton(jeton: string, decision: Decision, deps: DepsAvis & { maintenant?: Date } = {}): Promise<LectureJeton & { deja?: boolean }> {
  const lu = await lireJetonRdv(jeton, deps.maintenant);
  if (!lu.ok) return lu;
  const j = (await ligneDuJeton(jeton)) as LigneJeton;
  const nature: NatureEvenementRdv = decision === 'accepter' ? 'accepte' : 'refuse';
  if (lu.rdv.reponse === nature) return { ...lu, deja: true };
  const [jour, heure] = j.creneau.split('T');
  const cible: Cible = { sorte: j.sorte, tacheId: Number(j.tache_id), jour, heure };
  const avant = (await etatsDesRdv([cible])).get(cleCible(cible)) ?? null;
  await query(
    `INSERT INTO gestion_rdv_reponse (tache_id, sorte, creneau, nature, jeton_id, occupation_id, par_libelle) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [cible.tacheId, j.sorte, j.creneau, nature, Number(j.id), Number(j.occupation_id), prenomNom(j)]);
  const apres = (await etatsDesRdv([cible])).get(cleCible(cible)) ?? null;
  await notifierSiBesoin(cible, avant, apres, j.occupation_ids.map(Number), deps);
  return { ok: true, rdv: { ...lu.rdv, reponse: nature } };
}

// ══ LA VALIDATION À LA MAIN (sans prévenir les locataires), réversible ═════════════════════════════════════════════════════════════════

/** Le rendez-vous de ces occupations, de cette sorte, est-il bien cette tâche « à faire » ? Sinon le motif. */
async function rdvDesOccupations(sorte: SorteRdv, tacheId: number, occupationIds: readonly number[]): Promise<string | null> {
  const table = sorte === 'previsite' ? 'gestion_location_previsite' : 'gestion_location_edls';
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} x JOIN gestion_tache t ON t.id = x.tache_id
      WHERE x.tache_id = $1 AND x.clos_le IS NULL AND t.etat = 'a_faire' AND x.occupation_ids && $2::bigint[]`, [tacheId, [...occupationIds]]);
  return Number(rows[0]?.n ?? 0) > 0 ? null : 'Ce rendez-vous n’est plus d’actualité pour ce préavis : rechargez la page.';
}

/** « Valider le rendez-vous sans prévenir les locataires » (ou annuler cette validation) : journalisé, AUCUN mail aux locataires. */
export async function validerRdvALaMain(d: { sorte: SorteRdv; tacheId: number; occupationIds: readonly number[]; annuler?: boolean }, auteur: Auteur,
  deps: DepsAvis = {}): Promise<{ etat: 'ok'; data: { etat: EtatLocataires | null } } | { etat: 'refus'; motif: string } | { etat: 'sans_schema' }> {
  if (!(await reponsesRdvDisponible())) return { etat: 'sans_schema' };
  const motif = await rdvDesOccupations(d.sorte, d.tacheId, d.occupationIds);
  if (motif !== null) return { etat: 'refus', motif };
  const t = await tacheDuRdv(d.tacheId);
  if (t === null || t.jour === null) return { etat: 'refus', motif: 'Ce rendez-vous n’a pas de date.' };
  const cible: Cible = { sorte: d.sorte, tacheId: d.tacheId, jour: t.jour, heure: t.heure };
  const avant = (await etatsDesRdv([cible])).get(cleCible(cible)) ?? null;
  const enVigueur = avant?.etat === 'confirme' && avant.main;
  if (d.annuler === true ? !enVigueur : enVigueur) {
    return { etat: 'refus', motif: d.annuler === true ? 'Ce rendez-vous n’est pas validé à la main.' : 'Ce rendez-vous est déjà validé à la main.' };
  }
  await query(`INSERT INTO gestion_rdv_reponse (tache_id, sorte, creneau, nature, par_id, par_libelle) VALUES ($1, $2, $3, $4, $5, $6)`,
    [d.tacheId, d.sorte, creneauDe(t.jour, t.heure), d.annuler === true ? 'annulation_validation' : 'validation_main', auteur.id, auteur.libelle]);
  const apres = (await etatsDesRdv([cible])).get(cleCible(cible)) ?? null;
  await notifierSiBesoin(cible, avant, apres, d.occupationIds, deps);
  return { etat: 'ok', data: { etat: apres } };
}

// ══ LE MAIL INTERNE (confirmé, ou refusé par tous) ════════════════════════════════════════════════════════════════════════════════════

/** La personne qui a fixé le rendez-vous, ou qui l'a déplacé en dernier (son adresse de compte), ou `null`. */
export async function fixeurDuRdv(tacheId: number): Promise<string | null> {
  const { rows } = await query<{ identifiant: string | null }>(
    `SELECT u.identifiant FROM gestion_tache_action a JOIN admin_utilisateur u ON u.id = a.auteur_id
      WHERE a.tache_id = $1 AND a.action IN ('creation', 'decalage', 'modification') ORDER BY a.survenu_le DESC, a.id DESC LIMIT 1`, [tacheId]);
  return rows[0]?.identifiant ?? null;
}

/** Les destinataires du mail interne : qui a fixé (ou déplacé en dernier) le rendez-vous, puis les collaborateurs prévenus — sans doublon. */
export async function destinatairesInternesRdv(tacheId: number): Promise<string[]> {
  return adressesUniques([await fixeurDuRdv(tacheId), ...(await collaborateursInternes())]);
}

async function notifierSiBesoin(cible: Cible, avant: EtatLocataires | null, apres: EtatLocataires | null, occupationIds: readonly number[], deps: DepsAvis): Promise<void> {
  const quoi = notificationApres(avant, apres);
  if (quoi === null || apres === null) return;
  try {
    if (!(await mailsAvisDisponibles())) return;
    const c = await contexte(occupationIds, AUTEUR_REPONSES_RDV, deps);
    const a = await destinatairesInternesRdv(cible.tacheId);
    if (c === null || a.length === 0) return;
    const m = mailPrevisite({ sorte: quoi === 'confirme' ? 'rdv_confirmation_interne' : 'rdv_refus_interne', de: c.expediteur, a, cc: [],
      objet: objetInterneRdv(cible.sorte, quoi, c.adresse, cible),
      paragraphes: paragraphesInterneRdv({ sorte: cible.sorte, quoi, adresse: c.adresse, rdv: cible, etat: apres, lien: lienLignePreavis(occupationIds[0]) }),
      qui: { mention: MENTION_AUTOMATIQUE }, signature: c.signature });
    // un préavis de TEST : le mail reste dans son périmètre (au créateur du test, et à lui seul), comme les autres envois automatiques
    const p = await perimetreDuGeste({ occupationIds });
    if (!p.ok) return;
    const e = await avecPerimetreTest(p.perimetre, () => envoyerSerie([m], c.brute, { lotId: c.lotId, occupationIds, auteur: AUTEUR_REPONSES_RDV }, deps));
    if (e.some((x) => x.envoye)) {
      await query(`INSERT INTO gestion_rdv_reponse (tache_id, sorte, creneau, nature, par_libelle) VALUES ($1, $2, $3, $4, $5)`,
        [cible.tacheId, cible.sorte, creneauDe(cible.jour, cible.heure), quoi === 'confirme' ? 'notifie_confirme' : 'notifie_refus', AUTEUR_REPONSES_RDV.libelle]);
    }
  } catch (e) {
    console.error('[réponses rdv] mail interne', (e as Error)?.message);
  }
}

// ══ L'INVITATION DES LOCATAIRES À L'ÉTAT DES LIEUX (nouvelle) ═════════════════════════════════════════════════════════════════════════

/** Les mails d'invitation (ou de modification) des locataires à l'état des lieux — un par locataire et par adresse, puis la copie interne. PUR (contexte lu). */
export function mailsLocatairesEdls(c: Contexte, o: { tacheId: number; rdv: RdvPrevisite; ancien: RdvPrevisite | null; sequence: number; maintenant: Date;
  liens?: ReadonlyMap<number, LiensReponse> }): MailPrevisite[] {
  const sorte = o.ancien === null ? 'edls_locataires' as const : 'edls_locataires_modif' as const;
  const objet = o.ancien === null ? objetEdlsLocataires(c.adresse, o.rdv) : objetEdlsLocatairesModif(c.adresse, o.rdv);
  const ics: MailPrevisite['ics'] = {
    nom: NOM_FICHIER_ICS_EDLS,
    contenu: invitationIcs({ uid: uidEdls(o.tacheId, c.expediteur.split('@')[1] ?? ''), sequence: o.sequence, rdv: o.rdv, maintenant: o.maintenant,
      titre: `État des lieux de sortie — ${c.adresse}`, lieu: c.adresse,
      // comme pour la pré-visite : aucun nom dans l'invitation (elle part aux locataires, sans liste de participants)
      description: `État des lieux de sortie du logement situé ${c.adresse}.` }),
  };
  const envois = c.locataires.flatMap((l) => {
    const m = mailRdvLocataire({ sorte, de: c.expediteur, objet, adresse: c.adresse, rdv: o.rdv, ancien: o.ancien, locataire: l, qui: c.qui, signature: c.signature, ics,
      boutons: o.liens?.get(l.occupationId) ?? null });
    return m === null ? [] : unMailParAdresse(m);
  });
  const premier = c.locataires.find((l) => adressesUniques(l.emails).length > 0);
  if (premier === undefined) return envois;
  // la copie interne : le texte du premier locataire, SANS ses liens personnels (jamais de lien d'un locataire dans une copie)
  const paragraphes = paragraphesDesParties(o.ancien === null ? partiesEdlsLocataires() : partiesEdlsLocatairesModif(), null,
    { [REPERE_NOM]: prenomNom(premier), adresse: c.adresse, 'rendez-vous': creneauFr(o.rdv), ...(o.ancien ? { 'ancien rendez-vous': creneauFr(o.ancien) } : {}) });
  const copie = copieInterneLocataires({ sorte, de: c.expediteur, a: copiesAvis(c.expediteur, c.qui, []), objet, envois, locataires: c.locataires, paragraphes, qui: c.qui, signature: c.signature });
  return copie === null ? envois : [...envois, copie];
}

export const MOTIF_EDLS_SANS_495 = 'l’invitation des locataires à l’état des lieux n’est pas encore installée sur ce serveur (migration 495 non appliquée).';

/** Le dernier créneau pour lequel les locataires ont été invités à l'état des lieux de cette tâche (l'« ancien » d'une modification), ou `null`. */
async function dernierCreneauInvite(tacheId: number): Promise<RdvPrevisite | null> {
  const { rows } = await query<{ creneau: string; duree: number | null }>(
    `SELECT creneau, duree_minutes AS duree FROM gestion_rdv_jeton WHERE tache_id = $1 AND sorte = 'edl' ORDER BY cree_le DESC, id DESC LIMIT 1`, [tacheId]);
  const p = rows[0];
  return p === undefined ? null : { jour: p.creneau.slice(0, 10), heure: p.creneau.slice(11, 16), dureeMinutes: p.duree ?? 60 };
}

const minutesDe = (h: string): number | null => { const m = /^(\d{2}):(\d{2})/.exec(h); return m === null ? null : Number(m[1]) * 60 + Number(m[2]); };

/**
 * 🔴 Arno (18/11/2026, 2e lot) — ce que le RÉCAPITULATIF de l'état des lieux dit des locataires, selon le choix « Oui / Non » (LECTURE : rien
 * n'est écrit, rien ne part ; les liens personnels sont montrés comme « créés à l'envoi »).
 */
export async function apercuLocatairesEdls(d: { occupationIds: readonly number[]; jour: string; debut: string; fin: string; deplacer: boolean; choix: ChoixLocataires },
  auteur: Auteur, deps: DepsAvis = {}): Promise<ApercuLocataires> {
  const vide: ApercuLocataires = { choix: d.choix, invites: [], sansEmail: [], impossible: null, texte: null };
  if (d.choix === 'non') return vide;
  if (!(await reponsesRdvDisponible())) return { ...vide, impossible: MOTIF_EDLS_SANS_495 };
  const ids = [...new Set(d.occupationIds)];
  const c = await contexte(ids, auteur, deps);
  if (c === null) return vide;
  const a = minutesDe(d.debut);
  const b = minutesDe(d.fin);
  const rdv: RdvPrevisite = { jour: d.jour, heure: d.debut.slice(0, 5), dureeMinutes: a !== null && b !== null && b > a ? b - a : 60 };
  let ancien: RdvPrevisite | null = null;
  if (d.deplacer) {
    const { rows } = await query<{ tache_id: string }>(
      `SELECT e.tache_id::text FROM gestion_location_edls e JOIN gestion_tache t ON t.id = e.tache_id
        WHERE e.clos_le IS NULL AND t.etat = 'a_faire' AND e.occupation_ids && $1::bigint[] ORDER BY e.id DESC LIMIT 1`, [ids]);
    if (rows[0]) ancien = await dernierCreneauInvite(Number(rows[0].tache_id));
  }
  const liens = new Map(c.locataires.map((l) => [l.occupationId, LIENS_APERCU] as const));
  const mails = mailsLocatairesEdls(c, { tacheId: 0, rdv, ancien, sequence: 0, maintenant: new Date(), liens }).filter((m) => !m.objet.startsWith('[Copie interne]'));
  const invites = c.locataires.filter((l) => adressesUniques(l.emails).length > 0).map((l) => prenomNom(l));
  return { choix: 'oui', invites, sansEmail: sansEmail(c), impossible: null, texte: mails[0]?.texte ?? null };
}

/**
 * APRÈS « Planifier » ou « Déplacer » l'état des lieux, avec « Envoyer l'invitation aux locataires : Oui » : l'invitation (ou la modification)
 * aux locataires, avec leurs boutons. Un créneau déjà invité n'est jamais réinvité (double clic). Ne lève jamais : un échec n'annule pas le geste.
 */
export async function envoyerMailLocatairesEdls(tacheId: number, occupationIds: readonly number[], auteur: Auteur,
  deps: DepsAvis & { maintenant?: Date } = {}): Promise<{ envois: EnvoiAvis[]; sansEmail: string[] }> {
  try {
    if (!(await reponsesRdvDisponible()) || !(await mailsAvisDisponibles())) {
      return { envois: [{ sorte: 'edls_locataires', objet: 'Mail aux locataires', a: [], cc: [], envoye: false, motif: MOTIF_EDLS_SANS_495 }], sansEmail: [] };
    }
    const t = await tacheDuRdv(tacheId);
    if (t === null || t.etat !== 'a_faire' || t.jour === null || t.heure === null) return { envois: [], sansEmail: [] };
    const rdv: RdvPrevisite = { jour: t.jour, heure: t.heure, dureeMinutes: t.duree ?? 60 };
    const creneau = creneauDe(rdv.jour, rdv.heure);
    const { rows: deja } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM gestion_rdv_jeton WHERE tache_id = $1 AND sorte = 'edl' AND creneau = $2`, [tacheId, creneau]);
    if (Number(deja[0]?.n ?? 0) > 0) return { envois: [], sansEmail: [] };
    const ancien = await dernierCreneauInvite(tacheId);
    const ids = [...new Set(occupationIds)];
    const c = await contexte(ids, auteur, deps);
    if (c === null) return { envois: [], sansEmail: [] };
    const liens = await creerJetons({ tacheId, sorte: 'edl', rdv, occupationIds: ids, locataires: c.locataires, auteur });
    const mails = mailsLocatairesEdls(c, { tacheId, rdv, ancien, sequence: await sequenceTache(tacheId), maintenant: deps.maintenant ?? new Date(), liens });
    return { envois: mails.length === 0 ? [] : await envoyerSerie(mails, c.brute, { lotId: c.lotId, occupationIds: ids, auteur }, deps), sansEmail: sansEmail(c) };
  } catch (e) {
    return { envois: [{ sorte: 'edls_locataires', objet: 'Mail aux locataires', a: [], cc: [], envoye: false, motif: (e as Error)?.message || 'erreur inattendue' }], sansEmail: [] };
  }
}

// ══ 🔴🔴 LA MISE À JOUR IMMÉDIATE DES CARTOUCHES (Arno, 18/11/2026, 2e lot) ═══════════════════════════════════════════════════════════════════
// « Dès qu'un collègue ou un locataire répond, les cartouches changent sur les écrans ouverts en quelques secondes au plus, sans recharger la
// page. » Technique retenue : l'écran ouvert lit, toutes les quelques secondes (onglet visible seulement), cette EMPREINTE — trois compteurs
// légers (index de clé primaire, petites tables) — et ne relit les lignes que lorsqu'elle change. Pas de connexion tenue ouverte : rien à
// reprendre après une mise en veille du téléphone, rien qui tienne une connexion de la base par écran ouvert.

/** L'empreinte de l'état des rendez-vous : change dès qu'un locataire répond, qu'un collègue accepte ou refuse, ou qu'un rendez-vous bouge. LECTURE. */
export async function versionRdv(): Promise<string> {
  const parts: string[] = [];
  try {
    if (await reponsesRdvDisponible()) {
      const { rows } = await query<{ v: string }>('SELECT coalesce(max(id), 0)::text AS v FROM gestion_rdv_reponse');
      parts.push(`r${rows[0]?.v ?? 0}`);
    }
    if (await colonneExisteMemo('gestion_tache_demande', 'repondu_le')) {
      const { rows } = await query<{ v: string }>(
        `SELECT count(*)::text || '-' || coalesce(to_char(max(greatest(cree_le, repondu_le, remplacee_le)) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISSUS'), '0') AS v FROM gestion_tache_demande`);
      parts.push(`d${rows[0]?.v ?? 0}`);
    }
    if (await colonneExisteMemo('gestion_tache_action', 'action')) {
      const { rows } = await query<{ v: string }>('SELECT coalesce(max(id), 0)::text AS v FROM gestion_tache_action');
      parts.push(`a${rows[0]?.v ?? 0}`);
    }
  } catch (e) {
    console.error('[réponses rdv] empreinte', (e as Error)?.message);
  }
  return parts.join('.');
}
