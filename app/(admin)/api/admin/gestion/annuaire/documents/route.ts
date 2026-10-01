import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { query } from '../../../../../../lib/db/client';
import { documentsDeLaFiche } from '../../../../../../lib/gestion/documentsAutoRepo';
import { documentsAutoDisponible } from '../../../../../../lib/gestion/schema';

/**
 * ══ 🔴 /api/admin/gestion/annuaire/documents — LES DOCUMENTS AUTOMATIQUES D'UNE FICHE ═════════════════════════
 *
 * LOT DOCUMENTS-AUTO-PAR-FICHE. Elle prend une SORTE et un IDENTIFIANT de fiche, jamais une clé venue du
 * navigateur : la clé est relue en base. Une route qui accepterait la clé telle quelle laisserait demander les
 * documents de n'importe qui en changeant un paramètre — ce qui est déjà vrai de la fiche elle-même, mais ne
 * doit pas devenir vrai d'un second chemin.
 *
 * ⚠️ SANS LA MIGRATION 291, elle rend `{ etat: 'sans_schema' }` : l'écran n'affiche alors aucune section, et rien
 * dans la fiche ne change. C'est la forme que tout le module emploie pour une nouveauté pas encore installée.
 *
 * 🔒 Droit `gestion`, relu en base à chaque requête. LECTURE SEULE : aucun `INSERT`, aucun `UPDATE`.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerCompteActif(request, 'gestion');
  if (garde) return garde;

  const u = new URL(request.url);
  const sorte = u.searchParams.get('sorte');
  const id = Number(u.searchParams.get('id'));
  if (sorte !== 'proprietaire' && sorte !== 'locataire') {
    return Response.json({ etat: 'invalide', motif: 'sorte inconnue' }, { status: 400 });
  }
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ etat: 'invalide', motif: 'identifiant absent' }, { status: 400 });
  }
  if (!(await documentsAutoDisponible())) return Response.json({ etat: 'sans_schema' });

  try {
    // La CLÉ est relue en base, jamais reçue du navigateur.
    const { rows } = await query<{ cle: string | null }>(
      sorte === 'proprietaire'
        ? 'SELECT wippimmo_id AS cle FROM gestion_annuaire_proprietaire WHERE id = $1 AND supprime_le IS NULL'
        : 'SELECT cle_personne AS cle FROM gestion_annuaire_locataire WHERE id = $1 AND supprime_le IS NULL',
      [id]);
    const cle = (rows[0]?.cle ?? '').trim();
    if (cle === '') return Response.json({ etat: 'ok', data: [] });
    return Response.json({ etat: 'ok', data: await documentsDeLaFiche(sorte, cle) });
  } catch (e) {
    console.error('[gestion/annuaire/documents] lecture impossible', { sorte, id, e });
    return Response.json({ etat: 'erreur' }, { status: 500 });
  }
}
