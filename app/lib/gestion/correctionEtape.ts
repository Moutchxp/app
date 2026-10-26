/**
 * ══ 🔴🔴 LOT FRISE-CORRECTION-MANUELLE (26/10/2026) — LES RÈGLES DE LA CORRECTION D'UNE CARTE OU D'UN POINT. MODULE PUR ══
 *
 * Aucune base, aucun réseau, aucun React : il est lu par la route ET par la frise (`'use client'`), règle du dépôt depuis
 * l'incident du 24/09/2026. La route et l'écran tranchent donc avec les MÊMES fonctions.
 *
 * DEMANDE D'ARNO : « quand l'automatisation s'est trompée, pouvoir FACILEMENT modifier chaque point et chaque carte de la frise,
 * et notamment transformer un point d'information en carte d'étape, et inversement » — titre, nature, date ; retirer de la
 * frise et remettre ; revenir au classement automatique. « LA CORRECTION HUMAINE FAIT FOI. »
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUI NE SE CORRIGE PAS, ET POURQUOI : la NATURE et la DATE des trois cartes de borne (Ouverture, Clôture, Réouverture).
 * Depuis le lot ETAT-PAR-LA-FRISE, l'état « ouvert / clos » de l'événement se DÉDUIT de leur ordre ; les décisions d'Arno du
 * 08/10 et du 23/10/2026 en ont figé la date (« la date n'est pas modifiable »). Leur TITRE se corrige, et elles se retirent
 * ou se remettent comme les autres (l'écran demande alors confirmation, l'état peut changer). Pour la même raison, on ne
 * TRANSFORME rien EN borne : une Clôture se pose depuis le « + », avec sa modale.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { REPERES, cartesDuReservoir, estRepere, motEtape, type TypeEtape } from './mongaEtape';
import { MENTION_DATE_RDV, TYPES_BORNE, estCarteRendezVous } from './frise';

/** Les natures d'une CARTE d'étape qu'une correction peut choisir (les bornes exceptées). */
export const NATURES_CARTE: readonly TypeEtape[] = [
  'prise_rdv', 'rdv_eu_lieu', 'devis_recu', 'devis_refuse', 'devis_accepte', 'rdv_intervention', 'intervention', 'rapport',
  'assurance', 'expertise', 'relance', 'autre',
];

/** Les natures d'un POINT (un repère sur le fil) : les mêmes que la frise range en points (`estRepere`). */
export const NATURES_POINT: readonly TypeEtape[] = REPERES;

/** Le plus long titre accepté : une borne de SÛRETÉ, pas une règle métier. */
export const TITRE_MAX = 200;

export type Famille = 'point' | 'carte';

/** Un point ou une carte ? La frise le décide par le type (`estRepere`), et rien d'autre. PUR. */
export function familleDe(t: TypeEtape): Famille {
  return estRepere(t) ? 'point' : 'carte';
}

/** Ouverture, Clôture, Réouverture : leur nature et leur date ne se corrigent pas. PUR. */
export function estBorne(t: TypeEtape): boolean {
  return TYPES_BORNE.includes(t);
}

/** Les natures proposées à l'écran pour une famille. PUR. */
export function naturesPour(f: Famille): readonly TypeEtape[] {
  return f === 'point' ? NATURES_POINT : NATURES_CARTE;
}

/** La nature proposée d'office quand on transforme : la première de l'autre famille, sauf le cas évident d'un commentaire. PUR. */
export function natureParDefautApresTransformation(actuel: TypeEtape): TypeEtape {
  if (familleDe(actuel) === 'point') return actuel === 'facture' ? 'devis_recu' : 'autre';
  return 'commentaire';
}

export interface EtatActuelEtape {
  type: TypeEtape;
  /** Le JOUR de l'étape (`AAAA-MM-JJ`, heure de Paris), ou `null` si la date n'a pas été saisie. */
  jour: string | null;
}

export interface CorrectionVoulue {
  type: TypeEtape;
  titre: string | null;
  /** `AAAA-MM-JJ`, ou `null` = sans date. */
  jour: string | null;
}

