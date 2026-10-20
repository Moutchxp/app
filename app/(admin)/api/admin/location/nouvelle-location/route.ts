import 'server-only';
import { exigerLocation } from '../../../../../lib/location/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { apercuNouvelleLocation, bauxEnCoursDuLocataire, envoyerNouvelleLocation } from '../../../../../lib/location/mailNouvelleLocationRepo';

/**
 * /api/admin/location/nouvelle-location — LE MAIL « NOUVELLE LOCATION » (ENVOI ADHOC & MONGA) (Arno, 21/10/2026).
 * Au droit « Location » (`exigerLocation`, droit relu en base).
 *   GET `?bail=N`      : l'APERÇU de la fenêtre de confirmation (objet, HTML, texte, destinataires proposés — la copie de la
 *                        personne connectée en tête, puis la liste configurée — et le dernier envoi). Lecture seule.
 *   GET `?locataire=N` : les baux EN COURS du locataire, avec leur dernier envoi (le bouton de sa fiche).
 *   POST `{ bailId, destinataires }` : ENVOIE à la liste confirmée (modifiée pour cet envoi seulement : la configuration n'est
 *                        pas touchée), journalise. 🔴 C'est le SEUL chemin qui envoie : rien ne part sans « Envoyer ».
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

function identifiant(brut: unknown): number | null {
  const s = typeof brut === 'number' ? String(brut) : typeof brut === 'string' ? brut : '';
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  try {
    const locataire = identifiant(url.searchParams.get('locataire'));
    if (locataire !== null) return Response.json({ etat: 'ok', data: await bauxEnCoursDuLocataire(locataire) }, { headers: ENTETES });
    const bail = identifiant(url.searchParams.get('bail'));
    if (bail === null) return Response.json({ etat: 'refus', motif: 'Demande incomplète : le bail manque.' }, { status: 400, headers: ENTETES });
    const apercu = await apercuNouvelleLocation(bail, await auteurDeLaRequete(request));
    return Response.json(apercu === null ? { etat: 'inconnu' } : { etat: 'ok', data: apercu }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/location/nouvelle-location] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES });
  }
  const bail = identifiant(corps.bailId);
  if (bail === null) return Response.json({ etat: 'refus', motif: 'Demande incomplète : le bail manque.' }, { status: 400, headers: ENTETES });
  try {
    return Response.json(await envoyerNouvelleLocation(bail, corps.destinataires, await auteurDeLaRequete(request)), { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/location/nouvelle-location] envoi impossible', e);
    return Response.json({ etat: 'echec', motif: 'la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
