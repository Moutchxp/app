'use client';

import { useEffect, useRef, useState } from 'react';
import { DUREE_FETE_S, FeteChampagne } from '../../../../lib/location/feteChampagne';

/**
 * ══ 🔴🔴 LA FÊTE DU « OUI » — MAQUETTE « A+ » VALIDÉE PAR ARNO (18/10/2026), qui REMPLACE la première animation ═════════
 *
 * Bouton « Oui » de « Propriétaire(s) en gestion ? » : un <canvas> DANS le bouton (débordement masqué, sans pointeur, SOUS
 * le libellé « ✓ Oui »), dessiné par `lib/location/feteChampagne` (bouteille, bouchon, POP, flûtes qui trinquent,
 * étincelles, bulles, fondu) ; le libellé fait un petit rebond (0,85 → 1,12 → 1 en 0,5 s) et un reflet doré balaie le
 * bouton en 1,1 s. Durée totale 4 s ; jouée au seul PASSAGE à Oui (le parent la remonte par sa clé) ; aucune bibliothèque,
 * aucun son ; coupée si « réduire les animations ». Elle ne bloque rien : le bloc mandat s'affiche tout de suite.
 * Le style (`CSS_FETE`) est chargé par l'écran qui monte le bouton — aucun texte de plus dans le bouton.
 */
export const DUREE_FETE_MS = DUREE_FETE_S * 1000;

/** L'utilisateur a-t-il demandé de réduire les animations ? (lu à chaque fête : le réglage peut changer) */
export function mouvementReduit(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function FeteOui() {
  const [vivante, setVivante] = useState(() => !mouvementReduit());
  const toile = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!vivante) return;
    const fin = setTimeout(() => setVivante(false), DUREE_FETE_MS);
    const c = toile.current;
    let image = 0;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = c?.getContext('2d') ?? null; } catch { ctx = null; }
    if (c !== null && ctx !== null && typeof requestAnimationFrame === 'function') {
      // La toile à la taille réelle du bouton (et à la densité de l'écran) : les positions de la maquette en dépendent.
      const hote = c.parentElement?.parentElement ?? c;
      const w = Math.max(1, hote.clientWidth); const h = Math.max(1, hote.clientHeight);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const fete = new FeteChampagne(w, h);
      const depart = performance.now();
      const boucle = (maintenant: number): void => {
        const t = (maintenant - depart) / 1000;
        fete.avancer(Math.min(t, DUREE_FETE_S));
        fete.dessiner(ctx as CanvasRenderingContext2D);
        if (!fete.finie) image = requestAnimationFrame(boucle);
      };
      image = requestAnimationFrame(boucle);
    }
    return () => { clearTimeout(fin); if (image !== 0) cancelAnimationFrame(image); };
  }, [vivante]);
  if (!vivante) return null;
  return (
    <span className="fete" aria-hidden="true" data-fete>
      <canvas ref={toile} className="fete-toile" data-fete-toile />
      <span className="fete-reflet" />
    </span>
  );
}

/**
 * Tout est DANS le bouton (`.fete-hote` : relatif, débordement masqué) ; la toile SOUS le libellé (`.fete-texte` au-dessus).
 * Reflet : l'or du thème (`--color-svv-or`, celui de la maquette). Rebond du libellé tant que la fête est montée.
 */
export const CSS_FETE = `
.fete-hote{position:relative;overflow:hidden;isolation:isolate}
.fete-texte{position:relative;z-index:2;display:inline-block}
.fete-hote:has(.fete) .fete-texte{animation:feteRebond .5s ease-out}
.fete{position:absolute;inset:0;z-index:1;overflow:hidden;pointer-events:none;border-radius:inherit}
.fete-toile{position:absolute;inset:0;width:100%;height:100%;display:block}
.fete-reflet{position:absolute;top:0;bottom:0;left:0;width:45%;background:linear-gradient(100deg, transparent 0%, color-mix(in srgb, var(--color-svv-or) 60%, transparent) 50%, transparent 100%);transform:translateX(-120%);animation:feteReflet 1.1s ease-out forwards}
@keyframes feteRebond{0%{transform:scale(.85)}55%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes feteReflet{0%{transform:translateX(-120%);opacity:1}85%{opacity:1}100%{transform:translateX(260%);opacity:0}}
@media (prefers-reduced-motion: reduce){.fete{display:none}.fete-hote:has(.fete) .fete-texte{animation:none}}
`;
