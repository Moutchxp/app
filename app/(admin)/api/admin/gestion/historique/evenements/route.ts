import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte } from '../../../../../../lib/gestion/historique';
import {
  evenementsDuBien, evenementsParLocataire, EVENEMENTS_DU_BIEN_MAX,
} from '../../../../../../lib/gestion/historiqueBienRepo';

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
    /**
     * ══ 🔴🔴 LOT HISTORIQUE-BIEN-18, POINT 1 — ET QUELS ÉVÉNEMENTS CONCERNENT QUEL LOCATAIRE ══════════════════
     *
     * RÈGLE D'ARNO : la période d'un locataire se prolonge jusqu'à la clôture d'un événement qui le concerne.
     * La définition retenue (ouverture pendant l'occupation, OU une adresse de sa carte ou de ses contacts
     * annexes dans un mail de l'événement) est dans l'encadré de `evenementsParLocataire`.
     *
     * ⚠️ ELLE VOYAGE AVEC CETTE ROUTE-CI, et pour la raison déjà écrite en tête de fichier : ce rattachement ne
     * dépend ni de la période, ni des cases cochées, ni de la page. Le demander avec le fil l'aurait fait
     * recalculer à chaque frappe, pour une réponse toujours identique.
     */
    const [{ liste, tronque }, parLocataire] = await Promise.all([
      evenementsDuBien(cible.cle ?? ''),
      evenementsParLocataire(cible.cle ?? ''),
    ]);
    return Response.json({
      etat: 'ok', evenements: liste, parLocataire, tronque, max: EVENEMENTS_DU_BIEN_MAX,
    }, { headers: ENTETES });
  } catch (e) {
    /* Pas de catch muet : une liste vide se lirait « ce bien n'a jamais eu d'événement », ce qui serait un
       mensonge. L'écran dit alors qu'il n'a pas pu les lire, et garde « Tous les échanges » et les deux dates. */
    console.error('[api/admin/gestion/historique/evenements] lecture impossible', e);
    return Response.json({ etat: 'erreur', evenements: [], parLocataire: [], tronque: false },
      { status: 503, headers: ENTETES });
  }
}
