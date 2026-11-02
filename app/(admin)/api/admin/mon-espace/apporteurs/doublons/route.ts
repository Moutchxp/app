import { exigerMonEspace } from '../../../../../../lib/mon-espace/garde';
import { doublonsDansLAnnuaire } from '../../../../../../lib/mon-espace/apporteursRepo';

/**
 * 🔴 MON ESPACE, LOT 9 — GET /api/admin/mon-espace/apporteurs/doublons?nom=&prenom=&telephone=&email= : DÈS LA SAISIE, les fiches de TOUT l'annuaire
 * qui sont déjà cet apporteur (homonyme, même téléphone, même e-mail) — leur nom et leur collègue de rattachement seulement (« Cet apporteur existe
 * déjà, rattaché à … » + « L'utiliser »). LECTURE SEULE ; droit « Mon espace ». Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  const u = new URL(request.url);
  const p = (k: string): string => (u.searchParams.get(k) ?? '').slice(0, 200);
  try {
    const d = await doublonsDansLAnnuaire({ nom: p('nom'), prenom: p('prenom'), telephone: p('telephone'), email: p('email') });
    return Response.json({ etat: 'ok', data: d.map((x) => ({ id: x.id, libelle: x.libelle, collegue: x.collegue, raisons: x.raisons })) }, { headers: ENTETES });
  } catch (e) {
    console.error('[mon-espace] doublons d’apporteur', e);
    return Response.json({ etat: 'erreur', message: 'Recherche impossible.' }, { status: 500, headers: ENTETES });
  }
}
