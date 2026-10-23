import {
  type Apporteur, type CategoriePrime, collegueADate, type ModePrime, type Origine, type OrigineContact, type RegleCommission, type TypeActivite, versionADate,
} from './suivi';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : LES CALCULS DU TABLEAU DE BORD (Arno, 22/10/2026) ════════════════════════════════════════
 *
 * Reproduit EXACTEMENT les formules du suivi mensuel d'Arno (CA_JBP_2026.xlsx), ligne par ligne puis par mois :
 *   CA HT de la ligne        = honoraires propriétaire HT + honoraires locataire HT             (colonne E)
 *   commission d'apporteur   = la commission saisie, sinon CA HT × taux de l'apporteur à la date (colonne H, `=E8*10%`)
 *   prime de nouvelle gestion = la prime saisie, sinon (mandat signé) la prime de la règle à la date, logement ou parking (F)
 *   CA net d'apporteurs      = CA HT − commissions d'apporteurs                                   (`TOTAL CA HT - APPORTEURS`)
 *   commission du négociateur = taux × CA net + primes − rétrocessions                            (`=C19*15%+F18-F24`)
 *   ventilation              = CA des baux avec gestion / sans gestion                            (« VENTILATION »)
 * Le taux du négociateur est celui de la règle EN VIGUEUR À LA DATE DE SIGNATURE de chaque ligne (jamais rétroactif) : avec
 * un taux unique dans le mois, c'est la formule du fichier. AUCUN ARRONDI dans les calculs ; l'affichage arrondit au centime.
 * Chaque agrégat garde la liste de ses lignes (`ids`) : tout chiffre de l'écran ouvre la liste des baux qui le font.
 * PUR : aucune base, aucun réseau.
 */

export type Assurance = 'gli' | 'visale' | 'autre' | 'aucune';

export interface ActiviteCalcul {
  id: number | string;
  type: TypeActivite;
  dateSignature: string;
  dateSupposee?: boolean;
  libelleProprietaire: string;
  libelleLocataire: string;
  honoProprietaireHt: number;
  honoLocataireHt: number;
  primeSaisie: number | null;
  mandatGestion: boolean;
  categoriePrime: CategoriePrime | null;
  apporteurId: number | null;
  apporteurNom: string | null;
  apporteurTaux: number | null;
  commissionSaisie: number | null;
  negociateurId: number | null;
  negociateurLibelle: string;
  avecGestion: boolean;
  origineProprietaire: Origine | null;
  origineLocataire: Origine | null;
  loyerHc: number | null;
  charges: number | null;
  assurance: Assurance | null;
  parking: boolean;
  /** Jours sans locataire avant ce bail (sortie du précédent → entrée), quand elle est connue. */
  vacanceJours: number | null;
  rattachement: 'rattache' | 'douteux' | 'non_rattache';
  /** 407 — origine du contact, collègue (« collègue directement »), choix de prime. Absents : base d'avant la 407. */
  origineContact?: OrigineContact | null;
  collegueId?: number | null;
  collegueLibelle?: string | null;
  primeMode?: ModePrime | null;
}

export interface Retrocession { negociateurId: number | null; negociateurLibelle: string; mois: string; montant: number; libelle: string }

export interface ContexteCalcul {
  regles: RegleCommission[];
  apporteurs: Apporteur[];
  retrocessions: Retrocession[];
}

export interface Filtre {
  negociateur?: string | null;
  /** Un apporteur (id), ou « aucun » (baux sans apporteur). */
  apporteur?: number | 'aucun' | null;
  gestion?: 'avec' | 'sans' | null;
  /** Origine du PROPRIÉTAIRE (le client de l'agence) : nouveau ou déjà client. */
  origine?: Origine | null;
}

// ── Une ligne ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const caLigne = (a: ActiviteCalcul): number => a.honoProprietaireHt + a.honoLocataireHt;
export const moisDeLigne = (a: ActiviteCalcul): string => a.dateSignature.slice(0, 7);

/** Le négociateur : son id s'il est connu, sinon son nom (lignes reprises du fichier, sans compte). */
export const cleNegociateur = (o: { negociateurId: number | null; negociateurLibelle: string }): string =>
  (o.negociateurId !== null ? `id:${o.negociateurId}` : `nom:${o.negociateurLibelle.trim().toLowerCase()}`);

export function primeDe(a: ActiviteCalcul, regles: readonly RegleCommission[]): number {
  // 407 — le choix de prime : « Aucune » → 0 ; « Personnalisé » → le montant saisi ; « 150 € » → la règle à la date.
  if (a.primeMode === 'aucune') return 0;
  if (a.primeMode === 'personnalise') return a.primeSaisie ?? 0;
  if (a.primeSaisie !== null) return a.primeSaisie;
  if (!a.mandatGestion && a.primeMode !== 'regle') return 0;
  const r = versionADate(regles, a.dateSignature);
  if (r === null) return 0;
  return (a.categoriePrime ?? (a.parking ? 'parking' : 'logement')) === 'parking' ? r.primeParking : r.primeLogement;
}

