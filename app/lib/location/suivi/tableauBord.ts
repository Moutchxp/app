import type { LigneMois } from './gestionMensuelle';
import { auCentime, montantPrime, baremeADate, type BaremeApporteur, type ModeApporteur, interneADate, remunerationADate, type RemunerationCollegue,
  type Apporteur, type CategoriePrime, collegueADate, libelleOrigineContact, type ModePrime, type Origine, type OrigineContact, type RegleCommission, type TypeActivite, versionADate,
} from './suivi';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : LES CALCULS DU TABLEAU DE BORD (Arno, 22/10/2026) ════════════════════════════════════════
 *
 * Reproduit EXACTEMENT les formules du suivi mensuel d'Arno (CA_JBP_2026.xlsx), ligne par ligne puis par mois :
 *   CA HT de la ligne        = honoraires propriétaire HT + honoraires locataire HT             (colonne E)
 *   commission d'apporteur   = la commission saisie, sinon CA HT × taux de l'apporteur à la date (colonne H, `=E8*10%`)
 *                              — 🔴 Arno (24/10/2026, 413) : c'est la PART LOCATION ; s'y ajoute la PART GESTION (voir plus bas,
 *                              « One shot » à la signature, « Récurrent » chaque mois en gestion). Le CA net d'apporteurs et la
 *                              commission du négociateur restent calculés sur la PART LOCATION (la formule du fichier).
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
  /** 411 — le texte d'une origine « Personnalisé ». */
  origineContactPrecision?: string | null;
  /**
   * 413 — la commission d'apporteur sur la GESTION : le mode et le taux de CE bail (null : la règle de l'apporteur à la signature),
   * le taux de gestion HT du bien relevé à la signature (en %, ex. 4,5), et la date de SORTIE de gestion du bien (la première
   * après la signature ; null : toujours en gestion). Absents : base d'avant la 413 — part gestion 0.
   */
  apporteurMode?: ModeApporteur | null;
  apporteurTauxGestion?: number | null;
  tauxGestionBien?: number | null;
  finGestion?: string | null;
  /**
   * 🔴 Arno (25/10/2026) — LE CALCUL MENSUEL DU BIEN APPORTÉ (`gestionMensuelle.ts`) : loyer CC du mois (indexé, ou réel), vacance, sortie de
   * gestion, prorata au jour ; posé par le serveur pour un dossier SAISI DANS L'OUTIL dont l'apporteur ou le collègue est « Récurrent »
   * sur la gestion. Ses commissions remplacent alors la règle d'avant (constante). Absent : la règle d'avant ; les dossiers repris du
   * fichier gardent leurs montants importés.
   */
  gestionMensuelle?: { lotId: number; libelle: string; mois: LigneMois[] } | null;
  /** 🔴 Arno (25/10/2026, 424) — le « Statut du bien » validé à la main (`par` : le compte, `le` : la date ISO) ; absent : le calcul. */
  natureManuelle?: { nature: NatureBien; par: string; le: string } | null;
}

export interface Retrocession { negociateurId: number | null; negociateurLibelle: string; mois: string; montant: number; libelle: string }

export interface ContexteCalcul {
  regles: RegleCommission[];
  apporteurs: Apporteur[];
  retrocessions: Retrocession[];
  /**
   * 413 — les affaires « Récurrent » de TOUTES les années (mêmes filtres que les lignes), et le jour : leur part gestion est due
   * chaque mois, jusqu'au mois en cours. Absent : les affaires « Récurrent » des lignes passées au calcul.
   */
  recurrents?: ActiviteCalcul[];
  aujourdhui?: string;
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
  return montantPrime(r, a.categoriePrime ?? (a.parking ? 'parking' : 'logement'));
}

/**
 * 🔴 Arno (24/10/2026, 420) — un dossier signé AVANT l'enregistrement d'une règle « depuis toujours » qui le couvre : la règle remplace
 * aussi ce qui a été saisi sur le dossier (taux, montant, mode, taux sur la gestion — l'import du fichier en porte sur chaque ligne).
 * Un dossier signé ensuite garde ce qui y a été saisi. PUR.
 */
export function ligneRemplacee(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): boolean {
  const r = regleApporteurDe(a, apporteurs);
  return r !== null && r.toujours === true && r.toujoursLe !== undefined && a.dateSignature < r.toujoursLe;
}

export function tauxApporteurDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  if (a.apporteurId === null) return 0;
  if (a.apporteurTaux !== null && !ligneRemplacee(a, apporteurs)) return a.apporteurTaux;
  return regleApporteurDe(a, apporteurs)?.taux ?? 0;
}

/** La PART LOCATION de la commission d'apporteur : la commission saisie, sinon CA HT × taux sur la location. PUR. */
export function partLocationDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  if (a.commissionSaisie !== null && !ligneRemplacee(a, apporteurs)) return a.commissionSaisie;
  return caLigne(a) * tauxApporteurDe(a, apporteurs);
}

// ── 413 — LA PART GESTION (Arno, 24/10/2026) ────────────────────────────────────────────────────────────────────────

/** La règle de l'apporteur EN VIGUEUR À LA SIGNATURE (jamais rétroactive) ; null sans apporteur ni règle. */
export function regleApporteurDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): BaremeApporteur | null {
  if (a.apporteurId === null) return null;
  const ap = apporteurs.find((x) => x.id === a.apporteurId);
  return ap === undefined ? null : baremeADate(ap, a.dateSignature);
}
/** Le mode du bail : le sien, sinon celui de la règle à la signature, sinon « One shot ». */
export const modeApporteurDe = (a: ActiviteCalcul, apporteurs: readonly Apporteur[]): ModeApporteur =>
  (ligneRemplacee(a, apporteurs) ? null : a.apporteurMode) ?? regleApporteurDe(a, apporteurs)?.mode ?? 'one_shot';
/** Le taux de l'apporteur sur la gestion (fraction) : celui du bail, sinon celui de la règle à la signature, sinon 0. */
export function tauxGestionApporteurDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  if (a.apporteurId === null) return 0;
  return (ligneRemplacee(a, apporteurs) ? null : a.apporteurTauxGestion) ?? regleApporteurDe(a, apporteurs)?.tauxGestion ?? 0;
}

/** Pourquoi la part gestion vaut 0 : le bien n'est pas en gestion, ou le loyer / le taux de gestion manquent. */
export type ManqueGestion = 'hors_gestion' | 'loyer_ou_taux';
export const MOT_MANQUE_GESTION: Record<ManqueGestion, string> = {
  hors_gestion: 'le bien n’est pas en gestion', loyer_ou_taux: 'loyer ou taux de gestion manquant',
};

/**
 * Les HONORAIRES DE GESTION MENSUELS HT du bail = loyer charges comprises (loyer HC + charges) × taux de gestion HT du bien.
 * Un bail sans gestion (ni « Relocation » ni « Nouveau mandat ») n'en a pas ; sans loyer ou sans taux, on le DIT (rien n'est
 * inventé : la part gestion vaut alors 0). AUCUN ARRONDI. PUR.
 */
export function honorairesGestionDuBail(a: Pick<ActiviteCalcul, 'avecGestion' | 'mandatGestion' | 'loyerHc' | 'charges' | 'tauxGestionBien'>):
  { montant: number } | { manque: ManqueGestion } {
  if (!a.avecGestion && !a.mandatGestion) return { manque: 'hors_gestion' };
  if (a.loyerHc === null || a.tauxGestionBien === null || a.tauxGestionBien === undefined) return { manque: 'loyer_ou_taux' };
  return { montant: (a.loyerHc + (a.charges ?? 0)) * a.tauxGestionBien / 100 };
}
const mensuelsDe = (a: ActiviteCalcul): number => { const h = honorairesGestionDuBail(a); return 'montant' in h ? h.montant : 0; };

/** « One shot » : la part gestion due À LA SIGNATURE = taux gestion × honoraires de gestion mensuels × 12 (la première année). */
export function partGestionSignatureDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  if (a.apporteurId === null || modeApporteurDe(a, apporteurs) !== 'one_shot') return 0;
  return tauxGestionApporteurDe(a, apporteurs) * mensuelsDe(a) * 12;
}
/** « Récurrent » : la part gestion due CHAQUE MOIS = taux gestion × honoraires de gestion mensuels (0 en « One shot »). */
export function partGestionMensuelleDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  if (a.apporteurId === null || modeApporteurDe(a, apporteurs) !== 'recurrent') return 0;
  return tauxGestionApporteurDe(a, apporteurs) * mensuelsDe(a);
}
export const estRecurrent = (a: ActiviteCalcul, apporteurs: readonly Apporteur[]): boolean =>
  (a.gestionMensuelle ? a.gestionMensuelle.mois.some((m) => m.commission !== 0) : partGestionMensuelleDe(a, apporteurs) > 0);

/**
 * Les mois (« AAAA-MM ») où la part gestion « Récurrent » est DUE : du mois de signature au mois en cours, et seulement AVANT le
 * mois de la sortie de gestion du bien (arrêt à la sortie). 🔴 Arno (24/10/2026, 419) — et pendant la DURÉE de la règle : N années =
 * les 12 × N mois qui commencent au mois de signature (signé en mars 2026 pour 1 an : mars 2026 → février 2027) ; `null` / absente :
 * « Indéterminée » (comme avant la 419). PUR.
 */
