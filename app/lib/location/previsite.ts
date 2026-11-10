/**
 * ══ 🔴🔴 LA PRÉ-VISITE D'ÉTAT DES LIEUX DE SORTIE (Arno, 10/11/2026). MODULE PUR : ni base, ni réseau, ni horloge propre. ════════
 *
 * Arno : « Statuts d'un préavis, classables et filtrables : Alerte préavis, Préavis reçu, Pré-visite programmée, Pré-visite effectuée,
 * Pré-visite refusée / absente. Si AUCUN rendez-vous de pré-visite n'a été SAISI dans les 10 jours qui suivent la date de réception du
 * préavis, le préavis passe en alerte au 11e jour. Ce qui compte est la date de SAISIE du rendez-vous, pas la date du rendez-vous
 * lui-même. L'alerte disparaît dès qu'un rendez-vous est saisi (même après les 10 jours) ou que le mail de refus / absence est envoyé. »
 *
 * Ce module décide : le statut d'un préavis, l'alerte, les compteurs des pastilles, la saisie d'un rendez-vous, l'objet et le texte de
 * chaque mail, et l'invitation d'agenda (.ics) jointe. Le dépôt (`previsiteRepo.ts`) lit, écrit et envoie.
 */
import { composerMailLocation, enumerer, prenomNom, type Signature } from './mailsPreavisSortie';
import { dateFrPreavis, dateIsoValide, verifierEtatDesLieux } from './preavis';
import { heureFr, minutesDe, plageFr } from './edls';
import { instantParis } from '../temps/paris';

// ══ LES STATUTS ═════════════════════════════════════════════════════════════════════════════════════════════════════════

export type StatutPrevisite = 'alerte' | 'recu' | 'programmee' | 'effectuee' | 'refusee';

/** L'ordre d'Arno (pastilles et tri par statut). */
export const STATUTS_PREVISITE: readonly StatutPrevisite[] = ['alerte', 'recu', 'programmee', 'effectuee', 'refusee'];

export const LIBELLE_STATUT_PREVISITE: Record<StatutPrevisite, string> = {
  alerte: 'Alerte préavis',
  recu: 'Préavis reçu',
  programmee: 'Pré-visite programmée',
  effectuee: 'Pré-visite effectuée',
  refusee: 'Pré-visite refusée / absente',
};

/** Le cartouche de la ligne en alerte. */
export const CARTOUCHE_ALERTE = 'Aucune pré-visite fixée';
/** L'alerte de la ligne quand tous les collègues ont refusé. */
export const ALERTE_TOUS_REFUSENT = 'Personne n’a accepté la pré-visite';

/** Le délai : AUCUN rendez-vous saisi dans les 10 jours qui suivent la réception ⇒ alerte le 11e jour. */
export const JOURS_SANS_PREVISITE = 10;

