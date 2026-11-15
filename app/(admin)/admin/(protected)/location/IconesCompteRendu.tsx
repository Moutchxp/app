/**
 * 🔴 Arno (15/11/2026) — LES ICÔNES DU COMPTE RENDU DE PRÉ-VISITE, dessinées comme celles de l'admin (`IconeVoie`, `BoutonsRepondre.tsx`) :
 * grille 24, trait `currentColor` de 1,8, extrémités arrondies, AUCUN emoji. L'icône ne porte jamais l'information seule : le mot est écrit à
 * côté, ou le bouton porte un `aria-label` (`aria-hidden` sur le dessin).
 */
export type NomIcone = 'micro' | 'clavier' | 'appareil' | 'images' | 'plus' | 'lecture' | 'pause' | 'corbeille' | 'texte' | 'entree' | 'soleil' | 'lune' | 'personne' | 'cible' | 'haut' | 'bas' | 'gauche' | 'droite' | 'coche';

export function Icone({ nom, taille = 20 }: { nom: NomIcone; taille?: number }) {
  const commun = { viewBox: '0 0 24 24', width: taille, height: taille, 'aria-hidden': true as const, focusable: false as const, className: 'pvv-icone',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (nom) {
    case 'micro': return <svg {...commun}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0" /><path d="M12 18v3" /><path d="M9 21h6" /></svg>;
    case 'clavier': return <svg {...commun}><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M18 13.5h.01M8.5 14.5h7" /></svg>;
    case 'appareil': return <svg {...commun}><path d="M4 8h3l1.6-2.4A1 1 0 019.4 5h5.2a1 1 0 01.8.6L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" /><circle cx="12" cy="13" r="3.5" /></svg>;
    case 'images': return <svg {...commun}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="M21 16l-5-5-8 8" /></svg>;
    case 'plus': return <svg {...commun}><path d="M12 5v14M5 12h14" /></svg>;
    case 'lecture': return <svg {...commun}><path d="M8 5.5v13l10.5-6.5L8 5.5z" /></svg>;
    case 'pause': return <svg {...commun}><path d="M9 5v14M15 5v14" /></svg>;
    case 'corbeille': return <svg {...commun}><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" /><path d="M9 7V4h6v3" /></svg>;
    case 'texte': return <svg {...commun}><path d="M4 6h16M4 11h16M4 16h10" /><path d="M17 15l2 2 3-4" /></svg>;
    case 'entree': return <svg {...commun}><path d="M20 5v6a3 3 0 01-3 3H5" /><path d="M9 10l-4 4 4 4" /></svg>;
    case 'soleil': return <svg {...commun}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case 'lune': return <svg {...commun}><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></svg>;
    case 'personne': return <svg {...commun}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></svg>;
    case 'cible': return <svg {...commun}><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></svg>;
    case 'haut': return <svg {...commun}><path d="M12 19V5" /><path d="M6 11l6-6 6 6" /></svg>;
    case 'bas': return <svg {...commun}><path d="M12 5v14" /><path d="M6 13l6 6 6-6" /></svg>;
    case 'gauche': return <svg {...commun}><path d="M15 6l-6 6 6 6" /></svg>;
    case 'droite': return <svg {...commun}><path d="M9 6l6 6-6 6" /></svg>;
    case 'coche': return <svg {...commun}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  }
}
