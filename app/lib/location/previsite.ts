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
import { adressesUniques, composerMailLocation, corpsDepuisParties, enumerer, PREFIXE_COPIE_INTERNE, prenomNom, REPERE_NOM, type ParagrapheEncadre, type ParagrapheMail, type Signature } from './mailsPreavisSortie';
import { encadreMailTexte } from '../email/encadreMail';
import { paragraphesDesParties, partiesDuMail, type EditionMail, type PartieTexte, type Retouche } from './texteModifiable';
import { dateFrPreavis, dateIsoValide, verifierEtatDesLieux } from './preavis';
import { heureFr, minutesDe, plageFr } from './edls';
import { instantParis } from '../temps/paris';
import { ligneEnAlerte } from './statutLignePreavis';
import { paragraphesBoutonsRdv, partiesEdlsLocataires, partiesEdlsLocatairesModif, type LiensReponse } from './reponsesRdv';

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

/**
 * 🔴 Arno (10/11/2026) — les préavis EN ALERTE : statut « Alerte préavis » + « Personne n'a accepté la pré-visite ». LE nombre unique de la
 * pastille du menu de la Gestion ET du repère rouge du bloc replié (0 : ni pastille, ni repère). 🔴🔴 Décision d'Arno (28/11/2026) : avec
 * `maintenant` (« AAAA-MM-JJ HH:MM » à Paris), aussi « Compte rendu pré-visite à faire » et « Sortie à valider » — LA source de la liste
 * (`ligneEnAlerte` → `alertesRdv`) ; une ligne compte UNE fois, quel que soit le nombre de ses alertes. PUR.
 */
export function compterPreavisEnAlerte(lignes: readonly { previsite?: { statut: StatutPrevisite; tousRefusent?: boolean; rdv?: { jour: string; heure: string | null } | null } | null; edls?: unknown; test?: boolean }[], maintenant?: string): number {
  // 🔴 Arno (14/11/2026, 473) — un préavis de TEST n'entre dans aucun compteur
  return lignes.filter((l) => l.test !== true)
    .filter((l) => ligneEnAlerte(l, maintenant) || (l.previsite?.statut === 'programmee' && l.previsite.tousRefusent === true)).length;
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
  /** 🔴 Arno (13/11/2026) — le rendez-vous a COMMENCÉ (son heure de début est passée) : le bouton « Compte rendu pré-visite » est proposé. */
  rdvPasse: boolean;
  alerteEnvoyeeLe: string | null;
  /** 🔴 Arno (13/11/2026) — un compte rendu a été saisi (au moins un envoi journalisé) : « Voir le compte rendu » ; absent : inconnu. */
  compteRendu?: boolean;
  /**
   * 🔴 Arno (18/11/2026) — le mail de « Refus / absence » envoyé (instant ISO), et la dernière fois que le rendez-vous a été fixé ou déplacé : une
   * pré-visite peut être FIXÉE APRÈS un refus (le locataire a répondu), le refus reste au journal et la carte le mentionne discrètement.
   */
  refusLe?: string | null;
  rdvFixeLe?: string | null;
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
/** 🔴 Arno (13/11/2026) — le DÉBUT du rendez-vous (heure de Paris) : l'invitation au compte rendu part à ce moment, le bouton « Compte rendu
 *  pré-visite » est proposé dès lors (le collègue prend ses notes pendant la visite et envoie le compte rendu sur place). PUR. */
export function debutDuRendezVous(jour: string, heure: string | null): Date {
  return finDuRendezVous(jour, heure, 0);
}

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

export function paragraphesAlertePrevisite(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; recuLe: string; dateMax: string; lien: string }): ParagrapheMail[] {
  return [
    'Bonjour,',
    `Le préavis de ${noms(d.locataires)} pour le logement situé ${d.adresse}, reçu le ${dateFrPreavis(d.recuLe)} (fin du préavis le ${dateFrPreavis(d.dateMax)}), n’a fait l’objet d’aucun rendez-vous de pré-visite saisi dans les ${JOURS_SANS_PREVISITE} jours qui ont suivi sa réception.`,
    'Merci de fixer un rendez-vous de pré-visite (bouton « RDV pré-visite ») ou, si les locataires la refusent ou ne répondent pas, de leur envoyer le mail « Refus / absence de pré-visite ».',
    // 🔴 Arno (15/11/2026) — un GROS BOUTON dans le HTML ; la version texte garde la phrase et le lien
    { texte: `Ouvrir la ligne de ce préavis : ${d.lien}`, bouton: 'Ouvrir la ligne de ce préavis', lien: d.lien },
  ];
}

