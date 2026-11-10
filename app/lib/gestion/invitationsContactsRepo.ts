import { randomBytes } from 'node:crypto';
import { query } from '../db/client';
import type { Auteur } from './gestes';
import { chargerConfigGestion } from './config';
import { fabriquerMessageId } from './envoiGmail';
import { transportParDefaut, type TransportDemande } from './envoiDemandeTache';
import { invitationContactsDisponible } from './schema';
import { titreLogement } from './annuaireRecherche';
import { adressesSignature, corpsPourEnvoi } from './signatureImages';
import { imagesSignaturePourEnvoi } from './signatureImagesReel';
import { lireReglageTaches } from './acceptationRepo';
import { listerCollaborateurs, contactsCopies } from './tachesRepo';
import { personnesInvitees } from './invitesRepo';
import { contactsDuBienPourTache } from './contactsTacheRepo';
import { invitesDeLaSaisie, type SaisieTache } from './taches';
import { mailTache } from './mailTache';
import type { ContactSource } from './contactsTache';
import { signatureEcran, type DepsAvis } from '../location/mailsPreavisSortieRepo';
import { icsTacheExterne, mailTacheExterne, type SorteMailExterne } from './mailTacheExterne';

/**
 * ══ 🔴🔴 INVITER LES CONTACTS D'UNE TÂCHE, EN TOUTE CONFIDENTIALITÉ — LE DÉPÔT (Arno, 10/11/2026, migration 465) ════════════════════════
 *
 *   · `envoyerAuxContacts` — après le geste (création, modification, décalage) : à CHAQUE contact coché « Envoyer une invitation », SON
 *     mail — seul destinataire, aucune copie, le contenu restreint de `mailTacheExterne` et une invitation d'agenda sans participants —, une
 *     seule fois par invitation (une modification seulement si la date a changé). Chaque mail au journal (`gestion_tache_contact_envoi`).
 *     Un contact non coché ne reçoit RIEN.
 *   · `apercuEnvoisTache` — le RÉCAPITULATIF avant tout envoi : qui (collaborateurs, extérieurs, séparés), combien, et le texte reçu par un
 *     collaborateur et par un extérieur. Lecture seule.
 * Le canal est celui des mails de tâche (`transportParDefaut` : factice sous les tests, intercepté en RECETTE). Sans la 465 : rien.
 */

export interface EnvoiExterne { nom: string; email: string | null; sorte: SorteMailExterne; envoye: boolean; motif: string | null }

interface ContactInvite { id: number; cle: string; nom: string; email: string | null; dejaInvite: boolean }
type Moment = { jour: string; heure: string | null; dureeMinutes: number | null };

const premierEmail = (coordonnees: unknown): string | null => {
  const l = Array.isArray(coordonnees) ? coordonnees as { sorte?: string; valeur?: string }[] : [];
  const e = l.find((c) => c?.sorte === 'email' && typeof c.valeur === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.valeur.trim()));
  return e?.valeur?.trim() ?? null;
};
const memeMoment = (a: Moment, b: Moment): boolean => a.jour === b.jour && a.heure === b.heure && (a.dureeMinutes ?? 60) === (b.dureeMinutes ?? 60);

async function lireTache(tacheId: number): Promise<{ objet: string; note: string | null; moment: Moment; adresse: string | null } | null> {
  const { rows } = await query<{ objet: string; note: string | null; jour: string; heure: string | null; duree: number | null; lot_id: number | null; adresse: string | null; commune: string | null }>(
    `SELECT t.objet, t.note, to_char(t.jour, 'YYYY-MM-DD') AS jour, to_char(t.heure, 'HH24:MI') AS heure, t.duree_minutes AS duree,
            t.lot_id::int AS lot_id, l.adresse, l.commune
       FROM gestion_tache t LEFT JOIN gestion_annuaire_lot l ON l.id = t.lot_id WHERE t.id = $1`, [tacheId]);
  const r = rows[0];
  if (r === undefined) return null;
  return { objet: r.objet, note: r.note, moment: { jour: r.jour, heure: r.heure, dureeMinutes: r.duree === null ? null : Number(r.duree) },
    adresse: r.lot_id === null ? null : titreLogement(r.adresse, r.commune) };
}

/** Y a-t-il au moins un contact coché « Envoyer une invitation » ? (Sinon, rien à envoyer, aucune question de droit.) */
export async function contactsAInviter(tacheId: number): Promise<boolean> {
  try {
    if (!(await invitationContactsDisponible())) return false;
    const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM gestion_tache_contact WHERE tache_id = $1 AND retire_le IS NULL AND inviter', [tacheId]);
    return Number(rows[0]?.n ?? 0) > 0;
  } catch { return false; }
}

