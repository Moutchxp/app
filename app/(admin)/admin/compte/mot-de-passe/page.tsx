'use client';

import { useState, type FormEvent } from 'react';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '../../../../lib/admin/politiqueMdp';

/**
 * Écran de changement de mot de passe (M3-4 Lot B), self-service. Volontairement HORS du layout admin
 * (`(protected)`) : pas de barre latérale, AUCUN lien de fuite vers le reste de l'admin — tant que le mot de passe
 * n'est pas changé, l'utilisateur n'a rien d'autre à faire ici. Responsive mobile-first ; aucune animation
 * (prefers-reduced-motion respecté par construction). En cas de succès → retour à l'accueil admin.
 */
const CHAMP: React.CSSProperties = {
  width: '100%',
  minHeight: 44,
  padding: '.75rem',
  fontSize: '1rem',
  color: 'var(--color-svv-ink)',
  background: '#fff',
  border: '1px solid var(--color-svv-line)',
  borderRadius: '.75rem',
  marginBottom: 12,
};

export default function ChangementMotDePassePage() {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function deconnexion() {
    // Issue de secours : quitter cet écran sans changer (ou si le changement est impossible — compte révoqué).
    // Réutilise le mécanisme de déconnexion (toujours joignable, whitelisté par le proxy). Pas un lien vers
    // le reste de l'admin : on sort vers le login.
    try {
      await fetch('/api/admin/session', { method: 'DELETE' });
    } finally {
      window.location.assign('/admin/login');
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch('/api/admin/compte/mot-de-passe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ancien, nouveau, confirmation }),
      });
      if (res.ok) {
        window.location.assign('/admin');
        return;
      }
      const corps = await res.json().catch(() => ({}));
      setErreur(typeof corps?.erreur === 'string' ? corps.erreur : 'Changement refusé.');
    } catch {
      setErreur('Changement refusé.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="svv-card" style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>
          Changement de mot de passe requis
        </h1>
        <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: '0 0 16px' }}>
          Votre compte a été créé avec un mot de passe temporaire. Choisissez un nouveau mot de passe (au moins
          {` ${LONGUEUR_MIN_MOT_DE_PASSE} `}caractères) pour accéder à l’administration.
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor="mdp-ancien" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>
            Mot de passe actuel
          </label>
          <input
            id="mdp-ancien"
            name="ancien"
            type="password"
            autoComplete="current-password"
            value={ancien}
            onChange={(e) => setAncien(e.target.value)}
            required
            style={CHAMP}
          />

          <label htmlFor="mdp-nouveau" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>
            Nouveau mot de passe
          </label>
          <input
            id="mdp-nouveau"
            name="nouveau"
            type="password"
            autoComplete="new-password"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            required
            minLength={LONGUEUR_MIN_MOT_DE_PASSE}
            style={CHAMP}
          />

          <label htmlFor="mdp-confirmation" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>
            Confirmer le nouveau mot de passe
          </label>
          <input
            id="mdp-confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
            minLength={LONGUEUR_MIN_MOT_DE_PASSE}
            style={CHAMP}
          />

          {erreur && (
            <p role="alert" style={{ color: 'var(--color-svv-red)', fontSize: '.85rem', margin: '0 0 12px' }}>
              {erreur}
            </p>
          )}

          <button type="submit" className="svv-btn svv-btn-primary" disabled={enCours} style={{ minHeight: 44 }}>
            {enCours ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </form>

        <button
          type="button"
          onClick={deconnexion}
          style={{
            display: 'block',
            width: '100%',
            minHeight: 44,
            marginTop: 12,
            padding: '.5rem .75rem',
            border: '1px solid var(--color-svv-line)',
            borderRadius: '.75rem',
            background: '#fff',
            color: 'var(--color-svv-red)',
            fontWeight: 700,
            fontSize: '.9rem',
            cursor: 'pointer',
          }}
        >
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
