/**
 * ══ 🔴🔴 LOT TACHES-ACCEPTATION — LA RÈGLE UNIQUE DE L'ACCEPTATION D'UNE TÂCHE ══════════════════════════════════════
 *
 * DÉCISIONS D'ARNO (13/10/2026) :
 *   1. une tâche que je me confie est « Acceptée » d'office ;
 *   2. confiée à QUELQU'UN D'AUTRE que celui qui la crée, elle est « En attente d'acceptation » et le destinataire
 *      reçoit un mail (Accepter / Refuser), qui part de gestion@ par la voie d'envoi existante ;
 *   3. le lien n'agit que pour le BON destinataire, UNE seule fois, et EXPIRE ; un lien périmé, déjà utilisé ou
 *      remplacé est refusé proprement, avec un message clair ;
 *   4. « Refuser » exige un motif ; la tâche passe « Refusée — à réattribuer » ;
 *   5. changer la DATE, l'HEURE ou la PERSONNE d'une tâche relance la demande ; le reste ne change pas le statut ;
 *   6. badge à côté de l'échéance (⏳ En attente / ✓ Acceptée / ✗ Refusée) ; le code couleur des dates ne change pas.
 *
 * 🔴 LE MAIL DE DEMANDE N'EST JAMAIS RATTACHÉ À UN BIEN. Quand il revient par la relève (dossier « Envoyés » de
 * gestion@), le moteur de rattachement le reconnaît à son Message-ID (`PREFIXE_MESSAGE_ID`) — et, en secours, à son
 * objet — et le refuse AVANT tout calcul (`estDemandeAcceptationTache`, appelée par `examinerMessage`).
 *
 * PUR : aucune base, aucun réseau. Chargeable dans le navigateur.
 */

export type StatutAcceptation = 'en_attente' | 'acceptee' | 'refusee';
export type EtatMail = 'aucun' | 'desactive' | 'envoye' | 'echec' | 'factice';

/** La demande COURANTE d'une tâche, telle que les écrans la lisent. */
export interface AcceptationTache {
  statut: StatutAcceptation;
  /** Vrai pour « Acceptée d'office » (tâche confiée à soi-même) et les tâches d'avant le lot. */
  automatique: boolean;
  destinataireId: number | null;
  destinataireLibelle: string;
  demandeurId: number | null;
  demandeurLibelle: string;
  demandeLe: string;
  reponduLe: string | null;
  reponduParLibelle: string | null;
  motif: string | null;
  mailEtat: EtatMail;
  mailLe: string | null;
}

/**
 * ══ 🔴🔴 LOT GESTION-INVITATIONS-TACHES (17/10/2026) — LES INVITÉS D'UNE TÂCHE (migration 365) ══════════════════════
 * Une tâche peut inviter PLUSIEURS collaborateurs. Chacun a sa propre demande : son lien, son jeton à usage unique, sa
 * réponse (en attente / acceptée / refusée avec motif). La personne « Confiée à » est le PREMIER invité (`principal`).
 */
export interface InviteTache {
  inviteId: number;
  collaborateurId: number | null;
  libelle: string;
  principal: boolean;
  /** `null` = pas de demande (tâche d'avant l'acceptation). */
  statut: StatutAcceptation | null;
  automatique: boolean;
  motif: string | null;
  reponduLe: string | null;
  demandeLe: string | null;
  mailEtat: EtatMail;
  /** Le dernier « Renvoyer l'invitation » à cet invité (délai de 2 minutes entre deux renvois). */
  dernierRenvoiLe: string | null;
}

/** « 1 acceptée sur 3 », « 2 acceptées sur 3 ». PUR. */
export function resumeInvites(invites: readonly Pick<InviteTache, 'statut'>[]): string {
  const n = invites.filter((i) => i.statut === 'acceptee').length;
  return `${n} acceptée${n > 1 ? 's' : ''} sur ${invites.length}`;
}

/** Le délai minimal entre deux renvois de l'invitation au même invité (Arno : 2 minutes). */
export const DELAI_RENVOI_MS = 2 * 60_000;

/** Combien de secondes attendre avant de pouvoir renvoyer (0 = tout de suite). PUR. */
export function attenteAvantRenvoi(dernierRenvoiLe: string | null, maintenant: Date): number {
  if (dernierRenvoiLe === null) return 0;
  const reste = new Date(dernierRenvoiLe).getTime() + DELAI_RENVOI_MS - maintenant.getTime();
  return reste > 0 ? Math.ceil(reste / 1000) : 0;
}

