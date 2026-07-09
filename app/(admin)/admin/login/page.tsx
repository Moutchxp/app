'use client';

import { useState, type FormEvent } from 'react';

export default function AdminLoginPage() {
  const [identifiant, setIdentifiant] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Identifiant vide = voie de secours (ancien mot de passe partagé) tant que M3-5 n'a pas basculé.
        body: JSON.stringify({ identifiant, password }),
      });
      if (res.ok) {
        window.location.assign('/admin');
        return;
      }
      // Message générique quel que soit le motif (EX-20).
      setErreur('Identifiants invalides.');
    } catch {
      setErreur('Identifiants invalides.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div className="svv-card" style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>
          Administration
        </h1>
        <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: '0 0 16px' }}>
          Accès réservé — Sans Vis-à-Vis®
        </p>

        <form onSubmit={onSubmit}>
          <label htmlFor="admin-identifiant" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>
            Identifiant
          </label>
          <input
            id="admin-identifiant"
            name="identifiant"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            style={{
              width: '100%',
              minHeight: 44,
              padding: '.75rem',
              fontSize: '1rem',
              color: 'var(--color-svv-ink)',
              background: '#fff',
              border: '1px solid var(--color-svv-line)',
              borderRadius: '.75rem',
              marginBottom: 12,
            }}
          />

          <label htmlFor="admin-password" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>
            Mot de passe
          </label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              minHeight: 44,
              padding: '.75rem',
              fontSize: '1rem',
              color: 'var(--color-svv-ink)',
              background: '#fff',
              border: '1px solid var(--color-svv-line)',
              borderRadius: '.75rem',
              marginBottom: 12,
            }}
          />

          {erreur && (
            <p role="alert" style={{ color: 'var(--color-svv-red)', fontSize: '.85rem', margin: '0 0 12px' }}>
              {erreur}
            </p>
          )}

          <button type="submit" className="svv-btn svv-btn-primary" disabled={enCours} style={{ minHeight: 44 }}>
            {enCours ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </main>
  );
}
