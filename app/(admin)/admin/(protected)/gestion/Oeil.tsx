/**
 * ══ 🔴 LOT BROUILLONS-APERCU — L'ŒIL : « voir, sans ouvrir » ══════════════════════════════════════════════════
 *
 * Demande d'Arno (02/10/2026) : « Ajoute sur chaque ligne un picto “œil” (aria-label “Aperçu du brouillon”). »
 *
 * 🔴 UN TRACÉ, PAS UN EMOJI — la leçon du trombone (voir `Trombone.tsx`, 30/09/2026) : « 👁 » est rendu par une
 * police EN COULEUR qui ignore la propriété `color`, et resterait donc de la même teinte dans les deux thèmes.
 * `stroke="currentColor"` fait suivre à l'icône la couleur du texte qui l'entoure, en Clair comme en Sombre.
 *
 * ⚠️ `aria-hidden` : c'est le BOUTON qui porte le mot (`aria-label`), jamais l'icône. L'annoncer ici le ferait
 * lire deux fois.
 */
export function Oeil({ taille = 15 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.8 12S5.5 5.5 12 5.5 22.2 12 22.2 12 18.5 18.5 12 18.5 1.8 12 1.8 12z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}
