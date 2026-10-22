import type { MoisExcel, LigneExcel } from './lectureExcel';
import type { ModePrime, OrigineContact, TypeApporteur } from './suivi';
import type { ActiviteCalcul, Retrocession } from './tableauBord';

/**
 * ══ LOCATION — « OUTILS DE SUIVI » : DU FICHIER D'ARNO AUX LIGNES D'ACTIVITÉ (Arno, 22/10/2026) ═════════════════════════════
 * Ce que le script d'import écrit, et ce que les tests recalculent : une ligne d'activité par ligne du fichier, avec la
 * commission d'apporteur et la prime TELLES QUE DANS LE FICHIER (saisies, jamais recalculées : les totaux retombent au centime),
 * la date de signature au 1er du mois (marquée « supposée » : le fichier ne la donne pas), l'apporteur reconnu par son nom.
 * PUR.
 */

const norm = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface ApporteurLu { nom: string; type: TypeApporteur }

/**
 * La colonne « APPORTEURS D'AFFAIRES » → un apporteur :
 *  · « Internet » → Internet ; « Agence Puteaux » → une agence ;
 *  · un collaborateur de l'agence (« Jean-Baptiste Pons », « Arnaud Jorel ») → collaborateur ;
 *  · « Jean-Baptiste ( Julien Deblois) » → l'apporteur est celui entre parenthèses (Julien Deblois), partenaire externe ;
 *  · tout autre nom → partenaire externe.
 */
export function apporteurDeTexte(texte: string | null, collaborateurs: readonly string[]): ApporteurLu | null {
  if (texte === null || texte.trim() === '') return null;
  const brut = texte.replace(/\s+/g, ' ').trim();
  const entre = brut.match(/\(\s*([^)]+?)\s*\)/);
  const nom = (entre ? entre[1] : brut).trim();
  const n = norm(nom);
  if (n === 'internet') return { nom: 'Internet', type: 'internet' };
  if (n.startsWith('agence')) return { nom, type: 'agence' };
  if (collaborateurs.some((c) => norm(c) === n)) return { nom, type: 'collaborateur' };
  return { nom, type: 'partenaire' };
}

/** Ce que dit la colonne G du fichier, en ORIGINE DU CONTACT (Arno, 23/10/2026, 407). */
export interface OrigineLue {
  origine: OrigineContact | null;
  /** « Collègue directement » : le collègue nommé. */
  collegue: string | null;
  /** « Apporteur d'affaires » : l'apporteur à rattacher à l'annuaire (créé « à rattacher » s'il n'y est pas). */
  apporteur: ApporteurLu | null;
  /** « Jean-Baptiste ( Julien Deblois) » : un collègue ET un apporteur — à arbitrer par Arno, l'origine reste vide. */
  aArbitrer: boolean;
}

/**
 * La colonne « APPORTEURS D'AFFAIRES » → l'origine du contact (Arno, 23/10/2026) :
 *  · « Internet » → Internet ; « Agence Puteaux », « Agence Courbevoie » → Passage agence ;
 *  · un collègue (Arnaud Jorel, Jean-Baptiste Pons, Cédric Jullien…) → Collègue directement ;
 *  · un partenaire (Frédéric Rousseau, Pierre Thevenin…) → Apporteur d'affaires — son collègue n'est JAMAIS deviné ;
 *  · « X ( Y) » → à arbitrer : l'origine reste vide, Y est gardé comme apporteur (sa commission est dans le fichier) ;
 *  · vide → origine non renseignée. PUR.
 */
export function origineDeTexte(texte: string | null, collegues: readonly string[]): OrigineLue {
  const vide: OrigineLue = { origine: null, collegue: null, apporteur: null, aArbitrer: false };
  if (texte === null || texte.trim() === '') return vide;
  const brut = texte.replace(/\s+/g, ' ').trim();
  const n = norm(brut);
  if (n === 'internet') return { ...vide, origine: 'internet' };
  if (n.startsWith('agence')) return { ...vide, origine: 'passage_agence' };
  const entre = brut.match(/\(\s*([^)]+?)\s*\)/);
  if (entre) return { ...vide, apporteur: { nom: entre[1].trim(), type: 'partenaire' }, aArbitrer: true };
  const collegue = collegues.find((c) => norm(c) === n);
  if (collegue !== undefined) return { ...vide, origine: 'collegue', collegue: brut };
  return { ...vide, origine: 'apporteur', apporteur: { nom: brut, type: 'partenaire' } };
}

/** La prime du fichier → le choix de prime : 150 → « 150 € » (la règle) ; 0 → « Aucune » ; autre (15, 50) → « Personnalisé ». */
export const modePrimeDe = (prime: number): ModePrime => (prime === 0 ? 'aucune' : prime === 150 ? 'regle' : 'personnalise');

export const typeDeLigne = (l: LigneExcel): ActiviteCalcul['type'] =>
  (l.avenant ? 'avenant' : l.honoProprietaireHt + l.honoLocataireHt === 0 && l.prime > 0 ? 'gestion_seule' : 'bail');

/** Les lignes d'activité d'un mois du fichier (sans rapprochement : les champs de la base restent vides). */
export function activitesDuMois(m: MoisExcel, o: { collaborateurs: readonly string[]; negociateurId?: number | null; negociateurLibelle?: string }): ActiviteCalcul[] {
  return m.lignes.map((l) => {
    const or = origineDeTexte(l.apporteurTexte, o.collaborateurs);
    const ap = or.apporteur;
    return {
      id: l.cle, type: typeDeLigne(l), dateSignature: `${m.mois}-01`, dateSupposee: true,
      libelleProprietaire: l.proprietaire, libelleLocataire: l.locataire,
      honoProprietaireHt: l.honoProprietaireHt, honoLocataireHt: l.honoLocataireHt,
      primeSaisie: l.prime, mandatGestion: l.prime > 0, categoriePrime: l.prime > 0 ? (l.prime < 150 || l.parking ? 'parking' : 'logement') : null,
      apporteurId: null, apporteurNom: ap?.nom ?? null, apporteurTaux: l.tauxCommission, commissionSaisie: l.commission,
      negociateurId: o.negociateurId ?? null, negociateurLibelle: o.negociateurLibelle ?? m.negociateur,
      avecGestion: l.avecGestion === true, origineProprietaire: null, origineLocataire: null,
      loyerHc: null, charges: null, assurance: null, parking: l.parking, vacanceJours: null, rattachement: 'non_rattache',
      origineContact: or.origine, collegueId: null, collegueLibelle: or.collegue, primeMode: modePrimeDe(l.prime),
    };
  });
}

/** La rétrocession du bas de l'onglet (`-F24`, « Alex Coms »), au négociateur du mois. */
export function retrocessionDuMois(m: MoisExcel, o: { negociateurId?: number | null; negociateurLibelle?: string }): Retrocession | null {
  const r = m.totaux.retrocession;
  if (r === null || r.montant <= 0) return null;
  return { negociateurId: o.negociateurId ?? null, negociateurLibelle: o.negociateurLibelle ?? m.negociateur, mois: `${m.mois}-01`, montant: r.montant, libelle: r.libelle };
}
