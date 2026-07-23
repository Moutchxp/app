import type { ReactNode } from "react";
import { Space_Grotesk, Public_Sans, IBM_Plex_Mono } from "next/font/google";

/**
 * Layout de SEGMENT pour /espace — CALQUÉ sur app/verifier/layout.tsx : charge les polices de marque Sans Vis-à-Vis®
 * (titres = Space Grotesk, texte = Public Sans, identifiants = IBM Plex Mono) et les expose en VARIABLES CSS sur un wrapper.
 * Next 16 : les polices sont scopées au composant qui les applique → le tunnel (app/page.tsx) et l'admin, servis par le
 * layout RACINE (Geist), NE sont PAS affectés. Le wrapper porte aussi `.svv-verif` (police de texte par défaut du segment).
 */
const titre = Space_Grotesk({ variable: "--font-svv-title", subsets: ["latin"], display: "swap" });
const texte = Public_Sans({ variable: "--font-svv-text", subsets: ["latin"], display: "swap" });
const mono = IBM_Plex_Mono({ variable: "--font-svv-mono", subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" });

export default function EspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${titre.variable} ${texte.variable} ${mono.variable} svv-verif min-h-full`}>
      {children}
    </div>
  );
}
