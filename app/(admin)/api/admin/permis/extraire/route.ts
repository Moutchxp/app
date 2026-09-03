import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerExtractionPermis } from '../../../../../lib/permis/executerExtraction';

/**
 * EXT-1 (étape 2) — /api/admin/permis/extraire : « Diagnostic complet des documents » d'UN permis (Analyse et Archives). POST { dossierId } →
 * exécute le pipeline d'extraction, VISION INCLUSE (un geste délibéré paie l'appel externe, quel que soit le réglage du versement)
 * → renvoie le compte rendu (champs retenus, pièces sans candidat, vision tournée + nb pièces). AUCUN écrasement d'une saisie
 * (origine 'extraite', invariant 103). AUCUN envoi/relève. RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let demandeCtx: unknown;
  try {
    const c = (await request.json().catch(() => ({}))) as { dossierId?: unknown };
    demandeCtx = c.dossierId;
    if (!Number.isInteger(c.dossierId) || (c.dossierId as number) <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
    const auteur = garde.auteurId === null ? 'admin' : String(garde.auteurId);
    const rapport = await executerExtractionPermis(c.dossierId as number, { avecVision: true, majPar: `extraction:relance:${auteur}` });
    if (!rapport.ok) return Response.json({ erreur: 'permis inconnu' }, { status: 404 });
    return Response.json({ ok: true, rapport });
  } catch (e) {
    console.error('[permis/extraire] POST impossible (503)', { dossierId: demandeCtx, message: (e as Error)?.message });
    return Response.json({ erreur: 'analyse impossible' }, { status: 503 });
  }
}
