import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { listerFileProjection, validerProjection, sortirTestVersRattachement } from '../../../../../lib/permis/projectionFileRepo';
import { retirerTestAnalyse } from '../../../../../lib/permis/testAnalyseRepo';

/**
 * PROJ-2c — /api/admin/permis/projection : FILE « Projection » (entre Réponses et Archives).
 * GET  → permis éligibles (documents obtenus + nature neuve/extension + projection non validée).
 * POST { action:'valider', dossierId } → valide la projection (condition serveur : chaque bâtiment tracé ou ignoré) ; le permis
 *        quitte la file et est marqué suivi (Rattachement « en attente d'une mise à jour »). Le tracé lui-même passe par /emprise.
 * POST { action:'retour_en_cours', dossierId } → LOT 51-B : RETRAIT du marqueur « testé en analyse » (aucun envoi, aucun journal, aucun
 *        changement de statut) → le permis revient dans « En cours », toute la planification des rappels intacte. Réversible et anodin.
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json({ file: await listerFileProjection(await chargerConfigVeille()) });
  } catch (e) {
    console.error('[permis/projection] GET indisponible', e);
    return Response.json({ erreur: 'file de projection indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; dossierId?: number | string };
    const dossierId = typeof body.dossierId === 'number' ? body.dossierId : Number(body.dossierId);
    if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'requête invalide' }, { status: 400 });

    // LOT 51-B — RETOUR EN COURS (sans envoi) : lève le seul marqueur « testé en analyse » ; ne touche NI statut NI relance NI journal.
    if (body.action === 'retour_en_cours') {
      await retirerTestAnalyse(dossierId);
      return Response.json({ ok: true, file: await listerFileProjection(await chargerConfigVeille()) });
    }
    // LOT 51-C — SORTIE DÉFINITIVE vers Rattachement (double condition empreinte + altitudes) + arrêt EXHAUSTIF des relances + effacement
    //   du marqueur test. Refus métier (condition manquante) → 409 avec `manque` pour que l'écran dise LAQUELLE.
    if (body.action === 'sortir_vers_rattachement') {
      const res = await sortirTestVersRattachement(dossierId, 'admin:projection');
      if (!res.ok) return Response.json({ erreur: res.motif, manque: res.manque }, { status: 409 });
      return Response.json({ ok: true, marqueSuivi: res.marqueSuivi, demandesArretees: res.demandesArretees, file: await listerFileProjection(await chargerConfigVeille()) });
    }
    if (body.action !== 'valider') return Response.json({ erreur: 'action inconnue' }, { status: 400 });

    const res = await validerProjection(dossierId, 'admin:projection');
    if (!res.ok) return Response.json({ erreur: res.motif }, { status: 409 });
    return Response.json({ ok: true, marqueSuivi: res.marqueSuivi, file: await listerFileProjection(await chargerConfigVeille()) });
  } catch (e) {
    console.error('[permis/projection] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
