import 'server-only';
import { queryAnalytics } from './pool';
import { ECRITURE_TIMEOUT_MS } from './config';
import { jourParis } from './writer';

/**
 * Lot ZONE SANS LiDAR (15/10/2026). Journal d'une analyse arrêtée faute de LiDAR sous l'origine : une ligne dans
 * `analyse_sans_lidar` (migration 354) — adresse saisie, point, dalle IGN, commune — pour qu'Arno sache combien
 * d'internautes sont concernés et où. Le compte quotidien par commune est tenu à part, sans cette table
 * (`incrementerCompteur`, raison 'hors_lidar').
 *
 * MÊME CONTRAT QUE `writer.ts` : ne throw JAMAIS, ne bloque pas au-delà de `ECRITURE_TIMEOUT_MS`, pool analytique dédié,
 * appelé post-réponse. REPLI : tant que la migration 354 n'est pas appliquée (table absente, SQLSTATE 42P01), l'écriture est
 * abandonnée avec UN avertissement par processus — jamais une erreur pour l'internaute.
 */

export interface AnalyseSansLidar {
  adresse: string | null;
  lat: number;
  lon: number;
  xL93: number | null;
  yL93: number | null;
  dalle: string | null;
  communeInsee: string | null;
}

let tableAbsenteSignalee = false;

export async function journaliserAnalyseSansLidar(e: AnalyseSansLidar): Promise<void> {
  try {
    const ecriture = queryAnalytics(
      `INSERT INTO analyse_sans_lidar (jour_paris, motif, adresse, lat, lon, x_l93, y_l93, dalle, commune_insee)
       VALUES ($1::date, 'pas_de_lidar', $2, $3, $4, $5, $6, $7, $8)`,
      [jourParis(), e.adresse, e.lat, e.lon, e.xL93, e.yL93, e.dalle, e.communeInsee],
    );
    ecriture.catch(() => {}); // un rejet tardif (après le délai) ne doit pas remonter
    let minuteur: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ecriture,
        new Promise<never>((_, rej) => { minuteur = setTimeout(() => rej(new Error('analytics_timeout')), ECRITURE_TIMEOUT_MS); }),
      ]);
    } finally {
      if (minuteur) clearTimeout(minuteur);
    }
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      if (!tableAbsenteSignalee) {
        tableAbsenteSignalee = true;
        console.warn('[analytics] analyse_sans_lidar absente (migration 354 non appliquée) — journal détaillé non tenu, compteur quotidien seul');
      }
      return;
    }
    console.error('[analytics] journaliserAnalyseSansLidar abandonné', err);
  }
}
