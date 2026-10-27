/**
 * ══ 🔴 TUILE « TRANSACTION » (Arno, 27/10/2026) — LE MODÈLE ET LES CALCULS (PURS) ═══════════════════════════════════════════════
 *
 * Le chiffre d'affaires de la VENTE de CRITERIMMO et de MACJ, et le CA global (vente + location + gestion).
 *   · Une vente porte ses honoraires TTC (comme les fichiers d'Arno) ; le HT en découle : TTC ÷ 1,2 — SANS ARRONDI (seul l'affichage
 *     arrondit au centime).
 *   · Le mois du CA = le mois de l'acte. Une vente sans mois est « mois à confirmer » : elle compte dans son ANNÉE, dans aucun mois.
 *   · Un compromis en cours n'est pas du CA : il fait le PRÉVISIONNEL de son année.
 *   · Les rétrocessions d'apporteurs se saisissent PAR MOIS (comme dans les fichiers) ; rattachées à une vente, ou « à répartir ».
 *   · Les montants mensuels saisis en dur sans vente (« à rattacher ») se MONTRENT, ils ne s'ajoutent jamais au CA.
 *   · Reste à l'agence = honoraires − rétrocessions − paye des négociateurs (TTC, puis ÷ 1,2 pour le HT).
 * Rien ici ne lit la base : les écrans et la route appellent ces fonctions sur les lignes lues.
 */

export type Societe = 'criterimmo' | 'macj';
export const SOCIETES: readonly Societe[] = ['criterimmo', 'macj'];
export const LIBELLE_SOCIETE: Record<Societe, string> = { criterimmo: 'CRITERIMMO', macj: 'MACJ' };
export const estSociete = (x: unknown): x is Societe => x === 'criterimmo' || x === 'macj';

/** Le coefficient TTC → HT des fichiers (« /1.2 »). */
export const TVA = 1.2;
export const ht = (ttc: number): number => ttc / TVA;

export type StatutVente = 'compromis' | 'vendue' | 'annulee';
export const STATUTS: readonly StatutVente[] = ['compromis', 'vendue', 'annulee'];
export const LIBELLE_STATUT: Record<StatutVente, string> = { compromis: 'Compromis en cours', vendue: 'Vendue', annulee: 'Annulée' };

/** Le rôle d'une ligne : paye du négociateur (MACJ), part des honoraires (onglets en parts), vente portée par l'onglet (CRITERIMMO). */
export type RoleLigne = 'negociateur' | 'part' | 'vendeur';
export const LIBELLE_ROLE: Record<RoleLigne, string> = { negociateur: 'paye du négociateur', part: 'part des honoraires', vendeur: 'vente de l’onglet' };

export interface LigneVente {
  id: number;
  negociateur: string;
  role: RoleLigne;
  montantTtc: number | null;
  nature: 'vente' | 'compromis';
  /** La ligne compte-t-elle dans les honoraires de la vente (une part comptée par le fichier) ? */
  compte: boolean;
  origine: 'saisie' | 'import';
  sourceFichier: string | null;
  sourceOnglet: string | null;
  sourceLigne: number | null;
  note: string | null;
}

export interface Vente {
  id: number;
  societe: Societe;
  libelle: string;
  honorairesTtc: number;
  statut: StatutVente;
  annee: number;
  /** Le mois de l'acte (1 → 12) ; null : « mois à confirmer » (vendue) ou sans objet (compromis). */
  mois: number | null;
  dateCompromis: string | null;
  apporteur: string | null;
  note: string | null;
  origine: 'saisie' | 'import';
  sourceFichier: string | null;
  sourceOnglet: string | null;
  sourceLigne: number | null;
  lignes: LigneVente[];
}

export interface Retrocession {
  id: number;
  societe: Societe;
  annee: number;
  mois: number;
  negociateur: string;
  montantTtc: number;
  apporteur: string | null;
  /** null : « à répartir ». */
  venteId: number | null;
  libelle: string | null;
  origine: 'saisie' | 'import';
  sourceOnglet: string | null;
  sourceCellule: string | null;
}

