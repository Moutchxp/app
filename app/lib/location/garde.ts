import 'server-only';
import { exigerAdministrateur, exigerModule, type GardeAdmin } from '../admin/garde';
import { droitLocationDisponible } from '../admin/schemaDroits';

/**
 * TUILE LOCATION — la DEUXIÈME barrière des routes `/api/admin/location/*` (la première est `proxy.ts`).
 *
 * Elle relit le droit EN BASE à chaque appel (`exigerModule`). ⚠️ Sans la migration 371, la colonne `perm_location`
 * n'existe pas et `exigerModule` échouerait même pour un administrateur : on retombe alors sur « administrateurs
 * seulement » — la direction sûre (un doute n'ouvre jamais une porte).
 */
export async function exigerLocation(request: Request): Promise<GardeAdmin> {
  return (await droitLocationDisponible()) ? exigerModule(request, 'location') : exigerAdministrateur(request);
}
