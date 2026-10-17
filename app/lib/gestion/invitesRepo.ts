import 'server-only';
import { query, withTransaction, type RequeteTx } from '../db/client';
import type { Auteur } from './gestes';
import { lireDomainesAutorises } from './comptesGoogleRepo';
import { lireDomaines } from './googleCollaborateur';
import { collaborateursPourTache, type CollaborateurTache } from './taches';
import { acceptationInitiale, attenteAvantRenvoi, messageAttenteRenvoi, refusChangementDestinataire, type EtatMail, type InviteTache, type StatutAcceptation } from './acceptationTache';
import { poserDemande, type AncienneDate, type DemandePosee, type RaisonDemande } from './acceptationRepo';
import { marquerASynchroniser } from './agendaSynchroRepo';
import { invitesTacheDisponible } from './schema';

/**
 * ══ 🔴🔴 LOT GESTION-INVITATIONS-TACHES (17/10/2026) — LES INVITÉS D'UNE TÂCHE (migration 365) ══════════════════════
 *
 * DEMANDE D'ARNO : une même tâche invite PLUSIEURS collaborateurs ; chacun a son lien, sa réponse et son jeton à usage
 * unique ; chaque invité qui accepte voit la tâche dans SON agenda, sans doublon ; « Changer le destinataire » d'un
 * invité en attente rend l'ancien lien inutilisable (« Cette invitation ne vous est plus destinée ») et invite le nouveau.
 *
 * 🔴 RÈGLES :
 *   ① RIEN NE S'EFFACE : un invité retiré, ou remplacé par un autre destinataire, est MARQUÉ (`retire_le`,
 *     `retire_raison`, `remplace_par`) ; sa demande passe « remplacée » (son lien cesse aussitôt d'agir) ;
 *   ② la personne « Confiée à » est le premier invité ; la colonne `gestion_tache.confiee_a` la suit ;
 *   ③ chaque geste écrit sa trace dans `gestion_tache_action`, dans la même transaction ;
 *   ④ un invité qui a ACCEPTÉ ne change pas de destinataire (`refusChangementDestinataire`) : on le retire (« Modifier »).
 */

export interface PersonneInvitee { id: number; libelle: string }

const iso = (d: Date | string | null): string | null => (d === null ? null : new Date(d).toISOString());

interface LigneInvite {
  id: number; tache_id: number; collaborateur_id: number | null; libelle: string; principal: boolean;
  statut: string | null; automatique: boolean | null; motif: string | null; repondu_le: Date | null; demande_le: Date | null;
  mail_etat: string | null; dernier_renvoi_le: Date | null;
}

const SQL_INVITES = `
  SELECT i.id::int AS id, i.tache_id::int AS tache_id, i.collaborateur_id::int AS collaborateur_id, i.libelle,
         (i.collaborateur_id IS NOT DISTINCT FROM t.confiee_a) AS principal,
         d.statut, d.automatique, d.motif, d.repondu_le, d.cree_le AS demande_le, d.mail_etat,
         (SELECT max(r.cree_le) FROM gestion_tache_demande r WHERE r.invite_id = i.id AND r.raison = 'renvoi') AS dernier_renvoi_le
    FROM gestion_tache_invite i
    JOIN gestion_tache t ON t.id = i.tache_id
    LEFT JOIN gestion_tache_demande d ON d.invite_id = i.id AND d.statut <> 'remplacee'
   WHERE i.tache_id = ANY($1::bigint[]) AND i.retire_le IS NULL
   ORDER BY i.tache_id, (i.collaborateur_id IS NOT DISTINCT FROM t.confiee_a) DESC, i.rang, i.id`;

function versInvite(r: LigneInvite): InviteTache {
  const statut = r.statut === 'en_attente' || r.statut === 'acceptee' || r.statut === 'refusee' ? r.statut : null;
  return {
    inviteId: Number(r.id), collaborateurId: r.collaborateur_id === null ? null : Number(r.collaborateur_id), libelle: r.libelle,
    principal: r.principal === true, statut, automatique: r.automatique === true, motif: r.motif,
    reponduLe: iso(r.repondu_le), demandeLe: iso(r.demande_le), mailEtat: (r.mail_etat ?? 'aucun') as EtatMail,
    dernierRenvoiLe: iso(r.dernier_renvoi_le),
  };
}

