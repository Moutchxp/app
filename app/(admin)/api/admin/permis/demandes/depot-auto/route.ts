import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { materialiserDepotTeleservice } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * POST /api/admin/permis/demandes/depot-auto — MATÉRIALISE la demande d'une carte de dépôt VIRTUELLE (commune libre affichée
 * automatiquement) au 1er geste réel (copie du texte / du numéro, ou marquage déposé). Corps `{ cle, communeNom }` (la clé du lot).
 * Réutilise le chemin de création EXISTANT (`creerDemandes` re-apparie la proposition fraîche → gardes réappliquées, verrou
 * anti-doublon, journal) et renvoie l'`id` créé pour enchaîner le geste. AFFICHER une commune n'écrit RIEN : seule cette route,
 * appelée au geste, crée la demande → jamais de demande fantôme. RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let cleCtx: unknown;
  try {
    const c = (await request.json().catch(() => ({}))) as { cle?: unknown; communeNom?: unknown };
    cleCtx = c.cle;
    if (typeof c.cle !== 'string' || c.cle.trim() === '') return Response.json({ erreur: 'cle invalide' }, { status: 400 });
    const communeNom = typeof c.communeNom === 'string' ? c.communeNom : null;
    const annee = new Date().getFullYear();
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    const cfg = await chargerConfigVeille();
    const res = await materialiserDepotTeleservice(cfg, annee, auteur, c.cle, communeNom);
    // Lot non frais (déjà matérialisé, plafond, dossier rattaché entre-temps) → 409 avec la raison ; jamais un doublon ni un 500 muet.
    if (!res.ok) return Response.json({ ok: false, erreur: res.raison }, { status: 409 });
    return Response.json({ ok: true, id: res.id });
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown };
    console.error('[permis/demandes/depot-auto] POST matérialisation impossible (503)', {
      cle: cleCtx, name: err?.name, message: err?.message, code: err?.code, detail: err?.detail, constraint: err?.constraint, stack: err?.stack,
    });
    return Response.json({ erreur: 'matérialisation impossible' }, { status: 503 });
  }
}
