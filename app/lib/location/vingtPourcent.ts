/**
 * ══ 🔴🔴 LE SUIVI DES 20 % RETENUS — LE CALCUL (Arno, 23/11/2026). MODULE PUR. ═══════════════════════════════════════════════════════════════════
 *
 * Pour chaque locataire sorti avec 20 % retenus (date de sortie S, sortie validée dans l'application le jour V) :
 *   a. l'EXERCICE CONCERNÉ est celui qui se clôt au premier arrêté des comptes ≥ S (sortie le jour même de l'arrêté = cet exercice-là) ;
 *   b. l'AGO QUI COMPTE est la première AGO après cet arrêté ;
 *   c. une date PROJETÉE prend le jour et le mois de la dernière AGO connue, transposés à l'année voulue, et n'est JAMAIS antérieure à V
 *      (dernière AGO 22/09/2020, sortie validée le 23/11/2026, arrêté inconnu → 22/09/2027) ;
 *   d. une AGO OFFICIELLE saisie pour une année remplace la projection de cette année, et les années suivantes se recalent sur son jour et son mois ;
 *   e. la restitution / l'ajustement des 20 % se fait au plus tard 1 MOIS après la date de tenue de l'AGO qui compte ; alerte à l'approche
 *      (`JOURS_ALERTE` jours) et une fois dépassée.
 * Arrêté des comptes manquant : la première AGO postérieure à V, « Projection incertaine — date d'arrêté des comptes manquante ».
 * Aucune AGO connue : pas de projection, « Dernière AGO inconnue ».
 * 🔴 Les dates projetées sont CALCULÉES à l'affichage, jamais stockées par locataire : seules les AGO OFFICIELLES (et la dernière AGO connue,
 * officielle) servent ; les dates « projetées » enregistrées à la sortie restent en base mais ne sont pas lues ici (décision d'Arno du 23/11/2026).
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

import type { ArreteComptes } from './arreteComptes';
import type { EntreeAg } from './agCopropriete';
import { ajouterMois } from './preavis';
import { moisAnnee } from './agCopropriete';

export const TITRE_VINGT_POURCENT = '20 % à restituer';
export const JOURS_ALERTE = 30;
export const MENTION_INCERTAINE = 'Projection incertaine — date d’arrêté des comptes manquante';
export const MENTION_SANS_AGO = 'Dernière AGO inconnue';
/** 🔴 (Arno, 24/11/2026, 23h20) la mention orange d'une date PROVISOIRE sur l'écran « 20 % à restituer » (arrêté des comptes manquant). */
// 🔴 (Arno, 24/11/2026, 23h40) le libellé court, sous l'étiquette de l'AG : « date provisoire — arrêté manquant »
export const MENTION_DATE_PROVISOIRE = 'date provisoire — arrêté manquant';

export type AlerteVingt = 'a_venir' | 'proche' | 'depassee';
export interface AgoQuiCompte { date: string; statut: 'officielle' | 'projetee' }
export type SuiviVingt =
  | { etat: 'sans_ago'; exercice: string | null; mention: string }
  | { etat: 'ok'; exercice: string | null; ago: AgoQuiCompte; incertaine: boolean; limite: string; alerte: AlerteVingt; joursRestants: number };

