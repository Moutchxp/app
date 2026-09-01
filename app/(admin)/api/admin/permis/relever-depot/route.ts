import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerReleveDemandee, depsReellesReleveDemandee, type IssueReleveDemandee } from '../../../../../lib/veille/releveAuto';

/**
 * LOT 34 — /api/admin/permis/relever-depot : relève DÉCLENCHÉE par le clic « copier » d'un dépôt téléservice (appelée par le client
 * après le délai `depot_releve_delai_secondes`). RÉSERVÉ ADMINISTRATEUR.
 *
 * ⚠️ GARDE DE SÛRETÉ (la plus importante) : ce chemin n'atteint AUCUN envoi vers l'extérieur — ni relance, ni cascade, ni saisine.
 * Il n'appelle QUE `executerReleveDemandee` → `executerReleveManuelle` → `releverBoite` (LECTURE IMAP stricte). On n'appelle JAMAIS
 * `executerVeille` (c'est LÀ que vivent les envois). Import-guard : ce fichier n'importe aucun module d'émission (test dédié).
 * Le verrou consultatif de la veille est réutilisé (`CLE_VERROU_VEILLE`) → 'occupe' si un run/relève tourne déjà (pas de superposition).
 * Runtime Node (IMAP + pg).
 */
export const runtime = 'nodejs';

function reponse(issue: IssueReleveDemandee): Response {
  if (issue.resultat === 'occupe') {
    return Response.json({ resultat: 'occupe', message: 'Une relève est déjà en cours — réessayez dans un instant.' });
  }
  if (issue.resultat === 'ok' && issue.rapport) {
    const r = issue.rapport;
    return Response.json({
      resultat: 'ok',
      compteurs: { messagesLus: r.vus, retenus: r.retenus, rattaches: r.rattaches, referencesCaptees: r.referencesCaptees, enregistrees: r.ecrites },
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
    const issue = await executerReleveDemandee(depsReellesReleveDemandee());
    if (issue.resultat === 'erreur') console.error('[permis/relever-depot] relève déclenchée en échec :', issue.raison);
    return reponse(issue);
  } catch (e) {
    console.error('[permis/relever-depot] échec inattendu', e); // jamais silencieux (P2)
    return Response.json({ resultat: 'erreur', message: 'Relève impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
