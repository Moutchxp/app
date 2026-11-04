import 'server-only';
import { exigerModuleD37 } from '../../../../../lib/admin/garde';
import { lireJournalConnexions } from '../../../../../lib/auth/journalConnexion';

/**
 * AUDIT POINT 8 (15/10/2026). GET /api/admin/audit/connexions — les 200 dernières tentatives de connexion à l'admin
 * (moment, identifiant, résultat, adresse EN EMPREINTE). 🔴 D37 : la case « Audit » (proxy + garde qui relit
 * rôle et actif en base). Lecture seule. `disponible: false` tant que la migration 357 n'est pas appliquée.
 */
export const runtime = 'nodejs';
const LIMITE = 200;

export async function GET(request: Request): Promise<Response> {
  try {
    const garde = await exigerModuleD37(request, 'audit');
    if ('refus' in garde) return garde.refus;
    return Response.json(await lireJournalConnexions(LIMITE));
  } catch {
    return Response.json({ erreur: 'journal indisponible' }, { status: 503 });
  }
}
