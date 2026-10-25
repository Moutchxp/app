/**
 * ══ 🔴🔴 TUILE LOCATION — LES « CONDITIONS D'ENTRÉE » D'UN BAIL (Arno, 20/10/2026). PUR : ni I/O, ni React, ni `pg`. ══════
 *
 * Source : la fiche papier « Nouveau dossier » de l'agence. Bloc 3 de l'écran « Nouveau locataire », et l'encart
 * « Conditions d'entrée » de la fiche du locataire (modifiable par le même formulaire). UNE entrée = UN jeu de conditions,
 * porté par le BAIL créé (les occupations de cette entrée) — migration 391.
 *
 *   1. Dépôt de garantie : conservé par l'agence / reversé au bailleur ;
 *   2. Prélèvement : Oui (au 1er / au 5 / au 10 / au 15) / Non ;
 *   3. Garanties : garant personne physique Oui / Non ; assurance loyers impayés GLI (laquelle) / Visale / Autre (laquelle) / Aucune ;
 *   4. Entretien à prévoir : c'est la donnée DU BIEN (« Entretien à prévoir » de l'écran Nouveau bien, `entretien.ts`) —
 *      même composant, même donnée, aucun doublon : elle n'est PAS dans ce module ;
 *   5. Honoraires : locataire et propriétaire, chacun « Compte bancaire transaction » (valeur « agence ») / « Compte bancaire gestion » ;
 *   6. Sommes dues à l'entrée (facultatives, en €, au centime) et leur TOTAL, calculé ;
 *   7. Mode de règlement : Chèque / Virement / Autre (lequel) ;
 *   8. Commentaires (facultatif).
 * Les choix 1, 2, 3, 5 et 7 sont OBLIGATOIRES (la règle est la même à l'écran et au serveur) ; montants et commentaire non.
 */

import { eurosAffiches, lignesHonoraires, totalDesHonoraires, type CalculHonoraires } from './honorairesProprietaire';
import { CHARGES_COPRO, PAYEES_PAR, type ChargesCopro } from './bienComplet';
import { cleTrimestre, indiceDuBail, libelleTrimestre, manquesIndice, SIGLE_INDICE, type IndiceBail, type SaisieIndice } from './indicesLoyers';

export const DEPOTS = ['agence', 'bailleur'] as const;
export type Depot = typeof DEPOTS[number];
export const LIBELLE_DEPOT: Record<Depot, string> = { agence: 'Conservé par l’agence', bailleur: 'Reversé au bailleur' };

/** Arno (20/10/2026, retouche) : au 1er, au 5, au 10, au 15 (migration 392). */
export const JOURS_PRELEVEMENT = ['1', '5', '10', '15'] as const;
export type JourPrelevement = typeof JOURS_PRELEVEMENT[number];
export const LIBELLE_JOUR: Record<JourPrelevement, string> = { 1: 'au 1er', 5: 'au 5', 10: 'au 10', 15: 'au 15' };
export type JourNumero = 1 | 5 | 10 | 15;

export const ASSURANCES = ['gli', 'visale', 'autre', 'aucune'] as const;
export type Assurance = typeof ASSURANCES[number];
export const LIBELLE_ASSURANCE: Record<Assurance, string> = { gli: 'GLI', visale: 'Visale', autre: 'Autre', aucune: 'Aucune' };
/** Les assurances qu'il faut préciser (« laquelle »). */
const A_PRECISER: readonly Assurance[] = ['gli', 'autre'];
/** Arno (21/10/2026) — celles dont la précision se GARDE : GLI et Autre (obligatoire), Visale (le n° de visa, facultatif). */
export const AVEC_PRECISION: readonly Assurance[] = ['gli', 'visale', 'autre'];

/**
 * 🔴 Arno (25/10/2026) — « GLI : LAQUELLE ? » : deux boutons exclusifs, « Garantme » et « Personnaliser » (le champ libre d'avant),
 * aucun choix par défaut, réponse obligatoire. Le stockage ne change pas : `assurance_precision` vaut « Garantme » ou le texte saisi.
 * Une valeur égale à « Garantme » (casse et espaces ignorés) présélectionne Garantme ; toute autre valeur, Personnaliser avec le texte.
 */
