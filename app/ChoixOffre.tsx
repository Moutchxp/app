"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { choixDepuisRatio, ratioDepuisSelection, type Choix } from "./lib/tunnel/choixOffre";

/**
 * ÉCRAN DE CHOIX « Test unique / Test illimité » (ÉCRAN 2 du parcours de fin). Le choix ne fait PLUS avancer
 * instantanément : il SÉLECTIONNE un côté (le bouton « Envoyer mon certificat » de la page confirme). Le curseur RESTE
 * sur le côté choisi. `verrouille` (test illimité choisi) → interaction GELÉE (plus de retour vers unique).
 *
 * ACCESSIBILITÉ (non négociable) : chaque offre est un vrai <button aria-pressed> — sélectionnable au tap/clic ET au
 * clavier. Le SLIDER est un PLUS pointeur (`aria-hidden`) : jamais le seul moyen de choisir. prefers-reduced-motion
 * désactive l'animation. Mobile-first, charte rouge/vert/gris (aucun orange), AUCUNE case de consentement. Le titre
 * (« Comment souhaitez-vous continuer ?® ») est porté par le bandeau de la page → pas de doublon ici.
 */
export function ChoixOffre({
  selection,
  onSelectionner,
  verrouille,
}: {
  selection: Choix | null;
  onSelectionner: (c: Choix) => void;
  verrouille: boolean;
}) {
  // prefers-reduced-motion : calculé en EFFET (SSR-safe, aucun accès window au rendu).
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const appliquer = () => setReduce(mq.matches);
    appliquer();
    mq.addEventListener?.("change", appliquer);
    return () => mq.removeEventListener?.("change", appliquer);
  }, []);

  // Slider (enhancement pointeur). `dragRatio` = position PENDANT un glissement ; null = position CONTRÔLÉE par `selection`.
  const pisteRef = useRef<HTMLDivElement>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [glisse, setGlisse] = useState(false);

  const majDrag = useCallback((clientX: number) => {
    const piste = pisteRef.current;
    if (!piste) return;
    const rect = piste.getBoundingClientRect();
    const demi = rect.width / 2 || 1;
    setDragRatio(Math.max(-1, Math.min(1, (clientX - (rect.left + rect.width / 2)) / demi)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (verrouille) return; // choix verrouillé (illimité) → slider gelé
    setGlisse(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    majDrag(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (glisse) majDrag(e.clientX);
  };
  const finGlisse = () => {
    setGlisse(false);
    if (dragRatio !== null) {
      const c = choixDepuisRatio(dragRatio); // glissé à fond à gauche/droite → SÉLECTIONNE (ne valide plus)
      if (c) onSelectionner(c);
    }
    setDragRatio(null); // repos → position gouvernée par `selection` (le curseur reste sur le côté choisi)
  };

  const ratio = glisse && dragRatio !== null ? dragRatio : ratioDepuisSelection(selection);
  const gauchePct = 50 + ratio * 50;
  const transitionCurseur = glisse || reduce ? "none" : "left .25s ease";
  const selUnique = selection === "unique";
  const selIllimite = selection === "illimite";

  return (
    <div>
      <style>{`
        /* Scale SEUL (centré via transform-origin par défaut) → le halo, posé en inset-0 sur la poignée, reste
           PARFAITEMENT concentrique et SUIT la poignée (il en est enfant), quelle que soit la position du curseur. */
        @keyframes svv-curseur-respire {
          0%   { transform: scale(0.85); opacity: 0.5; }
          70%  { transform: scale(1.4); opacity: 0; }
          100% { transform: scale(0.85); opacity: 0; }
        }
        .svv-halo-curseur { animation: svv-curseur-respire 2s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) { .svv-halo-curseur { animation: none; opacity: 0; } }
      `}</style>

      {/* OFFRES — vrais <button aria-pressed> (tap + clavier). Sélection = bordure colorée. Verrouillé → désactivés. */}
      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          aria-pressed={selUnique}
          disabled={verrouille}
          onClick={() => onSelectionner("unique")}
          className={`rounded-2xl p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-svv-red ${selUnique ? "border-2 border-svv-red bg-svv-field" : "border border-svv-line bg-white hover:border-svv-red"}`}
        >
          <span className="block text-base font-bold text-svv-ink">Test unique</span>
          <span className="mt-1 block text-sm text-svv-muted">Une seule analyse, pas d&apos;authentification en ligne du certificat.</span>
        </button>

        <button
          type="button"
          aria-pressed={selIllimite}
          disabled={verrouille}
          onClick={() => onSelectionner("illimite")}
          className={`rounded-2xl p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-svv-green ${selIllimite ? "border-2 border-svv-green bg-svv-green-soft" : "border border-svv-line bg-white hover:border-svv-green"}`}
        >
          <span className="flex items-center gap-2">
            <span className="text-base font-bold text-svv-ink">Test illimité</span>
            <span className="svv-pill">Création de compte en 1 clic</span>
          </span>
          <span className="mt-1 block text-sm text-svv-muted">
            Analyses illimitées + vérification en ligne de votre certificat (QR) + historique de vos analyses.
          </span>
        </button>
      </div>

      {/* SLIDER — PLUS pointeur (aria-hidden : le clavier/lecteur d'écran passe par les boutons). Le curseur reste sur le
          côté choisi ; glisser à fond à gauche/droite SÉLECTIONNE. Gelé quand le choix est verrouillé (illimité). */}
      <div className="mt-6" aria-hidden="true">
        <div className="mb-1 flex justify-between text-xs font-semibold text-svv-muted">
          <span>← Test unique</span>
          <span>Test illimité →</span>
        </div>
        <div
          ref={pisteRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finGlisse}
          onPointerCancel={finGlisse}
          className={`relative h-12 select-none rounded-full border border-svv-line bg-svv-field ${verrouille ? "opacity-60" : ""}`}
          style={{ touchAction: "none" }}
        >
          <div
            className="absolute top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${gauchePct}%`, transition: transitionCurseur }}
          >
            {/* Halo concentrique (inset-0 = pile sur la poignée) qui SUIT le curseur. Éteint dès qu'on manipule le
                slider (`glisse`) — il ne « respire » qu'au repos. Coupé aussi sous prefers-reduced-motion (cf. <style>). */}
            <span aria-hidden className={`absolute inset-0 rounded-full bg-svv-red ${glisse ? "opacity-0" : "svv-halo-curseur"}`} />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-svv-red shadow-md">
              <span aria-hidden className="flex items-center gap-[3px]">
                <span className="block h-4 w-[2px] rounded-full bg-white/85" />
                <span className="block h-4 w-[2px] rounded-full bg-white/85" />
                <span className="block h-4 w-[2px] rounded-full bg-white/85" />
              </span>
            </span>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-svv-muted">Glissez le curseur, ou touchez directement une option.</p>
      </div>
    </div>
  );
}
