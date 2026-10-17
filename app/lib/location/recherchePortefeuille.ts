/**
 * ══ 🔴🔴 TUILE LOCATION — LA RECHERCHE DE L'ACCUEIL (refonte, Arno, 17/10/2026). MODULE PUR. ══════════════════════════
 *
 * « Un seul moteur de recherche. Il cherche : propriétaires, locataires, syndics : nom, téléphone, e-mail ; adresse postale
 * UNIQUEMENT des lots / biens en gestion de notre portefeuille (aucune autre adresse : ni adresse personnelle d'une
 * personne, ni adresse de syndic, ni adresse hors portefeuille). »
 *
 * Ce module ne fait que LIRE ce qui a été tapé : les mots (nom, adresse), les chiffres d'un téléphone, un e-mail. Le
 * dépôt (`portefeuilleRepo.ts`) applique la règle : les personnes et les syndics par nom / téléphone / e-mail, les biens
 * par leur seule adresse, et seulement s'ils sont dans le portefeuille.
 */
import { normaliserTexte } from '../gestion/annuaire';

export interface TermePortefeuille {
  /** Les mots normalisés (minuscules, sans accent), pour le nom et l'adresse. Vide = rien à chercher par les mots. */
  mots: string[];
  /**
   * Les chiffres d'un téléphone, sans indicatif ni zéro initial (« 06 12 34 56 78 », « +33 6 12… » → « 612345678 ») :
   * ils se cherchent DANS les chiffres de la valeur enregistrée, quelle que soit sa forme. `null` sous 6 chiffres.
   */
  chiffres: string | null;
  /** Un e-mail ou un morceau d'e-mail (contient « @ »), en minuscules. */
  email: string | null;
  /** Vrai quand il n'y a rien d'exploitable (moins de 2 caractères). */
  vide: boolean;
}

export function analyserTermePortefeuille(brut: string | null | undefined): TermePortefeuille {
  const texte = (brut ?? '').trim().slice(0, 120);
  if (texte.length < 2) return { mots: [], chiffres: null, email: null, vide: true };
  const email = texte.includes('@') ? texte.toLowerCase() : null;
  let chiffres: string | null = texte.replace(/\D/g, '');
  // Un téléphone se tape avec des chiffres, des espaces, des points, un +. Un texte avec des lettres n'en est pas un.
  if (/[a-zA-ZÀ-ÿ@]/.test(texte) || chiffres.length < 6) chiffres = null;
  else if (chiffres.startsWith('33') && chiffres.length >= 11) chiffres = chiffres.slice(2);
  if (chiffres !== null) chiffres = chiffres.replace(/^0+/, '');
  const mots = email !== null ? [] : normaliserTexte(texte).split(/\s+/).filter((m) => m !== '');
  return { mots, chiffres, email, vide: false };
}

/** Les quatre groupes de résultats, dans l'ordre d'affichage. */
export const GROUPES = ['proprietaires', 'locataires', 'syndics', 'biens'] as const;
export type Groupe = (typeof GROUPES)[number];
export const LIBELLE_GROUPE: Record<Groupe, string> = {
  proprietaires: 'Propriétaires', locataires: 'Locataires', syndics: 'Syndics', biens: 'Biens',
};

export interface ResultatPortefeuille { id: number; titre: string; detail: string | null }

/**
 * UNE LIGNE DE RÉSULTAT DE L'ACCUEIL (retouche d'Arno du 17/10/2026) : « pastille de type colorée + nom en gras + téléphone
 * + e-mail + adresse du bien du portefeuille ». `ancien` = fiche sortie du portefeuille : affichée en bas, grisée.
 * 🔴 `adresse` n'est JAMAIS l'adresse personnelle d'une personne ni celle d'un syndic : c'est celle d'un bien du portefeuille.
 */
export interface LigneRecherche {
  id: number;
  titre: string;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  /** Pour un bien : son ou ses propriétaires. */
  detail: string | null;
  ancien: boolean;
}
export type ResultatsAccueil = Record<Groupe, LigneRecherche[]> & { tronque: boolean };
export interface LigneAccueil extends LigneRecherche { groupe: Groupe }

/** Le mot de la pastille de type. */
export const LIBELLE_TYPE: Record<Groupe, string> = { proprietaires: 'Propriétaire', locataires: 'Locataire', syndics: 'Syndic', biens: 'Bien' };

/**
 * LA LISTE UNIQUE, DANS L'ORDRE D'ARNO : propriétaires, locataires, syndics, biens (chaque groupe déjà rangé par
 * pertinence puis nom par le dépôt) ; puis les ANCIENS, dans le même ordre de types, tout en bas. PUR.
 */
export function aplatirResultats(r: Partial<ResultatsAccueil> | null | undefined): LigneAccueil[] {
  const tous = GROUPES.flatMap((groupe) => (Array.isArray(r?.[groupe]) ? r[groupe] : []).map((l) => ({ ...l, groupe })));
  return [...tous.filter((l) => !l.ancien), ...tous.filter((l) => l.ancien)];
}

/** Ce qu'une fiche sortie du portefeuille affiche : quand et par qui. `null` = dans le portefeuille. */
export interface SortiePortefeuille { le: string; par: string | null }
