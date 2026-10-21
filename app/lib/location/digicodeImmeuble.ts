import { adresseAffichee, cleAdresse } from './mailNouvelleLocation';

/**
 * ══ 🔴🔴 LE DIGICODE PORTÉ PAR L'IMMEUBLE (Arno, 21/10/2026, migration 396). PUR. ══════════════════════════════════════════
 *
 * « Le digicode appartient à l'IMMEUBLE, identifié par son adresse postale (numéro, voie, code postal, commune, normalisés :
 * casse, accents, espaces, abréviations bd / av / r). Il n'appartient PAS au syndic. » Un seul digicode par immeuble ; les
 * fiches de biens affichent et modifient celui de leur immeuble — deux fiches ne peuvent jamais montrer deux codes.
 * La clé d'adresse est `cleAdresse` (la même règle que le regroupement des lots du mail « Nouvelle location »).
 */

export interface AdresseImmeuble { voie: string | null; codePostal: string | null; commune: string | null }
export interface ValeurDigicode { digicode: boolean | null; code: string | null }

export const MAX_CODE_DIGICODE = 8;

/** La clé de l'immeuble d'une adresse, ou `null` sans voie (pas d'immeuble identifiable). PUR. */
export function cleImmeubleAdresse(a: AdresseImmeuble): string | null {
  if ((a.voie ?? '').trim() === '') return null;
  return cleAdresse(a);
}

/** « Commun à tous les biens du 12 rue Victor Hugo, 92400 Courbevoie (3 biens) ». PUR. */
export function mentionDigicode(a: AdresseImmeuble, nbBiens: number): string {
  return `Commun à tous les biens du ${adresseAffichee(a)} (${nbBiens} bien${nbBiens > 1 ? 's' : ''})`;
}

// ── UN DIGICODE PAR BÂTIMENT (Arno, 21/10/2026, migration 399) ──────────────────────────────────────────────────────────────
//
// « Une même adresse postale peut avoir un digicode DIFFÉRENT par bâtiment (A, B…). Clé : adresse normalisée + bâtiment
// normalisé (casse, espaces, « Bât. B » = « B » = « bâtiment b »). Bâtiment vide = “code général” de l'adresse. Un bien lit le
// code de SON bâtiment ; si ce bâtiment n'a pas de code, ou si le bien n'a pas de bâtiment, il lit le code général de l'adresse,
// avec la mention “code général de l'adresse”. »

const sansMotBatiment = (s: string): string =>
  s.replace(/^\s*(b[aâ]timents?|b[aâ]t|bt)(?=$|[\s.:\-_/,]|\d)[\s.:\-_/,]*/i, '').trim();