export type CorrectionValidee =
  | { refus: string }
  | { refus: null; type: TypeEtape; titre: string | null; jour: string | null; dateInchangee: boolean };

export const REFUS_NATURE_BORNE = 'La nature d’une carte Ouverture, Clôture ou Réouverture ne se corrige pas : elle dit l’état de l’événement.';
export const REFUS_VERS_BORNE = 'On ne transforme pas une étape en Ouverture, Clôture ou Réouverture : posez cette carte depuis le « + » de la frise.';
export const REFUS_NATURE = 'Nature d’étape inconnue.';
export const REFUS_TITRE_LIBRE = 'Une carte libre demande un titre.';
export const REFUS_DATE = 'Date attendue au format AAAA-MM-JJ.';

/**
 * ══ VALIDER UNE CORRECTION. PUR. ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 LA DATE D'UNE BORNE EST IGNORÉE, PAS REFUSÉE : le formulaire la grise, et un appel qui l'enverrait quand même ne doit pas
 * perdre pour autant le titre qu'il corrige. C'est la règle déjà tenue par la route du crayon (`dateDeLEtape`).
 *
 * ⚠️ `dateInchangee` dit au dépôt de garder l'instant enregistré à la seconde (et son heure, si elle était connue) : corriger le
 * titre d'un rendez-vous « 10 h 30 » ne doit pas lui faire perdre son heure.
 */
export function validerCorrection(actuel: EtatActuelEtape, voulu: CorrectionVoulue): CorrectionValidee {
  const titre = (voulu.titre ?? '').trim().slice(0, TITRE_MAX);
  const titreOuNul = titre === '' ? null : titre;
  if (estBorne(actuel.type)) {
    if (voulu.type !== actuel.type) return { refus: REFUS_NATURE_BORNE };
    return { refus: null, type: actuel.type, titre: titreOuNul, jour: actuel.jour, dateInchangee: true };
  }
  if (estBorne(voulu.type)) return { refus: REFUS_VERS_BORNE };
  if (!NATURES_CARTE.includes(voulu.type) && !NATURES_POINT.includes(voulu.type)) return { refus: REFUS_NATURE };
  if (voulu.type === 'autre' && titreOuNul === null) return { refus: REFUS_TITRE_LIBRE };
  const jour = voulu.jour === null || voulu.jour.trim() === '' ? null : voulu.jour.trim();
  if (jour !== null && !/^\d{4}-\d{2}-\d{2}$/.test(jour)) return { refus: REFUS_DATE };
  if (jour === null && estCarteRendezVous(voulu.type)) return { refus: MENTION_DATE_RDV };
  return { refus: null, type: voulu.type, titre: titreOuNul, jour, dateInchangee: jour === actuel.jour };
}

/** Ce que la frise sait de la correction d'une étape (colonnes de la migration 429, et le retrait). */
export interface TraceCorrection {
  source: 'monga' | 'manuelle';
  type: TypeEtape;
  statut?: 'vif' | 'retire';
  autoType?: TypeEtape | null;
  autoStatut?: 'vif' | 'retire' | null;
  /** `AAAA-MM-JJ HH:MI:SS`, heure de Paris. */
  corrigeLe?: string | null;
  corrigeParLibelle?: string | null;
  retireLe?: string | null;
  retireParLibelle?: string | null;
}