export function moisDusRecurrent(a: Pick<ActiviteCalcul, 'dateSignature' | 'finGestion'>, aujourdhui: string, dureeAnnees?: number | null): string[] {
  const debut = a.dateSignature.slice(0, 7);
  const finExclue = a.finGestion ? a.finGestion.slice(0, 7) : null;
  const dernier = aujourdhui.slice(0, 7);
  const plafond = dureeAnnees === null || dureeAnnees === undefined ? Infinity : dureeAnnees * 12;
  const sortie: string[] = [];
  let [y, m] = debut.split('-').map(Number);
  for (let mm = debut; mm <= dernier && (finExclue === null || mm < finExclue) && sortie.length < plafond; ) {
    sortie.push(mm);
    m += 1; if (m > 12) { m = 1; y += 1; }
    mm = `${y}-${String(m).padStart(2, '0')}`;
  }
  return sortie;
}

/** 419 — la durée du récurrent de l'apporteur : celle de la règle EN VIGUEUR À LA SIGNATURE (null : indéterminée). */
export const dureeApporteurDe = (a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number | null => regleApporteurDe(a, apporteurs)?.dureeAnnees ?? null;
/** Les mois dus à l'apporteur « Récurrent » pour cette affaire (sortie de gestion, mois en cours, durée de la règle). PUR. */
export const moisDusApporteur = (a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string): string[] =>
  moisDusRecurrent(a, aujourdhui, dureeApporteurDe(a, apporteurs));

/**
 * 🔴 Arno (25/10/2026) — LE DÛ « RÉCURRENT » À L'APPORTEUR, MOIS PAR MOIS (« AAAA-MM » → euros) : le calcul mensuel du bien quand il existe
 * (`gestionMensuelle`), sinon la règle d'avant (le même montant chaque mois dû). Compté dans le mois où il est dû. PUR.
 */
export function recurrentParMois(a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string): Map<string, number> {
  if (a.gestionMensuelle) {
    const fin = aujourdhui.slice(0, 7);
    return new Map(a.gestionMensuelle.mois.filter((m) => m.commission !== 0 && m.mois <= fin).map((m) => [m.mois, m.commission]));
  }
  const p = partGestionMensuelleDe(a, apporteurs);
  return p === 0 ? new Map() : new Map(moisDusApporteur(a, apporteurs, aujourdhui).map((m) => [m, p]));
}
const somme = (m: Map<string, number>, mois?: readonly string[]): number => {
  let t = 0;
  for (const [k, v] of m) if (mois === undefined || mois.includes(k)) t += v;
  return t;
};

/** La part gestion « Récurrent » due sur ces mois, pour ces affaires. PUR. */
export function duRecurrent(lignes: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], mois: readonly string[], aujourdhui: string): number {
  return lignes.reduce((t, a) => t + somme(recurrentParMois(a, apporteurs, aujourdhui), mois), 0);
}

/** Le jour de référence des dus « Récurrent » (le contexte, sinon aujourd'hui). */
const jourDe = (ctx: Pick<ContexteCalcul, 'aujourdhui'>): string => ctx.aujourdhui ?? new Date().toISOString().slice(0, 10);
/** Les affaires « Récurrent » du contexte, ou celles des lignes. */
const recurrentsDe = (ctx: ContexteCalcul, lignes: readonly ActiviteCalcul[]): readonly ActiviteCalcul[] =>
  (ctx.recurrents ?? lignes).filter((a) => estRecurrent(a, ctx.apporteurs));

// ── 419 — LA RÉMUNÉRATION DU COLLÈGUE DE RATTACHEMENT (Arno, 24/10/2026) ────────────────────────────────────────────────

/**
 * Le collègue rémunéré d'une affaire, et sa règle : l'apporteur est EXTERNE, il avait un collègue de rattachement À LA SIGNATURE, et
 * la rémunération en vigueur ce jour-là est « Rémunération » (jamais rétroactif : ni un changement de collègue, ni une nouvelle
 * version ne touchent les dossiers d'avant). null sinon — aucun dossier sans apporteur n'en a. PUR.
 */
export function remunerationCollegueDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): { collegue: { cle: string; libelle: string }; regle: RemunerationCollegue } | null {
  if (a.apporteurId === null) return null;
  const ap = apporteurs.find((x) => x.id === a.apporteurId);
  // 422 — un apporteur passé interne garde, pour les dossiers signés AVANT son passage, son collègue et la rémunération de ce collègue.
  if (ap === undefined || interneADate(ap, a.dateSignature)) return null;
  const regle = remunerationADate(ap, a.dateSignature);
  if (regle === null || !regle.remunere) return null;
  // Le collègue de rattachement À LA SIGNATURE (la même lecture que la colonne « Collègue »).
  const c = collegueADate(ap, a.dateSignature);
  if (c === null) return null;
  return { collegue: { cle: c.collegueId !== null ? `id:${c.collegueId}` : `nom:${c.collegueLibelle.toLowerCase()}`, libelle: c.collegueLibelle }, regle };
}
/** Ce qui est dû au collègue À LA SIGNATURE : CA HT × son taux location + (One shot) son taux gestion × honoraires mensuels × 12. PUR. */
export function commissionCollegueSignatureDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  const r = remunerationCollegueDe(a, apporteurs);
  if (r === null) return 0;
  return caLigne(a) * r.regle.taux + (r.regle.mode === 'one_shot' ? r.regle.tauxGestion * mensuelsDe(a) * 12 : 0);
}
/** Ce qui est dû au collègue CHAQUE MOIS (Récurrent) : son taux gestion × honoraires mensuels ; 0 en One shot. PUR. */
export function commissionCollegueMensuelleDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  // 🔴 25/10/2026 — avec le calcul mensuel du bien, le montant varie chaque mois : `recurrentCollegueParMois`.
  if (a.gestionMensuelle) return 0;
  const r = remunerationCollegueDe(a, apporteurs);
  return r === null || r.regle.mode !== 'recurrent' ? 0 : r.regle.tauxGestion * mensuelsDe(a);
}
/** Les mois dus au collègue « Récurrent » : la même règle que l'apporteur, avec SA durée. PUR. */
export function moisDusCollegue(a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string): string[] {
  const r = remunerationCollegueDe(a, apporteurs);
  return r === null || r.regle.mode !== 'recurrent' ? [] : moisDusRecurrent(a, aujourdhui, r.regle.dureeAnnees);
}
/** 🔴 Arno (25/10/2026) — le dû « Récurrent » au COLLÈGUE, mois par mois : le calcul mensuel du bien, sinon la règle d'avant. PUR. */
export function recurrentCollegueParMois(a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string): Map<string, number> {
  if (a.gestionMensuelle) {
    const fin = aujourdhui.slice(0, 7);
    return new Map(a.gestionMensuelle.mois.filter((m) => m.collegue !== 0 && m.mois <= fin).map((m) => [m.mois, m.collegue]));
  }
  const p = commissionCollegueMensuelleDe(a, apporteurs);
  return p === 0 ? new Map() : new Map(moisDusCollegue(a, apporteurs, aujourdhui).map((m) => [m, p]));
}
/**
 * 🔴 Arno (25/10/2026) — les HONORAIRES DE GESTION PERÇUS d'un dossier « Récurrent », mois par mois : les mois où un dû récurrent
 * (apporteur ou collègue) est calculé, jusqu'au mois en cours — le calcul mensuel du bien (loyer révisé, vacance déduite), sinon les
 * honoraires mensuels du dossier (la règle d'avant). PUR.
 */
export function honorairesGestionParMois(a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string): Map<string, number> {
  if (a.gestionMensuelle) {
    const fin = aujourdhui.slice(0, 7);
    return new Map(a.gestionMensuelle.mois.filter((m) => m.mois <= fin && (m.commission !== 0 || m.collegue !== 0)).map((m) => [m.mois, m.honoraires]));
  }
  const h = mensuelsDe(a);
  if (h === 0) return new Map();
  const mois = new Set([...recurrentParMois(a, apporteurs, aujourdhui).keys(), ...recurrentCollegueParMois(a, apporteurs, aujourdhui).keys()]);
  return new Map([...mois].sort().map((m) => [m, h]));
}

/** Une ligne du cumul de la gestion récurrente : un apporteur, une année (montants au centime : la somme des mois arrondis). */
export interface LigneGestionRecurrente { apporteurId: number; nom: string; honoraires: number; commission: number; collegue: number }
export interface AnneeGestionRecurrente { annee: number; lignes: LigneGestionRecurrente[]; total: { honoraires: number; commission: number; collegue: number } }

/**
 * 🔴 Arno (25/10/2026) — LE CUMUL DE LA GESTION RÉCURRENTE, TOUS BIENS, ANNÉE PAR ANNÉE : honoraires de gestion perçus HT et commissions à
 * reverser HT (apporteur, collègue), par apporteur et au total. Chaque mois compte au centime (le montant affiché du mois), les totaux sont
 * la somme des mois : rien ne se perd à l'addition. Les années les plus récentes d'abord. PUR.
 */