/** Le moment d'une tâche (avant un geste, pour savoir si la date a changé). */
export async function momentDeLaTache(tacheId: number): Promise<Moment | null> {
  return (await lireTache(tacheId))?.moment ?? null;
}

async function contactsInvites(tacheId: number): Promise<ContactInvite[]> {
  const { rows } = await query<{ id: string; cle: string; nom: string; coordonnees: unknown; deja: boolean }>(
    `SELECT c.id::text, c.cle, c.nom, c.coordonnees,
            EXISTS (SELECT 1 FROM gestion_tache_contact_envoi e WHERE e.contact_id = c.id AND e.statut = 'envoye' AND e.sorte <> 'annulation') AS deja
       FROM gestion_tache_contact c WHERE c.tache_id = $1 AND c.retire_le IS NULL AND c.inviter ORDER BY c.rang, c.id`, [tacheId]);
  return rows.map((r) => ({ id: Number(r.id), cle: r.cle, nom: r.nom, email: premierEmail(r.coordonnees), dejaInvite: r.deja }));
}

async function sequenceTache(tacheId: number): Promise<number> {
  const { rows } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_tache_action WHERE tache_id = $1 AND action = 'decalage'`, [tacheId]);
  return Number(rows[0]?.n ?? 0);
}

/**
 * APRÈS LE GESTE : un mail par contact invité. `ancien` : la date d'avant (modification, décalage) — un contact déjà invité ne reçoit
 * un mail de modification que si elle a changé. Ne lève jamais : un échec est rendu (et journalisé), jamais un faux « envoyé ».
 */
export async function envoyerAuxContacts(tacheId: number, o: { ancien: Moment | null }, auteur: Auteur,
  deps: DepsAvis & { transport?: TransportDemande; maintenant?: Date } = {}): Promise<EnvoiExterne[]> {
  try {
    if (!(await invitationContactsDisponible())) return [];
    const t = await lireTache(tacheId);
    if (t === null) return [];
    const changee = o.ancien !== null && !memeMoment(o.ancien, t.moment);
    const cibles = (await contactsInvites(tacheId))
      .map((c) => ({ c, sorte: (!c.dejaInvite ? 'invitation' : changee ? 'modification' : null) as SorteMailExterne | null }))
      .filter((x): x is { c: ContactInvite; sorte: SorteMailExterne } => x.sorte !== null);
    if (cibles.length === 0) return [];
    const config = await chargerConfigGestion();
    const sig = await signatureEcran(deps);
    const sequence = await sequenceTache(tacheId);
    const domaine = config.adresseGestion.split('@')[1] ?? 'criterimmo.fr';
    const out: EnvoiExterne[] = [];
    for (const { c, sorte } of cibles) {
      if (c.email === null) { out.push({ nom: c.nom, email: null, sorte, envoye: false, motif: 'pas d’adresse e-mail' }); continue; }
      const contenu = { sorte, titre: t.objet, jour: t.moment.jour, heure: t.moment.heure, dureeMinutes: t.moment.dureeMinutes, adresse: t.adresse,
        notes: t.note, ancien: sorte === 'modification' ? o.ancien : null, signature: sig.ecran };
      const m = mailTacheExterne(contenu);
      const ics = icsTacheExterne({ ...contenu, tacheId, domaine, sequence, maintenant: deps.maintenant ?? new Date() });
      const alea = randomBytes(12).toString('hex');
      const messageId = fabriquerMessageId(domaine, alea, new Date());
      let issue: { ok: true } | { ok: false; motif: string };
      try {
        const rangs = adressesSignature(sig.brute).map((_, i) => i);
        const images = rangs.length === 0 ? [] : (await (deps.imagesSignature ?? imagesSignaturePourEnvoi)(rangs, domaine, alea).catch(() => ({ images: [] }))).images;
        const r = await (deps.transport ?? transportParDefaut()).envoyer({
          de: config.adresseGestion, deNom: 'Gestion', a: [c.email], cc: [], cci: [], objet: m.objet, corps: m.texte, corpsHtml: corpsPourEnvoi(m.html, images).html, messageId,
          ...(images.length > 0 ? { imagesIntegrees: images.map(({ cid, nom, typeMime, octets }) => ({ cid, nom, typeMime, octets })) } : {}),
          ...(ics !== null ? { pieces: [{ nom: 'rendez-vous.ics', typeMime: `text/calendar; charset=UTF-8; method=${sorte === 'annulation' ? 'CANCEL' : 'PUBLISH'}`, octets: Buffer.from(ics, 'utf8') }] } : {}),
        });
        issue = r.ok ? { ok: true } : { ok: false, motif: r.motif };
      } catch (e) { issue = { ok: false, motif: (e as Error)?.message || 'erreur inattendue' }; }
      await query(
        `INSERT INTO gestion_tache_contact_envoi (tache_id, contact_id, sorte, email, objet, texte, statut, erreur, message_id, auteur_id, auteur_libelle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [tacheId, c.id, sorte, c.email, m.objet, m.texte, issue.ok ? 'envoye' : 'echec', issue.ok ? null : issue.motif, issue.ok ? messageId : null,
          auteur.id, auteur.libelle || 'Gestion']).catch((e) => console.error('[tâches] journal du mail extérieur impossible', (e as Error)?.message));
      out.push({ nom: c.nom, email: c.email, sorte, envoye: issue.ok, motif: issue.ok ? null : issue.motif });
    }
    return out;
  } catch (e) {
    console.error('[tâches] invitations des contacts impossibles', (e as Error)?.message);
    return [];
  }
}