const iso = (a: number, m: number, j: number): string => `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
const annee = (d: string): number => Number(d.slice(0, 4));
const jourEtMois = (d: string): { m: number; j: number } => ({ m: Number(d.slice(5, 7)), j: Number(d.slice(8, 10)) });
const estBissextile = (a: number): boolean => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
/** Le jour et le mois d'une date transposés à une année (un 29/02 devient le 28/02 hors année bissextile). PUR. */
export function transposer(d: string, a: number): string {
  const { m, j } = jourEtMois(d);
  return iso(a, m, m === 2 && j === 29 && !estBissextile(a) ? 28 : j);
}
const joursEntre = (de: string, a: string): number => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

/** Les AGO OFFICIELLES d'un historique (dernière AG tenue et prochaine officielle ; jamais une projetée, jamais une AGE), triées, sans doublon. PUR. */
export function agosOfficielles(entrees: readonly Pick<EntreeAg, 'statut' | 'date' | 'nature'>[]): string[] {
  return [...new Set(entrees.filter((e) => e.statut === 'officielle' && e.date !== null && (e.nature ?? 'ago') === 'ago').map((e) => e.date as string))].sort();
}

/** a. La clôture de l'exercice concerné : le premier arrêté des comptes ≥ la date de sortie. PUR. */
export function clotureExercice(sortie: string, arrete: ArreteComptes): string {
  const cetteAnnee = iso(annee(sortie), arrete.mois, arrete.jour);
  return cetteAnnee >= sortie ? cetteAnnee : iso(annee(sortie) + 1, arrete.mois, arrete.jour);
}

/**
 * b-d. La première AGO strictement après `apres` : l'officielle de l'année si elle existe, sinon la projection de l'année (jour et mois de la
 * dernière officielle des années précédentes — d. le recalage —, à défaut de la plus ancienne connue), jamais une projection antérieure à
 * `pasAvant` (c.). `null` : aucune AGO connue. PUR.
 */
export function agoApres(officielles: readonly string[], apres: string, pasAvant: string): AgoQuiCompte | null {
  if (officielles.length === 0) return null;
  const tri = [...officielles].sort();
  const debut = Math.min(annee(apres), annee(pasAvant));
  const fin = Math.max(annee(apres), annee(pasAvant), annee(tri[tri.length - 1])) + 2;
  for (let a = debut; a <= fin; a++) {
    const deLAnnee = tri.filter((d) => annee(d) === a);
    if (deLAnnee.length > 0) {
      const o = deLAnnee.find((d) => d > apres);
      if (o !== undefined) return { date: o, statut: 'officielle' };
      continue;
    }
    const avant = tri.filter((d) => annee(d) < a);
    const ancre = avant.length > 0 ? avant[avant.length - 1] : tri[0];
    const p = transposer(ancre, a);
    if (p > apres && p >= pasAvant) return { date: p, statut: 'projetee' };
  }
  return null;
}

/** L'alerte de la restitution (e.) : dépassée, proche (≤ `JOURS_ALERTE` jours), à venir. PUR. */
export function alerteRestitution(limite: string, aujourdhui: string): { alerte: AlerteVingt; joursRestants: number } {
  const j = joursEntre(aujourdhui, limite);
  return { alerte: j < 0 ? 'depassee' : j <= JOURS_ALERTE ? 'proche' : 'a_venir', joursRestants: j };
}

/** LE SUIVI D'UN LOCATAIRE SORTI AVEC 20 % RETENUS. PUR. */
export function suiviVingtPourcent(o: {
  dateSortie: string; valideLe: string; arrete: ArreteComptes | null; officielles: readonly string[]; aujourdhui: string;
}): SuiviVingt {
  const cloture = o.arrete === null ? null : clotureExercice(o.dateSortie, o.arrete);
  const exercice = cloture === null ? null : cloture;
  if (o.officielles.length === 0) return { etat: 'sans_ago', exercice, mention: MENTION_SANS_AGO };
  // Arrêté connu : la première AGO après la clôture (une projection jamais avant la validation). Manquant : la première AGO après la validation.
  const ago = cloture !== null ? agoApres(o.officielles, cloture, o.valideLe) : agoApres(o.officielles, o.valideLe, o.valideLe);
  if (ago === null) return { etat: 'sans_ago', exercice, mention: MENTION_SANS_AGO };
  const limite = ajouterMois(ago.date, 1);
  return { etat: 'ok', exercice, ago, incertaine: cloture === null, limite, ...alerteRestitution(limite, o.aujourdhui) };
}

/** « Exercice clos le 31/12/2026 » / « Exercice inconnu (date d'arrêté des comptes manquante) ». PUR. */
export const libelleExercice = (cloture: string | null): string => (cloture === null ? 'Exercice inconnu (date d’arrêté des comptes manquante)'
  : `Exercice clos le ${cloture.slice(8, 10)}/${cloture.slice(5, 7)}/${cloture.slice(0, 4)}`);

/** Le mot de l'alerte, toujours avec la date (jamais la couleur seule). PUR. */
export function libelleAlerte(alerte: AlerteVingt, limite: string, jours: number): string {
  const d = `${limite.slice(8, 10)}/${limite.slice(5, 7)}/${limite.slice(0, 4)}`;
  if (alerte === 'depassee') return `Restitution en retard — la limite du ${d} est dépassée de ${-jours} jour${-jours > 1 ? 's' : ''}`;
  if (alerte === 'proche') return `Restitution à faire bientôt — au plus tard le ${d} (dans ${jours} jour${jours > 1 ? 's' : ''})`;
  return `À restituer au plus tard le ${d}`;
}

/** Une ligne de l'écran « 20 % à restituer » (lue par `lireSuiviVingtPourcent`). */
export interface LigneVingtPourcent {
  sortieId: number;
  lotId: number;
  locataires: string[];
  logement: string | null;
  dateSortie: string;
  valideLe: string;
  copropriete: { id: number | null; libelle: string; aRattacher: boolean } | null;
  arrete: ArreteComptes | null;
  suivi: SuiviVingt;
  /** 🔴 (24/11/2026) la clé de sa copropriété (ou de son immeuble, ou du bien) — la même que celle de « Dates manquantes » ; absente : déduite */
  cleCopro?: string;
  /** 🔴 (Arno, 24/11/2026, 23h16) l'immeuble par lequel la fiche Copropriété s'ouvre (`null` : par le bien, `lotId`) ; et la dernière AGO tenue */
  immeuble?: string | null;
  derniereAgo?: string | null;
  /** 🔴 (Arno, 24/11/2026, 23h53) les coordonnées réduites au strict minimum (écran interne) ; absentes : non lues */
  contacts?: ContactsSortie;
}
/** Une personne : « Prénom NOM », son premier e-mail, son premier téléphone (affiché « 06 12 34 56 78 », lien « tel: »). */
export interface PersonneContact { nom: string; email: string | null; telephone: { affiche: string; lien: string } | null }
export interface ContactsSortie { locataires: PersonneContact[]; proprietaires: PersonneContact[] }
export interface SuiviVingtLu {
  aujourdhui: string; lignes: LigneVingtPourcent[]; manquantes: LigneDatesManquantes[];
  /** 🔴 Arno (24/11/2026) — les restitutions faites (en cours, non annulées) ; absent : base sans la 513 */
  faites?: RestitutionFaite[];
  /** la base porte-t-elle la 513 (« Restitution faite » possible) ? */
  restitutionDisponible?: boolean;
}


// ══ LA RUBRIQUE « DATES MANQUANTES » (règle 5) ════════════════════════════════════════════════════════════════════════════════════════════════════

export type Manque = 'derniere_ago' | 'arrete';
export const LIBELLE_MANQUE: Record<Manque, string> = { derniere_ago: 'dernière AGO', arrete: 'date d’arrêté des comptes' };

/** Une copropriété (ou, sans copropriété, l'immeuble du bien) concernée par au moins un locataire en attente. */
export interface CoproConcernee { cle: string; coproprieteId: number | null; libelle: string; immeuble: string | null; lotId: number }
export interface LigneDatesManquantes { cle: string; coproprieteId: number | null; libelle: string; immeuble: string | null; lotId: number; manque: Manque[]; locataires: string[] }

/**
 * Les copropriétés auxquelles il manque la dernière AGO et/ou la date d'arrêté des comptes, parmi celles d'au moins un locataire en attente :
 * ce qui manque, les locataires concernés (noms). Une copropriété complète n'y figure pas. Triées par nom. PUR.
 */
export function datesManquantes(lignes: readonly { copro: CoproConcernee; arrete: ArreteComptes | null; officielles: readonly string[]; locataires: readonly string[] }[]): LigneDatesManquantes[] {
  const par = new Map<string, LigneDatesManquantes>();
  for (const l of lignes) {
    const manque: Manque[] = [...(l.officielles.length === 0 ? ['derniere_ago' as const] : []), ...(l.arrete === null ? ['arrete' as const] : [])];
    if (manque.length === 0) continue;
    const x = par.get(l.copro.cle) ?? { ...l.copro, manque, locataires: [] };
    x.locataires = [...new Set([...x.locataires, ...l.locataires])];
    par.set(l.copro.cle, x);
  }
  return [...par.values()].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
}

/** Le nombre de copropriétés à compléter : la pastille de l'accueil Location (0 : aucune pastille). PUR. */
export const nombreCoproprietesACompleter = (lu: Pick<SuiviVingtLu, 'manquantes'> | null): number => (lu === null ? 0 : lu.manquantes.length);

// ══ 🔴 Arno (23/11/2026) — L'AGO QUI COMPTE d'une sortie (fenêtre « Valider la sortie » ET serveur : la même pour le locataire et le propriétaire) ══
/** L'AGO QUI COMPTE pour le locataire, telle que la fenêtre la montre et l'envoie. */
export interface AgoQuiCompteEcran { date: string; statut: 'officielle' | 'projetee'; incertaine: boolean; cloture: string | null }
/**
 * 🔴🔴 Arno (23/11/2026) — « l'utilisateur, avant de valider la sortie et l'envoi du mail, doit clairement savoir pour quelle date il prévient son ou ses
 * locataires » : l'AGO QUI COMPTE (calcul b0453dc2 : exercice clos au premier arrêté ≥ date de sortie, puis première AGO après cet arrêté ; arrêté
 * inconnu : après la validation, « incertaine »), et non la simple « Prochaine AGO ». Une prochaine AGO saisie « officielle » compte comme une AGO
 * officielle (elle sera écrite sur la copropriété). `null` : aucune AGO connue. PUR.
 */
export function agoQuiCompte(o: { officielles: readonly string[]; derniere: string; prochaine: string; statut: 'officielle' | 'projetee' | null; dateSortie: string; arrete: ArreteComptes | null; jour: string }): AgoQuiCompteEcran | null {
  const offs = [...new Set([...o.officielles, ...[o.derniere, o.statut === 'officielle' ? o.prochaine : null].filter((d): d is string => d !== null && /^\d{4}-\d{2}-\d{2}$/.test(d))])].sort();
  const r = suiviVingtPourcent({ dateSortie: /^\d{4}-\d{2}-\d{2}$/.test(o.dateSortie) ? o.dateSortie : o.jour, valideLe: o.jour, arrete: o.arrete, officielles: offs, aujourdhui: o.jour });
  return r.etat === 'ok' ? { date: r.ago.date, statut: r.ago.statut, incertaine: r.incertaine, cloture: r.exercice } : null;
}


// ══ 🔴🔴 Arno (24/11/2026) — LES CATÉGORIES DE L'ÉCRAN « 20 % À RESTITUER » ══════════════════════════════════════════════════════════════════════════
/**
 * « classer les locataires sortis avec retenue de 20 % en catégories exclusives (un locataire = une seule catégorie, la plus avancée), chaque catégorie
 * triée de la restitution la plus urgente à la plus lointaine. » L'AG qui compte : celle du calcul b0453dc2 (`suiviVingtPourcent`) ; la date limite :
 * AG + 1 mois. Une ligne = une sortie validée (ses colocataires partagent le même dépôt et les mêmes dates).
 *   a. « Dates manquantes » — la copropriété n'a pas de dernière AGO et/ou pas de date d'arrêté des comptes, ou le bien n'a pas de copropriété ;
 *      🔴 DÉCISION D'ARNO (24/11/2026, 23h20) : seuls les locataires SANS AUCUNE date calculable y restent ; une date PROVISOIRE calculable
 *      (dernière AGO connue, arrêté manquant) classe le locataire dans sa catégorie réelle (b à e), avec la mention « date provisoire — arrêté des
 *      comptes manquant », et il entre dans l'alerte du lundi s'il est en Urgence ; sa copropriété reste dans « Dates manquantes » et la pastille ;
 *   b. « Urgence » — aujourd'hui > AG + 20 jours (date limite dépassée comprise) ;
 *   c. « AG passée — restitution à faire » — AG ≤ aujourd'hui ≤ AG + 20 jours ;
 *   d. « À préparer » — l'AG a lieu dans les 30 prochains jours, OU sa date est officielle (même lointaine) — choix d'Arno « 1 et 3 » ;
 *   e. « En attente » — tous les autres.
 * a : par copropriété (date de sortie la plus ancienne d'abord) ; b à e : par date limite croissante. Jours comptés à la date de Paris. PUR.
 */
export type CategorieVingt = 'manquantes' | 'urgence' | 'ag_passee' | 'a_preparer' | 'en_attente';
export const ORDRE_CATEGORIES: readonly CategorieVingt[] = ['manquantes', 'urgence', 'ag_passee', 'a_preparer', 'en_attente'];
export const TITRES_CATEGORIES: Record<CategorieVingt, string> = {
  manquantes: 'Dates manquantes', urgence: 'Urgence', ag_passee: 'AG passée — restitution à faire', a_preparer: 'À préparer', en_attente: 'En attente',
};
/** b / c : au-delà de AG + 20 jours, l'urgence. */
export const JOURS_APRES_AG_URGENCE = 20;
/** d : une AG dans les 30 prochains jours est « à préparer ». */
export const JOURS_AVANT_AG_A_PREPARER = 30;

/** La ligne manque-t-elle de dates (rubrique a) ? PUR. */
export const datesIncompletes = (l: Pick<LigneVingtPourcent, 'suivi' | 'arrete' | 'copropriete'>): boolean =>
  l.suivi.etat !== 'ok' || l.arrete === null || l.copropriete === null;

/** La catégorie d'une ligne à la date `aujourdhui` (AAAA-MM-JJ, Paris). PUR. */
export function categorieVingt(l: Pick<LigneVingtPourcent, 'suivi' | 'arrete' | 'copropriete'>, aujourdhui: string): CategorieVingt {
  // 🔴 (Arno, 24/11/2026, 23h20) « Dates manquantes » : seulement sans AUCUNE date calculable
  if (l.suivi.etat !== 'ok') return 'manquantes';
  const apresAg = joursEntre(l.suivi.ago.date, aujourdhui);
  if (apresAg > JOURS_APRES_AG_URGENCE) return 'urgence';
  if (apresAg >= 0) return 'ag_passee';
  if (-apresAg <= JOURS_AVANT_AG_A_PREPARER || l.suivi.ago.statut === 'officielle') return 'a_preparer';
  return 'en_attente';
}

/** « Dans 12 jours » / « Aujourd'hui » / « Date limite dépassée de 3 jours » (rouge). PUR. */
export function joursRestantsVingt(joursRestants: number): { texte: string; depasse: boolean } {
  if (joursRestants < 0) return { texte: `Date limite dépassée de ${-joursRestants} jour${-joursRestants > 1 ? 's' : ''}`, depasse: true };
  if (joursRestants === 0) return { texte: 'Aujourd’hui', depasse: false };
  return { texte: `Dans ${joursRestants} jour${joursRestants > 1 ? 's' : ''}`, depasse: false };
}

export interface GroupeManquant { copro: LigneDatesManquantes; lignes: LigneVingtPourcent[] }
export interface ClassementVingt {
  manquantes: GroupeManquant[];
  urgence: LigneVingtPourcent[]; ag_passee: LigneVingtPourcent[]; a_preparer: LigneVingtPourcent[]; en_attente: LigneVingtPourcent[];
}

export const cleDeLaLigne = (l: LigneVingtPourcent, manquantes: readonly LigneDatesManquantes[]): string =>
  l.cleCopro ?? manquantes.find((m) => (l.copropriete?.id != null ? m.coproprieteId === l.copropriete.id : m.coproprieteId === null && m.lotId === l.lotId))?.cle
    ?? (l.copropriete?.id != null ? `copro-${l.copropriete.id}` : `lot-${l.lotId}`);
const parLimite = (a: LigneVingtPourcent, b: LigneVingtPourcent): number => {
  const la = a.suivi.etat === 'ok' ? a.suivi.limite : '9999-12-31'; const lb = b.suivi.etat === 'ok' ? b.suivi.limite : '9999-12-31';
  return la.localeCompare(lb) || a.dateSortie.localeCompare(b.dateSortie) || a.sortieId - b.sortieId;
};
const parSortie = (a: LigneVingtPourcent, b: LigneVingtPourcent): number => a.dateSortie.localeCompare(b.dateSortie) || a.sortieId - b.sortieId;

/** Le classement de tout l'écran : chaque ligne dans UNE catégorie. PUR. */
export function classerVingtPourcent(lu: Pick<SuiviVingtLu, 'aujourdhui' | 'lignes' | 'manquantes'>): ClassementVingt {
  const c: ClassementVingt = { manquantes: [], urgence: [], ag_passee: [], a_preparer: [], en_attente: [] };
  const groupes = new Map<string, GroupeManquant>();
  for (const l of lu.lignes) {
    const cat = categorieVingt(l, lu.aujourdhui);
    if (cat !== 'manquantes') { c[cat].push(l); continue; }
    const cle = cleDeLaLigne(l, lu.manquantes);
    const g = groupes.get(cle) ?? { copro: lu.manquantes.find((m) => m.cle === cle) ?? { cle, coproprieteId: l.copropriete?.id ?? null, libelle: l.copropriete?.libelle ?? l.logement ?? `Bien ${l.lotId}`,
      immeuble: null, lotId: l.lotId, manque: [], locataires: [] }, lignes: [] };
    g.lignes.push(l);
    groupes.set(cle, g);
  }
  for (const g of groupes.values()) g.lignes.sort(parSortie);
  c.manquantes = [...groupes.values()].sort((a, b) => parSortie(a.lignes[0], b.lignes[0]));
  for (const k of ['urgence', 'ag_passee', 'a_preparer', 'en_attente'] as const) c[k].sort(parLimite);
  return c;
}

// ══ 🔴🔴 Arno (24/11/2026) — « RESTITUTION FAITE » ══════════════════════════════════════════════════════════════════════════════════════════════
/**
 * « Bouton « Restitution faite » sur chaque ligne : fenêtre avec date de restitution, montant restitué, montant retenu au titre des charges
 * (facultatif), commentaire ; enregistrement journalisé dans le dossier du locataire (rien n'est supprimé) ; le locataire quitte la liste et ne
 * déclenche plus d'alerte. Une section repliée « Restitutions faites (N) » […] avec « Annuler » (journalisé) en cas d'erreur. »
 */
export const TITRE_RESTITUTIONS_FAITES = 'Restitutions faites';
export const COMMENTAIRE_RESTITUTION_MAX = 2000;
export const MONTANT_MAX = 10_000_000;
export const MOTIF_SANS_513 = 'La restitution des 20 % s’enregistre après la mise à jour de la base (migration 513) : rien n’est enregistré.';

/** Une restitution enregistrée (section « Restitutions faites »). */
export interface RestitutionFaite {
  id: number; sortieId: number; locataires: string[]; logement: string | null; dateSortie: string;
  date: string; montantRestitue: number; montantRetenuCharges: number | null; commentaire: string | null; par: string; le: string;
}

/** « 1 234,56 », « 1234.5 », 300 → un montant en euros (2 décimales au plus, ≥ 0) ; vide : `undefined` ; illisible : `null`. PUR. */
export function montantEuros(x: unknown): number | null | undefined {
  if (typeof x === 'number') return Number.isFinite(x) && x >= 0 && x <= MONTANT_MAX && Math.round(x * 100) === x * 100 ? x : null;
  if (typeof x !== 'string') return x === null || x === undefined ? undefined : null;
  const t = x.replace(/[\s  €]/g, '').replace(',', '.');
  if (t === '') return undefined;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n <= MONTANT_MAX ? n : null;
}

/** « 1 234,56 € ». PUR. */
export const montantFr = (n: number): string => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`.replace(/ /g, ' ');

