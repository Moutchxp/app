import 'server-only';
import { enregistrerDelaiArchivage } from '../../../../../lib/gestion/finGestionRepo';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  ajouterVersionBareme, corrigerVersionBareme, enregistrerDestinataires, lireParametresLocation,
} from '../../../../../lib/location/parametresLocationRepo';

/**
 * /api/admin/location/parametres — L'ESPACE « PARAMÈTRES LOCATION » (roue crantée de l'accueil) (Arno, 21/10/2026).
 * 🔒 ADMINISTRATEURS SEULEMENT (`exigerAdministrateur` relit le rôle en base à chaque appel).
 *   GET : la liste des destinataires par défaut du mail « Nouvelle location », les versions des barèmes (avec le nombre de
 *         baux qui les utilisent), la date du jour à Paris, ce qui manque en base.
 *   POST `{ action: 'destinataires', liste }` : une NOUVELLE version de la liste (la précédente reste en base) ;
 *        `{ action: 'bareme', depuis, tresTendue, tendue, autre, etatDesLieux, source? }` : une NOUVELLE version du barème ;
 *        `{ action: 'corriger-bareme', id, … }` : corrige une version FUTURE jamais utilisée (sinon refus — aussi en base).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json({ etat: 'ok', data: await lireParametresLocation() }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/location/parametres] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const auteur = await auteurDeLaRequete(request);
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES });
  }
  try {
    // Arno (21/10/2026, 405) — « Archivage des fins de gestion » : le délai en mois (vaut pour les biens pas encore archivés).
    if (corps.action === 'archivage-delai') return Response.json(await enregistrerDelaiArchivage(corps.mois, auteur), { headers: ENTETES });
    if (corps.action === 'destinataires') return Response.json(await enregistrerDestinataires(corps.liste, auteur), { headers: ENTETES });
    if (corps.action === 'bareme') return Response.json(await ajouterVersionBareme(corps, auteur), { headers: ENTETES });
    if (corps.action === 'corriger-bareme') {
      const id = typeof corps.id === 'number' && Number.isSafeInteger(corps.id) && corps.id > 0 ? corps.id : null;
      if (id === null) return Response.json({ etat: 'refus', motif: 'Demande incomplète : la version manque.' }, { status: 400, headers: ENTETES });
      return Response.json(await corrigerVersionBareme(id, corps, auteur), { headers: ENTETES });
    }
    return Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/location/parametres] écriture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' }, { status: 503, headers: ENTETES });
  }
}