/** « 2026-11-01 » + n jours, au calendrier. PUR. */
export function ajouterJours(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

/** Le jour où l'alerte se déclenche : réception + 11 jours (le 11e jour qui suit la réception). PUR. */
export function jourAlerte(recuLe: string): string {
  return ajouterJours(recuLe, JOURS_SANS_PREVISITE + 1);
}

/** Ce qu'il faut savoir d'un préavis pour son statut. Les dates sont des jours (Paris) ou des instants ISO ; seul leur ordre compte. */
export interface FaitsPrevisite {
  recuLe: string;
  /** La PREMIÈRE saisie d'un rendez-vous de pré-visite (instant ISO) ; `null` : jamais saisi. */
  rdvSaisiLe: string | null;
  /** La dernière saisie ou le dernier déplacement du rendez-vous (instant ISO) ; `null` : aucun rendez-vous. */
  rdvModifieLe?: string | null;
  /** Le mail de refus / absence envoyé (instant ISO). */
  refusLe: string | null;
  /** Le compte rendu envoyé (instant ISO). */
  effectueeLe: string | null;
}

/**
 * L'ALERTE : le 11e jour qui suit la réception, sans AUCUN rendez-vous saisi, sans mail de refus / absence, sans compte rendu.
 * La date du rendez-vous lui-même n'entre pas en compte : seule sa SAISIE (un rendez-vous saisi le 8e jour pour le 12e jour : pas
 * d'alerte). Un rendez-vous saisi après les 10 jours lève l'alerte. PUR.
 */
export function enAlerte(f: FaitsPrevisite, aujourdhui: string): boolean {
  if (f.rdvSaisiLe !== null || f.refusLe !== null || f.effectueeLe !== null) return false;
  return aujourdhui >= jourAlerte(f.recuLe);
}

/**
 * LE STATUT : compte rendu envoyé → effectuée ; mail de refus / absence envoyé APRÈS le dernier rendez-vous (ou sans rendez-vous) →
 * refusée / absente ; un rendez-vous → programmée ; sinon alerte (11e jour) ou reçu. PUR.
 */
export function statutPrevisite(f: FaitsPrevisite, aujourdhui: string): StatutPrevisite {
  if (f.effectueeLe !== null) return 'effectuee';
  const dernierRdv = f.rdvModifieLe ?? f.rdvSaisiLe;
  if (f.refusLe !== null && (dernierRdv === null || f.refusLe >= dernierRdv)) return 'refusee';
  if (f.rdvSaisiLe !== null) return 'programmee';
  return enAlerte(f, aujourdhui) ? 'alerte' : 'recu';
}

/** Les compteurs des pastilles, dans l'ordre d'Arno ; « Alerte préavis » n'apparaît que s'il y en a au moins une. PUR. */
export function pastillesPrevisite(statuts: readonly StatutPrevisite[]): { statut: StatutPrevisite; libelle: string; nombre: number }[] {
  return STATUTS_PREVISITE
    .map((s) => ({ statut: s, libelle: LIBELLE_STATUT_PREVISITE[s], nombre: statuts.filter((x) => x === s).length }))
    .filter((p) => p.statut !== 'alerte' || p.nombre > 0);
}

/** Le statut de la réponse d'un collègue invité (le module de tâches). */
export type ReponseCollegue = 'en_attente' | 'acceptee' | 'refusee';

/** Un collègue invité au rendez-vous et sa réponse courante. */
export interface ReponseDuCollegue { collaborateurId: number | null; libelle: string; email: string | null; statut: ReponseCollegue | null; motif: string | null }

/** Ce que la ligne du préavis montre de la pré-visite. */
export interface PrevisiteAffiche {
  statut: StatutPrevisite;
  rdv: RdvPrevisite | null;
  tacheId: number | null;
  collegues: ReponseDuCollegue[];
  tousRefusent: boolean;
  /** Le rendez-vous est passé : le bouton « Compte rendu pré-visite » est proposé. */
  rdvPasse: boolean;
  alerteEnvoyeeLe: string | null;
}

/** Tous les collègues invités ont refusé (au moins un invité). PUR. */
export function tousRefusent(reponses: readonly (ReponseCollegue | null)[]): boolean {
  return reponses.length > 0 && reponses.every((r) => r === 'refusee');
}

// ══ LA SAISIE DU RENDEZ-VOUS ═════════════════════════════════════════════════════════════════════════════════════════════

export interface SaisieRdvPrevisite { jour: string; debut: string; fin: string; destinataires: readonly number[] }

export type VerdictRdvPrevisite =
  | { ok: true; jour: string; heure: string; dureeMinutes: number; destinataires: number[] }
  | { ok: false; motif: string; champ: 'jour' | 'debut' | 'fin' | 'destinataires' };

const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Date précise + créneau horaire + au moins un collègue. La date suit les bornes de l'état des lieux (jamais avant la réception
 * du recommandé, au plus 6 mois après la fin du préavis). Les destinataires sont dédoublonnés, dans l'ordre (le premier reçoit la
 * tâche, les suivants y sont invités). PUR.
 */
export function verifierRdvPrevisite(s: SaisieRdvPrevisite, groupe: readonly { recuLe: string; dateMax: string }[]): VerdictRdvPrevisite {
  if ((s.jour ?? '').trim() === '') return { ok: false, motif: 'Indiquez la date de la pré-visite.', champ: 'jour' };
  if (!dateIsoValide(s.jour)) return { ok: false, motif: 'La date de la pré-visite n’est pas une date valide.', champ: 'jour' };
  const borne = verifierEtatDesLieux(s.jour, groupe);
  if (!borne.ok) return { ok: false, motif: borne.motif.replace('L’état des lieux', 'La pré-visite'), champ: 'jour' };
  const d = minutesDe(s.debut);
  if (d === null) return { ok: false, motif: 'Indiquez l’heure de début.', champ: 'debut' };
  const f = minutesDe(s.fin);
  if (f === null) return { ok: false, motif: 'Indiquez l’heure de fin.', champ: 'fin' };
  if (f <= d) return { ok: false, motif: 'L’heure de fin doit être après l’heure de début.', champ: 'fin' };
  const destinataires = [...new Set((s.destinataires ?? []).filter((x) => Number.isSafeInteger(x) && x > 0))];
  if (destinataires.length === 0) return { ok: false, motif: 'Choisissez au moins un collègue.', champ: 'destinataires' };
  return { ok: true, jour: s.jour, heure: hhmm(d), dureeMinutes: f - d, destinataires };
}

