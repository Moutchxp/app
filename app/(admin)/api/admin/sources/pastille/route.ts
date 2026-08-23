import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireSourcesFraicheur } from '../../../../../lib/admin/sourcesFraicheurRepo';
import { lireDetections } from '../../../../../lib/veille/detectionRepo';
import { construireEtatSources } from '../../../../../lib/admin/sourcesFraicheur';
import { lireFichierProtocoles } from '../../../../../lib/admin/protocolesRepo';
import { construireAffichageProtocoles } from '../../../../../lib/admin/protocolesReingestion';
import { compterMisesAJourActionnables } from '../../../../../lib/admin/pastilleSources';

/**
 * /api/admin/sources/pastille (F7) — compte LÉGER des sources ACTIONNABLES (mise à jour détectée ET procédure réelle a/b) pour
 * la pastille de la tuile home. Ne mesure PAS le disque (F4) : plus léger que le GET principal. Le classement (a)/(b)/(c) vient
 * du parseur de protocoles F5 (source de vérité unique). RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 *
 * Compte indéterminable (protocoles illisibles, lecture en échec) → `{ indisponible: true }`, JAMAIS `total: 0` : absence de
 * mesure et absence de mise à jour ne doivent pas se ressembler. Erreur complète journalisée (pas de catch muet).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const [lectures, detections, texteProtocoles] = await Promise.all([
      lireSourcesFraicheur(), lireDetections(), lireFichierProtocoles(),
    ]);
    const lignes = construireEtatSources(lectures, new Date(), detections);
    const protocoles = construireAffichageProtocoles(texteProtocoles);
    const total = compterMisesAJourActionnables(lignes, protocoles);
    if (total === null) return Response.json({ indisponible: true }); // protocoles illisibles → aucune pastille (pas « 0 »)
    return Response.json({ total });
  } catch (e) {
    console.error('[sources/pastille] comptage impossible (503)', e);
    return Response.json({ erreur: 'comptage indisponible' }, { status: 503 });
  }
}
