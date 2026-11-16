import { adresseSansNumero } from './copropriete';

/**
 * ══ 🔴🔴 L'ADRESSE D'UNE PERSONNE : CE QUI S'ACCEPTE (Arno, 17/11/2026, « Adresses uniformisées », lot 2). MODULE PUR. ═══════════════
 *
 * DÉCISIONS D'ARNO :
 *   · une adresse française se CHOISIT dans les suggestions de la Base Adresse Nationale (`ChampAdresseBan`) : rue, code postal et
 *     commune remplis ENSEMBLE ; plus de saisie libre — le serveur la RETROUVE (copie locale, puis service national) ;
 *   · une adresse française ABSENTE de la liste : saisie libre AUTORISÉE avec confirmation, marquée « hors liste — à vérifier »
 *     (et regroupée dans une liste à contrôler) ;
 *   · une adresse À L'ÉTRANGER (propriétaires, locataires, garants, contacts) : saisie libre, marquée comme telle, PAYS obligatoire ;
 *   · le service des suggestions en panne : refus clair, on réessaie ;
 *   · une rue sans numéro : la même fenêtre de confirmation que la fiche Copropriété ;
 *   · 🔴 AUCUNE ADRESSE EXISTANTE N'EST RÉÉCRITE : une adresse qu'on ne touche pas n'est ni revérifiée ni requalifiée.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export type NatureAdresse = 'liste' | 'hors_liste' | 'etranger';
export const NATURES_ADRESSE: readonly NatureAdresse[] = ['liste', 'hors_liste', 'etranger'];

/** Ce que l'écran envoie EN PLUS de l'adresse : sa nature, le pays (étranger) et les deux confirmations données à l'écran. */
export interface MetaAdresse {
  nature: NatureAdresse | null;
  pays?: string | null;
  /** « Saisir une adresse hors liste » confirmé à l'écran */
  horsListeConfirme?: boolean;
  /** « Adresse sans numéro » confirmé à l'écran */
  sansNumeroConfirme?: boolean;
}

/** L'adresse d'une fiche, telle qu'en base (avant) ou telle que saisie (après). */
export interface AdresseFiche { adresse: string | null; codePostal: string | null; commune: string | null; nature: NatureAdresse | null; pays: string | null }

/** Ce qui est décidé : rien à faire, une adresse retenue telle quelle, une adresse à RETROUVER dans la Base Adresse Nationale, ou un refus. */
export type DecisionAdresse =
  | { etat: 'inchangee' }
  | { etat: 'retenue'; nature: NatureAdresse | null; pays: string | null }
  | { etat: 'a_verifier'; adresse: { libelle: string; codePostal: string; commune: string } }
  | { etat: 'refus'; motif: string };

const propre = (x: string | null | undefined): string => (x ?? '').trim().replace(/\s+/g, ' ');
/** Deux écritures égales à la casse et aux espaces près (la mise en forme de la commune ne fait pas une modification). PUR. */
const meme = (a: string | null | undefined, b: string | null | undefined): boolean => propre(a).toLocaleLowerCase('fr') === propre(b).toLocaleLowerCase('fr');

export const MOTIF_PAYS = 'Indiquez le pays de cette adresse à l’étranger. Rien n’est enregistré.';
export const MOTIF_HORS_LISTE_NON_CONFIRME = 'Cette adresse n’a pas été choisie dans la liste : choisissez-la dans les suggestions, ou confirmez « Adresse hors liste ». Rien n’est enregistré.';
export const MOTIF_CP_COMMUNE = 'Une adresse française demande un code postal à 5 chiffres et une commune. Rien n’est enregistré.';
export const TITRE_SANS_NUMERO_PERSONNE = 'Adresse sans numéro';
export const texteSansNumeroPersonne = (adresse: string): string[] => [
  `Cette adresse n’a pas de numéro : ${adresse}.`,
  'Une adresse postale désigne d’ordinaire un immeuble ou une maison précis (un numéro et une rue). Confirmez-vous cette adresse sans numéro ?',
];
export const motifSansNumeroPersonne = (adresse: string): string =>
  `L’adresse ${adresse} n’a pas de numéro : confirmez-la à l’écran (« Confirmer ») ou choisissez une adresse numérotée. Rien n’est enregistré.`;
export const MENTION_HORS_LISTE = 'hors liste — à vérifier';
export const MENTION_ETRANGER = 'adresse à l’étranger';

/** Une nature reçue de l'écran, ou `null`. PUR. */
export const natureDe = (x: unknown): NatureAdresse | null => (typeof x === 'string' && (NATURES_ADRESSE as readonly string[]).includes(x) ? x as NatureAdresse : null);

