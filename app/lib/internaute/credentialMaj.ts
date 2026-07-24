import 'server-only';
import { query } from '../db/client';

/**
 * Lit `internaute_auth.maj_a` (horodatage du DERNIER credential posé) pour un internaute — la référence temporelle de
 * révocation des sessions (F1/F2 « fermeture des autres sessions au reset »).
 *
 * PLEINE PRÉCISION : lu en `::text` → la représentation Postgres conserve les MICROSECONDES (un `Date` JS les tronque à
 * la milliseconde). Le sceau `cev` est ainsi la valeur EXACTE de `maj_a`, comparable en F2 par `a.maj_a <= $cev` sans
 * qu'une troncature ne rejette la session fraîche du reset. `null` si aucune ligne (credential absent — cas théorique :
 * les 3 signataires — login, création, reset — posent le credential AVANT de signer).
 */
export async function lireMajCredential(internauteId: string): Promise<string | null> {
  const r = await query<{ maj_a: string }>(
    `SELECT maj_a::text AS maj_a FROM internaute_auth WHERE internaute_id = $1`,
    [internauteId],
  );
  return r.rows[0]?.maj_a ?? null;
}
