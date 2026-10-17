/**
 * ══ 🔴🔴 TUILE LOCATION — LE FORMULAIRE COMPLET DU BIEN, « EN ENTONNOIR » (Arno, 17/10/2026) ═════════════════════════
 *
 * MODULE PUR (aucune base) : l'écran ET le serveur appellent les mêmes fonctions — un champ refusé ici l'est partout.
 *
 * « Obligatoires : au moins un propriétaire, l'adresse, le type de logement. Tout le reste facultatif, complétable plus
 * tard. » (Arno) — `manquesDuBien` dit ce qui manque, champ par champ ; `verifierBienComplet` refuse le reste (une
 * surface qui n'est pas un nombre, une classe DPE hors A–G…).
 * Les champs déjà connus (étage, porte, n° de lot, Carrez, extérieure, adresse) passent par `verifierChampsBien`, la
 * même vérification que la fiche du bien : une seule règle par champ.
 *
 * ══ FAMILLE DE BIEN (Arno, 17/10/2026) ══════════════════════════════════════════════════════════════════════════════════
 * « Logement » · « Local » (Local commercial / Bureaux) · « Parking nu » (Intérieur / Extérieur ; Place simple · Place
 * double · Box simple · Box double). Obligatoires PAR FAMILLE : le type de logement, le type de local, le type de parking.
 * Un parking nu n'a ni pièces, ni meublé, ni Carrez, ni annexes, ni caractéristiques complémentaires (époque, chauffage,
 * DPE). La famille n'a pas de colonne : elle EST la catégorie (logement / local / parking) — migration 376.
 */
import { verifierChampsBien, type ChampsBien } from './locationBien';
import { lireNombre } from '../gestion/honorairesGestion';

export const TYPES_LOGEMENT = ['appartement', 'chambre', 'studio', 'duplex', 'loft', 'maison', 'autre'] as const; // ordre d'Arno (17/10/2026)
export type TypeLogement = (typeof TYPES_LOGEMENT)[number];
export const LIBELLE_TYPE_LOGEMENT: Record<TypeLogement, string> = {
  appartement: 'Appartement', studio: 'Studio', maison: 'Maison', duplex: 'Duplex', loft: 'Loft', chambre: 'Chambre', autre: 'Autre',
};

/** Les époques de construction proposées (repères des diagnostics : 1949, 1975, 1997, 2012). Texte libre en base. */
export const EPOQUES_CONSTRUCTION = ['Avant 1949', '1949 – 1974', '1975 – 1996', '1997 – 2011', 'Depuis 2012'] as const;
export const CHAUFFAGES = ['Individuel gaz', 'Individuel électrique', 'Collectif', 'Pompe à chaleur', 'Réseau urbain', 'Autre'] as const;
export const CLASSES_DPE = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export const FAMILLES = ['logement', 'local', 'parking'] as const;
export type Famille = (typeof FAMILLES)[number];
/** Le mot du gros bouton. */
export const LIBELLE_FAMILLE: Record<Famille, string> = { logement: 'Logement', local: 'Local', parking: 'Parking nu' };
/** Le nom de la chose, pour adapter les titres et les phrases (« Le local », « à l'adresse du parking »…). */
export const NOM_FAMILLE: Record<Famille, string> = { logement: 'logement', local: 'local', parking: 'parking' };

export const TYPES_LOCAL = ['commercial', 'bureaux'] as const;
export type TypeLocal = (typeof TYPES_LOCAL)[number];
export const LIBELLE_TYPE_LOCAL: Record<TypeLocal, string> = { commercial: 'Local commercial', bureaux: 'Bureaux' };

export const SITUATIONS_PARKING = ['interieur', 'exterieur'] as const;
export type SituationParking = (typeof SITUATIONS_PARKING)[number];
export const LIBELLE_SITUATION_PARKING: Record<SituationParking, string> = { interieur: 'Intérieur', exterieur: 'Extérieur' };

export const TYPES_PARKING = ['place_simple', 'place_double', 'box_simple', 'box_double'] as const;
export type TypeParking = (typeof TYPES_PARKING)[number];
export const LIBELLE_TYPE_PARKING: Record<TypeParking, string> = {
  place_simple: 'Place simple', place_double: 'Place double', box_simple: 'Box simple', box_double: 'Box double',
};

