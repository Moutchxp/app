/**
 * ══ 🔴🔴 TUILE LOCATION — LES « HONORAIRES PROPRIÉTAIRE » D'UNE ENTRÉE (Arno, 20/10/2026). PUR. ═══════════════════════════
 *
 * « Visite, dossier, rédaction du bail » = surface Carrez/Boutin × tarif de la ZONE ; « État des lieux d'entrée » = surface ×
 * tarif EDL ; « Total honoraires propriétaire » = la somme. Les tarifs (TTC/m²) viennent d'un BARÈME DATÉ en base
 * (`gestion_bareme_honoraires_location`, migration 392) : celui en vigueur à la date d'entrée. La zone vient de la table des
 * zones (`gestion_zone_tendue`) : « très tendue », « tendue » ou « autre ».
 * 🔴 AUCUN ARRONDI DANS LE CALCUL : décimales EXACTES (entiers `bigint` à l'échelle), jamais de flottant. Seul l'AFFICHAGE
 *    arrondit au centime (demi supérieur) ; les totaux partent des valeurs exactes.
 * 🔴 RIEN N'EST INVENTÉ : surface manquante ou aucun barème à la date → pas de calcul, et on dit pourquoi.
 */

const B0 = BigInt(0); const B1 = BigInt(1); const B2 = BigInt(2); const B10 = BigInt(10); const B100 = BigInt(100);
/** 10 puissance k, en entier exact (sans `**`, absent de la cible du projet). */
const pow10 = (k: number): bigint => { let r = B1; for (let i = 0; i < k; i += 1) r *= B10; return r; };

// ── DÉCIMALES EXACTES ────────────────────────────────────────────────────────────────────────────────────────────────

/** Un décimal exact : `n × 10^-echelle`. */
export interface Decimal { n: bigint; echelle: number }

/** « 41,8 », « 41.83 », 12.1 → décimal exact ; `null` si vide, illisible ou négatif. */
export function lireDecimal(brut: unknown): Decimal | null {
  if (brut === null || brut === undefined) return null;
  const texte = (typeof brut === 'number' ? (Number.isFinite(brut) ? String(brut) : '') : typeof brut === 'string' ? brut : '')
    .replace(/[\s  ]/g, '').replace(',', '.');
  const m = /^(\d+)(?:\.(\d+))?$/.exec(texte);
  if (m === null) return null;
  const frac = m[2] ?? '';
  return { n: BigInt(m[1] + frac), echelle: frac.length };
}

const aligner = (a: Decimal, b: Decimal): [bigint, bigint, number] => {
  const e = Math.max(a.echelle, b.echelle);
  return [a.n * pow10(e - a.echelle), b.n * pow10(e - b.echelle), e];
};
export const fois = (a: Decimal, b: Decimal): Decimal => ({ n: a.n * b.n, echelle: a.echelle + b.echelle });
export const plus = (a: Decimal, b: Decimal): Decimal => { const [x, y, e] = aligner(a, b); return { n: x + y, echelle: e }; };
export const ZERO: Decimal = { n: B0, echelle: 0 };
export const deCentimes = (c: number): Decimal => ({ n: BigInt(c), echelle: 2 });

/** Le texte EXACT (« 506.1430 » → « 506.143 ») : ce qui s'enregistre en base (`numeric`). */
export function texteExact(d: Decimal): string {
  const s = d.n.toString().padStart(d.echelle + 1, '0');
  if (d.echelle === 0) return s;
  const entier = s.slice(0, s.length - d.echelle);
  const frac = s.slice(s.length - d.echelle).replace(/0+$/, '');
  return frac === '' ? entier : `${entier}.${frac}`;
}

/** L'AFFICHAGE au centime (demi supérieur) : « 506,14 € ». Jamais réutilisé dans un calcul. */
export function eurosAffiches(d: Decimal): string {
  const [n] = aligner(d, { n: B0, echelle: 2 });
  const e = Math.max(d.echelle, 2);
  const diviseur = pow10(e - 2);
  const centimes = diviseur === B1 ? n : (n + diviseur / B2) / diviseur;
  const euros = centimes / B100;
  const reste = (centimes % B100).toString().padStart(2, '0');
  return `${euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${reste} €`;
}

