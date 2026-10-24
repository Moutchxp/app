/**
 * ══ 🔴🔴 « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION (Arno, 24/10/2026, migration 416) — LES RÈGLES ════════════════════════
 *
 * Sur le modèle EXACT de l'espace client (migration 046, `internaute/resetMotDePasse.ts`) et des invitations de compte
 * (migration 363, `invitation.ts`) :
 *   ① la demande répond TOUJOURS le même message (`MESSAGE_DEMANDE`) — jamais « adresse inconnue », jamais « compte désactivé » ;
 *   ② un compte désactivé ne reçoit rien ; les demandes sont comptées par adresse AVANT de savoir si un compte existe (anti-rafale) ;
 *   ③ le lien agit UNE seule fois, pendant `DUREE_LIEN_MINUTES`, et cesse d'agir dès qu'une nouvelle demande le remplace ;
 *   ④ le nouveau mot de passe suit la règle de « Changer mon mot de passe » (`LONGUEUR_MIN_MOT_DE_PASSE`) ;
 *   ⑤ choisi, il ferme toutes les autres sessions du compte et ouvre celle du navigateur courant.
 * PUR : aucune base, aucun réseau.
 */

/** Durée de validité d'un lien (une heure : le geste suit de peu la réception du mail). */
export const DUREE_LIEN_MINUTES = 60;
/** Chemins PUBLICS (hors session : whitelist du proxy). */
export const CHEMIN_DEMANDE = '/admin/mot-de-passe-oublie';
export const CHEMIN_REINITIALISATION = '/admin/reinitialiser';

/** LA réponse de la demande, identique dans TOUS les cas (compte connu, inconnu, désactivé, rafale, corps invalide). */
export const MESSAGE_DEMANDE =
  'Si un compte est associé à cette adresse, vous allez recevoir un e-mail avec un lien pour choisir un nouveau mot de passe. Ce lien est valable 1 heure.';

/** LE message d'un lien qui n'agit pas — le même quelle que soit la cause (aucune fuite). */
export const MESSAGE_LIEN_INVALIDE = 'Ce lien n’est plus valide.';

export type CauseRefusLien = 'inconnu' | 'expire' | 'deja_utilise' | 'remplace' | 'compte_inactif';
export type VerdictLien = { ok: true } | { ok: false; cause: CauseRefusLien };

/** Le lien peut-il agir MAINTENANT ? PUR. */
export function verdictLien(
  d: { expireLe: string | Date; utiliseLe: string | Date | null; remplaceeLe: string | Date | null; compteActif: boolean } | null,
  maintenant: Date,
): VerdictLien {
  if (d === null) return { ok: false, cause: 'inconnu' };
  if (d.utiliseLe !== null) return { ok: false, cause: 'deja_utilise' };
  if (d.remplaceeLe !== null) return { ok: false, cause: 'remplace' };
  if (!d.compteActif) return { ok: false, cause: 'compte_inactif' };
  if (new Date(d.expireLe).getTime() <= maintenant.getTime()) return { ok: false, cause: 'expire' };
  return { ok: true };
}

// ── L'anti-rafale des demandes (mêmes réglages que l'espace client) ──────────────────────────────────────────────────
/** Demandes libres dans la fenêtre avant le début de l'attente (le « 2-3 fois » d'une personne réelle). */
export const SEUIL_DEMANDES = 3;
/** Fenêtre de comptage, en secondes (une heure). */
export const FENETRE_DEMANDES_S = 3600;
const BASE_S = 60;
const MAX_S = 3600;
/** L'attente requise après `n` demandes dans la fenêtre : 0 sous le seuil, puis 1 min, 2, 4… plafonnée à 1 h. PUR. */
export function attenteApres(n: number): number {
  if (n < SEUIL_DEMANDES) return 0;
  return Math.min(MAX_S, Math.round(BASE_S * 2 ** Math.min(n - SEUIL_DEMANDES, 40)));
}

/** L'adresse saisie, normalisée (espaces retirés, minuscules) : la clé du compte comme de l'anti-rafale. PUR. */
export const adresseNormalisee = (brut: unknown): string => (typeof brut === 'string' ? brut.trim().toLowerCase() : '');

export function lienReinitialisation(base: string, jeton: string): string {
  return `${base.trim().replace(/\/+$/, '')}${CHEMIN_REINITIALISATION}?j=${encodeURIComponent(jeton)}`;
}

/** Le Message-ID du mail commence par ceci : la relève de gestion@ (dossier « Envoyés ») le reconnaît et ne le rattache jamais
 *  à un bien (comme les invitations, `estInvitationAdmin`). */
export const PREFIXE_MESSAGE_ID_REINITIALISATION = 'admin-reinitialisation.';
export function messageIdReinitialisation(domaine: string, alea: string): string {
  return `<${PREFIXE_MESSAGE_ID_REINITIALISATION}${alea}@${domaine || 'criterimmo.fr'}>`;
}

export const OBJET_REINITIALISATION = 'Espace de gestion Sans Vis-à-Vis — choisir un nouveau mot de passe';

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Le corps du mail (texte + HTML). Ne contient JAMAIS de mot de passe. PUR. */
export function corpsReinitialisation(c: { prenom: string; identifiant: string; lien: string }): { texte: string; html: string } {
  const texte = [
    `Bonjour ${c.prenom},`,
    '',
    `Une demande de nouveau mot de passe a été faite pour votre accès à l’espace de gestion Sans Vis-à-Vis (${c.identifiant}).`,
    '',
    'Pour choisir votre nouveau mot de passe, ouvrez ce lien :',
    c.lien,
    '',
    `Ce lien ne sert qu’une fois et n’est valable qu’une heure.`,
    'Si vous n’avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.',
  ].join('\n');
  const html = [
    `<p>Bonjour ${echapper(c.prenom)},</p>`,
    `<p>Une demande de nouveau mot de passe a été faite pour votre accès à l’espace de gestion Sans Vis-à-Vis (<strong>${echapper(c.identifiant)}</strong>).</p>`,
    `<p><a href="${echapper(c.lien)}" style="display:inline-block;padding:12px 20px;border-radius:10px;background:#a30402;color:#fff;font-weight:700;text-decoration:none">Choisir un nouveau mot de passe</a></p>`,
    `<p style="color:#5c6573;font-size:13px">Ce lien ne sert qu’une fois et n’est valable qu’une heure. Si vous n’avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.</p>`,
  ].join('\n');
  return { texte, html };
}
