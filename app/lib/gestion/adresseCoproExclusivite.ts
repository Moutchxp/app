/**
 * ══ 🔴🔴 UNE ADRESSE N'APPARTIENT QU'À UNE SEULE COPROPRIÉTÉ (Arno, 26/11/2026, 12h50, point 2). MODULE PUR. ════════════════════════════════════════
 *
 * « Lorsque l'on ajoute une adresse postale à une copropriété, elle ne doit pas pouvoir appartenir à 2 copropriétés différentes en même temps ; si cela
 * arrive, une fenêtre s'affiche pour expliquer le conflit et confirmer oui ou non le rattachement de l'adresse en question à la copropriété ouverte, en
 * expliquant que cela l'effacera de l'autre copropriété en conflit. » La comparaison : l'adresse NORMALISÉE (numéro, indice bis / ter / quater, voie ;
 * majuscules, accents, ponctuation ignorés — « 40 Rue Baudin COURBEVOIE » = « 40 rue Baudin Courbevoie », « 40bis » = « 40 bis » = « 40 B »), avec un
 * code postal compatible, ou la même adresse officielle (identifiant BAN). L'adresse PRINCIPALE de l'autre copropriété ne se déplace pas.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg` (l'écran l'importe).
 */
import { cleImmeuble } from './syndics';

const INDICES: Record<string, string> = { b: 'bis', bis: 'bis', t: 'ter', ter: 'ter', q: 'quater', qua: 'quater', quater: 'quater' };

/** La clé de COMPARAISON d'une adresse : la clé normalisée, l'indice écrit en entier et détaché du numéro. PUR. */
export function cleComparable(libelle: string | null | undefined): string {
  return cleImmeuble(libelle).replace(/\b(\d+)\s*(bis|ter|quater|qua|b|t|q)\b/g, (_m, n: string, i: string) => `${n} ${INDICES[i] ?? i}`).replace(/\s+/g, ' ').trim();
}
/** Deux codes postaux compatibles : égaux, ou l'un des deux inconnu. PUR. */
export const codesPostauxCompatibles = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = (a ?? '').trim(); const y = (b ?? '').trim();
  return x === '' || y === '' || x === y;
};

export interface ConflitAdresse {
  /** la clé de l'adresse disputée (dans l'autre copropriété) */
  cle: string;
  ecrite: string;
  copropriete: { id: number; cle: string; libelle: string; nom: string | null; syndic: string | null };
  /** l'adresse est l'adresse PRINCIPALE de l'autre copropriété : déplacement refusé */
  principale: boolean;
  biens: string[];
  digicodes: string[];
  /** la clé de l'adresse de la SAISIE pour laquelle le conflit est levé (refus de l'enregistrement) */
  pour?: string;
}

/** Le nom de l'autre copropriété : son nom, sinon son adresse principale. PUR. */
export const nomCopropriete = (c: ConflitAdresse['copropriete']): string => ((c.nom ?? '').trim() !== '' ? (c.nom as string) : c.libelle);
export const texteConflit = (c: ConflitAdresse): string =>
  `Cette adresse appartient déjà à la copropriété ${nomCopropriete(c.copropriete)}${c.copropriete.syndic ? ` (syndic ${c.copropriete.syndic})` : ' (sans syndic)'}.`;
export const libelleOuiDeplacer = (c: ConflitAdresse): string => `Oui, la rattacher ici et la retirer de ${nomCopropriete(c.copropriete)}`;
export const LIBELLE_NON_DEPLACER = 'Non, ne pas la rattacher';
export const motifPrincipaleAilleurs = (c: ConflitAdresse): string => `C’est l’adresse principale de ${nomCopropriete(c.copropriete)} : changez d’abord son adresse principale.`;
/**
 * 🔴🔴 (décision d'Arno du 26/11/2026, migration 520) LE REFUS DE LA BASE, EN MOTS : l'exclusivité est verrouillée en base (registre
 * gestion_copropriete_adresse_exclusive, index unique « une clé ouverte, une seule copropriété »). Le déclencheur refuse avec un message clair
 * (« Cette adresse appartient déjà à la copropriété … ») : il est relayé tel quel. L'index unique (dernier rempart, deux écritures au même instant)
 * a un message technique : il est remplacé par une phrase claire. Une autre erreur : `null` (elle suit son chemin habituel). PUR.
 */
export const CONTRAINTE_EXCLUSIVITE_ADRESSE = 'gestion_copropriete_adresse_exclusive';
export const INDEX_EXCLUSIVITE_ADRESSE = 'gestion_copropriete_adresse_exclusive_ouverte';
export const MOTIF_EXCLUSIVITE_GENERIQUE = 'Cette adresse appartient déjà à une autre copropriété : rien n’est enregistré. Rechargez la fiche pour voir laquelle.';
export function motifExclusiviteAdresse(e: unknown): string | null {
  if (typeof e !== 'object' || e === null) return null;
  const x = e as { code?: unknown; constraint?: unknown; message?: unknown };
  if (x.code !== '23505') return null;
  if (x.constraint === CONTRAINTE_EXCLUSIVITE_ADRESSE) return typeof x.message === 'string' && x.message.startsWith('Cette adresse appartient déjà') ? x.message : MOTIF_EXCLUSIVITE_GENERIQUE;
  if (x.constraint === INDEX_EXCLUSIVITE_ADRESSE) return MOTIF_EXCLUSIVITE_GENERIQUE;
  return null;
}
export const motifConflitNonConfirme = (c: ConflitAdresse): string =>
  `${c.ecrite} appartient déjà à la copropriété ${nomCopropriete(c.copropriete)} : confirmez son déplacement, ou retirez-la. Rien n’est enregistré.`;
