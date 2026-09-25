import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { comptesBoite, lireBoiteMail, PAGE_BOITE, type CurseurBoite } from '../../../../../lib/gestion/boiteRepo';
import { chargerConfigGestion } from '../../../../../lib/gestion/config';
import { ETIQUETTE_RECEPTION, lireEtatUrl } from '../../../../../lib/gestion/ecranUrl';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { compterFilsNonLus, filsNonLus } from '../../../../../lib/gestion/lectureRepo';
import { lirePartenairesInternes } from '../../../../../lib/gestion/partenaires';

/**
 * /api/admin/gestion/boite (lot 5a) — LA BOÎTE MAIL : tous les échanges, du plus récent au plus ancien, par pages.
 *
 * 🔒 `exigerCompteActif(request, 'gestion')` — le MÊME garde que les autres lectures du module, relu en base à chaque
 * requête. Cette réponse contient des extraits de mails de locataires : `private, no-store` (ni cache partagé, ni
 * disque). Runtime Node (driver pg).
 *
 * 🔒 LECTURE SEULE : le graphe d'imports de ce fichier n'atteint aucun chemin d'écriture (`boiteRepo` n'émet que des
 * SELECT, `partenaires` aussi).
 *
 * PAGINATION PAR CURSEUR, jamais par `OFFSET` (voir `boiteRepo`). Le client renvoie tel quel le curseur qu'on lui a
 * donné ; il n'a pas à savoir ce qu'il contient.
 *
 * LOT 5-FUSION — la route accepte en plus une ÉTIQUETTE (`?etiquette=…`). Elle ne fait que restreindre la même
 * lecture : aucune nouvelle table, aucun nouvel état en base, et sans le paramètre le comportement est exactement
 * celui du lot 5a.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const dernierLe = url.searchParams.get('depuis');
  const filId = url.searchParams.get('avant');
  const inclureAutomatiques = url.searchParams.get('auto') === '1';

  // Le curseur n'est accepté qu'ENTIER : une moitié de curseur donnerait une page décalée, en silence.
  const curseur: CurseurBoite | null = dernierLe !== null && filId !== null && /^\d+$/.test(filId)
    ? { dernierLe, filId }
    : null;
  if ((dernierLe !== null) !== (filId !== null)) {
    return Response.json({ erreur: 'Curseur incomplet : « depuis » et « avant » vont ensemble.' }, { status: 422 });
  }

  // LOT 5-FUSION — L'ÉTIQUETTE, lue par le MÊME analyseur que l'écran (`lireEtatUrl`) : une seule grammaire pour
  //   l'adresse du navigateur et pour le paramètre de la route, donc aucune chance qu'elles divergent. Il est
  //   TOLÉRANT par construction — une étiquette inconnue retombe sur le défaut au lieu de rendre une erreur 422 à
  //   quelqu'un qui a simplement collé un vieux lien.
  //   ⚠️ ABSENT ≠ INCONNU : sans paramètre, c'est la boîte ENTIÈRE (« Réception »), comme depuis le lot 5a — les
  //   appels qui existaient avant ce lot ne changent pas d'un iota. Seule une étiquette écrite est interprétée.
  const brutEtiquette = url.searchParams.get('etiquette');
  const etiquette = brutEtiquette === null
    ? ETIQUETTE_RECEPTION
    : lireEtatUrl(`etiquette=${encodeURIComponent(brutEtiquette)}`).etiquette;

  try {
    const partenaires = await lirePartenairesInternes();
    // La fenêtre d'activité vient de la BASE, jamais du code : l'étiquette « À classer » doit dire exactement la même
    //   chose que le poste de tri, y compris le jour où Arno change ce réglage.
    const fenetreJours = etiquette.sorte === 'a_classer' ? (await chargerConfigGestion()).fenetreActiviteJours : 30;
    const page = await lireBoiteMail(curseur, partenaires, PAGE_BOITE, { inclureAutomatiques, etiquette, fenetreJours });
    // Les deux comptes ne sont calculés qu'à la PREMIÈRE page : l'écran doit pouvoir dire ce qu'il montre ET ce qu'il
    //   tait, mais le redemander à chaque « voir plus » le paierait pour rien.
    const comptes = curseur === null ? await comptesBoite() : null;
    // LOT 5-BOITE — LE LU/NON LU EST PERSONNEL : il se calcule pour la personne qui REGARDE, jamais « pour la boîte ».
    //   L'identité vient de la session (`auteurDeLaRequete`), jamais d'un paramètre — une adresse venue du navigateur
    //   ferait afficher le gras de quelqu'un d'autre. Sans compte personnel (accès de secours) ou sans la migration
    //   250, `nonLus` est vide et `nonLusTotal` vaut null : l'écran est alors exactement celui d'avant ce lot.
    const { id: utilisateurId } = await auteurDeLaRequete(request);
    const [nonLus, nonLusTotal] = await Promise.all([
      filsNonLus(page.lignes.map((l) => l.filId), utilisateurId),
      curseur === null ? compterFilsNonLus(utilisateurId) : Promise.resolve(null),
    ]);
    return Response.json(
      { ...page, comptes, nonLus: [...nonLus], nonLusTotal },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    // Pas de catch muet : une liste vide ferait croire à une boîte vide. On dit que la lecture a échoué.
    console.error('[api/admin/gestion/boite] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