/** « le 12/11/2026 à 10h00 ». PUR. */
export function quandFr(jour: string, heure: string | null): string {
  return `le ${dateFrPreavis(jour)}${heure === null ? '' : ` à ${heureFr(heure)}`}`;
}

/** L'instant de FIN du rendez-vous (Paris) : passé, il est temps d'inviter au compte rendu. PUR. */
export function finDuRendezVous(jour: string, heure: string | null, dureeMinutes: number | null): Date {
  const [a, m, j] = jour.split('-').map(Number);
  const debut = heure === null ? null : minutesDe(heure.slice(0, 5));
  if (debut === null) return instantParis(a, m, j + 1);
  const fin = debut + (dureeMinutes ?? 60);
  return instantParis(a, m, j, Math.floor(fin / 60), fin % 60);
}

// ══ LES MAILS ══════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Un locataire du préavis, avec ses adresses en vigueur. */
export interface LocatairePrevisite { nom: string; prenom: string | null; emails: string[] }

/** Le rendez-vous, tel que les mails le disent. */
export interface RdvPrevisite { jour: string; heure: string; dureeMinutes: number }

/** La mention des mails envoyés AUTOMATIQUEMENT (alerte, invitation au compte rendu) : aucune personne ne les envoie. */
export const MENTION_AUTOMATIQUE = 'Mail envoyé automatiquement par l’outil de gestion de l’agence.';

export const OBJET_TACHE_PREVISITE = 'Pré-visite EDL de sortie';

const noms = (l: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]): string => enumerer(l.map(prenomNom));

/** « 12/11/2026 de 10h00 à 11h00 ». PUR. */
export function creneauFr(r: RdvPrevisite): string {
  const p = plageFr(r.jour, r.heure, r.dureeMinutes);
  const m = /^(\S+) (\S+)-(\S+)$/.exec(p);
  return m === null ? p : `${m[1]} de ${m[2]} à ${m[3]}`;
}

// ── L'alerte du 11e jour, aux collaborateurs ────────────────────────────────────────────────────────────────────────────

export function objetAlertePrevisite(adresse: string): string {
  return `Alerte préavis — aucune pré-visite fixée — ${adresse}`;
}

export function paragraphesAlertePrevisite(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; recuLe: string; dateMax: string; lien: string }): string[] {
  return [
    'Bonjour,',
    `Le préavis de ${noms(d.locataires)} pour le logement situé ${d.adresse}, reçu le ${dateFrPreavis(d.recuLe)} (fin du préavis le ${dateFrPreavis(d.dateMax)}), n’a fait l’objet d’aucun rendez-vous de pré-visite saisi dans les ${JOURS_SANS_PREVISITE} jours qui ont suivi sa réception.`,
    'Merci de fixer un rendez-vous de pré-visite (bouton « RDV pré-visite ») ou, si les locataires la refusent ou ne répondent pas, de leur envoyer le mail « Refus / absence de pré-visite ».',
    `Ouvrir la ligne de ce préavis : ${d.lien}`,
  ];
}

// ── 🔴 Arno (10/11/2026) — le PREMIER passage en production : UN seul mail récapitulatif (un par adresse) pour tous les préavis déjà en retard ──

export interface PreavisEnRetard { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; recuLe: string; lien: string }

export function objetRecapAlertes(n: number): string {
  return `Alerte préavis — ${n} préavis sans pré-visite fixée`;
}

export function paragraphesRecapAlertes(liste: readonly PreavisEnRetard[]): string[] {
  return [
    'Bonjour,',
    `${liste.length === 1 ? 'Le préavis suivant n’a' : `Les ${liste.length} préavis suivants n’ont`} fait l’objet d’aucun rendez-vous de pré-visite saisi dans les ${JOURS_SANS_PREVISITE} jours qui ont suivi leur réception :`,
    ...liste.map((p) => `· ${noms(p.locataires)} — ${p.adresse} — reçu le ${dateFrPreavis(p.recuLe)}
  ${p.lien}`),
    'Merci de fixer un rendez-vous de pré-visite (bouton « RDV pré-visite ») ou, si les locataires la refusent ou ne répondent pas, de leur envoyer le mail « Refus / absence de pré-visite ». Chaque nouvelle alerte fera ensuite l’objet de son propre mail.',
  ];
}