/** La famille d'un bien existant, DÉDUITE de sa catégorie (rien n'est écrit) ; `null` pour une annexe (cave, autre). PUR. */
export function familleDeCategorie(categorie: string | null | undefined): Famille | null {
  if (categorie === 'logement') return 'logement';
  if (categorie === 'local') return 'local';
  if (categorie === 'parking' || categorie === 'box') return 'parking';
  return null;
}

const dans = <T extends string>(liste: readonly T[], v: unknown): T | null =>
  (typeof v === 'string' && (liste as readonly string[]).includes(v) ? v as T : null);
const ouiNon = (v: unknown): boolean | null => (v === true || v === 'oui' ? true : v === false || v === 'non' ? false : null);

export interface ChampsBienComplet extends ChampsBien, ComplementsBien {}

/** Les champs ajoutés par la migration 374 : tous facultatifs (le type n'est exigé qu'à la création). */
export interface ComplementsBien {
  batiment: string | null;
  escalier: string | null;
  typeLogement: TypeLogement | null;
  nombrePieces: number | null;
  meuble: boolean | null;
  surfaceHabitableM2: number | null;
  syndicId: number | null;
  epoqueConstruction: string | null;
  chauffage: string | null;
  dpeClasse: string | null;
  dpeDate: string | null;
  commentaire: string | null;
  // ── migration 376 ──
  typeLocal: TypeLocal | null;
  parkingSituation: SituationParking | null;
  parkingType: TypeParking | null;
  /** Surface d'un parking nu (facultative). */
  surfaceM2: number | null;
  ascenseur: boolean | null;
  digicode: boolean | null;
  digicodeCode: string | null;
  /** « À droite en sortant de l'ascenseur, deuxième porte à gauche ». */
  precisionAcces: string | null;
}

/** Une annexe saisie : ses champs, ses options de parking, et « même adresse » / « autre adresse ». */
export interface AnnexeSaisie extends ChampsBien {
  parkingSituation: SituationParking | null;
  parkingType: TypeParking | null;
  /** Vrai : l'annexe est à une AUTRE adresse (la sienne) ; faux : elle hérite de celle du logement / local. */
  autreAdresse: boolean;
}

/** Les compléments tels que la fiche du bien les affiche (avec le nom du syndic). */
export interface ComplementsFiche extends ComplementsBien { syndicNom: string | null }

export interface SaisieBien {
  proprietaireIds: number[];
  logement: Record<string, unknown>;
  annexes: Record<string, unknown>[];
}

const texte = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, max);
};
const vide = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Ce qui manque pour enregistrer, champ par champ (les obligatoires, PAR FAMILLE). Vide = enregistrable. */
export function manquesDuBien(s: {
  proprietaireIds: readonly number[]; adresse: unknown; famille?: unknown; typeLogement?: unknown; typeLocal?: unknown; parkingType?: unknown;
  annexes?: readonly { autreAdresse?: unknown; adresse?: unknown }[];
}): Record<string, string> {
  const m: Record<string, string> = {};
  const famille = dans(FAMILLES, s.famille);
  // L'ORDRE est celui du formulaire (Arno, 17/10/2026) : propriétaire(s), le bien (famille, type), puis l'adresse.
  if (s.proprietaireIds.length === 0) m.proprietaires = 'Choisissez au moins un propriétaire.';
  if (famille === null) m.famille = 'Choisissez la famille du bien : Logement, Local ou Parking nu.';
  else if (famille === 'logement' && vide(s.typeLogement)) m.typeLogement = 'Le type de logement est obligatoire.';
  else if (famille === 'local' && vide(s.typeLocal)) m.typeLocal = 'Choisissez : Local commercial ou Bureaux.';
  else if (famille === 'parking' && vide(s.parkingType)) m.parkingType = 'Choisissez : Place simple, Place double, Box simple ou Box double.';
  if (vide(s.adresse)) m.adresse = `L’adresse du ${famille === null ? 'bien' : NOM_FAMILLE[famille]} est obligatoire.`;
  (s.annexes ?? []).forEach((a, i) => {
    if (ouiNon(a.autreAdresse) === true && vide(a.adresse)) m[`annexe-${i}`] = `Annexe ${i + 1} : l’autre adresse est à renseigner.`;
  });
  return m;
}

