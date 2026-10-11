'use client';

import { useEffect, useRef } from 'react';
import { POSITIONS_PORTEE, positionActive, type PositionPortee } from '../../../../lib/gestion/porteeSuivi';

/**
 * ══ 🔴🔴 LOT MODALE-MODIFIER-RATTACHEMENT-4-POSITIONS — LA GLISSIÈRE À QUATRE POSITIONS ═══════════════════════════════
 *
 * DEMANDE D'ARNO (11/10/2026) : « Glissière horizontale avec un gros curseur déplaçable (glisser ou cliquer sur une
 * position), accessible au clavier (flèches). De gauche à droite : Origine, One shot, Ce mail + futurs échanges, Toute
 * la conversation. »
 *
 * ══ 🔴🔴 LOT GLISSIERE-PILULE — LE DESSIN « PILULE » (Arno, 11/10/2026) ════════════════════════════════════════════
 * Comportement INCHANGÉ (mêmes positions, même ordre, même logique) ; seul le dessin change : grosse piste arrondie
 * (~64 px, fond gris très clair, contour 3 px couleur du texte), curseur en pilule rouge (#FA5252, ~104 × 50 px, contour
 * 3 px et ombre dure vers le bas couleur du texte, petit losange blanc au centre), un repère gris de 12 px à chaque
 * position, glissement avec léger rebond ; libellés EXACTEMENT centrés sous leur repère (≈ 140 px, retour à la ligne
 * permis), sans numéro, 16 px ; le libellé actif en rouge gras sur pastille rouge très pâle.
 *
 * 🔴 ACCESSIBILITÉ (Arno : « role="radiogroup" / aria-checked conservés ou ajoutés ») : les quatre libellés sont les
 * boutons radio d'un groupe ; un seul est dans l'ordre de tabulation (celui qui est choisi), ←/→ (et ↑/↓) changent de
 * position, Début/Fin vont aux extrémités. Une position GRISÉE (aucune modification) n'est jamais prise : la flèche
 * saute à la prochaine position active, ou s'arrête.
 * 🔴 LE CLIC (repère, libellé ou piste) et LE GLISSER passent par la même règle : la position la plus proche du point
 * visé, si elle est active.
 * ⚠️ LA GLISSIÈRE NE DÉCIDE RIEN : elle DEMANDE (`onChoisir`). Le retour à Origine avec des modifications en cours passe
 * par la confirmation de la fenêtre, qui seule sait ce qu'il y aurait à abandonner.
 */

/**
 * Le retrait des positions extrêmes depuis le bord EXTÉRIEUR de la piste, en px. ⚠️ Il doit valoir au moins la
 * demi-largeur du curseur (52 px) pour que la pilule tienne dans la piste aux deux bouts (Arno) : 60 px.
 * Sur petit écran, la feuille le réduit avec le curseur (`--gpo-retrait`) : la souris le relit là, jamais en double.
 */
const RETRAIT_PX = 60;
const retraitDe = (e: Element): number => {
  const v = Number.parseFloat(getComputedStyle(e).getPropertyValue('--gpo-retrait'));
  return Number.isFinite(v) ? v : RETRAIT_PX;
};