export const GLI_GARANTME = 'Garantme';
export const CHOIX_GLI = ['garantme', 'personnaliser'] as const;
export type ChoixGli = typeof CHOIX_GLI[number];
export const LIBELLE_CHOIX_GLI: Record<ChoixGli, string> = { garantme: 'Garantme', personnaliser: 'Personnaliser' };
/** « Garantme », « garantme », « GARANT ME »… : Garantme. PUR. */
export const estGarantme = (t: string | null | undefined): boolean => (t ?? '').replace(/\s+/g, '').toLowerCase() === GLI_GARANTME.toLowerCase();
/** Le choix GLI d'une saisie : celui fait à l'écran, sinon celui que dit la précision enregistrée ; null : pas encore répondu. PUR. */
export function choixGliDe(s: Pick<SaisieConditions, 'assurance' | 'assurancePrecision' | 'gliChoix'>): ChoixGli | null {
  if (s.assurance !== 'gli') return null;
  if (s.gliChoix !== undefined) return s.gliChoix;
  if (estGarantme(s.assurancePrecision)) return 'garantme';
  return s.assurancePrecision.trim() !== '' ? 'personnaliser' : null;
}
/** La précision enregistrée d'une GLI : « Garantme », ou le texte saisi (« Garantme » s'il le dit) ; vide sans choix. PUR. */
function precisionGli(s: Pick<SaisieConditions, 'assurance' | 'assurancePrecision' | 'gliChoix'>): string {
  const c = choixGliDe(s);
  if (c === 'garantme' || (c === 'personnaliser' && estGarantme(s.assurancePrecision))) return GLI_GARANTME;
  return c === 'personnaliser' ? s.assurancePrecision : '';
}

export const COMPTES = ['agence', 'gestion'] as const;
export type Compte = typeof COMPTES[number];
// Arno (21/10/2026) : le libellé AFFICHÉ de « agence » est « Compte bancaire transaction » ; la valeur enregistrée (« agence ») ne change pas.
export const LIBELLE_COMPTE: Record<Compte, string> = { agence: 'Compte bancaire transaction', gestion: 'Compte bancaire gestion' };
/** Le mot du mail « Nouvelle location » (envoyé à des tiers) : inchangé — seul l'affichage des écrans est renommé (Arno, 21/10/2026). */
export const LIBELLE_COMPTE_MAIL: Record<Compte, string> = { agence: 'Compte bancaire agence', gestion: 'Compte bancaire gestion' };

export const REGLEMENTS = ['cheque', 'virement', 'autre'] as const;
export type Reglement = typeof REGLEMENTS[number];
export const LIBELLE_REGLEMENT: Record<Reglement, string> = { cheque: 'Chèque', virement: 'Virement', autre: 'Autre' };

/** Les sommes dues à l'entrée, dans l'ordre de la fiche papier. */
export const SOMMES = ['prorataLoyer', 'prorataCharges', 'depotGarantie', 'honorairesAgence'] as const;
export type Somme = typeof SOMMES[number];
export const LIBELLE_SOMME: Record<Somme, string> = {
  prorataCharges: 'Prorata provisions / charges', prorataLoyer: 'Prorata loyer', depotGarantie: 'Dépôt de garantie', honorairesAgence: 'Honoraires agence',
};

