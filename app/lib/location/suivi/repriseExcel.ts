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

/** Distance d'édition simple (insertion, suppression, substitution). PUR. */
const ecart = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

/**
 * Deux écritures du MÊME apporteur (Arno, 23/10/2026) : « Catherine Tarisse » / « Catherine Tarrisse », « Brahim Boujra » /
 * « Brahim Boujrah » — même prénom, et un nom à UNE lettre près (deux pour un nom de 7 lettres ou plus) ; « Mme Beaucourt » /
 * « Beaucourt » (la civilité ne compte pas, un nom seul de 5 lettres ou plus retrouvé dans l'autre) ; « Maillard Stéphane » /
 * « Stéphane Maillard » (l'ordre ne compte pas). Les accents, la casse et les espaces ne comptent pas. Deux prénoms différents ne
 * sont jamais le même apporteur. PUR.
 */
const CIVILITES = new Set(['m', 'm.', 'mr', 'mme', 'mlle', 'madame', 'monsieur', 'mademoiselle']);
const motsNom = (t: string): string[] => norm(t).replace(/[^a-z0-9 .-]/g, ' ').split(' ').filter((m) => m !== '' && !CIVILITES.has(m));

export function memeApporteur(a: string, b: string): boolean {
  const x = motsNom(a);
  const y = motsNom(b);
  if (x.length === 0 || y.length === 0) return false;
  // « Mme Beaucourt » = « Madame Beaucourt » = « Beaucourt » ; « Maillard Stéphane » = « Stéphane Maillard ».
  if ([...x].sort().join(' ') === [...y].sort().join(' ')) return true;
  if ((x.length === 1 || y.length === 1) && (x.length === 1 ? y : x).includes((x.length === 1 ? x : y)[0]) && (x.length === 1 ? x : y)[0].length >= 5) return true;
  if (x.length < 2 || y.length < 2 || x[0] !== y[0]) return false;
  const nx = x.slice(1).join(' ');
  const ny = y.slice(1).join(' ');
  const tolere = Math.min(nx.length, ny.length) >= 7 ? 2 : Math.min(nx.length, ny.length) >= 4 ? 1 : 0;
  return ecart(nx, ny) <= tolere;
}

/**
 * Les noms d'apporteurs du fichier → leur nom dans l'annuaire, SANS DOUBLON : un nom déjà dans l'annuaire (ou une variante)
 * garde l'écriture de l'annuaire ; sinon la variante la plus fréquente du fichier l'emporte (à égalité : la première vue).
 * Rend la table « écrit → retenu » et les regroupements faits (pour les dire). PUR.
 */
export function canoniserApporteurs(noms: readonly string[], annuaire: readonly string[]): { retenu: Map<string, string>; regroupements: { retenu: string; variantes: string[] }[] } {
  const comptes = new Map<string, number>();
  for (const n of noms) comptes.set(n.trim(), (comptes.get(n.trim()) ?? 0) + 1);
  const groupes: { tete: string; membres: string[] }[] = annuaire.map((a) => ({ tete: a.trim(), membres: [] }));
  const ordre = [...comptes.keys()].sort((a, b) => (comptes.get(b) ?? 0) - (comptes.get(a) ?? 0) || noms.indexOf(a) - noms.indexOf(b));
  for (const n of ordre) {
    const g = groupes.find((x) => memeApporteur(x.tete, n) || x.membres.some((m) => memeApporteur(m, n)));
    if (g) g.membres.push(n); else groupes.push({ tete: n, membres: [n] });
  }
  const retenu = new Map<string, string>();
  for (const g of groupes) for (const m of g.membres) retenu.set(m, g.tete);
  const regroupements = groupes.map((g) => ({ retenu: g.tete, variantes: [...new Set(g.membres)].filter((m) => m !== g.tete) })).filter((g) => g.variantes.length > 0);
  return { retenu, regroupements };
}

/**
 * 🔴 Arno (24/10/2026, validé) — LA CATÉGORIE DE PRIME D'UNE LIGNE REPRISE DU FICHIER : « parking » SEULEMENT si le libellé le dit
 * (parking, park, box, garage, stationnement — `MOTS_PARKING`) OU si le lot rattaché est un parking ; sinon « logement ». Une prime
 * inférieure à 150 € ne suffit PLUS (ZHIVULINA-KOROTICH, prime de 50 € sur un appartement, était classée « parking »). Sans prime :
 * pas de catégorie. PUR.
 */
export const MOTS_PARKING = /\b(parking|park|box|garage|stationnement)\b/i;
export function categoriePrimeImport(o: { prime: number; libelleParking: boolean; lotParking?: boolean | null }): 'parking' | 'logement' | null {
  if (!(o.prime > 0)) return null;
  return o.libelleParking || o.lotParking === true ? 'parking' : 'logement';
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
      primeSaisie: l.prime, mandatGestion: l.prime > 0, categoriePrime: categoriePrimeImport({ prime: l.prime, libelleParking: l.parking }),
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