export function tauxApporteurDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  if (a.apporteurId === null) return 0;
  if (a.apporteurTaux !== null) return a.apporteurTaux;
  const ap = apporteurs.find((x) => x.id === a.apporteurId);
  return ap === undefined ? 0 : versionADate(ap.baremes, a.dateSignature)?.taux ?? 0;
}

export function commissionApporteurDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  if (a.commissionSaisie !== null) return a.commissionSaisie;
  return caLigne(a) * tauxApporteurDe(a, apporteurs);
}

/** Le taux de commission appliqué à la ligne (affichage) : celui du bail, sinon celui de l'apporteur à la date ; null sans apporteur. */
export function tauxAffichage(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number | null {
  if (a.apporteurId === null && a.apporteurNom === null) return null;
  if (a.commissionSaisie !== null && a.apporteurTaux === null) return caLigne(a) === 0 ? null : a.commissionSaisie / caLigne(a);
  return tauxApporteurDe(a, apporteurs);
}

/**
 * 407 — le COLLÈGUE DE RATTACHEMENT d'une affaire : le collègue choisi (« collègue directement ») ; pour un apporteur, son
 * collègue À LA DATE DE SIGNATURE (un changement de collègue ne réattribue jamais les affaires passées) ; sinon aucun.
 * `aRattacher` : l'apporteur n'a encore aucun collègue. PUR.
 */
export function collegueDeLigne(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): { cle: string; libelle: string } | { aRattacher: true } | null {
  if (a.origineContact === 'collegue' && a.collegueLibelle) {
    return { cle: a.collegueId !== null && a.collegueId !== undefined ? `id:${a.collegueId}` : `nom:${a.collegueLibelle.toLowerCase()}`, libelle: a.collegueLibelle };
  }
  if (a.apporteurId === null) return null;
  const ap = apporteurs.find((x) => x.id === a.apporteurId);
  if (ap === undefined || ap.collegues === undefined) return null;
  const c = collegueADate(ap, a.dateSignature);
  if (c === null) return { aRattacher: true };
  return { cle: c.collegueId !== null ? `id:${c.collegueId}` : `nom:${c.collegueLibelle.toLowerCase()}`, libelle: c.collegueLibelle };
}

export const tauxNegociateurDe = (a: ActiviteCalcul, regles: readonly RegleCommission[]): number => versionADate(regles, a.dateSignature)?.tauxNegociateur ?? 0;

// ── Filtres ───────────────────────────────────────────────────────────────────────────────────────────────────────

export function filtrer<T extends ActiviteCalcul>(activites: readonly T[], f: Filtre): T[] {
  return activites.filter((a) => {
    if (f.negociateur && cleNegociateur(a) !== f.negociateur) return false;
    if (f.apporteur === 'aucun' && a.apporteurId !== null) return false;
    if (typeof f.apporteur === 'number' && a.apporteurId !== f.apporteur) return false;
    if (f.gestion === 'avec' && !a.avecGestion) return false;
    if (f.gestion === 'sans' && a.avecGestion) return false;
    if (f.origine && a.origineProprietaire !== f.origine) return false;
    return true;
  });
}

/** Les rétrocessions d'un ou plusieurs mois (« AAAA-MM »), pour un négociateur ou pour tous. */
export function retrocessionsDe(ctx: ContexteCalcul, mois: readonly string[], negociateur?: string | null): number {
  return ctx.retrocessions
    .filter((r) => mois.includes(r.mois.slice(0, 7)) && (!negociateur || cleNegociateur(r) === negociateur))
    .reduce((s, r) => s + r.montant, 0);
}

// ── Les totaux d'un ensemble de lignes ─────────────────────────────────────────────────────────────────────────────

export interface Totaux {
  nb: number;
  nbBaux: number;
  nbAvenants: number;
  nbGestionSeule: number;
  ca: number;
  caProprietaire: number;
  caLocataire: number;
  primes: number;
  apporteurs: number;
  caNet: number;
  /** Σ taux × CA net + primes, AVANT rétrocessions. */
  commissionAvantRetro: number;
  avecGestion: number;
  sansGestion: number;
  ids: (number | string)[];
}

export function totaux(lignes: readonly ActiviteCalcul[], ctx: ContexteCalcul): Totaux {
  const t: Totaux = { nb: 0, nbBaux: 0, nbAvenants: 0, nbGestionSeule: 0, ca: 0, caProprietaire: 0, caLocataire: 0, primes: 0, apporteurs: 0, caNet: 0, commissionAvantRetro: 0, avecGestion: 0, sansGestion: 0, ids: [] };
  for (const a of lignes) {
    const ca = caLigne(a);
    const app = commissionApporteurDe(a, ctx.apporteurs);
    const prime = primeDe(a, ctx.regles);
    t.nb += 1;
    if (a.type === 'bail') t.nbBaux += 1; else if (a.type === 'avenant') t.nbAvenants += 1; else t.nbGestionSeule += 1;
    t.ca += ca; t.caProprietaire += a.honoProprietaireHt; t.caLocataire += a.honoLocataireHt;
    t.primes += prime; t.apporteurs += app; t.caNet += ca - app;
    t.commissionAvantRetro += tauxNegociateurDe(a, ctx.regles) * (ca - app) + prime;
    if (a.avecGestion) t.avecGestion += ca; else t.sansGestion += ca;
    t.ids.push(a.id);
  }
  return t;
}

export const variation = (courant: number, precedent: number): number | null => (precedent === 0 ? null : (courant - precedent) / precedent);

const moisDe = (annee: number, m: number): string => `${annee}-${String(m).padStart(2, '0')}`;

// ── A — le mois, comparé au même mois de l'année précédente ─────────────────────────────────────────────────────────

export interface Periode { annee: number; mois: number | null }
export interface TotauxPeriode extends Totaux { retrocessions: number; commission: number }

/** Les lignes d'une période : l'année entière (`mois` null) ou un mois. */
export function lignesDePeriode(activites: readonly ActiviteCalcul[], p: Periode): ActiviteCalcul[] {
  const prefixe = p.mois === null ? `${p.annee}-` : `${moisDe(p.annee, p.mois)}`;
  return activites.filter((a) => a.dateSignature.startsWith(prefixe));
}

export function totauxPeriode(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: Periode, negociateur?: string | null): TotauxPeriode {
  const t = totaux(lignesDePeriode(activites, p), ctx);
  const mois = p.mois === null ? Array.from({ length: 12 }, (_, i) => moisDe(p.annee, i + 1)) : [moisDe(p.annee, p.mois)];
  const retrocessions = retrocessionsDe(ctx, mois, negociateur);
  return { ...t, retrocessions, commission: t.commissionAvantRetro - retrocessions };
}

export interface SectionMois { courant: TotauxPeriode; precedent: TotauxPeriode; variationCa: number | null; variationNb: number | null }

export function sectionMois(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: Periode, negociateur?: string | null): SectionMois {
  const courant = totauxPeriode(activites, ctx, p, negociateur);
  const precedent = totauxPeriode(activites, ctx, { annee: p.annee - 1, mois: p.mois }, negociateur);
  return { courant, precedent, variationCa: variation(courant.ca, precedent.ca), variationNb: variation(courant.nb, precedent.nb) };
}

// ── LES TUILES DU SUIVI ANNUEL (Arno, 23/10/2026) ─────────────────────────────────────────────────────────────────────
/**
 * Les 4 tuiles du Suivi annuel montrent l'ANNÉE : une année passée en entier ; l'année en cours du 1er janvier à la fin du
 * mois choisi (`moisFin`). N−1 sur la MÊME période (janv. → oct. 2025 face à janv. → oct. 2026). CA HT, baux, CA net
 * d'apporteurs ; et la gestion de la période (nouvelles / perdues, honoraires récurrents gagnés / perdus par mois). PUR.
 */
export interface TuilesAnnee {
  annee: number; moisFin: number; complete: boolean;
  courant: Totaux; precedent: Totaux;
  ecartCa: number; variationCa: number | null; ecartNb: number; variationNb: number | null; ecartCaNet: number; variationCaNet: number | null;
  /** `sansLoyer` : biens dont les honoraires ne sont pas calculables (loyer ou taux absent) — non comptés, rien n'est inventé. */
  gestion: { nouvelles: number; perdues: number; gagneMensuel: number; perduMensuel: number; sansLoyer: number; lotsEntres: number[]; lotsSortis: number[] };
}

export function tuilesAnnee(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, annee: number, aujourdhui: string, moisChoisi: number,
  gestionLignes: readonly LigneGestion[] = []): TuilesAnnee {
  const enCours = annee === Number(aujourdhui.slice(0, 4));
  const moisFin = enCours ? Math.min(12, Math.max(1, moisChoisi)) : 12;
  const dans = (a: number) => (x: { dateSignature: string }) => x.dateSignature >= `${a}-01` && x.dateSignature.slice(0, 7) <= moisDe(a, moisFin);
  const courant = totaux(activites.filter(dans(annee)), ctx);
  const precedent = totaux(activites.filter(dans(annee - 1)), ctx);
  const g = gestionLignes.filter((l) => l.effetLe.slice(0, 4) === String(annee) && l.effetLe.slice(0, 7) <= moisDe(annee, moisFin));
  const nouvelles = g.filter((l) => l.apres === 'en_gestion' && l.avant !== 'en_gestion');
  const perdues = g.filter((l) => l.avant === 'en_gestion' && l.apres !== 'en_gestion');
  const somme = (x: LigneGestion[]): number => x.reduce((t, l) => t + (honorairesGestionMensuels(l) ?? 0), 0);
  return {
    annee, moisFin, complete: moisFin === 12, courant, precedent,
    ecartCa: courant.ca - precedent.ca, variationCa: variation(courant.ca, precedent.ca),
    ecartNb: courant.nbBaux - precedent.nbBaux, variationNb: variation(courant.nbBaux, precedent.nbBaux),
    ecartCaNet: courant.caNet - precedent.caNet, variationCaNet: variation(courant.caNet, precedent.caNet),
    gestion: { nouvelles: nouvelles.length, perdues: perdues.length, gagneMensuel: somme(nouvelles), perduMensuel: somme(perdues),
      sansLoyer: [...nouvelles, ...perdues].filter((l) => honorairesGestionMensuels(l) === null).length,
      lotsEntres: nouvelles.map((l) => l.lotId).filter((x): x is number => x !== null), lotsSortis: perdues.map((l) => l.lotId).filter((x): x is number => x !== null) },
  };
}

// ── B — le cumul de l'année, mois par mois, et celui de l'année précédente ─────────────────────────────────────────

export interface PointCumul { mois: string; ca: number; caCumule: number; nb: number; caN1: number; caCumuleN1: number; nbN1: number; ids: (number | string)[] }

export function sectionCumul(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, annee: number): PointCumul[] {
  let cumul = 0;
  let cumulN1 = 0;
  return Array.from({ length: 12 }, (_, i) => {
    const t = totaux(lignesDePeriode(activites, { annee, mois: i + 1 }), ctx);
    const n1 = totaux(lignesDePeriode(activites, { annee: annee - 1, mois: i + 1 }), ctx);
    cumul += t.ca; cumulN1 += n1.ca;
    return { mois: moisDe(annee, i + 1), ca: t.ca, caCumule: cumul, nb: t.nb, caN1: n1.ca, caCumuleN1: cumulN1, nbN1: n1.nb, ids: t.ids };
  });
}

// ── C — les apporteurs : ce qu'ils apportent, ce qu'ils coûtent ─────────────────────────────────────────────────────

export interface LigneApporteur {
  apporteurId: number | null;
  nom: string;
  type: string | null;
  nb: number;
  ca: number;
  commissions: number;
  coutsFixes: number;
  /** Ce qui reste à l'agence : CA apporté − commissions − coûts fixes. */
  net: number;
  /** Ce que coûte l'apporteur pour 1 € de CA apporté ; null sans CA. */
  coutParEuro: number | null;
  ids: (number | string)[];
}

/** Les coûts fixes mensuels d'un apporteur sur les mois de la période (la version en vigueur au 1er de chaque mois). */
export function coutsFixesDe(ap: Apporteur, mois: readonly string[]): number {
  return mois.reduce((s, m) => s + (versionADate(ap.baremes, `${m}-01`)?.coutFixeMensuel ?? 0), 0);
}

export function sectionApporteurs(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: Periode, moisEcoules?: readonly string[]): LigneApporteur[] {
  const lignes = lignesDePeriode(activites, p).filter((a) => a.apporteurId !== null || a.apporteurNom !== null);
  const mois = moisEcoules ?? (p.mois === null ? Array.from({ length: 12 }, (_, i) => moisDe(p.annee, i + 1)) : [moisDe(p.annee, p.mois)]);
  const parCle = new Map<string, LigneApporteur>();
  for (const ap of ctx.apporteurs.filter((x) => !x.archive)) {
    parCle.set(`id:${ap.id}`, { apporteurId: ap.id, nom: ap.nom, type: ap.type, nb: 0, ca: 0, commissions: 0, coutsFixes: coutsFixesDe(ap, mois), net: 0, coutParEuro: null, ids: [] });
  }
  for (const a of lignes) {
    const cle = a.apporteurId !== null ? `id:${a.apporteurId}` : `nom:${(a.apporteurNom ?? '').toLowerCase()}`;
    const l = parCle.get(cle) ?? { apporteurId: a.apporteurId, nom: a.apporteurNom ?? '—', type: null, nb: 0, ca: 0, commissions: 0, coutsFixes: 0, net: 0, coutParEuro: null, ids: [] };
    l.nb += 1; l.ca += caLigne(a); l.commissions += commissionApporteurDe(a, ctx.apporteurs); l.ids.push(a.id);
    parCle.set(cle, l);
  }
  return [...parCle.values()]
    .map((l) => ({ ...l, net: l.ca - l.commissions - l.coutsFixes, coutParEuro: l.ca === 0 ? null : (l.commissions + l.coutsFixes) / l.ca }))
    .filter((l) => l.nb > 0 || l.coutsFixes > 0)
    .sort((a, b) => b.ca - a.ca || a.nom.localeCompare(b.nom));
}

// ── D — la gestion récurrente : entrées, sorties, solde, et le portefeuille sur 12 mois ────────────────────────────

export interface Transition { lotId: number; avant: string | null; apres: string; effetLe: string }
export interface PointGestion { mois: string; entrees: number; sorties: number; solde: number; stock: number; lotsEntres: number[]; lotsSortis: number[] }

/**
 * Les 12 mois qui finissent en `moisFin` (« AAAA-MM ») : entrées en gestion (un statut qui DEVIENT « en_gestion ») et sorties
 * (un statut qui QUITTE « en_gestion »), solde, et le nombre de biens en gestion à la fin de chaque mois, remonté depuis le
 * nombre d'aujourd'hui (`stockActuel`) en défaisant les transitions postérieures.
 */
/** Une ENTRÉE en gestion : le passage au statut « En gestion » (la règle de la tuile « Biens en gestion »). PUR. */
export function entreeEnGestion(t: Transition): boolean { return t.apres === 'en_gestion' && t.avant !== 'en_gestion'; }

/**
 * Arno (23/10/2026) — « Mois par mois », mesure « Gestion » : les NOUVELLES gestions de chaque mois civil de l'année (les passages au
 * statut « En gestion »), sans soustraire les sorties. Douze nombres, janvier → décembre. PUR.
 */
export function entreesGestionParMois(transitions: readonly Transition[], annee: number): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mm = `${annee}-${String(i + 1).padStart(2, '0')}`;
    return transitions.filter((t) => t.effetLe.slice(0, 7) === mm && entreeEnGestion(t)).length;
  });
}

