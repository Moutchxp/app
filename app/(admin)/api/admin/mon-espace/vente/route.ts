import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { venteARejoindre } from '../../../../../lib/mon-espace/modificationRepo';

/**
 * 🔴 MON ESPACE, LOT 6 — GET /api/admin/mon-espace/vente?id=3&numero=M-42 : pour « Rejoindre », l'affaire qui porte CE n° de mandat, telle que le
 * titulaire la recevrait (sans la commission ni le taux des autres collègues), avec sa version. Le n° est la preuve : sans lui, rien n'est rendu.
 * LECTURE SEULE ; droit « Mon espace ». Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return json({ erreur: 'ACCES_REVOQUE' }, 403);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  const numero = url.searchParams.get('numero') ?? '';
  if (!Number.isInteger(id) || id <= 0 || numero.trim() === '') return json({ etat: 'refus', motif: 'Affaire ou n° de mandat manquant.' }, 422);
  try {
    const v = await venteARejoindre(garde.auteurId, id, numero);
    return v === null ? json({ etat: 'refus', motif: 'Ce n° de mandat ne correspond pas à cette affaire.' }, 404) : json({ etat: 'ok', data: v });
  } catch (e) {
    console.error('[mon-espace] vente à rejoindre', e);
    return json({ etat: 'erreur', message: 'Lecture impossible.' }, 500);
  }
}
