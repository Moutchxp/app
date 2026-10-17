/**
 * ══ 🔴🔴 LOT L1 — LOYER DE DÉPART, TAUX ET HONORAIRES DE GESTION (validé par Arno le 17/10/2026) ═══════════════════
 *
 * MODULE PUR : aucun import de base, aucun réseau. Il est lu par le serveur (dépôt, route, commande de reprise) ET par
 * l'écran (carte du locataire, fiche du bien, écran « Honoraires de gestion ») : une seule règle de calcul, jamais deux.
 *
 * CE QUE DISENT LES DONNÉES (lecture seule de Lots.xlsx, 365 lots, 17/10/2026 — étude §4.9) :
 *   · le taux WIPPIMMO est HORS TAXES (5,83 = 7 / 1,2 ; 4,17 = 5 / 1,2 ; 0,83 = 1 / 1,2…) ;
 *   · la base inclut les charges pour 363 lots sur 365 (« LCDTA » : L = loyer, C = charges) ;
 *   · le taux le plus fréquent est 4,5 % HT (191 lots).
 *
 * 🔴 AUCUN ARRONDI DE CALCUL (règle transverse §5). Les montants ne sont mis au centime QU'À L'AFFICHAGE.
 * 🔴 UN LOYER ABSENT N'EST JAMAIS INVENTÉ : la location est comptée « à saisir » et EXCLUE des totaux, qui disent
 *    combien il en manque (décision d'Arno).
 * 🔴 C'EST UN MONTANT THÉORIQUE, sur le loyer de départ : ni encaissé, ni révisé. WIPPIMMO reste la comptabilité.
 */

export type BaseHonoraires = 'cc' | 'hc';
export type OrigineConditions = 'saisie' | 'reprise';
export type SourceTaux = 'precedente' | 'wippimmo' | 'reglage';

/** Les conditions d'une location telles que la base les garde (la ligne la plus récente fait foi). */
export interface ConditionsLocation {
  loyerHc: number | null;
  provisions: number | null;
  tauxHt: number;
  base: BaseHonoraires;
  origine: OrigineConditions;
  saisiLe: string;
  saisiPar: string;
}

/** Le taux qu'on propose quand une location n'a pas encore de conditions, et d'où il vient. */
export interface TauxPropose { taux: number; source: SourceTaux }

/** Ce qu'une carte de location reçoit pour s'afficher et se saisir. */
export interface LocationAffichee {
  occupationId: number;
  conditions: ConditionsLocation | null;
  /** Combien de lignes de conditions cette location a connues (corrections comprises). */
  versions: number;
  tauxPropose: TauxPropose;
  baseProposee: BaseHonoraires;
  /** La TVA sur honoraires en vigueur aujourd'hui (réglage daté), en %. `null` si aucun réglage n'existe. */
  tvaPct: number | null;
}

export const LIBELLE_BASE: Record<BaseHonoraires, string> = {
  cc: 'charges comprises',
  hc: 'hors charges',
};

export const LIBELLE_SOURCE_TAUX: Record<SourceTaux, string> = {
  precedente: 'repris de la location précédente du lot',
  wippimmo: 'taux WIPPIMMO du lot',
  reglage: 'réglage agence',
};

export const PHRASE_THEORIQUE =
  'Montant théorique, calculé sur le loyer de départ — ni encaissé, ni révisé. Le réel encaissé est dans WIPPIMMO.';

export const MOT_LOYER_A_SAISIR = 'loyer de départ à saisir';

// ── LIRE UN NOMBRE SAISI OU EXPORTÉ ──────────────────────────────────────────────────────────────────────────────

/**
 * Un nombre écrit à la française (« 1 180,50 », « 4,5 ») ou à l'anglaise (« 1180.5 »). `null` si vide ou illisible.
 * Les espaces (y compris insécables) sont ignorés. Aucun arrondi.
 */
export function lireNombre(brut: string | number | null | undefined): number | null {
  if (brut === null || brut === undefined) return null;
  if (typeof brut === 'number') return Number.isFinite(brut) ? brut : null;
  const propre = brut.replace(/[\s  ]/g, '').replace(',', '.');
  if (propre === '' || !/^-?\d+(\.\d+)?$/.test(propre)) return null;
  const n = Number(propre);
  return Number.isFinite(n) ? n : null;
}

/** Le « Tx honos » d'une ligne de Lots.xlsx : un pourcentage entre 0 et 100, sinon `null` (jamais deviné). */
export function lireTauxWippimmo(brut: string): number | null {
  const n = lireNombre(brut);
  return n === null || n < 0 || n > 100 ? null : n;
}

