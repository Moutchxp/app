import { CATEGORIES_ANNEXE, LIBELLE_CATEGORIE, type Categorie } from '../location/locationBien';
import { estAnnexe, etageDeLaSaisie, motEtage } from './pastillesBien';
import { normaliserTexte } from './annuaire';

/**
 * ══ 🔴 LES ANNEXES EN CASES SOUS LE BIEN PRINCIPAL (Arno, 21/10/2026). PUR, client-safe. ═════════════════════════════════════════
 *
 * « Sur la carte d'un bien principal, juste sous ses informations et au-dessus de “Historique”, UNE CASE PLEINE LARGEUR PAR
 * ANNEXE : type en gras (Cave, Parking, Box…), puis N° affiché, N° de lot, niveau, adresse si elle diffère. En tête de carte,
 * un compteur lisible (« Logement · 2 annexes »). Les annexes ne comptent jamais comme des biens en gestion à part. »
 * Détacher : « Détacher cette cave du logement ? Elle deviendra un bien à part entière, avec le même propriétaire. »
 */
export interface AnnexeAffichee {
  id: number; categorie: string | null; etage: string | null; nature: string | null; typeBien: string | null;
  porte: string | null; numLotCopro: string | null; adresse: string | null; commune: string | null;
}
export interface CandidatRattachement { id: number; adresse: string | null; commune: string | null; categorie: string | null; origine: boolean }

/** Un lot DE TYPE ANNEXE : catégorie cave / parking / box / autre (Location), sinon la nature WIPPIMMO (Parking, Cave…). PUR. */
export function estLotAnnexe(l: { categorie?: string | null; nature: string | null; typeBien: string | null }): boolean {
  if (l.categorie) return (CATEGORIES_ANNEXE as readonly string[]).includes(l.categorie);
  return estAnnexe({ nature: l.nature, typeBien: l.typeBien });
}

/** Le TYPE d'un lot, en mot : la catégorie (« Cave », « Parking ») ; à défaut, le libellé WIPPIMMO ; à défaut « Annexe ». PUR. */
export function typeDuLot(l: { categorie?: string | null; nature: string | null; typeBien: string | null }, defaut = 'Annexe'): string {
  if (l.categorie) return LIBELLE_CATEGORIE[l.categorie as Categorie] ?? l.categorie;
  const t = [l.nature, l.typeBien].map((x) => (x ?? '').trim()).find((x) => x !== '');
  return t ?? defaut;
}

/** Le détail d'une case, après le type : N° affiché, N° de lot, niveau, adresse si elle diffère de celle du bien. PUR. */
export function detailsAnnexe(a: AnnexeAffichee, bien: { adresse: string | null; commune: string | null }): string[] {
  const place = a.categorie === 'parking' || a.categorie === 'box';
  const niveau = (() => {
    const n = etageDeLaSaisie(a.etage);
    if (n === null) return a.etage && a.etage.trim() !== '' ? `Niveau ${a.etage.trim()}` : null;
    return n === 0 ? 'Rez-de-chaussée' : n < 0 ? `Niveau ${n}` : motEtage(n);
  })();
  const autre = normaliserTexte([a.adresse, a.commune].join(' ')) !== normaliserTexte([bien.adresse, bien.commune].join(' '));
  return [
    a.porte ? `${place ? 'Place' : 'N°'} ${a.porte}` : null,
    a.numLotCopro ? `Lot ${a.numLotCopro}` : null,
    niveau,
    autre && (a.adresse || a.commune) ? [a.adresse, a.commune].filter((x) => x).join(', ') : null,
  ].filter((x): x is string => x !== null && x !== '');
}

/** « Logement · 2 annexes » ; `null` sans annexe. PUR. */
export function motCompteur(typePrincipal: string, n: number): string | null {
  return n <= 0 ? null : `${typePrincipal} · ${n} annexe${n > 1 ? 's' : ''}`;
}

/** « Détacher cette cave du logement ? Elle deviendra un bien à part entière, avec le même propriétaire. » PUR. */
export function questionDetacher(annexe: string, principal: string): string {
  const a = annexe.toLowerCase() === 'autre' ? 'annexe' : annexe.toLowerCase();
  const p = principal.toLowerCase();
  const feminin = ['cave', 'place', 'annexe', 'place double'].some((x) => a.startsWith(x));
  return `Détacher ${feminin ? 'cette' : 'ce'} ${a} du ${p} ? ${feminin ? 'Elle' : 'Il'} deviendra un bien à part entière, avec le même propriétaire.`;
}
