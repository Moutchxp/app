import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireCompletude, recalculerCompletude } from '../../../../../lib/permis/completudeRepo';

/**
 * PART-2 / PERF-2 — /api/admin/permis/completude?dossierId=… : DIAGNOSTIC DE COMPLÉTUDE d'un permis (présent/manquant par famille).
 *  - GET : LECTURE SEULE du diagnostic mémorisé, recomposé selon les familles attendues VIVES, SANS relire les PDF. `null` = jamais
 *    analysé (ou 174 absente). LÉGER : c'est la seule requête tirée à l'ouverture d'une fiche (PERF-1).
 *  - POST : RECALCUL de la SEULE complétude (relit les PDF PAR CONTENU, parse LOCAL — AUCUNE vision/IA payante), pour l'actualisation
 *    AUTOMATIQUE NON BLOQUANTE quand la GED a changé (PERF-2). Renvoie le diagnostic à jour. « Diagnostic complet des documents » (POST /extraire,
 *    vision incluse) reste le geste délibéré distinct.
 * RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const dossierId = Number(new URL(request.url).searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    return Response.json({ completude: await lireCompletude(dossierId) }); // null si jamais analysé
  } catch (e) {
    console.error('[permis/completude] GET indisponible', e);
    return Response.json({ erreur: 'diagnostic indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const { dossierId } = (await request.json().catch(() => ({}))) as { dossierId?: unknown };
  if (!Number.isInteger(dossierId) || (dossierId as number) <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    const completude = await recalculerCompletude(dossierId as number, 'completude:auto'); // parse LOCAL, jamais de vision
    return Response.json({ completude });
  } catch (e) {
    console.error('[permis/completude] POST recalcul impossible', e);
    return Response.json({ erreur: 'recalcul impossible' }, { status: 503 }); // le client dira l'échec et laissera « Diagnostic complet des documents »
  }
}
