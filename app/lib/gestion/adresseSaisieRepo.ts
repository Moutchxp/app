import { colonneExisteMemo } from '../location/sondeLocation';
import { decisionAdresse, metaPropre, motifIntrouvablePersonne, motifServiceMuetPersonne, type AdresseFiche, type MetaAdresse, type NatureAdresse } from './adresseSaisie';
import { etatsAdresses } from './verificationAdresseRepo';

/**
 * ══ 🔴🔴 LE CONTRÔLE DE L'ADRESSE D'UNE PERSONNE, AU SERVEUR (Arno, 17/11/2026, « Adresses uniformisées », lot 2). IMPUR (base, réseau). ═══
 *
 * Appelé AVANT toute écriture par chaque chemin qui écrit l'adresse d'une personne : fiche d'un propriétaire ou d'un locataire (modifier,
 * créer) et carte de contact (garant, contact : poser, modifier). Le serveur ne croit pas l'écran : une adresse « de la liste » est
 * RETROUVÉE dans la Base Adresse Nationale (copie locale, puis service national — seule l'adresse part) ; hors liste et étranger ne
 * passent qu'avec leur confirmation ou leur pays. 🔴 Une adresse qu'on ne touche pas n'est ni revérifiée ni requalifiée.
 * SANS LA MIGRATION 480 : la saisie d'avant (aucun contrôle, rien d'écrit en plus).
 */

/**
 * La migration 480 est-elle passée sur cette table ? ⚠️ La table des cartes de contact ne se nomme que dans son dépôt (règle de la 304) :
 * c'est `partieCategorieRepo` qui la sonde lui-même, par cette fonction.
 */
export const natureAdresseDisponible = (table: string): Promise<boolean> => colonneExisteMemo(table, 'adresse_nature');

export type ControleAdresse =
  | { ok: true; ecrire: false }
  | { ok: true; ecrire: true; nature: NatureAdresse | null; pays: string | null }
  | { ok: false; motif: string };

/**
 * LE CONTRÔLE : `ecrire: false` (adresse non touchée, ou base sans la 480 — `disponible` faux : rien de plus à écrire), `ecrire: true` avec
 * la nature et le pays à poser, ou le refus. `appel` : le transport vers le service national (épreuves).
 */
export async function controlerAdresse(disponible: boolean, avant: AdresseFiche,
  apres: { adresse?: string | null; codePostal?: string | null; commune?: string | null }, meta: MetaAdresse | undefined,
  appel: typeof fetch = fetch): Promise<ControleAdresse> {
  if (!disponible) return { ok: true, ecrire: false };
  // le corps d'une requête n'est jamais cru au-delà de sa forme
  const d = decisionAdresse(avant, apres, meta === undefined ? undefined : metaPropre(meta));
  if (d.etat === 'inchangee') return { ok: true, ecrire: false };
  if (d.etat === 'refus') return { ok: false, motif: d.motif };
  if (d.etat === 'retenue') return { ok: true, ecrire: true, nature: d.nature, pays: d.pays };
  const [etat] = await etatsAdresses([d.adresse], appel);
  if (etat === 'muet') return { ok: false, motif: motifServiceMuetPersonne(d.adresse) };
  if (etat !== 'trouvee') return { ok: false, motif: motifIntrouvablePersonne(d.adresse) };
  return { ok: true, ecrire: true, nature: 'liste', pays: null };
}

/** L'adresse d'une ligne lue en base (`SELECT *`), au format du contrôle. PUR. */
export function adresseDeLaLigne(r: Record<string, unknown>, colonneAdresse: 'adresse' | 'adresse_postale' = 'adresse'): AdresseFiche {
  const t = (x: unknown): string | null => (typeof x === 'string' ? x : null);
  const n = t(r.adresse_nature);
  return { adresse: t(r[colonneAdresse]), codePostal: t(r.code_postal), commune: t(r.commune),
    nature: n === 'liste' || n === 'hors_liste' || n === 'etranger' ? n : null, pays: t(r.adresse_pays) };
}

/** Une fiche NEUVE (création) : aucune adresse avant. */
export const AUCUNE_ADRESSE: AdresseFiche = { adresse: null, codePostal: null, commune: null, nature: null, pays: null };