/** La saisie à l'écran : `null` = pas encore répondu ; les montants restent du texte (« 1 180,50 »). */
export interface SaisieConditions {
  depot: Depot | null;
  prelevement: boolean | null;
  jour: JourPrelevement | null;
  garant: boolean | null;
  assurance: Assurance | null;
  assurancePrecision: string;
  /** 🔴 Arno (25/10/2026) — GLI : « Garantme » ou « Personnaliser » choisi à l'écran ; absent : déduit de la précision (`choixGliDe`). */
  gliChoix?: ChoixGli | null;
  honorairesLocataire: Compte | null;
  honorairesProprietaire: Compte | null;
  sommes: Record<Somme, string>;
  reglement: Reglement | null;
  reglementPrecision: string;
  commentaire: string;
  /**
   * Arno (20/10/2026) — le LOYER MENSUEL à l'entrée (facultatif) : c'est le « loyer de départ » de la location (migration 370,
   * `gestion_location_conditions.loyer_hc` / `provisions`) — la MÊME donnée que la carte « Location » de la fiche, pas une copie.
   */
  loyer: { principal: string; provisions: string };
  /**
   * Arno (20/10/2026) — les deux PRORATAS se calculent seuls (loyer mensuel × jours d'occupation ÷ jours du mois) TANT QU'on
   * ne les a pas modifiés à la main ; modifiés, ils gardent leur valeur (« recalculer » remet le calcul). État d'écran seulement.
   */
  prorataManuel: { prorataLoyer: boolean; prorataCharges: boolean };
  /**
   * 🔴 Arno (25/10/2026) — « Honoraires agence » (la part du LOCATAIRE) se pré-remplit au barème (le même calcul que la part propriétaire :
   * le plafond légal du locataire est le même montant) TANT QU'on ne l'a pas saisie à la main ; saisie à la main, elle n'est plus jamais
   * écrasée (« recalculer » remet le barème). Absent : non saisie à la main. État d'écran seulement (jamais envoyé).
   */
  agenceManuel?: boolean;
  /**
   * 🔴 Arno (25/10/2026, migration 423) — l'INDICE DES LOYERS du bail (type, trimestre de référence, date de révision annuelle). Absent
   * (`undefined`) : l'écran ne montre pas le bloc (ou la base n'a pas la 423) — rien n'est exigé, rien n'est envoyé ; présent : les trois
   * champs sont OBLIGATOIRES.
   */
  indice?: SaisieIndice;
  /**
   * 🔴 Arno (25/10/2026) — « PAIEMENT DES CHARGES » : la donnée DU BIEN (`gestion_annuaire_lot.charges_copro`, migration 400 — la même
   * que « Paiement des charges » de la fiche du bien et « Charges copro » du mail), saisie ici à côté du mode de règlement. Absent
   * (`undefined`) : l'écran ne montre pas le bloc ; `null` : pas encore répondu.
   */
  chargesCopro?: ChargesCopro | null;
}

/** Le loyer mensuel relu (centimes exacts), ou rien. */
export interface LoyerMensuel { principal: number | null; provisions: number | null }

export const CONDITIONS_VIDES: SaisieConditions = {
  depot: null, prelevement: null, jour: null, garant: null, assurance: null, assurancePrecision: '',
  honorairesLocataire: null, honorairesProprietaire: null,
  sommes: { prorataLoyer: '', prorataCharges: '', depotGarantie: '', honorairesAgence: '' },
  reglement: null, reglementPrecision: '', commentaire: '',
  loyer: { principal: '', provisions: '' },
  prorataManuel: { prorataLoyer: false, prorataCharges: false },
};

// ── LE PRORATA DU MOIS D'ENTRÉE (Arno, 20/10/2026) ───────────────────────────────────────────────────────────────────

/** Le prorata d'un montant mensuel pour le mois d'entrée, et ce qu'il faut pour l'écrire en clair. */
export interface Prorata { centimes: number; jours: number; joursDuMois: number; du: string; au: string }

/**
 * Jours d'occupation = du jour d'entrée INCLUS au dernier jour du mois inclus (jours du mois − jour d'entrée + 1) ; jours du
 * mois = le nombre RÉEL (28, 29 les années bissextiles, 30, 31). Prorata = montant × jours ÷ jours du mois, en entiers exacts,
 * ARRONDI AU CENTIME LE PLUS PROCHE (demi supérieur) à la FIN seulement. `null` si la date ou le montant manque. PUR.
 */