export function sectionGestion(transitions: readonly Transition[], stockActuel: number, moisFin: string): PointGestion[] {
  const [a, m] = moisFin.split('-').map(Number);
  const mois = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 12 + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
  const entre = entreeEnGestion;
  const sort = (t: Transition): boolean => t.avant === 'en_gestion' && t.apres !== 'en_gestion';
  const delta = (t: Transition): number => (entre(t) ? 1 : sort(t) ? -1 : 0);
  return mois.map((mm) => {
    const duMois = transitions.filter((t) => t.effetLe.slice(0, 7) === mm);
    const apres = transitions.filter((t) => t.effetLe.slice(0, 7) > mm).reduce((s, t) => s + delta(t), 0);
    const entrees = duMois.filter(entre);
    const sorties = duMois.filter(sort);
    return { mois: mm, entrees: entrees.length, sorties: sorties.length, solde: entrees.length - sorties.length, stock: stockActuel - apres,
      lotsEntres: entrees.map((t) => t.lotId), lotsSortis: sorties.map((t) => t.lotId) };
  });
}

// ── E — les indicateurs métier ──────────────────────────────────────────────────────────────────────────────────────

export interface Indicateurs {
  vacanceMoyenneJours: number | null;
  vacanceIds: (number | string)[];
  preavis: number;
  partGaranties: number | null;
  garantiesIds: (number | string)[];
  assuranceConnue: number;
  partParkingNb: number | null;
  partParkingCa: number | null;
  parkingIds: (number | string)[];
}