export function gestionRecurrenteParAnnee(recurrents: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], aujourdhui: string): AnneeGestionRecurrente[] {
  const c = (x: number): number => Math.round((x + Number.EPSILON) * 100);
  const parAn = new Map<number, Map<number, { nom: string; h: number; co: number; col: number }>>();
  const ligne = (annee: number, a: ActiviteCalcul) => {
    const an = parAn.get(annee) ?? new Map(); parAn.set(annee, an);
    const id = a.apporteurId as number;
    const ap = apporteurs.find((x) => x.id === id);
    const l = an.get(id) ?? { nom: ap?.nom ?? a.apporteurNom ?? `Apporteur n° ${id}`, h: 0, co: 0, col: 0 }; an.set(id, l);
    return l;
  };
  for (const a of recurrents) {
    if (a.apporteurId === null) continue;
    for (const [m, v] of honorairesGestionParMois(a, apporteurs, aujourdhui)) ligne(Number(m.slice(0, 4)), a).h += c(v);
    for (const [m, v] of recurrentParMois(a, apporteurs, aujourdhui)) ligne(Number(m.slice(0, 4)), a).co += c(v);
    for (const [m, v] of recurrentCollegueParMois(a, apporteurs, aujourdhui)) ligne(Number(m.slice(0, 4)), a).col += c(v);
  }
  return [...parAn.entries()].sort((x, y) => y[0] - x[0]).map(([annee, an]) => {
    const lignes = [...an.entries()].map(([apporteurId, l]) => ({ apporteurId, nom: l.nom, honoraires: l.h / 100, commission: l.co / 100, collegue: l.col / 100 }))
      .sort((x, y) => x.nom.localeCompare(y.nom, 'fr'));
    const t = [...an.values()].reduce((s, l) => ({ h: s.h + l.h, co: s.co + l.co, col: s.col + l.col }), { h: 0, co: 0, col: 0 });
    return { annee, lignes, total: { honoraires: t.h / 100, commission: t.co / 100, collegue: t.col / 100 } };
  });
}

/** Le dû « Récurrent » au collègue sur ces mois, pour ces affaires. PUR. */
export function duCollegueRecurrent(lignes: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], mois: readonly string[], aujourdhui: string): number {
  return lignes.reduce((t, a) => t + somme(recurrentCollegueParMois(a, apporteurs, aujourdhui), mois), 0);
}
/** Une affaire qui fait naître un dû MENSUEL (apporteur ou collègue « Récurrent ») : à lire sur toutes les années. PUR. */
export const aUnDuMensuel = (a: ActiviteCalcul, apporteurs: readonly Apporteur[]): boolean =>
  estRecurrent(a, apporteurs) || (a.gestionMensuelle ? a.gestionMensuelle.mois.some((m) => m.collegue !== 0) : commissionCollegueMensuelleDe(a, apporteurs) > 0);

/** La commission d'apporteur DUE À LA SIGNATURE : part location + part gestion « One shot ». PUR. */
export function commissionApporteurDe(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number {
  return partLocationDe(a, apporteurs) + partGestionSignatureDe(a, apporteurs);
}

/** Le taux de commission appliqué à la ligne (affichage) : celui du bail, sinon celui de l'apporteur à la date ; null sans apporteur. */
export function tauxAffichage(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): number | null {
  if (a.apporteurId === null && a.apporteurNom === null) return null;
  if (a.commissionSaisie !== null && a.apporteurTaux === null && !ligneRemplacee(a, apporteurs)) return caLigne(a) === 0 ? null : a.commissionSaisie / caLigne(a);
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
  // 419 — un INTERNE n'est rattaché à personne : ses affaires sont les siennes (son compte). Un rattachement daté d'AVANT son passage
  // en interne reste celui de l'époque (jamais rétroactif).
  if (interneADate(ap, a.dateSignature)) {
    // 422 — passé interne le J : à partir de J, le rattachement a pris fin (ses dossiers sont les siens).
    const avant = ap.interneDepuis ? null : versionADate(ap.collegues, a.dateSignature);
    if (avant !== null) return { cle: avant.collegueId !== null ? `id:${avant.collegueId}` : `nom:${avant.collegueLibelle.toLowerCase()}`, libelle: avant.collegueLibelle };
    return { cle: `id:${ap.compteId}`, libelle: ap.nom };
  }
  const c = collegueADate(ap, a.dateSignature);
  if (c === null) return { aRattacher: true };
  return { cle: c.collegueId !== null ? `id:${c.collegueId}` : `nom:${c.collegueLibelle.toLowerCase()}`, libelle: c.collegueLibelle };
}

/**
 * 🔴 Arno (24/10/2026) — la colonne « APPORTEURS D'AFFAIRES » de la ligne synthétique, comme celle du fichier (qui y mêle
 * apporteur, collègue et origine) : l'apporteur s'il existe, sinon le collègue (« Collègue directement »), sinon le libellé de
 * l'origine du contact, sinon vide. L'import (`origineDeTexte`) a réparti la colonne G ainsi : un partenaire → l'apporteur (nom
 * de l'annuaire) ; un collègue → `collegueLibelle`, le texte du fichier ; « Internet » → l'origine. PUR.
 */
export function apporteurAffiche(a: ActiviteCalcul, apporteurs: readonly Apporteur[]): { texte: string; source: 'apporteur' | 'collegue' | 'origine' | null } {
  const nom = a.apporteurNom ?? (a.apporteurId === null ? null : apporteurs.find((x) => x.id === a.apporteurId)?.nom ?? null);
  if (nom !== null && nom.trim() !== '') return { texte: nom, source: 'apporteur' };
  if (a.origineContact === 'collegue' && a.collegueLibelle) return { texte: a.collegueLibelle, source: 'collegue' };
  const origine = libelleOrigineContact(a.origineContact, a.origineContactPrecision);
  if (origine !== '') return { texte: origine, source: 'origine' };
  return { texte: '', source: null };
}

/**
 * 🔴 Arno (24/10/2026) — LA NATURE DU BIEN LOUÉ (pastille « BIEN » de la feuille du mois), dérivée des seules données de la ligne,
 * dans cet ordre :
 *   ① « Relocation gestion » : l'origine est « Relocation (portefeuille de gestion) » — elle n'existe qu'avec la case « Relocation »
 *     cochée (`origineApresCases`, refus serveur sinon). ⚠️ Pas `avecGestion` seul : sur les lignes reprises du fichier, ce champ porte la
 *     ventilation « avec gestion » de l'Excel (bien en gestion), pas la case ;
 *   ② « Relocation sans gestion » (ex « Client hors gestion ») : origine « Propriétaire déjà client » ET bien sans gestion ;
 *   ③ origine à renseigner → « À qualifier » (rien n'est deviné) ;
 *   ④ « Nouvelle gestion » / ⑤ « Nouveau sans gestion » selon que le bien est en gestion.
 * « En gestion » = la case « Relocation » OU « Nouveau mandat de gestion signé (prime) » de la ligne (`avecGestion || mandatGestion`,
 * comme `honorairesGestionDuBail`) : c'est la seule source présente sur TOUTES les lignes (la moitié des lignes reprises n'ont pas de
 * bien rattaché, donc pas d'historique de statut). PUR.
 */
/**
 * 🔴 Arno (25/10/2026) — L'ORDRE ET LES LIBELLÉS des 5 statuts (modale, légende, pastilles, compteurs) : Nouvelle gestion, Relocation
 * gestion, Nouveau sans gestion, Relocation sans gestion (ex « Client hors gestion » : même règle), À qualifier. Les valeurs internes (et
 * en base) ne changent pas : les statuts déjà validés gardent leur sens.
 */
export const NATURES_BIEN = ['nouveau_gestion', 'relocation', 'nouveau_sans_gestion', 'client_hors_gestion', 'a_qualifier'] as const;
export type NatureBien = typeof NATURES_BIEN[number];
export const LIBELLE_NATURE_BIEN: Record<NatureBien, string> = {
  nouveau_gestion: 'Nouvelle gestion', relocation: 'Relocation gestion', nouveau_sans_gestion: 'Nouveau sans gestion',
  client_hors_gestion: 'Relocation sans gestion', a_qualifier: 'À qualifier',
};
/**
 * 🔴 Arno (25/10/2026, migration 424) — « STATUT DU BIEN » : ce que dit chaque statut, en français simple (le « i » de la modale). Ce sont
 * les règles du calcul ci-dessous, dans le même ordre.
 */
export const DESCRIPTION_NATURE_BIEN: Record<NatureBien, string> = {
  nouveau_gestion: 'Nouvelle gestion : un nouveau client — ou un propriétaire déjà client qui nous confie ce bien — et le bien est en gestion (ou un nouveau mandat de gestion est signé).',
  relocation: 'Relocation gestion : l’origine du contact est « Relocation (portefeuille de gestion) » — le bien était déjà en gestion chez nous et on l’a reloué.',
  nouveau_sans_gestion: 'Nouveau sans gestion : un nouveau client, et le bien n’est pas en gestion.',
  client_hors_gestion: 'Relocation sans gestion : le propriétaire était déjà client (origine « Propriétaire déjà client ») et ce bien n’est pas en gestion.',
  a_qualifier: 'À qualifier : l’origine du contact n’est pas renseignée. Rien n’est deviné : choisissez le statut, ou renseignez l’origine.',
};

/**
 * 🔴 Arno (25/10/2026, migration 424) — LE STATUT VALIDÉ À LA MAIN l'emporte sur le calcul PARTOUT (pastille de ligne, légende, compteurs,
 * panneau) ; « Revenir au statut calculé » l'efface. Il ne réécrit ni l'origine du contact ni la gestion (aucun effet de bord). PUR.
 */
export function natureBienLoue(a: Pick<ActiviteCalcul, 'origineContact' | 'avecGestion' | 'mandatGestion' | 'natureManuelle'>): { nature: NatureBien; raison: string; manuelle?: { par: string; le: string } } {
  const m = a.natureManuelle;
  if (m !== null && m !== undefined && (NATURES_BIEN as readonly string[]).includes(m.nature)) {
    return { nature: m.nature, raison: `validé par ${m.par} le ${m.le.slice(0, 10).split('-').reverse().join('/')}`, manuelle: { par: m.par, le: m.le } };
  }
  return natureBienCalculee(a);
}

/** Le statut CALCULÉ (les règles ci-dessus) : celui que la modale propose. PUR. */
export function natureBienCalculee(a: Pick<ActiviteCalcul, 'origineContact' | 'avecGestion' | 'mandatGestion'>): { nature: NatureBien; raison: string } {
  const enGestion = a.avecGestion || a.mandatGestion;
  if (a.origineContact === 'relocation') return { nature: 'relocation', raison: 'case « Relocation » cochée (portefeuille de gestion)' };
  if (a.origineContact === 'proprietaire_deja_client' && !enGestion) return { nature: 'client_hors_gestion', raison: 'propriétaire déjà client, bien sans gestion' };
  if (a.origineContact === null || a.origineContact === undefined) return { nature: 'a_qualifier', raison: 'origine du contact à renseigner' };
  if (enGestion) {
    const qui = a.origineContact === 'proprietaire_deja_client' ? 'propriétaire déjà client, nouveau bien confié en gestion' : 'nouveau client';
    return { nature: 'nouveau_gestion', raison: `${qui}, ${a.mandatGestion ? 'nouveau mandat de gestion signé (prime)' : 'bien en gestion'}` };
  }
  return { nature: 'nouveau_sans_gestion', raison: 'nouveau client, bien sans gestion' };
}

export const tauxNegociateurDe =(a: ActiviteCalcul, regles: readonly RegleCommission[]): number => versionADate(regles, a.dateSignature)?.tauxNegociateur ?? 0;

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
  /** Dû aux apporteurs HT : part location + part gestion (« One shot » à la signature ; « Récurrent » ajouté par période). */
  apporteurs: number;
  /** 413 — dont part location, dont part gestion « One shot ». */
  apporteursLocation: number;
  apporteursGestion: number;
  /** CA HT − part location des apporteurs (la formule du fichier). */
  caNet: number;
  /**
   * 🔴 Arno (25/10/2026, accord écrit) — LA BASE DU NÉGOCIATEUR, dossier par dossier : CA HT − TOUTES les commissions versées sauf les
   * récurrentes de gestion (part location de l'apporteur, sa part gestion « One shot », ce qui est dû au collègue à la signature :
   * location + gestion « One shot »). `deductions` : ces commissions ; `baseNegociateur` : Σ (CA − déductions).
   */
  deductions: number;
  baseNegociateur: number;
  /** Σ taux × base du négociateur + primes, AVANT rétrocessions. */
  commissionAvantRetro: number;
  avecGestion: number;
  sansGestion: number;
  ids: (number | string)[];
}

