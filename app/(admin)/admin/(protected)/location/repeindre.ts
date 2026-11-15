import { useEffect } from 'react';

/**
 * 🔴🔴 Arno (15/11/2026, 9e retour du test iPhone) — LA PAGE BLANCHE JUSQU'AU DÉFILEMENT. Sur l'iPhone, la page s'affichait blanche à
 * l'ouverture (lien du mail, bouton de la frise) et au retour de l'arrière-plan, jusqu'au premier défilement. Le formulaire arrive APRÈS
 * le premier affichage (lecture du préavis, puis du brouillon) et le fond de la racine changeait par une règle « :has() » posée sur <html> :
 * Safari iOS garde alors à l'écran les tuiles peintes AVANT l'arrivée du contenu, et ne les repeint qu'au défilement. Correctif : plus
 * aucune règle « :has() » sur <html> / <body> / la racine (le fond y est posé en ligne, une fois), et la page est repeinte d'elle-même
 * quand le formulaire arrive, quand le brouillon est restauré, au retour de l'arrière-plan (visibilitychange, pageshow) — par le même geste
 * qu'un défilement (un pixel aller-retour, invisible), ce qui réveille l'affichage exactement comme le doigt le faisait.
 */
let enCours = false;
export function repeindre(): void {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function' || enCours) return;
  enCours = true; // deux repeintes ne se chevauchent jamais (la seconde lirait la position décalée d'un pixel et l'y laisserait)
  requestAnimationFrame(() => {
    const y = window.scrollY;
    const peut = document.documentElement.scrollHeight - window.innerHeight >= 1;
    try { window.scrollTo(window.scrollX, peut ? (y >= 1 ? y - 1 : y + 1) : y); } catch { /* rien */ }
    requestAnimationFrame(() => {
      try { window.scrollTo(window.scrollX, y); } catch { /* rien */ }
      enCours = false;
      document.documentElement.setAttribute('data-repeint', String(Date.now()));
    });
  });
}
export function useRepeindre(declencheur: unknown): void {
  useEffect(() => { repeindre(); }, [declencheur]);
  useEffect(() => {
    const visible = (): void => { if (document.visibilityState === 'visible') repeindre(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', repeindre);
    return () => { document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', repeindre); };
  }, []);
}
