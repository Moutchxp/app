import { FUSEAU_AFFICHAGE } from './ecran';
import type { TonMail } from './historiqueBien';

/**
 * ══ 🔴🔴 LOT HISTORIQUE-BIEN-17, POINT 2 — LA FRISE CHRONOLOGIQUE DE LA VIE DU BIEN. MODULE PUR ══════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (05/10/2026), à la place de l'ancienne légende, pleine largeur :
 *
 *   « Affichage par défaut : les 12 derniers mois, aujourd'hui à droite. On peut défiler vers le passé, vers la
 *     GAUCHE […] jusqu'au premier mail du bien. […]
 *     PARTIE HAUTE (3/4) : un trait vertical fin par MAIL REÇU, placé à sa date et à son heure ; ROUGE =
 *     propriétaire […], VERT = locataire […], BLEU = tiers indépendant, gris pâle = non affecté. […]
 *     REPÈRES D'OCCUPATION : un repère distinct pour chaque DATE D'ENTRÉE et chaque DATE DE SORTIE […]
 *     ÉVÉNEMENTS : la période d'un événement […] colore TOUT le fond de la partie haute en ORANGE clair […]
 *     PARTIE BASSE (1/4) : un bloc par MOIS […] avec dedans le TOTAL des mails du mois. »
 *
 * ═══ 🔴 CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ══════════════════════════════════════════════════════
 *
 * Il décide de TOUT ce qui se calcule : quels mois la frise couvre, où tombe chaque mail dans le temps, les
 * totaux mensuels, les repères d'entrée et de sortie, les bandeaux d'événements, les bornes à surligner, et tous
 * les mots affichés. L'écran place et peint — il ne calcule aucune date.
 *
 * ⚠️ TOUT EST EN HEURE DE PARIS, et il le fallait : un mail reçu le 1er janvier à 00:30 à Paris est encore le
 * 31 décembre en UTC. Compté en UTC, il aurait changé de mois — et le total du mois de janvier aurait manqué
 * d'une unité par rapport au listing, qui affiche la date de Paris.
 *
 * ⚠️ LES POSITIONS SONT EN « INDEX DE MOIS + FRACTION », jamais en pixels : la largeur d'un mois est une variable
 * de la feuille de style, et un calcul en pixels aurait figé ici une décision d'habillage. L'écran multiplie.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Combien de mois la frise montre à l'arrivée. Arno : « les 12 derniers mois, aujourd'hui à droite ».
 *
 * ⚠️ C'EST UNE FENÊTRE D'AFFICHAGE, PAS UNE BORNE DE LECTURE : la frise CONTIENT tout l'historique du bien, et
 * c'est le défilement qui ramène au premier mail. Tronquer les données aurait rendu « ← plus ancien » menteur.
 */
export const MOIS_VISIBLES_PAR_DEFAUT = 12;

/** Un mail, réduit à ce que la frise a besoin d'en savoir. */
export interface MailDeLaFrise {
  messageId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  objet: string | null;
}

/** Les champs d'une date en heure de Paris. Écrit ici parce que `ecran.ts` ne les exporte pas. */
function champsParis(d: Date): { annee: number; mois: number; jour: number; heure: number; minute: number } {
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_AFFICHAGE, year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const v = (t: string): number => Number(p.find((x) => x.type === t)?.value ?? '0');
  return { annee: v('year'), mois: v('month'), jour: v('day'), heure: v('hour'), minute: v('minute') };
}

/**
 * La clé du mois d'une date, en heure de Paris : « 2026-03 ». `null` si la date est illisible.
 *
 * ⚠️ `null` PLUTÔT QU'UN MOIS INVENTÉ : une date illisible ne doit pas gonfler le total d'un mois au hasard.
 * L'appelant l'écarte, et la frise compte alors un mail de moins — ce qui est la vérité.
 */
export function cleDuMois(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const c = champsParis(d);
  return `${c.annee}-${String(c.mois).padStart(2, '0')}`;
}

