/**
 * ══ 🔴🔴 L'ÉTAT DES LIEUX DE SORTIE (EDLS) PLANIFIÉ — MODULE PUR (Arno, 19/10/2026) ════════════════════════════════════
 *
 * Depuis le bloc « Locataires en préavis » de l'accueil Location, « Planifier l'état des lieux de sortie » crée une TÂCHE
 * (rendez-vous) par le module de tâches de la Gestion — aucun second système de tâches : mail de demande d'acceptation,
 * « en attente de confirmation », acceptation / refus, agenda Google, mode RECETTE. Ce module ne lit rien, n'écrit rien :
 * il juge une saisie, compose la mention de la ligne et le récapitulatif de la mission.
 *
 * La DATE de l'EDLS est la date d'état des lieux de l'occupation (`etat_des_lieux_prevu_le`, migration 384) : une seule
 * donnée, que le tri « État des lieux » lit.
 */
import { dateFrPreavis, verifierEtatDesLieux } from './preavis';

/** L'objet de la tâche : il est aussi la marque qui donne au mail son objet « EDL de sortie — … ». */
export const OBJET_TACHE_EDLS = 'EDL de sortie';
export const PREFIXE_DEPLACEMENT_EDLS = 'Rendez-vous déplacé — ';

export const COMMENTAIRE_MAX = 1000;
const HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Les minutes depuis minuit de « HH:MM », ou `null`. PUR. */
export function minutesDe(h: string): number | null {
  const m = HEURE.exec((h ?? '').trim());
  return m === null ? null : Number(m[1]) * 60 + Number(m[2]);
}

const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** L'heure de fin proposée : début + 1 h (bornée à 23:59, le rendez-vous ne passe pas minuit). PUR. */
export function heureFinProposee(debut: string): string {
  const m = minutesDe(debut);
  return m === null ? '' : hhmm(Math.min(m + 60, 23 * 60 + 59));
}

