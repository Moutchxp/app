'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * BULLE COULEUR (Archives) — au survol/focus du n° de permis, explique POURQUOI la ligne est verte / orange / rouge. C'est un CONSTAT :
 * elle n'agit pas, ne déclenche AUCUNE requête à l'affichage, n'écrit rien. Le TEXTE vient d'une fonction PURE (texteBulleCouleurArchive)
 * qui LIT les deux critères déjà calculés pour la couleur — jamais une 3ᵉ règle.
 *
 * RÉUTILISE le mécanisme d'infobulle admin `.svv-tip-wrap` / `.svv-tip` (globals.css) : révélée au SURVOL et au FOCUS CLAVIER
 * (`:focus-within`), `title` natif en repli TACTILE (mobile-first : pas de survol au doigt), `opacity` → AUCUN reflow à l'apparition, et
 * `prefers-reduced-motion` déjà respecté (la transition n'existe que `no-preference`). Modificateur `--delai` (globals.css) = apparition
 * après ~1 s de survol.
 *
 * ⚠️ POSITIONNEMENT `position: fixed` piloté au JS (et non l'`absolute` par défaut de `.svv-tip`) : le tableau vit dans un conteneur
 * `overflow:auto` (défilement horizontal mobile) qui CLIPPERAIT une bulle absolue sur la 1ʳᵉ colonne. En `fixed`, la bulle échappe au
 * conteneur ; on la centre sur le n°, CLAMPÉE à la fenêtre (jamais de débordement), et on la BASCULE EN DESSOUS quand il manque de place
 * au-dessus (premières lignes). Mesure `getBoundingClientRect` UNIQUEMENT dans les handlers (survol/focus), jamais au rendu (SSR/tests).
 */
export function BulleCouleurLigne({ idTip, lignes, children }: { idTip: string; lignes: string[]; children: ReactNode }) {
  const declRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; dessous: boolean } | null>(null);
  const situer = () => {
    const el = declRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const dessous = r.top < 110; // pas assez de place au-dessus (premières lignes / fenêtre haute) → bascule en dessous
    const left = Math.min(Math.max(140, r.left + r.width / 2), window.innerWidth - 140); // centré sur le n°, clampé (demi-largeur max 8,75rem) → jamais hors fenêtre
    setPos({ left, top: dessous ? r.bottom + 6 : r.top - 6, dessous });
  };
  // whiteSpace:'normal' OBLIGATOIRE : la cellule <td> impose `nowrap` (styleTd), hérité par la bulle → sans ça le texte ne s'enroulerait
  //   pas et serait tronqué. Ici il s'enroule dans la largeur max (.svv-tip) → toujours entièrement lisible.
  const styleBulle: CSSProperties = pos
    ? { whiteSpace: 'normal', position: 'fixed', left: pos.left, top: pos.top, bottom: 'auto', transform: pos.dessous ? 'translateX(-50%)' : 'translate(-50%, -100%)' }
    : { whiteSpace: 'normal' };
  const titre = lignes.join(' '); // repli natif/tactile : une seule chaîne (attribut title)
  return (
    <span className="svv-tip-wrap svv-tip-wrap--delai">
      {/* tabIndex=0 → bulle au FOCUS clavier (:focus-within) autant qu'au survol ; `title` = repli tactile/sans CSS. */}
      <span ref={declRef} tabIndex={0} aria-describedby={idTip} title={titre} style={{ cursor: 'help' }} onMouseEnter={situer} onFocus={situer}>{children}</span>
      <span role="tooltip" id={idTip} className="svv-tip" style={styleBulle}>
        {lignes.map((l, i) => <span key={i} style={{ display: 'block' }}>{l}</span>)}
      </span>
    </span>
  );
}
