"use client";

import { useEffect, useRef, useState } from "react";
import { ARIA_CADENAS, BULLE_CADENAS_AVANT, BULLE_CADENAS_EMAIL } from "../presentation";

/**
 * Cadenas explicatif d'un champ non modifiable (e-mail / téléphone). Le cadenas est un `<button>` qui OUVRE/FERME la
 * bulle AU CLIC (comportement principal, indispensable sur mobile) ; sur pointeur FIN (souris), le survol l'affiche
 * aussi, en BONUS. Fermeture : second clic, Échap, clic à l'extérieur. `aria-expanded` + `aria-controls` + `aria-label`.
 * La bulle (`role=tooltip`) reste lisible à 375px (`w-[min(260px,78vw)]`, ancrée à droite → ne déborde pas). Cible ≥ 44px.
 * Calqué sur le patron admin `InfoBulle` (clic-hors + Échap) et sur ApercuDocument. Aucune animation.
 */
export function CadenasInfo({ cible }: { cible: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [survole, setSurvole] = useState(false);
  const conteneur = useRef<HTMLSpanElement>(null);
  const bulleId = `cadenas-bulle-${cible}`;

  // Survol pris en compte UNIQUEMENT sur pointeur fin (souris) ; sur tactile, seul le clic pilote.
  const pointeurFin = () =>
    typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    if (!ouvert) return;
    function horsZone(e: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    }
    function echap(e: KeyboardEvent) {
      if (e.key === "Escape") setOuvert(false);
    }
    document.addEventListener("mousedown", horsZone);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", horsZone);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  const visible = ouvert || survole;

  return (
    <span ref={conteneur} className="relative inline-flex shrink-0">
      <button
        type="button"
        aria-label={ARIA_CADENAS}
        aria-expanded={ouvert}
        aria-controls={bulleId}
        onClick={() => setOuvert((v) => !v)}
        onMouseEnter={() => { if (pointeurFin()) setSurvole(true); }}
        onMouseLeave={() => setSurvole(false)}
        className="grid size-11 place-items-center text-svv-muted"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </button>

      {visible && (
        <span
          id={bulleId}
          role="tooltip"
          className="svv-card absolute right-0 top-full z-10 mt-1 w-[min(260px,78vw)] text-xs leading-relaxed text-svv-ink"
        >
          {BULLE_CADENAS_AVANT}
          <a href="mailto:contact@sansvisavis.com" className="font-semibold text-svv-red underline">{BULLE_CADENAS_EMAIL}</a>
          {"."}
        </span>
      )}
    </span>
  );
}
