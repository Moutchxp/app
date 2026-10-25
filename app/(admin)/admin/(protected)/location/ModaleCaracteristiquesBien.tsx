'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { ModifierFicheBien } from '../gestion/ModifierFicheBien';
import type { EcranTrace } from '../../../../lib/gestion/traceFiche';

/**
 * ══ 🔴 Arno (24/10/2026) — « CARACTÉRISTIQUES DU BIEN » EN GRANDE MODALE, DEPUIS « NOUVEAU LOCATAIRE » ═════════════════════════════
 * « Il ouvre une grande modale (quasi plein écran, défilable) qui affiche la page “Modifier le bien” existante (fiche bien unique,
 * d822613a) : même composant que la page “Ajouter un nouveau bien”, SANS le bloc 1 Propriétaire(s), pré-remplie […], modifiable
 * (surfaces comprises), avec ses boutons Annuler / Enregistrer les modifications et la modale de contre-validation habituelle. Pas
 * de copie du formulaire. »
 * C'est `ModifierFicheBien` — celui des pages /admin/location/bien/[id]/modifier et /admin/gestion/bien/[id]/modifier —, dans la même
 * `<section className="gst-page">`, en mode `modale` : « Annuler », Échap et « ← Nouveau locataire » referment sans rien écrire (avec
 * la question habituelle si la saisie a changé) ; l'enregistrement referme et prévient l'hôte, qui relit le bien.
 * Échap pendant la lecture de la fiche (formulaire pas encore là) referme aussi ; ensuite, c'est le formulaire qui le traite.
 */
export function ModaleCaracteristiquesBien({ lotId, onFermer, onEnregistre, trace, titre: titreVisible = 'Caractéristiques du bien loué', retourMot = 'Nouveau locataire', blocApres }: {
  lotId: number; onFermer: () => void; onEnregistre: () => void;
  /** 🔴 425 — depuis une ligne du Suivi du mois : le bloc 9 « Origine du contact » sous « Statut du bien ». */
  blocApres?: (numero: number) => React.ReactNode;
  /** 🔴 Arno (24/10/2026) — la MÊME modale ouverte depuis « Suivi du mois » (« Fiche du bien ») : l'écran tracé, son titre, son retour. */
  trace?: { ecran: EcranTrace }; titre?: string; retourMot?: string;
}) {
  const titre = useId();
  const fenetre = useRef<HTMLDivElement | null>(null);
  const fermer = useCallback(() => onFermer(), [onFermer]);
  useEffect(() => {
    // Le formulaire affiché traite Échap lui-même (« Annuler », avec la question si la saisie a changé) : on n'agit que tant qu'il
    // n'est pas là (lecture de la fiche, refus), et jamais quand une autre modale est ouverte par-dessus.
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      if (fenetre.current?.querySelector('form') != null) return;
      fermer();
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [fermer]);
  // La page derrière ne défile plus tant que la modale est ouverte.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);
  return (
    <div className="mcb-voile">
      <style>{CSS_MODALE_CARACTERISTIQUES}</style>
      <div className="mcb-fenetre" ref={fenetre} role="dialog" aria-modal="true" aria-labelledby={titre} data-modale-caracteristiques-bien={lotId}>
        <h2 id={titre} className="mcb-titre-cache">{titreVisible}</h2>
        <section className="gst-page">
          <ModifierFicheBien lotId={lotId} retour={{ href: `/admin/location/bien/${lotId}`, mot: retourMot }}
            modale={{ onFermer: fermer, onEnregistre }} {...(trace !== undefined ? { trace } : {})} {...(blocApres !== undefined ? { blocApres } : {})} />
        </section>
      </div>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. Quasi plein ecran, defilable ; sous les modales du formulaire (contre-validation : 90). */
export const CSS_MODALE_CARACTERISTIQUES = `
.mcb-voile{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.mcb-fenetre{position:relative;width:min(1240px,100%);height:100%;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:20px 16px 0;border-radius:22px;background:var(--color-svv-bg);box-shadow:0 30px 80px -30px color-mix(in srgb, var(--color-svv-ink) 50%, transparent)}
@media (max-width:640px){ .mcb-voile{padding:0} .mcb-fenetre{border-radius:0;padding:12px 0 0} }
.mcb-titre-cache{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:-1px;padding:0;border:0}
`;
