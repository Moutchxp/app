// 🔴 « Les coûts », lot 2 (C9) — la fonction d'un profil : les types et règles PURES (lus aussi par l'écran ; aucune base ici).
import { fonctionsAuMois, type PeriodeFonction, type VersionPrincipale } from './activitePrincipale';

export type Fonction = 'vente' | 'location' | 'gestion';
export const FONCTIONS: readonly Fonction[] = ['vente', 'location', 'gestion'];
export const LIBELLE_FONCTION: Record<Fonction, string> = { vente: 'Vente', location: 'Location', gestion: 'Gestion' };
export const estFonction = (x: unknown): x is Fonction => x === 'vente' || x === 'location' || x === 'gestion';

/** 🔴 D35 — une ligne de l'historique des fonctions d'un profil (le journal `changement_fonctions`). */
export interface ChangementFonctions { le: string; par: string | null; depuis: string | null;
  avant: { fonctions: Fonction[]; principale: Fonction | null }; apres: { fonctions: Fonction[]; principale: Fonction | null } }
export interface EtatFonctions { valeur: Fonction[]; disponible: boolean;
  /** Les fonctions posées par la migration (déduites des données), pas encore confirmées à la main. */
  deduites: Fonction[];
  /** 🔴 D35 (453) — les fonctions datées et l'activité principale (salaire) : absentes sans la 453. */
  datees?: boolean;
  /** L'activité principale en vigueur aujourd'hui (null : aucune) ; déduite par la migration, pas encore confirmée. */
  principale?: Fonction | null; principaleDeduite?: boolean;
  periodes?: PeriodeFonction[]; principales?: VersionPrincipale[];
  /** L'état « depuis toujours » (les fonctions et l'activité principale d'avant toute date) et les changements, du plus ancien au plus récent. */
  initial?: { fonctions: Fonction[]; principale: Fonction | null }; historique?: ChangementFonctions[] }
/** Un profil proposé pour un salaire : actif, non observateur, avec ses fonctions (D35 : ses périodes et son activité principale datées). */
export interface ProfilCout { id: number; libelle: string; fonctions: Fonction[]; periodes?: PeriodeFonction[]; principales?: VersionPrincipale[] }

/**
 * C9 — L'ORDRE DES PROFILS proposés pour un salaire de la famille `famille` : ceux qui ont CETTE fonction d'abord, puis ceux de la location ou
 * de la gestion, puis les autres ; alphabétique dans chaque groupe. 🔴 D35 — un mois donné (`leMois`) : les fonctions EN VIGUEUR ce mois-là (un
 * profil sans périodes : ses fonctions). PUR.
 */
export function profilsPourSalaire<T extends { libelle: string; fonctions: readonly Fonction[]; periodes?: readonly PeriodeFonction[] }>(famille: Fonction, profils: readonly T[],
  leMois?: { annee: number; mois: number }): { profil: T; groupe: 1 | 2 | 3 }[] {
  const fonctions = (p: T): readonly Fonction[] => (leMois !== undefined && p.periodes !== undefined ? fonctionsAuMois(p.periodes, leMois.annee, leMois.mois) : p.fonctions);
  const groupe = (p: T): 1 | 2 | 3 => { const fs = fonctions(p); return fs.includes(famille) ? 1 : fs.some((f) => f === 'location' || f === 'gestion') ? 2 : 3; };
  return profils.map((profil) => ({ profil, groupe: groupe(profil) }))
    .sort((a, b) => a.groupe - b.groupe || a.profil.libelle.localeCompare(b.profil.libelle, 'fr'));
}

const dateFr = (iso: string): string => iso.slice(0, 10).split('-').reverse().join('/');
const liste = (fs: readonly Fonction[]): string => (fs.length === 0 ? 'aucune' : [...fs].sort().map((f) => LIBELLE_FONCTION[f]).join(', '));
/**
 * 🔴 D35 — l'historique lisible (du plus récent au plus ancien), le dernier étant l'état « depuis toujours » : « Activité principale : Location →
 * Gestion le 16/11/2026 — par Arnaud Jorel », « Fonctions : Location, Vente → Location le 03/11/2026 — par Arnaud Jorel ». PUR.
 */
export function lignesHistoriqueFonctions(e: Pick<EtatFonctions, 'initial' | 'historique'>): string[] {
  const out: string[] = [];
  for (const c of [...(e.historique ?? [])].reverse()) {
    const quand = `le ${dateFr(c.depuis ?? c.le)}${c.par === null ? '' : ` — par ${c.par}`}`;
    if (c.avant.principale !== c.apres.principale && c.apres.principale !== null)
      out.push(`Activité principale : ${c.avant.principale === null ? 'aucune' : LIBELLE_FONCTION[c.avant.principale]} → ${LIBELLE_FONCTION[c.apres.principale]} ${quand}`);
    if (liste(c.avant.fonctions) !== liste(c.apres.fonctions)) out.push(`Fonctions : ${liste(c.avant.fonctions)} → ${liste(c.apres.fonctions)} ${quand}`);
  }
  if (e.initial !== undefined) out.push(`Depuis toujours : ${liste(e.initial.fonctions)}${e.initial.principale === null ? '' : ` — activité principale ${LIBELLE_FONCTION[e.initial.principale]}`}`);
  return out;
}