export function totaux(lignes: readonly ActiviteCalcul[], ctx: ContexteCalcul): Totaux {
  const t: Totaux = { nb: 0, nbBaux: 0, nbAvenants: 0, nbGestionSeule: 0, ca: 0, caProprietaire: 0, caLocataire: 0, primes: 0, apporteurs: 0,
    apporteursLocation: 0, apporteursGestion: 0, caNet: 0, deductions: 0, baseNegociateur: 0, commissionAvantRetro: 0, avecGestion: 0, sansGestion: 0, ids: [] };
  for (const a of lignes) {
    const ca = caLigne(a);
    const app = partLocationDe(a, ctx.apporteurs);
    const gestion = partGestionSignatureDe(a, ctx.apporteurs);
    const prime = primeDe(a, ctx.regles);
    t.nb += 1;
    if (a.type === 'bail') t.nbBaux += 1; else if (a.type === 'avenant') t.nbAvenants += 1; else t.nbGestionSeule += 1;
    t.ca += ca; t.caProprietaire += a.honoProprietaireHt; t.caLocataire += a.honoLocataireHt;
    t.primes += prime; t.apporteurs += app + gestion; t.apporteursLocation += app; t.apporteursGestion += gestion; t.caNet += ca - app;
    // 🔴 Arno (25/10/2026, accord écrit) — avant le taux : CA − part location − gestion « One shot » − collègue à la signature (le récurrent
    // de gestion, apporteur ou collègue, n'est PAS retiré). Le reste est inchangé : taux à la date de signature, + prime du dossier.
    const deduit = app + gestion + commissionCollegueSignatureDe(a, ctx.apporteurs);
    t.deductions += deduit; t.baseNegociateur += ca - deduit;
    t.commissionAvantRetro += tauxNegociateurDe(a, ctx.regles) * (ca - deduit) + prime;
    if (a.avecGestion) t.avecGestion += ca; else t.sansGestion += ca;
    t.ids.push(a.id);
  }
  return t;
}

export const variation = (courant: number, precedent: number): number | null => (precedent === 0 ? null : (courant - precedent) / precedent);

const moisDe = (annee: number, m: number): string => `${annee}-${String(m).padStart(2, '0')}`;

// ── A — le mois, comparé au même mois de l'année précédente ─────────────────────────────────────────────────────────

export interface Periode { annee: number; mois: number | null }
/**
 * `apporteursRecurrents` : la part gestion « Récurrent » due sur la période (déjà comprise dans `apporteurs`).
 * 🔴 419 — `collegues` : les commissions dues aux COLLÈGUES pour l'apport de leurs apporteurs (à la signature + récurrent de la
 * période). Une ligne à part du bas de feuille : elle n'entre dans AUCUN total existant (apporteurs, CA net, commission).
 */
export interface TotauxPeriode extends Totaux { retrocessions: number; commission: number; apporteursRecurrents: number; collegues: number;
  /** 🔴 25/10/2026 — dont le récurrent de gestion des collègues dû sur la période (non déduit de la base du négociateur). */
  colleguesRecurrents: number }

/** Les lignes d'une période : l'année entière (`mois` null) ou un mois. */
export function lignesDePeriode(activites: readonly ActiviteCalcul[], p: Periode): ActiviteCalcul[] {
  const prefixe = p.mois === null ? `${p.annee}-` : `${moisDe(p.annee, p.mois)}`;
  return activites.filter((a) => a.dateSignature.startsWith(prefixe));
}

export function totauxPeriode(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: Periode, negociateur?: string | null): TotauxPeriode {
  const t = totaux(lignesDePeriode(activites, p), ctx);
  const mois = p.mois === null ? Array.from({ length: 12 }, (_, i) => moisDe(p.annee, i + 1)) : [moisDe(p.annee, p.mois)];
  const retrocessions = retrocessionsDe(ctx, mois, negociateur);
  // 413 — la part gestion « Récurrent » due sur les mois de la période (affaires de toutes les années, celles du négociateur s'il est donné).
  const recurrents = recurrentsDe(ctx, activites).filter((a) => !negociateur || cleNegociateur(a) === negociateur);
  const apporteursRecurrents = duRecurrent(recurrents, ctx.apporteurs, mois, jourDe(ctx));
  // 419 — le dû aux collègues : à la signature (lignes de la période) + leur récurrent dû sur les mois de la période (toutes années).
  const lignes = lignesDePeriode(activites, p);
  const colleguesRecurrents = duCollegueRecurrent((ctx.recurrents ?? activites).filter((a) => !negociateur || cleNegociateur(a) === negociateur), ctx.apporteurs, mois, jourDe(ctx));
  const collegues = lignes.reduce((s, a) => s + commissionCollegueSignatureDe(a, ctx.apporteurs), 0) + colleguesRecurrents;
  return { ...t, apporteurs: t.apporteurs + apporteursRecurrents, apporteursRecurrents, retrocessions, commission: t.commissionAvantRetro - retrocessions, collegues, colleguesRecurrents };
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
  /** Ce qui reste à l'agence : CA apporté − commissions (🔴 Arno, 24/10/2026 : plus de coût fixe mensuel). */
  net: number;
  /** Ce que coûte l'apporteur (ses commissions) pour 1 € de CA apporté ; null sans CA. */
  coutParEuro: number | null;
  ids: (number | string)[];
}