// ── 🔴 Arno (10/11/2026) — le PREMIER passage en production : UN seul mail récapitulatif (un par adresse) pour tous les préavis déjà en retard ──

export interface PreavisEnRetard { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; recuLe: string; lien: string }

export function objetRecapAlertes(n: number): string {
  return `Alerte préavis — ${n} préavis sans pré-visite fixée`;
}

export function paragraphesRecapAlertes(liste: readonly PreavisEnRetard[]): ParagrapheMail[] {
  return [
    'Bonjour,',
    `${liste.length === 1 ? 'Le préavis suivant n’a' : `Les ${liste.length} préavis suivants n’ont`} fait l’objet d’aucun rendez-vous de pré-visite saisi dans les ${JOURS_SANS_PREVISITE} jours qui ont suivi leur réception :`,
    // 🔴 Arno (15/11/2026) — chaque préavis : sa ligne, puis un GROS BOUTON dans le HTML ; la version texte est inchangée
    ...liste.map((p): ParagrapheMail => {
      const ligne = `· ${noms(p.locataires)} — ${p.adresse} — reçu le ${dateFrPreavis(p.recuLe)}`;
      return { texte: `${ligne}\n  ${p.lien}`, avant: ligne, bouton: 'Ouvrir la ligne de ce préavis', lien: p.lien };
    }),
    'Merci de fixer un rendez-vous de pré-visite (bouton « RDV pré-visite ») ou, si les locataires la refusent ou ne répondent pas, de leur envoyer le mail « Refus / absence de pré-visite ». Chaque nouvelle alerte fera ensuite l’objet de son propre mail.',
  ];
}

// ── Aux locataires : confirmation, puis modification ─────────────────────────────────────────────────────────────────

export function objetConfirmationLocataires(adresse: string, r: RdvPrevisite): string {
  return `Rendez-vous de pré-visite d’état des lieux de sortie — ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)} — ${adresse}`;
}

/**
 * 🔴 Arno (10/11/2026, texte modifiable) — LES PARTIES de la confirmation : appel, introduction (repères `{adresse}`, `{rendez-vous}`),
 * conclusion libre et politesse modifiables ; le paragraphe du dépôt de garantie et celui de l'invitation jointe protégés. PUR.
 */
export function partiesConfirmationLocataires(): PartieTexte[] {
  return partiesDuMail({
    appel: `Bonjour {${REPERE_NOM}},`,
    intro: 'Nous vous confirmons le rendez-vous de pré-visite d’état des lieux de sortie de votre logement situé {adresse}, le {rendez-vous}.',
    proteges: [
      { libelle: 'Pré-visite et dépôt de garantie', texte: 'Cette visite permet de comparer l’état actuel du logement avec l’état des lieux d’entrée et de vous signaler, si besoin, les points à reprendre avant votre départ, afin de limiter les retenues sur le dépôt de garantie.' },
      { libelle: 'Invitation d’agenda jointe', texte: 'Vous trouverez en pièce jointe une invitation à ajouter à votre agenda. Si ce créneau ne vous convient pas, il vous suffit de répondre à ce message.' },
    ],
    politesse: 'Nous restons à votre disposition pour toute question.',
  });
}

/** Les parties de la MODIFICATION : l'ancien et le nouveau créneau sont des repères protégés. PUR. */
export function partiesModificationLocataires(): PartieTexte[] {
  return partiesDuMail({
    appel: `Bonjour {${REPERE_NOM}},`,
    intro: 'Le rendez-vous de pré-visite d’état des lieux de sortie de votre logement situé {adresse}, prévu le {ancien rendez-vous}, est déplacé au {rendez-vous}.',
    proteges: [{ libelle: 'Invitation d’agenda jointe', texte: 'Vous trouverez en pièce jointe l’invitation mise à jour pour votre agenda. Si ce nouveau créneau ne vous convient pas, il vous suffit de répondre à ce message.' }],
    politesse: 'Nous restons à votre disposition pour toute question.',
  });
}

