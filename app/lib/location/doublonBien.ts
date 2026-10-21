import { normaliserTexte } from '../gestion/annuaire';
import { etageDeLaSaisie } from '../gestion/pastillesBien';

/**
 * ══ 🔴 ANTI-DOUBLON DE « NOUVEAU BIEN » (Arno, 21/10/2026). PUR. ═══════════════════════════════════════════════════════════════
 *
 * « À l'enregistrement, si un bien du même propriétaire existe déjà à la même adresse (normalisée) avec le même étage / n° de
 * porte, une modale d'avertissement “Ce bien semble déjà exister” propose “Voir le bien existant” ou “Créer quand même”. Pareil
 * côté serveur pour un second clic rapide. »
 *
 * LA RÈGLE : même adresse (voie + commune, normalisées : accents, casse, ponctuation, espaces) ET même étage ET même n° de porte
 * (vides comparés comme vides) ET, quand les deux la connaissent, même catégorie — un logement et sa cave au même étage ne sont
 * pas un doublon. Ce n'est qu'un AVERTISSEMENT : « Créer quand même » passe toujours.
 */
export interface BienComparable { adresse: string | null; commune: string | null; etage: string | null; porte: string | null; categorie: string | null }

const adresseCle = (b: BienComparable): string => normaliserTexte([b.adresse ?? '', b.commune ?? ''].join(' ')).replace(/\s+/g, ' ').trim();
const etageCle = (e: string | null): string => { const n = etageDeLaSaisie(e); return n === null ? (e ?? '').trim().toLowerCase().replace(/\s+/g, '') : String(n); };
const porteCle = (p: string | null): string => (p ?? '').trim().toLowerCase().replace(/^n°\s*/, '').replace(/\s+/g, '');

/** Vrai si `existant` est le même bien que `nouveau` selon la règle. PUR. */
export function estDoublon(nouveau: BienComparable, existant: BienComparable): boolean {
  const a = adresseCle(nouveau);
  if (a === '' || a !== adresseCle(existant)) return false;
  if (etageCle(nouveau.etage) !== etageCle(existant.etage)) return false;
  if (porteCle(nouveau.porte) !== porteCle(existant.porte)) return false;
  if (nouveau.categorie && existant.categorie && nouveau.categorie !== existant.categorie) return false;
  return true;
}

/** La phrase de l'avertissement. PUR. */
export function phraseDoublon(existant: BienComparable & { id: number }): string {
  const precis = [existant.etage ? `étage ${existant.etage}` : null, existant.porte ? `porte ${existant.porte}` : null].filter((x) => x !== null).join(', ');
  return `Un bien de ce propriétaire existe déjà au ${[existant.adresse, existant.commune].filter((x) => x).join(', ')}${precis ? ` (${precis})` : ''}.`;
}