/** « le 26/10/2026 » depuis `AAAA-MM-JJ…`, sans construire de `Date` (le fuseau du lecteur ne doit rien décaler). PUR. */
function motJour(s: string | null | undefined): string {
  if (s === null || s === undefined || s.length < 10) return '';
  return ` le ${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

function motPar(libelle: string | null | undefined): string {
  const l = (libelle ?? '').trim();
  return l === '' ? '' : ` par ${l}`;
}

/** L'automatisation peut-elle reprendre la main sur cette étape ? (Une étape venue de Monga, déjà corrigée.) PUR. */
export function peutRevenirAutomatique(t: TraceCorrection): boolean {
  return t.source === 'monga' && (t.autoType ?? null) !== null;
}

/**
 * ══ « CLASSÉ AUTOMATIQUEMENT EN POINT, CORRIGÉ EN CARTE PAR ARNAUD LE 26/10/2026 » (Arno). PUR. ═══════════════════════════
 *
 * `null` quand il n'y a rien à dire : une étape jamais corrigée parle d'elle-même.
 */
export function motCorrection(t: TraceCorrection): string | null {
  if ((t.corrigeLe ?? null) === null) return null;
  const qui = `${motPar(t.corrigeParLibelle)}${motJour(t.corrigeLe)}`;
  if (t.source !== 'monga' || (t.autoType ?? null) === null) return `corrigée à la main${qui}`;
  const auto = t.autoType as TypeEtape;
  if (auto !== t.type) {
    return familleDe(auto) !== familleDe(t.type)
      ? `classé automatiquement en ${familleDe(auto)}, corrigé en ${familleDe(t.type)}${qui}`
      : `classé automatiquement « ${motEtape(auto)} », corrigé en « ${motEtape(t.type)} »${qui}`;
  }
  if ((t.autoStatut ?? 'vif') === 'vif' && t.statut === 'retire') return `classé automatiquement sur la frise, retiré${qui}`;
  return `classement automatique corrigé à la main${qui}`;
}

/** « retiré de la frise par Arnaud le 26/10/2026 ». PUR. */
export function motRetrait(t: TraceCorrection): string {
  return `retiré de la frise${motPar(t.retireParLibelle)}${motJour(t.retireLe)}`;
}

/** La phrase de la confirmation avant de délier une intervention (Arno : « dire en clair ce qui va se passer »). PUR. */
export function phraseDelier(reference: string, evenementReference: string | null): string {
  const ou = evenementReference === null ? 'cet événement' : evenementReference;
  return `Délier ${reference} de ${ou} : ses étapes quittent cette frise, et les mails Monga classés automatiquement quittent `
    + `l’événement. Les mails restent dans l’historique du bien. Vous pourrez la relier à nouveau depuis cette frise.`;
}


/**
 * ══ 🔴🔴 Arno (26/10/2026, R3) — « TRANSFORMER EN ÉTAPE » DEPUIS LA BULLE D'UN POINT : LA LISTE DU « + », ET ELLE SEULE. PUR. ═══════════
 * La MÊME source que la grille « Ajouter une carte » du « + » (`cartesDuReservoir`, qui suit l'état ouvert / clos de l'événement) — jamais
 * une liste recopiée —, privée de ce qu'une correction ne peut pas poser : une borne (Clôture, Réouverture : elles se posent depuis le
 * « + », avec leur modale) et un repère (Facture : c'est un point, pas une carte). Événement clos : liste vide (le « + » n'y offre
 * que « Réouverture »).
 */
export function cartesPourTransformer(evenementOuvert: boolean): TypeEtape[] {
  return cartesDuReservoir(evenementOuvert).filter((t) => !estBorne(t) && familleDe(t) === 'carte');
}

/** Le geste « Transformer en étape » : la carte choisie, à la DATE DU POINT (sans date s'il n'en avait pas), titre inchangé. PUR. */
export function gesteTransformerEnEtape(e: { survenuLe: string; jourConnu?: boolean; titre: string | null }, type: TypeEtape):
  { geste: 'corriger'; type: TypeEtape; titre: string | null; jour: string | null } {
  return { geste: 'corriger', type, titre: e.titre !== null && e.titre.trim() !== '' ? e.titre.trim() : null, jour: e.jourConnu === false ? null : e.survenuLe.slice(0, 10) };
}

/** « Remettre en point d'information » : une carte qui ÉTAIT un point pour l'automatisation (Monga, corrigée depuis). PUR. */
export function peutRemettreEnPoint(e: TraceCorrection & { type: TypeEtape }): boolean {
  return familleDe(e.type) === 'carte' && peutRevenirAutomatique(e) && familleDe(e.autoType as TypeEtape) === 'point';
}