/** La clé d'un bâtiment : « Bât. B » = « B » = « bâtiment b » → « b » ; vide (ou « Bâtiment » seul) → '' = le code général. PUR. */
export function cleBatiment(brut: string | null | undefined): string {
  const t = (brut ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,;:_/\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return sansMotBatiment(t).replace(/\s+/g, ' ').trim();
}

/** Le bâtiment tel qu'on l'affiche après « bâtiment » : « Bât. B » → « B », « bâtiment b » → « B », « Les Tilleuls » tel quel. PUR. */
export function libelleBatiment(brut: string | null | undefined): string | null {
  const t = sansMotBatiment((brut ?? '').replace(/\s+/g, ' ').trim());
  if (t === '') return null;
  return t.length <= 3 ? t.toUpperCase() : t;
}

const biens = (n: number): string => (n === 0 ? 'aucun bien' : n === 1 ? '1 bien' : `${n} biens`);

/**
 * La mention sous le champ « Digicode » (Arno) : « Commun aux N biens du bâtiment B, <adresse> », ou « … de l'adresse » pour le
 * code général ; avec un seul bien (ou aucun), la phrase reste juste. PUR.
 */
export function mentionDigicodeBatiment(a: AdresseImmeuble, batiment: string | null, nbBiens: number): string {
  const adresse = adresseAffichee(a);
  const ou = batiment === null ? `de l’adresse ${adresse}` : `du bâtiment ${batiment}, ${adresse}`;
  return nbBiens > 1 ? `Commun aux ${nbBiens} biens ${ou}` : `Code ${batiment === null ? 'général' : 'propre'} ${ou} (${biens(nbBiens)})`;
}

/**
 * Mail « Nouvelle location » (Arno, 21/10/2026) : « le code du bâtiment du lot principal, et celui de chaque annexe SI SON
 * BÂTIMENT DIFFÈRE ». Même immeuble (adresse normalisée ; une annexe « même adresse » a celle du logement) et même bâtiment
 * normalisé → le code n'est pas répété sur l'annexe. PUR.
 */
export function memeBatimentQue(annexe: AdresseImmeuble & { batiment: string | null }, principal: AdresseImmeuble & { batiment: string | null }): boolean {
  const adresse = (annexe.voie ?? '').trim() === '' ? principal : annexe;
  return cleImmeubleAdresse(adresse) === cleImmeubleAdresse(principal) && cleBatiment(annexe.batiment) === cleBatiment(principal.batiment);
}

/** La mention d'un bien qui lit le CODE GÉNÉRAL alors qu'il a un bâtiment (sans code propre). PUR. */
export const MENTION_CODE_GENERAL = 'code général de l’adresse';

const texteCode = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const ouiNon = (v: unknown): boolean | null => (v === true || v === 'oui' ? true : v === false || v === 'non' ? false : null);

/** La saisie (Oui / Non / vide, et le code seulement avec Oui, 8 caractères au plus) : la même règle partout. PUR. */
export function verifierDigicode(brut: { digicode?: unknown; code?: unknown }): { ok: true; valeur: ValeurDigicode } | { ok: false; motif: string } {
  const digicode = ouiNon(brut.digicode);
  const code = digicode === true ? texteCode(brut.code) : null;
  if (code !== null && code.length > MAX_CODE_DIGICODE) return { ok: false, motif: 'Le code du digicode fait 8 caractères au plus.' };
  return { ok: true, valeur: { digicode, code } };
}

export const memeValeur = (a: ValeurDigicode, b: ValeurDigicode): boolean => a.digicode === b.digicode && (a.code ?? null) === (b.code ?? null);

/** « oui · code 57B83 », « non », « non renseigné » : pour le journal. PUR. */
export function libelleValeur(v: ValeurDigicode): string {
  return v.digicode === null ? 'non renseigné' : v.digicode ? `oui${v.code ? ` · code ${v.code}` : ''}` : 'non';
}

// ── LA REPRISE DES DIGICODES DÉJÀ SAISIS SUR DES BIENS ─────────────────────────────────────────────────────────────────────

export interface LotAReprendre extends AdresseImmeuble { id: number; numero: string | null; digicode: boolean | null; code: string | null }

export interface PlanReprise {
  /** Une valeur par adresse, sans ambiguïté : elle passe sur l'immeuble. */
  aReprendre: { cle: string; adresse: AdresseImmeuble; valeur: ValeurDigicode; lots: number[] }[];
  /** Des biens de la même adresse ont des codes DIFFÉRENTS (ou Oui et Non) : rien n'est choisi. */
  aArbitrer: { cle: string; adresse: AdresseImmeuble; lots: { id: number; numero: string | null; digicode: boolean | null; code: string | null }[] }[];
  /** Des biens sans adresse exploitable (pas de voie) : laissés tels quels. */
  sansAdresse: number[];
}

/**
 * LA RÈGLE DE REPRISE (Arno) : pour chaque adresse, si tous les biens qui ont un code ont le MÊME (ou un seul en a un), il
 * passe sur l'immeuble ; s'ils ont des codes DIFFÉRENTS, rien n'est choisi (« à arbitrer »). Sans aucun code : la réponse
 * Oui / Non passe si elle est la même partout, sinon « à arbitrer ». Les codes se comparent sans tenir compte des blancs ni
 * de la casse. Rien n'est supprimé. PUR.
 */
export function planReprise(lots: readonly LotAReprendre[]): PlanReprise {
  const groupes = new Map<string, LotAReprendre[]>();
  const sansAdresse: number[] = [];
  for (const l of lots) {
    const cle = cleImmeubleAdresse(l);
    if (cle === null) { if (l.digicode !== null || texteCode(l.code) !== null) sansAdresse.push(l.id); continue; }
    groupes.set(cle, [...(groupes.get(cle) ?? []), l]);
  }
  const plan: PlanReprise = { aReprendre: [], aArbitrer: [], sansAdresse };
  for (const [cle, g] of groupes) {
    const avecCode = g.filter((l) => texteCode(l.code) !== null);
    const codes = [...new Set(avecCode.map((l) => (texteCode(l.code) as string).replace(/\s+/g, '').toUpperCase()))];
    const adresse = { voie: g[0].voie, codePostal: g[0].codePostal, commune: g[0].commune };
    const ids = g.map((l) => l.id);
    if (codes.length > 1) {
      plan.aArbitrer.push({ cle, adresse, lots: g.filter((l) => l.digicode !== null || texteCode(l.code) !== null).map((l) => ({ id: l.id, numero: l.numero, digicode: l.digicode, code: l.code })) });
      continue;
    }
    if (codes.length === 1) {
      plan.aReprendre.push({ cle, adresse, valeur: { digicode: true, code: (texteCode(avecCode[0].code) as string).slice(0, MAX_CODE_DIGICODE) }, lots: ids });
      continue;
    }
    const reponses = [...new Set(g.map((l) => l.digicode).filter((x): x is boolean => x !== null))];
    if (reponses.length === 1) plan.aReprendre.push({ cle, adresse, valeur: { digicode: reponses[0], code: null }, lots: ids });
    else if (reponses.length > 1) plan.aArbitrer.push({ cle, adresse, lots: g.filter((l) => l.digicode !== null).map((l) => ({ id: l.id, numero: l.numero, digicode: l.digicode, code: l.code })) });
  }
  return plan;
}
