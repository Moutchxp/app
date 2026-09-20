import 'server-only';
import { exigerModule } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { proposition } from '../../../../../../lib/sitadel/demandeRepo';
import { envoyerDemandes } from '../../../../../../lib/sitadel/envoiDemande';
import { dansProcess } from '../../../../../../lib/sitadel/process';

/**
 * 224 — GET /api/admin/permis/demandes/envoi-auto-apercu : VOLUME RÉEL + CAPS pour la MODALE de confirmation du passage en
 * « envoi automatique » (rail e-mail). Tous les chiffres sont LUS/SIMULÉS, jamais en dur :
 *  · `envoyerDemandes({ appliquer:false })` = SIMULATION (transport jsonTransport, transaction ROLLBACK) → AUCUN e-mail, RIEN
 *    persisté, mais les VRAIS `candidats` (demandes 'prete' e-mail) et le `budget` réellement autorisé par les caps (capBatch) ;
 *  · `proposition(cfg)` (filtrée e-mail) → nombre de communes PROPOSABLES par critères (potentiel) ;
 *  · les caps/plafond/fenêtre viennent de la config en base.
 * LECTURE SEULE, RÉSERVÉ ADMINISTRATEUR, AUCUN ENVOI. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerModule(request, 'permis');
  if ('refus' in garde) return garde.refus;
  try {
    const cfg = await chargerConfigVeille();
    // « communes proposables » = potentiel complet → fenêtre d'ancienneté LA PLUS LARGE autorisée (jamais un chiffre en dur).
    const ancienneteMois = 12 * cfg.ancienneteMaxDemandeAnnees;
    const [sim, prop] = await Promise.all([
      envoyerDemandes({ appliquer: false }), // SIMULATION — aucun envoi, aucune écriture (ROLLBACK)
      proposition(cfg, ancienneteMois),
    ]);
    const communesProposables = new Set(prop.lots.filter((l) => dansProcess(l.canal, 'email')).map((l) => l.codeInsee)).size;
    return Response.json({
      pretesMaintenant: sim.candidats,        // demandes 'prete' e-mail adressables (déjà préparées)
      partiraientMaintenant: sim.budget,      // ce qui partirait au prochain passage, CAPS COMPRIS
      communesProposables,                    // communes e-mail proposables par critères (potentiel à préparer)
      capParRun: sim.capParRun,
      capParJour: sim.capParJour,
      plafondMensuelParCommune: cfg.permisParCommuneParMois,
      fenetreDebut: cfg.envoiHeureDebut,
      fenetreFin: cfg.envoiHeureFin,
    });
  } catch {
    return Response.json({ erreur: 'aperçu indisponible' }, { status: 503 });
  }
}