export function sectionApporteurs(activites: readonly ActiviteCalcul[], ctx: ContexteCalcul, p: Periode, moisEcoules?: readonly string[]): LigneApporteur[] {
  const lignes = lignesDePeriode(activites, p).filter((a) => a.apporteurId !== null || a.apporteurNom !== null);
  const mois = moisEcoules ?? (p.mois === null ? Array.from({ length: 12 }, (_, i) => moisDe(p.annee, i + 1)) : [moisDe(p.annee, p.mois)]);
  const parCle = new Map<string, LigneApporteur>();
  for (const ap of ctx.apporteurs.filter((x) => !x.archive)) {
    parCle.set(`id:${ap.id}`, { apporteurId: ap.id, nom: ap.nom, type: ap.type, nb: 0, ca: 0, commissions: 0, net: 0, coutParEuro: null, ids: [] });
  }
  for (const a of lignes) {
    const cle = a.apporteurId !== null ? `id:${a.apporteurId}` : `nom:${(a.apporteurNom ?? '').toLowerCase()}`;
    const l = parCle.get(cle) ?? { apporteurId: a.apporteurId, nom: a.apporteurNom ?? '—', type: null, nb: 0, ca: 0, commissions: 0, net: 0, coutParEuro: null, ids: [] };
    l.nb += 1; l.ca += caLigne(a); l.commissions += commissionApporteurDe(a, ctx.apporteurs); l.ids.push(a.id);
    parCle.set(cle, l);
  }
  // 413 — la part gestion « Récurrent » due sur les mois de la période, à l'apporteur de chaque affaire (toutes années).
  for (const a of recurrentsDe(ctx, activites)) {
    const du = duRecurrent([a], ctx.apporteurs, mois, jourDe(ctx));
    if (du === 0) continue;
    const cle = `id:${a.apporteurId}`;
    const l = parCle.get(cle) ?? { apporteurId: a.apporteurId, nom: a.apporteurNom ?? '—', type: null, nb: 0, ca: 0, commissions: 0, net: 0, coutParEuro: null, ids: [] };
    l.commissions += du;
    parCle.set(cle, l);
  }
  return [...parCle.values()]
    .map((l) => ({ ...l, net: l.ca - l.commissions, coutParEuro: l.ca === 0 ? null : l.commissions / l.ca }))
    .filter((l) => l.nb > 0 || l.commissions > 0)
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
export interface ActiviteLue extends ActiviteCalcul {
  lotId: number | null; bailId: number | null; source: string;
  /** 🔴 Arno (24/10/2026) — les locataires et les biens de la ligne, lus dans l'annuaire (raccourcis du panneau déplié). */
  locataires?: { id: number; libelle: string }[];
  lots?: { id: number; libelle: string }[];
  /** 🔴 Arno (24/10/2026, Q1) — une ligne REPRISE rattachée à un bail affiche les noms de l'annuaire ; le texte du fichier reste ici. */
  libelleOrigine?: { proprietaire: string; locataire: string };
}

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
  /** 411 — l'origine « Personnalisé » peut-elle être choisie ? */
  personnalisable?: boolean;
  /** 415 — l'origine « Propriétaire déjà client » peut-elle être choisie ? */
  dejaClient?: boolean;
  /** 424 — le « Statut du bien » peut-il être validé à la main ? */
  statutBienManuel?: boolean;
  /** Arno (23/10/2026, historique 2019 → 2025) — chaque année d'activité, sans filtre : baux, CA, CA net, commission (droit). */
  historique?: AnneeHistorique[];
  /** 408 — les écarts expliqués avec le fichier, de l'année (notes de la feuille du mois). */
  ecartsFichier?: EcartFichier[];
  /** 413 — les affaires « Récurrent » de toutes les années : leur part gestion est due chaque mois en gestion. */
  recurrents?: ActiviteLue[];
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

/**
 * `nb` : les affaires (avenants compris) ; `avenants` : dont avenants ; `ca` : honoraires HT ; `commission` : dû à l'apporteur HT —
 * 413 : dont `location`, dont `gestion` (« One shot », à la signature), dont `recurrente` (« Récurrent », mois par mois).
 */
export interface CumulAffaires { nb: number; avenants: number; ca: number; commission: number; location: number; gestion: number; recurrente: number; ids: (number | string)[] }
const cumulVide = (): CumulAffaires => ({ nb: 0, avenants: 0, ca: 0, commission: 0, location: 0, gestion: 0, recurrente: 0, ids: [] });
const ajouter = (c: CumulAffaires, a: ActiviteCalcul, apporteurs: readonly Apporteur[]): void => {
  const location = partLocationDe(a, apporteurs);
  const gestion = partGestionSignatureDe(a, apporteurs);
  c.nb += 1; c.ca += caLigne(a); c.commission += location + gestion; c.location += location; c.gestion += gestion; c.ids.push(a.id);
  if (a.type === 'avenant') c.avenants += 1;
};
/** 413 — ajouter un dû « Récurrent » (ni affaire, ni CA : seulement le dû). */
const ajouterDu = (c: CumulAffaires, du: number): void => { c.commission += du; c.recurrente += du; };

export interface ApporteurDuMois extends CumulAffaires {
  apporteurId: number | null; nom: string; aRattacher: boolean;
  /**
   * 🔴 Arno (25/10/2026) — `interne` : un apporteur lié à un compte, ou un collègue « directement » (l'origine du contact) ; `externe` :
   * un apporteur de l'annuaire sans compte ; `non_nomme` : une commission saisie sans apporteur nommé ; `null` : un nom repris du
   * fichier, hors annuaire. `meilleur` : le plus fort CA apporté du mois (les ex aequo au centime le sont tous).
   */
  sorte?: 'interne' | 'externe' | 'non_nomme' | null; meilleur?: boolean;
}
/**
 * 🔴 Arno (25/10/2026) — un COLLÈGUE du mois : `via` (les affaires de SES apporteurs externes), `direct` (« Collègue directement », ou un
 * apporteur interne lié à son compte) ; les champs de `CumulAffaires` portent le TOTAL (via + direct). `meilleur` : le plus fort CA total.
 */
export interface CollegueDuMois extends CumulAffaires { cle: string; libelle: string; via?: CumulAffaires; direct?: CumulAffaires; meilleur?: boolean }

/**
 * Les apporteurs d'un ensemble de lignes (nombre d'affaires, CA apporté, honoraires d'apporteur), et pour chaque COLLÈGUE le
 * cumul des affaires apportées par SES apporteurs (collègue à la date de chaque affaire ; « à rattacher » à part) ET de ses apports
 * en direct (🔴 Arno, 25/10/2026 : « Collègue directement », apporteur interne lié à son compte). PUR.
 */
export function apporteursEtCollegues(lignes: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[],
  /** 413 — les affaires « Récurrent » (toutes années) et les mois : leur part gestion due ces mois-là s'ajoute au dû. */
  recurrent?: { lignes: readonly ActiviteCalcul[]; mois: readonly string[]; aujourdhui: string }):
  { apporteurs: ApporteurDuMois[]; collegues: CollegueDuMois[]; sans: CumulAffaires; total: CumulAffaires } {
  const parApp = new Map<string, ApporteurDuMois>();
  const parCol = new Map<string, CollegueDuMois>();
  const sans = cumulVide();
  const total = cumulVide();
  /** 🔴 Arno (25/10/2026) — un collègue « directement » (origine du contact, sans apporteur) : un apporteur INTERNE du mois. */
  const collegueDirect = (a: ActiviteCalcul): boolean => a.apporteurId === null && a.apporteurNom === null && a.origineContact === 'collegue' && !!a.collegueLibelle;
  const nonNomme = (a: ActiviteCalcul): boolean => a.apporteurId === null && a.apporteurNom === null && !collegueDirect(a) && (a.commissionSaisie ?? 0) !== 0;
  const collegue = (cle: string, libelle: string): CollegueDuMois => {
    const l = parCol.get(cle) ?? { ...cumulVide(), cle, libelle, via: cumulVide(), direct: cumulVide() };
    parCol.set(cle, l);
    return l;
  };
  type Part = { ligneC: CollegueDuMois; part: 'via' | 'direct' } | null;
  const lignesDe = (a: ActiviteCalcul): { ligneA: ApporteurDuMois; c: Part } => {
    const ap = a.apporteurId === null ? undefined : apporteurs.find((x) => x.id === a.apporteurId);
    if (collegueDirect(a) || nonNomme(a)) {
      const direct = collegueDirect(a);
      const cleCol = a.collegueId !== null && a.collegueId !== undefined ? `id:${a.collegueId}` : `nom:${(a.collegueLibelle ?? '').toLowerCase()}`;
      const cleD = direct ? `collegue:${cleCol}` : 'non-nomme';
      const ligneD = parApp.get(cleD) ?? { ...cumulVide(), apporteurId: null, nom: direct ? String(a.collegueLibelle) : 'Apporteur non nommé', aRattacher: false, sorte: direct ? 'interne' as const : 'non_nomme' as const };
      parApp.set(cleD, ligneD);
      // 🔴 Arno (25/10/2026) — le collègue « directement » : son apport EN DIRECT, cumulé avec celui de ses apporteurs.
      return { ligneA: ligneD, c: direct ? { ligneC: collegue(cleCol, String(a.collegueLibelle)), part: 'direct' } : null };
    }
    const cleA = a.apporteurId !== null ? `id:${a.apporteurId}` : `nom:${(a.apporteurNom ?? '').toLowerCase()}`;
    const ligneA = parApp.get(cleA) ?? { ...cumulVide(), apporteurId: a.apporteurId, nom: ap?.nom ?? a.apporteurNom ?? '—', aRattacher: ap !== undefined && ap.collegues !== undefined && ap.collegues.length === 0,
      sorte: ap === undefined ? null : interneADate(ap, a.dateSignature) ? 'interne' as const : 'externe' as const };
    parApp.set(cleA, ligneA);
    const col = collegueDeLigne({ ...a, origineContact: 'apporteur' }, apporteurs);
    if (col === null) return { ligneA, c: null };
    if ('aRattacher' in col) return { ligneA, c: { ligneC: collegue('a-rattacher', 'À rattacher'), part: 'via' } };
    // 🔴 Arno (25/10/2026) — un apporteur INTERNE lié au compte du collègue : son apport EN DIRECT ; un externe : VIA ses apporteurs.
    const direct = ap !== undefined && interneADate(ap, a.dateSignature) && col.cle === `id:${ap.compteId}`;
    return { ligneA, c: { ligneC: collegue(col.cle, col.libelle), part: direct ? 'direct' : 'via' } };
  };
  for (const a of lignes) {
    ajouter(total, a, apporteurs);
    if (a.apporteurId === null && a.apporteurNom === null && !collegueDirect(a) && !nonNomme(a)) { ajouter(sans, a, apporteurs); continue; }
    const { ligneA, c } = lignesDe(a);
    ajouter(ligneA, a, apporteurs);
    if (c !== null) { ajouter(c.ligneC, a, apporteurs); ajouter(c.ligneC[c.part] as CumulAffaires, a, apporteurs); }
  }
  for (const a of recurrent?.lignes ?? []) {
    const du = duRecurrent([a], apporteurs, recurrent!.mois, recurrent!.aujourdhui);
    if (du === 0) continue;
    const { ligneA, c } = lignesDe(a);
    ajouterDu(ligneA, du);
    if (c !== null) { ajouterDu(c.ligneC, du); ajouterDu(c.ligneC[c.part] as CumulAffaires, du); }
  }
  const tri = <T extends { ca: number; nom?: string; libelle?: string }>(x: T[]): T[] => x.sort((p, q) => q.ca - p.ca || String(p.nom ?? p.libelle).localeCompare(String(q.nom ?? q.libelle)));
  const liste = tri([...parApp.values()]);
  // Le MEILLEUR apporteur : le plus fort CA apporté (au centime) ; les ex aequo le sont tous. Une commission « non nommée » n'en est pas un.
  const nommes = liste.filter((x) => x.sorte !== 'non_nomme');
  const haut = nommes.length === 0 ? 0 : auCentime(nommes[0].ca);
  for (const x of liste) x.meilleur = x.sorte !== 'non_nomme' && haut > 0 && auCentime(x.ca) === haut;
  total.commission = liste.reduce((s2, x) => s2 + x.commission, 0) + sans.commission;
  // Le MEILLEUR collègue : le plus fort CA total (via + direct, au centime) ; « À rattacher » n'en est pas un.
  const collegues = tri([...parCol.values()]);
  const vrais = collegues.filter((x) => x.cle !== 'a-rattacher');
  const hautC = vrais.length === 0 ? 0 : auCentime(vrais[0].ca);
  for (const x of collegues) x.meilleur = x.cle !== 'a-rattacher' && hautC > 0 && auCentime(x.ca) === hautC;
  return { apporteurs: liste, collegues, sans, total };
}

/**
 * Le cumul d'UN apporteur (fiche de l'annuaire) : le TOTAL depuis le début (Arno, 23/10/2026), puis par année et par mois — les
 * mêmes lignes et les mêmes règles que le Suivi (lignes reprises du fichier comprises, rattachées ou non à un bail). PUR.
 */
export function cumulApporteur(activites: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], apporteurId: number, aujourdhui?: string):
  { total: CumulAffaires & { collegue: number }; parAnnee: (CumulAffaires & { annee: number; collegue: number; gestionRecurrente: { honoraires: number; commission: number } })[]; parMois: (CumulAffaires & { mois: string })[] } {
  const siennes = activites.filter((a) => a.apporteurId === apporteurId);
  const total = cumulVide();
  for (const a of siennes) ajouter(total, a, apporteurs);
  const an = new Map<number, CumulAffaires & { annee: number }>();
  const mo = new Map<string, CumulAffaires & { mois: string }>();
  const annee = (y: number) => { const l = an.get(y) ?? { ...cumulVide(), annee: y }; an.set(y, l); return l; };
  const duMois = (m: string) => { const l = mo.get(m) ?? { ...cumulVide(), mois: m }; mo.set(m, l); return l; };
  for (const a of siennes) {
    ajouter(annee(Number(a.dateSignature.slice(0, 4))), a, apporteurs); ajouter(duMois(a.dateSignature.slice(0, 7)), a, apporteurs);
  }
  // 413 — la part gestion « Récurrent », due mois par mois jusqu'au mois en cours (ou jusqu'à la sortie de gestion).
  for (const a of siennes) {
    for (const [m, p] of recurrentParMois(a, apporteurs, aujourdhui ?? new Date().toISOString().slice(0, 10))) {
      ajouterDu(total, p); ajouterDu(annee(Number(m.slice(0, 4))), p); ajouterDu(duMois(m), p);
    }
  }
  // 🔴 Arno (24/10/2026) — le DÛ À L'APPORTEUR d'une ANNÉE = la somme des montants affichés de ses dossiers (`contributionsAnnees`) : la
  // ligne d'année et les dossiers dépliés dessous tombent juste au centime. Le total « Depuis le début » reste la somme brute (= le Suivi).
  const centAn = new Map<number, number>();
  for (const a of siennes) for (const [y, c] of contributionsAnnees(a, apporteurs, aujourdhui ?? new Date().toISOString().slice(0, 10))) {
    annee(y); centAn.set(y, (centAn.get(y) ?? 0) + c);
  }
  for (const [y, c] of centAn) annee(y).commission = c / 100;
  // 🔴 Arno (24/10/2026) — le DÛ AU COLLÈGUE (signature + récurrent, mois par mois) : le net agence = honoraires − apporteur − collègue,
  // le même que la carte de l'annuaire (`totauxApporteurs`).
  const jour = aujourdhui ?? new Date().toISOString().slice(0, 10);
  const colAn = new Map<number, number>();
  let colTotal = 0;
  for (const a of siennes) {
    const sig = commissionCollegueSignatureDe(a, apporteurs);
    const y = Number(a.dateSignature.slice(0, 4));
    colAn.set(y, (colAn.get(y) ?? 0) + sig); colTotal += sig;
    for (const [mois, m] of recurrentCollegueParMois(a, apporteurs, jour)) { const y2 = Number(mois.slice(0, 4)); annee(y2); colAn.set(y2, (colAn.get(y2) ?? 0) + m); colTotal += m; }
  }
  // 🔴 Arno (25/10/2026) — par année : « Honoraires de gestion perçus HT » et « Commission gestion due HT » de ses dossiers « Récurrent »
  // (le calcul mensuel du bien quand il existe), chacun la somme de ses mois au centime.
  const ges = new Map(gestionRecurrenteParAnnee(siennes.filter((a) => estRecurrent(a, apporteurs)), apporteurs, jour)
    .map((x) => [x.annee, { honoraires: x.total.honoraires, commission: x.total.commission }]));
  for (const y of ges.keys()) annee(y);
  return { total: { ...total, collegue: colTotal }, parAnnee: [...an.values()].map((l) => ({ ...l, collegue: colAn.get(l.annee) ?? 0,
      gestionRecurrente: ges.get(l.annee) ?? { honoraires: 0, commission: 0 } })).sort((x, y) => y.annee - x.annee),
    parMois: [...mo.values()].sort((x, y) => y.mois.localeCompare(x.mois)) };
}

