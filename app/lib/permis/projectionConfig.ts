/**
 * PROJ-MIT — lecture RUNTIME du seuil d'aire séparant « sur la parcelle » de « mitoyen (contexte) », depuis `config_veille`
 * (migration 203), avec REPLI SÛR sur le défaut si la colonne est absente (203 non appliquée) — même patron résilient et de
 * provenance que `rattachementConfig.ts` (lireSeuilRecouvrementEmprisePct). Aucune constante de seuil en dur : le défaut ici EST
 * le DEFAULT de la migration 203. Jamais d'exception propagée : le calcul d'affichage tourne toujours, avec un seuil connu et tracé.
 *
 * ⚠️ La qualification ne change QUE le rendu (bâti « sur la parcelle » vs « mitoyen (contexte) ») : elle n'écarte AUCUN polygone,
 * ne touche NI le critère de sélection (ST_Intersects), NI le verdict, NI une altitude.
 */
import { query } from '../db/client';

// Défaut CENTRALISÉ — identique au DEFAULT de la migration 203 (aucune constante de seuil dispersée dans le rendu/repo).
export const MITOYEN_SEUIL_AIRE_M2_DEFAUT = 0.5;

/** Qualification d'un polygone BD TOPO selon son aire réelle dans l'empreinte. */
export type QualificationPolygone = 'sur_parcelle' | 'mitoyen';

// PROJ-CTX — rayon (m) du CONTEXTE (parcelles voisines + bâti autour de l'empreinte). Défaut CENTRALISÉ = DEFAULT de la migration 204.
export const RAYON_CONTEXTE_M_DEFAUT = 50;
export interface RayonContexteSource { rayonM: number; provenance: 'base' | 'defaut' }
/**
 * Lecture ISOLÉE du rayon du contexte (m), depuis `config_veille` (migration 204), REPLI SÛR sur le défaut si la colonne est absente
 * (204 non appliquée), ligne absente ou NULL — même patron que `lireSeuilMitoyenAireM2`. Jamais d'exception propagée.
 */
export async function lireRayonContexteM(): Promise<RayonContexteSource> {
  try {
    const { rows } = await query<{ r: number | string | null }>(
      `SELECT projection_contexte_rayon_m AS r FROM config_veille WHERE id = 1`);
    const r = rows[0]?.r;
    if (r === null || r === undefined) return { rayonM: RAYON_CONTEXTE_M_DEFAUT, provenance: 'defaut' };
    const n = Number(r);
    if (!Number.isFinite(n)) return { rayonM: RAYON_CONTEXTE_M_DEFAUT, provenance: 'defaut' };
    return { rayonM: n, provenance: 'base' };
  } catch {
    return { rayonM: RAYON_CONTEXTE_M_DEFAUT, provenance: 'defaut' }; // 204 pas appliquée (colonne absente) → défaut
  }
}

export interface SeuilMitoyenSource { seuilM2: number; provenance: 'base' | 'defaut' }

/**
 * Lecture ISOLÉE du seuil (m²). Erreur (colonne non migrée), ligne absente ou valeur NULL → défaut + provenance 'defaut'.
 * `numeric` PostgreSQL revient en STRING via le driver → conversion Number explicite (repli défaut si non finie).
 */
export async function lireSeuilMitoyenAireM2(): Promise<SeuilMitoyenSource> {
  try {
    const { rows } = await query<{ s: number | string | null }>(
      `SELECT projection_mitoyen_seuil_aire_m2 AS s FROM config_veille WHERE id = 1`);
    const s = rows[0]?.s;
    if (s === null || s === undefined) return { seuilM2: MITOYEN_SEUIL_AIRE_M2_DEFAUT, provenance: 'defaut' };
    const n = Number(s);
    if (!Number.isFinite(n)) return { seuilM2: MITOYEN_SEUIL_AIRE_M2_DEFAUT, provenance: 'defaut' };
    return { seuilM2: n, provenance: 'base' };
  } catch {
    return { seuilM2: MITOYEN_SEUIL_AIRE_M2_DEFAUT, provenance: 'defaut' }; // 203 pas appliquée (colonne absente) → défaut
  }
}

/**
 * PUR — qualifie un polygone d'après l'aire RÉELLE d'intersection avec l'empreinte et le seuil (m²). Borne INCLUSE : aire ≥ seuil
 * → « sur la parcelle » ; aire < seuil → « mitoyen (contexte) » (ex. immeuble voisin accolé par un mur, aire ≈ 0). Le seuil est
 * TOUJOURS passé en paramètre (jamais lu en dur ici) : c'est l'appelant qui le lit en config (lireSeuilMitoyenAireM2).
 */
export function qualifierMitoyennete(aireDansEmpreinteM2: number, seuilM2: number): QualificationPolygone {
  return aireDansEmpreinteM2 >= seuilM2 ? 'sur_parcelle' : 'mitoyen';
}
