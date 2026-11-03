// 🔴 « Les coûts », lot 2 (C9) — la fonction d'un profil : les types et règles PURES (lus aussi par l'écran ; aucune base ici).
export type Fonction = 'vente' | 'location' | 'gestion';
export const FONCTIONS: readonly Fonction[] = ['vente', 'location', 'gestion'];
export const LIBELLE_FONCTION: Record<Fonction, string> = { vente: 'Vente', location: 'Location', gestion: 'Gestion' };
export const estFonction = (x: unknown): x is Fonction => x === 'vente' || x === 'location' || x === 'gestion';

export interface EtatFonctions { valeur: Fonction[]; disponible: boolean;
  /** Les fonctions posées par la migration (déduites des données), pas encore confirmées à la main. */
  deduites: Fonction[] }
/** Un profil proposé pour un salaire : actif, non observateur, avec ses fonctions. */
export interface ProfilCout { id: number; libelle: string; fonctions: Fonction[] }

/**
 * C9 — L'ORDRE DES PROFILS proposés pour un salaire de la famille `famille` : ceux qui ont CETTE fonction d'abord, puis ceux de la location ou
 * de la gestion, puis les autres ; alphabétique dans chaque groupe. PUR.
 */
export function profilsPourSalaire<T extends { libelle: string; fonctions: readonly Fonction[] }>(famille: Fonction, profils: readonly T[]): { profil: T; groupe: 1 | 2 | 3 }[] {
  const groupe = (p: T): 1 | 2 | 3 => (p.fonctions.includes(famille) ? 1 : p.fonctions.some((f) => f === 'location' || f === 'gestion') ? 2 : 3);
  return profils.map((profil) => ({ profil, groupe: groupe(profil) }))
    .sort((a, b) => a.groupe - b.groupe || a.profil.libelle.localeCompare(b.profil.libelle, 'fr'));
}
