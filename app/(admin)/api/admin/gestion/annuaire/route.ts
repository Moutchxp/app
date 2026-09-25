import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { analyserTerme } from '../../../../../lib/gestion/annuaireRecherche';
import {
  dernierImport, ficheLocataire, ficheLot, ficheProprietaire, indicesParEmail, rechercher,
} from '../../../../../lib/gestion/annuaireRepo';

/**
 * /api/admin/gestion/annuaire — LOT ANNUAIRE-1 : LA SEULE PORTE DE LECTURE DE L'ANNUAIRE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 MÊME DROIT QUE LA TUILE GESTION (`exigerCompteActif(request, 'gestion')`), et c'est la seule barrière à tenir :
 * l'annuaire porte les coordonnées de 800 personnes. `private, no-store` : ces réponses ne se mettent en cache nulle
 * part, ni chez le navigateur, ni chez un intermédiaire.
 *
 * 🔒 LECTURE SEULE, INTÉGRALEMENT. Aucune des fonctions appelées n'émet autre chose qu'un SELECT. On n'écrit dans
 * l'annuaire que par la commande d'import, jamais depuis un écran — c'est WIPPIMMO qui fait foi, et une correction
 * saisie ici serait écrasée au prochain import sans prévenir.
 *
 * QUATRE QUESTIONS, UNE SEULE ROUTE, parce qu'elles partagent exactement le même droit et le même cache :
 *   · `?q=…`             la recherche (un seul champ, toutes les entrées)
 *   · `?proprietaire=N`  `?lot=N`  `?locataire=N`   une fiche
 *   · `?emails=a,b`      le pont avec la boîte mail : qui sont ces expéditeurs ?
 *
 * ⚠️ `sans_schema` (migration 253 non appliquée) n'est PAS une erreur : c'est un état, rendu en 200 avec
 * `etat: 'sans_schema'`. L'écran affiche alors « annuaire pas encore installé » — une erreur 500 laisserait croire
 * à une panne, et une réponse vide à un annuaire sans personne dedans.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

/** Un identifiant lu dans l'adresse. Refuse `0` et le non-numérique : inutile d'interroger pour rien. */
function identifiant(brut: string | null): number | null {
  if (brut === null || !/^[1-9]\d{0,15}$/.test(brut)) return null;
  const n = Number(brut);
  return Number.isSafeInteger(n) ? n : null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  try {
    const idProprietaire = identifiant(url.searchParams.get('proprietaire'));
    if (idProprietaire !== null) return Response.json(await ficheProprietaire(idProprietaire), { headers: ENTETES });

    const idLot = identifiant(url.searchParams.get('lot'));
    if (idLot !== null) return Response.json(await ficheLot(idLot), { headers: ENTETES });

    const idLocataire = identifiant(url.searchParams.get('locataire'));
    if (idLocataire !== null) return Response.json(await ficheLocataire(idLocataire), { headers: ENTETES });

    const emails = url.searchParams.get('emails');
    if (emails !== null) {
      // Borné : un fil ne porte jamais des centaines d'expéditeurs, et une liste sans borne serait un levier.
      const liste = emails.split(',').map((e) => e.trim()).filter((e) => e !== '').slice(0, 20);
      return Response.json(await indicesParEmail(liste), { headers: ENTETES });
    }

    const terme = analyserTerme(url.searchParams.get('q'));
    const [resultats, importe] = await Promise.all([rechercher(terme), dernierImport()]);
    return Response.json({ ...resultats, terme, importe }, { headers: ENTETES });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « personne ne correspond », ce qui serait un mensonge.
    console.error('[api/admin/gestion/annuaire] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