export interface CaARattacher {
  id: number;
  societe: Societe;
  annee: number;
  mois: number;
  negociateur: string;
  montantTtc: number;
  libelle: string | null;
  sourceOnglet: string | null;
  sourceCellule: string | null;
}

export interface GestionMois {
  id: number;
  annee: number;
  mois: number;
  nbLots: number | null;
  honorairesHt: number | null;
  adhocHt: number | null;
  salarieHt: number | null;
  resteHt: number | null;
  note: string | null;
  origine: 'saisie' | 'import';
}

/** Les données d'une société, telles que la route les envoie. */
export interface DonneesSociete {
  disponible: boolean;
  societe: Societe;
  aujourdhui: string;
  ventes: Vente[];
  retrocessions: Retrocession[];
  aRattacher: CaARattacher[];
}

export const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const NON_ATTRIBUE = 'Non attribué';
export const APPORTEUR_NON_NOMME = 'Apporteur non nommé';

// ── Une vente ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const estVendue = (v: Pick<Vente, 'statut'>): boolean => v.statut === 'vendue';
export const estCompromis = (v: Pick<Vente, 'statut'>): boolean => v.statut === 'compromis';
export const moisAConfirmer = (v: Pick<Vente, 'statut' | 'mois'>): boolean => v.statut === 'vendue' && v.mois === null;

/** Les négociateurs d'une vente (ordre de leurs lignes, sans doublon) ; « Non attribué » sans ligne. */
export function negociateursDe(v: Pick<Vente, 'lignes'>): string[] {
  const n = [...new Set(v.lignes.map((l) => l.negociateur))];
  return n.length === 0 ? [NON_ATTRIBUE] : n;
}

/** La paye des négociateurs (TTC) : les lignes « paye du négociateur ». */
export const payeTtcDe = (v: Pick<Vente, 'lignes'>): number =>
  v.lignes.reduce((s, l) => s + (l.role === 'negociateur' && l.montantTtc !== null ? l.montantTtc : 0), 0);

/** Les rétrocessions rattachées à cette vente (TTC). */
export const retroTtcDe = (v: Pick<Vente, 'id'>, retros: readonly Retrocession[]): number =>
  retros.reduce((s, r) => s + (r.venteId === v.id ? r.montantTtc : 0), 0);

/** Le reste à l'agence d'une vente (TTC) : honoraires − rétrocessions rattachées − paye des négociateurs. */
export const resteTtcDe = (v: Vente, retros: readonly Retrocession[]): number => v.honorairesTtc - retroTtcDe(v, retros) - payeTtcDe(v);

/**
 * Le CA HT qu'un négociateur PORTE dans une vente : sa part quand la vente est en parts ; sinon les honoraires, partagés à égalité
 * entre les lignes qui comptent (la somme sur les négociateurs redonne les honoraires de la vente). 0 s'il n'y est pas.
 */
export function caHtPortePar(v: Vente, negociateur: string): number {
  const comptees = v.lignes.filter((l) => l.compte);
  if (comptees.length === 0) return negociateur === NON_ATTRIBUE ? ht(v.honorairesTtc) : 0;
  const parts = comptees.filter((l) => l.role === 'part');
  if (parts.length > 0) {
    const sesParts = parts.filter((l) => l.negociateur === negociateur).reduce((s, l) => s + (l.montantTtc ?? 0), 0);
    // Une vente en parts dont les parts ne font pas les honoraires (saisie) : le reste revient à « Non attribué ».
    const reste = v.honorairesTtc - parts.reduce((s, l) => s + (l.montantTtc ?? 0), 0);
    return ht(sesParts + (negociateur === NON_ATTRIBUE ? reste : 0));
  }
  const siennes = comptees.filter((l) => l.negociateur === negociateur).length;
  return ht((v.honorairesTtc * siennes) / comptees.length);
}

// ── Les totaux ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Totaux {
  nbVentes: number;
  caHt: number;
  caTtc: number;
  retroHt: number;
  payeHt: number;
  /** CA HT − rétrocessions HT − paye HT. */
  resteHt: number;
  ids: number[];
}
const VIDE: Totaux = { nbVentes: 0, caHt: 0, caTtc: 0, retroHt: 0, payeHt: 0, resteHt: 0, ids: [] };