export function sectionIndicateurs(lignes: readonly ActiviteCalcul[], preavisDuMois: number): Indicateurs {
  const avecVacance = lignes.filter((a) => a.vacanceJours !== null);
  const connue = lignes.filter((a) => a.assurance !== null);
  const garanties = connue.filter((a) => a.assurance === 'gli' || a.assurance === 'visale');
  const parking = lignes.filter((a) => a.parking || a.categoriePrime === 'parking');
  const ca = lignes.reduce((s, a) => s + caLigne(a), 0);
  return {
    vacanceMoyenneJours: avecVacance.length === 0 ? null : avecVacance.reduce((s, a) => s + (a.vacanceJours as number), 0) / avecVacance.length,
    vacanceIds: avecVacance.map((a) => a.id),
    preavis: preavisDuMois,
    partGaranties: connue.length === 0 ? null : garanties.length / connue.length,
    garantiesIds: garanties.map((a) => a.id),
    assuranceConnue: connue.length,
    partParkingNb: lignes.length === 0 ? null : parking.length / lignes.length,
    partParkingCa: ca === 0 ? null : parking.reduce((s, a) => s + caLigne(a), 0) / ca,
    parkingIds: parking.map((a) => a.id),
  };
}

// ── F — les négociateurs (droit « Voir les commissions ») ──────────────────────────────────────────────────────────

