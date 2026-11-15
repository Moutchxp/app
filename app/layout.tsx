import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import { ScriptInitTheme } from "./ScriptInitTheme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sans Vis-à-Vis®",
  description: "Certifiez la qualité de vue de votre bien — Sans Vis-à-Vis®.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // 🔴 Arno (15/11/2026) — Chrome sur iPhone ajoute ses propres attributs à <html> (`__gcrremoteframetoken`) : React ne doit pas les
      // compter comme un écart d'hydratation. Ne vaut que pour les ATTRIBUTS de cette balise, jamais pour son contenu.
      suppressHydrationWarning
    >
      <head>
        {/* Thème de l'admin, anti-flash : cf. SCRIPT_INIT_THEME (il ne touche que `.svv-adm-root`, jamais le public). */}
        <ScriptInitTheme />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
