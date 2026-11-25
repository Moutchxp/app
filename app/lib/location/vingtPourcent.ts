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
  /** 🔴 (Arno, 25/11/2026) la clé WIPPIMMO du bien (le bien pré-coché d'« Envoyer un mail ») ; absente : non lue */
  lotCle?: string | null;
  /** 🔴 (Arno, 25/11/2026) pour le mail au syndic (fiche du bien) : les numéros de lot (le bien, puis ses annexes rattachées), le bâtiment, l'étage */
  numLots?: string[]; batiment?: string | null; etage?: string | null;
  locataires: string[];
  logement: string | null;
  dateSortie: string;
  valideLe: string;
  /** `nom` (🔴 25/11/2026) : le nom de la copropriété (fiche), distinct de `libelle` (l'immeuble) ; absent : non lu */
  copropriete: { id: number | null; libelle: string; aRattacher: boolean; nom?: string | null } | null;
  arrete: ArreteComptes | null;
  suivi: SuiviVingt;
  /** 🔴 (24/11/2026) la clé de sa copropriété (ou de son immeuble, ou du bien) — la même que celle de « Dates / copropriétés manquantes » ; absente : déduite */
  cleCopro?: string;
  /** 🔴 (Arno, 24/11/2026, 23h16) l'immeuble par lequel la fiche Copropriété s'ouvre (`null` : par le bien, `lotId`) ; et la dernière AGO tenue */
  immeuble?: string | null;
  derniereAgo?: string | null;
  /** 🔴 (Arno, 24/11/2026, 23h53) les coordonnées réduites au strict minimum (écran interne) ; absentes : non lues */
  contacts?: ContactsSortie;
  /** 🔴 (Arno, 25/11/2026) les mails RÉELLEMENT partis du module « Envoyer un mail » de cette ligne, du plus ancien au plus récent ; absents : aucun */
  mails?: MailVingtEnvoye[];
  /**
   * 🔴🔴 (Arno, 25/11/2026) la CONVERSATION de la ligne : les fils des mails partis de son module (réponses comprises), le nombre de mails échangés
   * (envoyés + reçus) et la date du dernier ; absents : aucun échange.
   */
  echanges?: EchangesVingt;
  /** 🔴 (Arno, 25/11/2026, 22h06) le montant des 20 % retenus (calculé ou saisi) ; `null` : « Montant des 20 % à saisir » ; absent : non lu */
  montantVingt?: MontantVingt | null;
  /** 🔴 (Arno, 25/11/2026, 22h06, mail au partenaire) le syndic EN COURS de la copropriété (nom du cabinet) ; `null` : aucun ; absent : non lu */
  syndic?: string | null;
}
/** Les échanges d'une ligne : ses fils (conversations de la boîte Gestion), le nombre de mails (envoyés + reçus), le dernier (AAAA-MM-JJTHH:MM, Paris). */
export interface EchangesVingt { fils: number[]; nombre: number; dernierLe: string | null }
/** Un mail parti du module d'une ligne : quand (AAAA-MM-JJTHH:MM, Paris), à qui (À), combien en copie, le modèle (`null` : libre), le lien (dès la relève). */
export interface MailVingtEnvoye { le: string; a: string[]; copies: number; modele: string | null; lien: string | null;
  /** 🔴 (25/11/2026) le mail capturé et son fil (dès la relève) ; `null` : pas encore capturé */
  messageId?: number | null; filId?: number | null }
