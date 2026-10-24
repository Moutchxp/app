'use client';

import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { FicheCommuneLocation } from '../gestion/FicheCommune';
import { ContexteEditionTracee, type EditionTracee } from '../gestion/editionTracee';
import { CSS_MODALE_CARACTERISTIQUES } from './ModaleCaracteristiquesBien';
import { BlocTraceFiche, CSS_TRACE_FICHE, TRACE_SUIVI, useTraceFiche } from './TraceFiche';

/**
 * ══ 🔴 Arno (24/10/2026) — « FICHE LOCATAIRE » EN GRANDE MODALE, DEPUIS « SUIVI DU MOIS » ═════════════════════════════════════════
 * La fiche EXISTANTE du locataire (la fiche commune Gestion / Location, `FicheCommuneLocation` → `Annuaire`, la même que la page
 * /admin/location/locataire/[id]) — aucune copie d'écran — dans la grande modale de « Caractéristiques du bien loué ». Elle écrit
 * dans la table SOURCE unique (l'annuaire), par le geste existant (`modifierPersonne` : contrôles, refus, verrous, journal).
 * Le contexte tracé ajoute : le récapitulatif des seuls champs modifiés avant d'enregistrer, le refus d'écraser une modification
 * faite par quelqu'un d'autre depuis l'ouverture, la session et l'écran au journal, « Dernière modification » et l'historique.
 * Une modification enregistrée referme la modale et relit la page (ligne, panneau, bas de feuille, autres cartes).
 */
export function ModaleFicheLocataire({ locataireId, libelle, onFermer, onEnregistre }: {
  locataireId: number; libelle: string; onFermer: () => void; onEnregistre: () => void;
}) {
  const titre = useId();
  const fenetre = useRef<HTMLDivElement | null>(null);
  const trace = useTraceFiche('locataire', locataireId);
  const fermer = useCallback(() => onFermer(), [onFermer]);
  useEffect(() => {
    // Échap referme — jamais quand une fenêtre est ouverte par-dessus (récapitulatif, alerte), ni pendant la saisie d'une carte.
    const clavier = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      if (fenetre.current?.querySelector('.cp-carte--edition') != null) return;
      fermer();
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [fermer]);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);
  const contexte = useMemo<EditionTracee>(() => ({ ecran: TRACE_SUIVI.ecran, depuisJournalId: trace.repere, onEnregistre }), [trace.repere, onEnregistre]);
  return (
    <div className="mcb-voile">
      <style>{CSS_MODALE_CARACTERISTIQUES + CSS_TRACE_FICHE + CSS_MODALE_LOCATAIRE}</style>
      <div className="mcb-fenetre" ref={fenetre} role="dialog" aria-modal="true" aria-labelledby={titre} data-modale-fiche-locataire={locataireId}>
        <div className="mfl-tete">
          <h2 id={titre} className="mfl-titre">Fiche locataire — {libelle}</h2>
          <button type="button" className="svv-btn svv-btn-outline gst-btn mfl-fermer" onClick={fermer} data-fermer-fiche-locataire>Fermer</button>
        </div>
        <section className="gst-page">
          <BlocTraceFiche trace={trace} />
          {trace.lu && (
            <ContexteEditionTracee.Provider value={contexte}>
              {/* Sans la barre « ← Retour | Annuaire | Chercher… » : dans la modale, « Retour » ferait quitter « Suivi du mois » (on
                  referme par « Fermer » ou Échap). La fiche elle-même est entière. */}
              <FicheCommuneLocation fiche={{ sorte: 'locataire', id: locataireId }} sansRetour sansBarreAnnuaire />
            </ContexteEditionTracee.Provider>
          )}
        </section>
      </div>
    </div>
  );
}

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. */
const CSS_MODALE_LOCATAIRE = `
.mfl-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:0 4px}
.mfl-titre{margin:0;font-size:1.15rem;font-weight:800;color:var(--color-svv-ink);overflow-wrap:anywhere}
.mfl-fermer{width:auto;min-height:44px;margin:0;flex:0 0 auto}
`;
