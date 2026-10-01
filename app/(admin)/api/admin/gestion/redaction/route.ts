import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { chargerConfigGestion } from '../../../../../lib/gestion/config';
import { peutEnvoyerAuNomDeGestion } from '../../../../../lib/gestion/gardeEnvoi';
import {
  COMPTE_GESTION, estCompteAttendu, lireIdentifiants, lireSignatures, rafraichirJeton, signatureEnTexte,
} from '../../../../../lib/gestion/google';
import { lireJeton } from '../../../../../lib/gestion/googleJeton';
import { compterBrouillons } from '../../../../../lib/gestion/redactionRepo';
import {
  brouillonCibleDisponible, brouillonClassementDisponible, brouillonHorsGestionDisponible,
  brouillonHtmlDisponible, corbeilleBrouillonDisponible,
  interneDisponible,
  piecesEnvoiDisponibles, redactionDisponible,
} from '../../../../../lib/gestion/schema';
// LOT REDACTION-GMAIL — la signature Gmail est du HTML venu d'un réglage : elle s'assainit comme tout le reste.
import { assainirHtml } from '../../../../../lib/gestion/htmlMail';
// LOT ETOILE-ET-SIGNATURE — ses images passent par NOTRE route : le navigateur n'appelle jamais Google lui-même.
import { signaturePourEcran } from '../../../../../lib/gestion/signatureImages';

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
  /**
   * ══ 🔴 LOT REDACTION-GMAIL — LA SIGNATURE GMAIL EN HTML, AVEC SON LOGO ════════════════════════════════════════
   * Elle est lisible AVEC LA PORTÉE DÉJÀ ACCORDÉE (`gmail.settings.basic`, cf. `google.ts`) : rien de nouveau à
   * autoriser, rien à connecter. On prend donc le HTML TEL QUE GMAIL LE REND, on l'assainit, et l'éditeur riche
   * l'affiche comme elle apparaît dans Gmail — logo compris, quand il est porté par une image distante.
   *
   * ⚠️ LA VERSION TEXTE RESTE CALCULÉE ET RENDUE. Ce n'est pas un doublon : elle part dans la moitié texte du
   * `multipart/alternative`, et elle est le repli quand le HTML n'est pas disponible. Les deux sont tenues
   * d'accord par le même code que le reste du corps.
   *
   * ⚠️ UN LOGO PORTÉ PAR UNE IMAGE DISTANTE (`https://…`) est conservé tel quel ; un logo en `cid:` renverrait à
   * une pièce que NOUS devrions joindre — ce que ce lot ne fait pas encore. Voir le rapport de nuit.
   */
  let signatureHtml = '';
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
          /**
           * 🔴 ASSAINIE, PUIS SES IMAGES RENVOYÉES VERS NOTRE ROUTE (lot ETOILE-ET-SIGNATURE).
           *
           * L'assainissement d'abord, comme pour tout HTML qui entre : la signature vient d'un réglage Gmail,
           * donc d'un formulaire. La réécriture ensuite, et dans cet ordre — l'inverse laisserait passer ce que
           * l'assainissement aurait retiré (même règle que pour les mails reçus, cf. `imagesMail`).
           *
           * ⚠️ MESURÉ LE 29/09/2026 : ces images (`lh3/lh5.googleusercontent.com`) se chargent depuis NOTRE
           * SERVEUR mais restent vides quand la page les demande elle-même. Sans cette réécriture, l'éditeur
           * montrerait trois images cassées — et c'est ce qui avait fait garder la signature TEXTE jusqu'ici.
           */
          signatureHtml = signaturePourEcran(assainirHtml(nôtre?.signature ?? ''));
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
    // LOT 5-PJ-ENVOI — la migration 252 est-elle là ? Sans elle, l'éditeur ne montre aucune zone de pièces jointes
    //   et l'envoi texte reste exactement celui d'avant. Sonde HORS transaction, comme partout dans ce module.
    piecesDisponibles: await piecesEnvoiDisponibles(),
    signature, signatureHtml,
    /**
     * LOT REDACTION-GMAIL — la migration 265 est-elle appliquée ? Deux sondes SÉPARÉES : le brouillon garde-t-il sa
     * mise en forme, et peut-on mémoriser les cibles de « Classer ce mail » ? Sans elles, l'éditeur riche
     * fonctionne quand même et l'envoi part bien en HTML ; seul l'ENREGISTREMENT du brouillon est limité.
     */
    htmlDisponible: await brouillonHtmlDisponible(),
    classementDisponible: await brouillonCibleDisponible(),
    /**
     * 🔴 LOT CLASSER-DEUX-BOUTONS — le classement peut-il être GARDÉ avec le brouillon (migration 285) ? C'est
     * une question distincte de `classementDisponible`, qui dit seulement si la base sait CLASSER un mail.
     */
    classementBrouillonDisponible: await brouillonClassementDisponible(),
    /**
     * 🔴 LOT CLASSER-AVANT-ENVOI — la migration 289 est-elle appliquée ? Elle porte « HORS GESTION » HÉRITÉ en
     * répondant dans un fil déjà marqué ainsi. Encore une question DISTINCTE : les colonnes peuvent diverger si
     * une migration est appliquée à moitié, et l'écran ne doit annoncer que ce qu'il sait.
     */
    classementHorsGestionDisponible: await brouillonHorsGestionDisponible(),
    // 🔴 LOT RATTACHER-EN-ECRIVANT — la 281 (« Interne ») : sans elle, le bouton est grisé avec son motif.
    interneDisponible: await interneDisponible(),
    /**
     * 🔴 LOT LECTURE-HTML-FIL-TROMBONE — la migration 276 est-elle appliquée ? D'elle dépendent les MOTS du bouton
     * qui jette un brouillon (`motsJeterBrouillon`, app/lib/gestion/redaction.ts) : sans la colonne, rien ne peut
     * être réintégré, donc l'éditeur redit « Supprimer le brouillon » et ne montre aucun bandeau « Annuler ».
     * Promettre un retour impossible est pire que ne rien promettre.
     */
    corbeilleBrouillon: await corbeilleBrouillonDisponible(),
    nomExpediteur: NOM_PAR_DEFAUT, adresseGestion: config.adresseGestion || COMPTE_GESTION,
    delaiAnnulationS: config.annulationEnvoiSecondes,
    brouillons,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
