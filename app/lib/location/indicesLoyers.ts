/**
 * ══ 🔴 Arno (25/10/2026) — LES INDICES DE RÉVISION DES LOYERS (module PUR, écran et serveur) ═════════════════════════════════════════
 *   · les types : IRL (logement), ILC (local commercial), ILAT (local d'activité / bureau), ICC (ancien bail le prévoyant) ;
 *   · la présélection selon le type de bien : Logement → IRL, Local → ILC, Parking → IRL (modifiable) ;
 *   · la liste des indices DÉJÀ SAISIS d'un type, du plus récent au plus ancien : « T2 2026 — 146,68 · dernière utilisation le
 *     12/10/2026 » (ou « jamais utilisé ») — la dernière utilisation = la date d'entrée la plus récente d'un bail qui l'utilise ;
 *   · un NOUVEL indice : trimestre (T1–T4 + année) et valeur (3 décimales au plus) ; un doublon (même type + trimestre) est refusé,
 *     avec la valeur existante ; une valeur différente d'un doublon le DIT (rien n'est écrasé en silence : on corrige dans « Indices ») ;
 *   · la date de révision annuelle : par défaut l'anniversaire de la date d'entrée (un an après), modifiable.
 */

export const TYPES_INDICE = ['irl', 'ilc', 'ilat', 'icc'] as const;
export type TypeIndice = (typeof TYPES_INDICE)[number];
export const LIBELLE_TYPE_INDICE: Record<TypeIndice, string> = {
  irl: 'IRL (logement)', ilc: 'ILC (local commercial)', ilat: 'ILAT (local d’activité / bureau)', icc: 'ICC (ancien bail le prévoyant)',
};
export const SIGLE_INDICE: Record<TypeIndice, string> = { irl: 'IRL', ilc: 'ILC', ilat: 'ILAT', icc: 'ICC' };

/** Un indice saisi dans l'outil (sa valeur EN VIGUEUR), et la date d'entrée la plus récente d'un bail qui l'utilise. */
export interface IndiceSaisi { type: TypeIndice; annee: number; trimestre: number; valeur: number; derniereUtilisation: string | null }

/** La clé d'un trimestre dans un champ de choix : « 2026-2 ». */
export const cleTrimestre = (annee: number, trimestre: number): string => `${annee}-${trimestre}`;
export function lireCleTrimestre(cle: string): { annee: number; trimestre: number } | null {
  const m = /^(\d{4})-([1-4])$/.exec(cle.trim());
  return m === null ? null : { annee: Number(m[1]), trimestre: Number(m[2]) };
}
export const libelleTrimestre = (annee: number, trimestre: number): string => `T${trimestre} ${annee}`;

/** « 146,68 » (jusqu'à 3 décimales, sans zéros inutiles). */
export const valeurIndiceTexte = (v: number): string => String(Math.round(v * 1000) / 1000).replace('.', ',');
const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');

/** La ligne d'un indice dans la liste : « T2 2026 — 146,68 · dernière utilisation le 12/10/2026 » / « · jamais utilisé ». PUR. */
export function libelleIndice(i: Pick<IndiceSaisi, 'annee' | 'trimestre' | 'valeur' | 'derniereUtilisation'>): string {
  return `${libelleTrimestre(i.annee, i.trimestre)} — ${valeurIndiceTexte(i.valeur)} · ${i.derniereUtilisation === null ? 'jamais utilisé' : `dernière utilisation le ${dateFr(i.derniereUtilisation)}`}`;
}

/** Les indices d'un type, du plus récent au plus ancien. PUR. */
export function indicesDuType(indices: readonly IndiceSaisi[], type: TypeIndice | null): IndiceSaisi[] {
  return indices.filter((i) => i.type === type).sort((a, b) => b.annee - a.annee || b.trimestre - a.trimestre);
}

/** La présélection du type selon le bien : Logement → IRL, Local → ILC, Parking → IRL ; inconnu → IRL. PUR. */
export function typeIndiceParDefaut(famille: string | null | undefined): TypeIndice {
  return famille === 'local' ? 'ilc' : 'irl';
}

/** La date de révision annuelle par défaut : l'anniversaire de la date d'entrée (un an après). `''` sans date d'entrée valide. PUR. */
export function revisionParDefaut(dateEntree: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateEntree ?? '');
  if (m === null) return '';
  const [a, mo, j] = [Number(m[1]) + 1, Number(m[2]), Number(m[3])];
  // Un 29 février tombe le 28 février l'année suivante (non bissextile).
  const dernier = new Date(Date.UTC(a, mo, 0)).getUTCDate();
  return `${a}-${String(mo).padStart(2, '0')}-${String(Math.min(j, dernier)).padStart(2, '0')}`;
}

