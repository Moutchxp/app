'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ARIA_AFFICHER_MDP, ARIA_MASQUER_MDP } from './presentation';

/**
 * Champ mot de passe PARTAGÉ (client) avec bouton-œil afficher/masquer. Extrait à l'IDENTIQUE de l'implémentation validée
 * de `reinitialiser/FormulaireNouveauMotDePasse.tsx` : une seule source pour connexion, réinitialisation et suppression de
 * compte → un seul comportement. Le parent contrôle la VALEUR (`value`/`onChange`) ; la VISIBILITÉ est un état INTERNE au
 * composant → deux champs = deux instances = deux états indépendants (afficher l'un ne révèle jamais l'autre). Par défaut le
 * type reste `password` : l'œil bascule uniquement l'affichage, rien d'autre. Aucune animation (prefers-reduced-motion sans objet).
 */

const styleInput: CSSProperties = {
  width: '100%', padding: '.75rem', minHeight: 44, fontSize: 16,
  borderRadius: '.6rem', border: '1px solid var(--color-svv-line)',
};
/** Champ mot de passe : réserve à droite la place de l'œil (padding droit) pour que le texte ne passe pas dessous. */
const styleChampMdp: CSSProperties = { ...styleInput, paddingRight: 48 };
/** Bouton-œil DANS le champ : pleine hauteur × 44px de large → cible tactile ≥ 44px, icône centrée, couleur de charte. */
const styleOeil: CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0, width: 44,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--color-svv-muted)',
};

/**
 * Icône œil monochrome (SVG inline, `currentColor`, aucune dépendance). `visible=true` (mot de passe affiché) → œil BARRÉ
 * (l'action au clic = masquer) ; sinon œil ouvert (action = afficher). `aria-hidden` : le sens est porté par l'aria-label
 * du bouton. Trait statique, aucune animation (prefers-reduced-motion sans objet).
 */
function IconeOeil({ visible }: { visible: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {visible && <line x1="4" y1="4" x2="20" y2="20" />}
    </svg>
  );
}

interface ChampMotDePasseProps {
  value: string;
  onChange: (valeur: string) => void;
  /** `current-password` (connexion/suppression) ou `new-password` (réinitialisation). */
  autoComplete: 'current-password' | 'new-password';
  /** Reproduit le champ d'origine : réinit + connexion l'ont ; suppression NON (la garde case+mdp gouverne). */
  required?: boolean;
}

export function ChampMotDePasse({ value, onChange, autoComplete, required }: ChampMotDePasseProps) {
  const [afficher, setAfficher] = useState(false); // visibilité PROPRE à ce champ (indépendante des autres instances)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={afficher ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="svv-input"
        style={styleChampMdp}
      />
      <button
        type="button"
        onClick={() => setAfficher((a) => !a)}
        aria-pressed={afficher}
        aria-label={afficher ? ARIA_MASQUER_MDP : ARIA_AFFICHER_MDP}
        style={styleOeil}
      >
        <IconeOeil visible={afficher} />
      </button>
    </div>
  );
}
