/**
 * MENTIONS LÉGALES du certificat — figées EN DUR (versionnées dans le code, JAMAIS en base) : elles doivent rester
 * attachées à la version du document telle qu'elle était à l'émission. Faits fournis par le porteur.
 *
 * ⚠️ AUCUNE clause de limitation de responsabilité juridique n'est rédigée ici : ce n'est pas notre rôle (un
 * juriste la posera). Les textes ci-dessous sont FACTUELS et sobres — identité de l'émetteur, marque, définition
 * normative du label, découplage photo/verdict, et portée (ce que le document constate, ce qu'il ne garantit pas).
 */

/** Émetteur — le document est émis par la SOCIÉTÉ (qui engage), sous la marque (qui n'engage personne). */
export const MENTION_EMETTEUR =
  'Certificat émis par la SARL CRITERIMMO, au capital de 20 000 €, dont le siège social est situé ' +
  '191-195 avenue Charles de Gaulle, 92200 Neuilly-sur-Seine. RCS Nanterre 521 514 968 — code APE 6831Z. ' +
  'Carte professionnelle Transaction n° 9201 2018 000 0038 081. ' +
  'Garantie financière : caisse GALIAN n° 42475T.';

/** La marque n'engage personne ; la société, oui. */
export const MENTION_MARQUE =
  '« Sans Vis-à-Vis® » est une marque déposée de la SARL CRITERIMMO. Le présent document est émis par ' +
  'CRITERIMMO sous cette marque.';

/** Définition normative du label (le cœur de ce que le document atteste). */
export const MENTION_DEFINITION =
  'Le label « Sans Vis-à-Vis® » est attribué lorsque le premier obstacle réel rencontré dans l’axe de la ' +
  'vue du séjour se situe à 40 mètres ou plus du point d’observation. Ce critère est exclusivement géométrique.';

/** Découplage explicite photo / verdict. */
export const MENTION_DECOUPLAGE =
  'L’analyse photographique éventuellement associée au test n’intervient jamais dans l’attribution du label : ' +
  'le verdict est déterminé par la seule géométrie.';

/** Portée : ce que le document constate, ce qu'il ne garantit pas. Factuel, sans clause de responsabilité. */
export const MENTION_PORTEE =
  'Ce document constate un état géométrique à la date de son émission, établi à partir des données publiques ' +
  'disponibles (relevés altimétriques et emprises de bâtiments). Il ne préjuge pas de l’évolution ultérieure de ' +
  'l’environnement et ne garantit pas la pérennité de la vue.';

/** Ligne de vérifiabilité (imprimée sous le QR). L'URL en clair est fournie par l'appelant (numéro seul, sans jeton). */
export function mentionVerifiabilite(urlClaire: string): string {
  return `Ce certificat est vérifiable en ligne : ${urlClaire}`;
}