/** Le nombre de jours d'un mois donné (clé « AAAA-MM »). PUR. */
export function joursDuMois(cle: string): number {
  const [a, m] = cle.split('-').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(m)) return 30;
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/**
 * ══ 🔴 OÙ TOMBE UNE DATE DANS SON MOIS — ENTRE 0 ET 1. PUR. ═════════════════════════════════════════════════════
 *
 * Arno : « un trait vertical fin par MAIL REÇU, placé à sa date ET À SON HEURE ».
 *
 * 🔴 L'HEURE COMPTE, ET C'EST CE QUI SÉPARE DEUX MAILS DU MÊME JOUR. Sans elle, dix mails d'une même journée
 * auraient tous le même trait — « sans se cacher » devenait impossible à tenir.
 *
 * ⚠️ LE JOUR EST COMPTÉ À PARTIR DE ZÉRO (le 1er à 00:00 est à la position 0) : un mois de 31 jours va donc de
 * 0 à 31/31 exclu. Compter à partir de 1 aurait décalé toute la frise d'un jour.
 */
export function positionDansLeMois(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const c = champsParis(d);
  const n = joursDuMois(`${c.annee}-${String(c.mois).padStart(2, '0')}`);
  const jours = (c.jour - 1) + (c.heure * 60 + c.minute) / 1440;
  return Math.min(0.999, Math.max(0, jours / n));
}