export function GlissierePortee({ position, modification, onChoisir }: {
  position: PositionPortee;
  /** Y a-t-il une modification dans les blocs du dessus ? Sans elle, les trois autres positions sont grisées. */
  modification: boolean;
  onChoisir: (p: PositionPortee) => void;
}) {
  const piste = useRef<HTMLDivElement | null>(null);
  const groupe = useRef<HTMLDivElement | null>(null);
  const glisse = useRef(false);
  /** Le clavier a-t-il demandé ce changement ? Alors le focus suit le bouton choisi (radio « itinérant »). */
  const auClavier = useRef(false);
  const index = POSITIONS_PORTEE.findIndex((p) => p.cle === position);
  const n = POSITIONS_PORTEE.length;

  useEffect(() => {
    if (!auClavier.current) return;
    auClavier.current = false;
    groupe.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, [position]);

  const choisirIndex = (i: number): void => {
    const p = POSITIONS_PORTEE[Math.max(0, Math.min(n - 1, i))];
    if (p !== undefined && positionActive(p.cle, modification) && p.cle !== position) onChoisir(p.cle);
  };
  const indexAuPoint = (clientX: number): number => {
    const e = piste.current;
    if (e === null) return index;
    const r = e.getBoundingClientRect();
    const retrait = retraitDe(e);
    const utile = r.width - 2 * retrait;
    if (utile <= 0) return index;
    return Math.round(((clientX - r.left - retrait) / utile) * (n - 1));
  };
  /** La flèche saute les positions grisées : elle va à la prochaine position ACTIVE dans ce sens, ou ne bouge pas. */
  const pas = (sens: 1 | -1): void => {
    for (let i = index + sens; i >= 0 && i < n; i += sens) {
      if (positionActive(POSITIONS_PORTEE[i].cle, modification)) { auClavier.current = true; choisirIndex(i); return; }
    }
  };
  /** La place d'une position sur la piste : de 0 (Origine) à 1 (Toute la conversation). */
  const fraction = (i: number): string => String(i / (n - 1));

  return (
    <div className="gpo">
      <div className="gpo-piste" ref={piste} aria-hidden="true"
        onPointerDown={(e) => {
          glisse.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          choisirIndex(indexAuPoint(e.clientX));
        }}
        onPointerMove={(e) => { if (glisse.current) choisirIndex(indexAuPoint(e.clientX)); }}
        onPointerUp={() => { glisse.current = false; }}
        onPointerCancel={() => { glisse.current = false; }}>
        {POSITIONS_PORTEE.map((p, i) => (
          <span key={p.cle}
            className={`gpo-cran${positionActive(p.cle, modification) ? '' : ' gpo-cran--grise'}`}
            style={{ ['--gpo-x' as string]: fraction(i) }} />
        ))}
        <div className="gpo-curseur" style={{ ['--gpo-x' as string]: fraction(Math.max(0, index)) }}>
          <span className="gpo-losange" />
        </div>
      </div>
      {/* Les quatre libellés, centrés sous leur repère : ce sont les boutons radio du groupe (cibles tactiles pleines). */}
      <div className="gpo-libelles" role="radiogroup" aria-label="Portée du suivi de ce mail" ref={groupe}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pas(1); }
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pas(-1); }
          else if (e.key === 'Home') { e.preventDefault(); auClavier.current = true; choisirIndex(0); }
          else if (e.key === 'End') {
            e.preventDefault();
            for (let i = n - 1; i >= 0; i -= 1) {
              if (positionActive(POSITIONS_PORTEE[i].cle, modification)) { auClavier.current = true; choisirIndex(i); break; }
            }
          }
        }}>
        {POSITIONS_PORTEE.map((p, i) => {
          const active = positionActive(p.cle, modification);
          const choisi = p.cle === position;
          return (
            <button key={p.cle} type="button" role="radio" aria-checked={choisi} tabIndex={choisi ? 0 : -1}
              disabled={!active}
              className={`gpo-libelle${choisi ? ' gpo-libelle--choisi' : ''}`}
              style={{ ['--gpo-x' as string]: fraction(i) }}
              onClick={() => choisirIndex(i)}>
              {p.libelle}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL. Couleurs : jetons seulement (Clair et Sombre), SAUF le rouge du curseur
   (#FA5252, demande d'Arno) et son losange blanc, qui font partie du curseur dans les deux themes.
   LA GEOMETRIE : une position i est a  retrait + x * (largeur - 2 * retrait), x = i / 3 (variable --gpo-x). Les
   pourcentages se lisent sur la largeur du bloc qui contient (la piste, ou la rangee des libelles : meme largeur). */
export const CSS_GLISSIERE_PORTEE = `
.gpo{--gpo-retrait:${RETRAIT_PX}px;display:flex;flex-direction:column;gap:10px;min-width:0;padding:6px 0 0}
.gpo-piste{position:relative;height:64px;box-sizing:border-box;border:3px solid var(--color-svv-ink);
  border-radius:999px;background:var(--color-svv-field);touch-action:none;cursor:pointer}
.gpo-cran{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;
  left:calc(var(--gpo-retrait) - 3px + var(--gpo-x) * (100% + 6px - 2 * var(--gpo-retrait)));
  transform:translate(-50%,-50%);background:var(--color-svv-line-strong-hover)}
.gpo-cran--grise{opacity:.45}
.gpo-curseur{position:absolute;top:50%;width:104px;height:50px;box-sizing:border-box;border-radius:999px;
  left:calc(var(--gpo-retrait) - 3px + var(--gpo-x) * (100% + 6px - 2 * var(--gpo-retrait)));
  transform:translate(-50%,calc(-50% - 2px));background:#FA5252;border:3px solid var(--color-svv-ink);
  box-shadow:0 5px 0 var(--color-svv-ink);cursor:grab;transition:left .42s cubic-bezier(.34,1.56,.64,1)}
.gpo-curseur:active{cursor:grabbing}
.gpo-losange{position:absolute;top:50%;left:50%;width:10px;height:10px;background:#fff;
  transform:translate(-50%,-50%) rotate(45deg);border-radius:1px}
@media (prefers-reduced-motion:reduce){.gpo-curseur{transition:none}}
.gpo-libelles{display:grid;min-width:0}
.gpo-libelle{--gpo-l:min(140px, calc((100% - 2 * var(--gpo-retrait)) / 3 - 6px));grid-area:1/1;justify-self:start;
  align-self:start;width:var(--gpo-l);box-sizing:border-box;min-height:44px;padding:4px 6px;
  margin-left:calc(var(--gpo-retrait) + var(--gpo-x) * (100% - 2 * var(--gpo-retrait)) - var(--gpo-l) / 2);
  font:inherit;font-size:16px;line-height:1.25;text-align:center;color:var(--color-svv-gray);background:transparent;
  border:0;border-radius:.6rem;cursor:pointer;overflow-wrap:anywhere}
.gpo-libelle--choisi{font-weight:700;color:var(--color-svv-red);background:var(--color-svv-red-soft)}
.gpo-libelle:disabled{color:var(--color-svv-muted);opacity:.55;cursor:not-allowed}
.gpo-libelle:focus-visible{outline:3px solid var(--color-svv-ink);outline-offset:2px}
/* PETIT ECRAN (telephone) : quatre libelles de 140 px ne tiennent pas cote a cote. Ils restent EXACTEMENT centres sous
   leur repere et en 16 px, mais sur deux rangees decalees (Origine et Ce mail + futurs echanges en haut, One shot et
   Toute la conversation dessous) : chacun dispose ainsi de deux intervalles. Le curseur et son retrait raccourcissent
   pour garder de la place entre les reperes, la pilule tenant toujours dans la piste. */
@media (max-width:560px){
  .gpo{--gpo-retrait:46px}
  .gpo-curseur{width:80px;height:42px}
  .gpo-libelle{--gpo-l:min(140px, calc((100% - 2 * var(--gpo-retrait)) * 2 / 3 - 6px))}
  .gpo-libelle:nth-child(even){grid-area:2/1}
}
`;