/** « Patientez encore 1 min 20 s avant de renvoyer l'invitation à X. » PUR. */
export function messageAttenteRenvoi(secondes: number, libelle: string): string {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  const duree = m > 0 ? `${m} min${s > 0 ? ` ${s} s` : ''}` : `${s} s`;
  return `L’invitation à ${libelle} vient d’être renvoyée : patientez encore ${duree} avant un nouveau renvoi.`;
}

/**
 * « Changer le destinataire » est permis sur un invité EN ATTENTE (ou qui a REFUSÉ : la tâche est « à réattribuer »).
 * Jamais sur un invité qui a ACCEPTÉ : on le retire de la liste des invités (« Modifier »), on ne lui substitue personne
 * en silence. `null` = permis, sinon le message. PUR.
 */
export function refusChangementDestinataire(statut: StatutAcceptation | null): string | null {
  if (statut === 'acceptee') {
    return 'Cette personne a déjà accepté : on ne change pas son destinataire. Pour la retirer, décochez-la dans « Modifier » '
      + '(la tâche quitte alors son agenda), puis invitez quelqu’un d’autre.';
  }
  return null;
}

/** Une tâche telle que la page « Mes tâches » la montre à son destinataire. */
export interface TacheRecue {
  tacheId: number; objet: string; jour: string; heure: string | null; etat: string; adresseBien: string; note: string | null;
  demandeurLibelle: string; statut: StatutAcceptation; demandeLe: string; reponduLe: string | null; motif: string | null;
}

/** Le badge, à côté de l'échéance. Un mot avec le signe : jamais un signe seul. */
export const BADGE_ACCEPTATION: Record<StatutAcceptation, string> = {
  en_attente: '⏳ En attente',
  acceptee: '✓ Acceptée',
  refusee: '✗ Refusée — à réattribuer',
};

/** La mention de l'état du mail, quand il n'est pas parti. */
/** AUDIT POINT 9 — phrase de la route quand le mail n'est pas parti faute de droit d'envoi au nom de gestion@. */
export const MENTION_MAIL_SANS_DROIT = 'pas de mail : envoyer au nom de gestion@ demande le droit d’envoi — la demande est visible dans « Mes tâches »';

export function mentionMail(etat: EtatMail | 'sans_droit'): string | null {
  switch (etat) {
    case 'sans_droit': return MENTION_MAIL_SANS_DROIT;
    case 'desactive': return 'mail non envoyé (envoi désactivé)';
    case 'echec': return 'mail non envoyé (échec de l’envoi)';
    case 'factice': return 'mail préparé (essai, rien n’est parti)';
    default: return null;
  }
}

/**
 * 🔴 LOT GESTION-INVITATIONS-TACHES — ce que la route dit des invitations parties après un geste : « Invitations : A
 * (envoyée par mail), B (mail non envoyé (échec de l’envoi)). » ; `''` si aucune. PUR.
 */
export function phraseInvitations(envois: readonly { destinataire: string; etat: EtatMail | 'sans_droit' }[]): string {
  if (envois.length === 0) return '';
  const un = (e: { destinataire: string; etat: EtatMail | 'sans_droit' }) =>
    `${e.destinataire} (${e.etat === 'envoye' ? 'envoyée par mail' : mentionMail(e.etat) ?? 'préparée'})`;
  return ` ${envois.length > 1 ? 'Invitations' : 'Invitation'} : ${envois.map(un).join(', ')}.`;
}

/** 1. Acceptée d'office quand on se la confie à soi-même ; sinon en attente. PUR. */
export function acceptationInitiale(confieeA: number | null, demandeurId: number | null): StatutAcceptation {
  return confieeA !== null && demandeurId !== null && Number(confieeA) === Number(demandeurId) ? 'acceptee' : 'en_attente';
}