export function prorataEntree(montantCentimes: number | null | undefined, dateEntree: string | null | undefined): Prorata | null {
  if (montantCentimes === null || montantCentimes === undefined) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateEntree ?? '');
  if (m === null) return null;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const joursDuMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  if (mois < 1 || mois > 12 || jour < 1 || jour > joursDuMois) return null;
  const jours = joursDuMois - jour + 1;
  const numerateur = montantCentimes * jours;
  const centimes = Math.floor((2 * numerateur + joursDuMois) / (2 * joursDuMois));
  const mm = String(mois).padStart(2, '0');
  return { centimes, jours, joursDuMois, du: `${String(jour).padStart(2, '0')}/${mm}`, au: `${joursDuMois}/${mm}` };
}

/** Des centimes → la saisie à deux décimales (« 480,00 », « 69,68 »). PUR. */
export const montantDeuxDecimales = (c: number): string => `${Math.trunc(c / 100)},${String(c % 100).padStart(2, '0')}`;

/** La formule en clair : « 1 240,00 € × 12/31 jours (du 20/10 au 31/10) ». PUR. */
export function formuleProrata(montantCentimes: number, p: Prorata): string {
  return `${formaterCentimes(montantCentimes)} × ${p.jours}/${p.joursDuMois} jours (du ${p.du} au ${p.au})`;
}

/** Le total du loyer charges comprises / mois, en centimes ; `null` si rien n'est saisi ou si un montant est illisible. */
export function totalLoyerCentimes(l: { principal: unknown; provisions: unknown }): number | null {
  const a = enCentimes(l.principal);
  const b = enCentimes(l.provisions);
  if (a === undefined || b === undefined || (a === null && b === null)) return null;
  return (a ?? 0) + (b ?? 0);
}

