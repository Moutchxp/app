/**
 * CÂBLAGE de la carte d'orientation — Lot 5. Génère la carte, la dépose, écrit sa clé sur l'acheminement.
 *
 * Appelé à l'émission APRÈS le COMMIT de la transaction du certificat (jamais dedans : c'est du RÉSEAU, c'est lent).
 * BEST-EFFORT et NON BLOQUANT : ne throw JAMAIS. Un échec (réseau IGN, stockage, carte trop trouée) laisse
 * `carte_orientation_cle` à NULL — le certificat existe déjà, aucun statut ne change, la carte est RE-FABRICABLE
 * (c'est tout l'intérêt de sa place côté acheminement, table mutable).
 *
 * Journalisation : `console.error('[carte-orientation] …')`, alignée sur la convention du projet
 * (cf. `[internaute/photo]`, `[analytics]`) — un échec silencieux est un échec invisible.
 */
import { query } from '../db/client';
import { deposer, stockageConfigure } from '../stockage';
import { genererCarteOrientation, type GeometrieTrace } from './orientationCarte';
// Constantes MOTEUR (imports EN LECTURE SEULE ; config.ts n'est PAS modifié) : le tracé du certificat dit ce que le
// moteur a réellement analysé — champ 180° = ((AMPLITUDE_BEAM_COUNT − 1) / 2) × pas ; portée = ANALYSIS_RANGE_M.
import { ANALYSIS_RANGE_M, AMPLITUDE_BEAM_COUNT, AMPLITUDE_BEAM_STEP_DEG } from '../svv/config';

/** Géométrie du tracé = celle du MOTEUR (source unique, dérivée, jamais retapée). L'axe et le champ vont à la portée
 *  d'analyse ; la demi-ouverture est la moitié du balayage réel (61 faisceaux × 3° = 180°). */
const GEOM_MOTEUR: GeometrieTrace = {
  demiAngleDeg: ((AMPLITUDE_BEAM_COUNT - 1) / 2) * AMPLITUDE_BEAM_STEP_DEG,
  rayonAxeM: ANALYSIS_RANGE_M,
  rayonChampM: ANALYSIS_RANGE_M,
  arcPoints: 49, // échantillonnage lisse d'un arc de 180°
};

export async function publierCarteOrientation(
  internauteId: string,
  certificatId: number,
  lat: number,
  lon: number,
  azimutDeg: number,
): Promise<void> {
  try {
    // Stockage non configuré → on n'essaie même pas (silencieux, comme le dépôt photo) : la carte reste NULL.
    if (!stockageConfigure()) return;

    const png = await genererCarteOrientation(lat, lon, azimutDeg, GEOM_MOTEUR);
    const { cle } = await deposer(png, 'image/png', { internauteId }); // clé sous internautes/<id>/cartes/…
    // L'acheminement est MUTABLE : on renseigne la clé et on horodate la mise à jour.
    await query(
      `UPDATE certificat_acheminement SET carte_orientation_cle = $1, maj_a = now() WHERE certificat_id = $2`,
      [cle, certificatId],
    );
  } catch (e) {
    console.error('[carte-orientation] génération/dépôt indisponible', (e as Error)?.name ?? e);
  }
}