export interface LigneNegociateur { cle: string; libelle: string; mois: string; totaux: TotauxPeriode }

/** Pour chaque négociateur, chaque mois de la période qui a de l'activité ou une rétrocession : la formule du fichier. */
export function sectionNegociateurs(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: Periode): LigneNegociateur[] {
  const lignes = lignesDePeriode(activites, p);
  const mois = p.mois === null ? Array.from({ length: 12 }, (_, i) => i + 1) : [p.mois];
  const noms = new Map<string, string>();
  for (const a of lignes) noms.set(cleNegociateur(a), a.negociateurLibelle || '—');
  for (const r of ctx.retrocessions) if (r.mois.startsWith(`${p.annee}-`)) noms.set(cleNegociateur(r), noms.get(cleNegociateur(r)) ?? r.negociateurLibelle);
  const sortie: LigneNegociateur[] = [];
  for (const [cle, libelle] of [...noms.entries()].sort((x, y) => x[1].localeCompare(y[1]))) {
    const siens = lignes.filter((a) => cleNegociateur(a) === cle);
    for (const m of mois) {
      const t = totauxPeriode(siens, ctx, { annee: p.annee, mois: m }, cle);
      if (t.nb > 0 || t.retrocessions > 0) sortie.push({ cle, libelle, mois: moisDe(p.annee, m), totaux: t });
    }
  }
  return sortie;
}