/** Les métadonnées d'adresse reçues du CORPS d'une requête, relues champ par champ (jamais crues au-delà de leur forme) ; `undefined` sans elles. PUR. */
export function metaPropre(x: unknown): MetaAdresse | undefined {
  if (x === null || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  return { nature: natureDe(o.nature), pays: typeof o.pays === 'string' ? o.pays.slice(0, 120) : null,
    horsListeConfirme: o.horsListeConfirme === true, sansNumeroConfirme: o.sansNumeroConfirme === true };
}
/** `{ adresseSaisie }` à étaler dans une fiche relue du corps, ou rien. PUR. */
export const metaAdresseDuCorps = (x: unknown): { adresseSaisie?: MetaAdresse } => { const m = metaPropre(x); return m === undefined ? {} : { adresseSaisie: m }; };

/**
 * LA DÉCISION, AVANT TOUTE ÉCRITURE. `meta` absente : l'écran ne connaît pas encore ce lot — l'adresse modifiée est traitée comme une
 * adresse de la liste (à retrouver). PUR.
 */
export function decisionAdresse(avant: AdresseFiche, apres: { adresse?: string | null; codePostal?: string | null; commune?: string | null }, meta: MetaAdresse | undefined): DecisionAdresse {
  const a = { adresse: apres.adresse === undefined ? avant.adresse : apres.adresse, codePostal: apres.codePostal === undefined ? avant.codePostal : apres.codePostal,
    commune: apres.commune === undefined ? avant.commune : apres.commune };
  // sans nature dite, celle d'avant (une adresse d'avant ce lot vaut « liste » si on la modifie)
  const nature = meta?.nature ?? avant.nature ?? 'liste';
  const pays = nature === 'etranger' ? propre(meta?.pays ?? avant.pays) : '';
  const touchee = !meme(a.adresse, avant.adresse) || !meme(a.codePostal, avant.codePostal) || !meme(a.commune, avant.commune)
    || (meta !== undefined && meta.nature !== null && meta.nature !== avant.nature) || (nature === 'etranger' && !meme(pays, avant.pays));
  if (!touchee) return { etat: 'inchangee' };
  // une adresse effacée : plus d'adresse, plus de nature
  if (propre(a.adresse) === '' && propre(a.codePostal) === '' && propre(a.commune) === '') return { etat: 'retenue', nature: null, pays: null };
  if (nature === 'etranger') {
    if (pays === '') return { etat: 'refus', motif: MOTIF_PAYS };
    if (propre(a.adresse) === '') return { etat: 'refus', motif: 'Saisissez l’adresse à l’étranger. Rien n’est enregistré.' };
    return { etat: 'retenue', nature: 'etranger', pays };
  }
  if (propre(a.adresse) === '') return { etat: 'refus', motif: 'Saisissez la rue de l’adresse (ou effacez aussi le code postal et la commune). Rien n’est enregistré.' };
  if (!/^\d{5}$/.test(propre(a.codePostal)) || propre(a.commune) === '') return { etat: 'refus', motif: MOTIF_CP_COMMUNE };
  if (adresseSansNumero(propre(a.adresse)) && meta?.sansNumeroConfirme !== true) return { etat: 'refus', motif: motifSansNumeroPersonne(`${propre(a.adresse)}, ${propre(a.codePostal)} ${propre(a.commune)}`) };
  if (nature === 'hors_liste') {
    if (meta?.horsListeConfirme !== true) return { etat: 'refus', motif: MOTIF_HORS_LISTE_NON_CONFIRME };
    return { etat: 'retenue', nature: 'hors_liste', pays: null };
  }
  return { etat: 'a_verifier', adresse: { libelle: propre(a.adresse), codePostal: propre(a.codePostal), commune: propre(a.commune) } };
}

/** Le motif d'une adresse INTROUVABLE dans la Base Adresse Nationale (fiche d'une personne). PUR. */
export const motifIntrouvablePersonne = (a: { libelle: string; codePostal: string; commune: string }): string =>
  `L’adresse ${a.libelle}, ${a.codePostal} ${a.commune} est introuvable dans la Base Adresse Nationale : choisissez-la dans les suggestions, ou confirmez « Adresse hors liste » (ou « Adresse à l’étranger »). Rien n’est enregistré.`;
/** Le motif quand le service national ne répond pas. PUR. */
export const motifServiceMuetPersonne = (a: { libelle: string; codePostal: string; commune: string }): string =>
  `L’adresse ${a.libelle}, ${a.codePostal} ${a.commune} n’a pas pu être vérifiée : le service national des adresses ne répond pas. Rien n’est enregistré ; réessayez dans un moment.`;

/** La mention à afficher sous une adresse (fiche ou carte) : « hors liste — à vérifier », « adresse à l'étranger — Belgique », ou rien. PUR. */
export function mentionAdresse(nature: NatureAdresse | null | undefined, pays: string | null | undefined): string | null {
  if (nature === 'hors_liste') return MENTION_HORS_LISTE;
  if (nature === 'etranger') return `${MENTION_ETRANGER}${propre(pays) !== '' ? ` — ${propre(pays)}` : ''}`;
  return null;
}
