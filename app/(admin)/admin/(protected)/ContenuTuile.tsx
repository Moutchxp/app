'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * ══ 🔴🔴 ARNO (22/10/2026) — LE MENU DE GAUCHE RAMÈNE TOUJOURS À LA PREMIÈRE PAGE DE SA TUILE ════════════════════════
 *
 * « Chaque entrée […] ramène TOUJOURS à la première page de sa tuile, même quand on est déjà dans cette tuile
 * (sous-page, onglet, fiche, paramètres d'URL, modale ouverte). » Constaté sur le Banc de test : la page n'a qu'une
 * adresse, son état (saisie, carte, analyse) vit dans React — recliquer « Banc de test » demandait à Next d'aller là où
 * il croyait déjà être, et rien ne bougeait.
 *
 * 🔴 LE REMÈDE : le contenu de l'admin est REMONTÉ (clé React changée) — onglets, fiches, modales et saisies reviennent
 * à leur état d'ouverture, sans recharger la page. La barre latérale demande ce remontage par `demanderAccueilTuile` ;
 * il n'a lieu qu'une fois l'adresse ARRIVÉE à l'accueil de la tuile : remonter avant, c'est relire les anciens
 * paramètres d'URL (ex. `/admin/permis?q=…`) et les garder.
 *
 * ⚠️ Une sous-page (`/admin/location/bien/3`) n'en a pas besoin : la navigation vers l'accueil monte une autre page.
 */
export const EVT_ACCUEIL_TUILE = 'svv-adm-accueil-tuile';

/** Normalise une adresse en « chemin + paramètres » (sans origine ni ancre) : la seule chose que l'on compare. */
export function adresseNormalisee(url: string): string {
  const u = new URL(url, 'http://local');
  return u.pathname + u.search;
}

export function demanderAccueilTuile(cible: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVT_ACCUEIL_TUILE, { detail: adresseNormalisee(cible) }));
}

export function ContenuTuile({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const parametres = useSearchParams();
  const recherche = parametres?.toString() ?? '';
  const actuelle = pathname + (recherche === '' ? '' : `?${recherche}`);
  const [cle, setCle] = useState(0);
  const attendue = useRef<string | null>(null);
  const actuelleRef = useRef(actuelle);

  useEffect(() => {
    const surDemande = (e: Event): void => {
      const cible = (e as CustomEvent<string>).detail;
      if (cible === actuelleRef.current) { attendue.current = null; setCle((n) => n + 1); }
      else attendue.current = cible;
    };
    window.addEventListener(EVT_ACCUEIL_TUILE, surDemande);
    return () => window.removeEventListener(EVT_ACCUEIL_TUILE, surDemande);
  }, []);
  useEffect(() => {
    actuelleRef.current = actuelle;
    if (attendue.current !== null && attendue.current === actuelle) { attendue.current = null; setCle((n) => n + 1); }
  }, [actuelle]);

  return <Fragment key={cle}>{children}</Fragment>;
}
