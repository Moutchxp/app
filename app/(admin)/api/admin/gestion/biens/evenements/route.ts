import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { evenementsDuBien, friseDeLEvenement } from '../../../../../../lib/gestion/mongaEtapeRepo';

/**
 * ══ 🔴🔴 LOT MONGA-2, POINT 4 — LES ÉVÉNEMENTS D'UN BIEN, POUR LA FICHE ══════════════════════════════════════════
 *
 * Arno : « Dans la fiche du BIEN, UNIQUEMENT si le bien a au moins un événement : un bloc “Événements” placé
 * juste au-dessus du moteur Historique. Les événements en cours sont dépliés avec leur frise, les clos sont
 * repliés (une ligne : titre, dates, dernière étape). »
 *
 * 🔴 LA LISTE VIDE EST LA RÉPONSE, et c'est elle qui tient la promesse « uniquement si » : l'écran n'affiche
 * aucun bloc quand elle est vide. Rendre un bloc vide aurait ajouté un titre sur TOUTES les fiches — ce que la
 * preuve d'empreintes du point 4 interdit.
 *
 * 🔴 LA DERNIÈRE ÉTAPE EST CALCULÉE ICI, pas par l'écran : un événement clos s'affiche replié sur une seule
 * ligne, et il lui faut ce mot sans avoir à charger sa frise entière. Les événements EN COURS, eux, reçoivent
 * leur frise complète — c'est ce qu'« dépliés avec leur frise » veut dire.
 *
 * 🔒 `exigerCompteActif` : ces lignes portent des adresses et des objets d'intervention. `private, no-store`.
 * Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const cle = (new URL(request.url).searchParams.get('bien') ?? '').trim();
  if (cle === '') return Response.json({ erreur: 'Bien attendu.' }, { status: 400 });
  try {
    const evenements = await evenementsDuBien(cle);
    /**
     * ⚠️ UNE LECTURE DE FRISE PAR ÉVÉNEMENT, ET C'EST BORNÉ PAR LE RÉEL : un bien porte un ou deux événements,
     * pas cinquante (mesuré le 06/10/2026 : le seul bien qui en a en porte **un**). Une requête unique à
     * jointures aurait été plus savante et moins lisible, pour un gain qui n'existe pas à cette échelle.
     */
    const avecFrise = await Promise.all(evenements.map(async (e) => {
      const etapes = await friseDeLEvenement(e.id);
      const majeures = etapes.filter((x) => x.source === 'monga' || x.certitude !== 'ecartee');
      const derniere = majeures.length === 0 ? null : majeures[majeures.length - 1];
      return {
        ...e,
        /**
         * 🔴🔴 LOT ETAT-PAR-LA-FRISE — `clos` DIT CE QUI SE REPLIE, ET C'EST LA FRISE QUI LE DIT.
         *
         * Il valait « l'état fait foi, et `traiteLe` le confirme » — deux lectures de la même colonne, et
         * toutes deux fausses sur GES-2026-000001, dont la carte Clôture avait été retirée. `ouvert` vient
         * maintenant des cartes de BORNE (`evenementsDuBien`), et il n'y a plus qu'une réponse.
         */
        clos: !e.ouvert,
        nbEtapes: etapes.length,
        derniereEtapeType: derniere?.type ?? null,
        derniereEtapeLe: derniere?.survenuLe ?? null,
      };
    }));
    return Response.json(
      { etat: 'ok', evenements: avecFrise },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/biens/evenements] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
