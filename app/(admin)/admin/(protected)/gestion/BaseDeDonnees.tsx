/**
 * ══ 🔴 LOT PICTO-PIECE-DANS-LE-DRIVE — LE PICTO « BASE DE DONNÉES » ═══════════════════════════════════════════════
 *
 * Demande d'Arno (03/10/2026) : « un picto “base de données” (cylindre à 3 disques empilés, même taille et même
 * style que les autres) ». Il dit « ce document est DÉJÀ quelque part », et c'est exactement ce qu'un cylindre de
 * stockage évoque sans qu'on ait à l'expliquer.
 *
 * 🔴 UN TRACÉ, PAS UN EMOJI — la leçon du trombone (30/09/2026) reprise par l'œil : « 🗄 » est rendu par une police
 * EN COULEUR qui ignore la propriété `color`, et resterait de la même teinte dans les deux thèmes.
 * `stroke="currentColor"` fait suivre à l'icône la couleur du texte qui l'entoure, en Clair comme en Sombre.
 *
 * ⚠️ TROIS DISQUES, et c'est le dessin demandé : une ellipse en haut, puis deux lignes qui marquent les deux
 * disques suivants, et les flancs qui les relient. Le même `viewBox` 24×24 et la même `strokeWidth` que `Oeil` :
 * posés côte à côte, les deux pictos doivent peser pareil.
 *
 * ⚠️ `aria-hidden` : c'est le BOUTON qui porte le mot (`aria-label`), jamais l'icône. L'annoncer ici le ferait
 * lire deux fois.
 */
export function BaseDeDonnees({ taille = 17 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* Le disque du dessus : c'est lui qui donne au cylindre sa lecture immédiate. */}
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      {/* Les flancs, du premier disque au dernier. */}
      <path d="M4.5 5.5v13" />
      <path d="M19.5 5.5v13" />
      {/* Les deux disques suivants : seul leur bord VISIBLE est tracé — un cylindre ne se voit pas par-derrière. */}
      <path d="M4.5 10.8c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
      <path d="M4.5 15.4c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
      <path d="M4.5 18.5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </svg>
  );
}