/** Les ventes VENDUES d'un mois (année + mois de l'acte). */
export const ventesDuMois = (ventes: readonly Vente[], annee: number, mois: number): Vente[] =>
  ventes.filter((v) => estVendue(v) && v.annee === annee && v.mois === mois);
/** Les ventes VENDUES d'une année (mois à confirmer compris). */
export const ventesDeLAnnee = (ventes: readonly Vente[], annee: number): Vente[] => ventes.filter((v) => estVendue(v) && v.annee === annee);
/** Les compromis en cours rattachés à une année (le prévisionnel de l'année). */
export const compromisDeLAnnee = (ventes: readonly Vente[], annee: number): Vente[] => ventes.filter((v) => estCompromis(v) && v.annee === annee);
/** Les rétrocessions saisies sur un mois (rattachées ou à répartir). */
export const retrosDuMois = (retros: readonly Retrocession[], annee: number, mois: number): Retrocession[] =>
  retros.filter((r) => r.annee === annee && r.mois === mois);

/**
 * Les totaux d'un ensemble de ventes ; `retros` : les rétrocessions de la MÊME période (saisies par mois : elles comptent sur leur
 * mois, rattachées ou non). PUR.
 */
export function totaux(ventes: readonly Vente[], retros: readonly Retrocession[]): Totaux {
  if (ventes.length === 0 && retros.length === 0) return { ...VIDE, ids: [] };
  const caTtc = ventes.reduce((s, v) => s + v.honorairesTtc, 0);
  const retroTtc = retros.reduce((s, r) => s + r.montantTtc, 0);
  const payeTtc = ventes.reduce((s, v) => s + payeTtcDe(v), 0);
  return { nbVentes: ventes.length, caTtc, caHt: ht(caTtc), retroHt: ht(retroTtc), payeHt: ht(payeTtc), resteHt: ht(caTtc - retroTtc - payeTtc),
    ids: ventes.map((v) => v.id) };
}

export const totauxMois = (d: Pick<DonneesSociete, 'ventes' | 'retrocessions'>, annee: number, mois: number): Totaux =>
  totaux(ventesDuMois(d.ventes, annee, mois), retrosDuMois(d.retrocessions, annee, mois));

export const totauxAnnee = (d: Pick<DonneesSociete, 'ventes' | 'retrocessions'>, annee: number): Totaux =>
  totaux(ventesDeLAnnee(d.ventes, annee), d.retrocessions.filter((r) => r.annee === annee));

/** Le CA HT de chaque mois (12 valeurs) d'une année ; les ventes « mois à confirmer » n'y sont pas. PUR. */
export const caHtParMois = (ventes: readonly Vente[], annee: number): number[] =>
  Array.from({ length: 12 }, (_, i) => ventesDuMois(ventes, annee, i + 1).reduce((s, v) => s + ht(v.honorairesTtc), 0));

/** Les années présentes (ventes, compromis, rétrocessions), croissantes. PUR. */
export function anneesDe(d: Pick<DonneesSociete, 'ventes' | 'retrocessions'>, aujourdhui: string): number[] {
  const a = new Set<number>([Number(aujourdhui.slice(0, 4)), ...d.ventes.map((v) => v.annee), ...d.retrocessions.map((r) => r.annee)]);
  return [...a].sort((x, y) => x - y);
}

// ── L'année par année (toute l'histoire) ─────────────────────────────────────────────────────────────────────────────────

export interface LigneAnnee {
  annee: number;
  nbVentes: number;
  caHt: number;
  /** Dont les ventes « mois à confirmer » (dans l'année, hors des mois). */
  moisAConfirmerHt: number;
  nbMoisAConfirmer: number;
  compromisHt: number;
  nbCompromis: number;
  retroHt: number;
  payeHt: number;
  resteHt: number;
}