/** La saisie de la fenêtre « Restitution faite », vérifiée : date entre la sortie et aujourd'hui, montant restitué obligatoire. PUR. */
export function verifierRestitution(d: { date: unknown; montantRestitue: unknown; montantRetenuCharges?: unknown; commentaire?: unknown }, o: { dateSortie: string; aujourdhui: string }):
  | { ok: true; valeur: { date: string; montantRestitue: number; montantRetenuCharges: number | null; commentaire: string | null } }
  | { ok: false; motif: string; champ: 'date' | 'montantRestitue' | 'montantRetenuCharges' | 'commentaire' } {
  const date = typeof d.date === 'string' ? d.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) {
    return { ok: false, motif: 'Indiquez la date de restitution.', champ: 'date' };
  }
  if (date < o.dateSortie) return { ok: false, motif: `La restitution ne peut pas précéder la sortie (${o.dateSortie.slice(8, 10)}/${o.dateSortie.slice(5, 7)}/${o.dateSortie.slice(0, 4)}).`, champ: 'date' };
  if (date > o.aujourdhui) return { ok: false, motif: 'La date de restitution ne peut pas être dans le futur.', champ: 'date' };
  const restitue = montantEuros(d.montantRestitue);
  if (restitue === undefined) return { ok: false, motif: 'Indiquez le montant restitué (0 s’il n’y a rien à rendre).', champ: 'montantRestitue' };
  if (restitue === null) return { ok: false, motif: 'Montant restitué illisible : un nombre en euros, deux décimales au plus (ex. 312,50).', champ: 'montantRestitue' };
  const retenu = montantEuros(d.montantRetenuCharges);
  if (retenu === null) return { ok: false, motif: 'Montant retenu au titre des charges illisible : un nombre en euros, deux décimales au plus.', champ: 'montantRetenuCharges' };
  const commentaire = typeof d.commentaire === 'string' && d.commentaire.trim() !== '' ? d.commentaire.trim() : null;
  if (commentaire !== null && commentaire.length > COMMENTAIRE_RESTITUTION_MAX) return { ok: false, motif: `Le commentaire dépasse ${COMMENTAIRE_RESTITUTION_MAX} caractères.`, champ: 'commentaire' };
  return { ok: true, valeur: { date, montantRestitue: restitue, montantRetenuCharges: retenu ?? null, commentaire } };
}