/** Les filtres lus d'une adresse (`?negociateur=id:5&apporteur=3&gestion=avec&origine=nouveau`) — l'écran et l'export. */
export function filtreDepuis(p: URLSearchParams): Filtre {
  const ap = p.get('apporteur');
  const g = p.get('gestion');
  const o = p.get('origine');
  return {
    negociateur: p.get('negociateur') || null,
    apporteur: ap === 'aucun' ? 'aucun' : ap && /^[1-9]\d*$/.test(ap) ? Number(ap) : null,
    gestion: g === 'avec' || g === 'sans' ? g : null,
    origine: o === 'nouveau' || o === 'deja' ? o : null,
  };
}

/** Le filtre écrit dans l'adresse (les valeurs vides sont omises). */
export function filtreVersParams(f: Filtre): string {
  const e: [string, string][] = [];
  if (f.negociateur) e.push(['negociateur', f.negociateur]);
  if (f.apporteur !== null && f.apporteur !== undefined) e.push(['apporteur', String(f.apporteur)]);
  if (f.gestion) e.push(['gestion', f.gestion]);
  if (f.origine) e.push(['origine', f.origine]);
  return new URLSearchParams(e).toString();
}

export const NOMS_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Une ligne d'activité telle que l'écran la reçoit : le bien et le bail pour ouvrir la fiche, la provenance. */
export interface ActiviteLue extends ActiviteCalcul { lotId: number | null; bailId: number | null; source: string }

/** Ce que `/api/admin/location/suivi?vue=tableau` rend (l'année demandée et la précédente). */
export interface DonneesTableau {
  disponible: boolean;
  annee: number;
  annees: number[];
  aujourdhui: string;
  activites: ActiviteLue[];
  regles: RegleCommission[];
  apporteurs: Apporteur[];
  retrocessions: (Retrocession & { id: number })[];
  negociateurs: { cle: string; libelle: string }[];
  gestion: { transitions: Transition[]; stock: number; disponible: boolean };
  preavis: Record<string, number>;
  voirCommissions: boolean;
  /** 407 — les entrées en gestion et les mandats perdus de l'année (feuille du mois) ; les collègues (comptes Location) ; la 407 est-elle là ? */
  gestionLignes?: LigneGestion[];
  collegues?: { id: number; libelle: string }[];
  annuaire?: boolean;
  /** Arno (23/10/2026, historique 2019 → 2025) — chaque année d'activité, sans filtre : baux, CA, CA net, commission (droit). */
  historique?: AnneeHistorique[];
  /** 408 — les écarts expliqués avec le fichier, de l'année (notes de la feuille du mois). */
  ecartsFichier?: EcartFichier[];
}

export interface AnneeHistorique { annee: number; nbBaux: number; nb: number; ca: number; caNet: number; apporteurs: number; commission: number | null }

