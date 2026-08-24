import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerSuivi, lireDetailSuivi } from '../../../../../lib/permis/rattachementSuiviRepo';
import { lireComparaison, affecterPolygone } from '../../../../../lib/permis/affectationRepo';
import { validerRattachement, refuserRattachement, retourLidar } from '../../../../../lib/permis/actionsRattachement';
import { lireDaactDeclencheurActif, ecrireDaactDeclencheurActif } from '../../../../../lib/permis/rattachementConfig';

/**
 * /api/admin/permis/rattachement — SUIVI du rattachement des permis à leur parcelle / polygones futurs.
 * GET (sans param) → la LISTE (univers = permis avec empreinte) + compteurs par état.
 * GET ?dossierId=N → le DÉTAIL d'un dossier + l'AFFECTATION des polygones BD TOPO aux corps (FUS-3d).
 * POST { action, dossierId, … } :
 *   'affecter' {corpsId, cleabs, operation:'ajout'|'retrait'} → ajoute/retire UN polygone d'un bâtiment (FUS-3d / M2, additif) ;
 *   'valider' {motifConfirmation?}    → injecte les altitudes (origine 'permis') + dossier 'valide' (FUS-3e) ;
 *   'refuser' {motif}                 → dossier 'refuse' (motif obligatoire) ;
 *   'retour_lidar'                    → restaure les altitudes LiDAR refigées (origine 'lidar').
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const dossierId = new URL(request.url).searchParams.get('dossierId');
    if (dossierId) {
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(Number(dossierId)), lireComparaison(Number(dossierId)).catch(() => null)]);
      if (!detail) return Response.json({ erreur: 'dossier inconnu' }, { status: 404 });
      return Response.json({ detail, comparaison });
    }
    const [suivi, daactActif] = await Promise.all([listerSuivi(), lireDaactDeclencheurActif()]);
    return Response.json({ ...suivi, daactActif });
  } catch (e) {
    console.error('[permis/rattachement] GET indisponible', e);
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; dossierId?: number; corpsId?: number; cleabs?: string; operation?: 'ajout' | 'retrait'; motif?: string; motifConfirmation?: string; actif?: boolean };

    // RATTACHEMENT — réglage GLOBAL (pas un dossier) : la DAACT comme déclencheur. Traité AVANT la garde `dossierId`.
    if (body.action === 'reglage_daact') {
      if (typeof body.actif !== 'boolean') return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      return Response.json({ ok: true, daactActif: await ecrireDaactDeclencheurActif(body.actif) });
    }

    const dossierId = body.dossierId;
    if (typeof dossierId !== 'number') return Response.json({ erreur: 'requête invalide' }, { status: 400 });

    // FUS-3d / M2 — affectation INCRÉMENTALE d'un polygone à un bâtiment : 'ajout' ou 'retrait' d'UN polygone précis.
    if (body.action === 'affecter') {
      if (typeof body.corpsId !== 'number' || typeof body.cleabs !== 'string' || (body.operation !== 'ajout' && body.operation !== 'retrait')) {
        return Response.json({ erreur: 'requête invalide' }, { status: 400 });
      }
      const res = await affecterPolygone(dossierId, body.corpsId, body.cleabs, body.operation, 'admin:affectation');
      if (!res.ok) return Response.json({ erreur: res.motif }, { status: 409 });
      return Response.json({ ok: true, comparaison: await lireComparaison(dossierId) });
    }

    // FUS-3e — décisions (aucun autre bouton : ni Street View, ni e-mail).
    if (body.action === 'valider' || body.action === 'refuser' || body.action === 'retour_lidar') {
      const res = body.action === 'valider' ? await validerRattachement(dossierId, 'admin:decision', body.motifConfirmation)
        : body.action === 'refuser' ? await refuserRattachement(dossierId, 'admin:decision', body.motif ?? '')
          : await retourLidar(dossierId, 'admin:decision');
      if (!res.ok) {
        if (res.besoinConfirmation) return Response.json({ besoinConfirmation: true, avertissement: res.avertissement }, { status: 409 });
        return Response.json({ erreur: res.motif ?? 'action impossible' }, { status: 409 });
      }
      // Rafraîchit détail + affectation (état du dossier / altitudes à jour).
      const [detail, comparaison] = await Promise.all([lireDetailSuivi(dossierId), lireComparaison(dossierId).catch(() => null)]);
      return Response.json({ ok: true, nbInjectes: res.nbInjectes, nbRestaures: res.nbRestaures, detail, comparaison });
    }

    return Response.json({ erreur: 'action inconnue' }, { status: 400 });
  } catch (e) {
    console.error('[permis/rattachement] POST indisponible', e);
    return Response.json({ erreur: 'action indisponible' }, { status: 503 });
  }
}