const valeursRdv = (d: { adresse: string; rdv: RdvPrevisite; ancien?: RdvPrevisite | null }, nom: string): Record<string, string> => ({
  [REPERE_NOM]: nom, adresse: d.adresse, 'rendez-vous': creneauFr(d.rdv), ...(d.ancien ? { 'ancien rendez-vous': creneauFr(d.ancien) } : {}) });

export function paragraphesConfirmationLocataires(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; rdv: RdvPrevisite; retouche?: Retouche }): string[] {
  return paragraphesDesParties(partiesConfirmationLocataires(), d.retouche, valeursRdv(d, noms(d.locataires)));
}

export function objetModificationLocataires(adresse: string, r: RdvPrevisite): string {
  return `Modification de votre rendez-vous de pré-visite — nouvelle date : ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)} — ${adresse}`;
}

export function paragraphesModificationLocataires(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; rdv: RdvPrevisite; ancien: RdvPrevisite; retouche?: Retouche }): string[] {
  return paragraphesDesParties(partiesModificationLocataires(), d.retouche, valeursRdv(d, noms(d.locataires)));
}

/**
 * 🔴 Arno (10/11/2026, texte modifiable) — la confirmation / modification d'UN locataire, depuis ses parties (retouche appliquée, chacun son
 * nom) : le texte PROPOSÉ gardé quand il est modifié, et ce que l'éditeur montre. PUR.
 */
export function mailRdvLocataire(o: { sorte: 'previsite_locataires' | 'previsite_locataires_modif' | 'edls_locataires' | 'edls_locataires_modif'; de: string; objet: string; adresse: string; rdv: RdvPrevisite;
  ancien: RdvPrevisite | null; locataire: LocatairePrevisite; qui: QuiEnvoie; signature: Signature; retouche?: Retouche; ics?: MailPrevisite['ics'];
  /** 🔴 Arno (18/11/2026) — les deux boutons « J'accepte le rendez-vous » / « Je refuse » de CE locataire (ses liens personnels) ; absents : le mail d'avant. */
  boutons?: LiensReponse | null }): MailPrevisite | null {
  const a = adressesUniques(o.locataire.emails);
  if (a.length === 0) return null;
  // 🔴 (18/11/2026) l'état des lieux : ses propres parties (sur le modèle de la pré-visite)
  const edls = o.sorte === 'edls_locataires' || o.sorte === 'edls_locataires_modif';
  const parties = edls ? (o.ancien === null ? partiesEdlsLocataires() : partiesEdlsLocatairesModif())
    : o.ancien === null ? partiesConfirmationLocataires() : partiesModificationLocataires();
  const c = corpsDepuisParties({ cle: o.sorte, objet: o.objet, parties,
    retouche: o.retouche, valeurs: valeursRdv(o, prenomNom(o.locataire)), qui: o.qui, signature: o.signature,
    ...(o.boutons ? { apres: paragraphesBoutonsRdv(o.boutons) } : {}) });
  return { sorte: o.sorte, de: o.de, a, cc: [], objet: o.objet, texte: c.texte, html: c.html, ...(o.ics ? { ics: o.ics } : {}),
    ...(c.texteOrigine !== null ? { texteOrigine: c.texteOrigine } : {}), edition: c.edition };
}

// ── Aux collègues : l'invitation à faire le compte rendu ──────────────────────────────────────────────────────────────

export function objetInvitationCompteRendu(adresse: string, r: Pick<RdvPrevisite, 'jour' | 'heure'>): string {
  return `Compte rendu de pré-visite à faire — ${adresse} — ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)}`;
}

