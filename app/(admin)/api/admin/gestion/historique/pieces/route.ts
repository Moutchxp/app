import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte, lireFiltres } from '../../../../../../lib/gestion/historique';
import { etendreCible, porteursDePieces } from '../../../../../../lib/gestion/historiqueRepo';

/**
 * /api/admin/gestion/historique/pieces — LOT HISTORIQUE-BIEN-11, POINT 5 : LES PIÈCES DE TOUTE LA SÉLECTION.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (05/10/2026) : « propriétaire ET locataire cochés → les mails des deux familles s'affichent, mais
 * le résumé ne montre pas les pièces des deux. Suspect : “le résumé porte sur les 100 mails affichés”. »
 * SA RÈGLE : « le résumé contient les pièces de TOUS les mails de la sélection (toutes les parties cochées, toute
 * la période), pas seulement des 100 chargés […] Le compteur “N pièces dans cette sélection” = la somme réelle. »
 *
 * 🔴 SON SOUPÇON ÉTAIT EXACT, ET LA MESURE LE CHIFFRE. Sur lot-290 (bien 421) : **344 pièces** sur les 326 mails
 * du bien, dont **106 seulement** dans les 100 mails chargés. Le résumé en montrait moins d'un tiers — et
 * d'autant moins que la sélection était large, ce qui est l'inverse de ce qu'on attend d'un récapitulatif.
 *
 * ═══ 🔴 POURQUOI UNE ROUTE À PART, ET NON UNE PAGE PLUS GRANDE ════════════════════════════════════════════════════
 *
 * Lever le plafond de `/historique` aurait fait voyager 326 mails avec leur extrait, leurs destinataires, leurs
 * événements, leurs statuts et leurs interventions — pour n'en garder que les pièces. Cette route-ci ne rend QUE
 * ce que le résumé affiche, et ne lit que les mails qui PORTENT une pièce : sur un bien ordinaire, c'est moins du
 * quart de son courrier.
 *
 * 🔴 ELLE LIT LES **MÊMES** FILTRES, par la MÊME fonction (`lireFiltres`), et le dépôt leur applique les MÊMES
 * conditions que le listing. Une seconde écriture des tamis aurait fini par montrer les pièces d'une sélection
 * que le fil n'affiche pas — le genre de divergence que ce dépôt a déjà payée plusieurs fois.
 *
 * ⚠️ `page` ET `taille` SONT IGNORÉS, et c'est tout l'objet de cette route : on veut la sélection ENTIÈRE. Le
 * dépôt borne à 2 000 mails porteurs (plus de cinq fois le pire cas mesuré) et DIT quand il tronque.
 *
 * ⚠️ POURQUOI PAS UN CHAMP DE PLUS SUR `/historique`. Cette réponse-là est demandée à chaque page du fil (« Voir
 * la suite ») ; les pièces de la sélection, elles, ne changent pas quand on tourne une page. Les demander à part
 * évite de les recalculer à chaque défilement — même raisonnement que les routes sœurs `/parties` et
 * `/evenements`.
 *
 * 🔒 MÊME DROIT QUE LA TUILE GESTION, relu en base à chaque appel. `private, no-store` : la réponse porte des noms
 * de fichiers et des noms de personnes.
 *
 * 🔒 LECTURE SEULE : `porteursDePieces` n'émet qu'un SELECT, et cette route n'appelle rien d'autre.
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
    /* ⚠️ LES ÉTATS « sans_schema » ET « inconnue » SONT RENDUS TELS QUELS, EN 200 : aucun n'est une panne, et
       l'écran les connaît déjà — c'est le comportement de la route sœur `/historique`. */
    if (etendue.etat !== 'ok') return Response.json(etendue, { headers: ENTETES });

    const { messages, tronque } = await porteursDePieces(etendue.data, filtres);
    return Response.json({
      etat: 'ok',
      /* 🔴 LE COMPTE EST CELUI DES PIÈCES, PAS DES MAILS : c'est le nombre qu'Arno veut voir sur le bouton du
         résumé. L'écran le dédoublonne ensuite par CONTENU (`dedoublonnerPieces`) — deux fois le même fichier
         dans un échange ne font qu'une pièce à montrer —, et c'est ce nombre-là qu'il affiche. */
      data: { messages, tronque, nbPieces: messages.reduce((n, m) => n + m.pieces.length, 0) },
    }, { headers: ENTETES });
  } catch (e) {
    /* Pas de catch muet : une liste vide se lirait « aucune pièce dans cette sélection », ce qui serait faux. */
    console.error('[api/admin/gestion/historique/pieces] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
