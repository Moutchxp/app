'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LONGUEUR_MIN_MOT_DE_PASSE } from '../../../lib/admin/politiqueMdp';
import { MESSAGE_LIEN_INVALIDE } from '../../../lib/admin/reinitialisation';
import { ChampMotDePasseAdmin } from './ChampMotDePasseAdmin';

/**
 * « MOT DE PASSE OUBLIÉ » DE L'ADMINISTRATION — LE NOUVEAU MOT DE PASSE (Arno, 24/10/2026, migration 416). PUBLIQUE : ouvrir le
 * lien ne fait qu'une LECTURE. Deux champs, chacun avec son œil ; la règle de « Changer mon mot de passe » (12 caractères au moins).
 * Choisi : toutes les autres sessions du compte sont fermées et la personne est connectée dans ce navigateur. Lien expiré, déjà
 * utilisé ou remplacé : « Ce lien n'est plus valide » et un bouton pour en redemander un.
 */
type Etat = { sorte: 'chargement' } | { sorte: 'formulaire'; identifiant: string } | { sorte: 'invalide' } | { sorte: 'fait' };

export default function ReinitialiserPage() {
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
        const r = await (await fetch(`/api/admin/reinitialiser?j=${encodeURIComponent(jeton.current)}`, { cache: 'no-store' })).json();
        setEtat(r?.ok ? { sorte: 'formulaire', identifiant: r.identifiant ?? '' } : { sorte: 'invalide' });
      } catch {
        setEtat({ sorte: 'invalide' });
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null);
    if (mdp.length < LONGUEUR_MIN_MOT_DE_PASSE) { setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`); return; }
    if (mdp !== mdp2) { setErreur('La confirmation ne correspond pas.'); return; }
    setEnCours(true);
    try {
      const res = await fetch('/api/admin/reinitialiser', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jeton: jeton.current, motDePasse: mdp, confirmation: mdp2 }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok) {
        setEtat({ sorte: 'fait' });
        window.location.assign(b.connecte === false ? '/admin/login' : '/admin');
      } else if (res.status === 409) setEtat({ sorte: 'invalide' });
      else setErreur(b.erreur ?? 'Enregistrement impossible. Réessayez dans un instant.');
    } catch {
      setErreur('Enregistrement impossible (réseau). Réessayez dans un instant.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="svv-card" style={{ width: '100%', maxWidth: 360 }} data-reinitialisation>
        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-svv-ink)', margin: '0 0 4px' }}>Nouveau mot de passe</h1>
        <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: '0 0 16px' }}>Administration — Sans Vis-à-Vis®</p>

        {etat.sorte === 'chargement' && <p style={{ color: 'var(--color-svv-muted)' }}>Vérification du lien…</p>}

        {etat.sorte === 'invalide' && (
          <>
            <p role="alert" style={{ color: 'var(--color-svv-ink)', margin: '0 0 12px' }} data-lien-invalide>{MESSAGE_LIEN_INVALIDE}</p>
            <p style={{ fontSize: '.85rem', color: 'var(--color-svv-muted)', margin: '0 0 16px' }}>Rien n’a été modifié. Un lien ne sert qu’une fois et n’est valable qu’une heure.</p>
            <a href="/admin/mot-de-passe-oublie" className="svv-btn svv-btn-primary" style={{ minHeight: 44, textDecoration: 'none' }} data-redemander>Demander un nouveau lien</a>
          </>
        )}

        {etat.sorte === 'fait' && <p role="status" style={{ color: 'var(--color-svv-ink)', margin: 0 }}>Mot de passe enregistré. Ouverture de votre session…</p>}

        {etat.sorte === 'formulaire' && (
          <form onSubmit={onSubmit}>
            <p style={{ color: 'var(--color-svv-ink)', margin: '0 0 12px' }}>Choisissez le nouveau mot de passe de <strong>{etat.identifiant}</strong>.</p>
            <label htmlFor="reinit-mdp" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>Nouveau mot de passe (au moins {LONGUEUR_MIN_MOT_DE_PASSE} caractères)</label>
            <ChampMotDePasseAdmin id="reinit-mdp" value={mdp} onChange={setMdp} />
            <label htmlFor="reinit-mdp2" className="svv-label" style={{ display: 'block', marginBottom: 6 }}>Confirmez le mot de passe</label>
            <ChampMotDePasseAdmin id="reinit-mdp2" value={mdp2} onChange={setMdp2} />
            {erreur && <p role="alert" style={{ color: 'var(--color-svv-red)', fontSize: '.85rem', margin: '0 0 12px' }}>{erreur}</p>}
            <button type="submit" className="svv-btn svv-btn-primary" disabled={enCours} style={{ minHeight: 44 }}>
              {enCours ? 'Enregistrement…' : 'Enregistrer et me connecter'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
