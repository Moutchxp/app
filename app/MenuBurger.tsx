"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import Image from "next/image";

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

/** Chevron discret à droite d'une entrée de menu (indication d'action). Muté, décoratif. */
function ChevronEntree() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-svv-muted">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * Repère de fin de ligne d'une entrée. Comme le panneau ne se ferme plus au clic (il reste visible jusqu'à ce que la
 * destination prenne la main → aucun aperçu de l'accueil), c'est le SEUL retour immédiat du clic : tant que la navigation
 * déclenchée par le <Link> parent n'a pas abouti, `useLinkStatus().pending` est vrai (Next 16) et le chevron cède la place
 * à un point qui pulse — MÊME gabarit 18px, donc zéro décalage. Sous prefers-reduced-motion : point FIXE (le repère reste,
 * sans animation). Décoratif (aria-hidden), comme le chevron. DESCENDANT obligatoire d'un <Link> (contrat de useLinkStatus).
 * Route déjà préchargée → transition instantanée, `pending` sauté : le chevron ne bouge pas (rien à signaler).
 */
function IndicateurEntree() {
  const { pending } = useLinkStatus();
  if (!pending) return <ChevronEntree />;
  return (
    <span className="grid size-[18px] shrink-0 place-items-center" aria-hidden="true">
      <span className="size-2 rounded-full bg-svv-red animate-pulse motion-reduce:animate-none" />
    </span>
  );
}

export function MenuBurger() {
  const [ouvert, setOuvert] = useState(false);
  const [connecte, setConnecte] = useState<boolean | null>(null); // null = inconnu (avant réponse) → déconnexion masquée
  const burgerRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);

  const fermer = useCallback(() => setOuvert(false), []);

  const ouvrir = useCallback(() => {
    setOuvert(true);
    // État de session interrogé à CHAQUE ouverture (pas au montage). Fail-closed : toute erreur → non connecté.
    fetch("/api/internaute/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setConnecte(d?.connecte === true))
      .catch(() => setConnecte(false));
  }, []);

  // « Retour au menu » : si l'accueil est chargé avec ?menu, on OUVRE le panneau puis on NETTOIE l'URL sans recharger
  // (un refresh ou un lien partagé ne rouvre pas le menu par surprise). Marqueur absent → rien ne change. Montage seul.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("menu")) return;
    params.delete("menu");
    const q = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
    // Ouverture UNE fois au montage en réaction à un état externe (le marqueur d'URL). L'effet est le bon outil ici ;
    // la règle est un faux positif pour ce cas de synchronisation URL → UI. Aucune cascade (montage seul, deps stables).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    ouvrir();
  }, [ouvrir]);

  async function seDeconnecter() {
    try {
      await fetch("/api/internaute/auth/logout", { method: "POST" });
    } catch {
      /* best-effort : on redirige quand même vers l'accueil */
    }
    window.location.href = "/";
  }

  // Ouverture : scroll bloqué, focus sur la 1re entrée, Échap ferme, focus PIÉGÉ ; fermeture : scroll rendu, focus au burger.
  useEffect(() => {
    if (!ouvert) return;
    const scrollPrec = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panneauRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();

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
      {/* Burger DANS LE FLUX : placé par la rangée logo de l'accueil (défile avec le contenu, voulu). `shrink-0` → garde
          44×44px et ne se comprime jamais. Habillage : cercle blanc opaque, bordure marquée, légère ombre, icône encre. */}
      <button
        ref={burgerRef}
        type="button"
        onClick={ouvrir}
        aria-expanded={ouvert}
        aria-controls="menu-burger-panneau"
        aria-label="Ouvrir le menu"
        className="grid size-11 shrink-0 place-items-center rounded-full border border-svv-muted bg-white text-svv-ink shadow-md"
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
          className="fixed inset-0 z-50 flex flex-col bg-slate-100 px-4 py-6"
        >
          {/* Colonne calquée sur l'accueil : même chaîne main(px-4 py-6) → wrapper(max-w-md) → carte(p-6), fond IDENTIQUE
              (bg-slate-100, valeur brute de l'accueil). Sans carte blanche : les entrées sont des cartes sur le gris. */}
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col p-6">
            {/* En-tête : logo seul (la croix est retirée — Échap et le bouton « Retour à l'accueil » du bas ferment le panneau). */}
            <div className="mt-2">
              <Image
                src="/images/logo-svv-lockup.png"
                alt="Sans Vis-à-Vis®"
                width={1840}
                height={413}
                style={{ width: "100%", height: "auto", maxWidth: "330px" }}
              />
            </div>

            {/* Entrées = cartes blanches sur le gris (contraste), libellé à gauche + repère discret à droite. PAS de
                `onClick` de fermeture : le panneau reste au-dessus de l'accueil jusqu'à ce que la destination prenne la
                main (fin du clignotement). Le repère de fin de ligne signale l'attente pendant la navigation. */}
            <nav className="mt-8 flex flex-col gap-3">
              <Link href="/espace" className="svv-menu-entree">
                <span>Historique</span>
                <IndicateurEntree />
              </Link>
              <Link href="/espace/compte" className="svv-menu-entree">
                <span>Mon compte</span>
                <IndicateurEntree />
              </Link>
              <Link href="/qui-sommes-nous" className="svv-menu-entree">
                <span>Qui sommes-nous</span>
                <IndicateurEntree />
              </Link>
              <Link href="/partenaires" className="svv-menu-entree">
                <span>Partenaires</span>
                <IndicateurEntree />
              </Link>
            </nav>

            {/* Bas du panneau. « Retour à l'accueil » : même habillage carte que les entrées, SANS chevron + libellé centré
                + poussé en bas (mt-auto) → DISTINCT des 4 cartes. FERME le panneau (comme l'ancienne croix + Échap). */}
            <button type="button" onClick={fermer} className="svv-menu-entree mt-auto">
              <span className="mx-auto">Retour à l&rsquo;accueil</span>
            </button>

            {/* Se déconnecter — DISTINCT de tout (bouton texte rouge séparé par un filet), UNIQUEMENT si connecté. */}
            {connecte === true && (
              <button
                type="button"
                onClick={seDeconnecter}
                className="mt-3 flex min-h-[44px] items-center justify-center border-t border-svv-line pt-4 text-base font-semibold text-svv-red"
              >
                Se déconnecter
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
