/**
 * ══ 🔴🔴 LOT TACHES-1 — LES TÂCHES RATTACHÉES À UN BIEN : LA RÈGLE UNIQUE ═══════════════════════════════════════════
 *
 * DÉCISIONS D'ARNO (13/10/2026) :
 *   · une tâche est rattachée à UN bien, datée ; AVEC heure = rendez-vous, SANS heure = repère sur la journée ;
 *   · confiée par défaut au collaborateur connecté, ou à un collègue ayant l'accès Gestion ;
 *   · rappels par défaut : rendez-vous = la veille + 1 h avant ; repère = le jour même à 9 h. Modifiables ;
 *   · jamais de suppression : faite, décalée, annulée restent tracées (« décalée par X le … (ancienne → nouvelle) »).
 *
 * 🔴🔴 RÈGLE RÉVISÉE PAR ARNO (13/10/2026, lot COULEURS-TACHES) — le blanc disparaît :
 *   · date passée               → ROUGE FONCÉ / bordeaux (« En retard »)
 *   · aujourd'hui ET demain     → ROUGE (« Aujourd'hui » / « Demain »)
 *   · après-demain              → ORANGE (« Dans 2 jours »)
 *   · dans 3 jours et plus      → VERT   (« Plus tard »)
 * Les clés restent `retard` / `jour` / `proche` / `plus_tard` (la clé `jour` couvre aujourd'hui ET demain) ;
 * l'ancienne règle ci-dessous est gardée pour l'historique.
 *
 * 🔴 LE CODE COULEUR EST ÉCRIT ICI, ET NULLE PART AILLEURS. Tous les écrans (fiche du bien, récapitulatif général,
 * et tout futur endroit) appellent `couleurTache` : deux calculs finiraient par ne plus dire la même chose. Il se
 * calcule sur le JOUR de la tâche comparé à AUJOURD'HUI À PARIS, pour les tâches ni faites ni annulées :
 *   · date passée               → ROUGE  (« En retard »)
 *   · aujourd'hui               → BLANC  (« Aujourd'hui »)
 *   · demain et après-demain    → ORANGE (« Dans 2 jours »)
 *   · dans 3 jours et plus      → VERT   (« Plus tard »)
 * ⚠️ C'EST LE JOUR QUI COMPTE, PAS L'HEURE : un rendez-vous de 9 h vu à 15 h le même jour reste « du jour » —
 * c'est la règle d'Arno (« EN RETARD (date passée) »), et c'est ce qui se lit sans calcul.
 *
 * PUR : aucune base, aucun réseau, aucun écran. Chargeable dans le navigateur.
 */
import { FUSEAU_AFFICHAGE } from './ecran';
import { lireClesContacts } from './contactsTache';
import type { AcceptationTache, InviteTache } from './acceptationTache';
import type { AgendaTache } from './agendaTache';
import type { ContactTache } from './contactsTache';

export type EtatTache = 'a_faire' | 'faite' | 'annulee';
export type CouleurTache = 'retard' | 'jour' | 'proche' | 'plus_tard';

/** L'ordre d'affichage d'Arno : rouge, blanc, orange, vert. */
export const ORDRE_COULEURS: readonly CouleurTache[] = ['retard', 'jour', 'proche', 'plus_tard'];

/** Le mot de chaque couleur : la couleur ne parle jamais seule (daltonisme, impression en noir). */
export const MOT_COULEUR: Record<CouleurTache, string> = {
  retard: 'En retard', jour: 'Aujourd’hui', proche: 'Dans 2 jours', plus_tard: 'Plus tard',
};

/**
 * 🔴 LOT TACHES-LIGNE-CONTACTS — « Prénom NOM » à partir de la forme enregistrée « NOM Prénom » (« ASHISH Sneh » →
 * « Sneh ASHISH »). Les mots tout en capitales du début forment le nom ; s'il ne reste rien (« SCI DU PARC »), ou si le
 * premier mot n'est pas en capitales (« Cabinet Exemple », une adresse e-mail), le nom est rendu tel quel. PUR.
 */
export function prenomNom(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter((m) => m !== '');
  // Un mot « du nom » : sans aucune minuscule (« ASHISH », « JULLIEN », le tiret de « JULLIEN - GARRIDO »).
  const capitales = (m: string) => m === m.toLocaleUpperCase('fr-FR') && !/@/.test(m);
  let i = 0;
  while (i < mots.length && capitales(mots[i])) i += 1;
  if (i === 0 || i === mots.length) return mots.join(' ');
  return [...mots.slice(i), ...mots.slice(0, i)].join(' ');
}

/**
 * 🔴 LOT TACHES-LIGNE-CONTACTS — combien de contacts tiennent dans la place donnée (largeurs mesurées à l'écran), en
 * réservant la place de « … +n » dès qu'il en reste à taire. PUR.
 */
export function contactsQuiTiennent(largeurs: readonly number[], disponible: number, largeurPlus: number, ecart = 8): number {
  if (disponible <= 0) return largeurs.length; // pas encore mis en page : on montre tout
  const total = largeurs.reduce((a, l, k) => a + l + (k > 0 ? ecart : 0), 0);
  if (total <= disponible) return largeurs.length;
  let place = disponible - largeurPlus - ecart;
  let n = 0;
  for (const l of largeurs) {
    const besoin = l + (n > 0 ? ecart : 0);
    if (besoin > place) break;
    place -= besoin;
    n += 1;
  }
  return n;
}

/** 🔴 LOT TACHES-LIGNES-COMPACTES — un compteur : le libellé, puis le nombre entre parenthèses (« plus tard (1) »). PUR. */
export function motCompteur(c: CouleurTache, n: number): string {
  return `${MOT_COMPTEUR[c]} (${n})`;
}

