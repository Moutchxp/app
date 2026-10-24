import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { exigerLocation } from '../../../../../lib/location/garde';
import { corrigerIndice, creerIndice, indicesDisponibles, lireIndices } from '../../../../../lib/location/indicesRepo';
import { alertesIndices } from '../../../../../lib/location/gestionMensuelleRepo';
import { ajouterLoyerRevise, annulerLoyerRevise, lireLoyersRevises } from '../../../../../lib/location/loyerReviseRepo';

/**
 * /api/admin/location/indices — 🔴 Arno (25/10/2026, migration 423) : LES INDICES DE RÉVISION DES LOYERS.
 *   GET  : `{ disponible, indices, alertes }` — les indices en vigueur (avec leur dernière utilisation) et les indices MANQUANTS dont une
 *          révision a besoin. Droit Location (le bloc « Indice des loyers » de Nouveau locataire les lit).
 *   POST `{ action: 'creer', type, annee, trimestre, valeur }` : « + Saisir un nouvel indice » (droit Location ; doublon refusé) ;
 *        `{ action: 'corriger', type, annee, trimestre, valeur }` : l'onglet « Indices » (ADMINISTRATEUR ; une nouvelle ligne, ajout seul) ;
 *        `{ action: 'loyer-revise', bailId, effetLe, loyerHc, provisions }` / `{ action: 'annuler-loyer-revise', id }` : le loyer révisé RÉEL
 *        d'un bail (Dossier de location ; droit Location).
 *   GET ?bail=N : les loyers révisés (non annulés) du bail ; ?lot=N / ?bienCle=N : les alertes « indice manquant » du bien.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  try {
    const bail = Number(new URL(request.url).searchParams.get('bail'));
    if (Number.isSafeInteger(bail) && bail > 0) return json({ etat: 'ok', data: await lireLoyersRevises(bail) });
    // 🔴 Arno (25/10/2026) — la fiche du bien : ses alertes « indice manquant » (`?lot=N`, ou `?bienCle=N` : le numéro WIPPIMMO).
    const lot = Number(new URL(request.url).searchParams.get('lot'));
    const cle = Number(new URL(request.url).searchParams.get('bienCle'));
    if ((Number.isSafeInteger(lot) && lot > 0) || (Number.isSafeInteger(cle) && cle > 0)) {
      return json({ etat: 'ok', data: { alertes: await alertesIndices(lot > 0 ? { lotId: lot } : { wippimmoId: cle }) } });
    }
    const disponible = await indicesDisponibles();
    const [indices, alertes] = disponible ? await Promise.all([lireIndices(), alertesIndices()]) : [[], []];
    return json({ etat: 'ok', data: { disponible, indices, alertes } });
  } catch (e) {
    console.error('[api/admin/location/indices] lecture impossible', e);
    return json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  let corps: Record<string, unknown>;
  try { corps = await request.json() as Record<string, unknown>; } catch { return json({ etat: 'refus', motif: 'Demande illisible.' }, 400); }
  const garde = corps.action === 'corriger' ? await exigerAdministrateur(request) : await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const auteur = await auteurDeLaRequete(request);
  try {
    if (corps.action === 'creer') return json(await creerIndice(corps, auteur));
    if (corps.action === 'corriger') return json(await corrigerIndice(corps, auteur));
    if (corps.action === 'loyer-revise') return json(await ajouterLoyerRevise(Number(corps.bailId), corps, auteur));
    if (corps.action === 'annuler-loyer-revise') return json(await annulerLoyerRevise(Number(corps.id), auteur));
    return json({ etat: 'refus', motif: 'Demande incomplète.' }, 400);
  } catch (e) {
    console.error('[api/admin/location/indices] écriture impossible', e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' }, 503);
  }
}
