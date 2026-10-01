'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { LIBELLE_PASTILLE, resteEnDessous, sautDe } from '../../../../lib/gestion/defilement';

/**
 * ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — LA ZONE QUI DIT CE QU'ELLE CACHE ══════════════════════════
 *
 * DEMANDE D'ARNO : « une petite pastille ronde centrée avec une flèche vers le bas, posée sur un léger dégradé de
 * fondu du contenu. Pulsation lente et sobre : environ 2,4 s, légère variation d'opacité et d'échelle (1 → 1,06),
 * ease-in-out. Avec prefers-reduced-motion : pas de pulsation. Elle disparaît dès que le bas de la liste est
 * atteint, et réapparaît si on remonte. Un clic fait défiler en douceur d'environ une hauteur de zone. »
 *
 * 🔴 UN COMPOSANT, ET NON DEUX FOIS LE MÊME CODE. Deux listes en ont besoin — les propositions et les résultats de
 * recherche — et Arno les nomme toutes les deux. Écrire la pastille à deux endroits, c'est garantir qu'un jour
 * l'une des deux cessera de disparaître en bas.
 *
 * ⚠️ LA DÉCISION EST DANS UN MODULE PUR (`defilement`), pas ici : « le bas est-il atteint ? » est une question à
 * piège (hauteurs fractionnaires), et elle s'éprouve sans navigateur.
 */
export function ZoneDefilante({ className, enfants, as = 'div', ariaLabel }: {
  /** La classe de la zone défilante elle-même — celle qui porte déjà `max-height` et `overflow-y`. */
  className: string;
  enfants: ReactNode;
  /** `ul` pour une liste, `div` sinon : la pastille ne doit pas casser la sémantique de ce qu'elle surveille. */
  as?: 'div' | 'ul';
  ariaLabel?: string;
}) {
  const zone = useRef<HTMLDivElement & HTMLUListElement | null>(null);
  const [montre, setMontre] = useState(false);

  /**
   * 🔴 ON MESURE À TROIS MOMENTS, et les trois comptent : au défilement (évidemment), au redimensionnement de la
   * fenêtre, et quand le CONTENU change — une recherche qui rend trois résultats au lieu de quarante doit éteindre
   * la pastille sans qu'on ait touché la molette. `ResizeObserver` couvre le troisième cas, qu'aucun événement de
   * défilement n'annoncerait.
   */
  const mesurer = useCallback(() => {
    const e = zone.current;
    if (e === null) return;
    setMontre(resteEnDessous({
      scrollTop: e.scrollTop, scrollHeight: e.scrollHeight, clientHeight: e.clientHeight,
    }));
  }, []);

  useLayoutEffect(() => {
    const e = zone.current;
    if (e === null) return undefined;
    mesurer();
    e.addEventListener('scroll', mesurer, { passive: true });
    window.addEventListener('resize', mesurer);
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mesurer);
    observateur?.observe(e);
    for (const enfant of Array.from(e.children)) observateur?.observe(enfant);
    return () => {
      e.removeEventListener('scroll', mesurer);
      window.removeEventListener('resize', mesurer);
      observateur?.disconnect();
    };
  });

  /**
   * ⚠️ `behavior: 'smooth'` EST DEMANDÉ (« défiler en douceur ») MAIS PAS IMPOSÉ AU SYSTÈME : un navigateur réglé
   * sur « moins d'animations » l'ignore de lui-même. On n'ajoute donc pas de garde ici — ce serait décider à sa
   * place de ce qu'il a déjà décidé.
   */
  const descendre = (): void => {
    const e = zone.current;
    if (e === null) return;
    e.scrollBy({ top: sautDe(e.clientHeight), behavior: 'smooth' });
  };

  const Balise = as;
  return (
    <div className="zdf">
      <Balise className={className} ref={zone} aria-label={ariaLabel}>{enfants}</Balise>
      {/* 🔴 LE FONDU ET LA PASTILLE NE CAPTENT PAS LA SOURIS (`pointer-events:none` sur le fondu) : seule la
          pastille est cliquable, et la liste reste entièrement utilisable dessous. */}
      {montre && (
        <>
          <span className="zdf-fondu" aria-hidden="true" />
          <button type="button" className="zdf-pastille" aria-label={LIBELLE_PASTILLE} title={LIBELLE_PASTILLE}
            onClick={descendre}>
            {/* La flèche est un TRACÉ, pas un caractère : un emoji ignore la couleur du thème et sort gris. */}
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"
              fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}

export const CSS_ZONE_DEFILANTE = `
/* ⚠️ AUCUN ACCENT GRAVE DANS CE LITTERAL (piege TS1005 du depot).

   ══ 🔴🔴 LOT MODALE-SUIVI-ET-DEFILEMENT (point 2) — LA PASTILLE QUI DIT « IL Y EN A ENCORE » ═════════════════════
   Elle est POSEE SUR la zone, jamais dedans : une pastille dans le flux ferait sauter la derniere ligne a chaque
   apparition. Le conteneur prend donc la position relative, et les deux calques flottent au-dessus. */
.zdf{position:relative;min-width:0}

/* LE FONDU : il ne cache rien, il annonce. Un degrade du fond de la carte vers le transparent, sur trois lignes.
   ⚠️ IL NE CAPTE PAS LA SOURIS : la liste reste cliquable sous lui, jusqu'au dernier pixel. */
.zdf-fondu{position:absolute;left:0;right:0;bottom:0;height:44px;pointer-events:none;border-radius:0 0 .6rem .6rem;
  background:linear-gradient(to bottom, transparent, var(--color-svv-surface))}

/* LA PASTILLE : ronde, centree, discrete. Les couleurs viennent des JETONS — lisible en Clair comme en Sombre,
   sans une seule valeur en dur. */
.zdf-pastille{position:absolute;left:50%;bottom:6px;transform:translateX(-50%);
  display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;
  color:var(--color-svv-muted);background:var(--color-svv-surface);
  border:1px solid var(--color-svv-line-strong);border-radius:50%;cursor:pointer;
  box-shadow:0 1px 4px rgba(0,0,0,.14);animation:zdf-pulse 2.4s ease-in-out infinite}
.zdf-pastille:hover{color:var(--color-svv-ink);border-color:var(--color-svv-ink)}
.zdf-pastille:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px}

/* LA PULSATION : lente et sobre, exactement ce qu'Arno a demande — 2,4 s, opacite et echelle 1 -> 1,06.
   ⚠️ L'ECHELLE SE COMPOSE AVEC LE CENTRAGE : sans le translateX(-50%) dans chaque image, la pastille partirait
   vers la gauche a chaque battement. */
@keyframes zdf-pulse{
  0%,100%{opacity:.78;transform:translateX(-50%) scale(1)}
  50%{opacity:1;transform:translateX(-50%) scale(1.06)}
}
/* 🔴 EXIGENCE TRANSVERSE DU DEPOT, ET DEMANDE EXPLICITE D'ARNO : pas de pulsation pour qui n'en veut pas. */
@media (prefers-reduced-motion:reduce){
  .zdf-pastille{animation:none;opacity:1;transform:translateX(-50%)}
}
@media (pointer:coarse){.zdf-pastille{width:32px;height:32px}}
`;
