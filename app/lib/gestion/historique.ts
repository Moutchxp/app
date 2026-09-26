/**
 * MODULE « GESTION » — LOT RATTACHEMENT-2 : L'HISTORIQUE D'UN LOGEMENT, D'UN PROPRIÉTAIRE, D'UN ÉVÉNEMENT. PUR.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QU'IL RÉPOND : « montre-moi TOUT ce qui s'est dit à propos de ce logement ». C'est la question pour laquelle la
 * trace des adresses (lot DRIVE-2-bis) et les rattachements (lot RATTACHEMENT-1) ont été construits. Mails AVEC et
 * SANS pièce jointe : souvent la décision est dans le mail, et la pièce n'en est que la preuve.
 *
 * 🔴 CE FICHIER EST ATTEINT PAR LE NAVIGATEUR : il est importé par un composant `'use client'`. Il ne doit donc jamais
 * rien importer qui tire `pg` — sans quoi webpack refuse de construire et TOUTE l'application tombe, écran de connexion
 * compris (incident du 24/09/2026). Le garde `clientBoundary.guard.test.ts` le surveille.
 *
 * ⚠️ LECTURE TOLÉRANTE, ÉCRITURE STRICTE, comme `ecranUrl.ts` : une adresse venue d'un signet de six mois ne doit
 * JAMAIS faire écran blanc — une valeur inconnue retombe sur le défaut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import type { Cible, CibleSorte } from './rattachement';

/** Combien de mails par page. La frise se lit, elle ne se déroule pas : 25 suffit, et le reste se charge à la demande. */
export const PAGE_HISTORIQUE = 25;

/** Plafond de sûreté d'une page demandée par l'adresse. Au-delà, on borne — un `taille=100000` n'est pas une demande. */
export const PAGE_HISTORIQUE_MAX = 100;

/** Combien d'interlocuteurs au plus dans le filtre. Au-delà, l'écran DIT qu'il y en a d'autres. */
export const INTERLOCUTEURS_MAX = 60;

// ── LA CIBLE, DANS L'ADRESSE ────────────────────────────────────────────────────────────────────────────────────

/**
 * Comment une cible s'écrit dans l'adresse : `lot-282`, `proprio-339`, `carte-12`. Forme canonique, unique. PUR.
 *
 * ⚠️ LE SÉPARATEUR N'EST PAS UN DÉLIMITEUR DE CLÉ. Une clé WIPPIMMO peut contenir un tiret (les jeux d'épreuve en
 * portent : « J-1 »), donc la lecture coupe au PREMIER tiret et garde tout le reste. Couper au dernier, ou refuser les
 * clés non numériques, casserait silencieusement ces cibles-là.
 */
export function texteCible(c: Cible): string {
  const prefixe = c.sorte === 'lot' ? 'lot' : c.sorte === 'proprietaire' ? 'proprio' : 'carte';
  return `${prefixe}-${c.sorte === 'evenement' ? String(c.id ?? 0) : c.cle ?? ''}`;
}

const PREFIXES: Record<string, CibleSorte> = { lot: 'lot', proprio: 'proprietaire', carte: 'evenement' };

/** La cible portée par une adresse. Valeur inconnue ⇒ `null`, jamais une erreur. PUR. */
export function cibleDepuisTexte(brut: string | null | undefined): Cible | null {
  const s = (brut ?? '').trim();
  const coupe = s.indexOf('-');
  if (coupe <= 0) return null;
  const sorte = PREFIXES[s.slice(0, coupe)];
  if (sorte === undefined) return null;
  const reste = s.slice(coupe + 1).trim();
  if (reste === '' || reste.length > 60) return null;

  if (sorte === 'evenement') {
    if (!/^[1-9]\d{0,15}$/.test(reste)) return null;
    const n = Number(reste);
    return Number.isSafeInteger(n) ? { sorte, cle: null, id: n } : null;
  }
  // Une clé WIPPIMMO : des lettres, des chiffres, et les quelques séparateurs qu'on y rencontre. Rien d'autre —
  //   on refuse plutôt que de laisser passer une chaîne arbitraire jusqu'à une requête.
  if (!/^[A-Za-z0-9_.:+-]+$/.test(reste)) return null;
  return { sorte, cle: reste, id: null };
}

// ── LES FILTRES ─────────────────────────────────────────────────────────────────────────────────────────────────

export type ChoixPieces = 'toutes' | 'avec' | 'sans';

