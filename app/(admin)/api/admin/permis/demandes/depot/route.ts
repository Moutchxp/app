import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { listerADeposer, marquerDeposee, DepotInterditError } from '../../../../../../lib/sitadel/demandeRepo';
import { retenterRattachementParReference } from '../../../../../../lib/veille/demandeReponseRepo'; // FUS-4 ② : re-rattachement différé, second appelant
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig'; // LOT 34 : délai de relève déclenchée (pilotage sans code)

/**
 * /api/admin/permis/demandes/depot (chantier S16). GET = demandes en canal 'formulaire' encore à déposer à la main sur le
 * téléservice de la commune (texte figé + URL). POST = marque une demande comme DÉPOSÉE (statut 'envoyee'). RÉSERVÉ
 * ADMINISTRATEUR (proxy fail-closed + garde). AUCUN envoi automatique. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    // LOT 34 — on joint le délai (config, résilient) : le client programme la relève déclenchée après ce délai au clic « copier ».
    const [demandes, cfg] = await Promise.all([listerADeposer(), chargerConfigVeille()]);
    return Response.json({ demandes, releveDelaiSecondes: cfg.depotReleveDelaiSecondes });
  } catch {
    return Response.json({ erreur: 'liste indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let idCtx: unknown;
  try {
    // P1 — `reference` FACULTATIVE : la mairie renvoie parfois sa référence (accusé de réception) au moment du dépôt.
    const c = (await request.json()) as { id?: unknown; reference?: unknown };
    idCtx = c.id;
    if (!Number.isInteger(c.id)) return Response.json({ erreur: 'id invalide' }, { status: 400 });
    const reference = typeof c.reference === 'string' ? c.reference : undefined; // absente/non-string → dépôt sans référence
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    try {
      await marquerDeposee(c.id as number, auteur, reference);
    } catch (e) {
      if (e instanceof DepotInterditError) return Response.json({ erreur: e.raison }, { status: 409 });
      throw e;
    }
    // FUS-4 ② — SECOND appelant du re-rattachement différé (le plus fréquent) : Arno colle la référence de l'accusé dans le champ
    //   « Référence mairie » puis « Marquer comme déposée », alors que le message de la mairie est souvent déjà arrivé, non rattaché.
    //   L'appel se fait APRÈS le commit du dépôt (marquerDeposee a sa transaction propre ; statut = 'envoyee'), dans un try/catch
    //   ISOLÉ. DEUX raisons : la garde d'ambiguïté de retenter exige un statut IN ('envoyee','close') → elle doit voir le NOUVEAU
    //   statut ; et le dépôt ne doit JAMAIS être défait par un rattachement → échec = log serveur, réponse inchangée. Canal
    //   'formulaire' garanti (marquerDeposee refuse les autres). Réutilise retenter TEL QUEL (plancher, ambiguïté, WHERE
    //   demande_id IS NULL, méthode 'reference_differee'). Pas de référence saisie → aucun appel.
    let rattaches = 0;
    const refTrim = typeof reference === 'string' ? reference.trim() : '';
    if (refTrim !== '') {
      try {
        rattaches = await retenterRattachementParReference(c.id as number, refTrim, auteur ?? 'admin');
      } catch (e) {
        console.error('[permis/demandes/depot] re-rattachement différé en échec (dépôt PRÉSERVÉ)', { id: idCtx, message: (e as { message?: unknown })?.message });
      }
    }
    return Response.json({ ok: true, rattaches });
  } catch (e) {
    // Trace SERVEUR de l'exception inattendue (jamais de catch muet) : la réponse HTTP reste un 503 générique.
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/demandes/depot] POST dépôt impossible (503)', {
      id: idCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
