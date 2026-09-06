/**
 * DEMANDE 2 — lecture RUNTIME de la MARGE d'égalité sommet/dernier plancher, depuis `config_veille` (migration 205), avec REPLI SÛR
 * sur le défaut si la colonne est absente (205 non appliquée), ligne absente ou NULL — même patron résilient et de provenance que
 * `projectionConfig.lireSeuilMitoyenAireM2`. Aucune constante de seuil en dur : le défaut EST celui du code
 * (MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT). Jamais d'exception propagée : le rendu tourne toujours, avec une marge connue et tracée.
 *
 * Ce contrôle ne fait qu'INFORMER (rendu) : il n'écarte aucune valeur, ne touche NI le verdict NI une altitude. Non bloquant.
 */
import { query } from '../db/client';
import { MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT } from '../../(admin)/admin/(protected)/permis/caracteristiquesForm';
export { MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT }; // re-export : source unique (défini côté form pur), réutilisable par la route serveur

export interface MargeCoherenceSource { margeM: number; provenance: 'base' | 'defaut' }

/** `numeric` PostgreSQL revient en STRING via le driver → conversion Number explicite (repli défaut si non finie ou < 0). */
export async function lireMargeCoherenceSommetPlancherM(): Promise<MargeCoherenceSource> {
  try {
    const { rows } = await query<{ m: number | string | null }>(
      `SELECT coherence_sommet_plancher_marge_m AS m FROM config_veille WHERE id = 1`);
    const m = rows[0]?.m;
    if (m === null || m === undefined) return { margeM: MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT, provenance: 'defaut' };
    const n = Number(m);
    if (!Number.isFinite(n) || n < 0) return { margeM: MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT, provenance: 'defaut' };
    return { margeM: n, provenance: 'base' };
  } catch {
    return { margeM: MARGE_COHERENCE_SOMMET_PLANCHER_M_DEFAUT, provenance: 'defaut' }; // 205 pas appliquée (colonne absente) → défaut
  }
}
