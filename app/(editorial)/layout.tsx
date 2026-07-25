import type { ReactNode } from "react";
import Link from "next/link";
import { Space_Grotesk, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { LIB_RETOUR_MENU } from "./gabarit";

/**
 * Layout de SEGMENT partagé par les pages ÉDITORIALES (« Qui sommes-nous », « Partenaires »). Charge les polices de
 * marque (scopées au groupe, Next 16) + `.svv-verif`. PAS de bandeau : le titre <h1> de chaque page est le PREMIER
 * élément visible. Largeur de lecture ALIGNÉE sur l'accueil (`max-w-md`). Lien de retour commun en pied (inchangé ici).
 */
const titre = Space_Grotesk({ variable: "--font-svv-title", subsets: ["latin"], display: "swap" });
const texte = Public_Sans({ variable: "--font-svv-text", subsets: ["latin"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--font-svv-mono", subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });

export default function EditorialLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${titre.variable} ${texte.variable} ${mono.variable} svv-verif min-h-full`}>
      {/* Même largeur que l'accueil (max-w-md). `py-8` du corps → le titre respire, jamais collé au bord supérieur. */}
      <main className="mx-auto flex w-full max-w-md flex-col">
        <div className="flex flex-1 flex-col gap-6 px-5 py-8">
          {children}
          {/* Retour au menu (accueil + menu rouvert) — action secondaire, cible ≥ 44px. */}
          <Link href="/?menu" className="svv-btn svv-btn-outline mt-2">{LIB_RETOUR_MENU}</Link>
        </div>
      </main>
    </div>
  );
}
