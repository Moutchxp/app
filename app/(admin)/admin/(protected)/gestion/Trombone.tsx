/**
 * ══ 🔴🔴 LOT LISTE-PAGINATION — LE TROMBONE D'UNE LIGNE DE LISTE, DE LA MÊME COULEUR QUE SON CHIFFRE ════════════
 *
 * ═══ CE QUE ÇA RÉPARE, ET POURQUOI CE N'ÉTAIT PAS UN DÉFAUT DE FEUILLE DE STYLE ════════════════════════════════
 *
 * Constat d'Arno : « l'icône 📎 est grise et le chiffre noir, même quand les pièces sont ailleurs dans la
 * conversation ». La règle des deux couleurs était pourtant écrite, et correctement : `.bte-marque--pieces` porte
 * `color: ink`, `.bte-marque--pieces-loin` porte `color: muted`, et les deux s'appliquent au conteneur — donc à
 * l'icône ET au chiffre.
 *
 * 🔴 LA CAUSE EST AILLEURS : « 📎 » (U+1F4CE) est un EMOJI. Le navigateur le rend avec une police de caractères
 * EN COULEUR (Apple Color Emoji sur macOS), qui porte ses propres couleurs et IGNORE la propriété `color`. Le
 * trombone restait donc argenté dans les deux cas, pendant que le chiffre à côté obéissait, lui. Aucune retouche
 * de feuille de style ne pouvait y changer quoi que ce soit — mesuré le 30/09/2026 : la couleur CSS calculée est
 * bien celle qu'on demande, c'est le GLYPHE qui ne la suit pas.
 *
 * LA CORRECTION EST DONC DE CHANGER DE GLYPHE : un tracé, pas un emoji. `stroke="currentColor"` fait suivre à
 * l'icône exactement la couleur du texte qui l'entoure — noire quand le chiffre est noir, grise quand il est
 * gris, et juste aussi dans le thème Sombre, où « currentColor » vaut le blanc cassé sans qu'on l'écrive.
 *
 * ⚠️ LA COULEUR NE PORTE JAMAIS L'INFORMATION SEULE. C'est la règle du module, et elle ne change pas ici :
 * l'infobulle de la ligne dit LEQUEL des deux cas (« dans ce message » / « ailleurs dans la conversation »), et
 * le nombre affiché est celui de l'état, jamais le total. Le glyphe, lui, ne fait qu'appuyer.
 *
 * ⚠️ `aria-hidden` : le trombone est une REDONDANCE visuelle de l'infobulle, qui porte déjà la phrase entière. Le
 * faire lire en plus annoncerait deux fois la même chose.
 */
export function Trombone({ taille = 13 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Le trombone ordinaire : la boucle ouverte vers le haut, comme le glyphe qu'il remplace. */}
      <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.2 3.2 0 0 1 4.6 4.6L9.6 17a1.4 1.4 0 0 1-2-2l7.8-7.8" />
    </svg>
  );
}