export function paragraphesInvitationCompteRendu(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; rdv: Pick<RdvPrevisite, 'jour' | 'heure'>; lien: string }): ParagrapheMail[] {
  return [
    'Bonjour,',
    `La pré-visite d’état des lieux de sortie du logement situé ${d.adresse} (${noms(d.locataires)}) commence ${quandFr(d.rdv.jour, d.rdv.heure)}.`,
    'Prenez vos notes pendant la visite et envoyez le compte rendu sur place, devant le locataire : le lien ci-dessous ouvre directement le formulaire « Compte rendu pré-visite » de ce préavis (après connexion si nécessaire).',
    // 🔴 Arno (15/11/2026) — le GROS BOUTON « Rédiger le compte rendu » (et le lien de secours) ; la version texte garde le lien seul
    { texte: d.lien, bouton: 'Rédiger le compte rendu', lien: d.lien },
  ];
}

// ── 🔴 Arno (10/11/2026) — le refus / l'absence envoyé alors qu'un rendez-vous est programmé : la pré-visite est ANNULÉE pour les collègues ──

export function objetAnnulationCollegues(adresse: string, r: Pick<RdvPrevisite, 'jour' | 'heure'>): string {
  return `Pré-visite annulée — ${adresse} — ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)}`;
}

export function paragraphesAnnulationCollegues(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[]; rdv: RdvPrevisite }): string[] {
  return [
    'Bonjour,',
    `La pré-visite d’état des lieux de sortie du logement situé ${d.adresse} (${noms(d.locataires)}), prévue le ${creneauFr(d.rdv)}, est annulée : les locataires l’ont refusée ou n’ont pas répondu, et le mail de refus / absence de pré-visite leur a été envoyé.`,
    'La tâche est annulée. L’invitation d’agenda jointe retire le rendez-vous de votre agenda.',
  ];
}

// ── Le compte rendu ───────────────────────────────────────────────────────────────────────────────────────────────────

/** L'objet prérempli, mot pour mot celui d'Arno. PUR. */
export function objetCompteRendu(r: Pick<RdvPrevisite, 'jour' | 'heure'>): string {
  return `Compte rendu de pré-visite d’état des lieux de sortie effectuée le ${dateFrPreavis(r.jour)} à ${heureFr(r.heure)}`;
}

/**
 * 🔴 Arno (18/11/2026) — l'objet de la seule COPIE INTERNE du compte rendu (aux collaborateurs prévenus) : « [Copie interne] » devant
 * l'objet des mails aux clients, comme la copie du refus et celles des rendez-vous. Il la distingue des mails aux locataires et aux
 * propriétaires, qui gardent `objetCompteRendu` tel quel, et permet de la ranger en « courrier automatique » dans la boîte Gestion. PUR.
 */
export function objetCopieInterneCompteRendu(r: Pick<RdvPrevisite, 'jour' | 'heure'>): string {
  return `${PREFIXE_COPIE_INTERNE}${objetCompteRendu(r)}`;
}

export const CORPS_MAX = 20_000;

/* ══ 🔴 Arno (15/11/2026, 6e retour) — LE TEXTE DES MAILS DU COMPTE RENDU, plus soigné : factuel et poli, sans être mielleux ══════════════════
 * AUX LOCATAIRES (chacun le sien) : formule d'appel (civilité et nom si connus, sinon « Madame, Monsieur, ») ; introduction (« Suite à la
 * pré-visite de votre logement situé … effectuée le … à … en présence de …, vous trouverez ci-dessous le compte rendu des points relevés en
 * vue de l'état des lieux de sortie. ») ; le compte rendu en points à tirets ; les photos jointes annoncées ; les vocaux joints ; la clôture ;
 * la formule de politesse ; puis la mention et la signature habituelles. Jamais une coordonnée du propriétaire.
 * INTERNE : « Compte rendu de la pré-visite du … — … », « En présence de … », le texte, les photos, les vocaux, les notes de présence. */
