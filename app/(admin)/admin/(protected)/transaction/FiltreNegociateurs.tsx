'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MAX_NEGOCIATEURS } from './GrapheNegociateurs';

/**
 * ══ 🔴 LOT CU (Arno, 31/10/2026) — LE FILTRE « NÉGOCIATEUR » À CHOIX MULTIPLE ══════════════════════════════════════════════════════════════
 * « Tous » (défaut) ou de 1 à 5 PERSONNES (une entrée par personne, lot CQ) ; au-delà de 5, les autres entrées sont inactives (« 5 au maximum »).
 * Fermé : « Tous », « Antoine », « Antoine, Cédric JULLIEN », puis « 3 négociateurs ». « Tous » vide la sélection. Une vraie liste à choix
 * multiple (listbox `aria-multiselectable`) : flèches, Espace / Entrée pour cocher, Échap pour fermer ; le champ a l'allure des autres listes.
 */
export const libelleChoixNegociateurs = (choisis: readonly string[]): string =>
  choisis.length === 0 ? 'Tous' : choisis.length <= 2 ? choisis.join(', ') : `${choisis.length} négociateurs`;

export function FiltreNegociateurs({ personnes, choisis, onChange }: { personnes: readonly string[]; choisis: readonly string[]; onChange: (x: string[]) => void }) {
  const id = useId();
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const racine = useRef<HTMLDivElement | null>(null);
  const liste = useRef<HTMLUListElement | null>(null);
  const plein = choisis.length >= MAX_NEGOCIATEURS;
  // l'entrée 0 = « Tous » ; puis les personnes
  const entrees = ['', ...personnes];
  const inactive = (nom: string): boolean => nom !== '' && plein && !choisis.includes(nom);
  const basculer = (nom: string): void => {
    if (nom === '') { onChange([]); return; }
    if (choisis.includes(nom)) onChange(choisis.filter((x) => x !== nom));
    else if (!plein) onChange([...choisis, nom]);
  };
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e: MouseEvent): void => { if (racine.current !== null && !racine.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    liste.current?.focus();
    return () => document.removeEventListener('mousedown', dehors);
  }, [ouvert]);
  const clavier = (e: KeyboardEvent<HTMLUListElement>): void => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(entrees.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(0, a - 1)); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!inactive(entrees[actif])) basculer(entrees[actif]); }
    else if (e.key === 'Escape' || e.key === 'Tab') setOuvert(false);
  };
  return (
    <div className="lch trx-filtre-negos" ref={racine}>
      <button type="button" className="lch-champ" role="combobox" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={`${id}-liste`} aria-label={`Négociateur : ${libelleChoixNegociateurs(choisis)}`}
        onClick={() => setOuvert((o) => !o)} data-filtre="negociateur" data-valeur={choisis.join('|')}>
        <span className={choisis.length === 0 ? 'lch-vide' : undefined}>{libelleChoixNegociateurs(choisis)}</span>
        <svg className="lch-chevron" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </button>
      {ouvert && (
        <div className="lch-liste lch-panneau trx-filtre-negos-panneau" data-liste-choix>
          <ul role="listbox" id={`${id}-liste`} aria-label="Négociateurs (5 au maximum)" aria-multiselectable="true" tabIndex={-1} ref={liste} onKeyDown={clavier}
            aria-activedescendant={`${id}-${actif}`} className="lch-resultats trx-filtre-negos-liste">
            {entrees.map((nom, i) => {
              const coche = nom === '' ? choisis.length === 0 : choisis.includes(nom);
              return (
                <li key={nom || 'tous'} id={`${id}-${i}`} role="option" aria-selected={coche} aria-disabled={inactive(nom) || undefined} data-option={nom}
                  className={['lch-option', i === actif ? 'lch-option--actif' : '', coche ? 'lch-option--choisi' : '', inactive(nom) ? 'lch-option--desactive' : ''].filter(Boolean).join(' ')}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActif(i)} onClick={() => { if (!inactive(nom)) basculer(nom); }}>
                  <span className={`trx-case${coche ? ' trx-case--cochee' : ''}`} aria-hidden="true">{coche ? '✓' : ''}</span>{nom === '' ? 'Tous' : nom}
                </li>
              );
            })}
          </ul>
          <p className="loc-muet trx-filtre-negos-max" data-negociateurs-max={plein ? 'atteint' : undefined}>{plein ? '5 au maximum : décochez-en un pour en choisir un autre.' : '5 au maximum'}</p>
        </div>
      )}
    </div>
  );
}
