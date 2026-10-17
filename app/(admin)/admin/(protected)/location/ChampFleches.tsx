'use client';

import { useRef } from 'react';
import { etageEnNombre, etageAffiche, etagePossible, pasEtage, pasPieces, piecesPossible } from '../../../../lib/location/pasChamp';

/**
 * ══ 🔴🔴 TUILE LOCATION — « ÉTAGE » ET « NOMBRE DE PIÈCES » AVEC FLÈCHES ▲ ▼ (Arno, 18/10/2026) ════════════════════════
 *
 * « À droite du champ, deux petits boutons ▲ ▼ qui ajoutent / retirent 1 au clic. Étage : −5 à 60, 0 s'affiche “RDC”,
 * saisie manuelle toujours possible (texte libre conservé si non numérique). Pièces : minimum 1. Boutons ronds, style de la
 * tuile, accessibles au clavier. » Les boutons sont de vrais `<button type="button">` (Tab, Entrée, Espace), désactivés en
 * butée ; le texte saisi à la main n'est jamais réécrit, sauf « 0 » qui devient « RDC » en quittant le champ.
 */
export function ChampFleches({ sorte, libelle, valeur, onChange, placeholder, aide }: {
  sorte: 'etage' | 'pieces';
  libelle: React.ReactNode;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  aide?: string;
}) {
  const etage = sorte === 'etage';
  // La valeur COURANTE, tenue à jour dès le clic : deux clics rapides (avant le nouveau rendu) s'enchaînent sans se perdre.
  const courant = useRef(valeur);
  courant.current = valeur;
  const pas = (sens: 1 | -1): string => (etage ? pasEtage(courant.current, sens) : pasPieces(courant.current, sens));
  const poser = (v: string): void => { courant.current = v; onChange(v); };
  const possible = (sens: 1 | -1): boolean => (etage ? etagePossible(valeur, sens) : piecesPossible(valeur, sens));
  const mots = etage ? ['Monter d’un étage', 'Descendre d’un étage'] : ['Ajouter une pièce', 'Retirer une pièce'];
  return (
    <label className="loc-champ" data-champ-fleches={sorte}>{libelle}
      <span className="loc-fleches">
        <input value={valeur} placeholder={placeholder} inputMode={etage ? 'text' : 'numeric'}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => { if (etage && valeur.trim() === '0') onChange(etageAffiche(0)); }}
          onKeyDown={(e) => {
            // ↑ / ↓ au clavier, comme les flèches (sauf sur un texte libre, que l'on garde tel quel).
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (valeur.trim() === '' || (etage ? etageEnNombre(valeur) !== null : /^\d+$/.test(valeur.trim())))) {
              const sens = e.key === 'ArrowUp' ? 1 : -1;
              if (possible(sens)) { e.preventDefault(); poser(pas(sens)); }
            }
          }} />
        <span className="loc-fleches-boutons">
          <button type="button" className="loc-fleche" aria-label={mots[0]} title={mots[0]} disabled={!possible(1)} onClick={() => poser(pas(1))} data-fleche="haut">▲</button>
          <button type="button" className="loc-fleche" aria-label={mots[1]} title={mots[1]} disabled={!possible(-1)} onClick={() => poser(pas(-1))} data-fleche="bas">▼</button>
        </span>
      </span>
      {aide !== undefined && <small className="loc-aide">{aide}</small>}
    </label>
  );
}

export const CSS_CHAMP_FLECHES = `
.loc-fleches{display:flex;align-items:center;gap:8px;min-width:0}
.loc-fleches input{flex:1 1 auto;min-width:0}
.loc-fleches-boutons{display:flex;gap:6px;flex:0 0 auto}
.loc-fleche{width:44px;height:44px;border-radius:999px;border:2px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-size:.9rem;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}
.loc-fleche:hover:not(:disabled){border-color:var(--color-svv-ink)}
.loc-fleche:focus-visible{outline:3px solid var(--color-svv-red);outline-offset:2px}
.loc-fleche:disabled{opacity:.4;cursor:not-allowed}
`;
