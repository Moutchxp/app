'use client';

import { CSS_SUIVI_COMMERCIAL } from './SuiviCommercial';
import { OrigineActivite } from './OrigineActivite';

/**
 * ══ 🔴 Arno (25/10/2026, 425) — BLOC 9 « ORIGINE DU CONTACT » DE LA FICHE DU BIEN, OUVERTE DEPUIS UNE LIGNE DU SUIVI DU MOIS ══════════
 * Sous « Statut du bien », et SEULEMENT depuis le Suivi : l'origine de la LOCATION de la ligne (la même donnée que le bloc 4), avec le même
 * composant que le Dossier de location (`OrigineActivite`) : en lecture avec « Modifier », puis la double validation (conséquences en
 * cascade, case « J'ai bien compris… »). Son enregistrement est INDÉPENDANT du bien (un bien incomplet ne le bloque pas) ; la modale reste
 * ouverte, la page se relit derrière. Ligne sans location : en lecture, « Dossier non rattaché ».
 */
export function BlocOrigineLocation({ activiteId, numero, origineLigne, onEnregistre, onAllerAuxCases }: {
  activiteId: number | null; numero: number;
  /** L'origine lue sur la ligne du Suivi (pour une ligne sans location : la lecture seule). */
  origineLigne: string;
  onEnregistre: () => void;
  /** Les cases « Relocation » / « Nouvelle gestion » vivent dans le Dossier de location : l'ouvrir. */
  onAllerAuxCases?: () => void;
}) {
  const titre = <h3 id="loc-b9"><span className="loc-num">{numero}</span>Origine du contact</h3>;
  if (activiteId === null) {
    return (
      <section className="loc-section" aria-labelledby="loc-b9" data-bloc-origine-location="lecture">
        {titre}
        <p className="loc-muet" data-origine-non-rattache>Dossier non rattaché — l’origine se lit ici sans se modifier : <strong>{origineLigne || 'à renseigner'}</strong>.</p>
      </section>
    );
  }
  return (
    // Un « Entrée » dans le bloc n'envoie jamais le formulaire du bien (l'origine a son propre bouton).
    <section className="loc-section" aria-labelledby="loc-b9" data-bloc-origine-location onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault(); }}>
      <style>{CSS_SUIVI_COMMERCIAL}</style>
      {titre}
      <p className="loc-muet" style={{ margin: '0 0 8px' }}>L’origine du contact de cette location (la même que dans le Dossier de location). Son enregistrement est indépendant du bien.</p>
      <OrigineActivite activiteId={activiteId} ecran="Fiche du bien (Suivi du mois)" onEnregistre={onEnregistre} {...(onAllerAuxCases ? { onAllerAuxCases } : {})} />
    </section>
  );
}