/** Une ligne par année d'activité (toutes affaires, sans filtre) ; la commission seulement pour qui peut la voir. PUR. */
export function historiqueAnnees(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, voirCommissions: boolean): AnneeHistorique[] {
  const annees = [...new Set(activites.map((a) => Number(a.dateSignature.slice(0, 4))))].sort((x, y) => x - y);
  return annees.map((annee) => {
    const t = totauxPeriode(activites, ctx, { annee, mois: null });
    return { annee, nbBaux: t.nbBaux, nb: t.nb, ca: t.ca, caNet: t.caNet, apporteurs: t.apporteurs, commission: voirCommissions ? t.commission : null };
  });
}


// ── 407 — LA FEUILLE DU MOIS ─────────────────────────────────────────────────────────────────────────────────────────

/** `nb` : les affaires (avenants compris) ; `avenants` : dont avenants ; `ca` : honoraires HT ; `commission` : dû à l'apporteur HT. */
export interface CumulAffaires { nb: number; avenants: number; ca: number; commission: number; ids: (number | string)[] }
const cumulVide = (): CumulAffaires => ({ nb: 0, avenants: 0, ca: 0, commission: 0, ids: [] });
const ajouter = (c: CumulAffaires, a: ActiviteCalcul, apporteurs: readonly Apporteur[]): void => {
  c.nb += 1; c.ca += caLigne(a); c.commission += commissionApporteurDe(a, apporteurs); c.ids.push(a.id);
  if (a.type === 'avenant') c.avenants += 1;
};

export interface ApporteurDuMois extends CumulAffaires { apporteurId: number | null; nom: string; aRattacher: boolean }
export interface CollegueDuMois extends CumulAffaires { cle: string; libelle: string }

/**
 * Les apporteurs d'un ensemble de lignes (nombre d'affaires, CA apporté, honoraires d'apporteur), et pour chaque COLLÈGUE le
 * cumul des affaires apportées par SES apporteurs (collègue à la date de chaque affaire ; « à rattacher » à part). PUR.
 */
export function apporteursEtCollegues(lignes: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[]): { apporteurs: ApporteurDuMois[]; collegues: CollegueDuMois[] } {
  const parApp = new Map<string, ApporteurDuMois>();
  const parCol = new Map<string, CollegueDuMois>();
  for (const a of lignes) {
    if (a.apporteurId === null && a.apporteurNom === null) continue;
    const ap = a.apporteurId === null ? undefined : apporteurs.find((x) => x.id === a.apporteurId);
    const cleA = a.apporteurId !== null ? `id:${a.apporteurId}` : `nom:${(a.apporteurNom ?? '').toLowerCase()}`;
    const ligneA = parApp.get(cleA) ?? { ...cumulVide(), apporteurId: a.apporteurId, nom: ap?.nom ?? a.apporteurNom ?? '—', aRattacher: ap !== undefined && ap.collegues !== undefined && ap.collegues.length === 0 };
    ajouter(ligneA, a, apporteurs);
    parApp.set(cleA, ligneA);
    const col = collegueDeLigne({ ...a, origineContact: 'apporteur' }, apporteurs);
    if (col === null) continue;
    const cleC = 'aRattacher' in col ? 'a-rattacher' : col.cle;
    const ligneC = parCol.get(cleC) ?? { ...cumulVide(), cle: cleC, libelle: 'aRattacher' in col ? 'À rattacher' : col.libelle };
    ajouter(ligneC, a, apporteurs);
    parCol.set(cleC, ligneC);
  }
  const tri = <T extends { ca: number; nom?: string; libelle?: string }>(x: T[]): T[] => x.sort((p, q) => q.ca - p.ca || String(p.nom ?? p.libelle).localeCompare(String(q.nom ?? q.libelle)));
  return { apporteurs: tri([...parApp.values()]), collegues: tri([...parCol.values()]) };
}

/**
 * Le cumul d'UN apporteur (fiche de l'annuaire) : le TOTAL depuis le début (Arno, 23/10/2026), puis par année et par mois — les
 * mêmes lignes et les mêmes règles que le Suivi (lignes reprises du fichier comprises, rattachées ou non à un bail). PUR.
 */
