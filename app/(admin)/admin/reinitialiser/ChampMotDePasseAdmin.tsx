'use client';

import { useState, type CSSProperties } from 'react';
import { ARIA_AFFICHER_MDP, ARIA_MASQUER_MDP } from '../../../espace/presentation';

/**
 * Un champ mot de passe avec SON œil (afficher / masquer) — le même dessin que celui de l'espace client (`espace/ChampMotDePasse`),
 * aux jetons de la page de connexion de l'administration ; relié à son libellé (`id`). Deux champs = deux yeux indépendants.
 */
const champ: CSSProperties = {
  width: '100%', minHeight: 44, padding: '.75rem', paddingRight: 48, fontSize: '1rem', color: 'var(--color-svv-ink)',
  background: 'var(--color-svv-surface)', border: '1px solid var(--color-svv-line)', borderRadius: '.75rem',
};
const oeil: CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--color-svv-muted)',
};

export function ChampMotDePasseAdmin({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [afficher, setAfficher] = useState(false);
  return (
    <div style={{ position: 'relative', marginBottom: 12 }}>
      <input id={id} type={afficher ? 'text' : 'password'} autoComplete="new-password" required value={value} onChange={(e) => onChange(e.target.value)} style={champ} />
      <button type="button" onClick={() => setAfficher((a) => !a)} aria-pressed={afficher} aria-label={afficher ? ARIA_MASQUER_MDP : ARIA_AFFICHER_MDP} style={oeil} data-oeil={id}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
          {afficher && <line x1="4" y1="4" x2="20" y2="20" />}
        </svg>
      </button>
    </div>
  );
}