export interface FiltresHistorique {
  /** Adresses cochées. Vide = tous les interlocuteurs. */
  interlocuteurs: string[];
  /** Bornes de période, en `AAAA-MM-JJ`. `null` = pas de borne. */
  du: string | null;
  au: string | null;
  pieces: ChoixPieces;
  /** Recherche dans l'objet ET le texte du mail. Vide = pas de recherche. */
  texte: string;
  /**
   * POUR UN LOGEMENT : inclure aussi les mails rattachés à son PROPRIÉTAIRE. Éteint par défaut — un bailleur écrit
   * souvent pour ses comptes, sans rapport avec ce logement-là, et noyer la frise serait perdre le fil.
   */
  avecProprietaire: boolean;
  /**
   * POUR UN PROPRIÉTAIRE : inclure les mails de SES LOGEMENTS. ALLUMÉ par défaut — « l'historique d'un propriétaire »
   * sans ses logements ne montrerait que ses mails de gestion, c'est-à-dire presque rien de ce qui le concerne.
   */
  avecLogements: boolean;
  /** POUR UN PROPRIÉTAIRE : regrouper la frise par logement, d'un clic. Éteint par défaut : la frise est chronologique. */
  grouper: boolean;
  page: number;
  taille: number;
}

export const FILTRES_VIDES: FiltresHistorique = {
  interlocuteurs: [], du: null, au: null, pieces: 'toutes', texte: '',
  avecProprietaire: false, avecLogements: true, grouper: false,
  page: 0, taille: PAGE_HISTORIQUE,
};