/** Vérifie les champs complémentaires (création ET fiche du bien) : chacun facultatif, refusé s'il est mal formé. */
export function verifierComplements(l: Record<string, unknown>): { ok: true; valeurs: ComplementsBien } | { ok: false; motif: string } {
  const type = texte(l.typeLogement, 20);
  if (type !== null && !(TYPES_LOGEMENT as readonly string[]).includes(type)) return { ok: false, motif: 'Type de logement inconnu.' };
  let pieces: number | null = null;
  if (!vide(l.nombrePieces)) {
    const n = Number(String(l.nombrePieces).trim());
    if (!Number.isInteger(n) || n < 1 || n > 50) return { ok: false, motif: 'Le nombre de pièces doit être un entier entre 1 et 50.' };
    pieces = n;
  }
  let habitable: number | null = null;
  if (!vide(l.surfaceHabitableM2)) {
    const n = lireNombre(typeof l.surfaceHabitableM2 === 'number' ? l.surfaceHabitableM2 : String(l.surfaceHabitableM2));
    if (n === null || n < 0 || n > 100_000) return { ok: false, motif: 'La surface habitable doit être un nombre de m² (ex. 41,8).' };
    habitable = n;
  }
  const meuble = l.meuble === true || l.meuble === 'oui' ? true : l.meuble === false || l.meuble === 'non' ? false : null;
  let syndicId: number | null = null;
  if (!vide(l.syndicId)) {
    const n = Number(l.syndicId);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, motif: 'Syndic inconnu.' };
    syndicId = n;
  }
  const dpe = texte(l.dpeClasse, 1);
  if (dpe !== null && !(CLASSES_DPE as readonly string[]).includes(dpe.toUpperCase())) return { ok: false, motif: 'La classe DPE va de A à G.' };
  const dpeDate = texte(l.dpeDate, 10);
  if (dpeDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dpeDate)) return { ok: false, motif: 'La date du DPE n’est pas une date valide.' };
  if (!vide(l.typeLocal) && dans(TYPES_LOCAL, l.typeLocal) === null) return { ok: false, motif: 'Type de local inconnu.' };
  if (!vide(l.parkingSituation) && dans(SITUATIONS_PARKING, l.parkingSituation) === null) return { ok: false, motif: 'Situation du parking inconnue.' };
  if (!vide(l.parkingType) && dans(TYPES_PARKING, l.parkingType) === null) return { ok: false, motif: 'Type de parking inconnu.' };
  let surface: number | null = null;
  if (!vide(l.surfaceM2)) {
    const n = lireNombre(typeof l.surfaceM2 === 'number' ? l.surfaceM2 : String(l.surfaceM2));
    if (n === null || n < 0 || n > 100_000) return { ok: false, motif: 'La surface doit être un nombre de m² (ex. 12,5).' };
    surface = n;
  }
  const digicode = ouiNon(l.digicode);
  // Le code du digicode : 8 caractères au plus (Arno, 17/10/2026), et seulement si digicode = oui.
  if (digicode === true && typeof l.digicodeCode === 'string' && l.digicodeCode.trim().length > 8) {
    return { ok: false, motif: 'Le code du digicode fait 8 caractères au plus.' };
  }
  return {
    ok: true,
    valeurs: {
      batiment: texte(l.batiment, 40), escalier: texte(l.escalier, 40), typeLogement: type as TypeLogement | null,
      nombrePieces: pieces, meuble, surfaceHabitableM2: habitable, syndicId,
      epoqueConstruction: texte(l.epoqueConstruction, 40), chauffage: texte(l.chauffage, 60),
      dpeClasse: dpe === null ? null : dpe.toUpperCase(), dpeDate, commentaire: texte(l.commentaire, 4000),
      typeLocal: dans(TYPES_LOCAL, l.typeLocal), parkingSituation: dans(SITUATIONS_PARKING, l.parkingSituation),
      parkingType: dans(TYPES_PARKING, l.parkingType), surfaceM2: surface,
      ascenseur: ouiNon(l.ascenseur), digicode, digicodeCode: digicode === true ? texte(l.digicodeCode, 8) : null,
      precisionAcces: texte(l.precisionAcces, 500),
    },
  };
}

