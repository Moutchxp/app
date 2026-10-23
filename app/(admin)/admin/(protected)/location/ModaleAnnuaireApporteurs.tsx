'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';
import { CSS_ONGLETS_SUIVI, OngletApporteurs } from './OngletsSuivi';
import { CSS_PARAMETRES } from './ParametresLocation';

/**
 * ══ 🔴 Arno (24/10/2026) — L'ANNUAIRE DES APPORTEURS EN MODALE, DEPUIS « NOUVEAU LOCATAIRE » ═════════════════════════════════════
 * « Un bouton “Ouvrir l'annuaire” ouvre une modale centrée qui affiche l'annuaire des apporteurs COMPLET, avec toutes ses
 * fonctionnalités, en réutilisant EXACTEMENT le composant de l'annuaire existant (pas de copie, même base). Un apporteur créé ou
 * rattaché dans la modale est immédiatement disponible […] et peut être sélectionné directement depuis la modale (“Choisir cet
 * apporteur”), ce qui ferme la modale. »
 * C'est `OngletApporteurs` — le même que l'onglet « Apporteurs » de la roue « Paramètres Location » —, dans la même fenêtre
 * (`plo-voile` / `plo-fenetre`) ; seul `onChoisir` s'y ajoute. Fermer (×, Échap, clic à côté) relit la liste du champ.
 */
export function ModaleAnnuaireApporteurs({ onChoisir, onFermer }: { onChoisir: (a: Apporteur) => void; onFermer: () => void }) {
  const titre = useId();
  const fermerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { fermerRef.current?.focus(); }, []);
  const fermer = useCallback(() => onFermer(), [onFermer]);
  useEffect(() => {
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') fermer(); };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [fermer]);
  return (
    <div className="plo-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <style>{CSS_PARAMETRES + CSS_ONGLETS_SUIVI}</style>
      <div className="plo-fenetre" role="dialog" aria-modal="true" aria-labelledby={titre} data-modale-annuaire-apporteurs>
        <header className="plo-tete">
          <h2 id={titre}>Annuaire des apporteurs</h2>
          <button ref={fermerRef} type="button" className="plo-x" aria-label="Fermer" onClick={fermer}>×</button>
        </header>
        <div className="plo-corps">
          <OngletApporteurs onChoisir={onChoisir} />
        </div>
        <footer className="plo-pied">
          <div className="plo-boutons">
            <button type="button" className="svv-btn svv-btn-outline gst-btn" onClick={fermer} data-fermer-annuaire>Fermer</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
