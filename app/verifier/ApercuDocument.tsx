"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { LIB_VOIR_DOCUMENT, LEGENDE_ANONYMISE, MSG_DOC_INDISPONIBLE, ARIA_APERCU, ARIA_FERMER_APERCU } from "./presentation";

// PDF.js chargé UNIQUEMENT côté client, à la demande (ssr:false interdit dans un Server Component → mis ici, dans un
// Client Component). Le viewer et PDF.js n'entrent donc jamais dans le bundle serveur ni dans le chargement initial.
const PdfViewer = dynamic(() => import("./PdfViewer"), { ssr: false });

/**
 * Bouton « Voir le document » + surcouche d'aperçu plein écran, scrollable, rendue DANS la page.
 * Le Server Component ne passe QUE `disponible` (booléen) et `voie` : le JETON n'est JAMAIS sérialisé du serveur.
 * L'URL du document est construite CÔTÉ CLIENT depuis `window.location.search` au moment d'ouvrir (voie certificat = PDF
 * anonymisé ; voie visuel = PNG). Aucun console.log, jamais le jeton.
 */
export default function ApercuDocument({ disponible, voie }: { disponible: boolean; voie: "visuel" | "certificat" }) {
  const [ouvert, setOuvert] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [imgErreur, setImgErreur] = useState(false);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const croixRef = useRef<HTMLButtonElement>(null);

  const ouvrir = useCallback(() => {
    // `window.location.search` porte déjà ref/n/j/doc — jamais reçus du serveur, jamais reconstruits ailleurs.
    setUrl(`/verifier/document${window.location.search}`);
    setImgErreur(false);
    setOuvert(true);
  }, []);
  const fermer = useCallback(() => {
    setOuvert(false);
    setUrl(null);
  }, []);

  // Ouverture : verrou du scroll du corps, focus sur la croix, Échap ferme. Fermeture : scroll restauré, focus au bouton.
  useEffect(() => {
    if (!ouvert) return;
    const scrollPrec = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    croixRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = scrollPrec;
      document.removeEventListener("keydown", onKey);
      // Le bouton reste MONTÉ pendant toute l'ouverture (rendu au-dessus de la surcouche) → `boutonRef.current` est le même
      // nœud ; on lui rend le focus à la fermeture. (Le warning exhaustive-deps ne s'applique pas : ref stable.)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      boutonRef.current?.focus();
    };
  }, [ouvert, fermer]);

  if (!disponible) return null;

  return (
    <>
      <button ref={boutonRef} type="button" onClick={ouvrir} className="svv-btn svv-btn-outline">
        {LIB_VOIR_DOCUMENT}
      </button>

      {ouvert && url && (
        // Surcouche plein écran. Fond sombre translucide via le token --color-svv-ink + opacité (aucune couleur nouvelle).
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ARIA_APERCU}
          onClick={fermer}
          className="fixed inset-0 z-50 flex flex-col bg-svv-ink/70 p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mx-auto flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-white"
          >
            <div className="flex shrink-0 justify-end p-2">
              <button
                ref={croixRef}
                type="button"
                onClick={fermer}
                aria-label={ARIA_FERMER_APERCU}
                className="grid size-11 place-items-center rounded-full text-svv-muted hover:text-svv-ink"
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Conteneur à défilement vertical borné. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
              {voie === "visuel" ? (
                imgErreur ? (
                  <p className="py-10 text-center text-sm text-svv-muted">{MSG_DOC_INDISPONIBLE}</p>
                ) : (
                  // Visuel = image PNG servie par la route (aucun PDF.js).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" onError={() => setImgErreur(true)} className="mx-auto block w-full max-w-full" />
                )
              ) : (
                <>
                  <PdfViewer url={url} />
                  <p className="mt-3 text-center text-xs text-svv-muted">{LEGENDE_ANONYMISE}</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