/** 🔴 LOT COULEURS-TACHES — le mot d'UNE tâche : « Demain » pour la couleur `jour` quand c'est demain. PUR. */
export function motCouleurTache(t: { jour: string; etat: EtatTache }, maintenant: Date): string | null {
  const c = couleurTache(t, maintenant);
  if (c === null) return null;
  return c === 'jour' && ecartJours(jourParisDe(maintenant), t.jour) === 1 ? 'Demain' : MOT_COULEUR[c];
}
/** Le mot des compteurs, en tête du récapitulatif. */
export const MOT_COMPTEUR: Record<CouleurTache, string> = {
  retard: 'en retard', jour: 'aujourd’hui / demain', proche: 'dans 2 jours', plus_tard: 'plus tard',
};

/** Les rappels, sous une forme neutre qui ne dépend pas de Google (le lot 2 les traduira). */
export type Rappel =
  /** Rendez-vous : N minutes avant l'heure (1440 = la veille à la même heure). */
  | { sorte: 'avant'; minutes: number }
  /** Repère : le jour même, à l'heure dite. */
  | { sorte: 'jour'; heure: string }
  /** Repère : la veille, à l'heure dite. */
  | { sorte: 'veille'; heure: string };

/** Une tâche telle que les écrans la lisent. */
export interface Tache {
  id: number;
  lotId: number;
  /** Le numéro WIPPIMMO du bien — sert à relire la fiche, jamais affiché dans l'agenda (décision d'Arno). */
  lotCle: string;
  /** « 12 rue des Lilas, Paris » — ce qui se montre sur la ligne. */
  adresseBien: string;
  evenement: { id: number; reference: string; objet: string } | null;
  objet: string;
  note: string | null;
  /** AAAA-MM-JJ, jour civil à Paris. */
  jour: string;
  /** HH:MM, ou `null` pour un repère sur la journée. */
  heure: string | null;
  rappels: Rappel[];
  etat: EtatTache;
  confieeA: number | null;
  confieeALibelle: string;
  creeLe: string;
  creeParLibelle: string;
  majLe: string;
  faiteLe: string | null;
  faiteParLibelle: string | null;
  annuleeLe: string | null;
  annuleeParLibelle: string | null;
  /** 🔴 LOT TACHES-1-BIS — combien de contacts sont copiés dans la tâche (l'indicateur « 👤 2 contacts »). */
  nbContacts: number;
  /** 🔴 LOT TACHES-PIECES-DRIVE — combien de pièces jointes (références Drive) — l'indicateur « 📎 2 ». */
  nbPieces?: number;
  /** 🔴 LOT TACHES-ACCEPTATION — le compte qui a créé la tâche (repli de « Commandées par moi »). */
  creePar?: number | null;
  /** 🔴 LOT TACHES-ACCEPTATION — la demande d'acceptation COURANTE ; `null`/absent ⇒ tâche d'avant le lot. */
  acceptation?: AcceptationTache | null;
  /** 🔴 LOT GESTION-INVITATIONS-TACHES — les invités ACTIFS (le premier = « Confiée à ») ; absent = sans la migration 365. */
  invites?: InviteTache[];
  /** 🔴 LOT GESTION-TACHES-EVENEMENTS — les événements rattachés (actifs) ; absent = sans la migration 366. */
  evenements?: { id: number; reference: string; objet: string; ouvert: boolean }[];
  /** 🔴 LOT TACHES-AGENDA — la durée d'un rendez-vous (minutes) ; `null`/absent = 1 h. */
  dureeMinutes?: number | null;
  /** 🔴 LOT TACHES-AGENDA — la mention « Agenda » (dans l'agenda, à resynchroniser, pas d'agenda Google…) ; `null` = rien. */
  agenda?: AgendaTache | null;
  /** 🔴 LOT FICHE-CARTE-4-BLOCS — la mention « Agenda » de la CARTE, toujours présente (« Pas encore dans l'agenda »…). */
  agendaCarte?: AgendaTache;
  /** 🔴 LOT FICHE-CARTE-TACHE — les contacts copiés et les pièces, rendus seulement pour les tâches D'UN bien (fiche). */
  contacts?: ContactTache[];
  pieces?: PieceTache[];
  /** 🔴 LOT TACHES-LIGNE-CONTACTS — le nom et la famille de chaque contact, pour la 2e ligne repliée (toutes les listes). */
  contactsResume?: { nom: string; famille: ContactTache['famille'] }[];
}

/**
 * 🔴 LOT TACHES-PIECES-DRIVE — UNE PIÈCE JOINTE D'UNE TÂCHE : une RÉFÉRENCE au fichier du Drive, jamais une copie.
 * Elle s'ouvre dans le Drive (nouvel onglet) avec les droits de la personne qui l'ouvre.
 */
export interface PieceTache {
  driveId: string;
  nom: string;
  typeMime: string | null;
  lien: string | null;
  ajouteLe: string;
  ajouteParLibelle: string;
}

/** Ce que le serveur a relu dans le Drive (lecture seule) avant d'enregistrer une référence. */
export interface PieceAjout { driveId: string; nom: string; typeMime: string | null; lien: string | null }

/** L'icône d'un type de fichier — un repère, jamais seul (le nom est toujours écrit). PUR. */
export function iconeType(typeMime: string | null, dossier = false): string {
  const t = (typeMime ?? '').toLowerCase();
  if (dossier || t === 'application/vnd.google-apps.folder') return '📁';
  if (t === 'application/pdf') return '📕';
  if (t.startsWith('image/')) return '🖼️';
  if (t.includes('spreadsheet') || t.includes('excel') || t.includes('csv')) return '📊';
  if (t.includes('document') || t.includes('word') || t.startsWith('text/')) return '📝';
  if (t.includes('presentation') || t.includes('powerpoint')) return '📽️';
  if (t.startsWith('video/')) return '🎞️';
  return '📎';
}

