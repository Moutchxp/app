/**
 * ══ 🔴🔴 TUILE LOCATION — LE BIEN ET SES ANNEXES (correction d'Arno du 17/10/2026) ═══════════════════════════════════
 *
 * MODULE PUR (aucune base) : lu par le dépôt de la Location ET par ses écrans. Seules les DONNÉES sont communes avec la
 * Gestion (personnes, biens, annexes, locations) ; les écrans vivent dans /admin/location.
 *
 * « Fiche du bien : adresse, étage, surface Carrez, surface extérieure, n° de porte, n° de lot de copropriété ; annexes
 * (cave, parking) EN ARBRE sous leur logement, avec étage, n° de lot, n° de porte ou de place. Une annexe garde toujours
 * son lien avec le logement d'origine. » (Arno)
 */
import { lireNombre } from '../gestion/honorairesGestion';

export const CATEGORIES = ['logement', 'cave', 'parking', 'box', 'local', 'autre'] as const;
export type Categorie = (typeof CATEGORIES)[number];

export const LIBELLE_CATEGORIE: Record<Categorie, string> = {
  logement: 'Logement', cave: 'Cave', parking: 'Parking', box: 'Box', local: 'Local', autre: 'Autre',
};
/** Une annexe ne peut pas être un logement : ce sont les seules catégories proposées sous « + Annexe ». */
export const CATEGORIES_ANNEXE: readonly Categorie[] = ['cave', 'parking', 'box', 'autre'];

/**
 * La catégorie d'un bien : celle saisie dans l'application, sinon déduite de la nature WIPPIMMO (« Parking » / « Garage »
 * → parking, « Cave » → cave, « Local commercial » → local), sinon logement. Rien n'est écrit en base par cette déduction.
 */
export function categorieDuBien(o: { categorie: string | null; nature: string | null; typeBien: string | null }): Categorie {
  if (o.categorie !== null && (CATEGORIES as readonly string[]).includes(o.categorie)) return o.categorie as Categorie;
  const t = `${o.nature ?? ''} ${o.typeBien ?? ''}`.toLowerCase();
  if (/parking|garage|stationnement/.test(t)) return 'parking';
  if (/\bbox\b/.test(t)) return 'box';
  if (/\bcave\b/.test(t)) return 'cave';
  if (/local|commerc|bureau/.test(t)) return 'local';
  return 'logement';
}

export interface ChampsBien {
  categorie: Categorie | null;
  etage: string | null;
  porte: string | null;
  numLotCopro: string | null;
  surfaceCarrezM2: number | null;
  surfaceExterieureM2: number | null;
  adresse: string | null;
  codePostal: string | null;
  commune: string | null;
}

const texte = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
};

/** Vérifie les champs d'un bien saisis à l'écran (écran ET serveur appellent la même fonction). Tout est facultatif. */
export function verifierChampsBien(brut: Record<string, unknown>): { ok: true; valeurs: ChampsBien } | { ok: false; motif: string } {
  const surface = (v: unknown, mot: string): number | null | string => {
    if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return null;
    const n = lireNombre(typeof v === 'number' ? v : String(v));
    if (n === null || n < 0 || n > 100_000) return `La surface ${mot} doit être un nombre de m² (ex. 41,8).`;
    return n;
  };
  const carrez = surface(brut.surfaceCarrezM2, 'Carrez');
  if (typeof carrez === 'string') return { ok: false, motif: carrez };
  const ext = surface(brut.surfaceExterieureM2, 'extérieure');
  if (typeof ext === 'string') return { ok: false, motif: ext };
  const cat = texte(brut.categorie, 20);
  if (cat !== null && !(CATEGORIES as readonly string[]).includes(cat)) return { ok: false, motif: 'Catégorie de bien inconnue.' };
  const cp = texte(brut.codePostal, 10);
  if (cp !== null && !/^\d{5}$/.test(cp)) return { ok: false, motif: 'Le code postal doit compter 5 chiffres.' };
  return {
    ok: true,
    valeurs: {
      categorie: cat as Categorie | null,
      etage: texte(brut.etage, 40), porte: texte(brut.porte, 40), numLotCopro: texte(brut.numLotCopro, 40),
      surfaceCarrezM2: carrez, surfaceExterieureM2: ext,
      adresse: texte(brut.adresse, 300), codePostal: cp, commune: texte(brut.commune, 200),
    },
  };
}

/** « 3e étage », « RDC », « sous-sol 1 » : l'étage tel qu'on l'a saisi ; un nombre seul devient « Ne étage ». */
export function libelleEtage(etage: string | null): string | null {
  if (etage === null) return null;
  const n = /^-?\d+$/.test(etage) ? Number(etage) : null;
  if (n === null) return etage;
  if (n === 0) return 'rez-de-chaussée';
  if (n < 0) return `sous-sol ${-n}`;
  return n === 1 ? '1er étage' : `${n}e étage`;
}

/** Une ligne courte de caractéristiques : « 3e étage · porte G · lot de copro n° 27 · Carrez 41,8 m² · ext. 4 m² ». */
export function resumeBien(b: {
  etage: string | null; porte: string | null; numLotCopro: string | null;
  surfaceCarrezM2: number | null; surfaceExterieureM2: number | null; categorie: Categorie;
}): string {
  const m2 = (n: number): string => `${String(n).replace('.', ',')} m²`;
  return [
    libelleEtage(b.etage),
    b.porte === null ? null : `${b.categorie === 'parking' || b.categorie === 'box' ? 'place' : 'porte'} ${b.porte}`,
    b.numLotCopro === null ? null : `lot de copro n° ${b.numLotCopro}`,
    b.surfaceCarrezM2 === null ? null : `Carrez ${m2(b.surfaceCarrezM2)}`,
    b.surfaceExterieureM2 === null ? null : `ext. ${m2(b.surfaceExterieureM2)}`,
  ].filter((x) => x !== null).join(' · ');
}

/** Un bien tel que les listes et l'arbre le reçoivent. */
export interface BienLocation {
  id: number;
  numero: string;
  adresse: string | null; codePostal: string | null; commune: string | null;
  nature: string | null; typeBien: string | null;
  categorie: Categorie;
  etage: string | null; porte: string | null; numLotCopro: string | null;
  surfaceCarrezM2: number | null; surfaceExterieureM2: number | null;
  /** L'identifiant du logement d'origine quand ce bien est une annexe ; `null` sinon. */
  parentId: number | null;
  proprietaire: string | null;
  locataireEnPlace: string | null;
  creeDansLApplication: boolean;
  /** Sorti du portefeuille (migration 373) : reste visible, marqué « sorti ». */
  sorti?: boolean;
  /** Annexe à une autre adresse que son logement / local (migration 376). */
  adresseAutre?: boolean;
  /** Parking (nu ou annexe) : intérieur / extérieur ; place simple / double, box simple / double (migration 376). */
  parkingSituation?: string | null;
  parkingType?: string | null;
}

/** Range des biens en arbre : chaque logement suivi de ses annexes ; les annexes dont le logement est absent restent seules. */
export function enArbre<T extends { id: number; parentId: number | null }>(biens: readonly T[]): { bien: T; annexes: T[] }[] {
  const ids = new Set(biens.map((b) => b.id));
  const annexes = new Map<number, T[]>();
  for (const b of biens) {
    if (b.parentId !== null && ids.has(b.parentId)) annexes.set(b.parentId, [...(annexes.get(b.parentId) ?? []), b]);
  }
  return biens.filter((b) => b.parentId === null || !ids.has(b.parentId)).map((b) => ({ bien: b, annexes: annexes.get(b.id) ?? [] }));
}
