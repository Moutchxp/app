'use client';

import { useState } from 'react';

/**
 * Bouton « Se déconnecter » (client) : POST /api/internaute/auth/logout (efface le cookie de session, route livrée au
 * Commit B), puis retour à la page de connexion. Sobre, aucune animation (respect implicite de prefers-reduced-motion).
 */
export function DeconnexionBouton() {
  const [enCours, setEnCours] = useState(false);

  async function deconnecter() {
    setEnCours(true);
    try {
      await fetch('/api/internaute/auth/logout', { method: 'POST' });
    } catch {
      /* best-effort : même si l'appel échoue, on renvoie vers la connexion */
    }
    window.location.href = '/espace/connexion';
  }

  return (
    <button
      type="button"
      onClick={deconnecter}
      disabled={enCours}
      className="svv-link"
      style={{ width: 'auto', padding: '.25rem 0', fontSize: '.8rem' }}
    >
      {enCours ? 'Déconnexion…' : 'Se déconnecter'}
    </button>
  );
}