/** Les identifiants Drive envoyés par l'écran, nettoyés ; `undefined` ⇒ « pas de pièces à ajouter ». PUR. */
export function lireIdsDrive(brut: unknown): string[] | undefined {
  if (!Array.isArray(brut)) return undefined;
  return [...new Set(brut.filter((x): x is string => typeof x === 'string').map((x) => x.trim())
    .filter((x) => /^[A-Za-z0-9_-]{5,200}$/.test(x)))].slice(0, 20);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE JOUR, À PARIS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le jour civil à Paris, AAAA-MM-JJ. `en-CA` rend déjà ce format. PUR. */
export function jourParisDe(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_AFFICHAGE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const RE_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HEURE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Un jour AAAA-MM-JJ qui existe vraiment (pas de 31 février). PUR. */
export function estJourValide(j: string): boolean {
  const m = RE_JOUR.exec(j);
  if (m === null) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function estHeureValide(h: string): boolean {
  return RE_HEURE.test(h);
}

/**
 * L'écart en JOURS CIVILS entre deux jours AAAA-MM-JJ. Calculé à midi UTC sur les seules dates : aucun fuseau,
 * aucun changement d'heure ne peut le faire glisser d'une unité. PUR.
 */
export function ecartJours(de: string, a: string): number {
  const t = (j: string) => { const [y, m, d] = j.split('-').map(Number); return Date.UTC(y, m - 1, d, 12); };
  return Math.round((t(a) - t(de)) / 86_400_000);
}

/** Ajoute N jours à un jour AAAA-MM-JJ. PUR. */
export function ajouterJours(j: string, n: number): string {
  const [y, m, d] = j.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n, 12));
  return x.toISOString().slice(0, 10);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA COULEUR, L'ORDRE, LES COMPTEURS — la règle unique
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * 🔴 LOT GESTION-TACHES-PAGE — LA PASTILLE DU RACCOURCI « Tâches » : les tâches prévues AUJOURD'HUI (jour civil de
 * Paris), ni faites ni annulées. Même calcul que la pastille « aujourd'hui » du module (`couleurTache` → `jour`), SANS
 * demain. PUR.
 */
export function compterTachesDuJour(taches: readonly { jour: string; etat: EtatTache }[], maintenant: Date): number {
  const auj = jourParisDe(maintenant);
  return taches.filter((t) => t.etat === 'a_faire' && t.jour === auj).length;
}

/**
 * LA COULEUR D'UNE TÂCHE. `null` pour une tâche faite ou annulée : elle n'est plus « à faire », elle se grise.
 * Voir l'encadré du module. PUR.
 */
export function couleurTache(t: { jour: string; etat: EtatTache }, maintenant: Date): CouleurTache | null {
  if (t.etat !== 'a_faire') return null;
  const ecart = ecartJours(jourParisDe(maintenant), t.jour);
  if (ecart < 0) return 'retard';
  if (ecart <= 1) return 'jour';   // aujourd'hui ET demain : rouge
  if (ecart === 2) return 'proche'; // après-demain : orange
  return 'plus_tard';
}

/**
 * L'ORDRE D'AFFICHAGE : rouge, blanc, orange, vert ; puis par date et heure (le repère de la journée avant les
 * rendez-vous du même jour) ; puis par numéro, pour qu'un même écran ne change jamais d'ordre tout seul. PUR.
 */
export function comparerTaches(a: Tache, b: Tache, maintenant: Date): number {
  const rang = (t: Tache) => {
    const c = couleurTache(t, maintenant);
    return c === null ? ORDRE_COULEURS.length : ORDRE_COULEURS.indexOf(c);
  };
  return (rang(a) - rang(b))
    || a.jour.localeCompare(b.jour)
    || (a.heure ?? '').localeCompare(b.heure ?? '')
    || a.id - b.id;
}

/** Les tâches À FAIRE dans l'ordre d'Arno, et les TERMINÉES (faites ou annulées) à part, la plus récente d'abord. PUR. */
export function repartirTaches(taches: readonly Tache[], maintenant: Date): { ouvertes: Tache[]; terminees: Tache[] } {
  const ouvertes = taches.filter((t) => t.etat === 'a_faire').sort((a, b) => comparerTaches(a, b, maintenant));
  const fin = (t: Tache) => t.faiteLe ?? t.annuleeLe ?? t.majLe;
  const terminees = taches.filter((t) => t.etat !== 'a_faire').sort((a, b) => fin(b).localeCompare(fin(a)) || b.id - a.id);
  return { ouvertes, terminees };
}

/** Les quatre compteurs du récapitulatif. PUR. */
export function compterTaches(taches: readonly Tache[], maintenant: Date): Record<CouleurTache, number> {
  const n: Record<CouleurTache, number> = { retard: 0, jour: 0, proche: 0, plus_tard: 0 };
  for (const t of taches) {
    const c = couleurTache(t, maintenant);
    if (c !== null) n[c] += 1;
  }
  return n;
}

/**
 * ══ 🔴🔴 LOT FICHE-TACHES-EN-ATTENTE (Arno, 13/10/2026) — « TÂCHES EN ATTENTE » D'UN BIEN ══════════════════════════
 * = ni faites ni annulées : en retard, du jour, à venir, Y COMPRIS « En attente d'acceptation » et « Refusée » (une
 * tâche refusée reste à faire : elle est à réattribuer). LA fonction unique : le bouton « + Tâche » ET le bloc
 * « Tâches de ce bien » l'appellent, pour ne jamais afficher deux nombres différents. PUR.
 */
export function compterEnAttenteBien(taches: readonly Pick<Tache, 'etat'>[]): number {
  return taches.filter((t) => t.etat === 'a_faire').length;
}

/** « 1 en attente », « 2 en attente » — dans le bouton. PUR. */
export function motEnAttenteBouton(n: number): string {
  return `${n} en attente`;
}

/** « 1 tâche en attente sur ce bien », « 2 tâches en attente sur ce bien » — la ligne repliée du bloc. PUR. */
export function phraseEnAttenteBien(n: number): string {
  return `${n} tâche${n > 1 ? 's' : ''} en attente sur ce bien`;
}

/**
 * ══ 🔴🔴 LOT PASTILLES-FILTRES (Arno, 14/10/2026) — UNE PASTILLE = UN FILTRE ═════════════════════════════════════════
 * « en retard », « aujourd'hui / demain », « dans 2 jours », « plus tard » (la couleur de la tâche, `couleurTache`) et
 * « en attente de confirmation » (tâche à faire dont la demande attend). Une seule active à la fois ; `null` = toutes.
 * Elle se combine avec les filtres « qui » et « statut » (appliqués avant). Une tâche réalisée ou annulée n'a plus de
 * couleur ni d'attente : elle ne passe aucune pastille. PUR.
 */
export type PastilleFiltre = CouleurTache | 'en_attente';

export function filtrerParPastille<T extends Pick<Tache, 'jour' | 'etat' | 'acceptation'> & { invites?: Tache['invites'] }>(
  taches: readonly T[], pastille: PastilleFiltre | null, maintenant: Date,
): T[] {
  if (pastille === null) return [...taches];
  /* 🔴 LOT GESTION-INVITATIONS-TACHES — en attente : au moins un invité n'a pas encore répondu. */
  if (pastille === 'en_attente') {
    return taches.filter((t) => t.etat === 'a_faire' && (t.invites !== undefined && t.invites.length > 0
      ? t.invites.some((i) => i.statut === 'en_attente') : t.acceptation?.statut === 'en_attente'));
  }
  return taches.filter((t) => couleurTache(t, maintenant) === pastille);
}

/**
 * ══ 🔴🔴 LOT TERMINEES-7-JOURS (Arno, 14/10/2026) — « FAITES OU ANNULÉES » : LES 7 DERNIERS JOURS ═══════════════════════
 * AFFICHAGE SEULEMENT (accord d'Arno pour ce masquage) : une tâche réalisée ou annulée il y a 7 jours civils au plus
 * (heure de Paris) reste dans la section ; au-delà, elle n'y est plus montrée — elle n'est ni supprimée ni modifiée, et
 * son historique est intact. PUR.
 */
export const JOURS_TERMINEES = 7;
export const TITRE_TERMINEES = `Faites ou annulées — ${JOURS_TERMINEES} derniers jours`;

export function termineesRecentes<T extends Pick<Tache, 'etat' | 'faiteLe' | 'annuleeLe'>>(
  taches: readonly T[], maintenant: Date, jours = JOURS_TERMINEES,
): T[] {
  const aujourdhui = jourParisDe(maintenant);
  return taches.filter((t) => {
    const fin = t.etat === 'faite' ? t.faiteLe : t.etat === 'annulee' ? t.annuleeLe : null;
    if (fin === null) return false;
    const d = new Date(fin);
    return !Number.isNaN(d.getTime()) && ecartJours(jourParisDe(d), aujourdhui) <= jours;
  });
}

export type FiltreTaches = 'toutes' | 'miennes';

/** « Les miennes » = celles qui me sont CONFIÉES. Sans compte (voie de secours), aucune n'est à moi. PUR. */
export function filtrerTaches(taches: readonly Tache[], filtre: FiltreTaches, moi: number | null): Tache[] {
  if (filtre === 'toutes') return [...taches];
  if (moi === null) return [];
  return taches.filter((t) => t.confieeA !== null && Number(t.confieeA) === Number(moi));
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ②bis À QUI CONFIER UNE TÂCHE — LA RÈGLE UNIQUE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ══ 🔴🔴 DÉCISION D'ARNO (13/10/2026) ══════════════════════════════════════════════════════════════════════════════
 * « On doit pouvoir confier une tâche à TOUTE personne qui a un compte actif sur notre interface ET une adresse de
 * notre Workspace Google, MÊME si elle n'a pas accès à la tuile Gestion. » L'accès Gestion n'entre PLUS dans la
 * règle de la personne à qui l'on CONFIE ; il reste exigé de celle qui CRÉE, voit ou modifie (garde des routes).
 *
 * 🔴 LES DOMAINES NE SONT PAS ÉCRITS ICI : ils sont passés par l'appelant, qui les lit à la MÊME source que la
 * connexion Google (`gestion_config.domaines_google_autorises`, `lireDomainesAutorises`). Aucun domaine en dur.
 * 🔴 AUCUN DOMAINE CONNU ⇒ PERSONNE : une adresse « de notre Workspace » ne se devine pas (fermé par défaut).
 * ⚠️ La boîte n'est pas vérifiée chez Google ici : ce sera au lot 2 (aucun appel Google dans ce lot).
 *
 * Cette fonction est LA règle : la liste « Confiée à » ET la vérification du serveur l'appellent. PUR.
 */
export function peutRecevoirUneTache(
  compte: { actif: boolean; identifiant: string | null }, domaines: readonly string[],
): boolean {
  if (!compte.actif) return false;
  const adresse = (compte.identifiant ?? '').trim().toLowerCase();
  const at = adresse.lastIndexOf('@');
  if (at <= 0) return false;
  const domaine = adresse.slice(at + 1);
  return domaines.some((d) => d.trim().toLowerCase().replace(/^@/, '') === domaine);
}

/** La mention à côté du nom d'une personne qui n'a pas la tuile Gestion. */
export const MENTION_SANS_ACCES_GESTION = '(sans accès Gestion — verra la tâche dans son agenda)';

/** Une personne de la liste « Confiée à ». */
export interface CollaborateurTache { id: number; libelle: string; accesGestion: boolean }

/**
 * LA LISTE « CONFIÉE À » : les comptes qui remplissent la règle, MOI EN TÊTE, puis l'ordre reçu (alphabétique). PUR.
 */
export function collaborateursPourTache(
  comptes: readonly (CollaborateurTache & { actif: boolean; identifiant: string | null })[],
  domaines: readonly string[], moi: number | null,
): CollaborateurTache[] {
  const retenus = comptes.filter((c) => peutRecevoirUneTache(c, domaines))
    .map((c) => ({ id: Number(c.id), libelle: c.libelle, accesGestion: c.accesGestion }));
  const i = moi === null ? -1 : retenus.findIndex((c) => c.id === Number(moi));
  return i <= 0 ? retenus : [retenus[i], ...retenus.slice(0, i), ...retenus.slice(i + 1)];
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ DÉCALER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export type RaccourciDecalage = '+1j' | '+2j' | '+1s';
export const RACCOURCIS_DECALAGE: readonly { cle: RaccourciDecalage; mot: string; jours: number }[] = [
  { cle: '+1j', mot: '+1 jour', jours: 1 },
  { cle: '+2j', mot: '+2 jours', jours: 2 },
  { cle: '+1s', mot: '+1 semaine', jours: 7 },
];

/**
 * LE NOUVEAU JOUR d'un raccourci. L'heure ne bouge pas.
 *
 * ⚠️ UNE TÂCHE EN RETARD SE DÉCALE À PARTIR D'AUJOURD'HUI : « +1 jour » sur une tâche d'il y a une semaine la
 * mettrait à il y a six jours — toujours en retard, toujours rouge, et le geste n'aurait servi à rien. On part
 * donc du plus tardif des deux : le jour de la tâche, ou aujourd'hui. PUR.
 */
export function jourDecale(jour: string, raccourci: RaccourciDecalage, maintenant: Date): string {
  const r = RACCOURCIS_DECALAGE.find((x) => x.cle === raccourci);
  if (!r) throw new Error(`Raccourci inconnu : ${raccourci}`);
  const aujourdhui = jourParisDe(maintenant);
  const depart = jour < aujourdhui ? aujourdhui : jour;
  return ajouterJours(depart, r.jours);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES RAPPELS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Les rappels par défaut d'Arno : rendez-vous = la veille + 1 h avant ; repère = le jour même à 9 h. PUR. */
export function rappelsParDefaut(avecHeure: boolean): Rappel[] {
  return avecHeure
    ? [{ sorte: 'avant', minutes: 1440 }, { sorte: 'avant', minutes: 60 }]
    : [{ sorte: 'jour', heure: '09:00' }];
}

/** Les choix proposés à l'écran, selon la nature de la tâche. */
export function rappelsProposes(avecHeure: boolean): Rappel[] {
  return avecHeure
    ? [{ sorte: 'avant', minutes: 1440 }, { sorte: 'avant', minutes: 120 }, { sorte: 'avant', minutes: 60 },
      { sorte: 'avant', minutes: 30 }, { sorte: 'avant', minutes: 15 }]
    : [{ sorte: 'veille', heure: '17:00' }, { sorte: 'jour', heure: '09:00' }, { sorte: 'jour', heure: '08:00' }];
}

export function cleRappel(r: Rappel): string {
  return r.sorte === 'avant' ? `avant:${r.minutes}` : `${r.sorte}:${r.heure}`;
}

/** « La veille », « 1 h avant », « Le jour même à 9 h ». PUR. */
export function motRappel(r: Rappel): string {
  if (r.sorte === 'avant') {
    if (r.minutes === 1440) return 'La veille (même heure)';
    if (r.minutes % 60 === 0) return `${r.minutes / 60} h avant`;
    return `${r.minutes} min avant`;
  }
  const h = heureLisible(r.heure);
  return r.sorte === 'jour' ? `Le jour même à ${h}` : `La veille à ${h}`;
}

function heureLisible(h: string): string {
  const [hh, mm] = h.split(':');
  return mm === '00' ? `${Number(hh)} h` : `${Number(hh)} h ${mm}`;
}

/**
 * LES RAPPELS NETTOYÉS : forme vérifiée, sans doublon, et compatibles avec la nature de la tâche — un « 1 h avant »
 * n'a pas de sens sur un repère sans heure. Sert à la route (ce qui vient du navigateur) et au changement de nature
 * de la tâche. PUR.
 */
export function rappelsValides(brut: unknown, avecHeure: boolean): Rappel[] {
  if (!Array.isArray(brut)) return [];
  const vus = new Set<string>();
  const out: Rappel[] = [];
  for (const x of brut as { sorte?: unknown; minutes?: unknown; heure?: unknown }[]) {
    let r: Rappel | null = null;
    if (x?.sorte === 'avant' && avecHeure) {
      const m = Number(x.minutes);
      if (Number.isInteger(m) && m > 0 && m <= 40_320) r = { sorte: 'avant', minutes: m };
    } else if ((x?.sorte === 'jour' || x?.sorte === 'veille') && !avecHeure && typeof x.heure === 'string' && estHeureValide(x.heure)) {
      r = { sorte: x.sorte, heure: x.heure };
    }
    if (r !== null && !vus.has(cleRappel(r))) { vus.add(cleRappel(r)); out.push(r); }
  }
  return out.slice(0, 5);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ LA SAISIE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

export const OBJET_MAX = 300;
export const NOTE_MAX = 5000;

export interface SaisieTache {
  objet: string;
  jour: string;
  heure: string | null;
  note: string | null;
  confieeA: number | null;
  evenementId: number | null;
  rappels: Rappel[];
  /** 🔴 LOT TACHES-1-BIS — les clés des contacts cochés ; `undefined` ⇒ ne pas toucher aux contacts. */
  contacts?: string[];
  /** 🔴 LOT TACHES-PIECES-DRIVE — à la création : les identifiants Drive des pièces choisies. */
  pieces?: string[];
  /** 🔴 LOT TACHES-AGENDA — la durée d'un rendez-vous, en minutes ; `null` = 1 h ; `undefined` = ne pas y toucher. */
  dureeMinutes?: number | null;
  /**
   * 🔴 LOT GESTION-INVITATIONS-TACHES — les AUTRES invités (comptes), en plus de « Confiée à » ; `undefined` = ne pas y
   * toucher (écran d'avant ce lot). Chacun reçoit sa propre invitation.
   */
  invites?: number[];
  /**
   * 🔴 LOT GESTION-TACHES-EVENEMENTS — les événements EN COURS auxquels rattacher la tâche (plusieurs) ; `undefined` = ne
   * pas y toucher. Distinct de `evenementId` (« Événement du bien lié »), qui ne change pas.
   */
  evenements?: number[];
}

/** Les invités d'une saisie, dans l'ordre : « Confiée à » d'abord, puis les autres, sans doublon. PUR. */
export function invitesDeLaSaisie(s: Pick<SaisieTache, 'confieeA' | 'invites'>): number[] {
  const out: number[] = [];
  for (const id of [s.confieeA, ...(s.invites ?? [])]) {
    if (id === null || id === undefined || !Number.isInteger(Number(id)) || Number(id) <= 0) continue;
    if (!out.includes(Number(id))) out.push(Number(id));
  }
  return out;
}

/** Les identifiants d'invités venus du navigateur : entiers positifs, sans doublon, 20 au plus. PUR. */
export function lireIdsInvites(brut: unknown): number[] | undefined {
  if (!Array.isArray(brut)) return undefined;
  const out: number[] = [];
  for (const x of brut) {
    const n = Number(x);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 20);
}

/** 🔴 LOT DECALER-DUREE — « 1 h », « 1 h 30 », « 45 min » ; `null` = 1 h (la durée par défaut). PUR. */
export function dureeLisible(minutes: number | null): string {
  const m = minutes ?? 60;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`;
}

/** 🔴 LOT TACHES-AGENDA — une durée venue du navigateur : un entier entre 5 min et 24 h, sinon `null` (= 1 h). PUR. */
export function dureeValide(brut: unknown): number | null {
  if (brut === null || brut === undefined || brut === '') return null;
  const n = Number(brut);
  return Number.isInteger(n) && n >= 5 && n <= 1440 ? n : null;
}

/**
 * LA SAISIE LUE D'UN CORPS DE REQUÊTE. Ne fait pas confiance aux types venus du navigateur : tout est relu, et les
 * rappels sont nettoyés selon la nature de la tâche. La vérification du fond reste à `erreurSaisie`. PUR.
 */
export function lireSaisie(corps: Record<string, unknown>): SaisieTache {
  const heureBrute = typeof corps.heure === 'string' ? corps.heure.trim() : '';
  const heure = heureBrute === '' ? null : heureBrute;
  const ent = (x: unknown): number | null => {
    const n = Number(x);
    return x === null || x === undefined || x === '' || !Number.isInteger(n) || n <= 0 ? null : n;
  };
  return {
    objet: typeof corps.objet === 'string' ? corps.objet : '',
    jour: typeof corps.jour === 'string' ? corps.jour.trim() : '',
    heure,
    note: typeof corps.note === 'string' ? corps.note : null,
    confieeA: ent(corps.confieeA),
    evenementId: ent(corps.evenementId),
    rappels: rappelsValides(corps.rappels, heure !== null),
    contacts: lireClesContacts(corps.contacts),
    pieces: lireIdsDrive(corps.pieces),
    ...('invites' in corps ? { invites: lireIdsInvites(corps.invites) ?? [] } : {}),
    ...('evenements' in corps ? { evenements: lireIdsInvites(corps.evenements) ?? [] } : {}),
    ...('dureeMinutes' in corps ? { dureeMinutes: heure === null ? null : dureeValide(corps.dureeMinutes) } : {}),
  };
}

/** Les champs de la fenêtre auxquels un refus peut se rattacher (pour l'afficher À CÔTÉ du champ). */
export type ChampTache = 'objet' | 'jour' | 'heure' | 'note' | 'confieeA' | 'evenementId' | 'contacts' | 'pieces' | 'invites' | 'evenements';

/** Un refus : le message en français, et le champ concerné (`null` = la tâche entière). */
export interface RefusSaisie { message: string; champ: ChampTache | null }

/**
 * CE QUI NE VA PAS DANS UNE SAISIE, et SUR QUEL CHAMP. La même fonction pour la fenêtre (avant l'envoi) et pour les
 * routes (au serveur) : les deux disent donc la même chose, au même endroit. `null` si tout est bon. PUR.
 */
export function verifierSaisie(s: Pick<SaisieTache, 'objet' | 'jour' | 'heure' | 'note' | 'confieeA'>): RefusSaisie | null {
  const objet = (s.objet ?? '').trim();
  if (objet === '') return { champ: 'objet', message: 'Indiquez l’objet de la tâche.' };
  if (objet.length > OBJET_MAX) return { champ: 'objet', message: `L’objet dépasse ${OBJET_MAX} caractères.` };
  if (!estJourValide(s.jour ?? '')) return { champ: 'jour', message: 'Indiquez une date valide.' };
  if (s.heure !== null && !estHeureValide(s.heure)) return { champ: 'heure', message: 'L’heure doit s’écrire HH:MM.' };
  if ((s.note ?? '').length > NOTE_MAX) return { champ: 'note', message: `La note dépasse ${NOTE_MAX} caractères.` };
  if (s.confieeA === null || !Number.isInteger(Number(s.confieeA)) || Number(s.confieeA) <= 0) {
    return { champ: 'confieeA', message: 'Choisissez la personne à qui la tâche est confiée.' };
  }
  return null;
}

/** Le message seul — conservé pour les appelants qui n'ont pas de champ à désigner. PUR. */
export function erreurSaisie(s: Pick<SaisieTache, 'objet' | 'jour' | 'heure' | 'note' | 'confieeA'>): string | null {
  return verifierSaisie(s)?.message ?? null;
}

/**
 * ══ 🔴🔴 LE MESSAGE D'UN REFUS DU SERVEUR, POUR LA FENÊTRE D'UNE TÂCHE ═══════════════════════════════════════════
 *
 * Règle d'Arno (13/10/2026) : « un refus, qu'il vienne du formulaire ou du serveur, affiche TOUJOURS un message clair
 * en français […]. Si la session a expiré, le message dit “Session expirée, reconnecte-toi” et non une fausse erreur
 * de données. » Le garde des routes admin rend 401 SANS CORPS pour une session absente ou expirée (`proxy.ts`), et
 * 403 `ACCES_REVOQUE` pour un compte révoqué depuis la connexion : ces deux cas ne sont PAS des erreurs de saisie. PUR.
 */
export const MESSAGE_SESSION_EXPIREE = 'Session expirée, reconnecte-toi.';

export function refusDuServeur(statut: number, corps: { erreur?: unknown; champ?: unknown } | null): RefusSaisie {
  const erreur = typeof corps?.erreur === 'string' ? corps.erreur : '';
  if (statut === 401 || erreur === 'ACCES_REVOQUE') return { champ: null, message: MESSAGE_SESSION_EXPIREE };
  if (statut === 403) return { champ: null, message: 'Vous n’avez pas l’accès Gestion : la tâche n’a pas été enregistrée.' };
  const champs: readonly ChampTache[] = ['objet', 'jour', 'heure', 'note', 'confieeA', 'evenementId', 'contacts', 'pieces', 'invites', 'evenements'];
  const champ = typeof corps?.champ === 'string' && (champs as readonly string[]).includes(corps.champ)
    ? corps.champ as ChampTache : null;
  if (erreur !== '' && erreur !== 'INTERDIT') return { champ, message: erreur };
  return { champ: null, message: `Le serveur a refusé l’enregistrement (erreur ${statut}). Rien n’a été enregistré.` };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ CE QUI S'AFFICHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

/** « mar. 14/10/2026 », « mar. 14/10/2026 à 10:00 ». PUR. */
export function dateLisibleTache(jour: string, heure: string | null): string {
  const m = RE_JOUR.exec(jour);
  if (m === null) return jour;
  const jds = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay();
  const base = `${JOURS_COURTS[jds]} ${m[3]}/${m[2]}/${m[1]}`;
  return heure === null ? base : `${base} à ${heure}`;
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/**
 * ══ 🔴🔴 L'ÉCHÉANCE, TELLE QU'ARNO VEUT LA LIRE (13/10/2026) ══════════════════════════════════════════════════════
 * « mar. 13 oct. · 9 h 30 », ou « mar. 13 oct. · journée » pour un repère. C'est LA date d'une tâche — jamais celle
 * de sa création. L'année n'est écrite que si elle n'est pas celle d'aujourd'hui (« lun. 4 janv. 2027 · journée »).
 * PUR.
 */
export function echeanceLisible(jour: string, heure: string | null, maintenant: Date = new Date()): string {
  const m = RE_JOUR.exec(jour);
  if (m === null) return jour;
  const jds = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).getUTCDay();
  const annee = m[1] === jourParisDe(maintenant).slice(0, 4) ? '' : ` ${m[1]}`;
  const date = `${JOURS_COURTS[jds]} ${Number(m[3])} ${MOIS_COURTS[Number(m[2]) - 1]}${annee}`;
  if (heure === null) return `${date} · journée`;
  const [hh, mm] = heure.split(':');
  return `${date} · ${Number(hh)} h${mm === '00' ? '' : ` ${mm}`}`;
}

/**
 * ══ 🔴🔴 LOT TACHES-LIGNES-COMPACTES (Arno, 13/10/2026) — L'ÉCHÉANCE DANS UNE LIGNE ════════════════════════════════
 * « Aujourd'hui », « Demain », « Dans 2 jours » : PAS de date devant — le libellé seul, et l'heure s'il y en a une
 * (« Aujourd'hui · 9 h 30 »). « Plus tard » et « En retard » (et une tâche terminée) : la date reste
 * (« ven. 16 oct. · 16 h 30 »), pour savoir quand — et de combien elle est en retard. PUR.
 */
export function echeanceCompacte(t: { jour: string; heure: string | null; etat: EtatTache }, maintenant: Date): string {
  const c = couleurTache(t, maintenant);
  if (c === 'jour' || c === 'proche') {
    const mot = motCouleurTache(t, maintenant) ?? '';
    if (t.heure === null) return mot;
    const [hh, mm] = t.heure.split(':');
    return `${mot} · ${Number(hh)} h${mm === '00' ? '' : ` ${mm}`}`;
  }
  return echeanceLisible(t.jour, t.heure, maintenant);
}

/** Un instant, lu à Paris : « 13/10/2026 à 19:20 ». PUR. */
export function horodatageLisible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_AFFICHAGE, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')} à ${v('hour')}:${v('minute')}`;
}

export type ActionTache = 'creation' | 'modification' | 'faite' | 'decalage' | 'annulation' | 'reouverture';

/** Une ligne de la trace, telle que la base la rend. */
export interface TraceTache {
  action: ActionTache;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  survenuLe: string;
  auteurLibelle: string;
}

const MOTS_CHAMPS: Record<string, string> = {
  objet: 'objet', jour: 'date', heure: 'heure', note: 'note', confieeA: 'personne', evenementId: 'événement',
  rappels: 'rappels', dureeMinutes: 'durée', invites: 'invités',
};

/**
 * LA PHRASE D'UNE TRACE, comme Arno l'a écrite : « Faite par X le … », « Décalée par X le … (ancienne date →
 * nouvelle date) », « Annulée par X le … ». PUR.
 */
export function phraseTrace(t: TraceTache): string {
  const qui = `par ${t.auteurLibelle} le ${horodatageLisible(t.survenuLe)}`;
  const date = (x: Record<string, unknown> | null) => dateLisibleTache(String(x?.jour ?? ''), (x?.heure as string | null) ?? null);
  switch (t.action) {
    case 'creation': return `Créée ${qui}`;
    case 'faite': return `Faite ${qui}`;
    case 'annulation': return `Annulée ${qui}`;
    case 'reouverture': return `Rouverte ${qui}`;
    case 'decalage': {
      /* 🔴 LOT DECALER-DUREE — l'ancienne et la nouvelle durée, quand elle a changé. */
      const d = (x: Record<string, unknown> | null) => dureeLisible((x?.dureeMinutes as number | null | undefined) ?? null);
      const duree = t.apres !== null && 'dureeMinutes' in t.apres ? `, durée ${d(t.avant)} → ${d(t.apres)}` : '';
      return `Décalée ${qui} (${date(t.avant)} → ${date(t.apres)}${duree})`;
    }
    case 'modification': {
      /* 🔴 LOT TACHES-1-BIS — un contact ajouté, retiré ou remis à jour a sa propre ligne, et sa propre phrase. */
      const a = t.apres ?? {};
      if (typeof a.contactAjoute === 'string') return `Contact ajouté ${qui} (${a.contactAjoute})`;
      if (typeof a.contactRetire === 'string') return `Contact retiré ${qui} (${a.contactRetire})`;
      if (typeof a.contactMisAJour === 'string') return `Coordonnées mises à jour ${qui} (${a.contactMisAJour})`;
      /* 🔴 LOT TACHES-ACCEPTATION — la demande, la réponse, le mail. */
      if (typeof a.demandeAcceptation === 'string') return `Demande d’acceptation adressée à ${a.demandeAcceptation} ${qui}`;
      if (a.acceptation === 'acceptee') return a.automatique === true ? `Acceptée d’office ${qui}` : `Acceptée ${qui}`;
      if (a.acceptation === 'refusee') return `Refusée ${qui}${typeof a.motif === 'string' ? ` (motif : ${a.motif})` : ''}`;
      /* 🔴 LOT TACHES-PIECES-DRIVE — la pièce ajoutée ou retirée (le fichier du Drive, lui, n'est jamais touché). */
      /* 🔴 LOT GESTION-INVITATIONS-TACHES — les invités : ajouté, retiré, destinataire changé, invitation renvoyée. */
      /* 🔴 LOT GESTION-TACHES-EVENEMENTS — un événement rattaché ou retiré. */
      if (typeof a.evenementRattache === 'string') return `Rattachée à l’événement ${a.evenementRattache} ${qui}`;
      if (typeof a.evenementRetire === 'string') return `Rattachement à l’événement ${a.evenementRetire} retiré ${qui}`;
      if (typeof a.inviteAjoute === 'string') return `Invité ajouté ${qui} (${a.inviteAjoute})`;
      if (typeof a.inviteRetire === 'string') return `Invité retiré ${qui} (${a.inviteRetire})`;
      if (typeof a.destinataireChange === 'string') {
        return `Destinataire changé ${qui} (${typeof t.avant?.destinataire === 'string' ? `${t.avant.destinataire} → ` : ''}${a.destinataireChange})`;
      }
      if (typeof a.invitationRenvoyee === 'string') return `Invitation renvoyée à ${a.invitationRenvoyee} ${qui}`;
      /* 🔴 LOT GESTION-CONFIRMATION-ACCEPTATION — la confirmation à gestion@ et au créateur. */
      if (typeof a.confirmationAcceptation === 'string') {
        const a2 = Array.isArray(a.a) ? (a.a as string[]).join(', ') : '';
        const quand = `le ${horodatageLisible(t.survenuLe)}`;
        const sans = a.sansAdresseCreateur === true ? ' — le créateur n’a pas d’adresse' : '';
        if (a.etat === 'envoye') return `Confirmation d’acceptation envoyée à ${a2} ${quand}${sans}`;
        if (a.etat === 'factice') return `Confirmation d’acceptation préparée pour ${a2} ${quand} (essai, rien n’est parti)${sans}`;
        return `Confirmation d’acceptation non envoyée ${quand}${typeof a.erreur === 'string' ? ` (${a.erreur})` : ''}${sans}`;
      }
      /* 🔴 LOT 3 — le récapitulatif envoyé après une acceptation (ou pourquoi il n'est pas parti). */
      if (typeof a.recapitulatif === 'string') {
        const quand = `le ${horodatageLisible(t.survenuLe)}`;
        if (a.etat === 'envoye') return `Récapitulatif envoyé à ${a.recapitulatif} ${quand}`;
        if (a.etat === 'factice') return `Récapitulatif préparé pour ${a.recapitulatif} ${quand} (essai, rien n’est parti)`;
        return `Récapitulatif non envoyé à ${a.recapitulatif} ${quand}${typeof a.erreur === 'string' ? ` (${a.erreur})` : ''}`;
      }
      if (typeof a.pieceAjoutee === 'string') return `Pièce jointe ajoutée ${qui} (${a.pieceAjoutee})`;
      if (typeof a.pieceRetiree === 'string') return `Pièce jointe retirée ${qui} (${a.pieceRetiree})`;
      const champs = Object.keys(t.apres ?? {}).map((k) => MOTS_CHAMPS[k] ?? k);
      return `Modifiée ${qui}${champs.length > 0 ? ` (${champs.join(', ')})` : ''}`;
    }
  }
}