export function cumulApporteur(activites: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], apporteurId: number):
  { total: CumulAffaires; parAnnee: (CumulAffaires & { annee: number })[]; parMois: (CumulAffaires & { mois: string })[] } {
  const siennes = activites.filter((a) => a.apporteurId === apporteurId);
  const total = cumulVide();
  for (const a of siennes) ajouter(total, a, apporteurs);
  const an = new Map<number, CumulAffaires & { annee: number }>();
  const mo = new Map<string, CumulAffaires & { mois: string }>();
  for (const a of siennes) {
    const y = Number(a.dateSignature.slice(0, 4));
    const m = a.dateSignature.slice(0, 7);
    const ly = an.get(y) ?? { ...cumulVide(), annee: y };
    const lm = mo.get(m) ?? { ...cumulVide(), mois: m };
    ajouter(ly, a, apporteurs); ajouter(lm, a, apporteurs);
    an.set(y, ly); mo.set(m, lm);
  }
  return { total, parAnnee: [...an.values()].sort((x, y) => y.annee - x.annee), parMois: [...mo.values()].sort((x, y) => y.mois.localeCompare(x.mois)) };
}

export type TotalApporteur = Omit<CumulAffaires, 'ids'>;

/** Les totaux de CHAQUE apporteur depuis le début (liste de l'annuaire : dossiers, honoraires HT, dû HT). PUR. */
export function totauxApporteurs(activites: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[]): Record<number, TotalApporteur> {
  const par = new Map<number, CumulAffaires>();
  for (const a of activites) {
    if (a.apporteurId === null) continue;
    const c = par.get(a.apporteurId) ?? cumulVide();
    ajouter(c, a, apporteurs);
    par.set(a.apporteurId, c);
  }
  return Object.fromEntries([...par].map(([id, c]) => [id, { nb: c.nb, avenants: c.avenants, ca: c.ca, commission: c.commission }]));
}

/** Une entrée en gestion ou une sortie (mandat perdu), avec le loyer et le taux qui font ses honoraires de gestion. */
export interface LigneGestion {
  /** null : une gestion perdue du suivi mensuel que l'outil n'a pas rattachée à un bien (408). */
  lotId: number | null; libelle: string; proprietaire: string; effetLe: string; avant: string | null; apres: string;
  loyerHc: number | null; provisions: number | null; base: 'cc' | 'hc' | null; tauxHt: number | null;
  /** 408 — « fichier » : notée dans le suivi mensuel (colonnes « GESTION PERDU » / « Loyers cc »), mois supposé au 1er. */
  origine?: 'fichier';
  /** 408 — d'où vient le taux retenu (toujours dit : c'est une valeur DÉDUITE), et le commentaire du fichier. */
  tauxSource?: 'conditions' | 'wippimmo' | 'reglage' | null;
  commentaire?: string | null;
}
export const STATUT_ARRIVEE: Record<string, string> = { ancienne_gestion: 'Ancienne gestion', location_seule: 'Location seule', en_gestion: 'En gestion', perdue_fichier: 'Perdue (suivi mensuel)' };

/** 408 — un écart expliqué entre un total du fichier et le calcul de l'outil, montré en note dans la feuille du mois. */
export interface EcartFichier { mois: string; champ: 'ca' | 'apporteurs' | 'primes' | 'commission'; fichier: number; outil: number; libelle: string }

/** Les honoraires de gestion mensuels HT d'une ligne : (loyer HC + provisions si base « charges comprises ») × taux ; null sans loyer ni taux. */
export function honorairesGestionMensuels(l: Pick<LigneGestion, 'loyerHc' | 'provisions' | 'base' | 'tauxHt'>): number | null {
  if (l.loyerHc === null || l.tauxHt === null) return null;
  return (l.loyerHc + (l.base === 'cc' ? (l.provisions ?? 0) : 0)) * l.tauxHt / 100;
}

export interface GestionDuMois {
  nouvelles: LigneGestion[]; perdues: LigneGestion[];
  gagneMensuel: number; perduMensuel: number; balanceMensuelle: number; balanceAnnuelle: number; sansLoyer: number;
}

/** Les nouvelles gestions et les mandats perdus d'un mois (« AAAA-MM »), et la balance gagné − perdu (mensuelle, annualisée). PUR. */
export function gestionDuMois(lignes: readonly LigneGestion[], mois: string): GestionDuMois {
  const duMois = lignes.filter((l) => l.effetLe.slice(0, 7) === mois);
  const nouvelles = duMois.filter((l) => l.apres === 'en_gestion' && l.avant !== 'en_gestion');
  const perdues = duMois.filter((l) => l.avant === 'en_gestion' && l.apres !== 'en_gestion');
  const somme = (x: LigneGestion[]): number => x.reduce((s, l) => s + (honorairesGestionMensuels(l) ?? 0), 0);
  const gagneMensuel = somme(nouvelles);
  const perduMensuel = somme(perdues);
  return { nouvelles, perdues, gagneMensuel, perduMensuel, balanceMensuelle: gagneMensuel - perduMensuel, balanceAnnuelle: (gagneMensuel - perduMensuel) * 12,
    sansLoyer: [...nouvelles, ...perdues].filter((l) => honorairesGestionMensuels(l) === null).length };
}
