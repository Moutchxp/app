/**
 * ══ 🔴🔴 LOT PARTIES-HAUTEUR-ANNUAIRE-ROLES, POINT 1 — UNE LISTE NE COUPE JAMAIS SA DERNIÈRE LIGNE ═══════════════
 *
 * Module PUR : aucune I/O, aucun React, aucun `pg`. Il répond à une seule question — « jusqu'où cette boîte
 * doit-elle descendre pour qu'on ne voie QUE des lignes ENTIÈRES ? » — et il la répond de deux façons, selon ce
 * qu'on connaît.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTAT D'ARNO (07/10/2026, fiche du bien 315) : l'encart « Propriétaire » montre ses trois contacts, et affiche
 * pourtant « ↓ 1 autre ». Même chose côté Locataire.
 *
 * 🔴 LA CAUSE EST UNE HAUTEUR DEVINÉE. L'encart était plafonné à une valeur ÉCRITE (`--hdb-liste-h: 8.75rem`),
 * calculée pour « trois capsules de 44 px plus leurs deux interlignes ». Une capsule dont le nom passe à la ligne
 * dépasse ces 44 px : la troisième est alors rognée de quelques pixels, le compteur la voit « pas entièrement
 * visible » — ce qui est exact — et annonce un contact de plus à lire. Le compte n'était pas faux : c'est la
 * hauteur qui promettait trois lignes sans les tenir.
 *
 * 🔴 LA RÉPONSE N'EST DONC PAS DE RELÂCHER LE COMPTEUR (« à quelques pixels près »), ce qui l'aurait rendu faux
 * pour de bon, mais de MESURER la hauteur qu'il faut. On demande aux capsules où elles s'arrêtent, et la boîte
 * s'arrête là. Le compteur, lui, ne change pas d'un mot : il compte ce qui dépasse, et il n'y a plus rien qui
 * dépasse quand tout tient.
 *
 * ⚠️ DEUX FONCTIONS, DEUX SITUATIONS, ET ELLES NE SE REMPLACENT PAS :
 *   · `hauteurDesPremiers` — « montre-m'en N, en entier » : l'encart de Parties, qui en montre trois ;
 *   · `hauteurEntiereDans` — « montre-m'en autant que cette place en contient, en entier » : la liste de
 *     suggestions de l'Annuaire, bornée par un plafond d'écran et non par un nombre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Où une ligne commence et quelle hauteur elle prend, dans le repère de la boîte qui défile. */
export interface PositionLigne {
  haut: number;
  hauteur: number;
}

/**
 * LA HAUTEUR QUI CONTIENT LES `nombre` PREMIÈRES LIGNES, ENTIÈREMENT.
 *
 * 🔴 ELLE SE MESURE DEPUIS LE HAUT DE LA PREMIÈRE, et non depuis zéro : les positions rendues par le navigateur
 * sont relatives à un parent qui n'est pas forcément la boîte, et une origine supposée aurait ajouté un décalage
 * invisible — exactement le genre d'erreur de quelques pixels qu'on répare.
 *
 * ⚠️ MOINS DE LIGNES QUE DEMANDÉ ⇒ LA HAUTEUR DE CE QU'IL Y A : trois places pour deux contacts ne doivent pas
 * laisser un blanc d'une ligne au bas de l'encart.
 *
 * ⚠️ AUCUNE LIGNE ⇒ `null`, et l'appelant garde alors sa hauteur de feuille : on ne replie pas une boîte à zéro
 * avant d'avoir mesuré quoi que ce soit.
 */
export function hauteurDesPremiers(
  positions: readonly PositionLigne[], nombre: number,
): number | null {
  if (positions.length === 0 || nombre <= 0) return null;
  const dernier = positions[Math.min(nombre, positions.length) - 1];
  return dernier.haut + dernier.hauteur - positions[0].haut;
}

/**
 * LA HAUTEUR QUI CONTIENT LE PLUS DE LIGNES ENTIÈRES POSSIBLE SANS DÉPASSER `budget`.
 *
 * Arno, point 2 : « la liste doit montrer le dernier élément visible en entier (pas de ligne coupée par le
 * bord) ». Le plafond d'une liste de suggestions est une place à l'écran, pas un nombre de lignes : on garde donc
 * la dernière ligne qui tient ENTIÈREMENT dedans, et la boîte s'arrête à son bas.
 *
 * ⚠️ AUCUNE LIGNE NE TIENT (une seule, très haute, plus grande que le budget) ⇒ on rend le BUDGET : mieux vaut
 * une ligne coupée qu'une liste invisible. Le cas est théorique, le repli ne l'est pas.
 */
export function hauteurEntiereDans(
  positions: readonly PositionLigne[], budget: number,
): number | null {
  if (positions.length === 0 || budget <= 0) return null;
  const origine = positions[0].haut;
  let retenue: number | null = null;
  for (const p of positions) {
    const bas = p.haut + p.hauteur - origine;
    if (bas > budget) break;
    retenue = bas;
  }
  return retenue ?? budget;
}
