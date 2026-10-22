import type { MoisExcel, LigneExcel } from './lectureExcel';
import type { TypeApporteur } from './suivi';
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

export const typeDeLigne = (l: LigneExcel): ActiviteCalcul['type'] =>
  (l.avenant ? 'avenant' : l.honoProprietaireHt + l.honoLocataireHt === 0 && l.prime > 0 ? 'gestion_seule' : 'bail');

/** Les lignes d'activité d'un mois du fichier (sans rapprochement : les champs de la base restent vides). */
export function activitesDuMois(m: MoisExcel, o: { collaborateurs: readonly string[]; negociateurId?: number | null; negociateurLibelle?: string }): ActiviteCalcul[] {
  return m.lignes.map((l) => {
    const ap = apporteurDeTexte(l.apporteurTexte, o.collaborateurs);
    return {
      id: l.cle, type: typeDeLigne(l), dateSignature: `${m.mois}-01`, dateSupposee: true,
      libelleProprietaire: l.proprietaire, libelleLocataire: l.locataire,
      honoProprietaireHt: l.honoProprietaireHt, honoLocataireHt: l.honoLocataireHt,
      primeSaisie: l.prime, mandatGestion: l.prime > 0, categoriePrime: l.prime > 0 ? (l.prime < 150 || l.parking ? 'parking' : 'logement') : null,
      apporteurId: null, apporteurNom: ap?.nom ?? null, apporteurTaux: l.tauxCommission, commissionSaisie: l.commission,
      negociateurId: o.negociateurId ?? null, negociateurLibelle: o.negociateurLibelle ?? m.negociateur,
      avecGestion: l.avecGestion === true, origineProprietaire: null, origineLocataire: null,
      loyerHc: null, charges: null, assurance: null, parking: l.parking, vacanceJours: null, rattachement: 'non_rattache',
    };
  });
}

/** La rétrocession du bas de l'onglet (`-F24`, « Alex Coms »), au négociateur du mois. */
export function retrocessionDuMois(m: MoisExcel, o: { negociateurId?: number | null; negociateurLibelle?: string }): Retrocession | null {
  const r = m.totaux.retrocession;
  if (r === null || r.montant <= 0) return null;
  return { negociateurId: o.negociateurId ?? null, negociateurLibelle: o.negociateurLibelle ?? m.negociateur, mois: `${m.mois}-01`, montant: r.montant, libelle: r.libelle };
}