/**
 * 🔴 Arno (24/10/2026) — ce qu'UN dossier apporte au dû de l'apporteur UNE année (brut, sans arrondi) : l'année de signature porte la part
 * location et la part gestion « One shot » ; chaque année porte la part « Récurrent » de ses mois dus. La somme sur les dossiers = le dû
 * de la ligne de l'année du Cumul (`cumulApporteur`). PUR.
 */
export function dontAnneeBrut(a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string, annee: number): number {
  if (a.apporteurId === null) return 0;
  const signature = Number(a.dateSignature.slice(0, 4)) === annee ? partLocationDe(a, apporteurs) + partGestionSignatureDe(a, apporteurs) : 0;
  let rec = 0;
  for (const [m, p] of recurrentParMois(a, apporteurs, aujourdhui)) if (Number(m.slice(0, 4)) === annee) rec += p;
  return signature + rec;
}

/**
 * 🔴 Arno (24/10/2026) — LE DÛ À L'APPORTEUR AFFICHÉ d'un dossier, EN CENTIMES : la part location et la part gestion (« One shot » à la
 * signature, « Récurrent » sur ses mois dus jusqu'au jour), chacune arrondie au centime — exactement le dû du bloc du dossier. PUR.
 */
export function duAfficheApporteurCentimes(a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string): number {
  if (a.apporteurId === null) return 0;
  const c = (x: number): number => Math.round((x + Number.EPSILON) * 100);
  // « One shot » : la part gestion due à la signature ; « Récurrent » : ses mois dus (calcul mensuel du bien, ou la règle d'avant).
  const gestion = modeApporteurDe(a, apporteurs) === 'one_shot' ? partGestionSignatureDe(a, apporteurs) : somme(recurrentParMois(a, apporteurs, aujourdhui));
  return c(partLocationDe(a, apporteurs)) + c(gestion);
}

/**
 * 🔴 Arno (24/10/2026) — CE QU'UN DOSSIER APPORTE À CHAQUE ANNÉE du Cumul, en centimes. Un « One shot » (ou un récurrent dont tous les
 * mois dus tombent dans l'année de signature) : TOUT son dû affiché, dans son année. Un récurrent ÉTALÉ sur plusieurs années : son dû
 * affiché réparti au centime entre ses années (plus forts restes) — la somme de ses parts = son dû affiché, exactement. La ligne d'année
 * du Cumul = la somme de ces parts : elle tombe juste avec les dossiers dépliés dessous. PUR.
 */
export function contributionsAnnees(a: ActiviteCalcul, apporteurs: readonly Apporteur[], aujourdhui: string): Map<number, number> {
  const total = duAfficheApporteurCentimes(a, apporteurs, aujourdhui);
  const signature = Number(a.dateSignature.slice(0, 4));
  const annees = new Set<number>([signature]);
  for (const m of recurrentParMois(a, apporteurs, aujourdhui).keys()) annees.add(Number(m.slice(0, 4)));
  if (annees.size <= 1) return new Map([[signature, total]]);
  const parts = repartirAuCentime([...annees].map((y) => ({ id: y, brut: dontAnneeBrut(a, apporteurs, aujourdhui, y) })), total);
  return new Map([...annees].sort((x, y) => x - y).map((y) => [y, parts.get(y) ?? 0]));
}

/**
 * Les « dont <année> » AU CENTIME des dossiers d'une année : chacun arrondi par défaut, puis les centimes qui manquent pour atteindre la
 * ligne de l'année (arrondie au centime) donnés aux plus forts restes — la somme des « dont » affichés = la ligne de l'année, EXACTEMENT,
 * et chaque « dont » reste à moins d'un centime de sa valeur brute. Renvoie des centimes. PUR.
 */
