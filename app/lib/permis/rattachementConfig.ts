/**
 * FUS-2 — lecture RUNTIME des trois seuils du moteur de rattachement, depuis `config_veille` (migration 115), avec REPLI SÛR
 * sur les défauts si la migration n'est pas encore appliquée (colonnes absentes) — même motif de résilience que les lectures
 * isolées de `veilleConfig` (résiliente à l'ordre d'application). Convertit les entiers stockés (%/cm) en unités-métier
 * (ratio/mètres) attendues par le moteur PUR, et REND LA PROVENANCE ('base' vs 'defaut') pour que le rejeu sache toujours avec
 * quels seuils une décision serait prise.
 *
 * ⚠️ Le bloc ÉDITABLE dans l'écran Réglages (thème « Rattachement des permis ») n'est PAS livré ici — il est dû avec FUS-3 (page
 * de décision). En attendant, ces seuils sont lus au runtime mais réglés uniquement en base ; la provenance rend cela visible.
 */
import { query } from '../db/client';
import type { SeuilsRattachement } from './detectionRattachement';

// Défauts CENTRALISÉS — identiques aux DEFAULT de la migration 115 (aucune constante de seuil dispersée dans le moteur).
export const SEUIL_SURFACE_PCT_DEFAUT = 80;   // % de l'empreinte recouverte (jamais une égalité : voies/trottoirs prélevés)
export const SEUIL_BORDURE_PCT_DEFAUT = 60;   // % du périmètre candidat coïncidant avec le contour de l'empreinte
export const MARGE_ALTITUDE_CM_DEFAUT = 10;   // cm — marge d'égalité d'altitude des corps (0,10 m)
// RATT-5/RATT-6 — seuil (% de la surface du polygone sous l'emprise) : ANTI-BRUIT DE TRACÉ (RATT-6). En dessous → aucun statut auto ;
//   au-dessus → statut géométrique (detruit total / mixte partiel). Frère des trois seuils ci-dessus (config_veille). = DEFAULT de la
//   migration 166 (défaut 3 depuis RATT-6 ; aucune constante dispersée).
export const SEUIL_RECOUVREMENT_EMPRISE_PCT_DEFAUT = 3;

export interface SeuilsRattachementSource {
  seuils: SeuilsRattachement;                    // unités-métier (ratio, mètres) pour le moteur PUR
  brut: { surfacePct: number; bordurePct: number; margeAltitudeCm: number }; // valeurs éditables telles quelles (affichage)
  provenance: 'base' | 'defaut';                 // 'base' = lues en config_veille ; 'defaut' = repli (migration 115 non appliquée / ligne absente)
}

/** Convertit les entiers éditables (%/cm) en unités-métier du moteur. */
function versSeuils(surfacePct: number, bordurePct: number, margeCm: number): SeuilsRattachement {
  return { seuilSurface: surfacePct / 100, seuilBordure: bordurePct / 100, margeAltitudeM: margeCm / 100 };
}

/**
 * Lecture ISOLÉE des trois seuils. Erreur (colonnes non migrées) ou ligne absente → défauts + provenance 'defaut'. Jamais
 * d'exception propagée : le moteur tourne toujours, avec des seuils connus et tracés.
 */
export async function lireSeuilsRattachement(): Promise<SeuilsRattachementSource> {
  const defaut: SeuilsRattachementSource = {
    seuils: versSeuils(SEUIL_SURFACE_PCT_DEFAUT, SEUIL_BORDURE_PCT_DEFAUT, MARGE_ALTITUDE_CM_DEFAUT),
    brut: { surfacePct: SEUIL_SURFACE_PCT_DEFAUT, bordurePct: SEUIL_BORDURE_PCT_DEFAUT, margeAltitudeCm: MARGE_ALTITUDE_CM_DEFAUT },
    provenance: 'defaut',
  };
  try {
    const { rows } = await query<{ s: number; b: number; m: number }>(
      `SELECT rattachement_seuil_surface_pct AS s, rattachement_seuil_bordure_pct AS b, rattachement_marge_altitude_cm AS m
         FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return defaut; // ligne absente → défauts
    return {
      seuils: versSeuils(r.s, r.b, r.m),
      brut: { surfacePct: r.s, bordurePct: r.b, margeAltitudeCm: r.m },
      provenance: 'base',
    };
  } catch {
    return defaut; // 115 pas encore appliquée (colonnes absentes) → défauts, sans casser le moteur
  }
}

/**
 * RATT-5 — SEUIL de recouvrement d'un polygone par l'emprise projetée (% de sa surface), lu au runtime depuis `config_veille`
 * (migration 166), avec REPLI SÛR sur le défaut si la colonne est absente (166 non appliquée) — même patron résilient que
 * `lireSeuilsRattachement`. Rend la PROVENANCE ('base' vs 'defaut') pour que l'écran sache toujours avec quel seuil une décision de
 * recouvrement est prise. Jamais d'exception propagée : le geste de statut tourne toujours, avec un seuil connu et tracé.
 */
export interface SeuilRecouvrementSource { seuilPct: number; provenance: 'base' | 'defaut' }
export async function lireSeuilRecouvrementEmprisePct(): Promise<SeuilRecouvrementSource> {
  try {
    const { rows } = await query<{ s: number | null }>(
      `SELECT rattachement_seuil_recouvrement_pct AS s FROM config_veille WHERE id = 1`);
    const s = rows[0]?.s;
    if (s === null || s === undefined) return { seuilPct: SEUIL_RECOUVREMENT_EMPRISE_PCT_DEFAUT, provenance: 'defaut' };
    return { seuilPct: s, provenance: 'base' };
  } catch {
    return { seuilPct: SEUIL_RECOUVREMENT_EMPRISE_PCT_DEFAUT, provenance: 'defaut' }; // 166 pas appliquée (colonne absente) → défaut
  }
}

/**
 * RATTACHEMENT — la DAACT (achèvement déclaré) est-elle un déclencheur de dossier ? Lecture ISOLÉE et RÉSILIENTE : tant que la
 * migration 141 n'est pas appliquée (colonne absente), on retombe sur le DÉFAUT `true` (stock actuel vide → aucune vague). Jamais
 * d'exception propagée. ⚠️ La DAACT OUVRE l'arbitrage, elle ne CONCLUT jamais : aucune injection d'altitude n'en découle.
 */
export async function lireDaactDeclencheurActif(): Promise<boolean> {
  try {
    const { rows } = await query<{ actif: boolean }>(
      `SELECT rattachement_daact_declencheur_actif AS actif FROM config_veille WHERE id = 1`);
    return rows[0]?.actif ?? true;
  } catch {
    return true; // 141 pas encore appliquée → défaut activé
  }
}

/** RATTACHEMENT — active/désactive le déclencheur DAACT (config_veille, singleton). Renvoie l'état APRÈS écriture. */
export async function ecrireDaactDeclencheurActif(actif: boolean): Promise<boolean> {
  await query(`UPDATE config_veille SET rattachement_daact_declencheur_actif = $1 WHERE id = 1`, [actif === true]);
  return actif === true;
}