// ── Aux locataires : confirmation, puis modification ─────────────────────────────────────────────────────────────────

export function objetConfirmationLocataires(adresse: string, r: RdvPrevisite): string {
  return `Rendez-vous de pré-visite d’état des lieux de sortie — ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)} — ${adresse}`;
}

export function paragraphesConfirmationLocataires(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; rdv: RdvPrevisite }): string[] {
  return [
    `Bonjour ${noms(d.locataires)},`,
    `Nous vous confirmons le rendez-vous de pré-visite d’état des lieux de sortie de votre logement situé ${d.adresse}, le ${creneauFr(d.rdv)}.`,
    'Cette visite permet de comparer l’état actuel du logement avec l’état des lieux d’entrée et de vous signaler, si besoin, les points à reprendre avant votre départ, afin de limiter les retenues sur le dépôt de garantie.',
    'Vous trouverez en pièce jointe une invitation à ajouter à votre agenda. Si ce créneau ne vous convient pas, il vous suffit de répondre à ce message.',
    'Nous restons à votre disposition pour toute question.',
  ];
}

export function objetModificationLocataires(adresse: string, r: RdvPrevisite): string {
  return `Modification de votre rendez-vous de pré-visite — nouvelle date : ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)} — ${adresse}`;
}

export function paragraphesModificationLocataires(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; rdv: RdvPrevisite; ancien: RdvPrevisite }): string[] {
  return [
    `Bonjour ${noms(d.locataires)},`,
    `Le rendez-vous de pré-visite d’état des lieux de sortie de votre logement situé ${d.adresse}, prévu le ${creneauFr(d.ancien)}, est déplacé au ${creneauFr(d.rdv)}.`,
    'Vous trouverez en pièce jointe l’invitation mise à jour pour votre agenda. Si ce nouveau créneau ne vous convient pas, il vous suffit de répondre à ce message.',
    'Nous restons à votre disposition pour toute question.',
  ];
}

// ── Aux collègues : l'invitation à faire le compte rendu ──────────────────────────────────────────────────────────────

export function objetInvitationCompteRendu(adresse: string, r: Pick<RdvPrevisite, 'jour' | 'heure'>): string {
  return `Compte rendu de pré-visite à faire — ${adresse} — ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)}`;
}

export function paragraphesInvitationCompteRendu(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; rdv: Pick<RdvPrevisite, 'jour' | 'heure'>; lien: string }): string[] {
  return [
    'Bonjour,',
    `La pré-visite d’état des lieux de sortie du logement situé ${d.adresse} (${noms(d.locataires)}) était prévue ${quandFr(d.rdv.jour, d.rdv.heure)}.`,
    'Merci d’en faire le compte rendu : le lien ci-dessous ouvre directement la ligne de ce préavis, dépliée, avec le bouton « Compte rendu pré-visite ».',
    d.lien,
  ];
}

// ── Le compte rendu ───────────────────────────────────────────────────────────────────────────────────────────────────

/** L'objet prérempli, mot pour mot celui d'Arno. PUR. */
export function objetCompteRendu(r: Pick<RdvPrevisite, 'jour' | 'heure'>): string {
  return `Compte rendu de pré-visite d’état des lieux de sortie effectuée le ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)}`;
}

export const CORPS_MAX = 20_000;

// ── Le refus / l'absence de pré-visite, aux locataires ──────────────────────────────────────────────────────────────

export function objetRefusPrevisite(adresse: string): string {
  return `Pré-visite d’état des lieux de sortie — ${adresse}`;
}

/** Le texte prérempli (entièrement modifiable dans la modale). PUR. */
export function texteRefusPrevisite(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[] }): string {
  return [
    `Bonjour ${noms(d.locataires)},`,
    `À la suite de votre congé, nous vous avons proposé une visite de pré-état des lieux de sortie de votre logement situé ${d.adresse}, et nous vous l’avons vivement recommandée.`,
    'Malgré nos recommandations, aucun rendez-vous de pré-visite n’a pu être fixé.',
    'Les éventuelles remarques sur l’état du logement vous seront donc faites sur place, le jour de l’état des lieux de sortie. Cela ne vous laissera malheureusement pas le temps d’effectuer les réparations ou les démarches qui vous auraient permis d’éviter une retenue sur le dépôt de garantie.',
    'Nous restons à votre disposition pour toute question.',
  ].join('\n\n');
}

