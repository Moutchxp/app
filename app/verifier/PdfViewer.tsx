"use client";

import { useEffect, useRef, useState } from "react";
import { MSG_CHARGEMENT_APERCU, MSG_DOC_INDISPONIBLE } from "./presentation";

/**
 * Rendu PDF.js d'un document (une ou plusieurs pages) dans des <canvas>. CLIENT-ONLY : ce module n'est importé QUE via
 * `dynamic(() => import('./PdfViewer'), { ssr:false })` depuis ApercuDocument → il n'entre JAMAIS dans le bundle serveur ni
 * dans le chargement initial de la page. PDF.js lui-même est importé DYNAMIQUEMENT (build LEGACY, compatible Safari iOS
 * < 17.4 : le build moderne dépend de Promise.withResolvers). Worker servi depuis /public (copie de la version épinglée).
 * Aucun console.log, jamais de jeton.
 */
export default function PdfViewer({ url }: { url: string }) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<"chargement" | "ok" | "erreur">("chargement");

  useEffect(() => {
    let annule = false;
    const conteneur = conteneurRef.current;
    if (!conteneur) return;

    (async () => {
      try {
        // Types de l'API pris sur l'entrée principale (même surface que le build legacy).
        const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const pdf = await pdfjs.getDocument(url).promise;
        if (annule) return;
        conteneur.replaceChildren();

        const largeur = conteneur.clientWidth || 320;
        const dpr = window.devicePixelRatio || 1;
        for (let p = 1; p <= pdf.numPages; p += 1) {
          const page = await pdf.getPage(p);
          if (annule) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (largeur / base.width) * dpr });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.marginBottom = "8px";
          conteneur.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        if (!annule) setEtat("ok");
      } catch {
        // 404 / 503 / exception réseau ou rendu → message sobre, jamais de détail technique.
        if (!annule) setEtat("erreur");
      }
    })();

    return () => {
      annule = true;
    };
  }, [url]);

  return (
    <div>
      {etat === "chargement" && <p className="py-10 text-center text-sm text-svv-muted">{MSG_CHARGEMENT_APERCU}</p>}
      {etat === "erreur" && <p className="py-10 text-center text-sm text-svv-muted">{MSG_DOC_INDISPONIBLE}</p>}
      <div ref={conteneurRef} className={etat === "ok" ? "" : "hidden"} aria-hidden={etat !== "ok"} />
    </div>
  );
}