/** Une valeur d'indice saisie (« 146,68 », « 146.684 ») → nombre ; `undefined` : illisible, ≤ 0, ou plus de 3 décimales. PUR. */
export function lireValeurIndice(brut: unknown): number | undefined {
  const t = (typeof brut === 'number' ? String(brut) : typeof brut === 'string' ? brut : '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(t)) return undefined;
  const v = Number(t);
  return v > 0 ? v : undefined;
}

/** Un nouvel indice vérifié, ou le refus — doublon compris (avec la valeur existante). PUR. */
export function verifierNouvelIndice(brut: unknown, existants: readonly IndiceSaisi[]):
  { ok: true; indice: { type: TypeIndice; annee: number; trimestre: number; valeur: number } } | { ok: false; motif: string; existant?: IndiceSaisi } {
  const b = (brut ?? {}) as Record<string, unknown>;
  const type = (TYPES_INDICE as readonly string[]).includes(String(b.type)) ? b.type as TypeIndice : null;
  if (type === null) return { ok: false, motif: 'Type d’indice : IRL, ILC, ILAT ou ICC.' };
  const annee = Number(b.annee);
  const trimestre = Number(b.trimestre);
  if (!Number.isInteger(annee) || annee < 1950 || annee > 2200) return { ok: false, motif: 'Année de l’indice : quatre chiffres (ex. 2026).' };
  if (!Number.isInteger(trimestre) || trimestre < 1 || trimestre > 4) return { ok: false, motif: 'Trimestre de l’indice : T1, T2, T3 ou T4.' };
  const valeur = lireValeurIndice(b.valeur);
  if (valeur === undefined) return { ok: false, motif: 'Valeur de l’indice : un nombre positif, trois décimales au plus (ex. 146,68).' };
  const deja = existants.find((i) => i.type === type && i.annee === annee && i.trimestre === trimestre);
  if (deja !== undefined) {
    const t = `${SIGLE_INDICE[type]} ${libelleTrimestre(annee, trimestre)}`;
    return { ok: false, existant: deja, motif: Math.abs(deja.valeur - valeur) < 0.0005
      ? `L’indice ${t} existe déjà (${valeurIndiceTexte(deja.valeur)}) : il est choisi dans la liste.`
      : `L’indice ${t} existe déjà avec la valeur ${valeurIndiceTexte(deja.valeur)}, différente de celle saisie (${valeurIndiceTexte(valeur)}) : rien n’est écrasé. `
        + 'Si la valeur enregistrée est fausse, corrigez-la dans Paramètres Location › Indices.' };
  }
  return { ok: true, indice: { type, annee, trimestre, valeur } };
}

/** La saisie du bloc « Indice des loyers » (écran). `reference` : la clé du trimestre choisi (« 2026-2 »), `''` sinon. */
export interface SaisieIndice { type: TypeIndice | null; reference: string; revision: string }
export const INDICE_VIDE: SaisieIndice = { type: null, reference: '', revision: '' };

/** Ce qui manque au bloc (dans son ordre) : les trois champs sont OBLIGATOIRES. PUR. */
export function manquesIndice(brut: unknown): Record<string, string> {
  const b = (brut ?? {}) as Record<string, unknown>;
  const m: Record<string, string> = {};
  if (!(TYPES_INDICE as readonly string[]).includes(String(b.type))) m['indice-type'] = 'Indice des loyers : le type d’indice (IRL, ILC, ILAT ou ICC).';
  if (lireCleTrimestre(String(b.reference ?? '')) === null) m['indice-reference'] = 'Indice des loyers : l’indice appliqué (ou « + Saisir un nouvel indice »).';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.revision ?? ''))) m['indice-revision'] = 'Indice des loyers : la date de révision annuelle.';
  return m;
}

/** L'indice du bail, tel qu'il s'enregistre : type, trimestre de référence, date de révision annuelle. */
export interface IndiceBail { type: TypeIndice; annee: number; trimestre: number; revision: string;
  /** La valeur relevée à l'enregistrement (trace, relue seulement) ; absente d'une saisie. */
  valeur?: number | null }
/** La saisie vérifiée → l'indice du bail ; null si un champ manque. PUR. */
export function indiceDuBail(brut: unknown): IndiceBail | null {
  if (Object.keys(manquesIndice(brut)).length > 0) return null;
  const b = brut as Record<string, unknown>;
  const r = lireCleTrimestre(String(b.reference)) as { annee: number; trimestre: number };
  return { type: b.type as TypeIndice, annee: r.annee, trimestre: r.trimestre, revision: String(b.revision) };
}
