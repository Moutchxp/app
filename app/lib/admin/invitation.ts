/**
 * ══ 🔴🔴 LOT GESTION-INVITATION-ADMIN (16/10/2026) — LA RÈGLE DU MAIL D'INVITATION D'UN NOUVEAU COMPTE ═══════════════
 *
 * Constat d'Arno : un administrateur créé dans la tuile Administratif ne recevait AUCUN mail (le mot de passe temporaire
 * n'était qu'affiché à l'écran, à transmettre à la main). Désormais :
 *   ① à la création, un mail d'invitation part, avec un lien d'activation (choix du mot de passe) ;
 *   ② le lien agit UNE seule fois, pendant `DUREE_INVITATION_JOURS`, et cesse d'agir dès qu'un renvoi le remplace ;
 *   ③ un échec d'envoi se DIT à l'écran, avec le motif réel ; jamais « envoyé » quand rien n'est parti ;
 *   ④ « Renvoyer le mail d'invitation » : seulement pour un compte pas encore activé, jamais deux envois à moins de
 *      `DELAI_MIN_RENVOI_MS` d'écart.
 * Le mot de passe temporaire affiché à la création reste en place (fonction existante) : le mail ne le contient JAMAIS.
 *
 * PUR : aucune base, aucun réseau.
 */

/** Durée de validité d'un lien d'activation. */
export const DUREE_INVITATION_JOURS = 7;
/** Délai minimal entre deux envois pour un même compte (anti-rafale). */
export const DELAI_MIN_RENVOI_MS = 2 * 60 * 1000;
/** Chemin PUBLIC de la page d'activation (hors session : whitelist du proxy). */
export const CHEMIN_ACTIVATION = '/admin/activation';

export type EtatMailInvitation = 'en_cours' | 'envoye' | 'factice' | 'echec';

export type CauseRefusLien = 'inconnu' | 'expire' | 'deja_utilise' | 'remplace' | 'compte_inactif';
export type VerdictInvitation = { ok: true } | { ok: false; cause: CauseRefusLien; message: string };

export const MESSAGES_INVITATION: Record<CauseRefusLien, string> = {
  inconnu: 'Ce lien d’activation n’est pas valable. Vérifiez que vous l’avez copié en entier.',
  expire: 'Ce lien d’activation a expiré. Demandez à un administrateur de vous renvoyer le mail d’invitation.',
  deja_utilise: 'Ce lien a déjà servi : votre compte est activé. Connectez-vous avec votre mot de passe.',
  remplace: 'Ce lien a été remplacé par un mail plus récent : utilisez le dernier mail d’invitation reçu.',
  compte_inactif: 'Ce compte est désactivé : adressez-vous à un administrateur.',
};

/** Le lien peut-il agir MAINTENANT ? PUR. */
export function verdictInvitation(
  d: { expireLe: string | Date; utiliseLe: string | Date | null; remplaceeLe: string | Date | null; compteActif: boolean } | null,
  maintenant: Date,
): VerdictInvitation {
  const non = (cause: CauseRefusLien): VerdictInvitation => ({ ok: false, cause, message: MESSAGES_INVITATION[cause] });
  if (d === null) return non('inconnu');
  if (d.utiliseLe !== null) return non('deja_utilise');
  if (d.remplaceeLe !== null) return non('remplace');
  if (!d.compteActif) return non('compte_inactif');
  if (new Date(d.expireLe).getTime() <= maintenant.getTime()) return non('expire');
  return { ok: true };
}

/** Un compte est « activé » dès qu'il s'est connecté une fois, ou qu'un lien d'activation a servi. PUR. */
export function compteActive(c: { derniereConnexion: string | Date | null; invitationUtilisee: boolean }): boolean {
  return c.derniereConnexion !== null || c.invitationUtilisee;
}

