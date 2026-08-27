'use client';

import { useState, type CSSProperties } from 'react';

/**
 * CADA lot A — bouton « Copier » PARTAGÉ (carte CADA + cartes de dépôt téléservice BlocDepot). Deux états visuels : jamais copié
 * / déjà copié. ⚠️ ACCESSIBILITÉ : l'état « déjà copié » ne repose PAS sur la seule couleur — il porte une COCHE « ✓ » + le mot
 * « Copié » + `aria-pressed`. Le rendu (BoutonCopierVue) est PUR et testable ; le wrapper client gère l'état + le presse-papiers.
 */

export interface ApparenceCopier { texte: string; ariaPressed: boolean; marque: boolean; disabled: boolean }

/**
 * Apparence PURE d'un bouton copier selon l'état — testable sans DOM. Marqué → `libelleMarque` (défaut « Copié ») ; sinon
 * `libelle`. Le mot PORTE l'information (jamais la seule couleur) ; la coche « ✓ » est un GLYPHE décoratif ajouté aria-hidden
 * par le rendu (jamais dans `texte`), pour ne pas doubler l'info pour un lecteur d'écran.
 */
export function apparenceBoutonCopier(marque: boolean, disabled: boolean, libelle: string, libelleMarque = 'Copié'): ApparenceCopier {
  return { texte: marque ? libelleMarque : libelle, ariaPressed: marque, marque, disabled };
}

const base: CSSProperties = { padding: '.3rem .7rem', minHeight: '2.1rem' };

/** Rendu PUR du bouton (présentationnel) : même apparence partout où il est utilisé. `onClick` piloté par le parent. */
export function BoutonCopierVue({ marque, disabled, libelle, libelleMarque, onClick }: {
  marque: boolean; disabled: boolean; libelle: string; libelleMarque?: string; onClick?: () => void;
}) {
  const a = apparenceBoutonCopier(marque, disabled, libelle, libelleMarque);
  return (
    <button type="button" disabled={a.disabled} aria-pressed={a.ariaPressed} onClick={onClick}
      className={`svv-btn ${a.marque ? 'svv-btn-primary' : 'svv-btn-outline'}`}
      style={a.marque
        ? { ...base, background: 'var(--color-svv-green-soft)', color: 'var(--color-svv-green-ink)', borderColor: 'var(--color-svv-green)' }
        : base}>
      {a.marque ? <span aria-hidden="true">✓ </span> : null}{a.texte}
    </button>
  );
}

/**
 * Bouton copier interactif. Copie `valeur` dans le presse-papiers, passe à l'état marqué (pastille + `libelleMarque`) et appelle
 * `onCopie` (pour tracer). `disabled` = champ sans donnée (rien à copier). L'état repart NON marqué à chaque MONTAGE.
 */
export function BoutonCopier({ valeur, libelle = 'Copier', libelleMarque, disabled = false, onCopie }: {
  valeur: string; libelle?: string; libelleMarque?: string; disabled?: boolean; onCopie?: () => void;
}) {
  const [marque, setMarque] = useState(false);
  const [echec, setEchec] = useState(false);

  async function copier(): Promise<void> {
    try {
      await navigator.clipboard.writeText(valeur);
      setMarque(true); setEchec(false);
      onCopie?.();
    } catch {
      setEchec(true);
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '.15rem' }}>
      <BoutonCopierVue marque={marque} disabled={disabled} libelle={libelle} libelleMarque={libelleMarque} onClick={() => void copier()} />
      {echec && <span role="status" style={{ fontSize: 11, color: 'var(--color-svv-red)' }}>Copie impossible — sélectionnez le texte à la main.</span>}
    </span>
  );
}
