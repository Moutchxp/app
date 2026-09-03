import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviReponses } from '../../../../../lib/veille/reponsesSuivi';
import { chargerSuiviSaisines } from '../../../../../lib/veille/saisinesSuivi';
import { listerSuivi } from '../../../../../lib/permis/rattachementSuiviRepo';
import { compterFileProjection } from '../../../../../lib/permis/projectionFileRepo';
import { compterRelancesReponseDue } from '../../../../../lib/veille/relanceReponsePartielleAuto';
import { compterSurveillanceDossiers } from '../../../../../lib/veille/surveillancePolygonesAuto';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { compterReponses, compterSaisines, compterRattachement, compterEnCoursIncomplet, assemblerComptes, type DemandeComptable } from '../../../../admin/(protected)/permis/comptesActions';
import { demandeEnCoursIncomplete } from '../../../../../lib/sitadel/demandesListe';

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
    const config = await chargerConfigVeille();
    const [reponsesData, saisinesData, suivi, fileProjection, relancesReponseDue, surveillance] = await Promise.all([
      chargerSuiviReponses(), chargerSuiviSaisines(), listerSuivi(), compterFileProjection(config),
      compterRelancesReponseDue(config.relanceAutoActive), // PART-E : relances « réponse partielle » à envoyer À LA MAIN (0 en mode auto)
      compterSurveillanceDossiers(),
    ]);
    // PART-E — la pastille « Analyse » additionne la file d'instruction (GED reçue) ET les relances sur réponse dues en mode manuel.
    const projection = fileProjection + relancesReponseDue;
    const reponses = compterReponses({
      demandes: reponsesData.demandes as unknown as DemandeComptable[],
      aRattacher: reponsesData.aRattacher, propositions: reponsesData.propositions,
      liensATelecharger: reponsesData.liensATelecharger, // GED-1 : les liens à télécharger comptent dans la pastille Réponses
    });
    const saisines = compterSaisines({ saisissables: saisinesData.saisissables, fileADeposer: saisinesData.fileADeposer });
    const rattachement = compterRattachement(suivi.compteurs);
    // LOT 46 — pastille de l'onglet « En cours » : dossiers incomplets à relancer. Agrégat DISTINCT (jamais dans `total` tant que la
    //   tuile home n'est pas câblée, LOT 48) → aucun changement de la tuile ni des compteurs existants. MÊME prédicat que la ligne.
    const enCours = compterEnCoursIncomplet(reponsesData.demandes as unknown as Parameters<typeof demandeEnCoursIncomplete>[0][]);
    return Response.json({ ...assemblerComptes(reponses, saisines, rattachement, projection, surveillance), enCours, recomptageHeure: config.recomptageHeureLocale });
  } catch (e) {
    console.error('[permis/actions] GET impossible (503)', { message: (e as Error)?.message });
    return Response.json({ erreur: 'comptage indisponible' }, { status: 503 });
  }
}
