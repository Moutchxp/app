import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { relever } from '../../../../../lib/gestion/releveReelle';
import { resume } from '../../../../../lib/gestion/releve';

/**
 * /api/admin/gestion/relever (lot 3) — DÉCLENCHEUR MANUEL d'UNE passe de relève du dossier de gestion.
 *
 * 🔒 GARDE D'ÉCRITURE : `exigerCompteActif(request, 'gestion')` relit l'état RÉEL du compte EN BASE à chaque appel — un
 * droit retiré ou un compte désactivé coupe l'accès au prochain clic, sans attendre l'expiration du jeton (8 h). Le
 * proxy a déjà refusé le préfixe en amont : deux barrières indépendantes.
 *
 * 🔒 GARDE DE SÛRETÉ (la plus importante du lot) : ce chemin n'atteint AUCUN envoi vers l'extérieur. Son graphe
 * d'imports ne contient ni nodemailer ni aucun module d'émission — il ne fait que LIRE la boîte (ouverture `readOnly`)
 * et écrire dans les tables `gestion_*` et sur le stockage objet. Aucun secret ne transite côté client : seules des
 * valeurs AGRÉGÉES (compteurs) sont renvoyées.
 *
 * Pas de catch muet (leçon P2) : on journalise, puis on dégrade avec une sentinelle distinguable (`resultat`).
 * Runtime Node (IMAP + pg).
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  try {
    // Journal SERVEUR de la progression : une passe dure des minutes, et une panne réseau doit laisser une trace
    //   datée dans les logs, pas seulement un message à l'écran.
    const issue = await relever(true, (ligne) => console.log('[gestion/relever]', ligne));
    if (issue.resultat === 'erreur') console.error('[gestion/relever] passe en échec :', issue.raison);
    if (issue.resultat === 'ok' && issue.rapport) {
      const r = issue.rapport;
      return Response.json({
        resultat: 'ok',
        resume: resume(r),
        compteurs: {
          messagesLus: r.vus, captures: r.captures, dejaConnus: r.dejaConnus, exclus: r.exclus,
          recus: r.recus, envoyes: r.envoyes, filsCrees: r.filsCrees, filsFusionnes: r.filsFusionnes,
          piecesDeposees: r.piecesDeposees, piecesNonDeposees: r.piecesNonDeposees,
          echecsLecture: r.echecsLecture, plafondAtteint: r.plafondAtteint, resteAVoir: Math.max(0, r.uidsServeur - r.vus),
        },
      });
    }
    // 'occupe' / 'inactif' / 'erreur' : chacun dit ce qu'il est, jamais un « erreur » générique.
    return Response.json({ resultat: issue.resultat, message: issue.raison });
  } catch (e) {
    console.error('[gestion/relever] échec inattendu', e);
    return Response.json({ resultat: 'erreur', message: 'Relève impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
