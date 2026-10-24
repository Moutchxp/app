'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { MESSAGE_DEMANDE } from '../../../lib/admin/reinitialisation';

/**
 * « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION — LA DEMANDE (Arno, 24/10/2026, migration 416). PUBLIQUE. Calquée sur la page de
 * connexion (mêmes jetons de charte, clair et sombre, téléphone). La réponse est TOUJOURS la même (`MESSAGE_DEMANDE`) : elle ne dit
 * jamais si l'adresse a un compte.
 */
const champ: CSSProperties = {
  width: '100%', minHeight: 44, padding: '.75rem', fontSize: '1rem', color: 'var(--color-svv-ink)',
  background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.75rem', marginBottom: 12,
};

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnCours(true);
    try {
      await fetch('/api/admin/reinitialiser/demander', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    } catch {
      /* même message : rien ne doit laisser deviner l'issue */
    } finally {
      setEnCours(false);
      setEnvoye(true);
    }
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="svv-card" style={{ width: '100%', maxWidth: 360 }} data-demande-reinitialisation>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>Mot de passe oublié</h1>
        <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: '0 0 16px' }}>Administration — Sans Vis-à-Vis®</p>
        {envoye ? (
          <>
            <p role="status" style={{ color: 'var(--color-svv-ink)', margin: '0 0 12px' }} data-message-demande>{MESSAGE_DEMANDE}</p>
            <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: 0 }}>Pensez à regarder dans les indésirables.</p>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <p style={{ color: 'var(--color-svv-ink)', margin: '0 0 12px', fontSize: '.95rem' }}>
              Saisissez l’adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.
            </p>
            <label htmlFor="mdpo-email" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>Adresse e-mail</label>
            <input id="mdpo-email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="prenom@exemple.fr" value={email} onChange={(e) => setEmail(e.target.value)} required style={champ} />
            <button type="submit" className="svv-btn svv-btn-primary" disabled={enCours} style={{ minHeight: 44 }}>
              {enCours ? 'Envoi…' : 'Recevoir le lien'}
            </button>
          </form>
        )}
        <a href="/admin/login" className="svv-link" style={{ minHeight: 44, textDecoration: 'none' }}>Retour à la connexion</a>
      </div>
    </main>
  );
}