/** Une personne : « Prénom NOM », son premier e-mail, son premier téléphone (affiché « 06 12 34 56 78 », lien « tel: »). */
export interface PersonneContact { nom: string; email: string | null; telephone: { affiche: string; lien: string } | null;
  /** 🔴 (Arno, 25/11/2026) toutes ses adresses encore valables (« Envoyer un mail ») ; absent : la seule `email` */
  emails?: string[];
  /** 🔴 (Arno, 25/11/2026) un propriétaire : « M. Prénom NOM » (civilité de personne seulement), pour le mail au syndic ; absent : `nom` */
  nomCivil?: string;
  /** 🔴 (Arno, 25/11/2026, 22h06, mails de restitution) la civilité de personne (« M. », « Mme »…), le NOM de famille, l'adresse postale de la fiche ;
   *  `null` : non renseignés */
  civilite?: string | null; nomFamille?: string | null; adresse?: string | null }
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
 *   a. « Dates / copropriétés manquantes » — la copropriété n'a pas de dernière AGO et/ou pas de date d'arrêté des comptes, ou le bien n'a pas de copropriété ;
 *      🔴 DÉCISION D'ARNO (24/11/2026, 23h20) : seuls les locataires SANS AUCUNE date calculable y restent ; une date PROVISOIRE calculable
 *      (dernière AGO connue, arrêté manquant) classe le locataire dans sa catégorie réelle (b à e), avec la mention « date provisoire — arrêté des
 *      comptes manquant », et il entre dans l'alerte du lundi s'il est en Urgence ; sa copropriété reste dans « Dates / copropriétés manquantes » et la pastille ;
 *   r. « Alerte restitution en retard » — 🔴 (Arno, 25/11/2026) la date limite (AG + 1 mois) est dépassée, AGO officielle OU projetée ;
 *   b. « Urgence » — 🔴 (Arno, 25/11/2026) du 20e jour (AG + 19 jours) à la date limite incluse (AGO le 01/09 : du 20/09 au 01/10) ;
 *   c. « AGO passée — restitution à faire » — AG ≤ aujourd'hui < AG + 19 jours (AGO le 01/09 : du 01/09 au 19/09) ;
 *   d. « AGO < 1 mois – À préparer » — l'AG a lieu dans les 30 prochains jours (🔴 25/11/2026 : plus le critère « officielle, même lointaine ») ;
 *   e. « AGO > 1 mois – En attente » — tous les autres.
 * a : par copropriété (date de sortie la plus ancienne d'abord) ; b à e : par date limite croissante. Jours comptés à la date de Paris. PUR.
 */
export type CategorieVingt = 'manquantes' | 'retard' | 'urgence' | 'ag_passee' | 'a_preparer' | 'en_attente';
export const ORDRE_CATEGORIES: readonly CategorieVingt[] = ['manquantes', 'retard', 'urgence', 'ag_passee', 'a_preparer', 'en_attente'];
/** Les catégories datées (une ligne par sortie), dans l'ordre de l'écran. */
export const CATEGORIES_DATEES = ['retard', 'urgence', 'ag_passee', 'a_preparer', 'en_attente'] as const;
// 🔴 (Arno, 25/11/2026) « renommer « En attente » en « AGO > 1 mois – En attente » et « À préparer » en « AGO < 1 mois – À préparer » » — titres
//    seulement (🔴 25/11/2026 : depuis, une AGO officielle lointaine va dans « AGO > 1 mois – En attente », voir `categorieVingt`)
// 🔴 (Arno, 25/11/2026) « AGO passée — restitution à faire » : l'ancien titre disait « AG » ; titre seulement, règles inchangées
export const TITRES_CATEGORIES: Record<CategorieVingt, string> = {
  manquantes: 'Dates / copropriétés manquantes', retard: 'Alerte restitution en retard', urgence: 'Urgence', ag_passee: 'AGO passée — restitution à faire', a_preparer: 'AGO < 1 mois – À préparer', en_attente: 'AGO > 1 mois – En attente',
};
/**
 * b / c : 🔴🔴 (Arno, 25/11/2026) « cette catégorie [Urgence] regroupe les locataires dont l'AGO a été dépassée de 20 jours jusqu'à 1 mois après la date de
 * la tenue de l'AGO ; si l'AGO a eu lieu le 1 septembre, le locataire […] passe le 20 septembre dans la catégorie Urgence jusqu'au 1 octobre inclus,
 * puis le 2 octobre il passera dans la catégorie Alerte restitution en retard » : l'Urgence commence le 20e jour, le jour de l'AGO comptant pour le
 * 1er — soit AGO + 19 jours (avant : AGO + 21 jours).
 */
export const JOURS_APRES_AG_URGENCE = 19;
/** d : une AG dans les 30 prochains jours est « à préparer ». */
export const JOURS_AVANT_AG_A_PREPARER = 30;

/** La ligne manque-t-elle de dates (rubrique a) ? PUR. */
export const datesIncompletes = (l: Pick<LigneVingtPourcent, 'suivi' | 'arrete' | 'copropriete'>): boolean =>
  l.suivi.etat !== 'ok' || l.arrete === null || l.copropriete === null;

/**
 * 🔴🔴 Arno (25/11/2026) — « Alerte restitution en retard » : la date limite (AGO + 1 mois) est DÉPASSÉE (le lendemain de la date limite ; la date
 * limite elle-même reste en « Urgence »). « Urgence » : du 20e jour (AGO + 19 jours) à la date limite incluse.
 * 🔴 CHOIX D'ARNO (25/11/2026, second lot) : la règle vaut AUSSI pour une AGO PROJETÉE (ou provisoire) — dépassée, elle va en « Alerte » (avant : elle
 * restait en « Urgence »), en gardant la mention « AGO à confirmer — saisir la date officielle ». Capsules et mail d'alerte suivent. PUR.
 */
export const limiteDepassee = (l: Pick<LigneVingtPourcent, 'suivi'>, aujourdhui: string): boolean =>
  l.suivi.etat === 'ok' && joursEntre(aujourdhui, l.suivi.limite) < 0;
/** 🔴 (Arno, 25/11/2026) la mention orange d'une AGO PROJETÉE dont la date limite est passée (catégorie « Alerte restitution en retard » depuis le second lot du 25/11). */
export const MENTION_AGO_A_CONFIRMER = 'AGO à confirmer — saisir la date officielle';
export const agoAConfirmer = (l: Pick<LigneVingtPourcent, 'suivi'>, aujourdhui: string): boolean =>
  l.suivi.etat === 'ok' && l.suivi.ago.statut === 'projetee' && limiteDepassee(l, aujourdhui);

/** La catégorie d'une ligne à la date `aujourdhui` (AAAA-MM-JJ, Paris). PUR. */
export function categorieVingt(l: Pick<LigneVingtPourcent, 'suivi' | 'arrete' | 'copropriete'>, aujourdhui: string): CategorieVingt {
  // 🔴 (Arno, 24/11/2026, 23h20) « Dates / copropriétés manquantes » : seulement sans AUCUNE date calculable
  if (l.suivi.etat !== 'ok') return 'manquantes';
  // 🔴🔴 (Arno, 25/11/2026) date limite dépassée ⇒ « Alerte », AGO officielle OU projetée (choix d'Arno)
  if (limiteDepassee(l, aujourdhui)) return 'retard';
  const apresAg = joursEntre(l.suivi.ago.date, aujourdhui);
  // AGO le 01/09 : « AGO passée » du 01/09 au 19/09, « Urgence » du 20/09 (AGO + 19 jours) au 01/10 inclus
  if (apresAg >= JOURS_APRES_AG_URGENCE) return 'urgence';
  if (apresAg >= 0) return 'ag_passee';
  // 🔴🔴 (Arno, 25/11/2026) « un locataire dont la prochaine AG est planifiée dans plus de 200 jours se trouve dans la catégorie des AGO qui doivent se
  //    tenir dans moins d'un mois, c'est illogique » : la règle du 24/11 (« date officielle, même lointaine ») est ABANDONNÉE — « À préparer » = l'AGO qui
  //    compte dans les 30 prochains jours, officielle ou projetée ; au-delà, « AGO > 1 mois – En attente », officielle comprise (capsule verte)
  if (-apresAg <= JOURS_AVANT_AG_A_PREPARER) return 'a_preparer';
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
  retard: LigneVingtPourcent[]; urgence: LigneVingtPourcent[]; ag_passee: LigneVingtPourcent[]; a_preparer: LigneVingtPourcent[]; en_attente: LigneVingtPourcent[];
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
  const c: ClassementVingt = { manquantes: [], retard: [], urgence: [], ag_passee: [], a_preparer: [], en_attente: [] };
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
  for (const k of CATEGORIES_DATEES) c[k].sort(parLimite);
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

/**
 * ══ 🔴🔴 Arno (25/11/2026, 22h06) — LE MONTANT DES 20 % RETENUS, DÈS LA SORTIE ═══════════════════════════════════════════════════════════════════════
 * « ajouter le montant des 20 % retenus en le calculant directement depuis les informations saisies en amont si celles-ci ont bien été instruites, sinon
 * laisser la capacité de le rentrer à la main, et faire suivre cette information tout le long du processus. »
 * - CALCULÉ : 20 % du dépôt de garantie des conditions d'entrée du bail (en centimes), arrondi au centime ;
 * - SAISI : entré à la main (dépôt inconnu, ou montant corrigé) ;
 * - ENREGISTRÉ (migration 516) à la validation de la sortie ou depuis la ligne, la dernière saisie fait foi ; à défaut, calculé à la lecture si le
 *   dépôt est connu ; sinon « Montant des 20 % à saisir ».
 */
export interface MontantVingt { montant: number; origine: 'calcule' | 'saisi'; depot: number | null }
export const MONTANT_VINGT_A_SAISIR = 'Montant des 20 % à saisir';
export const MOTIF_MONTANT_VINGT_OBLIGATOIRE = 'Saisissez le montant des 20 % retenus (en euros) : le dépôt de garantie n’est pas connu, ou le montant est vide.';
/** 🔴 (Arno, 25/11/2026, 23h12) les refus du montant des 20 % saisi dans « Valider la sortie » (dits sous le champ). */
export const MOTIF_MONTANT_VINGT_NUL = 'Le montant des 20 % retenus doit être supérieur à 0 €.';
export const MOTIF_MONTANT_VINGT_ILLISIBLE = 'Montant des 20 % illisible : un nombre en euros, deux décimales au plus (ex. 1 200,50).';
/**
 * 🔴🔴 (Arno, 25/11/2026, 23h12) — le montant des 20 % tapé dans « Valider la sortie », LU quelle que soit l'écriture : « 1200 », « 1200,00 »,
 * « 1 200,50 », « 1200.5 », « 1 200 € » ; vide, nul, négatif ou illisible : un refus qui dit lequel. La fenêtre et le serveur appliquent la MÊME règle. PUR.
 */
export function verifierMontantVingt(brut: unknown): { ok: true; montant: number } | { ok: false; motif: string } {
  const t = typeof brut === 'string' ? brut.replace(/[\s  €]/g, '') : brut;
  if (t === undefined || t === null || t === '') return { ok: false, motif: MOTIF_MONTANT_VINGT_OBLIGATOIRE };
  if (typeof t === 'string' && t.startsWith('-')) return { ok: false, motif: MOTIF_MONTANT_VINGT_NUL };
  if (typeof t === 'number' && t <= 0) return { ok: false, motif: MOTIF_MONTANT_VINGT_NUL };
  const m = montantEuros(t);
  if (typeof m !== 'number') return { ok: false, motif: MOTIF_MONTANT_VINGT_ILLISIBLE };
  return m > 0 ? { ok: true, montant: m } : { ok: false, motif: MOTIF_MONTANT_VINGT_NUL };
}
/** Le motif est-il un refus du montant des 20 % (à dire sous le champ) ? PUR. */
export const estMotifMontantVingt = (motif: string | null): boolean =>
  motif === MOTIF_MONTANT_VINGT_OBLIGATOIRE || motif === MOTIF_MONTANT_VINGT_NUL || motif === MOTIF_MONTANT_VINGT_ILLISIBLE;
export const MOTIF_SANS_516 = 'Le montant des 20 % s’enregistre après la mise à jour de la base (migration 516) : rien n’est enregistré.';
/** 20 % d'un dépôt donné en CENTIMES, en euros, arrondi au centime. PUR. */
export const vingtPourcentDuDepot = (depotCentimes: number): number => Math.round(depotCentimes * 0.2) / 100;
/** « 20 % de 2 000,00 € = 400,00 € » (dépôt en centimes). PUR. */
export const calculVingtPourcent = (depotCentimes: number): string => `20 % de ${montantFr(depotCentimes / 100)} = ${montantFr(vingtPourcentDuDepot(depotCentimes))}`;
/** L'origine d'un montant validé : « calcule » s'il est exactement 20 % du dépôt connu, sinon « saisi ». PUR. */
export const origineMontantVingt = (montant: number, depotCentimes: number | null): MontantVingt['origine'] =>
  depotCentimes !== null && Math.round(montant * 100) === Math.round(vingtPourcentDuDepot(depotCentimes) * 100) ? 'calcule' : 'saisi';
/** La mention qui accompagne un montant : « calculé : 20 % de 2 000,00 € » ou « saisi à la main ». PUR. */
export const origineDite = (m: MontantVingt): string =>
  m.origine === 'calcule' && m.depot !== null ? `calculé : 20 % de ${montantFr(m.depot)}` : 'saisi à la main';

/** Une restitution enregistrée (section « Restitutions faites »). */
export interface RestitutionFaite {
  id: number; sortieId: number; locataires: string[]; logement: string | null; dateSortie: string;
  date: string; montantRestitue: number; montantRetenuCharges: number | null; commentaire: string | null; par: string; le: string;
  /** 🔴 (Arno, 25/11/2026, 22h06, 518) le motif de la différence (restitution partielle) ; absent / `null` : aucune */
  motifDifference?: string | null;
  /** 🔴🔴 (Arno, 25/11/2026) « l'historique des mails doit suivre le locataire quelle que soit la catégorie » : les échanges de la SORTIE, jusqu'ici */
  mails?: MailVingtEnvoye[]; echanges?: EchangesVingt;
  /** 🔴 (Arno, 25/11/2026, 22h06) le montant des 20 % retenus ; `null` : à saisir ; absent : non lu */
  montantVingt?: MontantVingt | null;
  /**
   * 🔴🔴 (Arno, 25/11/2026, 22h51) « Restitutions faites » au même format que les autres catégories : la sortie lue comme une ligne (copropriété, AGO qui
   * compte, exercice, dernière AGO, coordonnées), pour le bloc de trois lignes et son détail ; absente : sortie non relue (le bloc se contente du reste).
   */
  ligne?: LigneVingtPourcent;
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

/**
 * 🔴🔴 Arno (25/11/2026) — « lorsque l'on enregistre la validation de restitution, il faut afficher une modale qui indique qu'en confirmant son choix
 * l'utilisateur confirme que la restitution de la somme d'argent est effective, que ce locataire sortira du suivi de restitution et qu'il passera
 * dans l'historique "Restitutions faites" » : le texte de la confirmation (le montant retenu seulement s'il est saisi). PUR.
 */
export const TITRE_CONFIRMER_RESTITUTION = 'Confirmer la restitution';
export function texteConfirmationRestitution(o: { noms: readonly string[]; date: string; montantRestitue: number; montantRetenuCharges: number | null }): string[] {
  const noms = o.noms.length === 0 ? 'ce locataire' : o.noms.length === 1 ? o.noms[0] : `${o.noms.slice(0, -1).join(', ')} et ${o.noms[o.noms.length - 1]}`;
  const plusieurs = o.noms.length > 1;
  const d = `${o.date.slice(8, 10)}/${o.date.slice(5, 7)}/${o.date.slice(0, 4)}`;
  return [
    `En confirmant, vous attestez que la restitution de ${montantFr(o.montantRestitue)} à ${noms} a bien été effectuée le ${d}. ${plusieurs ? 'Ces locataires sortiront' : 'Ce locataire sortira'} du suivi des 20 % et ${plusieurs ? 'passeront' : 'passera'} dans l’historique « ${TITRE_RESTITUTIONS_FAITES} ».`,
    ...(o.montantRetenuCharges !== null ? [`Montant retenu au titre des charges : ${montantFr(o.montantRetenuCharges)}.`] : []),
  ];
}

/**
 * 🔴 Arno (24/11/2026) — la seconde pastille (accueil Location, colonne de gauche) : le nombre de locataires en « Urgence » (0 : aucune pastille).
 * 🔴 (Arno, 25/11/2026) « compter en locataires partout » : des LOCATAIRES (colocataires un par un), le même total que le compteur de la catégorie
 * (avant : des sorties). PUR.
 */
export const nombreUrgences = (lu: Pick<SuiviVingtLu, 'aujourdhui' | 'lignes' | 'manquantes'> | null): number =>
  (lu === null ? 0 : capsulesAgo(classerVingtPourcent(lu).urgence).total);
/** 🔴 Arno (25/11/2026) — la pastille VERTE des boutons : les locataires en « AGO passée » + « AGO < 1 mois – À préparer » (0 : aucune pastille). PUR. */
export const nombreAPreparer = (lu: Pick<SuiviVingtLu, 'aujourdhui' | 'lignes' | 'manquantes'> | null): number => {
  if (lu === null) return 0;
  const c = classerVingtPourcent(lu);
  return capsulesAgo([...c.ag_passee, ...c.a_preparer]).total;
};
/** « 3 restitutions à préparer ou à faire » (le détail de la pastille verte). PUR. */
export const detailAPreparer = (n: number): string => `${n} restitution${n > 1 ? 's' : ''} à préparer ou à faire`;
/** 🔴 Arno (25/11/2026) — les locataires en « Alerte restitution en retard » (colocataires un par un ; 0 : aucun). PUR. */
export const nombreRetards = (lu: Pick<SuiviVingtLu, 'aujourdhui' | 'lignes' | 'manquantes'> | null): number =>
  (lu === null ? 0 : capsulesAgo(classerVingtPourcent(lu).retard).total);

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
 * « Dates / copropriétés manquantes » (son immeuble, ses locataires, ou un de ses locataires concernés trouvé) et « Restitutions faites » comprises. PUR.
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

// ══ 🔴 Arno (25/11/2026) — « FAIRE UNE SEULE CAPSULE ROUGE QUI CUMULE LE NOMBRE D'ALERTES » ══════════════════════════════════════════════════════
/**
 * La pastille unique du bouton « 20 % à restituer » (accueil Location, colonne de gauche de la Gestion) : total = locataires en « Urgence » +
 * copropriétés à compléter (0 : pas de pastille) ; le détail, au survol et pour les lecteurs d'écran : « 2 locataires en urgence · 4 copropriétés à
 * compléter ». 🔴 (Arno, 25/11/2026) + les locataires en « Alerte restitution en retard », et le détail dit les trois nombres. PUR.
 */
export function pastilleVingt(n: { retards?: number; urgences: number; copros: number }): { total: number; detail: string; niveau: NiveauBoutonVingt } {
  const r = n.retards ?? 0; const u = n.urgences; const c = n.copros;
  return {
    total: r + u + c,
    detail: `${r} locataire${r > 1 ? 's' : ''} en retard de restitution · ${u} locataire${u > 1 ? 's' : ''} en urgence · ${c} copropriété${c > 1 ? 's' : ''} à compléter`,
    niveau: niveauBoutonVingt({ retards: r, urgences: u }),
  };
}
/**
 * 🔴🔴 Arno (25/11/2026) — la couleur des boutons de raccourci « 20 % à restituer » (accueil Location, colonne de gauche de la Gestion) : ROUGE si au
 * moins un locataire en « Alerte restitution en retard » ; sinon ORANGE si au moins un en « Urgence » ; sinon la couleur d'origine (`null`). PUR.
 */
export type NiveauBoutonVingt = 'rouge' | 'orange' | null;
export const niveauBoutonVingt = (n: { retards: number; urgences: number }): NiveauBoutonVingt => (n.retards > 0 ? 'rouge' : n.urgences > 0 ? 'orange' : null);

// ══ 🔴 Arno (25/11/2026, 10h14) — « LE BLOC DATES MANQUANTES NE DOIT APPARAÎTRE QUE S'IL CONTIENT DES LOCATAIRES » ═══════════════════════════════
/**
 * Le bloc est montré seulement si au moins un locataire en attente des 20 % s'y trouve : un nom sur une copropriété à compléter, ou une ligne sans
 * date, ou une ligne rattachée à l'une de ces copropriétés. Sur les données filtrées par la recherche, il disparaît quand elle n'y trouve rien. PUR.
 */
export function datesManquantesVisibles(lu: Pick<SuiviVingtLu, 'aujourdhui' | 'lignes' | 'manquantes'>): boolean {
  if (lu.manquantes.some((m) => m.locataires.length > 0)) return true;
  const cles = new Set(lu.manquantes.map((m) => m.cle));
  return lu.lignes.some((l) => categorieVingt(l, lu.aujourdhui) === 'manquantes' || cles.has(cleDeLaLigne(l, lu.manquantes)));
}

// ══ 🔴🔴 Arno (25/11/2026) — LES CAPSULES « AGO OFFICIELLE » / « AGO PROJETÉE » ET LE COMPTEUR DES CATÉGORIES ════════════════════════════════════
/**
 * « pour chaque bloc de catégorie, […] une capsule verte "AGO officielle" avec le nombre de locataires dont le dossier contient une AGO officielle, et
 * la même chose en rouge pour "AGO projetée" ; le cumul des deux doit être égal au chiffre indiqué à droite de l'intitulé ».
 * On compte des LOCATAIRES (une ligne = une sortie, ses colocataires ensemble ; une sortie sans nom compte pour un). Une date PROVISOIRE (arrêté
 * manquant) compte comme projetée, même si l'AG qu'elle retient est officielle. Une ligne sans date (« Dates / copropriétés manquantes ») compte comme projetée :
 * elle n'est jamais dans ces catégories. PUR.
 */
export const locatairesDeLaLigne = (l: Pick<LigneVingtPourcent, 'locataires'>): number => Math.max(1, l.locataires.length);
export const agoOfficielleDuDossier = (l: Pick<LigneVingtPourcent, 'suivi'>): boolean =>
  l.suivi.etat === 'ok' && l.suivi.ago.statut === 'officielle' && !l.suivi.incertaine;
export function capsulesAgo(lignes: readonly Pick<LigneVingtPourcent, 'locataires' | 'suivi'>[]): { officielle: number; projetee: number; total: number } {
  let officielle = 0; let projetee = 0;
  for (const l of lignes) { if (agoOfficielleDuDossier(l)) officielle += locatairesDeLaLigne(l); else projetee += locatairesDeLaLigne(l); }
  return { officielle, projetee, total: officielle + projetee };
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
    ...(datesManquantesVisibles(vu) ? ['manquantes' as const] : []),
    ...CATEGORIES_DATEES.filter((k) => cl[k].length > 0),
    ...((vu.faites ?? []).length > 0 ? ['faites' as const] : []),
  ];
}

/**
 * ══ 🔴🔴 Arno (25/11/2026) — « on doit voir si ce bloc a fait usage de la boîte mail et combien de mails ont été échangés » ════════════════════════════
 * Les échanges d'une ligne : les fils de ses mails partis (dès la relève), le compte de leurs mails (`comptes` : par fil, envoyés + reçus, tels que la
 * conversation les montre) + les mails partis pas encore capturés (ils ne sont encore dans aucun fil) ; le dernier : le plus récent des deux. `null` :
 * aucun échange. PUR.
 */
export function echangesDeLaLigne(mails: readonly MailVingtEnvoye[], comptes: ReadonlyMap<number, { nombre: number; dernierLe: string | null }>): EchangesVingt | null {
  const fils = [...new Set(mails.map((m) => m.filId).filter((f): f is number => typeof f === 'number' && f > 0))].sort((a, b) => a - b);
  const enAttente = mails.filter((m) => m.filId == null);
  const nombre = fils.reduce((n, f) => n + (comptes.get(f)?.nombre ?? 0), 0) + enAttente.length;
  if (nombre === 0) return null;
  const dates = [...fils.map((f) => comptes.get(f)?.dernierLe ?? null), ...enAttente.map((m) => m.le)].filter((d): d is string => d !== null && d !== '');
  return { fils, nombre, dernierLe: dates.length === 0 ? null : dates.reduce((a, b) => (b > a ? b : a)) };
}

/** 🔴 (Arno, 25/11/2026) sous la capsule AGO de la ligne repliée : « 3 mails échangés — dernier le 25/11/2026 » (singulier) ; `null` : aucun. PUR. */
export function mentionMailsEchanges(e: EchangesVingt | null | undefined): string | null {
  if (e == null || e.nombre <= 0) return null;
  const d = e.dernierLe;
  return `${e.nombre} mail${e.nombre > 1 ? 's' : ''} échangé${e.nombre > 1 ? 's' : ''}${d !== null && d.length >= 10 ? ` — dernier le ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : ''}`;
}
