'use client';

import { useRef } from 'react';
import { POSITIONS_PORTEE, positionActive, type PositionPortee } from '../../../../lib/gestion/porteeSuivi';

/**
 * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LA GLISSIÈRE À QUATRE POSITIONS ═══════════════════════════════
 *
 * DEMANDE D'ARNO (11/10/2026) : « Glissière horizontale avec un gros curseur déplaçable (glisser ou cliquer sur une
 * position), accessible au clavier (flèches). De gauche à droite : ① Origine ② One shot ③ Ce mail + futurs échanges
 * ④ Toute la conversation. »
 *
 * 🔴 UN SEUL ÉLÉMENT FOCALISABLE, `role="slider"`, comme une glissière native : ←/→ (et ↑/↓) changent de position,
 * Début/Fin vont aux extrémités. Une position GRISÉE (aucune modification) n'est jamais prise : la flèche s'arrête.
 * 🔴 LE CLIC et LE GLISSER passent par la même règle : la position la plus proche du point visé, si elle est active.
 * ⚠️ LA GLISSIÈRE NE DÉCIDE RIEN : elle DEMANDE (`onChoisir`). Le retour à ① avec des modifications en cours passe par
 * la confirmation de la fenêtre, qui seule sait ce qu'il y aurait à abandonner.
 */
export function GlissierePortee({ position, modification, onChoisir }: {
  position: PositionPortee;
  /** Y a-t-il une modification dans les blocs du dessus ? Sans elle, ②③④ sont grisées. */
  modification: boolean;
  onChoisir: (p: PositionPortee) => void;
}) {
  const piste = useRef<HTMLDivElement | null>(null);
  const glisse = useRef(false);
  const index = POSITIONS_PORTEE.findIndex((p) => p.cle === position);
  const n = POSITIONS_PORTEE.length;

  const choisirIndex = (i: number): void => {
    const p = POSITIONS_PORTEE[Math.max(0, Math.min(n - 1, i))];
    if (p !== undefined && positionActive(p.cle, modification) && p.cle !== position) onChoisir(p.cle);
  };
  const indexAuPoint = (clientX: number): number => {
    const r = piste.current?.getBoundingClientRect();
    if (r === undefined || r.width <= 0) return index;
    return Math.round(((clientX - r.left) / r.width) * (n - 1));
  };
  /** La flèche saute les positions grisées : elle va à la prochaine position ACTIVE dans ce sens, ou ne bouge pas. */
  const pas = (sens: 1 | -1): void => {
    for (let i = index + sens; i >= 0 && i < n; i += sens) {
      if (positionActive(POSITIONS_PORTEE[i].cle, modification)) { choisirIndex(i); return; }
    }
  };

  return (
    <div className="gpo">
      <div className="gpo-piste" ref={piste}
        onPointerDown={(e) => {
          glisse.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          choisirIndex(indexAuPoint(e.clientX));
        }}
        onPointerMove={(e) => { if (glisse.current) choisirIndex(indexAuPoint(e.clientX)); }}
        onPointerUp={() => { glisse.current = false; }}
        onPointerCancel={() => { glisse.current = false; }}>
        <div className="gpo-rail" aria-hidden="true" />
        {POSITIONS_PORTEE.map((p, i) => (
          <span key={p.cle} aria-hidden="true"
            className={`gpo-cran${positionActive(p.cle, modification) ? '' : ' gpo-cran--grise'}`}
            style={{ left: `${(i / (n - 1)) * 100}%` }} />
        ))}
        <div className="gpo-curseur" role="slider" tabIndex={0}
          aria-label="Portée du suivi de ce mail"
          aria-valuemin={1} aria-valuemax={n} aria-valuenow={index + 1}
          aria-valuetext={POSITIONS_PORTEE[index]?.libelle}
          style={{ left: `${(index / (n - 1)) * 100}%` }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); pas(1); }
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); pas(-1); }
            else if (e.key === 'Home') { e.preventDefault(); choisirIndex(0); }
            else if (e.key === 'End') {
              e.preventDefault();
              for (let i = n - 1; i >= 0; i -= 1) {
                if (positionActive(POSITIONS_PORTEE[i].cle, modification)) { choisirIndex(i); break; }
              }
            }
          }} />
      </div>
      {/* Les quatre libellés, sous la piste. Ce sont aussi des cibles de clic (cible tactile pleine). */}
      <ol className="gpo-libelles">
        {POSITIONS_PORTEE.map((p, i) => {
          const active = positionActive(p.cle, modification);
          return (
            <li key={p.cle}>
              <button type="button" tabIndex={-1} disabled={!active} aria-hidden="true"
                className={`gpo-libelle${p.cle === position ? ' gpo-libelle--choisi' : ''}`}
                onClick={() => choisirIndex(i)}>
                <span className="gpo-num">{['①', '②', '③', '④'][i]}</span> {p.libelle}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre). Cibles tactiles >= 44 px. */
export const CSS_GLISSIERE_PORTEE = `
.gpo{display:flex;flex-direction:column;gap:6px;min-width:0;padding:6px 18px 0}
.gpo-piste{position:relative;height:44px;touch-action:none;cursor:pointer}
.gpo-rail{position:absolute;left:0;right:0;top:50%;height:6px;margin-top:-3px;border-radius:999px;
  background:var(--color-svv-line-strong)}
.gpo-cran{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
  background:var(--color-svv-surface);border:2px solid var(--color-svv-ink)}
.gpo-cran--grise{border-color:var(--color-svv-line-strong);background:var(--color-svv-field)}
.gpo-curseur{position:absolute;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
  background:var(--color-svv-red);border:3px solid var(--color-svv-surface);
  box-shadow:0 2px 8px rgba(0,0,0,.28);cursor:grab;transition:left .15s ease-out}
.gpo-curseur:active{cursor:grabbing}
.gpo-curseur:focus-visible{outline:3px solid var(--color-svv-ink);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.gpo-curseur{transition:none}}
.gpo-libelles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin:0 -18px;padding:0;
  list-style:none}
.gpo-libelles li{display:flex;justify-content:center;min-width:0}
.gpo-libelle{min-height:44px;padding:2px 4px;font:inherit;font-size:.78rem;line-height:1.25;text-align:center;
  color:var(--color-svv-ink);background:transparent;border:0;border-radius:.4rem;cursor:pointer;overflow-wrap:anywhere}
.gpo-libelle--choisi{font-weight:700;color:var(--color-svv-red)}
.gpo-libelle:disabled{color:var(--color-svv-muted);opacity:.55;cursor:not-allowed}
.gpo-num{font-weight:700}
`;