/** 🔴 Arno (24/11/2026) — la seconde pastille (accueil Location, colonne de gauche) : le nombre de locataires en « Urgence » (0 : aucune pastille). PUR. */
export const nombreUrgences = (lu: Pick<SuiviVingtLu, 'aujourdhui' | 'lignes' | 'manquantes'> | null): number => (lu === null ? 0 : classerVingtPourcent(lu).urgence.length);

// ══ 🔴🔴 Arno (24/11/2026, 23h40) — LA LIGNE REPLIÉE SUR TROIS LIGNES : l'étiquette de l'AG et le compte à rebours ════════════════════════════════════
/** L'étiquette colorée de l'AG qui compte : ROUGE « AGO vers mars 2027 (projetée) », VERTE « AGO 15/03/2027 (officielle) ». PUR. */
export function etiquetteAgo(ago: AgoQuiCompte): { texte: string; ton: 'rouge' | 'vert' } {
  return ago.statut === 'officielle'
    ? { texte: `AGO ${ago.date.slice(8, 10)}/${ago.date.slice(5, 7)}/${ago.date.slice(0, 4)} (officielle)`, ton: 'vert' }
    : { texte: `AGO vers ${moisAnnee(ago.date)} (projetée)`, ton: 'rouge' };
}
/**
 * Le compte à rebours de la 3e ligne : avant l'AG « AG dans 40 jours » (gris) ; à partir du jour de l'AG « J-12 » (jours restants jusqu'à la date
 * limite) ; après la date limite « Dépassé de 5 jours » (rouge). PUR.
 */
