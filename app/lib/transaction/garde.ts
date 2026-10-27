import 'server-only';
import { exigerAdministrateur, exigerModule, type GardeAdmin } from '../admin/garde';
import { droitTransactionDisponible } from '../admin/schemaDroits';

/**
 * TUILE TRANSACTION — la DEUXIÈME barrière des routes `/api/admin/transaction/*` (la première est `proxy.ts`).
 *
 * Elle relit le droit EN BASE à chaque appel (`exigerModule`). ⚠️ Sans la migration 433, la colonne `perm_transaction` n'existe
 * pas et `exigerModule` échouerait même pour un administrateur : on retombe alors sur « administrateurs seulement » — la direction
 * sûre (un doute n'ouvre jamais une porte). Même patron que la Location.
 */
export async function exigerTransaction(request: Request): Promise<GardeAdmin> {
  return (await droitTransactionDisponible()) ? exigerModule(request, 'transaction') : exigerAdministrateur(request);
}
