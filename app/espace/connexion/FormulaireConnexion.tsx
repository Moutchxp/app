'use client';

import { useState } from 'react';

/**
 * Formulaire de connexion internaute (client). POST `/api/internaute/auth/login` (Commit B) — au succès, le cookie de
 * session est posé par la route ; on navigue alors vers l'espace (rechargement complet → le composant serveur relit le
 * cookie frais). Message d'échec GÉNÉRIQUE, aligné sur la route (aucune fuite : e-mail, mot de passe et état du dossier
 * ne sont jamais distingués). Aucune animation (respect de prefers-reduced-motion).
 */
export function FormulaireConnexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch('/api/internaute/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, motDePasse }),
      });
      if (res.ok) {
        window.location.href = '/espace';
        return;
      }
      setErreur(res.status === 429 ? 'Trop de tentatives. Réessayez plus tard.' : 'Identifiants invalides.');
    } catch {
      setErreur('Connexion indisponible. Réessayez.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="svv-label">E-mail</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="svv-input"
          style={{ width: '100%', padding: '.75rem', borderRadius: '.6rem', border: '1px solid var(--color-svv-line)' }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="svv-label">Mot de passe</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="svv-input"
          style={{ width: '100%', padding: '.75rem', borderRadius: '.6rem', border: '1px solid var(--color-svv-line)' }}
        />
      </label>

      {erreur && (
        <p role="alert" className="svv-page-note" style={{ marginTop: 0 }}>
          {erreur}
        </p>
      )}

      <button type="submit" disabled={enCours} className="svv-btn svv-btn-primary" style={{ marginTop: '.25rem' }}>
        {enCours ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
