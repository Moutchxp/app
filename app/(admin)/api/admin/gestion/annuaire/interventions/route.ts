import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { query } from '../../../../../../lib/db/client';
import { interventionsDeLaFiche } from '../../../../../../lib/gestion/contactExterneRepo';
import { interventionsDisponibles } from '../../../../../../lib/gestion/schema';

/**
 * ══ /api/admin/gestion/annuaire/interventions — LES ÉCHANGES D'UNE FICHE PASSÉS PAR UN CONTACT EXTÉRIEUR ══════
 *
 * LOT CONTACTS-EXTERNES. La sœur de `annuaire/documents`, et délibérément son jumeau à la ligne près : même
 * garde, même refus d'une clé venue du navigateur, même `sans_schema`.
 *
 * 🔴 ET C'EST UNE LISTE **DISTINCTE** DES « DOCUMENTS AUTOMATIQUES » (demande d'Arno). Les deux vivent dans
 * `gestion_rattachement` sous deux règles nommées différentes :
 *   · `document_auto`  — nos envois, rangés chez une personne, SANS aucun bien ;
 *   · `intervention`   — du courrier reçu, rattaché à un bien, qui concerne AUSSI cette personne.
 * Les mêler ferait voisiner les quittances d'un locataire et les courriers de son avocat dans la même liste.
 *
 * ⚠️ LA CLÉ EST RELUE EN BASE, jamais reçue du navigateur — et pour un LOCATAIRE c'est `cle_personne`, pas
 * `wippimmo_id` : mesuré en base, les deux ne coïncident jamais, et seule `cle_personne` est unique. C'est déjà
 * la clé que `documentsAutoRepo` écrit, et s'en écarter rendrait les interventions introuvables.
 *
 * ⚠️ SANS LA MIGRATION 293, elle rend `{ etat: 'sans_schema' }` : aucune section ne s'affiche, et rien dans la
 * fiche ne change.
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
  if (!(await interventionsDisponibles())) return Response.json({ etat: 'sans_schema' });

  try {
    const { rows } = await query<{ cle: string | null }>(
      sorte === 'proprietaire'
        ? 'SELECT wippimmo_id AS cle FROM gestion_annuaire_proprietaire WHERE id = $1 AND supprime_le IS NULL'
        : 'SELECT cle_personne AS cle FROM gestion_annuaire_locataire WHERE id = $1 AND supprime_le IS NULL',
      [id]);
    const cle = (rows[0]?.cle ?? '').trim();
    if (cle === '') return Response.json({ etat: 'ok', data: [] });
    return Response.json({ etat: 'ok', data: await interventionsDeLaFiche(sorte, cle) });
  } catch (e) {
    console.error('[gestion/annuaire/interventions] lecture impossible', { sorte, id, e });
    return Response.json({ etat: 'erreur' }, { status: 500 });
  }
}
