import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerSuiviReponses } from '../../../../../lib/veille/reponsesSuivi';
import { chargerSuiviSaisines } from '../../../../../lib/veille/saisinesSuivi';
import { listerSuivi } from '../../../../../lib/permis/rattachementSuiviRepo';
import { compterFileProjection } from '../../../../../lib/permis/projectionFileRepo';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { compterReponses, compterSaisines, compterRattachement, compterEnCoursASignaler, assemblerComptes, type DemandeComptable } from '../../../../admin/(protected)/permis/comptesActions';
import { ligneEnCoursASignaler } from '../../../../../lib/sitadel/demandesListe';

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
    const [reponsesData, saisinesData, suivi, fileProjection] = await Promise.all([
      chargerSuiviReponses(), chargerSuiviSaisines(), listerSuivi(), compterFileProjection(config),
    ]);
    // LOT COMPLET — SURV-1 (alerte de surveillance de polygone) est désormais FONDU dans la catégorie ① de « Rattachement » : une alerte
    //   sur un permis VALIDÉ EST « un signal de mise à jour détecté » → comptée par `rattAFaire` (via `alertesSurveillance` de la ligne).
    //   Plus de terme surveillance SÉPARÉ (sinon double-compte avec la pastille ①). Conservé à 0 pour la forme de `assemblerComptes`.
    const surveillance = 0;
    // LOT 52 (point 1) — INVARIANT « pastille d'onglet == nombre de LIGNES affichées » (patron LOT 46/47) : la pastille « Analyse »
    //   vaut EXACTEMENT `compterFileProjection` = `listerFileProjection().length`, c.-à-d. les lignes rendues par l'onglet.
    //   ANTÉRIEUR au LOT 51 : on ajoutait ici `relancesReponseDue` (relances sur réponse partielle PART-E dues en mode manuel) —
    //   or ces dossiers sont partiel-actifs, EXCLUS de la file (FIX-2), donc SANS ligne dans l'onglet → la pastille gonflait déjà
    //   sans test en cours. Le LOT 51 l'a rendu visible en ajoutant un DOUBLE-compte (un dossier partiel-actif « testé » tombait
    //   dans les deux termes). Décision porteur : le signal « N relances à envoyer à la main » relève de « En cours » (là où l'action
    //   se fait), pas d'« Analyse » — retiré de cet agrégat (le mécanisme PART-E d'envoi/auto est INCHANGÉ).
    const projection = fileProjection;
    const reponses = compterReponses({
      demandes: reponsesData.demandes as unknown as DemandeComptable[],
      aRattacher: reponsesData.aRattacher, propositions: reponsesData.propositions,
      liensATelecharger: reponsesData.liensATelecharger, // GED-1 : les liens à télécharger comptent dans la pastille Réponses
    });
    const saisines = compterSaisines({ saisissables: saisinesData.saisissables, fileADeposer: saisinesData.fileADeposer });
    const rattachement = compterRattachement(suivi.comptesGroupes);
    // LOT 46/47 — pastille de l'onglet « En cours » : lignes qui DEMANDENT UNE ACTION = incomplet à relancer OU nouvelles pièces
    //   reçues (prédicat partagé ligneEnCoursASignaler → compteur == somme des lignes allumées). LOT 72 — ENTRE désormais dans `total`
    //   (assemblerComptes) : la tuile home cumule TOUS les onglets. Pas de double-compte : ligneEnCoursASignaler EXCLUT un dossier
    //   testé en analyse (compté, lui, par `projection`) — « jamais dans deux onglets ».
    const enCours = compterEnCoursASignaler(reponsesData.demandes as unknown as Parameters<typeof ligneEnCoursASignaler>[0][]);
    return Response.json({ ...assemblerComptes(reponses, saisines, rattachement, projection, surveillance, enCours), recomptageHeure: config.recomptageHeureLocale });
  } catch (e) {
    console.error('[permis/actions] GET impossible (503)', { message: (e as Error)?.message });
    return Response.json({ erreur: 'comptage indisponible' }, { status: 503 });
  }
}