/** 5. Une modification relance-t-elle la demande ? Date, heure ou personne seulement. PUR. */
export function modificationRelanceLaDemande(
  avant: { jour: string; heure: string | null; confieeA: number | null },
  apres: { jour: string; heure: string | null; confieeA: number | null },
): boolean {
  return avant.jour !== apres.jour || (avant.heure ?? null) !== (apres.heure ?? null)
    || Number(avant.confieeA ?? 0) !== Number(apres.confieeA ?? 0);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE MAIL DE DEMANDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const PREFIXE_OBJET = 'Tâche à accepter — ';
/** Le Message-ID du mail commence par ceci : c'est la marque que le moteur de rattachement reconnaît. */
export const PREFIXE_MESSAGE_ID = 'tache-acceptation.';

/** « Tâche à accepter — 7 avenue de l'Union — Visite — mar. 13 oct. · journée ». PUR. */
export function objetDemande(o: { adresseCourte: string; objet: string; echeance: string }): string {
  return `${PREFIXE_OBJET}${o.adresseCourte} — ${o.objet.trim()} — ${o.echeance}`;
}

/** Le Message-ID RFC 5322 du mail de demande. PUR. */
export function messageIdDemande(domaine: string, alea: string): string {
  return `<${PREFIXE_MESSAGE_ID}${alea}@${domaine || 'criterimmo.fr'}>`;
}

/**
 * 🔴 CE MAIL EST-IL UNE DEMANDE D'ACCEPTATION DE TÂCHE ? Par son Message-ID (la marque sûre), et en secours par son
 * objet sur un mail ENVOYÉ. Une réponse humaine (« Re: Tâche à accepter… ») n'est pas concernée : son Message-ID est
 * le sien, et elle n'est pas « envoyée » par nous. PUR.
 */
export function estDemandeAcceptationTache(m: { sens?: string | null; messageIdEntete?: string | null; objet?: string | null }): boolean {
  const mid = (m.messageIdEntete ?? '').trim().replace(/^</, '').toLowerCase();
  if (mid.startsWith(PREFIXE_MESSAGE_ID)) return true;
  return m.sens === 'envoye' && (m.objet ?? '').trim().startsWith(PREFIXE_OBJET);
}

const echapper = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface ContenuDemande {
  echeance: string;
  adresseBien: string;
  objet: string;
  demandeur: string;
  destinataire: string;
  /** Le texte complet de la tâche : note + bloc « Contacts » (`texteCompletTache`). */
  texte: string;
  pieces: readonly { nom: string; lien: string | null }[];
  lienAccepter: string;
  lienRefuser: string;
  expireLe: string;
  /** 🔴 LOT AGENDA-TITRE-ET-LIENS — « (lien valable sur l'ordinateur où tourne l'application) » quand la base est locale. */
  mentionLiens?: string;
}

/** Le corps du mail, en texte et en HTML, avec deux boutons « Accepter » et « Refuser ». PUR. */
export function corpsDemande(c: ContenuDemande): { texte: string; html: string } {
  const pieces = c.pieces.length === 0 ? [] : ['', 'Pièces jointes (Drive) :', ...c.pieces.map((p) => `— ${p.nom}${p.lien ? ` : ${p.lien}` : ''}`)];
  const texte = [
    `Bonjour ${c.destinataire},`,
    '',
    `${c.demandeur} vous confie une tâche et vous demande de l’accepter.`,
    '',
    `Échéance : ${c.echeance}`,
    `Bien : ${c.adresseBien}`,
    `Objet : ${c.objet}`,
    `Demandée par : ${c.demandeur}`,
    ...(c.texte.trim() === '' ? [] : ['', c.texte.trim()]),
    ...pieces,
    '',
    `Accepter : ${c.lienAccepter}`,
    `Refuser : ${c.lienRefuser}`,
    ...(c.mentionLiens ? [c.mentionLiens] : []),
    '',
    `Ces liens sont personnels, utilisables une seule fois, jusqu’au ${c.expireLe}. Il faut être connecté à l’application.`,
  ].join('\n');
  const bouton = (href: string, mot: string, fond: string) =>
    `<a href="${echapper(href)}" style="display:inline-block;padding:10px 18px;margin:0 8px 0 0;border-radius:8px;`
    + `background:${fond};color:#ffffff;text-decoration:none;font-weight:bold">${mot}</a>`;
  const html = [
    `<p>Bonjour ${echapper(c.destinataire)},</p>`,
    `<p>${echapper(c.demandeur)} vous confie une tâche et vous demande de l’accepter.</p>`,
    '<table cellpadding="4" style="border-collapse:collapse">',
    `<tr><td><b>Échéance</b></td><td><b>${echapper(c.echeance)}</b></td></tr>`,
    `<tr><td>Bien</td><td>${echapper(c.adresseBien)}</td></tr>`,
    `<tr><td>Objet</td><td>${echapper(c.objet)}</td></tr>`,
    `<tr><td>Demandée par</td><td>${echapper(c.demandeur)}</td></tr>`,
    '</table>',
    c.texte.trim() === '' ? '' : `<pre style="font-family:inherit;white-space:pre-wrap">${echapper(c.texte.trim())}</pre>`,
    c.pieces.length === 0 ? '' : `<p>Pièces jointes (Drive) :</p><ul>${c.pieces.map((p) => `<li>${p.lien
      ? `<a href="${echapper(p.lien)}">${echapper(p.nom)}</a>` : echapper(p.nom)}</li>`).join('')}</ul>`,
    `<p>${bouton(c.lienAccepter, 'Accepter', '#2e7d32')}${bouton(c.lienRefuser, 'Refuser', '#a30402')}</p>`,
    c.mentionLiens ? `<p style="color:#666;font-size:12px">${echapper(c.mentionLiens)}</p>` : '',
    `<p style="color:#666;font-size:12px">Ces liens sont personnels, utilisables une seule fois, jusqu’au ${echapper(c.expireLe)}. `
      + 'Il faut être connecté à l’application.</p>',
  ].filter((x) => x !== '').join('\n');
  return { texte, html };
}

/**
 * Les deux liens du mail. 🔴 LOT GESTION-ACCEPTATION (16/10/2026) : ils ouvrent la page PUBLIQUE de réponse
 * (`/tache/reponse`), SANS connexion — le jeton suffit. L'ouverture n'enregistre RIEN (un antivirus qui visite le lien
 * ne répond pas à la place du collaborateur) : « Confirmer l'acceptation », ou le motif puis « Confirmer le refus »
 * (règle 4). Les anciens liens (`/admin/taches?j=…`) y sont redirigés par le proxy. PUR.
 */
export const CHEMIN_REPONSE_PUBLIQUE = '/tache/reponse';
export function liensDemande(base: string, jeton: string): { accepter: string; refuser: string } {
  const b = `${base.trim().replace(/\/+$/, '')}${CHEMIN_REPONSE_PUBLIQUE}?j=${encodeURIComponent(jeton)}`;
  return { accepter: `${b}&d=accepter`, refuser: `${b}&d=refuser` };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE LIEN : POUR LE BON DESTINATAIRE, UNE SEULE FOIS, AVANT SON EXPIRATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type VerdictLien =
  | { ok: true }
  | { ok: false; cause: 'inconnu' | 'expire' | 'deja_utilise' | 'remplace' | 'autre_personne' | 'tache_terminee' | 'plus_destinee'; message: string };

export const MESSAGES_LIEN: Record<Exclude<VerdictLien, { ok: true }>['cause'], string> = {
  inconnu: 'Ce lien n’est pas valable. Vérifiez que vous l’avez copié en entier.',
  expire: 'Ce lien a expiré. Demandez à la personne qui vous a confié la tâche de renvoyer la demande.',
  deja_utilise: 'Ce lien a déjà servi : votre réponse a été enregistrée.',
  remplace: 'Cette demande a été remplacée par une plus récente (invitation renvoyée, date ou heure changée) : utilisez le dernier mail reçu.',
  autre_personne: 'Ce lien est destiné à une autre personne : connectez-vous avec le compte à qui la tâche est confiée.',
  tache_terminee: 'Cette tâche est déjà faite ou annulée : il n’y a plus rien à accepter.',
  /* 🔴 LOT GESTION-INVITATIONS-TACHES — l'invité a été remplacé par un autre destinataire, ou retiré de la tâche. */
  plus_destinee: 'Cette invitation ne vous est plus destinée : la tâche a été confiée à quelqu’un d’autre.',
};

/** Le titre de la page publique quand le lien ne peut plus agir. PUR. */
export function titreLienRefuse(cause: string | null): string {
  return cause === 'plus_destinee' ? 'Cette invitation ne vous est plus destinée' : 'Ce lien ne peut plus servir';
}

/**
 * Le lien peut-il agir, pour CETTE personne, MAINTENANT ? `inviteRetire` (migration 365) : l'invité de cette demande a
 * été retiré ou remplacé par un autre destinataire — le lien ne lui est plus destiné. PUR.
 */
export function verdictLien(
  d: { statut: string; destinataireId: number | null; expireLe: string | null; utiliseLe: string | null; inviteRetire?: boolean } | null,
  tacheEtat: string | null, utilisateurId: number | null, maintenant: Date,
): VerdictLien {
  const non = (cause: Exclude<VerdictLien, { ok: true }>['cause']): VerdictLien => ({ ok: false, cause, message: MESSAGES_LIEN[cause] });
  if (d === null) return non('inconnu');
  if (d.inviteRetire === true) return non('plus_destinee');
  if (d.statut === 'remplacee') return non('remplace');
  if (d.utiliseLe !== null || d.statut !== 'en_attente') return non('deja_utilise');
  if (utilisateurId === null || d.destinataireId === null || Number(d.destinataireId) !== Number(utilisateurId)) return non('autre_personne');
  if (d.expireLe !== null && new Date(d.expireLe).getTime() <= maintenant.getTime()) return non('expire');
  if (tacheEtat !== null && tacheEtat !== 'a_faire') return non('tache_terminee');
  return { ok: true };
}

/** Le motif d'un refus : obligatoire, borné. `null` si valable, sinon le message. PUR. */
export function erreurMotif(motif: string | null | undefined): string | null {
  const m = (motif ?? '').trim();
  if (m === '') return 'Indiquez le motif du refus.';
  if (m.length > 1000) return 'Le motif dépasse 1000 caractères.';
  return null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LES FILTRES ET LE COMPTEUR DU RÉCAPITULATIF
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** 🔴 LOT FILTRE-COLLABORATEURS — `collaborateurs` : confiées à une AUTRE personne que le collaborateur connecté. */
export type FiltreQui = 'toutes' | 'confiees' | 'collaborateurs' | 'commandees';
/** L'ordre des boutons (Arno) : Toutes / Confiées à moi / Confiées aux collaborateurs / Commandées par moi. */
export const ORDRE_FILTRES_QUI: readonly FiltreQui[] = ['toutes', 'confiees', 'collaborateurs', 'commandees'];
export type FiltreStatut = 'toutes' | StatutAcceptation;

export const MOTS_QUI: Record<FiltreQui, string> = {
  toutes: 'Toutes', confiees: 'Confiées à moi', collaborateurs: 'Confiées aux collaborateurs', commandees: 'Commandées par moi',
};
export const MOTS_STATUT: Record<FiltreStatut, string> = {
  toutes: 'Toutes', en_attente: 'En attente', acceptee: 'Acceptées', refusee: 'Refusées',
};

interface TacheFiltrable {
  confieeA: number | null;
  creePar?: number | null;
  acceptation?: Pick<AcceptationTache, 'statut' | 'demandeurId'> | null;
  /** 🔴 LOT GESTION-INVITATIONS-TACHES — les invités ACTIFS ; absent = une seule personne (« Confiée à »). */
  invites?: readonly Pick<InviteTache, 'collaborateurId' | 'statut'>[];
}

/** Les personnes d'une tâche et leur statut : ses invités, sinon la seule personne « Confiée à ». PUR. */
function personnes<T extends TacheFiltrable>(t: T): { id: number | null; statut: StatutAcceptation }[] {
  if (t.invites !== undefined && t.invites.length > 0) {
    return t.invites.map((i) => ({ id: i.collaborateurId, statut: i.statut ?? 'acceptee' }));
  }
  return [{ id: t.confieeA, statut: t.acceptation?.statut ?? 'acceptee' }];
}

/** « Commandée par moi » : j'en suis le DEMANDEUR (celui qui l'a confiée), sinon son créateur. PUR. */
export function estCommandeePar<T extends TacheFiltrable>(t: T, moi: number | null): boolean {
  if (moi === null) return false;
  const demandeur = t.acceptation?.demandeurId ?? t.creePar ?? null;
  return demandeur !== null && Number(demandeur) === Number(moi);
}

/** Les deux filtres, combinables. Une tâche sans demande compte comme « Acceptée » (tâches d'avant le lot). PUR. */
export function filtrerParAcceptation<T extends TacheFiltrable>(
  taches: readonly T[], qui: FiltreQui, statut: FiltreStatut, moi: number | null,
): T[] {
  /* 🔴 LOT GESTION-INVITATIONS-TACHES — « Confiées à moi » : je suis l'un des invités ; « aux collaborateurs » : l'un des
     invités est quelqu'un d'autre ; un statut : au moins un invité dans ce statut. Une seule personne : comme avant. */
  return taches.filter((t) => {
    const p = personnes(t);
    if (qui === 'confiees' && (moi === null || !p.some((x) => x.id !== null && Number(x.id) === Number(moi)))) return false;
    if (qui === 'collaborateurs' && !p.some((x) => x.id !== null && (moi === null || Number(x.id) !== Number(moi)))) return false;
    if (qui === 'commandees' && !estCommandeePar(t, moi)) return false;
    if (statut !== 'toutes' && !p.some((x) => x.statut === statut)) return false;
    return true;
  });
}

/** Le compteur « En attente de confirmation » : les tâches dont au moins un invité n'a pas encore répondu. PUR. */
export function compterEnAttente<T extends TacheFiltrable>(taches: readonly T[]): number {
  return taches.filter((t) => t.invites !== undefined && t.invites.length > 0
    ? t.invites.some((i) => i.statut === 'en_attente') : t.acceptation?.statut === 'en_attente').length;
}
