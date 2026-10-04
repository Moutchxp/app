import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte } from '../../../../../../lib/gestion/historique';
import { evenementsDuBien, EVENEMENTS_DU_BIEN_MAX } from '../../../../../../lib/gestion/historiqueBienRepo';

/**
 * /api/admin/gestion/historique/evenements — LOT HISTORIQUE-BIEN-1 : LES ÉVÉNEMENTS D'UN BIEN, AVEC LEURS DATES.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 À QUOI ELLE SERT, ET À RIEN D'AUTRE. Le tableau de bord du bloc « Historique » offre « un événement, en cours
 * ou clos — le choisir règle les dates ». Pour régler des dates, il faut `ouvert_le` et `traite_le` : aucune
 * réponse existante ne les rend (voir l'encadré de `historiqueBienRepo`).
 *
 * 🔴 POURQUOI PAS UN CHAMP DE PLUS SUR `/historique`. Cette réponse-là est lue par quatre écrans et porte déjà
 * onze champs ; elle est demandée à CHAQUE changement de filtre, de page et de frappe. La liste des événements
 * d'un bien, elle, ne change pas quand on coche une case : la demander une fois, à part, évite de la recalculer à
 * chaque frappe — et évite surtout d'alourdir le chemin le plus chaud de l'écran.
 *
 * ⚠️ SEULE UNE CIBLE `lot-…` EST ACCEPTÉE. Le bloc vit dans la fiche d'un BIEN ; répondre pour un propriétaire ou
 * une carte demanderait un autre prédicat, et un prédicat deviné est un prédicat faux.
 *
 * 🔒 MÊME DROIT QUE LA TUILE GESTION, relu en base à chaque appel. `private, no-store` : la réponse porte des
 * objets d'événements (« fuite salle de bain — Mme X »). LECTURE SEULE : un seul SELECT, aucun chemin d'écriture.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const cible = cibleDepuisTexte(new URL(request.url).searchParams.get('cible'));
  if (cible === null || cible.sorte !== 'lot' || (cible.cle ?? '') === '') {
    return Response.json({ etat: 'cible_invalide' }, { status: 400, headers: ENTETES });
  }

  try {
    const { liste, tronque } = await evenementsDuBien(cible.cle ?? '');
    return Response.json({
      etat: 'ok', evenements: liste, tronque, max: EVENEMENTS_DU_BIEN_MAX,
    }, { headers: ENTETES });
  } catch (e) {
    /* Pas de catch muet : une liste vide se lirait « ce bien n'a jamais eu d'événement », ce qui serait un
       mensonge. L'écran dit alors qu'il n'a pas pu les lire, et garde « Tous les échanges » et les deux dates. */
    console.error('[api/admin/gestion/historique/evenements] lecture impossible', e);
    return Response.json({ etat: 'erreur', evenements: [], tronque: false }, { status: 503, headers: ENTETES });
  }
}