/** Peut-on (r)envoyer maintenant ? `null` si oui, sinon le message. PUR. */
export function refusRenvoi(
  c: { actif: boolean; active: boolean; dernierEnvoi: string | Date | null },
  maintenant: Date,
): string | null {
  if (!c.actif) return 'Ce compte est désactivé : réactivez-le avant de renvoyer l’invitation.';
  if (c.active) return 'Ce compte est déjà activé : il n’y a plus d’invitation à envoyer.';
  if (c.dernierEnvoi !== null) {
    const reste = DELAI_MIN_RENVOI_MS - (maintenant.getTime() - new Date(c.dernierEnvoi).getTime());
    if (reste > 0) {
      const s = Math.ceil(reste / 1000);
      return `Un mail vient d’être envoyé : attendez ${s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`} avant de le renvoyer.`;
    }
  }
  return null;
}

export function lienActivation(base: string, jeton: string): string {
  return `${base.trim().replace(/\/+$/, '')}${CHEMIN_ACTIVATION}?j=${encodeURIComponent(jeton)}`;
}

/** Le Message-ID du mail commence par ceci : la relève de gestion@ (dossier « Envoyés ») le reconnaît et ne le
 *  rattache jamais à un bien (`estInvitationAdmin`, appelée par `examinerMessage`). */
export const PREFIXE_MESSAGE_ID_INVITATION = 'admin-invitation.';
export function messageIdInvitation(domaine: string, alea: string): string {
  return `<${PREFIXE_MESSAGE_ID_INVITATION}${alea}@${domaine || 'criterimmo.fr'}>`;
}
/** Ce mail est-il une invitation de compte envoyée par l'application ? Par son Message-ID, et en secours son objet. PUR. */
export function estInvitationAdmin(m: { sens?: string | null; messageIdEntete?: string | null; objet?: string | null }): boolean {
  const mid = (m.messageIdEntete ?? '').trim().replace(/^</, '').toLowerCase();
  if (mid.startsWith(PREFIXE_MESSAGE_ID_INVITATION)) return true;
  return m.sens === 'envoye' && (m.objet ?? '').trim() === OBJET_INVITATION;
}

export const OBJET_INVITATION = 'Votre accès à l’espace de gestion Sans Vis-à-Vis — activez votre compte';

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Le corps du mail (texte + HTML). Ne contient JAMAIS de mot de passe. PUR. */
export function corpsInvitation(c: { prenom: string; identifiant: string; invitant: string; lien: string; expireLe: string }): { texte: string; html: string } {
  const texte = [
    `Bonjour ${c.prenom},`,
    '',
    `${c.invitant} vous a ouvert un accès à l’espace de gestion Sans Vis-à-Vis.`,
    `Votre identifiant de connexion : ${c.identifiant}`,
    '',
    'Pour activer votre compte, choisissez votre mot de passe en ouvrant ce lien :',
    c.lien,
    '',
    `Ce lien ne sert qu’une fois et expire le ${c.expireLe}.`,
    'Si vous n’êtes pas concerné, ignorez ce message.',
  ].join('\n');
  const html = [
    `<p>Bonjour ${echapper(c.prenom)},</p>`,
    `<p>${echapper(c.invitant)} vous a ouvert un accès à l’espace de gestion Sans Vis-à-Vis.<br>`,
    `Votre identifiant de connexion : <strong>${echapper(c.identifiant)}</strong></p>`,
    `<p><a href="${echapper(c.lien)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#a30402;color:#fff;font-weight:700;text-decoration:none">Activer mon compte</a></p>`,
    `<p style="color:#5c6573;font-size:13px">Ce lien ne sert qu’une fois et expire le ${echapper(c.expireLe)}. Si vous n’êtes pas concerné, ignorez ce message.</p>`,
  ].join('\n');
  return { texte, html };
}

/** La phrase de l'écran après un envoi : la vérité, jamais une promesse. PUR. */
export function phraseEnvoi(r: { etat: EtatMailInvitation | 'indisponible'; destinataire: string; motif?: string | null }): string {
  r = { ...r, motif: r.motif ? r.motif.trim().replace(/[.\s]+$/, '') : r.motif }; // le motif ne doit pas doubler le point final
  switch (r.etat) {
    case 'envoye': return `Mail d’invitation envoyé à ${r.destinataire}.`;
    case 'factice': return `Mail d’invitation préparé pour ${r.destinataire} (essai : rien n’est parti).`;
    case 'indisponible': return `Mail d’invitation NON envoyé à ${r.destinataire} : ${r.motif ?? 'invitations non installées sur ce serveur'}.`;
    default: return `Mail d’invitation NON envoyé à ${r.destinataire} : ${r.motif ?? 'échec de l’envoi'}.`;
  }
}