/** « 10h00 ». PUR. */
export function heureFr(h: string | null): string {
  const m = h === null ? null : minutesDe(h.slice(0, 5));
  return m === null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`;
}

/** « 12/11/2026 10h00-11h00 ». PUR. */
export function plageFr(jour: string, heure: string | null, dureeMinutes: number | null): string {
  const debut = heure === null ? null : minutesDe(heure.slice(0, 5));
  if (debut === null) return dateFrPreavis(jour);
  const fin = hhmm(Math.min(debut + (dureeMinutes ?? 60), 23 * 60 + 59));
  return `${dateFrPreavis(jour)} ${heureFr(heure)}-${heureFr(fin)}`;
}

export interface SaisieEdls { jour: string; debut: string; fin: string; confieA: number | null; commentaire: string | null }

export type VerdictEdls = { ok: true; jour: string; heure: string; dureeMinutes: number; commentaire: string | null } | { ok: false; motif: string; champ: 'jour' | 'debut' | 'fin' | 'confieA' | 'commentaire' };

/**
 * LA SAISIE DE PLANIFICATION (la même à l'écran et au serveur) : date, heure de début, heure de fin (après le début), la
 * personne à qui l'EDLS est confié, un commentaire facultatif. La date suit les bornes de l'état des lieux (jamais avant
 * la réception du recommandé, au plus 6 mois après la fin du préavis). PUR.
 */
export function verifierPlanification(s: SaisieEdls, groupe: readonly { recuLe: string; dateMax: string }[]): VerdictEdls {
  if ((s.jour ?? '').trim() === '') return { ok: false, motif: 'Indiquez la date de l’état des lieux de sortie.', champ: 'jour' };
  const borne = verifierEtatDesLieux(s.jour, groupe);
  if (!borne.ok) return { ok: false, motif: borne.motif, champ: 'jour' };
  const d = minutesDe(s.debut);
  if (d === null) return { ok: false, motif: 'Indiquez l’heure de début.', champ: 'debut' };
  const f = minutesDe(s.fin);
  if (f === null) return { ok: false, motif: 'Indiquez l’heure de fin.', champ: 'fin' };
  if (f <= d) return { ok: false, motif: 'L’heure de fin doit être après l’heure de début.', champ: 'fin' };
  if (s.confieA === null) return { ok: false, motif: 'Choisissez à qui confier l’état des lieux.', champ: 'confieA' };
  const commentaire = (s.commentaire ?? '').trim();
  if (commentaire.length > COMMENTAIRE_MAX) return { ok: false, motif: `Le commentaire dépasse ${COMMENTAIRE_MAX} caractères.`, champ: 'commentaire' };
  return { ok: true, jour: s.jour, heure: hhmm(d), dureeMinutes: f - d, commentaire: commentaire === '' ? null : commentaire };
}

/** L'EDLS d'une ligne de préavis, tel que la ligne le montre (la tâche et la demande de la personne à qui il est confié). */
export interface EdlsAffiche {
  edlsId: number;
  tacheId: number;
  jour: string;
  heure: string | null;
  dureeMinutes: number | null;
  confieA: string;
  confieAId: number | null;
  /** `null` : acceptation non installée (migration 349) — l'EDLS est planifié sans statut de réponse. */
  statut: 'en_attente' | 'acceptee' | 'refusee' | null;
  reponduPar: string | null;
  motifRefus: string | null;
}

/** « EDLS planifié » / « EDLS à réattribuer » : le mot de la pastille de la ligne. PUR. */
export function pastilleEdls(e: Pick<EdlsAffiche, 'statut'>): string {
  return e.statut === 'refusee' ? 'EDLS à réattribuer' : 'EDLS planifié';
}

/**
 * LA MENTION COMPLÈTE de l'EDLS, en toutes lettres : « EDLS le 12/11/2026 à 10h00 — confié à Claire Test — en attente de
 * confirmation » (ou « accepté », ou « refusé ») ; refusé : « Refusée par Claire Test — à réattribuer ». PUR.
 */
export function mentionEdls(e: Pick<EdlsAffiche, 'jour' | 'heure' | 'confieA' | 'statut' | 'reponduPar'>): string {
  if (e.statut === 'refusee') return `Refusée par ${e.reponduPar ?? e.confieA} — à réattribuer`;
  const quand = `EDLS le ${dateFrPreavis(e.jour)}${e.heure === null ? '' : ` à ${heureFr(e.heure)}`}`;
  const etat = e.statut === 'acceptee' ? 'accepté' : e.statut === 'en_attente' ? 'en attente de confirmation' : null;
  return [quand, `confié à ${e.confieA}`, etat].filter((x) => x !== null).join(' — ');
}

/** Ce qu'il faut pour écrire le récapitulatif de la mission. */
export interface DonneesRecap {
  adresse: string | null;
  acces: { libelle: string; valeur: string }[];
  lots: string[];
  proprietaires: { nom: string; telephones: string[]; emails: string[] }[];
  locataires: { nom: string; telephones: string[]; emails: string[] }[];
  preavis: { recuLe: string; dateMax: string };
  commentaire: string | null;
}

/**
 * LE RÉCAPITULATIF DE LA MISSION (les « Précisions » du mail de la tâche) : mission, adresse complète, accès, nombre de
 * lots et leur liste, propriétaire(s), locataire(s) sortant(s), dates du préavis, commentaire. La date et la plage horaire,
 * l'expéditeur et les liens Accepter / Refuser sont écrits par le mail de la tâche lui-même. N'écrit que ce qui existe. PUR.
 */
export function texteRecapEdls(d: DonneesRecap): string {
  const l: string[] = ['Mission : état des lieux de sortie.'];
  if (d.adresse) l.push('', `Adresse : ${d.adresse}`);
  if (d.acces.length > 0) { l.push('', 'Accès :'); for (const a of d.acces) l.push(`· ${a.libelle} : ${a.valeur}`); }
  l.push('', `Lots concernés (${d.lots.length}) :`, ...d.lots.map((x) => `· ${x}`));
  const personne = (p: { nom: string; telephones: string[]; emails: string[] }): string =>
    [p.nom, ...p.telephones.map((t) => `tél. ${t}`), ...p.emails].join(' — ');
  if (d.proprietaires.length > 0) l.push('', `Propriétaire${d.proprietaires.length > 1 ? 's' : ''} :`, ...d.proprietaires.map((p) => `· ${personne(p)}`));
  if (d.locataires.length > 0) l.push('', `Locataire${d.locataires.length > 1 ? 's' : ''} sortant${d.locataires.length > 1 ? 's' : ''} :`, ...d.locataires.map((p) => `· ${personne(p)}`));
  l.push('', `Préavis : recommandé reçu le ${dateFrPreavis(d.preavis.recuLe)} — fin du préavis le ${dateFrPreavis(d.preavis.dateMax)}`);
  if (d.commentaire) l.push('', `Commentaire : ${d.commentaire}`);
  return l.join('\n');
}

/**
 * L'OBJET DES MAILS D'UNE TÂCHE D'EDLS (le mail de la tâche le demande ici, et nulle part ailleurs) :
 *   · invitation : « EDL de sortie — 4 rue Fictive — 12/11/2026 10h00-11h00 », préfixé « Rendez-vous déplacé — » après
 *     un déplacement ;
 *   · confirmation à l'expéditeur : « EDLS du 12/11 accepté par Claire Test » / « … refusé par … ».
 * `null` pour une autre tâche, ou une autre sorte de mail : le mail garde alors son objet ordinaire. PUR.
 */
export function objetMailEdls(o: {
  objetTache: string; sorte: 'invitation' | 'recapitulatif' | 'confirmation'; adresseCourte: string | null;
  jour: string; heure: string | null; dureeMinutes: number | null; deplace?: boolean; par?: string; refusee?: boolean;
}): string | null {
  if (o.objetTache.trim() !== OBJET_TACHE_EDLS) return null;
  if (o.sorte === 'invitation') {
    return `${o.deplace ? PREFIXE_DEPLACEMENT_EDLS : ''}${OBJET_TACHE_EDLS}${o.adresseCourte ? ` — ${o.adresseCourte}` : ''} — ${plageFr(o.jour, o.heure, o.dureeMinutes)}`;
  }
  if (o.sorte === 'confirmation') return `EDLS du ${dateFrPreavis(o.jour).slice(0, 5)} ${o.refusee ? 'refusé' : 'accepté'} par ${o.par ?? '—'}`;
  return null;
}
