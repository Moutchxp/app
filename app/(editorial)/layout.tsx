import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { Space_Grotesk, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { ALT_SCEAU, MARQUE, LIB_RETOUR_ACCUEIL } from "./gabarit";

/**
 * Layout de SEGMENT partagé par les pages ÉDITORIALES (« Qui sommes-nous », « Partenaires »). CALQUÉ sur
 * `app/verifier/layout.tsx` : charge les polices de marque (scopées au groupe, Next 16) + `.svv-verif`. Ajoute
 * l'habillage commun : bandeau rouge (sceau + marque) et lien de retour, pour ne pas dupliquer l'habillage sur
 * chaque page. Largeur de lecture ÉLARGIE (texte suivi), tout en restant mobile-first (confortable à 375px).
 */
const titre = Space_Grotesk({ variable: "--font-svv-title", subsets: ["latin"], display: "swap" });
const texte = Public_Sans({ variable: "--font-svv-text", subsets: ["latin"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--font-svv-mono", subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });

export default function EditorialLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${titre.variable} ${texte.variable} ${mono.variable} svv-verif min-h-full`}>
      <main className="mx-auto flex w-full max-w-[680px] flex-col">
        {/* Bandeau rouge commun : sceau + marque (aucune sous-ligne éditoriale inventée). */}
        <header className="flex items-center gap-3 bg-svv-red px-5 py-4">
          <Image src="/logo-rond.png" alt={ALT_SCEAU} width={46} height={46} priority className="size-[46px] shrink-0" />
          <p className="svv-verif-title text-base font-extrabold tracking-wide text-white">{MARQUE}</p>
        </header>

        <div className="flex flex-1 flex-col gap-6 px-5 py-8">
          {children}
          {/* Retour vers l'accueil de l'application — action secondaire, cible ≥ 44px. */}
          <Link href="/" className="svv-btn svv-btn-outline mt-2">{LIB_RETOUR_ACCUEIL}</Link>
        </div>
      </main>
    </div>
  );
}
