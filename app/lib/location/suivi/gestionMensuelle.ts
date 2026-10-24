import { SIGLE_INDICE, libelleTrimestre, type TypeIndice } from '../indicesLoyers';

/**
 * ══ 🔴 Arno (25/10/2026) — LA COMMISSION RÉCURRENTE SUR LA GESTION, MOIS PAR MOIS, BIEN PAR BIEN (moteur PUR) ═══════════════════════════
 *
 * Pour un bien apporté et un mois :
 *   honoraires de gestion HT du mois = Σ des jours en gestion et occupés (loyer du jour × taux d'honoraires HT du mandat) ÷ jours du mois ;
 *   commission (apporteur, collègue) = Σ des MÊMES jours, limités à la fenêtre de la rémunération (signature du dossier d'apport → + N ans,
 *   ou sans fin), × son taux sur la gestion.
 * Le LOYER DU JOUR (décisions d'Arno) :
 *   · le loyer RÉEL révisé connu (ligne « Loyer révisé » du Dossier de location) l'emporte à partir de sa date d'effet (source « réel ») ;
 *   · sinon le loyer d'ENTRÉE du bail (source « entrée »), RÉVISÉ chaque année à la date de révision du bail : loyer HC × (indice du même
 *     trimestre de l'année de révision ÷ indice de référence), arrondi au centime à chaque révision (source « calculé ») — sur le loyer HC
 *     SEUL ; les provisions restent celles de l'entrée (ou du dernier loyer réel) ;
 *   · une révision dont l'indice manque garde le DERNIER loyer connu et le SIGNALE (« indice IRL T2 2027 manquant ») — jamais d'invention ;
 *   · l'assiette des honoraires suit la base du mandat : loyer CC (HC + provisions) ou HC.
 * VACANCE : aucun bail ne couvre le jour → zéro. Un nouveau locataire relance le calcul avec SON loyer, révisé ensuite chaque année.
 * SORTIE DE GESTION : plus rien à partir de sa date. PRORATA AU JOUR partout (entrée, sortie, fin de gestion, fin de durée, révision).
 * Recalculé à la volée (rien n'est figé). Les sommes : chaque mois arrondi au centime UNE fois ; les totaux sont la somme des mois affichés.
 */

export interface LoyerRevise { effetLe: string; loyerHc: number; provisions: number | null }
export interface BailMensuel {
  bailId: number | string;
  entree: string;
  /** Dernier jour d'occupation (inclus) ; null : en cours. */
  sortie: string | null;
  locataire: string;
  /** Le loyer d'entrée (euros) ; null : inconnu — le bail ne compte pas (signalé). */
  loyerHc: number | null;
  provisions: number | null;
  /** L'assiette des honoraires du mandat. */
  base: 'cc' | 'hc';
  /** Le taux d'honoraires de gestion HT du mandat, EN POURCENT (ex. 6,5) ; null : inconnu — le bail ne compte pas (signalé). */
  tauxGestion: number | null;
  /** L'indice du bail (423) ; null : bail sans indice — le loyer ne se révise pas (source « entrée »). */
  indice: { type: TypeIndice; annee: number; trimestre: number } | null;
  /** La date de révision annuelle (la première) ; null : pas de révision. */
  revision: string | null;
  revises: readonly LoyerRevise[];
}
export interface BienMensuel {
  lotId: number;
  libelle: string;
  baux: readonly BailMensuel[];
  /** La sortie de gestion du bien (exclue : rien à partir de ce jour) ; null : toujours en gestion. */
  finGestion: string | null;
}
/** La valeur EN VIGUEUR d'un indice ; null : absent de la table. */
export type LireIndice = (type: TypeIndice, annee: number, trimestre: number) => number | null;
/** Une rémunération récurrente sur la gestion : son taux (fraction, ex. 0,1) et sa fenêtre [début, fin) (fin null : sans fin). */
export interface Fenetre { taux: number; debut: string; fin: string | null }

export type SourceLoyer = 'reel' | 'calcule' | 'entree';
export const LIBELLE_SOURCE_LOYER: Record<SourceLoyer, string> = { reel: 'réel', calcule: 'calculé', entree: 'entrée' };

export interface LigneMois {
  mois: string;
  /** Le locataire (le dernier du mois) ; null : vacant tout le mois. */
  locataire: string | null;
  /** Le loyer du dernier jour occupé du mois (euros) et sa source ; null : vacant. */
  loyerHc: number | null; provisions: number | null; loyerCc: number | null; source: SourceLoyer | null;
  joursOccupes: number; joursDuMois: number;
  /** Honoraires de gestion HT, commission de l'apporteur et du collègue : AU CENTIME (euros). */
  honoraires: number; commission: number; collegue: number;
  /** Les signalements du mois (indice manquant, loyer ou taux inconnu). */
  alertes: string[];
}

