import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { lireDepotsDesPieces } from '../../../../../lib/gestion/driveRepo';
import { emplacementsDesPieces } from '../../../../../lib/gestion/pieceDansLeDriveRepo';
import { depotsDriveDisponibles } from '../../../../../lib/gestion/schema';
import { PIECES_DRIVE_MAX } from '../../../../../lib/gestion/pieceDansLeDrive';

/**
 * /api/admin/gestion/pieces-drive?pieces=12,34,56 — LOT HISTORIQUE-BIEN-1 : CE QUI EST DÉJÀ DANS LE DRIVE, POUR
 * UNE LISTE DE PIÈCES **QUI NE TIENT PAS DANS UN SEUL ÉCHANGE**.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI UNE TROISIÈME PORTE, ALORS QU'IL Y EN A DÉJÀ DEUX. Les deux existantes sont bornées à un périmètre
 * qui ne couvre pas ce cas : `/messages/[id]/drive` sert les cartes d'UN message, `/fils/[id]/pieces-drive` sert
 * le récapitulatif d'UN échange. Le résumé du bloc « Historique » rassemble les pièces de tous les mails de la
 * page — jusqu'à 25 mails, appartenant à autant d'échanges DIFFÉRENTS. Il aurait fallu 25 requêtes avec la route
 * d'échange ; c'est exactement ce que la route d'échange avait été écrite pour éviter côté message.
 *
 * 🔴 ET C'EST LA MÊME VÉRITÉ, PAR LES MÊMES REPOS. `lireDepotsDesPieces` et `emplacementsDesPieces` sont ceux que
 * les deux autres routes appellent déjà, dans leur variante `pieceIds` — qui existait, et qui n'était pas servie.
 * Aucune règle n'est réécrite ici, et le picto vert dit donc la même chose aux trois endroits.
 *
 * ⚠️ `depots` ET `emplacements` RESTENT DEUX CHOSES, et il faut les deux : l'un dit ce que NOUS avons rangé pour
 * cette pièce précise (« Dans le Drive · dossier X »), l'autre partout où ce CONTENU se trouve, sous quelque nom
 * que ce soit (le picto et son menu). Un document revenu renommé n'a aucun dépôt et plusieurs emplacements.
 *
 * ⚠️ MIGRATION 245 ABSENTE ⇒ LISTES VIDES, PAS UNE ERREUR : il ne PEUT alors y avoir aucun dépôt, et le résumé
 * s'affiche simplement sans aucune mention « Dans le Drive » ni picto.
 *
 * ⚠️ LE NOMBRE DE PIÈCES EST BORNÉ. Une adresse n'est pas une demande : `?pieces=` avec dix mille identifiants
 * n'est pas une page d'écran. Au-delà du plafond on tronque — la réponse ne porte alors que les premières, et le
 * résumé n'affiche pas de picto pour les suivantes (il n'invente rien).
 *
 * 🔒 MÊME DROIT QUE LA TUILE GESTION, relu en base. `private, no-store` : la réponse dit dans quel dossier client
 * une pièce a été rangée. AUCUN APPEL À GOOGLE : on ne demande pas au Drive ce que notre base sait déjà.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/* 🔴 LA BORNE VIT DANS LE MODULE PUR, parce que L'ÉCRAN DÉCOUPE SES DEMANDES avec le même nombre depuis le lot
   HISTORIQUE-BIEN-11 (le résumé couvre toute la sélection, soit jusqu'à 5 061 pièces mesurées). Deux écritures
   auraient fini par se décaler, et la route aurait tronqué en silence une tranche que l'écran croyait entière. */
export { PIECES_DRIVE_MAX };

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  /* ⚠️ LECTURE TOLÉRANTE : un identifiant abîmé est ÉCARTÉ, il ne fait pas tomber la réponse entière. Le résumé
     perdrait un picto, jamais sa liste de pièces. */
  const ids = [...new Set((new URL(request.url).searchParams.get('pieces') ?? '').split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0))].slice(0, PIECES_DRIVE_MAX);

  if (ids.length === 0) return Response.json({ etat: 'ok', depots: [], emplacements: [] }, { headers: ENTETES });
  if (!(await depotsDriveDisponibles())) {
    return Response.json({ etat: 'sans_schema', depots: [], emplacements: [] }, { headers: ENTETES });
  }

  try {
    const [depots, emplacements] = await Promise.all([
      lireDepotsDesPieces(ids), emplacementsDesPieces({ pieceIds: ids }),
    ]);
    return Response.json({ etat: 'ok', depots, emplacements }, { headers: ENTETES });
  } catch (e) {
    /* Silence impossible, mais dégât minimal : on perd la mention « Dans le Drive » et le picto, jamais la liste
       des pièces — exactement le comportement des deux autres routes. */
    console.error('[api/admin/gestion/pieces-drive] lecture des dépôts impossible', e);
    return Response.json({ etat: 'erreur', depots: [], emplacements: [] }, { status: 503, headers: ENTETES });
  }
}