/** Un jour `AAAA-MM-JJ`, ou `null`. On refuse plutôt que de deviner : « 03/07/2024 » n'est pas une date ISO. PUR. */
export function jourValide(brut: string | null | undefined): string | null {
  const s = (brut ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : s;
}

/**
 * Un entier positif ou nul, borné. Valeur absente ou absurde ⇒ le défaut. PUR.
 *
 * ⚠️ LE VIDE EST TRAITÉ AVANT LA CONVERSION, et ce n'est pas une précaution de style : `Number('')` vaut **0**, qui
 * est un entier positif parfaitement valide. Sans ce garde, `?taille=` (paramètre présent mais vide, ce qu'un
 * formulaire produit tout seul) rendrait une taille de zéro au lieu du défaut — et une page de zéro mail.
 */
export function entierBorne(brut: string | null | undefined, defaut: number, max: number): number {
  const s = (brut ?? '').trim();
  if (s === '') return defaut;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return defaut;
  return Math.min(n, max);
}

/**
 * LES FILTRES PORTÉS PAR UNE ADRESSE (ou un corps de requête). Ne jette JAMAIS. PUR.
 *
 * ⚠️ LES INTERLOCUTEURS SONT NORMALISÉS ET DÉDOUBLONNÉS ICI : deux fois la même adresse dans l'adresse de la page ne
 * doit pas doubler les lignes de la frise, et une casse différente désigne la même personne.
 */
export function lireFiltres(p: URLSearchParams): FiltresHistorique {
  const brutPieces = p.get('pieces');
  return {
    interlocuteurs: [...new Set((p.get('avec') ?? '').split(',')
      .map((a) => a.trim().toLowerCase()).filter((a) => a !== ''))].slice(0, INTERLOCUTEURS_MAX),
    du: jourValide(p.get('du')),
    au: jourValide(p.get('au')),
    pieces: brutPieces === 'avec' || brutPieces === 'sans' ? brutPieces : 'toutes',
    texte: (p.get('q') ?? '').trim().slice(0, 200),
    avecProprietaire: p.get('proprio') === '1',
    // ⚠️ ALLUMÉ SAUF SI ON DIT EXPLICITEMENT NON : l'absence du paramètre doit rendre le défaut, qui est « oui ».
    avecLogements: p.get('logements') !== '0',
    grouper: p.get('grouper') === '1',
    page: entierBorne(p.get('page'), 0, 10_000),
    taille: entierBorne(p.get('taille'), PAGE_HISTORIQUE, PAGE_HISTORIQUE_MAX) || PAGE_HISTORIQUE,
  };
}

/** Les filtres, réécrits en paramètres d'adresse. Rend la chaîne VIDE quand rien n'est filtré. PUR. */
export function ecrireFiltres(f: FiltresHistorique): string {
  const p = new URLSearchParams();
  if (f.interlocuteurs.length > 0) p.set('avec', f.interlocuteurs.join(','));
  if (f.du !== null) p.set('du', f.du);
  if (f.au !== null) p.set('au', f.au);
  if (f.pieces !== 'toutes') p.set('pieces', f.pieces);
  if (f.texte.trim() !== '') p.set('q', f.texte.trim());
  if (f.avecProprietaire) p.set('proprio', '1');
  if (!f.avecLogements) p.set('logements', '0');
  if (f.grouper) p.set('grouper', '1');
  if (f.page > 0) p.set('page', String(f.page));
  if (f.taille !== PAGE_HISTORIQUE) p.set('taille', String(f.taille));
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

/** Un filtre est-il actif ? Sert à proposer « tout afficher » seulement quand il y a quelque chose à défaire. PUR. */
export function filtreActif(f: FiltresHistorique): boolean {
  return f.interlocuteurs.length > 0 || f.du !== null || f.au !== null
    || f.pieces !== 'toutes' || f.texte.trim() !== '';
}

// ── CE QUE L'ÉCRAN AFFICHE ──────────────────────────────────────────────────────────────────────────────────────

export interface PieceHistorique {
  pieceId: number;
  nomFichier: string;
  typeMime: string | null;
  tailleOctets: number | null;
  disponible: boolean;
  motifNonStocke: string | null;
}

export interface LigneHistorique {
  messageId: number;
  filId: number;
  recuLe: string;
  sens: 'recu' | 'envoye';
  de: string;
  deNom: string | null;
  /** Les destinataires, tels qu'affichables. Bornés côté dépôt. */
  destinataires: string[];
  objet: string | null;
  extrait: string | null;
  pieces: PieceHistorique[];
  /** Par quelle cible ce mail entre dans l'historique — sert au regroupement par logement. */
  parCible: Cible;
  cibleLibelle: string;
  /**
   * D'OÙ VIENT LA LIGNE. `rattachement` = un lien posé (automatique ou manuel) ; `carte` = l'échange est affecté à
   * cette carte d'événement. Écrit, jamais devinable : les deux axes coexistent et ne disent pas la même chose.
   */
  source: 'rattachement' | 'carte';
}

export interface Interlocuteur {
  adresse: string;
  /** Le nom d'affichage le plus fréquent pour cette adresse, ou `null` si elle n'en a jamais porté. */
  nom: string | null;
  nbMails: number;
  /** Une de NOS adresses ? On les montre — elles font partie de l'échange — mais on les distingue. */
  interne: boolean;
}

export interface EnteteHistorique {
  nbMails: number;
  nbPieces: number;
  premierLe: string | null;
  dernierLe: string | null;
}

/** L'en-tête, dit en une phrase. PUR. */
export function resumeEntete(e: EnteteHistorique): string {
  if (e.nbMails === 0) return 'Aucun échange rattaché pour l’instant.';
  const pieces = e.nbPieces === 0 ? 'aucune pièce jointe'
    : `${e.nbPieces} pièce${e.nbPieces > 1 ? 's' : ''} jointe${e.nbPieces > 1 ? 's' : ''}`;
  return `${e.nbMails} mail${e.nbMails > 1 ? 's' : ''} · ${pieces}`;
}

/**
 * LA FRISE, REGROUPÉE PAR CIBLE. PUR.
 *
 * ⚠️ L'ORDRE DES GROUPES SUIT LE PLUS RÉCENT DE CHACUN, pas l'ordre alphabétique : on cherche « où en est-on », donc
 * ce qui a bougé en dernier doit être en haut. À l'intérieur d'un groupe, l'ordre chronologique inverse est conservé.
 */
export function grouperParCible(lignes: readonly LigneHistorique[]): {
  cible: Cible; libelle: string; lignes: LigneHistorique[];
}[] {
  const groupes = new Map<string, { cible: Cible; libelle: string; lignes: LigneHistorique[] }>();
  for (const l of lignes) {
    const cle = texteCible(l.parCible);
    const g = groupes.get(cle) ?? { cible: l.parCible, libelle: l.cibleLibelle, lignes: [] };
    g.lignes.push(l);
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) => (b.lignes[0]?.recuLe ?? '').localeCompare(a.lignes[0]?.recuLe ?? ''));
}

/** Le libellé d'un interlocuteur : son nom quand il en a un, sinon son adresse. PUR. */
export function libelleInterlocuteur(i: Interlocuteur): string {
  return i.nom !== null && i.nom.trim() !== '' ? i.nom.trim() : i.adresse;
}
