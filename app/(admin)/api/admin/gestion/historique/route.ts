import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { cibleDepuisTexte, lireFiltres } from '../../../../../lib/gestion/historique';
import {
  enteteHistorique, etendreCible, interlocuteursHistorique, pageHistorique, propositionsHistorique,
} from '../../../../../lib/gestion/historiqueRepo';

/**
 * /api/admin/gestion/historique — LOT RATTACHEMENT-2 : TOUT CE QUI S'EST DIT À PROPOS D'UNE CIBLE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 MÊME DROIT QUE LA TUILE GESTION, relu en base à chaque appel. `private, no-store` : ces réponses portent des noms
 * de personnes, des adresses de logements et des extraits de courrier — elles ne se mettent en cache nulle part.
 *
 * 🔒 LECTURE SEULE, INTÉGRALEMENT. Aucune des fonctions appelées n'émet autre chose qu'un SELECT. Les gestes sur les
 * propositions passent par `/api/admin/gestion/rattachements` — celui du lot RATTACHEMENT-1, et le seul chemin
 * d'écriture. En ajouter un second ici donnerait deux façons d'écrire le même fait.
 *
 * `?cible=lot-282` · `proprio-339` · `carte-12`, plus les filtres (voir `lireFiltres`).
 *
 * ⚠️ TROIS ÉTATS RENDUS EN 200, PARCE QU'AUCUN N'EST UNE PANNE :
 *   · `sans_schema` — migration 257 non appliquée : l'écran dit « pas encore installé » ;
 *   · `inconnue`    — la cible n'existe pas (ou plus) dans l'annuaire : l'écran le dit, plutôt qu'un historique vide
 *                     qui laisserait croire qu'on n'a jamais écrit à ce logement ;
 *   · `ok`          — avec, éventuellement, zéro mail.
 * Une 500 laisserait croire à une panne dans les trois cas.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const cible = cibleDepuisTexte(url.searchParams.get('cible'));
  if (cible === null) {
    return Response.json({ etat: 'cible_invalide' }, { status: 400, headers: ENTETES });
  }
  const filtres = lireFiltres(url.searchParams);

  try {
    const etendue = await etendreCible(cible, filtres);
    if (etendue.etat !== 'ok') return Response.json(etendue, { headers: ENTETES });

    // LES QUATRE QUESTIONS EN PARALLÈLE : elles ne dépendent pas l'une de l'autre, et l'écran les veut ensemble.
    const [page, entete, interlocuteurs, propositions] = await Promise.all([
      pageHistorique(etendue.data, filtres),
      enteteHistorique(etendue.data, filtres),
      interlocuteursHistorique(etendue.data, filtres),
      propositionsHistorique(etendue.data),
    ]);

    return Response.json({
      etat: 'ok',
      data: {
        cible: etendue.data.cible,
        titre: etendue.data.titre,
        sousTitre: etendue.data.sousTitre,
        // `Map` ne se sérialise pas en JSON : on rend un objet indexé par la forme courte de chaque cible.
        libelles: Object.fromEntries(etendue.data.libelles),
        proprietaireDuLot: etendue.data.proprietaireDuLot,
        logementsDuProprietaire: etendue.data.logementsDuProprietaire,
        lignes: page.lignes,
        suite: page.suite,
        entete: entete.filtre,
        total: entete.total,
        interlocuteurs: interlocuteurs.liste,
        interlocuteursTronques: interlocuteurs.tronque,
        propositions: propositions.lignes,
        filtres,
      },
    }, { headers: ENTETES });
  } catch (e) {
    // Pas de catch muet : un historique vide se lirait « on n'a jamais écrit à ce logement », ce qui serait un mensonge.
    console.error('[api/admin/gestion/historique] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
