import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { etatAccesDrive, messageAcces } from '../../../../../lib/gestion/jetonCollaborateur';

/**
 * /api/admin/gestion/google (lot 5-PJ-C2) — OÙ EN EST MON ACCÈS AU DRIVE ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CETTE ROUTE NE FAIT PLUS QUE RÉPONDRE. Le lot 5-PJ-C proposait ici de RELIER un compte Google (POST
 * « connecter » / « deconnecter », plus une route de retour OAuth) : Arno a décidé le 25/09 qu'on ne demanderait
 * plus rien à personne. On agit au nom de l'adresse avec laquelle la personne s'est identifiée à l'interface, et il
 * n'y a donc plus aucun geste à lui proposer. Les deux verbes d'écriture ont été retirés, et la route de retour
 * supprimée.
 *
 * 🔒 AUCUN APPEL À GOOGLE ICI. On lit la session, on relit l'adresse en base, on regarde si la clé du compte de
 * service est configurée. Rien d'autre — l'écran doit pouvoir afficher son état sans dépendre de la disponibilité
 * de Google.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

function sansCache(r: Response): Response {
  const e = new Headers(r.headers);
  e.set('Cache-Control', SANS_CACHE);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: e });
}

export async function GET(request: Request): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const acces = await etatAccesDrive(request);
  return Response.json(
    {
      etat: acces.etat,
      message: messageAcces(acces),
      // L'adresse AU NOM DE LAQUELLE on agit. L'écran l'affiche — deux personnes ne voient pas le même Drive, et le
      //   taire ferait chercher pendant dix minutes un dossier auquel on n'a simplement pas accès.
      adresse: acces.etat === 'ok' ? acces.adresse : null,
    },
    { headers: { 'Cache-Control': SANS_CACHE } },
  );
}
