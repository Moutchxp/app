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
import { genererCarteOrientation } from './orientationCarte';

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

    const png = await genererCarteOrientation(lat, lon, azimutDeg);
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