// ── Les jours ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const JOUR_MS = 86400000;
const numero = (iso: string): number => { const [a, m, j] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(a, m - 1, j) / JOUR_MS; };
const isoDe = (n: number): string => new Date(n * JOUR_MS).toISOString().slice(0, 10);
const joursDuMois = (mois: string): number => { const [a, m] = mois.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const centimes = (x: number): number => Math.round((x + Number.EPSILON) * 100);
const auCentime = (x: number): number => centimes(x) / 100;

/** La date de révision de l'année k (k = 0 : la première) ; un 29 février tombe le 28 les années non bissextiles. PUR. */
function revisionAn(revision: string, k: number): number {
  const [a, m, j] = revision.slice(0, 10).split('-').map(Number);
  const dernier = new Date(Date.UTC(a + k, m, 0)).getUTCDate();
  return Date.UTC(a + k, m - 1, Math.min(j, dernier)) / JOUR_MS;
}
/** Le nombre de révisions passées au jour `d` (révision de la date incluse). PUR. */
function revisionsAu(revision: string | null, d: number): number {
  if (revision === null) return 0;
  let k = 0;
  while (revisionAn(revision, k) <= d && k < 200) k += 1;
  return k;
}

/** Le loyer d'un bail au jour `d` : HC, provisions, source et signalements. PUR. */
export function loyerDuJour(b: BailMensuel, d: number, indice: LireIndice): { hc: number; provisions: number; source: SourceLoyer; alertes: string[] } | null {
  if (b.loyerHc === null) return null;
  // La base : le dernier loyer RÉEL en vigueur, sinon le loyer d'entrée.
  const reel = [...b.revises].filter((r) => numero(r.effetLe) <= d).sort((x, y) => numero(x.effetLe) - numero(y.effetLe)).pop();
  const baseHc = reel ? reel.loyerHc : b.loyerHc;
  const baseProv = reel ? (reel.provisions ?? b.provisions ?? 0) : (b.provisions ?? 0);
  const k0 = reel ? revisionsAu(b.revision, numero(reel.effetLe)) : 0;
  const k = revisionsAu(b.revision, d);
  const sourceBase: SourceLoyer = reel ? 'reel' : 'entree';
  if (b.indice === null || k <= k0) return { hc: baseHc, provisions: baseProv, source: sourceBase, alertes: [] };
  const { type, annee, trimestre } = b.indice;
  const nom = (y: number): string => `indice ${SIGLE_INDICE[type]} ${libelleTrimestre(y, trimestre)} manquant`;
  const ref = indice(type, annee + k0, trimestre);
  if (ref === null) return { hc: baseHc, provisions: baseProv, source: sourceBase, alertes: [nom(annee + k0)] };
  // Révision après révision (chaque loyer révisé arrondi au centime) ; au premier indice manquant, le dernier loyer connu est gardé.
  let hc = baseHc; let precedent = ref; let applique = false;
  for (let j = k0 + 1; j <= k; j++) {
    const v = indice(type, annee + j, trimestre);
    if (v === null) return { hc, provisions: baseProv, source: applique ? 'calcule' : sourceBase, alertes: [nom(annee + j)] };
    hc = auCentime(hc * v / precedent); precedent = v; applique = true;
  }
  return { hc, provisions: baseProv, source: 'calcule', alertes: [] };
}

/** Le bail qui couvre le jour `d` (le plus récent entré), ou aucun (vacance). PUR. */
function bailDuJour(bien: BienMensuel, d: number): BailMensuel | null {
  let retenu: BailMensuel | null = null;
  for (const b of bien.baux) {
    if (numero(b.entree) > d) continue;
    if (b.sortie !== null && numero(b.sortie) < d) continue;
    if (retenu === null || numero(b.entree) > numero(retenu.entree)) retenu = b;
  }
  return retenu;
}
const dansFenetre = (f: Fenetre | null, d: number): boolean => f !== null && numero(f.debut) <= d && (f.fin === null || d < numero(f.fin));

/** UN MOIS d'un bien : loyer retenu, occupé / vacant, honoraires, commissions (apporteur, collègue), au centime. PUR. */
export function calculerMois(bien: BienMensuel, mois: string, indice: LireIndice, apporteur: Fenetre | null, collegue: Fenetre | null): LigneMois {
  const n = joursDuMois(mois);
  const premier = numero(`${mois}-01`);
  const fin = bien.finGestion === null ? Infinity : numero(bien.finGestion);
  let hono = 0; let comm = 0; let col = 0; let occupes = 0;
  let dernier: { b: BailMensuel; l: NonNullable<ReturnType<typeof loyerDuJour>> } | null = null;
  const alertes = new Set<string>();
  for (let d = premier; d < premier + n; d++) {
    if (d >= fin) break;
    const b = bailDuJour(bien, d);
    if (b === null) continue;
    const l = loyerDuJour(b, d, indice);
    if (l === null) { alertes.add(`loyer d’entrée inconnu (${b.locataire})`); continue; }
    for (const a of l.alertes) alertes.add(a);
    if (b.tauxGestion === null) { alertes.add(`taux d’honoraires de gestion inconnu (${b.locataire})`); continue; }
    occupes += 1;
    dernier = { b, l };
    const assiette = b.base === 'cc' ? l.hc + l.provisions : l.hc;
    const h = assiette * b.tauxGestion / 100 / n;
    hono += h;
    if (dansFenetre(apporteur, d)) comm += h * (apporteur as Fenetre).taux;
    if (dansFenetre(collegue, d)) col += h * (collegue as Fenetre).taux;
  }
  return {
    mois, locataire: dernier?.b.locataire ?? null,
    loyerHc: dernier?.l.hc ?? null, provisions: dernier?.l.provisions ?? null, loyerCc: dernier === null ? null : auCentime(dernier.l.hc + dernier.l.provisions),
    source: dernier?.l.source ?? null, joursOccupes: occupes, joursDuMois: n,
    honoraires: auCentime(hono), commission: auCentime(comm), collegue: auCentime(col), alertes: [...alertes],
  };
}

/** Les mois « AAAA-MM » de `debut` au mois de `jusqua` inclus. PUR. */
export function moisEntre(debut: string, jusqua: string): string[] {
  const sortie: string[] = [];
  let [a, m] = debut.slice(0, 7).split('-').map(Number);
  const fin = jusqua.slice(0, 7);
  for (let mm = debut.slice(0, 7); mm <= fin && sortie.length < 1200; ) {
    sortie.push(mm);
    m += 1; if (m > 12) { m = 1; a += 1; }
    mm = `${a}-${String(m).padStart(2, '0')}`;
  }
  return sortie;
}

/** La fin d'une rémunération de N années comptée depuis la signature (exclue) ; null : indéterminée. PUR. */
export const finDeDuree = (signature: string, annees: number | null): string | null => (annees === null ? null : isoDe(revisionAn(signature, annees)));

/**
 * LE DOSSIER D'APPORT : chaque mois du bien, de la signature au mois en cours. `apporteur` / `collegue` : les rémunérations RÉCURRENTES
 * sur la gestion (null : aucune). PUR.
 */
export function calculerDossier(bien: BienMensuel, signature: string, aujourdhui: string, indice: LireIndice, apporteur: Fenetre | null, collegue: Fenetre | null): LigneMois[] {
  return moisEntre(signature, aujourdhui).map((m) => calculerMois(bien, m, indice, apporteur, collegue));
}

/** Un total, au centime, à partir des mois affichés. PUR. */
export function totalMois(lignes: readonly LigneMois[], cle: 'honoraires' | 'commission' | 'collegue'): number {
  return lignes.reduce((s, l) => s + centimes(l[cle]), 0) / 100;
}

/**
 * Les indices dont une révision passée (jusqu'au jour) a besoin et qui MANQUENT : pour l'onglet « Indices » et le bien concerné. PUR.
 */
export function indicesManquants(baux: readonly (Pick<BailMensuel, 'indice' | 'revision' | 'revises' | 'sortie'> & { libelle: string })[], aujourdhui: string,
  indice: LireIndice): { type: TypeIndice; annee: number; trimestre: number; biens: string[] }[] {
  const manque = new Map<string, { type: TypeIndice; annee: number; trimestre: number; biens: Set<string> }>();
  const jusqua = numero(aujourdhui);
  for (const b of baux) {
    if (b.indice === null || b.revision === null) continue;
    const fin = b.sortie === null ? jusqua : Math.min(jusqua, numero(b.sortie));
    const k = revisionsAu(b.revision, fin);
    for (let j = 0; j <= k; j++) {
      const y = b.indice.annee + j;
      if (indice(b.indice.type, y, b.indice.trimestre) !== null) continue;
      const cle = `${b.indice.type}-${y}-${b.indice.trimestre}`;
      const e = manque.get(cle) ?? { type: b.indice.type, annee: y, trimestre: b.indice.trimestre, biens: new Set<string>() };
      e.biens.add(b.libelle); manque.set(cle, e);
    }
  }
  return [...manque.values()].map((e) => ({ type: e.type, annee: e.annee, trimestre: e.trimestre, biens: [...e.biens].sort() }))
    .sort((x, y) => x.type.localeCompare(y.type) || x.annee - y.annee || x.trimestre - y.trimestre);
}
