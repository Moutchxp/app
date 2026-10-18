'use client';

import { useEffect, useState } from 'react';

/**
 * ══ 🔴🔴 LA FÊTE DU « OUI » — « Propriétaire(s) en gestion ? » (Arno, 18/10/2026 : nouvelle gestion = bonne nouvelle) ══
 *
 * « Au passage à Oui uniquement ; CONTENUE STRICTEMENT dans le bouton (débordement masqué), rien ailleurs sur la page ;
 * bouchon de champagne qui saute, cotillons et serpentins, aux couleurs du thème (rouge de l'agence, or, blanc) ; durée
 * totale 3 secondes, puis le bouton revient à son état “✓ Oui” normal ; aucune bibliothèque lourde, aucun son ;
 * désactivée si l'utilisateur a réglé “réduire les animations” ; ne bloque ni le clic ni la suite du formulaire. »
 *
 * Rendu DANS le bouton (`position:relative; overflow:hidden` posés par `.fete-hote`), `aria-hidden`, sans pointeur : le
 * style (`CSS_FETE`) est chargé par l'écran qui monte le bouton — aucun texte de plus dans le bouton. Le
 * clic passe, le bloc mandat s'affiche tout de suite. Démonté au bout de `DUREE_FETE_MS`. Le parent le remonte (clé) à
 * chaque NOUVEAU passage à Oui — jamais quand Oui est déjà choisi.
 */
export const DUREE_FETE_MS = 3000;

/** L'utilisateur a-t-il demandé de réduire les animations ? (lu à chaque fête : le réglage peut changer) */
export function mouvementReduit(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const COULEURS = ['var(--color-svv-red)', 'var(--color-svv-or)', 'var(--color-svv-blanc)'] as const;
/**
 * Les cotillons : un point d'arrivée en POURCENTAGE du bouton (ils couvrent toute sa largeur, quelle qu'elle soit), une
 * rotation, un délai — déterministes (aucun hasard : même rendu à chaque fois).
 */
const COTILLONS = Array.from({ length: 26 }, (_, i) => ({
  fx: 4 + ((i * 37) % 92),
  fy: 6 + ((i * 53) % 50),
  r: (i * 47) % 360,
  d: 0.2 + (i % 7) * 0.05,
  c: COULEURS[i % 3],
  rond: i % 4 === 0,
}));

export function FeteOui() {
  const [vivante, setVivante] = useState(() => !mouvementReduit());
  useEffect(() => {
    if (!vivante) return;
    const t = setTimeout(() => setVivante(false), DUREE_FETE_MS);
    return () => clearTimeout(t);
  }, [vivante]);
  if (!vivante) return null;
  return (
    <span className="fete" aria-hidden="true" data-fete>
      {/* Le bouchon : il saute du bas du bouton, tourne, et sort par le haut (coupé par le bouton). */}
      <svg className="fete-bouchon" viewBox="0 0 24 30" width="30" height="38">
        <rect x="4" y="2" width="16" height="16" rx="5" fill="var(--color-svv-or)" />
        <rect x="6" y="16" width="12" height="12" rx="2" fill="var(--color-svv-or)" opacity=".75" />
        <path d="M6 8h12M6 12h12" stroke="var(--color-svv-red)" strokeWidth="1.6" />
      </svg>
      <span className="fete-eclat" />
      {COTILLONS.map((c, i) => (
        <span key={i} className={`fete-cotillon${c.rond ? ' fete-cotillon--rond' : ''}`}
          style={{ '--fx': `${c.fx}%`, '--fy': `${c.fy}%`, '--r': `${c.r}deg`, animationDelay: `${c.d}s`, background: c.c } as React.CSSProperties} />
      ))}
      {/* Les serpentins : trois rubans ondulés qui se déroulent. */}
      <svg className="fete-serpentins" viewBox="0 0 200 100" preserveAspectRatio="none">
        <path className="fete-serpentin" d="M10 95 C 30 60, 50 80, 60 50 S 90 30, 100 10" stroke="var(--color-svv-or)" />
        <path className="fete-serpentin fete-serpentin--2" d="M190 95 C 170 65, 150 85, 140 55 S 115 30, 110 8" stroke="var(--color-svv-blanc)" />
        <path className="fete-serpentin fete-serpentin--3" d="M100 98 C 90 75, 120 70, 105 50 S 80 35, 95 15" stroke="var(--color-svv-red)" />
      </svg>
    </span>
  );
}

/** Couleurs du thème uniquement (rouge de l'agence, or, blanc). Tout est dans `.fete`, posée DANS le bouton. */
export const CSS_FETE = `
.fete-hote{position:relative;overflow:hidden;isolation:isolate}
.fete-texte{position:relative;z-index:2}
.fete{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none;border-radius:inherit}
.fete-bouchon{position:absolute;left:50%;bottom:-40px;margin-left:-15px;animation:feteBouchon 1.6s cubic-bezier(.2,.8,.3,1) forwards}
.fete-eclat{position:absolute;left:50%;bottom:18%;width:20px;height:20px;margin-left:-10px;border-radius:50%;border:3px solid var(--color-svv-or);opacity:0;animation:feteEclat .8s ease-out .2s forwards}
.fete-cotillon{position:absolute;left:50%;top:80%;width:7px;height:11px;border-radius:2px;opacity:0;animation:feteCotillon 2.5s cubic-bezier(.2,.7,.4,1) forwards}
.fete-cotillon--rond{width:8px;height:8px;border-radius:50%}
.fete-serpentins{position:absolute;inset:0;width:100%;height:100%}
.fete-serpentin{fill:none;stroke-width:3;stroke-linecap:round;stroke-dasharray:180;stroke-dashoffset:180;opacity:0;animation:feteSerpentin 2.6s ease-out .2s forwards}
.fete-serpentin--2{animation-delay:.35s}
.fete-serpentin--3{animation-delay:.5s;stroke-width:2.5}
@keyframes feteBouchon{0%{transform:translateY(0) rotate(0)}20%{transform:translateY(-70px) rotate(-30deg)}45%{transform:translateY(-95px) rotate(-60deg)}100%{transform:translateY(-280px) rotate(420deg)}}
@keyframes feteEclat{0%{opacity:.95;transform:scale(.3)}100%{opacity:0;transform:scale(5)}}
@keyframes feteCotillon{0%{opacity:0;left:50%;top:80%;transform:rotate(0)}8%{opacity:1}45%{opacity:1;left:var(--fx);top:var(--fy);transform:rotate(var(--r))}85%{opacity:1}100%{opacity:0;left:calc(var(--fx) + 3%);top:105%;transform:rotate(calc(var(--r) * 2))}}
@keyframes feteSerpentin{0%{opacity:0;stroke-dashoffset:180}12%{opacity:1}70%{opacity:1;stroke-dashoffset:0}100%{opacity:0;stroke-dashoffset:0}}
@media (prefers-reduced-motion: reduce){.fete{display:none}}
`;
