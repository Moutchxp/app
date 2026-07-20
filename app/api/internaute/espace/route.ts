import 'server-only';
import { exigerInternaute } from '../../../lib/internaute/authGarde';
import { listerAnalyses, listerCertificats } from '../../../lib/internaute/espace';

// Runtime Node (driver pg). Route PUBLIQUE (hors matcher admin), mais AUTHENTIFIÉE par la garde internaute.
export const runtime = 'nodejs';

/**
 * GET /api/internaute/espace — « mes analyses / mes certificats » de l'internaute CONNECTÉ.
 *
 * SÉCURITÉ (anti-IDOR) : protégée par `exigerInternaute` ; TOUTES les lectures sont scopées par l'`internauteId` ISSU DE
 * LA SESSION (`garde.internauteId`). Le corps, l'URL et la query ne sont JAMAIS lus pour cibler un dossier → impossible
 * de voir les données d'un autre en changeant un identifiant. Renvoie `{ analyses, certificats }`.
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await exigerInternaute(request);
  if ('refus' in garde) return garde.refus;

  try {
    const [analyses, certificats] = await Promise.all([
      listerAnalyses(garde.internauteId),
      listerCertificats(garde.internauteId),
    ]);
    return Response.json({ analyses, certificats });
  } catch (e) {
    console.error('[espace] chargement indisponible', (e as Error)?.name ?? 'Erreur');
    return Response.json({ erreur: 'espace indisponible' }, { status: 503 });
  }
}