export function repartirAuCentime(bruts: readonly { id: number | string; brut: number }[], cibleCentimes: number): Map<number | string, number> {
  const base = bruts.map((x) => { const c = x.brut * 100; const f = Math.floor(c + 1e-7); return { id: x.id, c: f, reste: c - f }; });
  let manque = cibleCentimes - base.reduce((s, x) => s + x.c, 0);
  const ordre = [...base].sort((x, y) => y.reste - x.reste || String(x.id).localeCompare(String(y.id)));
  for (let i = 0; manque > 0 && ordre.length > 0; i = (i + 1) % ordre.length, manque -= 1) ordre[i].c += 1;
  for (let i = ordre.length - 1; manque < 0 && ordre.length > 0; i = (i - 1 + ordre.length) % ordre.length, manque += 1) ordre[i].c -= 1;
  return new Map(base.map((x) => [x.id, x.c]));
}

/** 419 — `collegue` : le dû au COLLÈGUE de rattachement HT (signature + récurrent jusqu'au mois en cours) ; à part du dû à l'apporteur. */
export type TotalApporteur = Omit<CumulAffaires, 'ids'> & { collegue: number;
  /** 🔴 Arno (24/10/2026) — les dossiers calculés à d'autres conditions que celles en vigueur (posé par la route, `autresConditions`). */
  autres?: { sorte: 'anterieure' | 'import'; nb: number; libelle: string }[] };

