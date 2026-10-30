/**
 * ══ 🔴 LOT BN (Arno, 30/10/2026) — LE TRIANGLE DE DÉPLIAGE, PARTAGÉ ══════════════════════════════════════════════════════════════════════════
 * Le triangle ROUGE des fils de messages de la tuile Gestion (`Conversation`), extrait ici pour servir aux deux tuiles — Gestion et Transaction
 * (cartes d'affaires, ligne miroir, « Compromis annulés », la synthèse, les fiches de la fenêtre des personnes) — sans copie :
 *   · le dessin : 36 px, pointe à droite (▶) quand c'est replié ; `ouvert` : tourné de 90° (pointe en bas, ▼), rotation animée (coupée pour qui
 *     a demandé moins d'animation) ;
 *   · la couleur : le rouge de la charte (`--color-svv-red`, un jeton : lisible en clair comme en sombre).
 * Le dessin est DÉCORATIF (`aria-hidden`) : l'état se dit par `aria-expanded` du bouton qui le porte (la ligne), qui garde le clavier (Entrée,
 * Espace) et son focus visible. Il n'a aucun état propre.
 * Gestion le pose dans son bouton `.cnv-triangle` (sa boîte et son alignement, inchangés) ; la rotation y est aussi tenue par
 * `.cnv-triangle--ouvert svg` (même règle, même résultat).
 */
export function DessinTriangle({ ouvert = false }: { ouvert?: boolean }) {
  return (
    <svg className={`svv-triangle${ouvert ? ' svv-triangle--ouvert' : ''}`} viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" focusable="false"
      data-triangle={ouvert ? 'ouvert' : 'replie'}>
      <path d="M9 5l8 7-8 7z" fill="currentColor" />
    </svg>
  );
}

/** Les styles partagés du dessin (AUCUN ACCENT GRAVE ICI : littéral gabarit). */
export const CSS_TRIANGLE = `
.svv-triangle{flex:0 0 auto;color:var(--color-svv-red);transition:transform .18s ease}
.svv-triangle--ouvert{transform:rotate(90deg)}
@media (prefers-reduced-motion:reduce){.svv-triangle{transition:none}}
`;

/** La boîte du dessin dans une ligne de texte (Transaction : cartes, synthèse, fiches) : le dessin de 36 px centré sur la première ligne du titre,
 *  sans la grandir, la pointe près du bord gauche. Gestion a sa propre boîte (`.cnv-triangle`) et ne charge pas celle-ci. */
export const CSS_TRIANGLE_BOITE = `
.svv-triangle-boite{display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:1.5em;margin-left:-10px;margin-right:-6px;overflow:visible}
`;