const civiliteLongue = (c: string | null | undefined): 'Madame' | 'Monsieur' | null => {
  const x = (c ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (['madame', 'mme', 'mlle', 'mademoiselle'].includes(x)) return 'Madame';
  if (['monsieur', 'm', 'mr'].includes(x)) return 'Monsieur';
  return null;
};
/** « Madame Dupont » / « Monsieur Martin » si la civilité est connue ; sinon « Madame, Monsieur ». PUR. */
export function appelLocataire(l: { civilite?: string | null; nom: string }): string {
  const c = civiliteLongue(l.civilite);
  const nom = l.nom.replace(/\s+/g, ' ').trim();
  return c === null || nom === '' ? 'Madame, Monsieur' : `${c} ${nom}`;
}
/** La formule de politesse, accordée à l'appel (« Madame, Monsieur » ou la seule civilité). PUR. */
export function politesseLocataire(l: { civilite?: string | null }): string {
  const c = civiliteLongue(l.civilite);
  return `Nous vous prions d’agréer, ${c ?? 'Madame, Monsieur'}, nos salutations distinguées.`;
}
/** Le compte rendu en POINTS À TIRETS : chaque ligne écrite devient un point « - … » (les tirets déjà là ne sont pas doublés). PUR. */
export function pointsDuCompteRendu(texte: string): string {
  return texte.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter((l) => l !== '' && !/^-$/.test(l))
    .map((l) => (/^-/.test(l) ? `- ${l.replace(/^-\s*/, '')}` : `- ${l}`)).join('\n');
}
/** 🔴 Arno (15/11/2026, 7e retour) — l'encadré « ATTENTION » du mail aux locataires, mot pour mot (partie protégée). */
export const TITRE_ATTENTION_PREVISITE = 'ATTENTION';
export const TEXTE_ATTENTION_PREVISITE: readonly string[] = [
  'Cette pré-visite a été réalisée dans votre intérêt : elle vous permet d’anticiper les points à corriger avant votre départ, afin de préserver au mieux votre dépôt de garantie et d’éviter tout malentendu le jour de l’état des lieux de sortie.',
  'Elle ne constitue pas un état des lieux et n’a pas de valeur contractuelle. Elle porte uniquement sur les éléments les plus visibles le jour de la visite. L’état des lieux de sortie, réalisé le jour de votre départ, sera plus complet et pourra relever d’autres points non mentionnés ici, par exemple (liste non exhaustive) : le ménage de l’ensemble du logement, l’étanchéité et l’entretien des siphons et des joints, le fonctionnement des équipements, la vaisselle et l’inventaire du mobilier pour les locations meublées.',
];
export const ENCADRE_ATTENTION_PREVISITE: ParagrapheEncadre = {
  texte: encadreMailTexte(TITRE_ATTENTION_PREVISITE, TEXTE_ATTENTION_PREVISITE),
  encadre: { titre: TITRE_ATTENTION_PREVISITE, paragraphes: TEXTE_ATTENTION_PREVISITE },
};
export const CLOTURE_COMPTE_RENDU = 'Ces éléments vous permettent d’anticiper votre état des lieux de sortie. Nous restons à votre disposition pour toute question.';
/** Les paragraphes du mail d'UN locataire. `presence` : « de Mme X et de M. Y » (vide : aucune personne). PUR. */
export function paragraphesCompteRenduLocataire(o: { locataire: { civilite?: string | null; nom: string }; adresse: string; rdv: Pick<RdvPrevisite, 'jour' | 'heure'>;
  presence: string; texte: string; legendesPhotos: readonly string[]; vocaux: readonly string[];
  /** 🔴 (16/11/2026) « Absence de la partie locataire » : la phrase entière (« Pré-visite réalisée en l’absence des locataires, par … »),
   *  en paragraphe juste après l'introduction — qui ne dit alors plus « en présence de … » */
  absence?: string | null }): ParagrapheMail[] {
  const absence = (o.absence ?? '').trim();
  return [
    `${appelLocataire(o.locataire)},`,
    `Suite à la pré-visite de votre logement situé ${o.adresse} effectuée le ${dateFrPreavis(o.rdv.jour)} à ${heureFr(o.rdv.heure)}${!absence && o.presence ? ` en présence ${o.presence}` : ''}, vous trouverez ci-dessous le compte rendu des points relevés en vue de l’état des lieux de sortie.`,
    absence,
    pointsDuCompteRendu(o.texte),
    ...paragraphesPhotosJointes(o.legendesPhotos), ...o.vocaux,
    CLOTURE_COMPTE_RENDU,
    // 🔴 (7e retour) l'encadré « ATTENTION », juste avant la formule de politesse
    ENCADRE_ATTENTION_PREVISITE,
    politesseLocataire(o.locataire),
  ].filter((p) => typeof p !== 'string' || p.trim() !== '');
}
/** Les photos jointes annoncées, chacune avec sa légende (mails des locataires et des propriétaires). PUR. */
export function paragraphesPhotosJointes(legendes: readonly string[]): string[] {
  const n = legendes.length;
  return n === 0 ? [] : [`${n === 1 ? 'Vous trouverez en pièce jointe la photo prise' : `Vous trouverez en pièces jointes les ${n} photos prises`} lors de la pré-visite :`,
    legendes.map((l, i) => `Photo ${i + 1} — ${l.trim()}`).join('\n')];
}

/* ══ 🔴🔴 (16/11/2026, responsable location) — LE COMPTE RENDU AUX PROPRIÉTAIRES ══════════════════════════════════════════════════════════
 * Un mail SÉPARÉ par adresse cochée (seul destinataire, aucune copie visible) : appel, introduction adaptée au propriétaire, la présence, le
 * compte rendu en points, les photos jointes avec leurs légendes, la clôture, la politesse, puis la mention et la signature habituelles.
 * JAMAIS l'encadré « ATTENTION » (destiné aux locataires), JAMAIS un vocal, JAMAIS une coordonnée de locataire (le serveur refuse un texte qui
 * en porte). Appel, introduction, conclusion et politesse modifiables avant l'envoi (repères protégés), comme les autres mails. */
export const CLE_EDITION_CR_PROPRIETAIRE = 'previsite_compte_rendu_proprietaire';
export const REPERE_NOM_PROPRIETAIRE = 'nom du propriétaire';
export function partiesCompteRenduProprietaire(d: { presence: string; texte: string; legendesPhotos: readonly string[]; plusieursLocataires: boolean }): PartieTexte[] {
  return partiesDuMail({
    appel: `Bonjour {${REPERE_NOM_PROPRIETAIRE}},`,
    intro: `Nous avons réalisé le {date} la pré-visite de votre logement situé {adresse}, en vue du départ de ${d.plusieursLocataires ? 'vos locataires' : 'votre locataire'}. Vous trouverez ci-dessous le compte rendu des points relevés.`,
    proteges: [
      { libelle: 'Présence', texte: d.presence },
      { libelle: 'Compte rendu', texte: pointsDuCompteRendu(d.texte) },
      { libelle: 'Photos jointes', texte: paragraphesPhotosJointes(d.legendesPhotos).join('\n') },
      { libelle: 'Clôture', texte: 'Nous restons à votre disposition pour toute question.' },
    ],
    politesse: 'Nous vous prions d’agréer, Madame, Monsieur, nos salutations distinguées.',
  });
}
/** Le mail d'UNE adresse de propriétaire (elle seule en destinataire, aucune copie). PUR. */
export function mailCompteRenduProprietaire(o: { de: string; objet: string; email: string; nomProprietaire: string; adresse: string; rdv: Pick<RdvPrevisite, 'jour' | 'heure'>;
  presence: string; texte: string; legendesPhotos: readonly string[]; plusieursLocataires: boolean; qui: QuiEnvoie; signature: Signature; retouche?: Retouche }): MailPrevisite {
  const c = corpsDepuisParties({ cle: CLE_EDITION_CR_PROPRIETAIRE, objet: o.objet,
    parties: partiesCompteRenduProprietaire({ presence: o.presence, texte: o.texte, legendesPhotos: o.legendesPhotos, plusieursLocataires: o.plusieursLocataires }),
    retouche: o.retouche, valeurs: { [REPERE_NOM_PROPRIETAIRE]: o.nomProprietaire.replace(/\s+/g, ' ').trim(), date: dateFrPreavis(o.rdv.jour), adresse: o.adresse },
    qui: o.qui, signature: o.signature });
  return { sorte: 'previsite_compte_rendu', client: 'proprietaire', de: o.de, a: [o.email.trim()], cc: [], objet: o.objet, texte: c.texte, html: c.html,
    ...(c.texteOrigine !== null ? { texteOrigine: c.texteOrigine } : {}), edition: c.edition };
}

/** L'introduction courte et factuelle du mail INTERNE. PUR. */
export function introCompteRenduInterne(adresse: string, rdv: Pick<RdvPrevisite, 'jour' | 'heure'>): string {
  return `Compte rendu de la pré-visite du ${dateFrPreavis(rdv.jour)} — ${adresse}`;
}

// ── Le refus / l'absence de pré-visite, aux locataires ──────────────────────────────────────────────────────────────

export function objetRefusPrevisite(adresse: string): string {
  return `Pré-visite d’état des lieux de sortie — ${adresse}`;
}

/**
 * 🔴 Arno (10/11/2026, confidentialité) — chaque locataire reçoit SON mail : le texte prérempli porte ce repère, remplacé dans chaque mail par
 * le nom de SON destinataire (jamais les noms des colocataires).
 */
export const REPERE_NOM_LOCATAIRE = '[nom du locataire]';
export function personnaliserTexte(texte: string, l: Pick<LocatairePrevisite, 'nom' | 'prenom'>): string {
  return texte.split(REPERE_NOM_LOCATAIRE).join(prenomNom(l));
}

/** Le texte prérempli (entièrement modifiable dans la modale). PUR. */
export function texteRefusPrevisite(d: { adresse: string; locataires: readonly Pick<LocatairePrevisite, 'nom' | 'prenom'>[] }): string {
  return [
    `Bonjour ${REPERE_NOM_LOCATAIRE},`,
    `À la suite de votre congé, nous vous avons proposé une visite de pré-état des lieux de sortie de votre logement situé ${d.adresse}, et nous vous l’avons vivement recommandée.`,
    'Malgré nos recommandations, aucun rendez-vous de pré-visite n’a pu être fixé.',
    'Les éventuelles remarques sur l’état du logement vous seront donc faites sur place, le jour de l’état des lieux de sortie.',
    // 🔴 Arno (11/11/2026) — paragraphe d’Arno, mot pour mot (il remplace l’ancienne phrase sur le manque de temps pour les réparations).
    'La pré-visite a justement pour but de vous signaler à l’avance d’éventuelles différences avec l’état des lieux d’entrée, hors usure normale liée au temps, afin de vous laisser le temps d’y remédier si vous le souhaitez. Sans cette visite, si des écarts devaient être constatés le jour de la sortie, vous n’auriez plus la possibilité de les corriger au préalable, ce qui pourrait alors donner lieu à une retenue sur le dépôt de garantie. Bien entendu, si votre logement est rendu dans le même état qu’à votre arrivée, aucune retenue ne sera appliquée au titre de son état.',
    'Nous restons à votre disposition pour toute question.',
  ].join('\n\n');
}

/** Un texte saisi (modale) découpé en paragraphes : les lignes vides séparent. PUR. */
export function paragraphesDuTexte(texte: string): string[] {
  return texte.replace(/\r\n/g, '\n').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '');
}