// ══ LE RÉCAPITULATIF AVANT ENVOI ═══════════════════════════════════════════════════════════════════════════════════════════════════

export type GesteApercu = 'creer' | 'modifier' | 'decaler' | 'renvoyerDemande' | 'renvoyerInvitation' | 'changerDestinataire';

export interface ApercuEnvois {
  collaborateurs: { libelle: string; mail: boolean; motif: string | null }[];
  exterieurs: { nom: string; email: string | null; sorte: SorteMailExterne; mail: boolean; motif: string | null }[];
  /** Le nombre d'invitations qui vont réellement partir. */
  total: number;
  texteCollaborateur: string | null;
  texteExterieur: string | null;
}

/**
 * CE QUI PARTIRA, en lecture seule. `saisie` : la fenêtre (création, modification) ; `moment` : la nouvelle date (décalage) ; `inviteId` /
 * `collaborateurId` : un renvoi, un changement de destinataire.
 */
export async function apercuEnvoisTache(o: {
  geste: GesteApercu; auteur: Auteur; tacheId?: number | null; lotId?: number | null; saisie?: SaisieTache; moment?: Moment;
  collaborateurId?: number | null; inviteId?: number | null;
}, deps: DepsAvis = {}): Promise<ApercuEnvois> {
  const reglage = await lireReglageTaches();
  const tous = await listerCollaborateurs(o.auteur.id);
  const libelle = (id: number): string => tous.find((c) => Number(c.id) === id)?.libelle ?? `compte ${id}`;
  const t = o.tacheId ? await lireTache(o.tacheId) : null;
  const avant = t?.moment ?? null;
  const apres: Moment | null = o.saisie ? { jour: o.saisie.jour, heure: o.saisie.heure, dureeMinutes: o.saisie.dureeMinutes ?? null } : o.moment ?? avant;
  const changee = avant !== null && apres !== null && !memeMoment(avant, apres);
  const actuels = o.tacheId ? (await personnesInvitees(query, o.tacheId)).map((p) => Number(p.id)) : [];
  let ids: number[] = [];
  if (o.geste === 'creer' && o.saisie) ids = invitesDeLaSaisie(o.saisie);
  else if (o.geste === 'modifier' && o.saisie) ids = invitesDeLaSaisie(o.saisie).filter((id) => changee || !actuels.includes(id));
  else if (o.geste === 'decaler') ids = changee ? actuels : [];
  else if (o.geste === 'renvoyerDemande') {
    const { rows } = await query<{ c: number | null }>('SELECT confiee_a::int AS c FROM gestion_tache WHERE id = $1', [o.tacheId ?? 0]);
    ids = rows[0]?.c ? [Number(rows[0].c)] : [];
  } else if (o.geste === 'renvoyerInvitation' && o.inviteId) {
    const { rows } = await query<{ c: number | null }>('SELECT collaborateur_id::int AS c FROM gestion_tache_invite WHERE id = $1', [o.inviteId]);
    ids = rows[0]?.c ? [Number(rows[0].c)] : [];
  } else if (o.geste === 'changerDestinataire' && o.collaborateurId) ids = [o.collaborateurId];
  const collaborateurs = [...new Set(ids)].map((id) => {
    if (id === Number(o.auteur.id) && o.geste !== 'renvoyerInvitation' && o.geste !== 'renvoyerDemande') return { libelle: libelle(id), mail: false, motif: 'vous-même : acceptée d’office' };
    if (!reglage.envoiMail) return { libelle: libelle(id), mail: false, motif: 'l’envoi des demandes par mail est désactivé dans les réglages des tâches' };
    return { libelle: libelle(id), mail: true, motif: null };
  });

  /* Les contacts EXTÉRIEURS cochés « Envoyer une invitation ». */
  const exterieurs: ApercuEnvois['exterieurs'] = [];
  if (await invitationContactsDisponible()) {
    const deja = o.tacheId ? await contactsInvites(o.tacheId) : [];
    if ((o.geste === 'creer' || o.geste === 'modifier') && o.saisie) {
      const copies = o.tacheId ? await contactsCopies(o.tacheId) : [];
      const sources: ContactSource[] = o.lotId ? await contactsDuBienPourTache(o.lotId).catch(() => []) : [];
      for (const cle of o.saisie.invitesContacts ?? []) {
        const s = copies.find((c) => c.cle === cle) ?? sources.find((c) => c.cle === cle);
        if (s === undefined) continue;
        const d = deja.find((x) => x.cle === cle);
        const sorte: SorteMailExterne | null = d === undefined || !d.dejaInvite ? 'invitation' : changee ? 'modification' : null;
        if (sorte === null) continue;
        const email = premierEmail(s.coordonnees);
        exterieurs.push({ nom: s.nom, email, sorte, mail: email !== null, motif: email === null ? 'pas d’adresse e-mail' : null });
      }
      for (const m of o.saisie.contactsManuels ?? []) {
        if (m.inviter !== true) continue;
        exterieurs.push({ nom: m.nom, email: m.email, sorte: 'invitation', mail: m.email !== null, motif: m.email === null ? 'pas d’adresse e-mail' : null });
      }
    } else if (o.geste === 'decaler' && changee) {
      for (const d of deja.filter((x) => x.dejaInvite)) exterieurs.push({ nom: d.nom, email: d.email, sorte: 'modification', mail: d.email !== null, motif: d.email === null ? 'pas d’adresse e-mail' : null });
    }
  }
  const total = collaborateurs.filter((c) => c.mail).length + exterieurs.filter((e) => e.mail).length;

  /* Les TEXTES : celui d'un collaborateur (le mail complet du module de tâches) et celui d'un extérieur (restreint). */
  const titre = o.saisie?.objet ?? t?.objet ?? '';
  const notes = o.saisie ? o.saisie.note : t?.note ?? null;
  const m = apres ?? { jour: '', heure: null, dureeMinutes: null };
  const adresse = t?.adresse ?? (o.lotId ? await adresseDuLot(o.lotId) : null);
  const sig = await signatureEcran(deps);
  const premier = collaborateurs.find((c) => c.mail) ?? collaborateurs[0];
  const texteCollaborateur = premier === undefined ? null : mailTache({
    sorte: 'invitation', destinataire: premier.libelle, expediteur: o.auteur.libelle, demandeLe: new Date().toISOString(), jour: m.jour, heure: m.heure,
    dureeMinutes: m.dureeMinutes, titre, notes, adresse,
    contacts: o.tacheId ? await contactsCopies(o.tacheId) : [], invites: collaborateurs.map((c) => ({ libelle: c.libelle, statut: 'en_attente' as const, moi: c === premier })),
    pieces: [], liens: { accepter: '[lien personnel « Accepter »]', refuser: '[lien personnel « Refuser »]', expireLe: new Date(Date.now() + 7 * 86_400_000).toISOString() },
  }).texte;
  const ext = exterieurs[0];
  const texteExterieur = ext === undefined ? null : mailTacheExterne({ sorte: ext.sorte, titre, jour: m.jour, heure: m.heure, dureeMinutes: m.dureeMinutes, adresse, notes,
    ancien: ext.sorte === 'modification' ? avant : null, signature: sig.ecran }).texte;
  return { collaborateurs, exterieurs, total, texteCollaborateur, texteExterieur };
}

async function adresseDuLot(lotId: number): Promise<string | null> {
  const { rows } = await query<{ adresse: string | null; commune: string | null }>('SELECT adresse, commune FROM gestion_annuaire_lot WHERE id = $1', [lotId]);
  return rows[0] ? titreLogement(rows[0].adresse, rows[0].commune) : null;
}
