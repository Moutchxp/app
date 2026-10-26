'use client';

import type { ReactNode } from 'react';
import { MENTION_SANS_430, QUESTION_RENTRE_OCCUPE } from '../../../../lib/location/rentreOccupe';

/**
 * ══ 🔴🔴 « LE BIEN EST-IL LOUÉ AU MOMENT DE LA PRISE EN GESTION ? » (Arno, 26/10/2026, migration 430) ════════════════════════════════
 * Sous « Statut du bien » de « Nouveau bien » (et dans « Nouveau propriétaire »), pour un bien EN GESTION : Oui / Non, obligatoire
 * (« Reste à renseigner »). Oui ouvre la DATE DU MANDAT DE GESTION — la date d'entrée de la gestion dans le suivi —, pré-remplie au jour
 * de la saisie, modifiable ; le formulaire « Nouveau locataire » s'ouvrira ensuite pour le locataire en place. Non : rien ne change.
 * Sans la migration 430 : la question est montrée, inactive, avec la mention « disponible après la mise à jour ».
 * Cibles de 44 px (les gros boutons de l'écran), rien au seul survol.
 */
export function QuestionRentreOccupe({ valeur, onChoix, dateMandat, onDateMandat, disponible, aujourdhui, manque, memeQueMandat = false }: {
  valeur: boolean | null;
  onChoix: (oui: boolean) => void;
  dateMandat: string;
  onDateMandat: (d: string) => void;
  disponible: boolean;
  aujourdhui: string;
  manque?: ReactNode;
  /** La date est celle du « Mandat de gestion » juste au-dessus (le même champ, la même valeur). */
  memeQueMandat?: boolean;
}) {
  return (
    <fieldset className="loc-rentre-occupe" data-rentre-occupe disabled={!disponible}>
      <legend>{QUESTION_RENTRE_OCCUPE} <span className="loc-oblig">*</span></legend>
      <div className="loc-gros-boutons loc-oui-non" role="group" aria-label={QUESTION_RENTRE_OCCUPE}>
        <button type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={valeur === true} data-rentre-occupe-choix="oui"
          onClick={() => onChoix(true)}>{valeur === true ? '✓ Oui, loué' : 'Oui, loué'}</button>
        <button type="button" className="loc-gros-bouton loc-gros-bouton--centre" aria-pressed={valeur === false} data-rentre-occupe-choix="non"
          onClick={() => onChoix(false)}>{valeur === false ? '✓ Non, vide' : 'Non, vide'}</button>
      </div>
      {!disponible && <p className="loc-muet" role="status" data-rentre-occupe-sans-430>{MENTION_SANS_430}</p>}
      {disponible && valeur === true && (
        <div className="loc-rentre-occupe-oui" data-rentre-occupe-oui>
          <label className="loc-champ">Date du mandat de gestion <span className="loc-oblig">*</span>
            <input type="date" value={dateMandat} max={aujourdhui} onChange={(e) => onDateMandat(e.target.value)} data-date-mandat-occupe /></label>
          <p className="loc-muet">
            La gestion entre dans le suivi (Nouvelles gestions, Biens en gestion, honoraires de gestion) à cette date
            {memeQueMandat ? ' — la même que la date de signature du mandat de gestion ci-dessus' : ''}. Après l’enregistrement du bien, le
            formulaire « Nouveau locataire » s’ouvre pour saisir le locataire en place, avec la date réelle de son bail : ce bail n’est pas
            un bail signé par l’agence (ni « Baux signés », ni honoraires de location).
          </p>
        </div>
      )}
      {manque}
    </fieldset>
  );
}

/** La feuille (jetons --color-svv-* seulement). */
export const CSS_RENTRE_OCCUPE = `
.loc-rentre-occupe{border:1px solid var(--color-svv-line);border-radius:14px;margin:16px 0 0;padding:12px 14px;min-width:0}
.loc-rentre-occupe legend{font-weight:800;padding:0 4px;color:var(--color-svv-ink)}
.loc-rentre-occupe-oui{margin-top:12px;display:grid;gap:8px;max-width:28rem}
.loc-rentre-occupe-oui input[type=date]{min-height:44px}
`;