/** Les invités ACTIFS de chaque tâche, avec leur demande courante. Une requête pour toute la liste. */
export async function invitesDesTaches(ids: readonly number[], q: RequeteTx = query): Promise<Map<number, InviteTache[]>> {
  const m = new Map<number, InviteTache[]>();
  if (ids.length === 0 || !(await invitesTacheDisponible())) return m;
  const { rows } = await q<LigneInvite>(SQL_INVITES, [ids]);
  for (const r of rows) {
    const l = m.get(Number(r.tache_id)) ?? [];
    l.push(versInvite(r));
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

/** Les invités actifs d'UNE tâche, verrouillés pour le geste (lus AVANT d'écrire). */
async function invitesPourGeste(q: RequeteTx, tacheId: number): Promise<(InviteTache & { rang: number })[]> {
  const { rows } = await q<LigneInvite & { rang: number }>(
    `SELECT i.id::int AS id, i.tache_id::int AS tache_id, i.collaborateur_id::int AS collaborateur_id, i.libelle, i.rang,
            (i.collaborateur_id IS NOT DISTINCT FROM t.confiee_a) AS principal,
            d.statut, d.automatique, d.motif, d.repondu_le, d.cree_le AS demande_le, d.mail_etat,
            (SELECT max(r.cree_le) FROM gestion_tache_demande r WHERE r.invite_id = i.id AND r.raison = 'renvoi') AS dernier_renvoi_le
       FROM gestion_tache_invite i
       JOIN gestion_tache t ON t.id = i.tache_id
       LEFT JOIN gestion_tache_demande d ON d.invite_id = i.id AND d.statut <> 'remplacee'
      WHERE i.tache_id = $1 AND i.retire_le IS NULL
      ORDER BY (i.collaborateur_id IS NOT DISTINCT FROM t.confiee_a) DESC, i.rang, i.id
      FOR UPDATE OF i`, [tacheId]);
  return rows.map((r) => ({ ...versInvite(r), rang: Number(r.rang) }));
}

/** Les invités actifs d'une tâche, comme personnes (pour relancer tout le monde après un décalage). */
export async function personnesInvitees(q: RequeteTx, tacheId: number): Promise<PersonneInvitee[]> {
  return (await invitesPourGeste(q, tacheId))
    .filter((i) => i.collaborateurId !== null).map((i) => ({ id: Number(i.collaborateurId), libelle: i.libelle }));
}

async function insererInvite(q: RequeteTx, tacheId: number, p: PersonneInvitee, rang: number, nom: string): Promise<number> {
  const { rows } = await q<{ id: number }>(
    `INSERT INTO gestion_tache_invite (tache_id, collaborateur_id, libelle, email, rang, ajoute_par_libelle)
     VALUES ($1, $2, $3, (SELECT identifiant FROM admin_utilisateur WHERE id = $2), $4, $5) RETURNING id::int AS id`,
    [tacheId, p.id, p.libelle, rang, nom]);
  return Number(rows[0].id);
}

async function retirerInvite(q: RequeteTx, inviteId: number, nom: string, raison: 'retire' | 'destinataire_change',
  remplacePar: number | null = null): Promise<void> {
  await q(
    `UPDATE gestion_tache_invite SET retire_le = now(), retire_par_libelle = $2, retire_raison = $3, remplace_par = $4
      WHERE id = $1 AND retire_le IS NULL`, [inviteId, nom, raison, remplacePar]);
  // Son lien cesse AUSSITÔT d'agir (« Cette invitation ne vous est plus destinée »).
  await q(`UPDATE gestion_tache_demande SET statut = 'remplacee', remplacee_le = now()
            WHERE invite_id = $1 AND statut <> 'remplacee'`, [inviteId]);
}

/**
 * ALIGNE les invités actifs d'une tâche sur la liste voulue (dans l'ordre : « Confiée à » d'abord), dans la transaction
 * du geste. Un invité absent de la liste est RETIRÉ (tracé, son lien cesse d'agir) ; un nouveau reçoit SA demande ; un
 * invité gardé ne bouge pas — sauf `relancer` (date ou heure changée), qui lui pose une nouvelle demande (règle 5 de
 * l'acceptation), sauf s'il s'agit de soi-même, déjà acceptée d'office. Rend les demandes posées.
 */
export async function alignerInvites(q: RequeteTx, o: {
  tacheId: number; voulus: readonly PersonneInvitee[]; auteur: Auteur; nom: string; relancer: boolean; creation: boolean;
  /** 🔴 LOT GESTION-DECALER-TACHE — la date d'avant : les invités GARDÉS reçoivent « Tâche déplacée » ; les nouveaux, non. */
  ancienneDate?: AncienneDate;
}): Promise<DemandePosee[]> {
  const actifs = await invitesPourGeste(q, o.tacheId);
  const voulus = new Set(o.voulus.map((p) => Number(p.id)));
  for (const i of actifs) {
    if (i.collaborateurId !== null && voulus.has(Number(i.collaborateurId))) continue;
    await retirerInvite(q, i.inviteId, o.nom, 'retire');
    await tracer(q, o.tacheId, { invite: i.libelle, statut: i.statut }, { inviteRetire: i.libelle }, o.auteur, o.nom);
  }
  const demandes: DemandePosee[] = [];
  for (const [rang, p] of o.voulus.entries()) {
    const deja = actifs.find((i) => i.collaborateurId !== null && Number(i.collaborateurId) === Number(p.id));
    if (deja !== undefined) {
      if (deja.rang !== rang) await q(`UPDATE gestion_tache_invite SET rang = $2 WHERE id = $1`, [deja.inviteId, rang]);
      if (!o.relancer) continue;
      if (acceptationInitiale(p.id, o.auteur.id) === 'acceptee' && deja.statut === 'acceptee') continue;
      demandes.push(await poserDemande(q, {
        tacheId: o.tacheId, confieeA: p.id, confieeLibelle: p.libelle, auteur: o.auteur, nom: o.nom, inviteId: deja.inviteId, raison: 'relance',
        ...(o.ancienneDate ? { ancienneDate: o.ancienneDate } : {}),
      }));
      continue;
    }
    const inviteId = await insererInvite(q, o.tacheId, p, rang, o.nom);
    if (!o.creation) await tracer(q, o.tacheId, null, { inviteAjoute: p.libelle }, o.auteur, o.nom);
    demandes.push(await poserDemande(q, {
      tacheId: o.tacheId, confieeA: p.id, confieeLibelle: p.libelle, auteur: o.auteur, nom: o.nom, inviteId,
      raison: (o.creation ? 'creation' : 'ajout') satisfies RaisonDemande,
    }));
  }
  return demandes;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   « CHANGER LE DESTINATAIRE » d'un invité encore en attente (ou qui a refusé)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type IssueInvite =
  | { ok: true; id: number; demandes: DemandePosee[]; message: string }
  | { ok: false; statut: number; motif: string };

const SQL_COMPTE = `
  SELECT id::int AS id, btrim(prenom || ' ' || nom) AS libelle, identifiant, actif,
         (role = 'administrateur' OR perm_gestion) AS "accesGestion"
    FROM admin_utilisateur WHERE id = $1 AND actif`;

/** Le compte choisi, relu en base et passé à LA règle « Confiée à » (`peutRecevoirUneTache`). Jamais cru sur parole. */
export async function personneValide(q: RequeteTx, id: number | null): Promise<CollaborateurTache | null> {
  if (id === null) return null;
  const { rows } = await q<CollaborateurTache & { actif: boolean; identifiant: string | null }>(SQL_COMPTE, [id]);
  return collaborateursPourTache(rows, lireDomaines(await lireDomainesAutorises()), null)[0] ?? null;
}

async function nomAuteur(q: RequeteTx, auteur: Auteur): Promise<string> {
  if (auteur.id !== null) {
    const { rows } = await q<{ l: string }>(`SELECT btrim(prenom || ' ' || nom) AS l FROM admin_utilisateur WHERE id = $1`, [auteur.id]);
    const l = (rows[0]?.l ?? '').trim();
    if (l !== '') return l;
  }
  return auteur.libelle.trim() === '' ? 'inconnu' : auteur.libelle;
}

export async function changerDestinataire(tacheId: number, inviteId: number, nouveauId: number, auteur: Auteur): Promise<IssueInvite> {
  if (!(await invitesTacheDisponible())) return { ok: false, statut: 503, motif: 'Invités non installés (migration 365).' };
  return withTransaction(async (q) => {
    const t = (await q<{ etat: string; confiee_a: number | null }>(
      `SELECT etat, confiee_a::int AS confiee_a FROM gestion_tache WHERE id = $1 FOR UPDATE`, [tacheId])).rows[0];
    if (t === undefined) return { ok: false, statut: 404, motif: 'Tâche introuvable.' };
    if (t.etat !== 'a_faire') return { ok: false, statut: 409, motif: 'Cette tâche n’est plus à faire.' };
    const actifs = await invitesPourGeste(q, tacheId);
    const ancien = actifs.find((i) => i.inviteId === Number(inviteId));
    if (ancien === undefined) return { ok: false, statut: 409, motif: 'Cet invité n’est plus dans la tâche (déjà remplacé ou retiré).' };
    const refus = refusChangementDestinataire(ancien.statut);
    if (refus !== null) return { ok: false, statut: 409, motif: refus };
    const c = await personneValide(q, nouveauId);
    if (c === null) return { ok: false, statut: 400, motif: 'Cette personne n’a pas de compte actif avec une adresse de notre Workspace.' };
    if (actifs.some((i) => i.collaborateurId !== null && Number(i.collaborateurId) === Number(c.id))) {
      return { ok: false, statut: 409, motif: `${c.libelle} est déjà invité(e) à cette tâche.` };
    }
    const nom = await nomAuteur(q, auteur);
    const nouveauInviteId = await insererInvite(q, tacheId, { id: c.id, libelle: c.libelle }, ancien.rang, nom);
    await retirerInvite(q, ancien.inviteId, nom, 'destinataire_change', nouveauInviteId);
    if (ancien.principal) {
      // « Confiée à » suit le premier invité.
      await q(`UPDATE gestion_tache SET confiee_a = $2, confiee_a_libelle = $3, maj_le = now() WHERE id = $1`, [tacheId, c.id, c.libelle]);
    }
    await tracer(q, tacheId, { destinataire: ancien.libelle, statut: ancien.statut as StatutAcceptation | null },
      { destinataireChange: c.libelle }, auteur, nom);
    const demande = await poserDemande(q, {
      tacheId, confieeA: c.id, confieeLibelle: c.libelle, auteur, nom, inviteId: nouveauInviteId, raison: 'destinataire_change',
    });
    await marquerASynchroniser(q, tacheId);
    return { ok: true, id: tacheId, demandes: [demande], message: `Destinataire changé : ${ancien.libelle} → ${c.libelle}.` };
  });
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT 2 — « RENVOYER L'INVITATION » à un invité en attente
   Un nouveau lien ; l'ancien cesse aussitôt d'agir. Au moins 2 minutes entre deux renvois au même invité.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le refus de renvoi, lu AVANT toute écriture (`null` = permis). */
function refusRenvoi(i: InviteTache, maintenant: Date): { statut: number; motif: string } | null {
  if (i.statut !== 'en_attente') {
    return { statut: 409, motif: i.statut === 'acceptee'
      ? `${i.libelle} a déjà accepté : il n’y a pas d’invitation à renvoyer.`
      : `${i.libelle} a refusé : changez le destinataire, ou modifiez la tâche, plutôt que de renvoyer.` };
  }
  const attente = attenteAvantRenvoi(i.dernierRenvoiLe, maintenant);
  return attente > 0 ? { statut: 429, motif: messageAttenteRenvoi(attente, i.libelle) } : null;
}

export async function renvoyerInvitation(tacheId: number, inviteId: number, auteur: Auteur, maintenant: Date = new Date()): Promise<IssueInvite> {
  if (!(await invitesTacheDisponible())) return { ok: false, statut: 503, motif: 'Invités non installés (migration 365).' };
  return withTransaction(async (q) => {
    const t = (await q<{ etat: string }>(`SELECT etat FROM gestion_tache WHERE id = $1 FOR UPDATE`, [tacheId])).rows[0];
    if (t === undefined) return { ok: false, statut: 404, motif: 'Tâche introuvable.' };
    if (t.etat !== 'a_faire') return { ok: false, statut: 409, motif: 'Cette tâche n’est plus à faire.' };
    const i = (await invitesPourGeste(q, tacheId)).find((x) => x.inviteId === Number(inviteId));
    if (i === undefined) return { ok: false, statut: 409, motif: 'Cet invité n’est plus dans la tâche (remplacé ou retiré).' };
    const refus = refusRenvoi(i, maintenant);
    if (refus !== null) return { ok: false, ...refus };
    const nom = await nomAuteur(q, auteur);
    await tracer(q, tacheId, null, { invitationRenvoyee: i.libelle }, auteur, nom);
    const demande = await poserDemande(q, {
      tacheId, confieeA: i.collaborateurId, confieeLibelle: i.libelle, auteur, nom, motifTrace: 'renvoi', inviteId: i.inviteId, raison: 'renvoi',
    });
    return { ok: true, id: tacheId, demandes: [demande], message: `Invitation renvoyée à ${i.libelle}.` };
  });
}

/** Le dernier renvoi à l'invité « Confiée à » (pour le bouton d'avant, « Renvoyer la demande »). */
export async function refusRenvoiPrincipal(q: RequeteTx, tacheId: number, maintenant: Date = new Date()): Promise<{ statut: number; motif: string } | null> {
  const i = (await invitesPourGeste(q, tacheId)).find((x) => x.principal);
  if (i === undefined || i.statut !== 'en_attente') return null;
  const attente = attenteAvantRenvoi(i.dernierRenvoiLe, maintenant);
  return attente > 0 ? { statut: 429, motif: messageAttenteRenvoi(attente, i.libelle) } : null;
}

/** L'erreur RÉELLE d'un mail qui n'est pas parti (colonne `mail_erreur` de la demande). */
export async function erreurMailDemande(demandeId: number): Promise<string | null> {
  const { rows } = await query<{ e: string | null }>(`SELECT mail_erreur AS e FROM gestion_tache_demande WHERE id = $1`, [demandeId]);
  return rows[0]?.e ?? null;
}
