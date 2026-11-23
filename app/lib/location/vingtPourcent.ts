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

export const TITRE_VINGT_POURCENT = '20 % à restituer';
export const JOURS_ALERTE = 30;
export const MENTION_INCERTAINE = 'Projection incertaine — date d’arrêté des comptes manquante';
export const MENTION_SANS_AGO = 'Dernière AGO inconnue';

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
}
export interface SuiviVingtLu { aujourdhui: string; lignes: LigneVingtPourcent[]; manquantes: LigneDatesManquantes[] }


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