/** Des centimes → le texte exact d'un montant en euros (« 1180.50 »), pour les colonnes `numeric`. */
export function eurosExacts(c: number): string {
  return `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

/** Les conditions d'entrée relues, avec qui les a saisies et quand. */
export interface ConditionsEntreeLues {
  bailCle: string; occupationIds: number[]; conditions: ConditionsEntree; saisiLe: string; saisiPar: string;
  /** Plus d'une ligne pour ce bail : elles ont été modifiées. */
  modifiees: boolean;
  /** L'encart, prêt à lire. */
  lignes: { mot: string; valeur: string; detail?: string }[];
  /** Les honoraires propriétaire calculés à l'entrée, avec le barème et la surface utilisés (migration 392). */
  honoraires: CalculHonoraires | null;
  /** Le loyer mensuel du bail : le loyer de départ (migration 370) de ses occupations ; `null` s'il n'est pas connu. */
  loyer?: LoyerMensuel | null;
  /** Le bail (migration 393) ; `null` avant elle. */
  bailId?: number | null;
  /** La surface Carrez/Boutin du bien AUJOURD'HUI (texte exact), pour proposer de refaire des honoraires calculés sans surface. */
  surfaceActuelle?: string | null;
}

/** Les conditions vérifiées, telles qu'elles s'enregistrent et se relisent (montants en CENTIMES, entiers exacts). */
export interface ConditionsEntree {
  depot: Depot;
  prelevement: boolean;
  jour: JourNumero | null;
  garant: boolean;
  assurance: Assurance;
  assurancePrecision: string | null;
  honorairesLocataire: Compte;
  honorairesProprietaire: Compte;
  sommes: Record<Somme, number | null>;
  reglement: Reglement;
  reglementPrecision: string | null;
  commentaire: string | null;
  /** 423 — l'indice du bail ; absent / null : non saisi (bail d'avant, ou écran sans le bloc). */
  indice?: IndiceBail | null;
  /** Le « paiement des charges » du bien (écrit sur le bien, jamais sur les conditions) ; absent : non saisi par cet écran. */
  chargesCopro?: ChargesCopro | null;
}

const dans = <T extends string>(liste: readonly T[], v: unknown): T | null => (typeof v === 'string' && (liste as readonly string[]).includes(v) ? v as T : null);
const texte = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
};
const ouiNon = (v: unknown): boolean | null => (v === true || v === 'oui' ? true : v === false || v === 'non' ? false : null);

/**
 * Un montant en euros → des CENTIMES entiers, sans passer par un flottant (« 1 180,5 » → 118050). Vide → `null` ;
 * illisible, négatif ou plus de deux décimales → `undefined` (refusé, jamais arrondi).
 */
export function enCentimes(brut: unknown): number | null | undefined {
  if (brut === null || brut === undefined) return null;
  if (typeof brut === 'number') brut = String(brut);
  if (typeof brut !== 'string') return undefined;
  const propre = brut.replace(/[\s  €]/g, '').replace(',', '.');
  if (propre === '') return null;
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(propre);
  if (m === null) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

const EUROS = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Des centimes → « 1 180,50 € » (entiers exacts : aucune perte). */
export function formaterCentimes(c: number): string {
  return `${EUROS.format(c / 100)} €`;
}

/** Le TOTAL des sommes dues à l'entrée, en centimes ; `null` si aucune n'est saisie ou si l'une est illisible. */
export function totalCentimes(sommes: Partial<Record<Somme, unknown>>): number | null {
  let total = 0;
  let une = false;
  for (const k of SOMMES) {
    const c = enCentimes(sommes[k]);
    if (c === undefined) return null;
    if (c !== null) { total += c; une = true; }
  }
  return une ? total : null;
}

/** La saisie (écran) → ce qu'on envoie au serveur. PUR. */
export function versEnvoiConditions(s: SaisieConditions): Record<string, unknown> {
  return {
    depot: s.depot, prelevement: s.prelevement, jour: s.prelevement === true ? s.jour : null, garant: s.garant,
    assurance: s.assurance,
    assurancePrecision: s.assurance === 'gli' ? precisionGli(s) : s.assurance !== null && AVEC_PRECISION.includes(s.assurance) ? s.assurancePrecision : '',
    ...(s.assurance === 'gli' ? { gliChoix: choixGliDe(s) } : {}),
    honorairesLocataire: s.honorairesLocataire, honorairesProprietaire: s.honorairesProprietaire,
    sommes: { ...s.sommes }, reglement: s.reglement, reglementPrecision: s.reglement === 'autre' ? s.reglementPrecision : '',
    commentaire: s.commentaire, loyer: { ...s.loyer }, ...(s.indice !== undefined ? { indice: { ...s.indice } } : {}),
    ...(s.chargesCopro !== undefined ? { chargesCopro: s.chargesCopro } : {}),
  };
}

/** Des centimes → la saisie (« 1180 », « 1180,50 »). PUR. */
export const montantSaisi = (x: number | null): string => (x === null ? '' : `${Math.trunc(x / 100)}${x % 100 === 0 ? '' : `,${String(x % 100).padStart(2, '0')}`}`);

/** Les conditions relues → la saisie (« Modifier » de la fiche). PUR. */
export function versSaisieConditions(c: ConditionsEntree, loyer: LoyerMensuel | null = null): SaisieConditions {
  const montant = montantSaisi;
  return {
    depot: c.depot, prelevement: c.prelevement, jour: c.jour === null ? null : String(c.jour) as JourPrelevement, garant: c.garant,
    assurance: c.assurance, assurancePrecision: c.assurancePrecision ?? '',
    honorairesLocataire: c.honorairesLocataire, honorairesProprietaire: c.honorairesProprietaire,
    sommes: { prorataLoyer: montant(c.sommes.prorataLoyer), prorataCharges: montant(c.sommes.prorataCharges),
      depotGarantie: montant(c.sommes.depotGarantie), honorairesAgence: montant(c.sommes.honorairesAgence) },
    reglement: c.reglement, reglementPrecision: c.reglementPrecision ?? '', commentaire: c.commentaire ?? '',
    loyer: { principal: montant(loyer?.principal ?? null), provisions: montant(loyer?.provisions ?? null) },
    // Des proratas déjà enregistrés restent tels quels (« recalculer » remet le calcul).
    prorataManuel: { prorataLoyer: c.sommes.prorataLoyer !== null, prorataCharges: c.sommes.prorataCharges !== null },
    // Des honoraires agence déjà enregistrés restent tels quels (jamais remplacés par le barème à l'ouverture ; « recalculer » le remet).
    agenceManuel: c.sommes.honorairesAgence !== null,
    // L'indice enregistré est repris tel quel (et renvoyé : « Modifier » ne le perd jamais, même sans le bloc à l'écran).
    ...(c.indice ? { indice: { type: c.indice.type, reference: cleTrimestre(c.indice.annee, c.indice.trimestre), revision: c.indice.revision } } : {}),
    ...(c.chargesCopro !== undefined ? { chargesCopro: c.chargesCopro } : {}),
  };
}

/**
 * Ce qui manque, champ par champ, DANS L'ORDRE DU BLOC (vide = enregistrable). Les montants mal écrits sont des manques
 * aussi (jamais arrondis, jamais ignorés). L'entretien (point 4) est la règle du BIEN, ajoutée par l'écran.
 */
/**
 * 🔴 Arno (25/10/2026) — LE DOSSIER COMPLET (Nouveau locataire, Dossier de location) : loyer principal, provision pour charges, dépôt de
 * garantie et honoraires agence sont OBLIGATOIRES — 0 est une valeur, seul un champ VIDE manque. `indice` / `charges` : exigés même si la
 * saisie ne les porte pas (le serveur, quand la base a la migration 423 / 400). Sans option : la règle d'avant (montants facultatifs).
 */
export interface ExigencesConditions { complet?: boolean; indice?: boolean; charges?: boolean }
export const MOT_CHARGES_COPRO = 'Paiement des charges : payées par l’agence ou par le propriétaire ?';

export function manquesConditions(b: Record<string, unknown>, o: ExigencesConditions = {}): Record<string, string> {
  const m: Record<string, string> = {};
  if (dans(DEPOTS, b.depot) === null) m.depot = 'Dépôt de garantie : conservé par l’agence ou reversé au bailleur ?';
  const prel = ouiNon(b.prelevement);
  if (prel === null) m.prelevement = 'Prélèvement : répondez Oui ou Non.';
  else if (prel && dans(JOURS_PRELEVEMENT, b.jour === null || b.jour === undefined ? b.jour : String(b.jour)) === null) {
    m.jour = 'Prélèvement : au 1er, au 5, au 10 ou au 15 ?';
  }
  if (ouiNon(b.garant) === null) m.garant = 'Garant personne physique : répondez Oui ou Non.';
  const assurance = dans(ASSURANCES, b.assurance);
  if (assurance === null) m.assurance = 'Assurance loyers impayés : GLI, Visale, Autre ou Aucune.';
  else if (assurance === 'gli' && b.gliChoix === null) m.gliChoix = 'GLI : Garantme ou Personnaliser ?';
  else if (A_PRECISER.includes(assurance) && texte(b.assurancePrecision, 120) === null) {
    // Sans `gliChoix` (le serveur) : le choix est obligatoire, et Personnaliser exige le texte.
    m.assurancePrecision = assurance === 'autre' ? 'Autre assurance : précisez laquelle.'
      : b.gliChoix === 'personnaliser' ? 'GLI personnalisée : précisez l’assureur ou le contrat.' : 'GLI : Garantme, ou Personnaliser avec le nom de l’assureur ou du contrat.';
  }
  if (dans(COMPTES, b.honorairesLocataire) === null) m.honorairesLocataire = 'Honoraires du locataire : compte agence ou compte gestion ?';
  if (dans(COMPTES, b.honorairesProprietaire) === null) m.honorairesProprietaire = 'Honoraires du propriétaire : compte agence ou compte gestion ?';
  // Le loyer mensuel : facultatif, mais jamais mal écrit (ni arrondi, ni ignoré). Avant les sommes dues, comme à l'écran.
  const loyer = (b.loyer !== null && typeof b.loyer === 'object' ? b.loyer : {}) as Record<string, unknown>;
  if (enCentimes(loyer.principal) === undefined) m['loyer-principal'] = 'Loyer principal : un montant en euros, au centime (ex. 1 180,50).';
  if (enCentimes(loyer.provisions) === undefined) m['loyer-provisions'] = 'Provision pour charges : un montant en euros, au centime (ex. 90).';
  if (o.complet === true) {
    if (enCentimes(loyer.principal) === null) m['loyer-principal'] = 'Loyer mensuel : le loyer principal (0 si aucun).';
    if (enCentimes(loyer.provisions) === null) m['loyer-provisions'] = 'Loyer mensuel : la provision pour charges (0 si aucune).';
  }
  // 423 — l'indice des loyers, à droite du loyer : ses trois champs obligatoires dès que le bloc est là.
  if (b.indice !== undefined || o.indice === true) Object.assign(m, manquesIndice(b.indice));
  const sommes = (b.sommes !== null && typeof b.sommes === 'object' ? b.sommes : {}) as Record<string, unknown>;
  for (const k of SOMMES) {
    if (enCentimes(sommes[k]) === undefined) m[`somme-${k}`] = `${LIBELLE_SOMME[k]} : un montant en euros, au centime (ex. 1 180,50).`;
    // Les proratas se calculent (date d'entrée et loyer, déjà obligatoires) : seuls le dépôt et les honoraires agence s'exigent.
    else if (o.complet === true && (k === 'depotGarantie' || k === 'honorairesAgence') && enCentimes(sommes[k]) === null) {
      m[`somme-${k}`] = k === 'depotGarantie' ? 'Sommes dues à l’entrée : le dépôt de garantie (0 si aucun).' : 'Sommes dues à l’entrée : les honoraires agence (0 si aucun).';
    }
  }
  const reglement = dans(REGLEMENTS, b.reglement);
  if (reglement === null) m.reglement = 'Mode de règlement : Chèque, Virement ou Autre.';
  else if (reglement === 'autre' && texte(b.reglementPrecision, 120) === null) m.reglementPrecision = 'Autre mode de règlement : précisez lequel.';
  // 🔴 Arno (25/10/2026) — « Paiement des charges », à droite du mode de règlement : obligatoire dès que le bloc est là.
  if ((b.chargesCopro !== undefined || o.charges === true) && dans(CHARGES_COPRO, b.chargesCopro) === null) m.chargesCopro = MOT_CHARGES_COPRO;
  return m;
}

/** La vérification du SERVEUR : la même règle, puis les valeurs propres (ce qui n'a pas de sens est vidé). */
export function verifierConditions(brut: unknown, o: ExigencesConditions = {}): { ok: true; valeurs: ConditionsEntree } | { ok: false; motif: string } {
  const b = (brut !== null && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
  const manque = Object.values(manquesConditions(b, o));
  if (manque.length > 0) return { ok: false, motif: manque.join(' ') };
  const sommes = (b.sommes !== null && typeof b.sommes === 'object' ? b.sommes : {}) as Record<string, unknown>;
  const prelevement = ouiNon(b.prelevement) as boolean;
  const assurance = dans(ASSURANCES, b.assurance) as Assurance;
  const reglement = dans(REGLEMENTS, b.reglement) as Reglement;
  return { ok: true, valeurs: {
    depot: dans(DEPOTS, b.depot) as Depot, prelevement, jour: prelevement ? Number(b.jour) as JourNumero : null,
    garant: ouiNon(b.garant) as boolean, assurance,
    assurancePrecision: assurance === 'gli' && estGarantme(texte(b.assurancePrecision, 120)) ? GLI_GARANTME : AVEC_PRECISION.includes(assurance) ? texte(b.assurancePrecision, 120) : null,
    honorairesLocataire: dans(COMPTES, b.honorairesLocataire) as Compte, honorairesProprietaire: dans(COMPTES, b.honorairesProprietaire) as Compte,
    sommes: { prorataLoyer: enCentimes(sommes.prorataLoyer) ?? null, prorataCharges: enCentimes(sommes.prorataCharges) ?? null,
      depotGarantie: enCentimes(sommes.depotGarantie) ?? null, honorairesAgence: enCentimes(sommes.honorairesAgence) ?? null },
    reglement, reglementPrecision: reglement === 'autre' ? texte(b.reglementPrecision, 120) : null,
    commentaire: texte(b.commentaire, 4000),
    ...(b.indice !== undefined ? { indice: indiceDuBail(b.indice) } : {}),
    ...(b.chargesCopro !== undefined ? { chargesCopro: dans(CHARGES_COPRO, b.chargesCopro) } : {}),
  } };
}

/** Les lignes de l'encart « Conditions d'entrée » (lecture), dans l'ordre de la fiche papier ; les honoraires propriétaire après les sommes. PUR. */
export function lignesConditions(c: ConditionsEntree, honoraires: CalculHonoraires | null = null, loyer: LoyerMensuel | null = null): { mot: string; valeur: string; detail?: string }[] {
  const saisies = SOMMES.map((k) => c.sommes[k]).filter((x): x is number => x !== null);
  const total = saisies.length === 0 ? null : saisies.reduce((t, x) => t + x, 0);
  return [
    { mot: 'Dépôt de garantie', valeur: LIBELLE_DEPOT[c.depot] },
    { mot: 'Prélèvement', valeur: c.prelevement ? `Oui, ${LIBELLE_JOUR[String(c.jour) as JourPrelevement]}` : 'Non' },
    { mot: 'Garant personne physique', valeur: c.garant ? 'Oui' : 'Non' },
    { mot: 'Assurance loyers impayés', valeur: `${LIBELLE_ASSURANCE[c.assurance]}${c.assurancePrecision
      ? ` — ${c.assurance === 'gli' && estGarantme(c.assurancePrecision) ? GLI_GARANTME : c.assurancePrecision}` : ''}` },
    { mot: 'Honoraires du locataire', valeur: LIBELLE_COMPTE[c.honorairesLocataire] },
    { mot: 'Honoraires du propriétaire', valeur: LIBELLE_COMPTE[c.honorairesProprietaire] },
    ...(loyer === null ? [] : [
      ...(loyer.principal === null ? [] : [{ mot: 'Loyer principal', valeur: formaterCentimes(loyer.principal) }]),
      ...(loyer.provisions === null ? [] : [{ mot: 'Provision pour charges', valeur: formaterCentimes(loyer.provisions) }]),
      ...(loyer.principal === null && loyer.provisions === null ? [] : [{ mot: 'Total loyer charges comprises / mois', valeur: formaterCentimes((loyer.principal ?? 0) + (loyer.provisions ?? 0)) }]),
    ]),
    ...(c.indice ? [
      { mot: 'Indice des loyers', valeur: `${SIGLE_INDICE[c.indice.type]} ${libelleTrimestre(c.indice.annee, c.indice.trimestre)}` },
      { mot: 'Date de révision annuelle', valeur: c.indice.revision.split('-').reverse().join('/') },
    ] : []),
    ...SOMMES.filter((k) => c.sommes[k] !== null).map((k) => ({ mot: LIBELLE_SOMME[k], valeur: formaterCentimes(c.sommes[k] as number) })),
    ...(total === null ? [] : [{ mot: 'Total dû à l’entrée', valeur: formaterCentimes(total) }]),
    ...(honoraires === null ? [] : honoraires.etat === 'ok' || honoraires.etat === 'saisi' ? lignesHonoraires(honoraires) : [{ mot: 'Honoraires propriétaire', valeur: honoraires.motif }]),
    ...((): { mot: string; valeur: string }[] => {
      const t = totalDesHonoraires(c.sommes.honorairesAgence, honoraires);
      return t === null ? [] : [{ mot: 'Total des honoraires', valeur: eurosAffiches(t) }];
    })(),
    { mot: 'Mode de règlement', valeur: `${LIBELLE_REGLEMENT[c.reglement]}${c.reglementPrecision ? ` — ${c.reglementPrecision}` : ''}` },
    ...(c.chargesCopro ? [{ mot: 'Paiement des charges', valeur: PAYEES_PAR[c.chargesCopro] }] : []),
    ...(c.commentaire === null ? [] : [{ mot: 'Commentaires', valeur: c.commentaire }]),
  ];
}
