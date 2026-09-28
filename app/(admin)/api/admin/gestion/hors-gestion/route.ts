import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  annulerHorsGestion, historiqueHorsGestion, lireHorsGestion, marquerHorsGestion,
} from '../../../../../lib/gestion/horsGestionRepo';
import { horsGestionDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/hors-gestion — LOT STATUT-HORS-GESTION : CE MAIL NE CONCERNE AUCUN BIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UN STATUT POSÉ À LA MAIN, ET SEULEMENT À LA MAIN. Chaque verbe exige `exigerCompteActif(request, 'gestion')` et
 * écrit le NOM de la personne : il n'existe aucun chemin par lequel un programme pourrait marquer un mail hors
 * gestion, et la base le refuse de son côté (migration 266).
 *
 * LES VERBES — tous RÉVERSIBLES, aucun ne supprime rien :
 *   · GET    ?messages=1,2,3   les marques vivantes de ces mails
 *   · GET    ?historique=N     toutes les marques d'un mail, vivantes et annulées, la plus récente d'abord
 *   · POST   { messageIds, motif? }   marquer
 *   · DELETE { messageIds, motif? }   annuler (écrit `retire_le` ; la ligne reste, datée et signée)
 *
 * ⚠️ `sans_schema` (migration 266 non appliquée) N'EST PAS UNE ERREUR : c'est un état, rendu en 200. L'écran grise
 * alors l'option en disant pourquoi. Une 500 ferait croire à une panne.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** Une liste d'identifiants, BORNÉE. PUR : c'est elle qu'on éprouve, pas la route entière. */
export const MESSAGES_MAX = 500;

export function lireMessageIds(brut: unknown): number[] {
  const liste = Array.isArray(brut) ? brut
    : typeof brut === 'string' ? brut.split(',')
      : typeof brut === 'number' ? [brut] : [];
  const propres = liste
    .map((x) => Number(typeof x === 'string' ? x.trim() : x))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return [...new Set(propres)].slice(0, MESSAGES_MAX);
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  try {
    if (!(await horsGestionDisponible())) {
      return Response.json({ etat: 'sans_schema', data: {} }, { headers: ENTETES });
    }
    const hist = lireMessageIds(url.searchParams.get('historique'));
    if (hist.length === 1) {
      return Response.json({ etat: 'ok', historique: await historiqueHorsGestion(hist[0]) }, { headers: ENTETES });
    }
    const marques = await lireHorsGestion(lireMessageIds(url.searchParams.get('messages')));
    // Une `Map` ne se sérialise pas en JSON : on rend un objet, indexé par identifiant de message.
    return Response.json(
      { etat: 'ok', data: Object.fromEntries([...marques].map(([k, v]) => [String(k), v])) },
      { headers: ENTETES });
  } catch (e) {
    // Pas de catch muet : un objet vide se lirait « aucun mail n'est hors gestion », ce qui serait faux.
    console.error('[api/admin/gestion/hors-gestion] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

/** Le corps d'un geste, ou `null` s'il est illisible. */
async function corpsDuGeste(request: Request): Promise<{ messageIds: number[]; motif: string | null } | null> {
  try {
    const c = (await request.json()) as { messageIds?: unknown; motif?: unknown };
    return {
      messageIds: lireMessageIds(c.messageIds),
      motif: typeof c.motif === 'string' ? c.motif.trim().slice(0, 300) : null,
    };
  } catch { return null; }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const corps = await corpsDuGeste(request);
  if (corps === null) return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: ENTETES });
  if (corps.messageIds.length === 0) {
    return Response.json({ erreur: 'Aucun mail désigné.' }, { status: 400, headers: ENTETES });
  }

  try {
    const issue = await marquerHorsGestion({
      messageIds: corps.messageIds, motif: corps.motif, auteur: await auteurDeLaRequete(request),
    });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    return Response.json({ ok: true, nb: issue.nb }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/hors-gestion] marquage impossible', e);
    return Response.json({ erreur: 'Marquage impossible : erreur interne du serveur.' },
      { status: 503, headers: ENTETES });
  }
}

/**
 * ANNULER — et non SUPPRIMER. Le verbe HTTP dit « retire cette marque » ; en base, la ligne reste, avec qui l'a
 * annulée et quand. C'est la même convention que le `PATCH` vers `retire` des rattachements.
 */
export async function DELETE(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const corps = await corpsDuGeste(request);
  if (corps === null) return Response.json({ erreur: 'Requête illisible.' }, { status: 400, headers: ENTETES });
  if (corps.messageIds.length === 0) {
    return Response.json({ erreur: 'Aucun mail désigné.' }, { status: 400, headers: ENTETES });
  }

  try {
    const issue = await annulerHorsGestion({
      messageIds: corps.messageIds, motif: corps.motif, auteur: await auteurDeLaRequete(request),
    });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    return Response.json({ ok: true, nb: issue.nb }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/hors-gestion] annulation impossible', e);
    return Response.json({ erreur: 'Annulation impossible : erreur interne du serveur.' },
      { status: 503, headers: ENTETES });
  }
}