export function historique(d: Pick<DonneesSociete, 'ventes' | 'retrocessions'>, annees: readonly number[]): LigneAnnee[] {
  return annees.map((annee) => {
    const t = totauxAnnee(d, annee);
    const aConfirmer = ventesDeLAnnee(d.ventes, annee).filter(moisAConfirmer);
    const comp = compromisDeLAnnee(d.ventes, annee);
    return { annee, nbVentes: t.nbVentes, caHt: t.caHt, moisAConfirmerHt: aConfirmer.reduce((s, v) => s + ht(v.honorairesTtc), 0),
      nbMoisAConfirmer: aConfirmer.length, compromisHt: comp.reduce((s, v) => s + ht(v.honorairesTtc), 0), nbCompromis: comp.length,
      retroHt: t.retroHt, payeHt: t.payeHt, resteHt: t.resteHt };
  });
}

// ── Les négociateurs ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LigneNegociateur {
  negociateur: string;
  nbVentes: number;
  caHt: number;
  payeHt: number;
  retroHt: number;
  ids: number[];
}

/** Par négociateur, sur un ensemble de ventes et les rétrocessions de la même période. Trié par CA HT décroissant. PUR. */
export function parNegociateur(ventes: readonly Vente[], retros: readonly Retrocession[]): LigneNegociateur[] {
  const noms = new Set<string>([...ventes.flatMap(negociateursDe), ...retros.map((r) => r.negociateur)]);
  return [...noms].map((n) => {
    const siennes = ventes.filter((v) => negociateursDe(v).includes(n));
    const paye = siennes.reduce((s, v) => s + v.lignes.reduce((t, l) => t + (l.negociateur === n && l.role === 'negociateur' ? l.montantTtc ?? 0 : 0), 0), 0);
    return { negociateur: n, nbVentes: siennes.length, caHt: siennes.reduce((s, v) => s + caHtPortePar(v, n), 0), payeHt: ht(paye),
      retroHt: ht(retros.filter((r) => r.negociateur === n).reduce((s, r) => s + r.montantTtc, 0)), ids: siennes.map((v) => v.id) };
  }).sort((a, b) => b.caHt - a.caHt || a.negociateur.localeCompare(b.negociateur, 'fr'));
}

// ── Les apporteurs ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LigneApporteur {
  apporteur: string;
  nbRetrocessions: number;
  retroHt: number;
  /** Les ventes auxquelles ses rétrocessions sont rattachées. */
  ventesIds: number[];
  caApporteHt: number;
  aRepartir: number;
}

/** Les apporteurs d'une période (rétrocessions de la période) ; un apporteur sans nom est « Apporteur non nommé ». PUR. */
export function parApporteur(retros: readonly Retrocession[], ventes: readonly Vente[]): LigneApporteur[] {
  const parId = new Map(ventes.map((v) => [v.id, v]));
  const groupes = new Map<string, Retrocession[]>();
  for (const r of retros) {
    const nom = r.apporteur?.trim() || (r.venteId !== null ? parId.get(r.venteId)?.apporteur?.trim() : '') || APPORTEUR_NON_NOMME;
    groupes.set(nom, [...(groupes.get(nom) ?? []), r]);
  }
  return [...groupes].map(([apporteur, rs]) => {
    const ids = [...new Set(rs.map((r) => r.venteId).filter((x): x is number => x !== null))];
    return { apporteur, nbRetrocessions: rs.length, retroHt: ht(rs.reduce((s, r) => s + r.montantTtc, 0)), ventesIds: ids,
      caApporteHt: ids.reduce((s, id) => s + ht(parId.get(id)?.honorairesTtc ?? 0), 0), aRepartir: rs.filter((r) => r.venteId === null).length };
  }).sort((a, b) => b.retroHt - a.retroHt || a.apporteur.localeCompare(b.apporteur, 'fr'));
}

/**
 * Les ventes auxquelles une rétrocession peut se rattacher : celles du MÊME négociateur et du même mois d'abord, puis le reste de
 * l'année de la société (une rétrocession peut payer une vente d'un autre mois). PUR.
 */
export function ventesProposees(r: Retrocession, ventes: readonly Vente[]): { duMois: Vente[]; autres: Vente[] } {
  const memeSociete = ventes.filter((v) => v.societe === r.societe && v.statut !== 'annulee');
  const duMois = memeSociete.filter((v) => v.annee === r.annee && v.mois === r.mois && negociateursDe(v).includes(r.negociateur));
  const ids = new Set(duMois.map((v) => v.id));
  const autres = memeSociete.filter((v) => !ids.has(v.id) && (v.annee === r.annee || v.annee === r.annee - 1));
  return { duMois, autres };
}

