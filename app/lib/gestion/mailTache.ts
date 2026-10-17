/**
 * ══ 🔴🔴 LOT GESTION-INVITATIONS-TACHES (lot 3, 17/10/2026) — LE MAIL D'INVITATION ET LE RÉCAPITULATIF ═════════════
 *
 * DEMANDE D'ARNO : « mail clair, en français, structuré par sections — invitation ET récapitulatif après acceptation,
 * même structure » :
 *   1. en-tête « Service Gestion — CRITERIMMO / Sans Vis-à-Vis », « Invitation envoyée par <prénom nom> », date de la
 *      demande ;
 *   2. la DATE DE LA MISSION, très en évidence, avec l'heure ou « journée » ;
 *   3. le titre de la mission ; 4. le texte explicatif (notes), s'il y en a un ; 5. l'adresse du bien ;
 *   6. les contacts fournis (1 contact = 1 bloc : nom, rôle, téléphone, e-mail) ;
 *   7. les autres invités (« Vous êtes N invités : … ») et, dans le récapitulatif, leur état connu ;
 *   8. les pièces jointes : jointes au mail si leur total reste léger, sinon un lien de téléchargement sécurisé à durée
 *      limitée pour chacune ;
 *   9. les boutons Accepter / Refuser (invitation) ; « Tâche acceptée, ajoutée à votre agenda » (récapitulatif).
 * Rendu correct sur mobile et dans Gmail ; aucun secret ni lien d'administration dans le mail.
 *
 * 🔴 GMAIL ET LE TÉLÉPHONE : mise en page en TABLEAUX, styles EN LIGNE (Gmail retire les feuilles de style), largeur
 * maximale 600 px et 100 % en dessous, boutons « à l'épreuve des balles » (une cellule colorée qui porte le lien), texte
 * de 15-16 px, cibles de 44 px. Pas d'image distante. La version TEXTE dit exactement la même chose.
 *
 * 🔴 AUCUN LIEN D'ADMINISTRATION : seuls figurent les liens PUBLICS de réponse (le jeton suffit) et, pour une pièce trop
 * lourde, un lien de téléchargement signé, à durée limitée. Ni fiche du bien, ni Drive, ni adresse interne.
 *
 * PUR : aucune base, aucun réseau. Les dates sont rendues à l'heure de Paris.
 */
import { MOT_FAMILLE, type ContactSource } from './contactsTache';
import { BADGE_ACCEPTATION, type StatutAcceptation } from './acceptationTache';
import { FUSEAU_AFFICHAGE } from './ecran';

export const EN_TETE_SERVICE = 'Service Gestion — CRITERIMMO / Sans Vis-à-Vis';

/**
 * LE SEUIL DES PIÈCES JOINTES : au-delà de 10 Mo au total, aucune n'est jointe, chacune devient un lien. Gmail accepte
 * 25 Mo par message, mais une pièce grossit d'un tiers une fois encodée, et un mail lourd arrive mal sur un téléphone :
 * 10 Mo de fichiers font ~13,5 Mo de message, sans risque de refus.
 */
export const SEUIL_PIECES_OCTETS = 10 * 1024 * 1024;

/**
 * 🔴 LOT GESTION-CONFIRMATION-ACCEPTATION (17/10/2026) — `confirmation` : le mail qui part à la boîte gestion@ et au
 * collaborateur qui a envoyé l'invitation quand un invité accepte. Même structure que le récapitulatif, avec en tête
 * « Acceptée par <prénom nom> le <date heure> ».
 */
export type SorteMailTache = 'invitation' | 'recapitulatif' | 'confirmation';

export interface PieceMail {
  nom: string;
  /** Jointe au mail (ses octets voyagent avec lui). */
  jointe: boolean;
  /** Sinon : le lien de téléchargement signé, à durée limitée ; `null` = non disponible (motif). */
  lien: string | null;
  tailleOctets: number | null;
  /** Pourquoi elle n'est ni jointe ni téléchargeable (ex. dossier protégé) ; `null` sinon. */
  motif: string | null;
}

