"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Menu de la page d'accueil : icône burger FLOTTANTE en haut à droite (se superpose au coin de la rosace — voulu),
 * qui déroule un VOILE plein écran opaque avec 4 entrées + « Se déconnecter » si connecté.
 *
 * ORDRE IMPOSÉ : Historique · Mon compte · Qui sommes-nous · Partenaires. Seul « Historique » est actif (`/espace`
 * gère déjà connecté/déconnecté par redirection) ; les 3 autres sont PRÉSENTES mais désactivées (« Bientôt », non
 * focusables, non cliquables). « Se déconnecter » n'apparaît que si l'endpoint d'état de session le confirme.
 *
 * ÉTAT DE SESSION : interrogé À L'OUVERTURE du menu (jamais au montage de la home → aucune requête au chargement de
 * l'accueil). Le cookie étant httpOnly, on passe par `GET /api/internaute/session` (booléen seul, no-store).
 *
 * ACCESSIBILITÉ : `aria-expanded`/`aria-controls` sur le burger ; `role=dialog` + `aria-modal` + `aria-label` sur le
 * voile ; Échap ferme ; focus déplacé dans le panneau à l'ouverture et RENDU au burger à la fermeture ; focus PIÉGÉ
 * dans le panneau ; scroll du fond bloqué. Aucune animation (prefers-reduced-motion respecté d'office). Charte stricte :
 * uniquement les tokens `--color-svv-*` et les classes existantes.
 */
export function MenuBurger() {
  const [ouvert, setOuvert] = useState(false);
  const [connecte, setConnecte] = useState<boolean | null>(null); // null = inconnu (avant réponse) → déconnexion masquée
  const burgerRef = useRef<HTMLButtonElement>(null);
  const croixRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);

  const fermer = useCallback(() => setOuvert(false), []);

  function ouvrir() {
    setOuvert(true);
    // État de session interrogé à CHAQUE ouverture (pas au montage). Fail-closed : toute erreur → non connecté.
    fetch("/api/internaute/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setConnecte(d?.connecte === true))
      .catch(() => setConnecte(false));
  }

  async function seDeconnecter() {
    try {
      await fetch("/api/internaute/auth/logout", { method: "POST" });
    } catch {
      /* best-effort : on redirige quand même vers l'accueil */
    }
    window.location.href = "/";
  }

  // Ouverture : scroll bloqué, focus sur la croix, Échap ferme, focus PIÉGÉ ; fermeture : scroll rendu, focus au burger.
  useEffect(() => {
    if (!ouvert) return;
    const scrollPrec = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    croixRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        fermer();
        return;
      }
      if (e.key !== "Tab") return;
      const panneau = panneauRef.current;
      if (!panneau) return;
      const focusables = panneau.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focusables.length === 0) return;
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = scrollPrec;
      document.removeEventListener("keydown", onKey);
      // Le burger reste monté (le voile passe au-dessus) → on lui rend le focus à la fermeture. Ref stable.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      burgerRef.current?.focus();
    };
  }, [ouvert, fermer]);

  return (
    <>
      {/* Burger flottant — cible ≥ 44×44px. Se superpose au coin de la rosace (accepté). */}
      <button
        ref={burgerRef}
        type="button"
        onClick={ouvrir}
        aria-expanded={ouvert}
        aria-controls="menu-burger-panneau"
        aria-label="Ouvrir le menu"
        className="fixed right-4 top-4 z-40 grid size-11 place-items-center rounded-full border border-svv-line bg-svv-field text-svv-ink"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {ouvert && (
        <div
          ref={panneauRef}
          id="menu-burger-panneau"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col bg-svv-field"
        >
          {/* Croix, à la place exacte du burger. */}
          <div className="flex justify-end p-4">
            <button
              ref={croixRef}
              type="button"
              onClick={fermer}
              aria-label="Fermer le menu"
              className="grid size-11 place-items-center rounded-full text-svv-ink"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-6">
            {/* 1-2. Actives (focusables, incluses dans le piège de focus via le sélecteur a[href]). */}
            <Link
              href="/espace"
              onClick={fermer}
              className="flex min-h-[56px] items-center border-b border-svv-line py-4 text-lg font-semibold text-svv-ink"
            >
              Historique
            </Link>
            <Link
              href="/espace/compte"
              onClick={fermer}
              className="flex min-h-[56px] items-center border-b border-svv-line py-4 text-lg font-semibold text-svv-ink"
            >
              Mon compte
            </Link>

            {/* 3-4. Désactivées : non focusables, non cliquables, « Bientôt ». */}
            {["Qui sommes-nous", "Partenaires"].map((label) => (
              <div
                key={label}
                aria-disabled="true"
                className="flex min-h-[56px] items-center justify-between border-b border-svv-line py-4 text-lg font-semibold text-svv-muted"
              >
                <span>{label}</span>
                <span className="text-xs font-medium text-svv-muted">Bientôt</span>
              </div>
            ))}

            {/* Se déconnecter — bas de panneau, séparé, UNIQUEMENT si connecté. */}
            {connecte === true && (
              <button
                type="button"
                onClick={seDeconnecter}
                className="mt-auto flex min-h-[44px] items-center justify-center border-t border-svv-line pt-5 text-base font-semibold text-svv-red"
              >
                Se déconnecter
              </button>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