// ── Le CA global (vente CRITERIMMO + vente MACJ + location + gestion) ───────────────────────────────────────────────────────

export interface CelluleGlobal {
  venteCriterimmoHt: number;
  venteMacjHt: number;
  locationHt: number | null;
  gestionHt: number | null;
  /** Le réalisé : la somme de ce qui est connu. */
  totalHt: number;
  /** CRITERIMMO = vente CRITERIMMO + location + gestion ; MACJ = vente MACJ. */
  criterimmoHt: number;
  macjHt: number;
}

export interface EntreesGlobal {
  ventes: readonly Pick<Vente, 'societe' | 'statut' | 'annee' | 'mois' | 'honorairesTtc'>[];
  /** Le CA HT de la location par mois (« AAAA-MM » → montant), lu dans le Suivi de la Location ; absent : non lu. */
  location: Readonly<Record<string, number>> | null;
  gestion: readonly Pick<GestionMois, 'annee' | 'mois' | 'honorairesHt'>[];
}

const cle = (annee: number, mois: number): string => `${annee}-${String(mois).padStart(2, '0')}`;

/** Une cellule du CA global : un mois (mois 1 → 12), ou l'année entière (mois null : les ventes « mois à confirmer » comprises). PUR. */
export function celluleGlobal(e: EntreesGlobal, annee: number, mois: number | null): CelluleGlobal {
  const ventes = e.ventes.filter((v) => v.statut === 'vendue' && v.annee === annee && (mois === null || v.mois === mois));
  const somme = (s: Societe): number => ventes.filter((v) => v.societe === s).reduce((t, v) => t + ht(v.honorairesTtc), 0);
  const moisVises = mois === null ? Array.from({ length: 12 }, (_, i) => i + 1) : [mois];
  const loc = e.location === null ? null : moisVises.reduce((t, m) => t + (e.location?.[cle(annee, m)] ?? 0), 0);
  const gLignes = e.gestion.filter((g) => g.annee === annee && moisVises.includes(g.mois) && g.honorairesHt !== null);
  const gestion = gLignes.length === 0 ? null : gLignes.reduce((t, g) => t + (g.honorairesHt ?? 0), 0);
  const venteCriterimmoHt = somme('criterimmo');
  const venteMacjHt = somme('macj');
  const criterimmoHt = venteCriterimmoHt + (loc ?? 0) + (gestion ?? 0);
  return { venteCriterimmoHt, venteMacjHt, locationHt: loc, gestionHt: gestion, totalHt: criterimmoHt + venteMacjHt, criterimmoHt, macjHt: venteMacjHt };
}

/** Le prévisionnel d'une année : les compromis en cours rattachés à l'année, par société (HT). PUR. */
export function previsionnel(e: Pick<EntreesGlobal, 'ventes'>, annee: number): { criterimmoHt: number; macjHt: number; totalHt: number } {
  const c = e.ventes.filter((v) => v.statut === 'compromis' && v.annee === annee);
  const criterimmoHt = c.filter((v) => v.societe === 'criterimmo').reduce((t, v) => t + ht(v.honorairesTtc), 0);
  const macjHt = c.filter((v) => v.societe === 'macj').reduce((t, v) => t + ht(v.honorairesTtc), 0);
  return { criterimmoHt, macjHt, totalHt: criterimmoHt + macjHt };
}

/** L'écart et sa part (null : rien à comparer). PUR. */
export const variation = (courant: number, precedent: number): number | null => (precedent === 0 ? null : (courant - precedent) / precedent);

/** Le reste de gestion proposé à la saisie : honoraires − ADHOC − salarié (les champs vides comptent 0) ; null sans honoraires. PUR. */
export const resteGestionPropose = (g: Pick<GestionMois, 'honorairesHt' | 'adhocHt' | 'salarieHt'>): number | null =>
  g.honorairesHt === null ? null : g.honorairesHt - (g.adhocHt ?? 0) - (g.salarieHt ?? 0);