export interface ContenuMailTache {
  sorte: SorteMailTache;
  destinataire: string;
  /** Prénom et nom du collaborateur qui a envoyé l'invitation. */
  expediteur: string;
  /** Quand la demande a été faite (ISO). */
  demandeLe: string;
  jour: string;
  heure: string | null;
  dureeMinutes: number | null;
  titre: string;
  notes: string | null;
  adresse: string;
  contacts: readonly Pick<ContactSource, 'famille' | 'nom' | 'qualite' | 'organisation' | 'coordonnees'>[];
  /** Tous les invités ACTIFS de la tâche, destinataire compris (le récapitulatif donne leur état). */
  invites: readonly { libelle: string; statut: StatutAcceptation | null; moi: boolean }[];
  pieces: readonly PieceMail[];
  /** Invitation : les deux liens publics et leur fin de validité (ISO). */
  liens?: { accepter: string; refuser: string; expireLe: string };
  /** Confirmation : qui a accepté, et quand (ISO). */
  acceptation?: { par: string; le: string };
  /** Récapitulatif : la tâche est-elle dans son agenda ? */
  agenda?: 'ajoutee' | 'bientot' | 'sans_agenda';
  /** « (lien valable sur l'ordinateur où tourne l'application) » quand l'adresse de base est locale. */
  mentionLiens?: string;
  /** La fin de validité des liens de téléchargement (ISO), s'il y en a. */
  piecesExpirentLe?: string | null;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Mardi 21 octobre 2026 ». PUR. */
export function jourMission(jour: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (m === null) return jour;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  const j = JOURS[d.getUTCDay()];
  return `${j.charAt(0).toUpperCase()}${j.slice(1)} ${Number(m[3])}${m[3] === '01' ? 'er' : ''} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

/** « 14 h 30 (1 h 30) » ; « Journée » sans heure. PUR. */
export function heureMission(heure: string | null, dureeMinutes: number | null): string {
  if (heure === null) return 'Journée';
  const [hh, mm] = heure.split(':');
  const d = dureeMinutes ?? 60;
  const duree = d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 === 0 ? '' : ` ${String(d % 60).padStart(2, '0')}`}`;
  return `${Number(hh)} h ${mm} (${duree})`;
}

/** « 17 octobre 2026 à 9 h 05 », à l'heure de Paris. PUR. */
export function horodatageMail(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_AFFICHAGE, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${Number(p.day)} ${MOIS[Number(p.month) - 1]} ${p.year} à ${Number(p.hour)} h ${p.minute}`;
}

/** « 1,2 Mo », « 340 ko ». PUR. */
export function tailleLisible(octets: number | null): string {
  if (octets === null) return '';
  if (octets < 1024 * 1024) return `${Math.max(1, Math.round(octets / 1024))} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** « Vous êtes 3 invités : Claire Test, Emma Essai, Félix Essai. » ; `null` si vous êtes seul. PUR. */
export function phraseInvites(invites: ContenuMailTache['invites'], sorte: SorteMailTache = 'invitation'): string | null {
  if (invites.length <= 1) return null;
  return `${sorte === 'confirmation' ? `${invites.length} invités` : `Vous êtes ${invites.length} invités`} : ${invites.map((i) => i.libelle).join(', ')}.`;
}

/** L'état d'un invité, dans le récapitulatif. PUR. */
function etatInvite(s: StatutAcceptation | null): string {
  return s === null ? BADGE_ACCEPTATION.acceptee : BADGE_ACCEPTATION[s].replace(' — à réattribuer', '');
}

const echapper = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const net = (s: string | null | undefined): string => (s ?? '').trim();

/** Le rôle d'un contact : « Locataire en place · Gardien · Cabinet X ». PUR. */
function roleContact(c: ContenuMailTache['contacts'][number]): string {
  return [MOT_FAMILLE[c.famille], net(c.qualite), net(c.organisation)].filter((x) => x !== '').join(' · ');
}

/** « Acceptée par Claire Test le 17 octobre 2026 à 9 h 05 ». PUR. */
export function phraseAcceptee(a: { par: string; le: string }): string {
  return `Acceptée par ${a.par} le ${horodatageMail(a.le)}`;
}

/** L'objet du mail de confirmation : « Tâche acceptée par X — <titre> — Mercredi 21 octobre 2026 · 14 h 30 ». PUR. */
export function objetConfirmation(o: { par: string; titre: string; jour: string; heure: string | null }): string {
  const h = o.heure === null ? 'journée' : `${Number(o.heure.split(':')[0])} h ${o.heure.split(':')[1]}`;
  return `Tâche acceptée par ${o.par} — ${o.titre.trim()} — ${jourMission(o.jour)} · ${h}`;
}

/** La salutation, selon la sorte du mail. PUR. */
function salutation(c: ContenuMailTache): string {
  if (c.sorte === 'invitation') return `Bonjour ${c.destinataire}, vous êtes invité(e) à une mission :`;
  if (c.sorte === 'recapitulatif') return `Bonjour ${c.destinataire}, voici le récapitulatif de la mission que vous avez acceptée :`;
  return `Bonjour, ${c.acceptation?.par ?? 'un invité'} a accepté la mission suivante :`;
}

/** La phrase de confirmation du récapitulatif. PUR. */
export function phraseConfirmation(agenda: ContenuMailTache['agenda']): string {
  if (agenda === 'ajoutee') return 'Tâche acceptée, ajoutée à votre agenda.';
  if (agenda === 'bientot') return 'Tâche acceptée. Elle sera ajoutée à votre agenda dans quelques minutes.';
  return 'Tâche acceptée. Elle n’est pas ajoutée à un agenda Google (envoi vers l’agenda désactivé, ou pas d’agenda Google).';
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA VERSION TEXTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

function texteMail(c: ContenuMailTache): string {
  const l: string[] = [];
  const section = (titre: string) => { l.push('', `— ${titre.toUpperCase()} —`); };
  if (c.sorte === 'confirmation' && c.acceptation) l.push(`✓ ${phraseAcceptee(c.acceptation).toUpperCase()}`, '');
  l.push(EN_TETE_SERVICE, `Invitation envoyée par ${c.expediteur}`, `Demande du ${horodatageMail(c.demandeLe)}`, '');
  l.push(salutation(c));
  l.push('', `DATE DE LA MISSION : ${jourMission(c.jour).toUpperCase()} — ${heureMission(c.heure, c.dureeMinutes)}`);
  section('Mission'); l.push(c.titre.trim());
  if (net(c.notes) !== '') { section('Précisions'); l.push(net(c.notes)); }
  section('Adresse du bien'); l.push(c.adresse);
  if (c.contacts.length > 0) {
    section(`Contacts (${c.contacts.length})`);
    for (const k of c.contacts) {
      l.push('', k.nom, ...(roleContact(k) !== '' ? [roleContact(k)] : []));
      for (const x of k.coordonnees) l.push(`${x.libelle ?? (x.sorte === 'telephone' ? 'Téléphone' : 'E-mail')} : ${x.affichage ?? x.valeur}`);
    }
  }
  const pi = phraseInvites(c.invites, c.sorte);
  if (pi !== null) {
    section('Invités');
    l.push(pi);
    if (c.sorte !== 'invitation') for (const i of c.invites) l.push(`${i.libelle}${i.moi && c.sorte === 'recapitulatif' ? ' (vous)' : ''} : ${etatInvite(i.statut)}`);
  }
  if (c.pieces.length > 0) {
    section(`Pièces jointes (${c.pieces.length})`);
    for (const p of c.pieces) {
      l.push(p.jointe ? `${p.nom} — jointe à ce mail${p.tailleOctets !== null ? ` (${tailleLisible(p.tailleOctets)})` : ''}`
        : p.lien !== null ? `${p.nom} — à télécharger : ${p.lien}` : `${p.nom} — non jointe${p.motif ? ` (${p.motif})` : ''}`);
    }
    if (c.pieces.some((p) => !p.jointe && p.lien !== null) && c.piecesExpirentLe) {
      l.push(`Liens de téléchargement valables jusqu’au ${horodatageMail(c.piecesExpirentLe)}.`);
    }
  }
  if (c.sorte === 'invitation' && c.liens) {
    section('Votre réponse');
    l.push(`Accepter : ${c.liens.accepter}`, `Refuser : ${c.liens.refuser}`);
    if (c.mentionLiens) l.push(c.mentionLiens);
    l.push('', `Ces liens sont personnels et servent une seule fois, jusqu’au ${horodatageMail(c.liens.expireLe)}. `
      + 'Aucune connexion n’est demandée : votre réponse n’est enregistrée qu’après « Confirmer ».');
  } else if (c.sorte === 'recapitulatif') {
    section('Confirmation'); l.push(phraseConfirmation(c.agenda));
  }
  l.push('', '—', EN_TETE_SERVICE);
  return l.join('\n');
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA VERSION HTML (Gmail, téléphone)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const ENCRE = '#1f2328';
const GRIS = '#5f6368';
const ROUGE = '#a30402';
const VERT = '#2e7d32';
const LIGNE = '#e3e3e3';
const POLICE = 'font-family:Arial,Helvetica,sans-serif';

const titreSection = (t: string) =>
  `<tr><td style="padding:18px 24px 6px;${POLICE};font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${GRIS};font-weight:bold">${echapper(t)}</td></tr>`;
const bloc = (html: string) => `<tr><td style="padding:0 24px 4px;${POLICE};font-size:15px;line-height:1.5;color:${ENCRE}">${html}</td></tr>`;
const multiligne = (s: string) => echapper(s).replace(/\r?\n/g, '<br>');

function bouton(href: string, mot: string, fond: string): string {
  return `<td style="padding:6px 8px 6px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="border-radius:8px;background:${fond}"><a href="${echapper(href)}" target="_blank" `
    + `style="display:inline-block;padding:13px 26px;${POLICE};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${mot}</a>`
    + `</td></tr></table></td>`;
}

function htmlMail(c: ContenuMailTache): string {
  const r: string[] = [];
  // Confirmation : « Acceptée par … le … », en tête de tout.
  if (c.sorte === 'confirmation' && c.acceptation) {
    r.push(`<tr><td style="background:#e8f5e9;border-bottom:1px solid ${LIGNE};border-radius:10px 10px 0 0;padding:14px 24px;${POLICE};font-size:17px;font-weight:bold;color:${VERT}">`
      + `✓ ${echapper(phraseAcceptee(c.acceptation))}</td></tr>`);
  }
  // 1. En-tête.
  r.push(`<tr><td style="padding:20px 24px 14px;border-bottom:3px solid ${ROUGE};${POLICE}">`
    + `<div style="font-size:13px;font-weight:bold;color:${ROUGE};letter-spacing:.02em">${echapper(EN_TETE_SERVICE)}</div>`
    + `<div style="font-size:14px;color:${ENCRE};margin-top:6px">Invitation envoyée par <b>${echapper(c.expediteur)}</b></div>`
    + `<div style="font-size:13px;color:${GRIS};margin-top:2px">Demande du ${echapper(horodatageMail(c.demandeLe))}</div></td></tr>`);
  r.push(bloc(`<p style="margin:16px 0 0">${echapper(salutation(c))}</p>`));
  // 2. La date de la mission, très en évidence.
  r.push(`<tr><td style="padding:14px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="background:#fbeceb;border-left:6px solid ${ROUGE};border-radius:8px;padding:14px 16px;${POLICE}">`
    + `<div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${ROUGE};font-weight:bold">Date de la mission</div>`
    + `<div style="font-size:26px;line-height:1.25;font-weight:bold;color:${ENCRE};margin-top:4px">${echapper(jourMission(c.jour))}</div>`
    + `<div style="font-size:20px;font-weight:bold;color:${ENCRE};margin-top:2px">${echapper(heureMission(c.heure, c.dureeMinutes))}</div>`
    + `</td></tr></table></td></tr>`);
  // 3. Titre. 4. Notes. 5. Adresse.
  r.push(titreSection('Mission'), bloc(`<div style="font-size:18px;font-weight:bold">${echapper(c.titre.trim())}</div>`));
  if (net(c.notes) !== '') r.push(titreSection('Précisions'), bloc(`<div>${multiligne(net(c.notes))}</div>`));
  r.push(titreSection('Adresse du bien'), bloc(`<div>${echapper(c.adresse)}</div>`));
  // 6. Contacts : 1 contact = 1 bloc.
  if (c.contacts.length > 0) {
    r.push(titreSection(`Contacts (${c.contacts.length})`));
    for (const k of c.contacts) {
      const coord = k.coordonnees.map((x) => {
        const mot = echapper(x.libelle ?? (x.sorte === 'telephone' ? 'Téléphone' : 'E-mail'));
        const href = x.sorte === 'telephone' ? `tel:${x.valeur.replace(/[^\d+]/g, '')}` : `mailto:${x.valeur}`;
        return `<div style="margin-top:2px">${mot} : <a href="${echapper(href)}" style="color:${ROUGE}">${echapper(x.affichage ?? x.valeur)}</a></div>`;
      }).join('');
      r.push(`<tr><td style="padding:4px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
        + `<td style="border:1px solid ${LIGNE};border-radius:8px;padding:10px 12px;${POLICE};font-size:15px;line-height:1.45;color:${ENCRE}">`
        + `<div style="font-weight:bold">${echapper(k.nom)}</div>`
        + (roleContact(k) !== '' ? `<div style="font-size:13px;color:${GRIS}">${echapper(roleContact(k))}</div>` : '')
        + coord + `</td></tr></table></td></tr>`);
    }
  }
  // 7. Les autres invités.
  const pi = phraseInvites(c.invites, c.sorte);
  if (pi !== null) {
    r.push(titreSection('Invités'), bloc(`<div>${echapper(pi)}</div>`));
    if (c.sorte !== 'invitation') {
      r.push(bloc(c.invites.map((i) => `<div style="margin-top:2px">${echapper(i.libelle)}${i.moi && c.sorte === 'recapitulatif' ? ' (vous)' : ''} : <b>${echapper(etatInvite(i.statut))}</b></div>`).join('')));
    }
  }
  // 8. Les pièces jointes.
  if (c.pieces.length > 0) {
    r.push(titreSection(`Pièces jointes (${c.pieces.length})`));
    r.push(bloc(c.pieces.map((p) => `<div style="margin-top:4px">📎 ${echapper(p.nom)} — ${p.jointe
      ? `jointe à ce mail${p.tailleOctets !== null ? ` (${echapper(tailleLisible(p.tailleOctets))})` : ''}`
      : p.lien !== null ? `<a href="${echapper(p.lien)}" style="color:${ROUGE};font-weight:bold">Télécharger</a>${p.tailleOctets !== null ? ` (${echapper(tailleLisible(p.tailleOctets))})` : ''}`
        : `non jointe${p.motif ? ` (${echapper(p.motif)})` : ''}`}</div>`).join('')
      + (c.pieces.some((p) => !p.jointe && p.lien !== null) && c.piecesExpirentLe
        ? `<div style="margin-top:6px;font-size:13px;color:${GRIS}">Liens de téléchargement valables jusqu’au ${echapper(horodatageMail(c.piecesExpirentLe))}.</div>` : '')));
  }
  // 9. Boutons, ou confirmation.
  if (c.sorte === 'invitation' && c.liens) {
    r.push(titreSection('Votre réponse'));
    r.push(`<tr><td style="padding:2px 24px 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
      + bouton(c.liens.accepter, 'Accepter', VERT) + bouton(c.liens.refuser, 'Refuser', ROUGE) + `</tr></table></td></tr>`);
    if (c.mentionLiens) r.push(bloc(`<div style="font-size:13px;color:${GRIS}">${echapper(c.mentionLiens)}</div>`));
    r.push(bloc(`<div style="font-size:13px;color:${GRIS};margin-top:6px">Ces liens sont personnels et servent une seule fois, jusqu’au `
      + `${echapper(horodatageMail(c.liens.expireLe))}. Aucune connexion n’est demandée : votre réponse n’est enregistrée qu’après « Confirmer ».</div>`));
  } else if (c.sorte === 'recapitulatif') {
    r.push(`<tr><td style="padding:16px 24px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td style="background:#e8f5e9;border-left:6px solid ${VERT};border-radius:8px;padding:12px 16px;${POLICE};font-size:16px;font-weight:bold;color:${ENCRE}">`
      + `✓ ${echapper(phraseConfirmation(c.agenda))}</td></tr></table></td></tr>`);
  }
  r.push(`<tr><td style="padding:22px 24px 20px;${POLICE};font-size:12px;color:${GRIS};border-top:1px solid ${LIGNE}">${echapper(EN_TETE_SERVICE)}</td></tr>`);
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light"></head>'
    + `<body style="margin:0;padding:0;background:#f4f4f4"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4">`
    + `<tr><td align="center" style="padding:12px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" `
    + `style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;border:1px solid ${LIGNE}">${r.join('')}</table></td></tr></table></body></html>`;
}

/** L'objet du récapitulatif. L'invitation garde l'objet d'avant (`objetDemande`), que la relève reconnaît. PUR. */
export const PREFIXE_OBJET_RECAPITULATIF = 'Tâche acceptée — ';

/** Le mail complet, texte et HTML (mêmes informations, dans le même ordre). PUR. */
export function mailTache(c: ContenuMailTache): { texte: string; html: string } {
  return { texte: texteMail(c), html: htmlMail(c) };
}

/**
 * LES PIÈCES : lesquelles voyagent dans le mail. Celles qu'on a le droit de lire et qui ont une taille connue sont
 * jointes si leur TOTAL reste sous le seuil ; sinon (ou pour un document Google, qui n'a pas d'octets figés), chacune
 * devient un lien de téléchargement. Une pièce refusée (dossier protégé) n'est ni jointe ni téléchargeable. PUR.
 */
export function planPieces<T extends { tailleOctets: number | null; permis: boolean; telechargeable: boolean }>(
  pieces: readonly T[], seuil: number = SEUIL_PIECES_OCTETS,
): { piece: T; jointe: boolean }[] {
  const candidates = pieces.filter((p) => p.permis && p.telechargeable && p.tailleOctets !== null);
  const total = candidates.reduce((s, p) => s + (p.tailleOctets ?? 0), 0);
  const joindre = total <= seuil;
  return pieces.map((p) => ({ piece: p, jointe: joindre && candidates.includes(p) }));
}
