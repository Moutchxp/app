import 'server-only';
import { exigerAdministrateur, exigerModule, type GardeAdmin } from '../admin/garde';
import { droitMonEspaceDisponible } from '../admin/schemaDroits';

/**
 * TUILE « MON ESPACE » — la DEUXIÈME barrière des routes `/api/admin/mon-espace/*` (la première est `proxy.ts`). Elle relit le droit EN BASE
 * à chaque appel (`exigerModule`) ; sans la migration 448, la colonne `perm_mon_espace` n'existe pas : « administrateurs seulement » (la
 * direction sûre). Même patron que la Transaction.
 */
export async function exigerMonEspace(request: Request): Promise<GardeAdmin> {
  return (await droitMonEspaceDisponible()) ? exigerModule(request, 'mon_espace') : exigerAdministrateur(request);
}