/** Un tarif au m² affiché (« 12,10 €/m² »), sans rien perdre. */
export function tarifAffiche(d: Decimal): string {
  const t = texteExact(d);
  const [e, f = ''] = t.split('.');
  return `${e},${f.padEnd(2, '0')} €/m²`;
}

// ── LA ZONE ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ZoneHonoraires = 'tres_tendue' | 'tendue' | 'autre';
export const LIBELLE_ZONE: Record<ZoneHonoraires, string> = { tres_tendue: 'zone très tendue', tendue: 'zone tendue', autre: 'autre zone' };

export interface RegleZone { portee: 'departement' | 'commune'; code: string; commune: string | null; tresTendue: boolean }

const sansAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * La zone du bien, d'après la table des zones (la MÊME lecture que le préavis : un département couvre tout code postal qui
 * commence par son numéro ; une commune = code postal ET nom). Une règle « très tendue » l'emporte. Sans code postal : autre.
 */
export function zoneDuBien(lot: { codePostal: string | null; commune: string | null }, regles: readonly RegleZone[]): ZoneHonoraires {
  const cp = (lot.codePostal ?? '').replace(/\s/g, '');
  if (!/^\d{5}$/.test(cp)) return 'autre';
  const touchent = regles.filter((r) => (r.portee === 'departement'
    ? cp.startsWith(r.code.trim())
    : cp === r.code.trim() && r.commune !== null && sansAccents(r.commune) === sansAccents(lot.commune ?? '')));
  if (touchent.some((r) => r.tresTendue)) return 'tres_tendue';
  return touchent.length > 0 ? 'tendue' : 'autre';
}

// ── LE BARÈME ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Bareme {
  id: number; depuis: string;
  tresTendue: string; tendue: string; autre: string; etatDesLieux: string;
  source: string;
}

/** Le barème en vigueur à cette date : le plus récent dont la date d'effet ne la dépasse pas (à égalité : le dernier saisi). */
export function baremeEnVigueur(baremes: readonly Bareme[], date: string): Bareme | null {
  return [...baremes].filter((b) => b.depuis <= date).sort((a, b) => (a.depuis === b.depuis ? b.id - a.id : a.depuis < b.depuis ? 1 : -1))[0] ?? null;
}

const TARIF_ZONE: Record<ZoneHonoraires, keyof Pick<Bareme, 'tresTendue' | 'tendue' | 'autre'>> = { tres_tendue: 'tresTendue', tendue: 'tendue', autre: 'autre' };

/** Le calcul tel qu'il s'affiche ET s'enregistre (les montants en texte EXACT). */
export type CalculHonoraires =
  | { etat: 'ok'; surface: string; zone: ZoneHonoraires; date: string; dateSupposee: boolean; baremeId: number; baremeDepuis: string; source: string;
      tarifZone: string; tarifEdl: string; visiteBail: string; etatDesLieux: string; total: string }
  | { etat: 'surface_manquante'; zone: ZoneHonoraires; date: string; dateSupposee: boolean; motif: string }
  | { etat: 'sans_bareme'; zone: ZoneHonoraires; date: string; dateSupposee: boolean; motif: string };

export const MOTIF_SURFACE_MANQUANTE = 'Surface Carrez/Boutin manquante dans la fiche du bien';

const dateFr = (iso: string): string => iso.split('-').reverse().join('/');

/**
 * LE CALCUL. `date` = la date d'entrée (ou, sans elle, la date du jour — `dateSupposee`, dit à l'écran). PUR.
 */