/** La « Base honos » : gardée telle quelle (ex. « LCDTA »), `null` si vide. */
export function lireBaseWippimmo(brut: string): string | null {
  const t = brut.trim().toUpperCase();
  return t === '' ? null : t.slice(0, 32);
}

// ── LE TAUX PROPOSÉ ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le taux pré-rempli d'une location (décision d'Arno) : celui de la location précédente du lot, sinon le taux
 * WIPPIMMO du lot, sinon le réglage agence. Toujours modifiable.
 */
export function proposerTaux(o: { precedent: number | null; wippimmo: number | null; reglage: number }): TauxPropose {
  if (o.precedent !== null) return { taux: o.precedent, source: 'precedente' };
  if (o.wippimmo !== null) return { taux: o.wippimmo, source: 'wippimmo' };
  return { taux: o.reglage, source: 'reglage' };
}

// ── LE CALCUL ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * L'assiette mensuelle : loyer HC, plus les provisions quand la base est « charges comprises ». `null` quand le loyer
 * de départ n'est pas connu — on n'invente rien. Des provisions absentes valent zéro (elles n'existent pas toujours).
 */
export function assietteMensuelle(c: { loyerHc: number | null; provisions: number | null; base: BaseHonoraires }): number | null {
  if (c.loyerHc === null) return null;
  return c.loyerHc + (c.base === 'cc' ? (c.provisions ?? 0) : 0);
}

/** Les honoraires de gestion d'un mois plein : assiette × taux HT ; TTC = HT × (1 + TVA). `null` sans loyer. */
export function honorairesMensuels(
  c: { loyerHc: number | null; provisions: number | null; base: BaseHonoraires; tauxHt: number },
  tvaPct: number | null,
): { ht: number; ttc: number | null } | null {
  const assiette = assietteMensuelle(c);
  if (assiette === null) return null;
  const ht = assiette * c.tauxHt / 100;
  return { ht, ttc: tvaPct === null ? null : ht * (1 + tvaPct / 100) };
}

/** La TVA en vigueur à une date (ISO), d'après les réglages datés. Même date d'effet : la saisie la plus récente. */
export function tvaEnVigueur(
  lignes: readonly { valeur: number; depuis: string; saisiLe?: string }[], dateIso: string,
): number | null {
  const candidates = lignes
    .filter((l) => l.depuis <= dateIso)
    .sort((a, b) => (a.depuis === b.depuis
      ? (a.saisiLe ?? '').localeCompare(b.saisiLe ?? '')
      : a.depuis.localeCompare(b.depuis)));
  const derniere = candidates[candidates.length - 1];
  return derniere === undefined ? null : derniere.valeur;
}

const JOUR_MS = 86_400_000;
const jourUtc = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** Le nombre de jours d'un mois (1 à 12). */
export function joursDansMois(annee: number, mois: number): number {
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

/** « 2026-10-01 » : le premier jour d'un mois, en ISO. */
export function premierDuMois(annee: number, mois: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}-01`;
}

/**
 * La part du mois pendant laquelle une location a couru : jours de présence / jours du mois, entre 0 et 1. L'entrée et
 * la sortie comptent (un locataire qui part le 15 a occupé le 15). Entrée inconnue = présente depuis toujours ; sortie
 * absente = toujours en cours.
 */
export function fractionDuMois(entree: string | null, sortie: string | null, annee: number, mois: number): number {
  const debutMois = Date.UTC(annee, mois - 1, 1);
  const finMois = Date.UTC(annee, mois - 1, joursDansMois(annee, mois));
  const debut = entree === null ? debutMois : Math.max(debutMois, jourUtc(entree));
  const fin = sortie === null ? finMois : Math.min(finMois, jourUtc(sortie));
  if (fin < debut) return 0;
  return ((fin - debut) / JOUR_MS + 1) / joursDansMois(annee, mois);
}

// ── LA VUE « HONORAIRES DE GESTION » ─────────────────────────────────────────────────────────────────────────────

/** Une location telle que l'écran des honoraires la reçoit du dépôt. */
export interface LocationPourHonoraires {
  occupationId: number;
  lotId: number;
  lotNumero: string;
  lotLibelle: string;
  locataire: string;
  entree: string | null;
  sortie: string | null;
  conditions: { loyerHc: number | null; provisions: number | null; tauxHt: number; base: BaseHonoraires } | null;
  /** Les propriétaires du lot aujourd'hui (vue unique : liens en cours, sinon celui de l'import). */
  proprietaires: { id: number; nom: string }[];
}

export interface LigneHonorairesLot {
  lotId: number; lotNumero: string; lotLibelle: string; locataires: string[];
  /** Loyer de départ et taux de la location en cours dans la période (la plus récente), pour la lecture. */
  loyerHc: number | null; provisions: number | null; tauxHt: number | null; base: BaseHonoraires | null;
  ht: number; ttc: number | null;
  /** Locations de ce lot présentes dans la période sans loyer de départ : exclues du montant. */
  manquantes: number;
}

export interface LigneHonorairesProprietaire {
  id: number; nom: string; lots: number; indivision: boolean; ht: number; ttc: number | null;
}

export interface ResultatHonoraires {
  periode: { annee: number; mois: number | null };
  totalHt: number;
  totalTtc: number | null;
  /** Locations présentes dans la période et comptées (loyer connu). */
  comptees: number;
  /** Locations présentes dans la période SANS loyer de départ : exclues des totaux, et dites. */
  manquantes: number;
  parLot: LigneHonorairesLot[];
  parProprietaire: LigneHonorairesProprietaire[];
}

/**
 * Calcule la vue pour un mois (mois 1-12) ou une année civile (mois `null` = somme des 12 mois). Chaque location
 * compte au prorata de ses jours dans le mois, avec la TVA en vigueur au premier jour du mois.
 *
 * 🔴 PAR PROPRIÉTAIRE : un lot en indivision compte ENTIER pour chacun de ses propriétaires, marqué « indivision »,
 * jamais réparti au jugé ; le total agence, lui, ne le compte qu'une fois.
 */
export function calculerHonoraires(
  locations: readonly LocationPourHonoraires[],
  periode: { annee: number; mois: number | null },
  tva: readonly { valeur: number; depuis: string; saisiLe?: string }[],
): ResultatHonoraires {
  const moisDeLaPeriode = periode.mois === null ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [periode.mois];
  const parLot = new Map<number, LigneHonorairesLot & { _tri: string }>();
  const proprietairesDuLot = new Map<number, { id: number; nom: string }[]>();
  const presentes = new Set<number>();
  const manquantesSet = new Set<number>();
  /**
   * 🔴 LES COOCCUPANTS D'UN MÊME BAIL. « Ajouter un occupant » crée une occupation par personne, qui partagent la date
   * d'entrée du bail. Le loyer se saisit sur UNE carte : les autres occupations du même lot, à la même date d'entrée,
   * sans loyer, sont COUVERTES — ni comptées une seconde fois, ni dites « à saisir » dans les totaux.
   */
  const bauxAvecLoyer = new Set(locations
    .filter((l) => l.conditions !== null && l.conditions.loyerHc !== null)
    .map((l) => `${l.lotId}|${l.entree ?? ''}`));

  for (const loc of locations) {
    let ht = 0;
    let ttc: number | null = 0;
    let presente = false;
    for (const m of moisDeLaPeriode) {
      const f = fractionDuMois(loc.entree, loc.sortie, periode.annee, m);
      if (f <= 0) continue;
      presente = true;
      if (loc.conditions === null) continue;
      const h = honorairesMensuels(loc.conditions, tvaEnVigueur(tva, premierDuMois(periode.annee, m)));
      if (h === null) continue;
      ht += h.ht * f;
      ttc = ttc === null || h.ttc === null ? null : ttc + h.ttc * f;
    }
    if (!presente) continue;
    const sansLoyer = loc.conditions === null || loc.conditions.loyerHc === null;
    if (sansLoyer && bauxAvecLoyer.has(`${loc.lotId}|${loc.entree ?? ''}`)) continue;
    presentes.add(loc.occupationId);
    if (sansLoyer) manquantesSet.add(loc.occupationId);

    const ligne = parLot.get(loc.lotId) ?? {
      lotId: loc.lotId, lotNumero: loc.lotNumero, lotLibelle: loc.lotLibelle, locataires: [],
      loyerHc: null, provisions: null, tauxHt: null, base: null, ht: 0, ttc: 0, manquantes: 0, _tri: '',
    };
    if (!ligne.locataires.includes(loc.locataire)) ligne.locataires.push(loc.locataire);
    if (sansLoyer) ligne.manquantes += 1;
    else {
      ligne.ht += ht;
      ligne.ttc = ligne.ttc === null || ttc === null ? null : ligne.ttc + ttc;
    }
    // La location la plus récemment entrée donne le loyer et le taux qu'on LIT sur la ligne (le montant, lui, somme tout).
    const tri = loc.entree ?? '';
    if (loc.conditions !== null && tri >= ligne._tri) {
      ligne._tri = tri;
      ligne.loyerHc = loc.conditions.loyerHc;
      ligne.provisions = loc.conditions.provisions;
      ligne.tauxHt = loc.conditions.tauxHt;
      ligne.base = loc.conditions.base;
    }
    parLot.set(loc.lotId, ligne);
    proprietairesDuLot.set(loc.lotId, loc.proprietaires);
  }

  const lots = [...parLot.values()].map(({ _tri, ...l }) => { void _tri; return l; })
    .sort((a, b) => b.ht - a.ht || a.lotLibelle.localeCompare(b.lotLibelle, 'fr'));

  const parProp = new Map<number, LigneHonorairesProprietaire>();
  for (const l of lots) {
    const props = proprietairesDuLot.get(l.lotId) ?? [];
    for (const p of props) {
      const ligne = parProp.get(p.id) ?? { id: p.id, nom: p.nom, lots: 0, indivision: false, ht: 0, ttc: 0 };
      ligne.lots += 1;
      ligne.indivision = ligne.indivision || props.length > 1;
      ligne.ht += l.ht;
      ligne.ttc = ligne.ttc === null || l.ttc === null ? null : ligne.ttc + l.ttc;
      parProp.set(p.id, ligne);
    }
  }

  let totalHt = 0;
  let totalTtc: number | null = 0;
  for (const l of lots) {
    totalHt += l.ht;
    totalTtc = totalTtc === null || l.ttc === null ? null : totalTtc + l.ttc;
  }
  return {
    periode,
    totalHt, totalTtc,
    comptees: presentes.size - manquantesSet.size,
    manquantes: manquantesSet.size,
    parLot: lots,
    parProprietaire: [...parProp.values()].sort((a, b) => b.ht - a.ht || a.nom.localeCompare(b.nom, 'fr')),
  };
}

// ── LA SAISIE ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface ConditionsSaisies { loyerHc: number | null; provisions: number | null; tauxHt: number; base: BaseHonoraires }

/** Vérifie une saisie (écran ET serveur appellent la même fonction). Loyer facultatif ; taux obligatoire. */
export function verifierConditions(brut: {
  loyerHc?: unknown; provisions?: unknown; tauxHt?: unknown; base?: unknown;
}): { ok: true; valeurs: ConditionsSaisies } | { ok: false; motif: string } {
  const texte = (v: unknown): string | number | null =>
    (typeof v === 'string' || typeof v === 'number' ? v : null);
  const loyerBrut = texte(brut.loyerHc);
  const provBrut = texte(brut.provisions);
  const loyer = loyerBrut === null || String(loyerBrut).trim() === '' ? null : lireNombre(loyerBrut);
  const provisions = provBrut === null || String(provBrut).trim() === '' ? null : lireNombre(provBrut);
  const taux = lireNombre(texte(brut.tauxHt));
  if (loyerBrut !== null && String(loyerBrut).trim() !== '' && loyer === null) {
    return { ok: false, motif: 'Le loyer de départ doit être un montant (ex. 1 180 ou 1180,50).' };
  }
  if (loyer !== null && (loyer < 0 || loyer > 10_000_000)) return { ok: false, motif: 'Le loyer de départ est hors bornes.' };
  if (provBrut !== null && String(provBrut).trim() !== '' && provisions === null) {
    return { ok: false, motif: 'Les provisions doivent être un montant (ex. 90).' };
  }
  if (provisions !== null && (provisions < 0 || provisions > 10_000_000)) {
    return { ok: false, motif: 'Les provisions sont hors bornes.' };
  }
  if (taux === null) return { ok: false, motif: 'Le taux de gestion est obligatoire (ex. 4,5).' };
  if (taux < 0 || taux > 100) return { ok: false, motif: 'Le taux de gestion doit être compris entre 0 et 100 %.' };
  const base = brut.base === 'hc' ? 'hc' : brut.base === 'cc' ? 'cc' : null;
  if (base === null) return { ok: false, motif: 'La base doit être « charges comprises » ou « hors charges ».' };
  return { ok: true, valeurs: { loyerHc: loyer, provisions, tauxHt: taux, base } };
}

// ── L'AFFICHAGE ──────────────────────────────────────────────────────────────────────────────────────────────────

const EUROS = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TAUX = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

/** « 1 180,00 € » — le centime n'apparaît QU'ICI, à l'affichage. */
export const formaterEuros = (n: number): string => `${EUROS.format(n)} €`;
/** « 4,5 % ». */
export const formaterTaux = (n: number): string => `${TAUX.format(n)} %`;
/** Un nombre pour un champ de saisie : « 1180,5 », sans séparateur de milliers. */
export const nombrePourSaisie = (n: number | null): string => (n === null ? '' : String(n).replace('.', ','));
