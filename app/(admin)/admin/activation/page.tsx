'use client';

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';

/**
 * Activation d'un compte par le lien du mail d'invitation (lot GESTION-INVITATION-ADMIN, 16/10/2026). PUBLIQUE : la
 * personne choisit son mot de passe (deux fois), puis se connecte. L'ouverture du lien ne fait qu'une LECTURE.
 * Calquée sur la page de connexion (mêmes jetons de charte).
 */
const champ: CSSProperties = {
  width: '100%', minHeight: 44, padding: '.75rem', fontSize: '1rem', color: 'var(--color-svv-ink)',
  background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.75rem', marginBottom: 12,
};
const LONGUEUR_MIN = 12; // = LONGUEUR_MIN_MOT_DE_PASSE (revérifiée par le serveur)

type Etat = { sorte: 'chargement' } | { sorte: 'formulaire'; prenom: string; identifiant: string } | { sorte: 'refus'; message: string } | { sorte: 'active'; identifiant: string };

export default function ActivationPage() {
  const [etat, setEtat] = useState<Etat>({ sorte: 'chargement' });
  const [mdp, setMdp] = useState('');
  const [mdp2, setMdp2] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const jeton = useRef('');

  useEffect(() => {
    jeton.current = new URLSearchParams(window.location.search).get('j') ?? '';
    void (async () => {
      try {
        const r = await (await fetch(`/api/admin/activation?j=${encodeURIComponent(jeton.current)}`, { cache: 'no-store' })).json();
        setEtat(r?.ok ? { sorte: 'formulaire', prenom: r.prenom ?? '', identifiant: r.identifiant ?? '' } : { sorte: 'refus', message: r?.message ?? 'Ce lien n’est pas valable.' });
      } catch {
        setEtat({ sorte: 'refus', message: 'Le lien n’a pas pu être vérifié (réseau). Réessayez dans un instant.' });
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    if (mdp.length < LONGUEUR_MIN) { setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`); return; }
    if (mdp !== mdp2) { setErreur('La confirmation ne correspond pas.'); return; }
    setEnCours(true);
    try {
      const res = await fetch('/api/admin/activation', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jeton: jeton.current, motDePasse: mdp, confirmation: mdp2 }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok) setEtat({ sorte: 'active', identifiant: b.identifiant ?? '' });
      else if (res.status === 409) setEtat({ sorte: 'refus', message: b.erreur ?? 'Ce lien ne peut plus servir.' });
      else setErreur(b.erreur ?? 'Activation impossible. Réessayez dans un instant.');
    } catch {
      setErreur('Activation impossible (réseau). Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="svv-card" style={{ width: '100%', maxWidth: 360 }}>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>Activer votre compte</h1>
        <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: '0 0 16px' }}>Administration — Sans Vis-à-Vis®</p>

        {etat.sorte === 'chargement' && <p style={{ color: 'var(--color-svv-muted)' }}>Vérification du lien…</p>}

        {etat.sorte === 'refus' && (
          <>
            <p role="alert" style={{ color: 'var(--color-svv-ink)', margin: '0 0 12px' }}>{etat.message}</p>
            <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: 0 }}>Rien n’a été modifié.</p>
            <a href="/admin/login" className="svv-btn svv-btn-outline" style={{ marginTop: 16, minHeight: 44, textDecoration: 'none' }}>Aller à la connexion</a>
          </>
        )}

        {etat.sorte === 'active' && (
          <>
            <p style={{ color: 'var(--color-svv-ink)', margin: '0 0 12px' }}>Votre compte est activé. Connectez-vous avec <strong>{etat.identifiant}</strong> et le mot de passe que vous venez de choisir.</p>
            <a href="/admin/login" className="svv-btn svv-btn-primary" style={{ minHeight: 44, textDecoration: 'none' }}>Se connecter</a>
          </>
        )}

        {etat.sorte === 'formulaire' && (
          <form onSubmit={onSubmit}>
            <p style={{ color: 'var(--color-svv-ink)', margin: '0 0 12px' }}>
              Bonjour {etat.prenom}, choisissez votre mot de passe pour <strong>{etat.identifiant}</strong>.
            </p>
            <label htmlFor="act-mdp" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>Mot de passe (au moins {LONGUEUR_MIN} caractères)</label>
            <input id="act-mdp" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required style={champ} />
            <label htmlFor="act-mdp2" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>Confirmez le mot de passe</label>
            <input id="act-mdp2" type="password" autoComplete="new-password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} required style={champ} />
            {erreur && <p role="alert" style={{ color: 'var(--color-svv-red)', fontSize: '.85rem', margin: '0 0 12px' }}>{erreur}</p>}
            <button type="submit" className="svv-btn svv-btn-primary" disabled={enCours} style={{ minHeight: 44 }}>
              {enCours ? 'Activation…' : 'Activer mon compte'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
