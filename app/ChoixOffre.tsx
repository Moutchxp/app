"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { choixDepuisRatio, brancherChoix, type Choix } from "./lib/tunnel/choixOffre";

/**
 * ÉCRAN DE CHOIX « Test unique / Test illimité » (Commit D1), affiché après le résultat.
 *
 * ACCESSIBILITÉ (non négociable) : chaque offre est un vrai <button> — activable au tap/clic ET au clavier (Entrée /
 * Espace, gérés par la plateforme). Le SLIDER « glisser pour choisir » est un PLUS (pointeur uniquement, `aria-hidden`) :
 * il n'est jamais le seul moyen de choisir. Curseur au CENTRE NEUTRE ; glisser À FOND à gauche = unique, à droite =
 * illimité, ce qui VALIDE directement (pas de bouton de confirmation). `prefers-reduced-motion` désactive l'animation
 * de retour du curseur. Mobile-first, charte rouge/vert/gris (aucun orange), ® affiché. AUCUNE case de consentement.
 */
export function ChoixOffre({ onUnique, onIllimite }: { onUnique: () => void; onIllimite: () => void }) {
  const choisir = useCallback(
    (c: Choix) => brancherChoix(c, { surUnique: onUnique, surIllimite: onIllimite }),
    [onUnique, onIllimite],
  );

  // prefers-reduced-motion : calculé en EFFET (jamais au rendu → SSR-safe, aucun accès window pendant le render).
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const appliquer = () => setReduce(mq.matches);
    appliquer();
    mq.addEventListener?.("change", appliquer);
    return () => mq.removeEventListener?.("change", appliquer);
  }, []);

  // Slider (enhancement pointeur). `ratio` ∈ [-1, +1], 0 = centre. `valideRef` évite un double déclenchement.
  const pisteRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0);
  const [glisse, setGlisse] = useState(false);
  const valideRef = useRef(false);

  const majDepuisClientX = useCallback(
    (clientX: number) => {
      const piste = pisteRef.current;
      if (!piste) return;
      const rect = piste.getBoundingClientRect();
      const demi = rect.width / 2 || 1;
      const r = Math.max(-1, Math.min(1, (clientX - (rect.left + rect.width / 2)) / demi));
      setRatio(r);
      const c = choixDepuisRatio(r);
      if (c && !valideRef.current) {
        valideRef.current = true;
        choisir(c);
      }
    },
    [choisir],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    valideRef.current = false;
    setGlisse(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    majDepuisClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (glisse) majDepuisClientX(e.clientX);
  };
  const finGlisse = () => {
    setGlisse(false);
    if (!valideRef.current) setRatio(0); // pas allé au bout → retour au centre neutre
  };

  const gauchePct = 50 + ratio * 50; // 0 % (gauche) … 100 % (droite)
  const transitionCurseur = glisse || reduce ? "none" : "left .25s ease";

  return (
    <div>
      <h1 className="text-[1.4rem] font-extrabold leading-tight text-svv-ink">Comment souhaitez-vous continuer&nbsp;?</h1>
      <p className="mt-1 text-sm text-svv-muted">
        Votre certificat Sans&nbsp;Vis-à-Vis<sup>®</sup> vous sera envoyé par e-mail dans les deux cas.
      </p>

      {/* OFFRES — vrais <button> (accessibles tap + clavier). Aucun consentement. */}
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => choisir("unique")}
          className="rounded-2xl border border-svv-line bg-white p-4 text-left transition hover:border-svv-red focus:outline-none focus-visible:ring-2 focus-visible:ring-svv-red"
        >
          <span className="block text-base font-bold text-svv-ink">Test unique</span>
          <span className="mt-1 block text-sm text-svv-muted">Une analyse, votre certificat reçu par e-mail.</span>
        </button>

        <button
          type="button"
          onClick={() => choisir("illimite")}
          className="rounded-2xl border border-svv-line bg-white p-4 text-left transition hover:border-svv-green focus:outline-none focus-visible:ring-2 focus-visible:ring-svv-green"
        >
          <span className="flex items-center gap-2">
            <span className="text-base font-bold text-svv-ink">Test illimité</span>
            <span className="svv-pill">avec compte</span>
          </span>
          <span className="mt-1 block text-sm text-svv-muted">
            Analyses illimitées + vérification en ligne de votre certificat (QR) + historique de vos analyses.
          </span>
        </button>
      </div>

      {/* SLIDER « glisser pour choisir » — PLUS pointeur uniquement (aria-hidden : le clavier/lecteur d'écran utilise les
          boutons ci-dessus). Curseur au centre ; glisser à fond à gauche/droite valide directement. */}
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
          className="relative h-12 select-none rounded-full border border-svv-line bg-svv-field"
          style={{ touchAction: "none" }}
        >
          <div
            className="absolute top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-svv-red shadow-md"
            style={{ left: `${gauchePct}%`, transition: transitionCurseur }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-svv-muted">Glissez le curseur, ou touchez directement une option.</p>
      </div>
    </div>
  );
}