/** Vérifie la saisie complète : les obligatoires (par famille), puis chaque champ facultatif renseigné. */
export function verifierBienComplet(s: SaisieBien):
  { ok: true; proprietaireIds: number[]; famille: Famille; logement: ChampsBienComplet; annexes: AnnexeSaisie[] } | { ok: false; motif: string } {
  const ids = [...new Set((Array.isArray(s.proprietaireIds) ? s.proprietaireIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const l = s.logement ?? {};
  const brutes = Array.isArray(s.annexes) ? s.annexes : [];
  const manque = Object.values(manquesDuBien({
    proprietaireIds: ids, adresse: l.adresse, famille: l.famille, typeLogement: l.typeLogement, typeLocal: l.typeLocal, parkingType: l.parkingType,
    annexes: brutes.map((a) => ({ autreAdresse: a.autreAdresse, adresse: a.adresse })),
  }));
  if (manque.length > 0) return { ok: false, motif: manque.join(' ') };
  const famille = dans(FAMILLES, l.famille) as Famille;
  const base = verifierChampsBien({ ...l, categorie: famille });
  if (!base.ok) return base;
  const comp = verifierComplements(l);
  if (!comp.ok) return comp;
  const c = comp.valeurs;
  if (famille === 'logement' && c.typeLogement === null) return { ok: false, motif: 'Type de logement inconnu.' };
  if (famille === 'parking' && brutes.length > 0) return { ok: false, motif: 'Un parking nu n’a pas d’annexe.' };

  // Ce qui n'a pas de sens pour la famille n'est jamais enregistré (une saisie restée d'une autre famille est ignorée).
  const logement: ChampsBienComplet = {
    ...base.valeurs, ...c, categorie: famille,
    typeLogement: famille === 'logement' ? c.typeLogement : null,
    meuble: famille === 'logement' ? c.meuble : null,
    nombrePieces: famille === 'parking' ? null : c.nombrePieces,
    surfaceCarrezM2: famille === 'parking' ? null : base.valeurs.surfaceCarrezM2,
    surfaceHabitableM2: famille === 'parking' ? null : c.surfaceHabitableM2,
    surfaceExterieureM2: famille === 'parking' ? null : base.valeurs.surfaceExterieureM2,
    surfaceM2: famille === 'parking' ? c.surfaceM2 : null,
    typeLocal: famille === 'local' ? c.typeLocal : null,
    parkingSituation: famille === 'parking' ? c.parkingSituation : null,
    parkingType: famille === 'parking' ? c.parkingType : null,
    epoqueConstruction: famille === 'parking' ? null : c.epoqueConstruction,
    chauffage: famille === 'parking' ? null : c.chauffage,
    dpeClasse: famille === 'parking' ? null : c.dpeClasse,
    dpeDate: famille === 'parking' ? null : c.dpeDate,
  };

  const annexes: AnnexeSaisie[] = [];
  for (const a of brutes) {
    const autre = ouiNon(a.autreAdresse) === true;
    const v = verifierChampsBien(autre ? a : { ...a, adresse: null, codePostal: null, commune: null });
    if (!v.ok) return v;
    if (v.valeurs.categorie === null || v.valeurs.categorie === 'logement' || v.valeurs.categorie === 'local') {
      return { ok: false, motif: 'Une annexe est une cave, un parking ou une autre annexe.' };
    }
    const parking = v.valeurs.categorie === 'parking' || v.valeurs.categorie === 'box';
    if (parking && !vide(a.parkingType) && dans(TYPES_PARKING, a.parkingType) === null) return { ok: false, motif: 'Type de parking inconnu.' };
    if (parking && !vide(a.parkingSituation) && dans(SITUATIONS_PARKING, a.parkingSituation) === null) return { ok: false, motif: 'Situation du parking inconnue.' };
    annexes.push({
      ...v.valeurs, autreAdresse: autre,
      parkingSituation: parking ? dans(SITUATIONS_PARKING, a.parkingSituation) : null,
      parkingType: parking ? dans(TYPES_PARKING, a.parkingType) : null,
    });
  }
  return { ok: true, proprietaireIds: ids, famille, annexes, logement };
}