// ── L'assemblage commun ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ══ 🔴🔴 CONFIDENTIALITÉ (Arno, 10/11/2026, sans exception) ══════════════════════════════════════════════════════════════════════
 * Un contact extérieur (locataire) reçoit SON mail, seul destinataire, sans aucune copie visible : jamais le nom, le téléphone ou l'e-mail
 * d'un autre contact, client ou collaborateur. Les collaborateurs, eux, reçoivent une COPIE INTERNE séparée, qui dit à qui chaque mail est parti.
 * 🔴 Arno (10/11/2026, décision remise) — la mention « Mail envoyé par Prénom NOM (adresse) » et la signature Gmail y sont, comme dans les
 * autres mails Location : c'est l'expéditeur de l'agence, pas la coordonnée d'un client ; aucun autre collaborateur n'y apparaît. PUR.
 */
export function mailsAuxLocataires(o: {
  sorte: MailPrevisite['sorte']; de: string; locataires: readonly LocatairePrevisite[]; objet: string;
  paragraphesDe: (l: LocatairePrevisite) => readonly ParagrapheMail[]; qui: QuiEnvoie; signature: Signature; ics?: MailPrevisite['ics'];
}): MailPrevisite[] {
  // 🔴🔴 (Arno, 17/11/2026) un mail PAR ADRESSE, marqué client (le compte rendu partage sa sorte avec le mail interne)
  return o.locataires.filter((l) => adressesUniques(l.emails).length > 0).flatMap((l) => adressesUniques(l.emails).map((x) => ({ ...mailPrevisite({
    sorte: o.sorte, de: o.de, a: [x], cc: [], objet: o.objet, paragraphes: o.paragraphesDe(l),
    qui: o.qui, signature: o.signature, ics: o.ics ?? null,
  }), client: 'locataire' as const })));
}

