import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import {
  COOKIE_ETAT, cookieEtatEfface, echangerPourCollaborateur, lireCookie, uriRetour, verifierEtRelier,
} from '../../../../../../lib/gestion/connexionGoogle';
import { lireIdentifiants } from '../../../../../../lib/gestion/google';

/**
 * /api/admin/gestion/google/retour (lot 5-PJ-C) — LE RETOUR DEPUIS GOOGLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 L'ÉTAT ANTI-CSRF EST VÉRIFIÉ AVANT TOUT. Sans lui, un tiers pourrait faire relier SON compte Google au compte
 * de quelqu'un d'autre en lui faisant simplement ouvrir un lien : le sélecteur montrerait alors le Drive de
 * l'attaquant, et les dépôts iraient chez lui. Le cookie est effacé aussitôt — un état qui a servi ne resert pas.
 *
 * 🔒 LE DOMAINE EST VÉRIFIÉ ENSUITE, sur le jeton d'identité rendu par Google, contre la liste EN CONFIGURATION.
 *
 * 🔴 CETTE ROUTE REDIRIGE VERS L'ÉCRAN, toujours, avec un message en clair dans l'adresse. C'est une navigation de
 * premier niveau : rendre du JSON afficherait un fichier brut à quelqu'un qui vient de cliquer « Autoriser ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ECRAN = '/admin/gestion';

/** Renvoie à l'écran en DISANT ce qui s'est passé, et en effaçant l'état — quel que soit le verdict. */
function versEcran(origine: string, params: Record<string, string>): Response {
  const u = new URL(ECRAN, origine);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = new Response(null, { status: 303, headers: { Location: u.toString(), 'Cache-Control': 'private, no-store' } });
  r.headers.append('Set-Cookie', cookieEtatEfface(origine.startsWith('https:')));
  return r;
}

export async function GET(request: Request): Promise<Response> {
  const origine = new URL(request.url).origin;

  // Le droit d'abord : ce retour écrit un compte Google dans la base, il n'est pas plus public que le reste.
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return barrage;

  const url = new URL(request.url);
  const code = (url.searchParams.get('code') ?? '').trim();
  const etatRecu = (url.searchParams.get('state') ?? '').trim();
  const refus = (url.searchParams.get('error') ?? '').trim();

  // La personne a cliqué « Annuler » : ce n'est pas une erreur, et le dire autrement serait inquiétant pour rien.
  if (refus !== '') return versEcran(origine, { google: 'annule' });

  const etatAttendu = lireCookie(request.headers.get('cookie'), COOKIE_ETAT);
  if (etatAttendu === null || etatRecu === '' || etatRecu !== etatAttendu) {
    return versEcran(origine, {
      google: 'erreur',
      detail: 'La connexion n’a pas pu être vérifiée (état de sécurité absent ou différent). Recommence depuis la tuile Gestion.',
    });
  }
  if (code === '') return versEcran(origine, { google: 'erreur', detail: 'Google n’a pas renvoyé de code.' });

  const identifiants = lireIdentifiants();
  if (identifiants === null) {
    return versEcran(origine, { google: 'erreur', detail: 'Aucun identifiant de client OAuth configuré.' });
  }
  const auteur = await auteurDeLaRequete(request);
  if (auteur.id === null) {
    return versEcran(origine, { google: 'erreur', detail: 'Cet accès n’est rattaché à aucun compte personnel.' });
  }

  try {
    const echange = await echangerPourCollaborateur({
      clientId: identifiants.clientId, clientSecret: identifiants.clientSecret,
      code, redirectUri: uriRetour(origine),
    });
    if (!echange.ok) return versEcran(origine, { google: 'erreur', detail: echange.motif });

    const relie = await verifierEtRelier({
      utilisateurId: auteur.id, auteurLibelle: auteur.libelle, echange: echange.valeur,
    });
    // Un domaine refusé est un REFUS EXPLICITE, avec la liste des comptes acceptés : sans elle, on ne sait pas s'il
    //   faut changer de compte ou demander un droit.
    if (!relie.ok) return versEcran(origine, { google: 'refuse', detail: relie.motif });

    return versEcran(origine, { google: 'connecte', compte: relie.valeur.email });
  } catch (e) {
    console.error('[gestion/google/retour] connexion impossible', e);
    return versEcran(origine, { google: 'erreur', detail: 'La connexion n’a pas abouti.' });
  }
}
