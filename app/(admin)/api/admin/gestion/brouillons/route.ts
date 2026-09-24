import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { peutEnvoyerAuNomDeGestion, refusEnvoi } from '../../../../../lib/gestion/gardeEnvoi';
import { decouperAdresses } from '../../../../../lib/gestion/redaction';
import {
  abandonnerBrouillon, enregistrerBrouillon, lireBrouillonDuFil, listerBrouillons,
} from '../../../../../lib/gestion/redactionRepo';
import { redactionDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/brouillons (lot 5e) — ENREGISTRER, RETROUVER, ABANDONNER un brouillon.
 *
 * 🔴 CETTE ROUTE N'ENVOIE JAMAIS RIEN, et c'est structurel, pas une promesse : elle n'importe aucun chemin d'envoi
 * (ni `envoi.ts`, ni `envoiGmail.ts`, ni `google.ts`). Enregistrer un brouillon ne peut donc pas déclencher un mail,
 * même par erreur de câblage — c'est ce que garantit un test statique sur ses imports.
 *
 * 🔴 UN BROUILLON N'EST JAMAIS SUPPRIMÉ : `DELETE` l'ABANDONNE, en le datant. Le verbe HTTP dit « retire-le de ma
 * liste », la base dit « garde-le » — et c'est la base qui a raison sur du travail humain.
 *
 * 🔒 `exigerCompteActif(request,'gestion')`, puis la garde d'ENVOI relue en base : écrire un brouillon au nom de
 * gestion@ est déjà agir en son nom. L'auteur est lu dans la SESSION, jamais envoyé par le navigateur.
 * `private, no-store`. Runtime Node.
 */
export const runtime = 'nodejs';

/** Les migrations 239/240 ne sont pas passées : on le DIT, au lieu d'échouer sur une table absente. */
function sansSchema(): Response {
  return Response.json({ erreur: 'Mise à jour de la base à appliquer avant d’écrire des messages.' }, { status: 503 });
}

/** Une liste d'adresses reçue du navigateur, nettoyée ici AUSSI : l'écran n'est jamais l'autorité. */
function adresses(brut: unknown): string[] {
  if (Array.isArray(brut)) return decouperAdresses(brut.filter((x): x is string => typeof x === 'string').join(','));
  return typeof brut === 'string' ? decouperAdresses(brut) : [];
}

function texte(brut: unknown, max: number): string {
  return typeof brut === 'string' ? brut.slice(0, max) : '';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await redactionDisponible()) return Response.json({ brouillon: null, brouillons: [] });

  const filBrut = new URL(request.url).searchParams.get('fil');
  try {
    // Avec `?fil=` : le brouillon de CET échange (pour rouvrir la conversation là où on l'avait laissée).
    if (filBrut !== null) {
      const filId = Number(filBrut);
      if (!Number.isInteger(filId) || filId <= 0) return Response.json({ erreur: 'Échange inconnu.' }, { status: 400 });
      return Response.json({ brouillon: await lireBrouillonDuFil(filId) },
        { headers: { 'Cache-Control': 'private, no-store' } });
    }
    // Sans paramètre : tous les brouillons vivants — ce que montre le libellé « Brouillons ».
    return Response.json({ brouillons: await listerBrouillons() },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/brouillons] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await peutEnvoyerAuNomDeGestion(request)) return refusEnvoi();
  if (!await redactionDisponible()) return sansSchema();

  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422 }); }

  const voies = ['repondre', 'repondre_tous', 'transferer', 'nouveau'] as const;
  const voie = voies.find((v) => v === corps.voie) ?? 'nouveau';
  const entier = (x: unknown): number | null =>
    typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : null;

  try {
    const brouillon = await enregistrerBrouillon({
      id: entier(corps.id),
      filId: entier(corps.filId),
      repondAMessageId: entier(corps.repondAMessageId),
      voie,
      a: adresses(corps.a), cc: adresses(corps.cc), cci: adresses(corps.cci),
      objet: texte(corps.objet, 500),
      corps: texte(corps.corps, 200_000),
      citation: typeof corps.citation === 'string' ? corps.citation.slice(0, 200_000) : null,
    }, await auteurDeLaRequete(request));
    return Response.json({ ok: true, brouillon }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/brouillons] enregistrement impossible', e);
    return Response.json({ erreur: 'Enregistrement impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  if (!await peutEnvoyerAuNomDeGestion(request)) return refusEnvoi();
  if (!await redactionDisponible()) return sansSchema();

  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ erreur: 'Brouillon inconnu.' }, { status: 400 });
  try {
    // ABANDONNE, ne supprime pas : la ligne est datée et reste en base.
    await abandonnerBrouillon(id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[gestion/brouillons] abandon impossible', e);
    return Response.json({ erreur: 'Abandon impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