/** La copie interne (collaborateurs) des mails partis aux locataires : à qui, puis le texte du premier, mention et signature comprises. PUR. */
export function copieInterneLocataires(o: {
  sorte: MailPrevisite['sorte']; de: string; a: readonly string[]; objet: string; envois: readonly MailPrevisite[];
  locataires: readonly LocatairePrevisite[]; paragraphes: readonly string[]; qui: QuiEnvoie; signature: Signature;
}): MailPrevisite | null {
  const a = adressesUniques(o.a);
  if (a.length === 0 || o.envois.length === 0) return null;
  const destinataires = o.locataires.filter((l) => adressesUniques(l.emails).length > 0).map((l) => `· ${prenomNom(l)} — ${adressesUniques(l.emails).join(', ')}`);
  return mailPrevisite({
    sorte: o.sorte, de: o.de, a, cc: [], objet: `[Copie interne] ${o.objet}`, qui: o.qui, signature: o.signature,
    paragraphes: [`Copie interne : ce mail est parti séparément à chaque locataire (un destinataire par mail, sans copie visible) :\n${destinataires.join('\n')}`,
      'Texte reçu (chaque locataire avec son propre nom) :', ...o.paragraphes],
  });
}

/** Un mail de pré-visite prêt : ce que le récapitulatif montre et ce qui part, à l'identique. */
export interface MailPrevisite {
  sorte: 'previsite_alerte' | 'previsite_locataires' | 'previsite_locataires_modif' | 'previsite_invitation_cr' | 'previsite_compte_rendu' | 'previsite_refus'
    | 'previsite_annulation'
    // 🔴 Arno (18/11/2026, 495) — l'invitation des locataires à l'état des lieux, et le mail interne d'un rendez-vous confirmé / refusé
    | 'edls_locataires' | 'edls_locataires_modif' | 'rdv_confirmation_interne' | 'rdv_refus_interne'
    // 🔴 Arno (19/11/2026, 502) — l'annulation d'un rendez-vous aux locataires qui l'avaient confirmé
    | 'rdv_annulation_locataires';
  de: string; a: string[]; cc: string[]; objet: string; texte: string; html: string;
  /** L'invitation d'agenda jointe (.ics), le cas échéant. */
  ics?: { nom: string; contenu: string } | null;
  /** 🔴🔴 Arno (17/11/2026) — mail à un CLIENT (le verrou « une seule adresse » le lit quand la sorte ne le dit pas : compte rendu). */
  client?: 'locataire' | 'proprietaire';
  /** 🔴 Arno (13/11/2026, lot B) — les photos du compte rendu, en pièces jointes (« Photo-1-légende.jpg ») ; octets relus au moment de l'envoi. */
  pieces?: readonly { id: number; nom: string; typeMime: string; taille: number; octets?: Uint8Array }[];
  /** 🔴 Arno (10/11/2026, texte modifiable) — le texte PROPOSÉ quand il a été modifié ; ce que l'éditeur montre. */
  texteOrigine?: string | null;
  edition?: EditionMail;
}

/** L'identité qui signe : le compte connecté (« Mail envoyé par … ») ou l'envoi automatique. */
export type QuiEnvoie = { prenom?: string | null; nomFamille?: string | null; email: string | null } | { mention: string | null };

export function mailPrevisite(o: {
  sorte: MailPrevisite['sorte']; de: string; a: readonly string[]; cc: readonly string[]; objet: string; paragraphes: readonly ParagrapheMail[];
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
