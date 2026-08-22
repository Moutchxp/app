import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerDonneesCarteCada } from '../../../../../../lib/veille/carteCadaDonnees';
import { historiqueCopiesChamps, tracerCopieChamp, reinitialiserCopiesChamps } from '../../../../../../lib/veille/copieChampCada';
import { messageHistoriqueCopies, CLES_CHAMPS_CADA } from '../../../../../../lib/veille/carteCadaChamps';

/**
 * /api/admin/permis/saisines/carte — carte de copier-coller CADA champ par champ (CADA lot A).
 *  GET ?saisineId= → les 17 champs composés + l'historique de copie (message d'en-tête) + le lien du formulaire + de quoi
 *      télécharger la pièce jointe. Les boutons repartent NON marqués à chaque ouverture (le marquage vit dans le composant).
 *  POST {saisineId, champCle} → trace une copie (UPSERT, une ligne vivante par champ). N'écrit JAMAIS « déposée ».
 *  DELETE {saisineId} → réinitialise les marques de CETTE saisine.
 * RÉSERVÉ ADMINISTRATEUR. Runtime Node (pg). demande.statut / demande_relance.statut ne sont JAMAIS écrits ici.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const saisineId = Number(new URL(request.url).searchParams.get('saisineId'));
    if (!Number.isInteger(saisineId)) return Response.json({ erreur: 'saisineId invalide' }, { status: 400 });
    const donnees = await chargerDonneesCarteCada(saisineId);
    if (donnees === null) return Response.json({ erreur: 'saisine introuvable' }, { status: 404 });
    const historique = await historiqueCopiesChamps(saisineId);
    return Response.json({
      saisineId: donnees.saisineId, demandeId: donnees.demandeId, reference: donnees.reference, communeNom: donnees.communeNom,
      champs: donnees.champs, urlFormulaire: donnees.urlFormulaire, cadaEmailVide: donnees.cadaEmailVide,
      pdfUrl: `/api/admin/permis/saisines/copie-pdf?saisineId=${saisineId}`,
      message: messageHistoriqueCopies(historique),
    });
  } catch (e) {
    console.error('[permis/saisines/carte] GET impossible (503)', { message: (e as Error)?.message });
    return Response.json({ erreur: 'carte indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const c = (await request.json().catch(() => ({}))) as { saisineId?: unknown; champCle?: unknown };
    if (!Number.isInteger(c.saisineId)) return Response.json({ erreur: 'saisineId invalide' }, { status: 400 });
    if (typeof c.champCle !== 'string' || !(CLES_CHAMPS_CADA as readonly string[]).includes(c.champCle)) {
      return Response.json({ erreur: 'champ inconnu' }, { status: 400 });
    }
    await tracerCopieChamp(c.saisineId as number, c.champCle, garde.auteurId);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[permis/saisines/carte] POST impossible (503)', { message: (e as Error)?.message });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const c = (await request.json().catch(() => ({}))) as { saisineId?: unknown };
    if (!Number.isInteger(c.saisineId)) return Response.json({ erreur: 'saisineId invalide' }, { status: 400 });
    const efface = await reinitialiserCopiesChamps(c.saisineId as number);
    return Response.json({ ok: true, efface });
  } catch (e) {
    console.error('[permis/saisines/carte] DELETE impossible (503)', { message: (e as Error)?.message });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