/** Un texte saisi (modale) découpé en paragraphes : les lignes vides séparent. PUR. */
export function paragraphesDuTexte(texte: string): string[] {
  return texte.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '');
}

// ── L'assemblage commun ────────────────────────────────────────────────────────────────────────────────────────────

/** Un mail de pré-visite prêt : ce que le récapitulatif montre et ce qui part, à l'identique. */
export interface MailPrevisite {
  sorte: 'previsite_alerte' | 'previsite_locataires' | 'previsite_locataires_modif' | 'previsite_invitation_cr' | 'previsite_compte_rendu' | 'previsite_refus';
  de: string; a: string[]; cc: string[]; objet: string; texte: string; html: string;
  /** L'invitation d'agenda jointe (.ics), le cas échéant. */
  ics?: { nom: string; contenu: string } | null;
}

/** L'identité qui signe : le compte connecté (« Mail envoyé par … ») ou l'envoi automatique. */
export type QuiEnvoie = { prenom?: string | null; nomFamille?: string | null; email: string | null } | { mention: string };

export function mailPrevisite(o: {
  sorte: MailPrevisite['sorte']; de: string; a: readonly string[]; cc: readonly string[]; objet: string; paragraphes: readonly string[];
  qui: QuiEnvoie; signature: Signature; ics?: MailPrevisite['ics'];
}): MailPrevisite {
  const c = composerMailLocation(o.paragraphes, o.qui, o.signature);
  return { sorte: o.sorte, de: o.de, a: [...o.a], cc: [...o.cc], objet: o.objet, texte: c.texte, html: c.html, ...(o.ics ? { ics: o.ics } : {}) };
}

// ══ L'INVITATION D'AGENDA (.ics) ═════════════════════════════════════════════════════════════════════════════════════
//
// `METHOD:PUBLISH` : « ajouter à mon agenda », SANS bouton de réponse — les collègues répondent par Accepter / Refuser (le module de
// tâches), les locataires en répondant au mail. Le MÊME UID d'un envoi à l'autre, la SÉQUENCE qui monte au déplacement : l'agenda du
// destinataire met l'événement à jour au lieu d'en créer un second. Heures en UTC (aucun fuseau à décrire).

const echapperIcs = (s: string): string => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Les lignes de plus de 75 octets sont repliées (RFC 5545 §3.1), sans couper un caractère. PUR. */
export function replierIcs(ligne: string): string {
  const morceaux: string[] = [];
  let courant = '';
  let octets = 0;
  for (const c of ligne) {
    const n = new TextEncoder().encode(c).length;
    if (octets + n > (morceaux.length === 0 ? 75 : 74)) { morceaux.push(courant); courant = ''; octets = 0; }
    courant += c; octets += n;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

const utcIcs = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function invitationIcs(o: {
  uid: string; sequence: number; rdv: RdvPrevisite; titre: string; lieu: string; description: string; maintenant: Date; annule?: boolean;
}): string {
  const [a, m, j] = o.rdv.jour.split('-').map(Number);
  const d = minutesDe(o.rdv.heure) ?? 0;
  const debut = instantParis(a, m, j, Math.floor(d / 60), d % 60);
  const fin = new Date(debut.getTime() + o.rdv.dureeMinutes * 60_000);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sans Vis-a-Vis//Pre-visite//FR', 'CALSCALE:GREGORIAN', `METHOD:${o.annule ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT', `UID:${o.uid}`, `SEQUENCE:${o.sequence}`, `DTSTAMP:${utcIcs(o.maintenant)}`, `DTSTART:${utcIcs(debut)}`, `DTEND:${utcIcs(fin)}`,
    `SUMMARY:${echapperIcs(o.titre)}`, `LOCATION:${echapperIcs(o.lieu)}`, `DESCRIPTION:${echapperIcs(o.description)}`,
    `STATUS:${o.annule ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR',
  ].map(replierIcs).join('\r\n') + '\r\n';
}

/** L'UID stable d'une pré-visite. PUR. */
export function uidPrevisite(previsiteId: number, domaine: string): string {
  return `previsite-${previsiteId}@${domaine.replace(/^@/, '') || 'criterimmo.fr'}`;
}

export const NOM_FICHIER_ICS = 'pre-visite.ics';