/** Le mois suivant une clé « AAAA-MM ». PUR. */
export function moisSuivant(cle: string): string {
  const [a, m] = cle.split('-').map(Number);
  return m >= 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * ══ 🔴🔴 LES MOIS QUE LA FRISE COUVRE, DU PLUS ANCIEN AU PLUS RÉCENT. PUR. ══════════════════════════════════════
 *
 * Du mois du PREMIER mail jusqu'au mois d'AUJOURD'HUI, sans trou — un mois sans courrier est un mois qui compte
 * zéro, et le sauter aurait fait mentir l'échelle du temps : deux traits séparés de trois mois vides se seraient
 * touchés.
 *
 * 🔴 AU MOINS `MOIS_VISIBLES_PAR_DEFAUT` MOIS, MÊME SUR UN BIEN NEUF : « les 12 derniers mois » est la fenêtre
 * d'arrivée, et une frise de deux mois étirée sur toute la largeur aurait donné une échelle différente d'un bien
 * à l'autre — donc deux frises qu'on ne peut pas comparer d'un coup d'œil.
 *
 * ⚠️ BORNÉE À `MOIS_MAX` : un bien dont le premier mail remonte à quinze ans ferait 180 colonnes. Au-delà, la
 * frise commence au plus ancien mois qu'elle peut montrer, et l'écran le DIT (voir `motFriseTronquee`).
 */
export const MOIS_MAX = 120;

export function moisDeLaFrise(mails: readonly MailDeLaFrise[], maintenant: Date): string[] {
  const fin = cleDuMois(maintenant.toISOString()) ?? '1970-01';
  const cles = mails.map((m) => cleDuMois(m.recuLe)).filter((c): c is string => c !== null);
  let debut = cles.length === 0 ? fin : cles.reduce((a, b) => (a < b ? a : b));
  if (debut > fin) debut = fin;
  /**
   * 🔴🔴 ON CONSTRUIT **DEPUIS LA FIN**, ET C'EST UNE CORRECTION TROUVÉE PAR LES ÉPREUVES. Ma première version
   * partait du premier mail et s'arrêtait au plafond : sur un bien dont le courrier remonte à vingt ans, la
   * frise finissait donc dix ans AVANT aujourd'hui — « aujourd'hui à droite » était faux, et la frise ne
   * montrait que du passé lointain. Le plafond doit renoncer au plus ANCIEN, jamais au plus récent.
   */
  const out: string[] = [];
  for (let c = fin; c >= debut && out.length < MOIS_MAX; c = moisPrecedent(c)) out.unshift(c);
  // Le plancher des douze mois : on complète PAR LE PASSÉ, pour qu'« aujourd'hui » reste à droite.
  while (out.length < MOIS_VISIBLES_PAR_DEFAUT) out.unshift(moisPrecedent(out[0]));
  return out;
}

/** Le mois précédant une clé « AAAA-MM ». PUR. */
export function moisPrecedent(cle: string): string {
  const [a, m] = cle.split('-').map(Number);
  return m <= 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}

/** La frise a-t-elle dû renoncer à des mois ? Le mot le dit ; `null` quand tout tient. PUR. */
export function motFriseTronquee(mails: readonly MailDeLaFrise[], mois: readonly string[]): string | null {
  const cles = mails.map((m) => cleDuMois(m.recuLe)).filter((c): c is string => c !== null);
  if (cles.length === 0 || mois.length === 0) return null;
  const plusAncien = cles.reduce((a, b) => (a < b ? a : b));
  return plusAncien < mois[0]
    ? `La frise commence en ${motDuMois(mois[0], true)} : le bien a du courrier plus ancien.`
    : null;
}

/** Les totaux d'un mois. */
export interface TotalDuMois { total: number; recus: number; envoyes: number }

/**
 * ══ 🔴 LES TOTAUX MENSUELS — UN SEUL PARCOURS. PUR. ═════════════════════════════════════════════════════════════
 *
 * Arno : « un bloc par MOIS […] avec dedans le TOTAL des mails du mois. Le détail "N reçus · N envoyés" s'affiche
 * au survol. »
 *
 * ⚠️ LE TOTAL EST CELUI DE **TOUS** LES MAILS DU MOIS, reçus ET envoyés — c'est ce que le mot « total » dit, et
 * c'est ce que le listing affiche sur ce mois. La partie haute, elle, ne porte que les REÇUS (demande d'Arno) :
 * les deux nombres diffèrent donc, et c'est voulu. Le survol les sépare pour qu'on puisse le vérifier.
 */
export function totauxParMois(mails: readonly MailDeLaFrise[]): Map<string, TotalDuMois> {
  const m = new Map<string, TotalDuMois>();
  for (const x of mails) {
    const cle = cleDuMois(x.recuLe);
    if (cle === null) continue;
    const t = m.get(cle) ?? { total: 0, recus: 0, envoyes: 0 };
    t.total += 1;
    if (x.sens === 'recu') t.recus += 1; else t.envoyes += 1;
    m.set(cle, t);
  }
  return m;
}

const MOIS_COURTS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

/**
 * Le nom court d'un mois, avec l'année quand elle change. PUR.
 *
 * Arno : « nom court du mois, et l'année au changement d'année ».
 */
export function motDuMois(cle: string, avecAnnee: boolean): string {
  const [a, m] = cle.split('-').map(Number);
  const nom = MOIS_COURTS[Math.min(11, Math.max(0, m - 1))] ?? '';
  return avecAnnee ? `${nom} ${a}` : nom;
}

/** L'année doit-elle être écrite devant ce mois ? Oui pour le premier, et à chaque changement d'année. PUR. */
export function anneeAEcrire(mois: readonly string[], i: number): boolean {
  if (i === 0) return true;
  return mois[i].slice(0, 4) !== mois[i - 1].slice(0, 4);
}

/** Le détail d'un mois, au survol. PUR. */
export function motDetailDuMois(cle: string, t: TotalDuMois | undefined): string {
  const x = t ?? { total: 0, recus: 0, envoyes: 0 };
  const mot = motDuMois(cle, true);
  return `${mot} — ${x.recus} reçu${x.recus > 1 ? 's' : ''} · ${x.envoyes} envoyé${x.envoyes > 1 ? 's' : ''}`;
}

/** Un repère d'occupation : l'entrée ou la sortie d'un locataire. */
export interface RepereOccupation {
  sorte: 'entree' | 'sortie';
  /** La date ISO du repère, telle que la fiche la porte. */
  quand: string;
  libelle: string;
}

/**
 * ══ 🔴 LES REPÈRES D'ENTRÉE ET DE SORTIE. PUR. ══════════════════════════════════════════════════════════════════
 *
 * Arno : « un repère distinct pour chaque DATE D'ENTRÉE […] et chaque DATE DE SORTIE d'un locataire […] Tous les
 * locataires du bien, actuel et anciens. »
 *
 * ⚠️ UNE OCCUPATION SANS DATE DE SORTIE N'EN POSE PAS : c'est le locataire en place, il n'est pas sorti. Poser un
 * repère « sortie » à aujourd'hui aurait annoncé un départ qui n'a pas eu lieu.
 *
 * ⚠️ NI L'UNE NI L'AUTRE QUAND LA DATE MANQUE : une occupation dont on ignore l'entrée existe (l'annuaire en
 * porte), et lui inventer une date l'aurait placée au hasard sur la frise.
 */
export function reperesDoccupation(
  occupations: readonly { libelle: string; depuis: string | null; jusqua: string | null }[],
): RepereOccupation[] {
  const out: RepereOccupation[] = [];
  for (const o of occupations) {
    if (o.depuis !== null && o.depuis !== '') out.push({ sorte: 'entree', quand: o.depuis, libelle: o.libelle });
    if (o.jusqua !== null && o.jusqua !== '') out.push({ sorte: 'sortie', quand: o.jusqua, libelle: o.libelle });
  }
  /**
   * 🔴 À DATE ÉGALE, LA SORTIE AVANT L'ENTRÉE — et ce n'est pas une coquetterie : sur lot-146, VAGLIO sort le
   * 22/10/2025 et BRASSET entre le MÊME JOUR. Sans cet ordre explicite, les deux repères paraissaient dans
   * l'ordre où l'annuaire les rend, qui n'a aucune raison d'être celui du bail — on aurait lu « entrée puis
   * sortie » sur une relocation, c'est-à-dire l'histoire à l'envers.
   */
  return out.sort((a, b) => (a.quand < b.quand ? -1 : a.quand > b.quand ? 1
    : (a.sorte === b.sorte ? 0 : a.sorte === 'sortie' ? -1 : 1)));
}

/** Le mot d'un repère, au survol. PUR. */
export function motRepere(r: RepereOccupation): string {
  return `${motCourtRepere(r.sorte)} — ${r.libelle}`;
}

/**
 * ══ 🔴 LOT HISTORIQUE-BIEN-18, POINT 2 — LE MOT COURT DU DRAPEAU ════════════════════════════════════════════════
 *
 * Arno : « petit drapeau en tête avec le texte court "Entrée" (vert) / "Sortie" (gris foncé) ».
 *
 * 🔴 UN MOT, ET PAS SEULEMENT UN PICTO. « ▶ » et « ■ » ne disent rien à qui ne les a pas appris, et c'est le mot
 * qui informe — la couleur et la forme ne font que l'appuyer. C'est la règle de tout ce module depuis la légende
 * des barres.
 *
 * ⚠️ LE MÊME MOT SERT LE DRAPEAU ET L'INFO-BULLE : « Entrée » en tête, « Entrée — VAGLIO … » au survol. Deux
 * écritures auraient fini par dire « Arrivée » d'un côté et « Entrée » de l'autre.
 */
export function motCourtRepere(sorte: 'entree' | 'sortie'): string {
  return sorte === 'entree' ? 'Entrée' : 'Sortie';
}

/** Le bandeau orange d'un événement, borné à aujourd'hui quand il est encore ouvert. */
export interface BandeauEvenement { du: string; au: string; titre: string }

/**
 * ══ 🔴 LA PÉRIODE D'UN ÉVÉNEMENT, BORNÉE. PUR. ═════════════════════════════════════════════════════════════════
 *
 * Arno : « la période d'un événement (ouverture → clôture, ou → aujourd'hui s'il est en cours) colore TOUT le
 * fond de la partie haute en ORANGE clair sur cette durée, avec le titre au survol. »
 *
 * ⚠️ UN ÉVÉNEMENT SANS DATE D'OUVERTURE EST ÉCARTÉ : on ne sait pas où commencer, et commencer au début de la
 * frise aurait colorié des années de courrier qui ne le concernent pas.
 *
 * ⚠️ UN ÉVÉNEMENT CLOS AVANT D'ÊTRE OUVERT (donnée abîmée) est écarté aussi : un bandeau de largeur négative ne
 * se dessine pas, il déborde.
 */
export function bandeauxDesEvenements(
  evenements: readonly { reference: string; objet: string | null; ouvert: boolean;
    ouvertLe: string | null; closLe: string | null }[],
  maintenant: Date,
): BandeauEvenement[] {
  const fin = maintenant.toISOString();
  const out: BandeauEvenement[] = [];
  for (const e of evenements) {
    if (e.ouvertLe === null || e.ouvertLe === '') continue;
    const au = e.ouvert || e.closLe === null || e.closLe === '' ? fin : e.closLe;
    if (au < e.ouvertLe) continue;
    out.push({
      du: e.ouvertLe, au,
      titre: `${e.reference}${e.objet === null || e.objet.trim() === '' ? '' : ` — ${e.objet}`}`
        + (e.ouvert ? ' (en cours)' : ''),
    });
  }
  return out;
}

/**
 * ══ 🔴 LA POSITION D'UNE DATE SUR LA FRISE, EN « INDEX DE MOIS + FRACTION ». PUR. ═══════════════════════════════
 *
 * `null` quand la date tombe hors des mois couverts : l'écran ne dessine alors rien, plutôt qu'un trait collé au
 * bord qui ferait croire à un courrier qu'on n'a pas.
 */
export function positionSurLaFrise(iso: string, mois: readonly string[]): number | null {
  const cle = cleDuMois(iso);
  if (cle === null || mois.length === 0) return null;
  const i = mois.indexOf(cle);
  if (i === -1) return null;
  return i + positionDansLeMois(iso);
}

/**
 * Les bornes d'un bandeau sur la frise, rognées aux mois couverts. `null` si la période ne la croise pas.
 *
 * ⚠️ LE ROGNAGE EST INDISPENSABLE : un événement ouvert il y a trois ans, sur une frise qui n'en couvre qu'un,
 * doit colorier du bord gauche jusqu'à sa fin — et non disparaître parce que son début est hors champ.
 */
export function bornesSurLaFrise(
  du: string, au: string, mois: readonly string[],
): { de: number; a: number } | null {
  if (mois.length === 0) return null;
  const debutFrise = `${mois[0]}-01T00:00:00Z`;
  const finFrise = `${mois[mois.length - 1]}-31T23:59:59Z`;
  if (au < debutFrise || du > finFrise) return null;
  const de = positionSurLaFrise(du, mois) ?? 0;
  const a = positionSurLaFrise(au, mois) ?? mois.length;
  return { de: Math.max(0, Math.min(de, mois.length)), a: Math.max(0, Math.min(a, mois.length)) };
}

/** Le mot du survol d'un trait : expéditeur, date et heure, objet. PUR. */
export function motSurvolMail(m: MailDeLaFrise, quand: string): string {
  const qui = m.deNom === null || m.deNom.trim() === '' ? m.de : m.deNom.trim();
  const objet = m.objet === null || m.objet.trim() === '' ? '(sans objet)' : m.objet.trim();
  return `${qui} — ${quand} — ${objet}`;
}

/** Le mot qui dit qu'il reste du passé à gauche. `null` quand on est déjà au bout. PUR. */
export const MOT_PLUS_ANCIEN = '← plus ancien';

/** Les mails REÇUS, ceux que la partie haute dessine. PUR. */
export function mailsRecus(mails: readonly MailDeLaFrise[]): MailDeLaFrise[] {
  return mails.filter((m) => m.sens === 'recu');
}

/** Le ton d'un trait, dans la palette des liserés. Le gris pâle est celui des « non affectés ». */
export type TonTrait = TonMail;