export function calculerHonorairesProprietaire(o: {
  surface: unknown; zone: ZoneHonoraires; baremes: readonly Bareme[]; date: string; dateSupposee: boolean;
}): CalculHonoraires {
  const surface = lireDecimal(o.surface);
  const base = { zone: o.zone, date: o.date, dateSupposee: o.dateSupposee };
  if (surface === null || surface.n === B0) return { etat: 'surface_manquante', ...base, motif: MOTIF_SURFACE_MANQUANTE };
  const b = baremeEnVigueur(o.baremes, o.date);
  if (b === null) return { etat: 'sans_bareme', ...base, motif: `Aucun barème d’honoraires en vigueur au ${dateFr(o.date)}` };
  const tarifZone = lireDecimal(b[TARIF_ZONE[o.zone]]) ?? ZERO;
  const tarifEdl = lireDecimal(b.etatDesLieux) ?? ZERO;
  const visite = fois(surface, tarifZone);
  const edl = fois(surface, tarifEdl);
  return {
    etat: 'ok', ...base, surface: texteExact(surface), baremeId: b.id, baremeDepuis: b.depuis, source: b.source,
    tarifZone: texteExact(tarifZone), tarifEdl: texteExact(tarifEdl),
    visiteBail: texteExact(visite), etatDesLieux: texteExact(edl), total: texteExact(plus(visite, edl)),
  };
}

/** « Total des honoraires » = honoraires agence (locataire, en centimes, facultatifs) + total honoraires propriétaire. */
export function totalDesHonoraires(honorairesAgenceCentimes: number | null, calcul: CalculHonoraires | null): Decimal | null {
  const proprio = calcul !== null && calcul.etat === 'ok' ? lireDecimal(calcul.total) : null;
  if (honorairesAgenceCentimes === null && proprio === null) return null;
  return plus(honorairesAgenceCentimes === null ? ZERO : deCentimes(honorairesAgenceCentimes), proprio ?? ZERO);
}

/** Vérifie un NOUVEAU barème saisi par un administrateur (écran des honoraires). PUR. */
export function verifierBareme(b: Record<string, unknown>): { ok: true; valeurs: Omit<Bareme, 'id'> } | { ok: false; motif: string } {
  const depuis = typeof b.depuis === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.depuis) ? b.depuis : null;
  if (depuis === null) return { ok: false, motif: 'La date d’effet est obligatoire (JJ/MM/AAAA).' };
  const champs = { tresTendue: 'Zone très tendue', tendue: 'Zone tendue', autre: 'Autres zones', etatDesLieux: 'État des lieux' } as const;
  const valeurs: Record<string, string> = {};
  for (const [k, mot] of Object.entries(champs)) {
    const d = lireDecimal(b[k]);
    if (d === null) return { ok: false, motif: `${mot} : un tarif en euros par m² (ex. 12,10).` };
    valeurs[k] = texteExact(d);
  }
  const source = typeof b.source === 'string' && b.source.trim() !== '' ? b.source.trim().slice(0, 300) : null;
  if (source === null) return { ok: false, motif: 'La source du barème est obligatoire (arrêté, décret…).' };
  return { ok: true, valeurs: { depuis, tresTendue: valeurs.tresTendue, tendue: valeurs.tendue, autre: valeurs.autre, etatDesLieux: valeurs.etatDesLieux, source } };
}

/** Les lignes de l'encadré (et de l'encart de la fiche). PUR. */
export function lignesHonoraires(c: CalculHonoraires): { mot: string; valeur: string; detail?: string }[] {
  if (c.etat !== 'ok') return [];
  const s = c.surface.replace('.', ',');
  return [
    { mot: 'Visite, dossier, rédaction du bail', valeur: eurosAffiches(lireDecimal(c.visiteBail) ?? ZERO),
      detail: `${s} m² × ${tarifAffiche(lireDecimal(c.tarifZone) ?? ZERO)} (${LIBELLE_ZONE[c.zone]})` },
    { mot: 'État des lieux d’entrée', valeur: eurosAffiches(lireDecimal(c.etatDesLieux) ?? ZERO),
      detail: `${s} m² × ${tarifAffiche(lireDecimal(c.tarifEdl) ?? ZERO)}` },
    { mot: 'Total honoraires propriétaire', valeur: eurosAffiches(lireDecimal(c.total) ?? ZERO) },
  ];
}
