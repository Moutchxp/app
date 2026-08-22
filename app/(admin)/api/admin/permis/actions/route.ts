import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviReponses } from '../../../../../lib/veille/reponsesSuivi';
import { chargerSuiviSaisines } from '../../../../../lib/veille/saisinesSuivi';
import { listerSuivi } from '../../../../../lib/permis/rattachementSuiviRepo';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { compterReponses, compterSaisines, compterRattachement, assemblerComptes, type DemandeComptable } from '../../../../admin/(protected)/permis/comptesActions';

/**
 * /api/admin/permis/actions (PASTILLES) — UNE seule route, TROIS compteurs + le cumul, en une requête. Chaque compteur réutilise
 * les définitions EXISTANTES (chargerSuiviReponses / chargerSuiviSaisines / listerSuivi) — aucun critère réécrit. Le cumul est
 * calculé CÔTÉ SERVEUR (source unique) pour que tuile et onglets ne divergent jamais. Renvoie aussi l'heure du recomptage
 * quotidien (pour que le client planifie ce seul rafraîchissement — AUCUN sondage périodique). RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const [reponsesData, saisinesData, suivi, config] = await Promise.all([
      chargerSuiviReponses(), chargerSuiviSaisines(), listerSuivi(), chargerConfigVeille(),
    ]);
    const reponses = compterReponses({
      demandes: reponsesData.demandes as unknown as DemandeComptable[],
      aRattacher: reponsesData.aRattacher, propositions: reponsesData.propositions,
    });
    const saisines = compterSaisines({ saisissables: saisinesData.saisissables, fileADeposer: saisinesData.fileADeposer });
    const rattachement = compterRattachement(suivi.compteurs);
    return Response.json({ ...assemblerComptes(reponses, saisines, rattachement), recomptageHeure: config.recomptageHeureLocale });
  } catch (e) {
    console.error('[permis/actions] GET impossible (503)', { message: (e as Error)?.message });
    return Response.json({ erreur: 'comptage indisponible' }, { status: 503 });
  }
}