export function compteAReboursVingt(s: { ago: { date: string }; limite: string; joursRestants: number }): { texte: string; ton: 'gris' | 'normal' | 'rouge' } {
  const avantAg = s.joursRestants - joursEntre(s.ago.date, s.limite);
  const pl = (n: number): string => `${n} jour${n > 1 ? 's' : ''}`;
  if (avantAg > 0) return { texte: `AG dans ${pl(avantAg)}`, ton: 'gris' };
  if (s.joursRestants < 0) return { texte: `Dépassé de ${pl(-s.joursRestants)}`, ton: 'rouge' };
  return { texte: `J-${s.joursRestants}`, ton: 'normal' };
}

// ══ 🔴🔴 Arno (24/11/2026, 23h53) — LA RECHERCHE ═════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * « Au-dessus du listing et sous le titre de la page, un champ de saisie de recherche qui trouve un bloc par nom du locataire, adresse du logement ou
 * nom du propriétaire » : sans accents ni majuscules, mots partiels (chaque mot tapé doit se trouver quelque part) ; sur toutes les catégories,
 * « Dates manquantes » (son immeuble, ses locataires, ou un de ses locataires concernés trouvé) et « Restitutions faites » comprises. PUR.
 */
export const PLACEHOLDER_RECHERCHE_VINGT = 'Rechercher un locataire, une adresse ou un propriétaire';
const pourRecherche = (x: string): string => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function correspondRecherche(textes: readonly (string | null | undefined)[], q: string): boolean {
  const mots = pourRecherche(q).split(/\s+/).filter((m) => m !== '');
  if (mots.length === 0) return true;
  const botte = pourRecherche(textes.filter((t): t is string => typeof t === 'string').join(' '));
  return mots.every((m) => botte.includes(m));
}
export const rechercheActive = (q: string): boolean => q.trim() !== '';
export function filtrerVingtPourcent(lu: SuiviVingtLu, q: string): SuiviVingtLu {
  if (!rechercheActive(q)) return lu;
  const lignes = lu.lignes.filter((l) => correspondRecherche([...l.locataires, l.logement, ...(l.contacts?.locataires ?? []).map((p) => p.nom),
    ...(l.contacts?.proprietaires ?? []).map((p) => p.nom)], q));
  const manquantes = lu.manquantes.filter((m) => correspondRecherche([m.libelle, ...m.locataires], q)
    || lignes.some((l) => cleDeLaLigne(l, lu.manquantes) === m.cle));
  return { ...lu, lignes, manquantes, ...(lu.faites !== undefined ? { faites: lu.faites.filter((f) => correspondRecherche([...f.locataires, f.logement], q)) } : {}) };
}

// ══ 🔴🔴 Arno (25/11/2026) — « PAR DÉFAUT TOUTES LES LIGNES DE CHAQUE CATÉGORIE SONT FERMÉES » ═══════════════════════════════════════════════════════
/** Les blocs repliables qui suivent la recherche : les cinq catégories et « Restitutions faites ». */
export type BlocRepliableVingt = CategorieVingt | 'faites';
/**
 * À l'ouverture de la page, tout est replié ; une recherche tapée ouvre les blocs qui ont des résultats ; effacée, tout se replie (`[]`). PUR.
 */
export function blocsOuvertsPourRecherche(lu: SuiviVingtLu, q: string): BlocRepliableVingt[] {
  if (!rechercheActive(q)) return [];
  const vu = filtrerVingtPourcent(lu, q);
  const cl = classerVingtPourcent(vu);
  return [
    ...(vu.manquantes.length > 0 ? ['manquantes' as const] : []),
    ...(['urgence', 'ag_passee', 'a_preparer', 'en_attente'] as const).filter((k) => cl[k].length > 0),
    ...((vu.faites ?? []).length > 0 ? ['faites' as const] : []),
  ];
}
