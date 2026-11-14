'use client';

import { useEffect } from 'react';
import { estReprise, sansReprise } from '../../../../lib/admin/retourConnexion';

/**
 * 🔴 Arno (14/11/2026) — la page atteinte par le retour automatique de la connexion porte `reprise=1` (la marque qui empêche toute boucle) :
 * une fois arrivé, la marque est retirée de l'adresse (sans recharger), pour qu'un lien copié ou un rechargement reparte de zéro.
 */
export function EffacerReprise() {
  useEffect(() => {
    try {
      const ici = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (estReprise(ici)) window.history.replaceState(window.history.state, '', sansReprise(ici));
    } catch { /* sans adresse lisible : rien */ }
  }, []);
  return null;
}
