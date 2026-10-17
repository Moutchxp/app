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
 */
import { verifierChampsBien, type ChampsBien } from './locationBien';
import { lireNombre } from '../gestion/honorairesGestion';

export const TYPES_LOGEMENT = ['appartement', 'studio', 'maison', 'duplex', 'loft', 'chambre', 'autre'] as const;
export type TypeLogement = (typeof TYPES_LOGEMENT)[number];
export const LIBELLE_TYPE_LOGEMENT: Record<TypeLogement, string> = {
  appartement: 'Appartement', studio: 'Studio', maison: 'Maison', duplex: 'Duplex', loft: 'Loft', chambre: 'Chambre', autre: 'Autre',
};

/** Les époques de construction proposées (repères des diagnostics : 1949, 1975, 1997, 2012). Texte libre en base. */
export const EPOQUES_CONSTRUCTION = ['Avant 1949', '1949 – 1974', '1975 – 1996', '1997 – 2011', 'Depuis 2012'] as const;
export const CHAUFFAGES = ['Individuel gaz', 'Individuel électrique', 'Collectif', 'Pompe à chaleur', 'Réseau urbain', 'Autre'] as const;
export const CLASSES_DPE = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

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

/** Ce qui manque pour enregistrer, champ par champ (les trois seuls obligatoires). Vide = enregistrable. */
export function manquesDuBien(s: { proprietaireIds: readonly number[]; adresse: unknown; typeLogement: unknown }): Record<string, string> {
  const m: Record<string, string> = {};
  if (s.proprietaireIds.length === 0) m.proprietaires = 'Choisissez au moins un propriétaire.';
  if (vide(s.adresse)) m.adresse = 'L’adresse du logement est obligatoire.';
  if (vide(s.typeLogement)) m.typeLogement = 'Le type de logement est obligatoire.';
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
  return {
    ok: true,
    valeurs: {
      batiment: texte(l.batiment, 40), escalier: texte(l.escalier, 40), typeLogement: type as TypeLogement | null,
      nombrePieces: pieces, meuble, surfaceHabitableM2: habitable, syndicId,
      epoqueConstruction: texte(l.epoqueConstruction, 40), chauffage: texte(l.chauffage, 60),
      dpeClasse: dpe === null ? null : dpe.toUpperCase(), dpeDate, commentaire: texte(l.commentaire, 4000),
    },
  };
}

/** Vérifie la saisie complète : les obligatoires, puis chaque champ facultatif renseigné. */
export function verifierBienComplet(s: SaisieBien):
  { ok: true; proprietaireIds: number[]; logement: ChampsBienComplet; annexes: ChampsBien[] } | { ok: false; motif: string } {
  const ids = [...new Set((Array.isArray(s.proprietaireIds) ? s.proprietaireIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const l = s.logement ?? {};
  const manque = Object.values(manquesDuBien({ proprietaireIds: ids, adresse: l.adresse, typeLogement: l.typeLogement }));
  if (manque.length > 0) return { ok: false, motif: manque.join(' ') };
  const base = verifierChampsBien({ ...l, categorie: 'logement' });
  if (!base.ok) return base;

  const comp = verifierComplements(l);
  if (!comp.ok) return comp;
  if (comp.valeurs.typeLogement === null) return { ok: false, motif: 'Type de logement inconnu.' };

  const annexes: ChampsBien[] = [];
  for (const a of Array.isArray(s.annexes) ? s.annexes : []) {
    const v = verifierChampsBien(a);
    if (!v.ok) return v;
    if (v.valeurs.categorie === null || v.valeurs.categorie === 'logement') return { ok: false, motif: 'Une annexe est une cave, un parking ou une autre annexe.' };
    annexes.push(v.valeurs);
  }
  return {
    ok: true, proprietaireIds: ids, annexes,
    logement: { ...base.valeurs, categorie: 'logement', ...comp.valeurs },
  };
}