/** Les totaux de CHAQUE apporteur depuis le début (liste de l'annuaire : dossiers, honoraires HT, dû HT, dû au collègue HT). PUR. */
export function totauxApporteurs(activites: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], aujourdhui?: string): Record<number, TotalApporteur> {
  const par = new Map<number, CumulAffaires & { collegue: number }>();
  const jour = aujourdhui ?? new Date().toISOString().slice(0, 10);
  for (const a of activites) {
    if (a.apporteurId === null) continue;
    const c = par.get(a.apporteurId) ?? { ...cumulVide(), collegue: 0 };
    ajouter(c, a, apporteurs);
    // 413 — la part gestion « Récurrent » due jusqu'au mois en cours (419 : pendant la durée de la règle).
    const rec = somme(recurrentParMois(a, apporteurs, jour));
    if (rec !== 0) ajouterDu(c, rec);
    c.collegue += commissionCollegueSignatureDe(a, apporteurs) + somme(recurrentCollegueParMois(a, apporteurs, jour));
    par.set(a.apporteurId, c);
  }
  return Object.fromEntries([...par].map(([id, c]) => [id, { nb: c.nb, avenants: c.avenants, ca: c.ca, commission: c.commission, location: c.location, gestion: c.gestion, recurrente: c.recurrente, collegue: c.collegue }]));
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

/**
 * 🔴 Arno (25/10/2026) — LE PORTEFEUILLE DE GESTION « DEPUIS LE 1ER JANVIER » : les entrées et les sorties de gestion du 1er janvier au
 * mois affiché (« AAAA-MM »), avec la MÊME source et le MÊME calcul que la ligne du mois (`gestionDuMois`) : / mois = la SOMME des
 * honoraires de gestion mensuels de chaque entrée (ou sortie) — chaque gain mensuel compte UNE fois (pas d'effet boule de neige :
 * janvier +150, février +100 → 250 / mois en février, pas 400) ; / an = × 12. Les biens sans loyer de départ ne sont pas comptés
 * (`sansLoyer`). PUR.
 */
export interface MouvementGestion { lotId: number | null; libelle: string; mois: string; mensuel: number | null }
export interface GestionDepuisJanvier {
  entrees: { nb: number; mensuel: number; annuel: number; biens: MouvementGestion[] };
  sorties: { nb: number; mensuel: number; annuel: number; biens: MouvementGestion[] };
  solde: { mensuel: number; annuel: number }; sansLoyer: number;
}
export function gestionDepuisJanvier(lignes: readonly LigneGestion[], mois: string): GestionDepuisJanvier {
  const annee = mois.slice(0, 4);
  const moisDeLAnnee = Array.from({ length: Number(mois.slice(5, 7)) }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`);
  const parMois = moisDeLAnnee.map((m) => gestionDuMois(lignes, m));
  const vers = (l: LigneGestion): MouvementGestion => ({ lotId: l.lotId, libelle: l.libelle, mois: l.effetLe.slice(0, 7), mensuel: honorairesGestionMensuels(l) });
  const entrees = parMois.flatMap((g) => g.nouvelles).map(vers);
  const sorties = parMois.flatMap((g) => g.perdues).map(vers);
  const gagne = parMois.reduce((s, g) => s + g.gagneMensuel, 0);
  const perdu = parMois.reduce((s, g) => s + g.perduMensuel, 0);
  return {
    entrees: { nb: entrees.length, mensuel: gagne, annuel: gagne * 12, biens: entrees },
    sorties: { nb: sorties.length, mensuel: perdu, annuel: perdu * 12, biens: sorties },
    solde: { mensuel: gagne - perdu, annuel: (gagne - perdu) * 12 },
    sansLoyer: parMois.reduce((s, g) => s + g.sansLoyer, 0),
  };
}

// ── 🔴 Arno (25/10/2026) — « RÉSUMÉ DU MOIS » : LE BAS DE FEUILLE PAR FAMILLES ─────────────────────────────────────────────────────────

/**
 * Le bas de feuille du Suivi du mois, rangé en 5 familles (aucune règle de calcul ne change ; seul le CA HT NET retire aussi les
 * commissions des collègues — voulu par Arno, il remplace l'ancien « CA HT − apporteurs ») :
 *   ① le résultat : CA HT − honoraires d'apporteurs − commissions collègues = CA HT net (cascade, au centime) ;
 *   ② le CA par STATUT DU BIEN (le statut validé à la main l'emporte), dans l'ordre des 5 statuts — total = CA HT ;
 *   ③ avec / sans gestion — total = CA HT ;
 *   ④ le portefeuille de gestion : gagnés, perdus, solde (mensuel et annuel) ;
 *   ⑤ les négociateurs (droit « Voir les commissions ») : variable HT dû, primes, rétrocessions, base de calcul. PUR.
 */
export interface ResumeDuMois {
  resultat: { ca: number; apporteurs: number; collegues: number; caNet: number };
  parStatut: { nature: NatureBien; nb: number; ca: number; part: number | null; ids: (number | string)[] }[];
  gestion: { avec: { nb: number; ca: number; part: number | null }; sans: { nb: number; ca: number; part: number | null } };
  portefeuille: { gagnes: { nb: number; mensuel: number; annuel: number }; perdus: { nb: number; mensuel: number; annuel: number }; solde: { mensuel: number; annuel: number }; sansLoyer: number };
  negociateurs: CascadeNegociateur[];
  /** Les primes (visibles de tous, comme avant) et les rétrocessions (droit) de TOUS les négociateurs du mois. */
  primes: number; retrocessions: number;
}

export function resumeDuMois(t: TotauxPeriode, lignesDuMois: readonly ActiviteCalcul[], g: GestionDuMois, negos: readonly LigneNegociateur[], ctx?: ContexteCalcul): ResumeDuMois {
  const part = (x: number): number | null => (t.ca === 0 ? null : x / t.ca);
  const parStatut = NATURES_BIEN.map((nature) => {
    const siens = lignesDuMois.filter((a) => natureBienLoue(a).nature === nature);
    const ca = siens.reduce((s, a) => s + caLigne(a), 0);
    return { nature, nb: siens.length, ca, part: part(ca), ids: siens.map((a) => a.id) };
  });
  const avec = lignesDuMois.filter((a) => a.avecGestion);
  const sans = lignesDuMois.filter((a) => !a.avecGestion);
  return {
    // La cascade se lit au centime : le CA net est celui des trois montants AFFICHÉS (chacun au centime), l'égalité tombe juste.
    resultat: { ca: t.ca, apporteurs: t.apporteurs, collegues: t.collegues,
      caNet: Math.round((auCentime(t.ca) - auCentime(t.apporteurs) - auCentime(t.collegues)) * 100) / 100 },
    parStatut,
    gestion: { avec: { nb: avec.length, ca: t.avecGestion, part: part(t.avecGestion) }, sans: { nb: sans.length, ca: t.sansGestion, part: part(t.sansGestion) } },
    portefeuille: {
      gagnes: { nb: g.nouvelles.length, mensuel: g.gagneMensuel, annuel: g.gagneMensuel * 12 },
      perdus: { nb: g.perdues.length, mensuel: g.perduMensuel, annuel: g.perduMensuel * 12 },
      solde: { mensuel: g.balanceMensuelle, annuel: g.balanceAnnuelle }, sansLoyer: g.sansLoyer,
    },
    negociateurs: ctx === undefined ? [] : negos.map((n) => cascadeNegociateur(n, lignesDuMois, ctx)),
    primes: t.primes, retrocessions: t.retrocessions,
  };
}

// ── 🔴 Arno (25/10/2026) — LE VARIABLE DU NÉGOCIATEUR, EN CASCADE ───────────────────────────────────────────────────────────────────────

/** Un dossier du négociateur : ce qui entre dans son variable (les composants des « i » de la cascade). */
export interface DossierCascade {
  id: number | string; libelle: string; ca: number;
  apporteur: string | null; partLocation: number; gestionOneShot: number; collegue: string | null; collegueSignature: number;
  deductions: number; base: number; taux: number; resultat: number; prime: number;
}
/**
 * La cascade d'UN négociateur sur le mois (ses seuls dossiers) : CA HT − commissions déduites (hors récurrent de gestion) = CA HT net de
 * commissions ; × taux (lu dossier par dossier à la date de signature) = résultat commercial ; + primes ; − rétrocessions = variable HT dû.
 * Les montants AFFICHÉS se tiennent au centime : CA net = CA − déductions (affichés) ; résultat = variable − primes + rétrocessions
 * (affichés) ; le variable est celui du calcul (`totauxPeriode`), le même partout. `recurrents` : les commissions récurrentes de gestion
 * dues ce mois (apporteurs et collègues), NON déduites — dites sous la cascade. PUR.
 */
export interface CascadeNegociateur {
  cle: string; libelle: string; dossiers: DossierCascade[];
  ca: number; deductions: number; net: number; taux: number | null; resultatCalcule: number; resultat: number; primes: number;
  retrocessions: number; retroDetail: { libelle: string; montant: number }[]; variable: number; recurrents: number;
}
export function cascadeNegociateur(n: LigneNegociateur, lignesDuMois: readonly ActiviteCalcul[], ctx: ContexteCalcul): CascadeNegociateur {
  const siens = lignesDuMois.filter((a) => cleNegociateur(a) === n.cle);
  const dossiers: DossierCascade[] = siens.map((a) => {
    const ca = caLigne(a);
    const partLocation = partLocationDe(a, ctx.apporteurs);
    const gestionOneShot = partGestionSignatureDe(a, ctx.apporteurs);
    const collegueSignature = commissionCollegueSignatureDe(a, ctx.apporteurs);
    const deductions = partLocation + gestionOneShot + collegueSignature;
    const taux = tauxNegociateurDe(a, ctx.regles);
    const apporteur = a.apporteurId === null && a.apporteurNom === null ? null : (a.apporteurNom ?? ctx.apporteurs.find((x) => x.id === a.apporteurId)?.nom ?? null);
    return { id: a.id, libelle: [a.libelleProprietaire, a.libelleLocataire].filter((x) => x).join(' / ') || `Dossier ${a.id}`, ca, apporteur, partLocation, gestionOneShot,
      collegue: remunerationCollegueDe(a, ctx.apporteurs)?.collegue.libelle ?? null, collegueSignature, deductions, base: ca - deductions, taux,
      resultat: taux * (ca - deductions), prime: primeDe(a, ctx.regles) };
  });
  const t = n.totaux;
  const cent = (x: number): number => Math.round(x * 100) / 100;
  const ca = auCentime(t.ca);
  const deductions = auCentime(t.deductions);
  const primes = auCentime(t.primes);
  const retrocessions = auCentime(t.retrocessions);
  const variable = auCentime(t.commission);
  const taux = [...new Set(dossiers.map((d) => d.taux))];
  return {
    cle: n.cle, libelle: n.libelle, dossiers, ca, deductions, net: cent(ca - deductions), taux: taux.length === 1 ? taux[0] : null,
    resultatCalcule: t.commissionAvantRetro - t.primes, resultat: cent(variable - primes + retrocessions), primes, retrocessions,
    retroDetail: ctx.retrocessions.filter((r) => r.mois.slice(0, 7) === n.mois && cleNegociateur(r) === n.cle).map((r) => ({ libelle: r.libelle, montant: r.montant })),
    variable, recurrents: t.apporteursRecurrents + t.colleguesRecurrents,
  };
}

// ── 🔴 Arno (24/10/2026) — L'EFFET D'UN RÉGLAGE, EN DIRECT, ET LA CASCADE DES HONORAIRES ─────────────────────────────────────

/** Ce que rapporte et coûte UN dossier : honoraires HT, dû à l'apporteur HT et dû au collègue HT (récurrents dus jusqu'au jour). */
export interface DuDossier { id: number | string; dateSignature: string; libelle: string; ca: number; apporteur: number; collegue: number; net: number }

/** Le dû de chaque dossier (les mêmes règles que les totaux de l'annuaire). Net agence = honoraires − apporteur − collègue. PUR. */
export function dusParDossier(dossiers: readonly ActiviteCalcul[], apporteurs: readonly Apporteur[], aujourdhui: string): DuDossier[] {
  return dossiers.filter((d) => d.apporteurId !== null).map((d) => {
    const t = totauxApporteurs([d], apporteurs, aujourdhui)[d.apporteurId as number];
    return { id: d.id, dateSignature: d.dateSignature, libelle: [d.libelleProprietaire, d.libelleLocataire].filter(Boolean).join(' / '), ca: t.ca,
      apporteur: t.commission, collegue: t.collegue, net: t.ca - t.commission - t.collegue };
  });
}

/** La cascade d'un ensemble : honoraires HT − dû à l'apporteur − dû au collègue = net agence HT. PUR. */
export function cascade(x: { ca: number; commission: number; collegue?: number }): { ca: number; apporteur: number; collegue: number; net: number } {
  const collegue = x.collegue ?? 0;
  return { ca: x.ca, apporteur: x.commission, collegue, net: x.ca - x.commission - collegue };
}

export interface EffetReglage {
  total: number; concernes: number; changes: number; depuis: string; toujours: boolean;
  /** Concernés dont le dû NE BOUGE PAS : un taux / un montant SAISI sur le dossier (les lignes reprises du fichier) l'emporte. */
  figes: number;
  avantApporteur: number; apresApporteur: number; avantCollegue: number; apresCollegue: number;
}
const NOUVELLE = Number.MAX_SAFE_INTEGER;

/**
 * « Effet de ce réglage » (formulaire « Nouveau taux », sans rien enregistrer) : la nouvelle version de la règle de l'apporteur et / ou
 * de la rémunération de son collègue, ajoutée APRÈS les versions existantes (une « depuis toujours » est datée du jour, comme au
 * serveur). Dossiers concernés : ceux dont la version en vigueur devient la nouvelle ; changés : ceux dont un dû bouge ; dû avant →
 * après sur TOUS ses dossiers. PUR.
 */
export function effetReglage(o: { dossiers: readonly ActiviteCalcul[]; apporteurs: readonly Apporteur[]; apporteurId: number; aujourdhui: string;
  bareme?: BaremeApporteur | null; remuneration?: RemunerationCollegue | null }): EffetReglage {
  const ap = o.apporteurs.find((x) => x.id === o.apporteurId);
  const siens = o.dossiers.filter((d) => d.apporteurId === o.apporteurId);
  const date = (v: { depuis: string; toujours?: boolean }) => (v.toujours === true ? o.aujourdhui : v.depuis);
  const modifie: Apporteur | undefined = ap === undefined ? undefined : {
    ...ap,
    baremes: o.bareme ? [...ap.baremes, { ...o.bareme, depuis: date(o.bareme), ordre: NOUVELLE }] : ap.baremes,
    remunerations: o.remuneration ? [...(ap.remunerations ?? []), { ...o.remuneration, depuis: date(o.remuneration), ordre: NOUVELLE }] : ap.remunerations,
  };
  const apres = modifie === undefined ? o.apporteurs : o.apporteurs.map((x) => (x.id === o.apporteurId ? modifie : x));
  const avantD = dusParDossier(siens, o.apporteurs, o.aujourdhui);
  const apresD = dusParDossier(siens, apres, o.aujourdhui);
  const concerne = (d: ActiviteCalcul): boolean => (o.bareme ? regleApporteurDe(d, apres)?.ordre === NOUVELLE : false)
    || (o.remuneration && modifie ? remunerationADate(modifie, d.dateSignature)?.ordre === NOUVELLE : false);
  const somme = (x: DuDossier[], k: 'apporteur' | 'collegue'): number => x.reduce((s, d) => s + d[k], 0);
  const v = o.bareme ?? o.remuneration;
  const change = (i: number): boolean => Math.abs(avantD[i].apporteur - apresD[i].apporteur) > 0.0000001 || Math.abs(avantD[i].collegue - apresD[i].collegue) > 0.0000001;
  const saisi = (d: ActiviteCalcul): boolean => d.commissionSaisie !== null || d.apporteurTaux !== null;
  return {
    total: siens.length, concernes: siens.filter(concerne).length,
    changes: siens.filter((_, i) => change(i)).length,
    figes: o.bareme ? siens.filter((d, i) => concerne(d) && !change(i) && saisi(d)).length : 0,
    depuis: v ? date(v) : o.aujourdhui, toujours: v?.toujours === true,
    avantApporteur: somme(avantD, 'apporteur'), apresApporteur: somme(apresD, 'apporteur'), avantCollegue: somme(avantD, 'collegue'), apresCollegue: somme(apresD, 'collegue'),
  };
}

/**
 * La cascade AFFICHÉE, juste au centime : chaque terme arrondi au centime, le net calculé EN CENTIMES à partir des termes affichés —
 * « Honoraires − apporteur − collègue = net » tombe juste à l'écran, sans écart d'arrondi. `collegue` null : pas de ligne (interne). PUR.
 */
export function cascadeAuCentime(x: { ca: number; apporteur: number; collegue: number | null }): { ca: number; apporteur: number; collegue: number | null; net: number } {
  const c = (v: number): number => Math.round((v + Number.EPSILON) * 100);
  const net = c(x.ca) - c(x.apporteur) - (x.collegue === null ? 0 : c(x.collegue));
  return { ca: c(x.ca) / 100, apporteur: c(x.apporteur) / 100, collegue: x.collegue === null ? null : c(x.collegue) / 100, net: net / 100 };
}
