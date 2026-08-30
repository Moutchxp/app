import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerReleveManuelle, depsReellesReleveAuto, type IssueReleveManuelle } from '../../../../../lib/veille/releveAuto';
import { executerDiagnosticsVague, depsReellesDiagnosticsVague } from '../../../../../lib/veille/diagnosticsVague';

/**
 * /api/admin/permis/relever (chantier R1) — DÉCLENCHEUR MANUEL de la relève de la boîte, réservé ADMINISTRATEUR
 * (`exigerAdministrateur`, même motif que toutes les routes permis). POST lance `executerReleveManuelle` : LECTURE IMAP
 * stricte, rattachement/enregistrement des réponses, versement automatique en GED (N1-A).
 *
 * ⚠️ GARDE DE SÛRETÉ (la plus importante du chantier) : ce chemin n'atteint AUCUN envoi vers l'extérieur — ni relance, ni
 * demande, ni saisine/proposition CADA. Il n'appelle que `releverBoite` (via `deps.relever`), dont le graphe d'imports ne
 * contient aucun module d'émission. Aucun secret ne transite côté client : seules des VALEURS AGRÉGÉES (compteurs) sont
 * renvoyées. Pas de catch muet (leçon P2) : on journalise, puis on dégrade avec une sentinelle distinguable (`resultat`).
 * Runtime Node (IMAP + pg).
 */
export const runtime = 'nodejs';

/** Traduit l'issue de la relève en réponse client : compteurs agrégés (ok), message d'information (inactif) ou d'échec. */
function reponse(issue: IssueReleveManuelle): Response {
  if (issue.resultat === 'ok' && issue.rapport) {
    const r = issue.rapport;
    return Response.json({
      resultat: 'ok',
      compteurs: {
        messagesLus: r.vus,
        retenus: r.retenus,
        rattaches: r.rattaches,
        referencesCaptees: r.referencesCaptees,
        enregistrees: r.ecrites,
        depotsGed: r.piecesDeposees,
        echecsDepot: r.piecesNonDeposees,
      },
    });
  }
  if (issue.resultat === 'inactif') {
    return Response.json({ resultat: 'inactif', message: 'Aucune boîte configurée : rien à relever (ce n’est pas une erreur).' });
  }
  return Response.json({ resultat: 'erreur', message: `La relève a échoué : ${issue.raison}` });
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;

  try {
    const issue = await executerReleveManuelle(depsReellesReleveAuto());
    if (issue.resultat === 'erreur') console.error('[permis/relever] relève en échec :', issue.raison);
    // PART-C — relève MANUELLE : diagnostic de vague IMMÉDIAT (Arno considère que tout est arrivé), sans attendre le calme. ISOLÉ :
    //   un échec du diagnostic n'altère jamais la réponse de la relève. AUCUN envoi (le diagnostic ne réclame rien).
    if (issue.resultat === 'ok') {
      try { await executerDiagnosticsVague('manuel', depsReellesDiagnosticsVague()); }
      catch (e) { console.error('[permis/relever] diagnostics de vague (manuel) en échec — relève OK conservée', e); }
    }
    return reponse(issue);
  } catch (e) {
    // Échec AVANT/AUTOUR de la relève elle-même (config, création du client, base indisponible). Jamais silencieux (P2).
    console.error('[permis/relever] échec inattendu', e);
    return Response.json({ resultat: 'erreur', message: 'Relève impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
