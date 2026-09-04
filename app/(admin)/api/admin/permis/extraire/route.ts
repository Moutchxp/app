import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerExtractionPermis } from '../../../../../lib/permis/executerExtraction';
import { avecVerrouDossier } from '../../../../../lib/permis/verrouExtraction';

/**
 * EXT-1 (étape 2) — /api/admin/permis/extraire : « Lancer le diagnostic complet des documents » d'UN permis (Analyse et Archives). POST { dossierId } →
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
    // LOT 58 — VERROU PAR DOSSIER : une seule analyse à la fois par permis (anti double-clic multi-onglets, anti CLI concurrente).
    //   Déjà pris → 409 avec un message HONNÊTE (jamais une fausse panne) ; le bouton l'affiche via son `erreur` existant.
    const verrou = await avecVerrouDossier(c.dossierId as number, () =>
      executerExtractionPermis(c.dossierId as number, { avecVision: true, majPar: `extraction:relance:${auteur}` }));
    if (!verrou.ok) return Response.json({ erreur: 'Une analyse de ce permis est déjà en cours.' }, { status: 409 });
    const rapport = verrou.valeur;
    if (!rapport.ok) return Response.json({ erreur: 'permis inconnu' }, { status: 404 });
    return Response.json({ ok: true, rapport });
  } catch (e) {
    console.error('[permis/extraire] POST impossible (503)', { dossierId: demandeCtx, message: (e as Error)?.message });
    return Response.json({ erreur: 'analyse impossible' }, { status: 503 });
  }
}
