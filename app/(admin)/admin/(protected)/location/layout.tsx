import type { ReactNode } from 'react';
import { ConfirmationsEnregistrement } from './ConfirmationsEnregistrement';

/**
 * TUILE LOCATION — Arno (21/10/2026) : chaque enregistrement de la tuile se confirme par une modale (succès vert / erreur rouge),
 * le bouton passe à « Enregistrement… », un double clic n'écrit qu'une fois. L'hôte est monté ici, une fois pour toutes les pages.
 */
export default function LayoutLocation({ children }: { children: ReactNode }) {
  return (
    <>
      <ConfirmationsEnregistrement />
      {children}
    </>
  );
}
