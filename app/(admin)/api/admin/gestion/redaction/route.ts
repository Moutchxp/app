import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { chargerConfigGestion } from '../../../../../lib/gestion/config';
import { peutEnvoyerAuNomDeGestion } from '../../../../../lib/gestion/gardeEnvoi';
import {
  COMPTE_GESTION, estCompteAttendu, lireIdentifiants, lireSignatures, rafraichirJeton, signatureEnTexte,
} from '../../../../../lib/gestion/google';
import { lireJeton } from '../../../../../lib/gestion/googleJeton';
import { compterBrouillons } from '../../../../../lib/gestion/redactionRepo';
import { redactionDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/redaction (lot 5e) — CE QUE L'ÉCRAN A BESOIN DE SAVOIR AVANT DE PROPOSER D'ÉCRIRE.
 *
 * Quatre questions, une seule réponse :
 *   ① la base est-elle à jour (migrations 239/240) ? sinon aucun bouton, et l'écran dit « mise à jour à appliquer » ;
 *   ② ce compte a-t-il le DROIT d'envoyer ? sinon aucun bouton, et l'écran dit pourquoi ;
 *   ③ la connexion Google existe-t-elle ? sinon on écrit quand même — c'est à l'ENVOI qu'on butera, et le brouillon
 *      sera conservé ;
 *   ④ quelle signature, quel nom d'expéditeur, quel délai d'annulation.
 *
 * 🔒 `exigerCompteActif(request, 'gestion')` puis la garde d'envoi RELUE EN BASE. Aucun jeton, aucun secret dans la
 * réponse : la signature en est le seul contenu, et c'est celle que l'utilisateur voit déjà dans Gmail.
 * `private, no-store`. Runtime Node.
 */
export const runtime = 'nodejs';

/** Le nom affiché par défaut, quand Gmail ne nous en donne pas — décision d'Arno. */
const NOM_PAR_DEFAUT = 'CRITERIMMO';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const [schemaPret, peutEnvoyer, config] = await Promise.all([
    redactionDisponible(), peutEnvoyerAuNomDeGestion(request), chargerConfigGestion(),
  ]);

  let signature = '';
  let jetonPresent = false;
  // La signature ne se demande à Google QUE si la connexion existe. Sans jeton, on ne tente rien : une tentative
  //   vouée à l'échec ajouterait une seconde d'attente à chaque ouverture de l'écran, pour rien.
  const identifiants = lireIdentifiants();
  const jeton = lireJeton();
  if (identifiants !== null && jeton !== null) {
    jetonPresent = true;
    try {
      const acces = await rafraichirJeton({ identifiants, refreshToken: jeton.refreshToken }, { fetch });
      if (acces.ok) {
        const sigs = await lireSignatures(acces.valeur, { fetch });
        if (sigs.ok) {
          const nôtre = sigs.valeur.find((s) => estCompteAttendu(s.adresse)) ?? sigs.valeur.find((s) => s.parDefaut);
          signature = signatureEnTexte(nôtre?.signature ?? '');
        }
      } else {
        jetonPresent = false; // jeton périmé : l'écran doit le traiter comme une absence de connexion
      }
    } catch {
      jetonPresent = false; // Google injoignable : on n'invente pas une signature, et on ne casse pas l'écran
    }
  }

  const brouillons = schemaPret ? await compterBrouillons().catch(() => 0) : 0;

  return Response.json({
    schemaPret, peutEnvoyer, jetonPresent,
    signature, nomExpediteur: NOM_PAR_DEFAUT, adresseGestion: config.adresseGestion || COMPTE_GESTION,
    delaiAnnulationS: config.annulationEnvoiSecondes,
    brouillons,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
