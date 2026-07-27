'use client';

import { useEffect, useMemo, useState } from 'react';
import { type Bbox, ajustement, anneauVersSvg, projeterL93VersSvg, bboxDe } from '../../../../lib/sitadel/carteProjection';
import type { CommuneGeo } from '../../../../lib/sitadel/carteRepo';

/**
 * Carte de sélection des communes (chantier S6). ⚠️ AUCUN fond de plan, AUCUNE tuile externe : on ne dessine QUE nos
 * polygones (servis par /api/admin/permis/carte), en SVG. Motif : éviter une dépendance de tuiles et une obligation
 * d'attribution supplémentaire — pour choisir des communes, les formes suffisent. Géométries en Lambert-93 (2154),
 * projection conforme → simple transformation linéaire vers le SVG (cf. carteProjection), PAS de reprojection 4326.
 *
 * Un clic sur une commune la (dé)sélectionne (état partagé avec le multi-sélecteur). La vue se cadre sur le département
 * filtré (sinon les 4). Cadrage INSTANTANÉ (pas d'animation de zoom) → neutre vis-à-vis de prefers-reduced-motion.
 */

const LARGEUR = 900; // résolution interne du canevas SVG (le viewBox fait le zoom)

interface Props {
  selection: ReadonlySet<string>;
  onToggle: (code: string) => void;
  departement: string | null;
}

export function CartePermis({ selection, onToggle, departement }: Props) {
  const [data, setData] = useState<{ communes: CommuneGeo[]; bbox: Bbox } | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const res = await fetch('/api/admin/permis/carte', { cache: 'force-cache' });
        if (annule) return;
        if (!res.ok) { setErreur(true); return; }
        const d = (await res.json()) as { communes: CommuneGeo[]; bbox: Bbox };
        if (!annule) setData(d);
      } catch { if (!annule) setErreur(true); }
    })();
    return () => { annule = true; };
  }, []);

  // Projection globale (bbox complète → canevas LARGEUR×hauteur), calculée une fois les données chargées.
  const rendu = useMemo(() => {
    if (!data) return null;
    const [xmin, ymin, xmax, ymax] = data.bbox;
    const hauteur = Math.max(1, Math.round(LARGEUR * (ymax - ymin) / Math.max(xmax - xmin, 1e-9)));
    const a = ajustement(data.bbox, { largeur: LARGEUR, hauteur, marge: 4 });
    const polys = data.communes.map((c) => ({
      code: c.code, dep: c.dep,
      pts: c.anneaux.map((ring) => anneauVersSvg(ring, data.bbox, a)),
    }));
    return { hauteur, a, polys };
  }, [data]);

  // viewBox = cadre sur le département filtré (sinon tout). Instantané.
  const viewBox = useMemo(() => {
    if (!data || !rendu) return `0 0 ${LARGEUR} 100`;
    const cibles = departement ? data.communes.filter((c) => c.dep === departement) : data.communes;
    const anneaux = cibles.flatMap((c) => c.anneaux);
    if (anneaux.length === 0) return `0 0 ${LARGEUR} ${rendu.hauteur}`;
    const [xmin, ymin, xmax, ymax] = bboxDe(anneaux);
    const [x1, y1] = projeterL93VersSvg(xmin, ymax, data.bbox, rendu.a); // coin haut-gauche (Nord-Ouest)
    const [x2, y2] = projeterL93VersSvg(xmax, ymin, data.bbox, rendu.a); // coin bas-droit (Sud-Est)
    const m = 8;
    return `${(x1 - m).toFixed(1)} ${(y1 - m).toFixed(1)} ${(x2 - x1 + 2 * m).toFixed(1)} ${(y2 - y1 + 2 * m).toFixed(1)}`;
  }, [data, rendu, departement]);

  if (erreur) return <div className="svv-card" style={{ color: 'var(--color-svv-red)' }}>Carte indisponible.</div>;
  if (!data || !rendu) return <div className="svv-card" style={{ color: 'var(--color-svv-muted)' }}>Chargement de la carte…</div>;

  return (
    <div className="svv-card" style={{ padding: '.5rem' }}>
      <svg viewBox={viewBox} width="100%" style={{ maxHeight: 460, display: 'block', background: 'var(--color-svv-field)' }} role="group" aria-label="Carte de sélection des communes">
        {rendu.polys.map((p) => {
          const actif = selection.has(p.code);
          return (
            <g key={p.code} onClick={() => onToggle(p.code)} style={{ cursor: 'pointer' }}>
              {p.pts.map((pts, i) => (
                <polygon key={i} points={pts}
                  fill={actif ? 'var(--color-svv-red)' : '#ffffff'} fillOpacity={actif ? 0.55 : 1}
                  stroke={actif ? 'var(--color-svv-red)' : 'var(--color-svv-line)'} strokeWidth={actif ? 1.2 : 0.4} strokeLinejoin="round" />
              ))}
            </g>
          );
        })}
      </svg>
      <p style={{ margin: '.4rem 0 0', fontSize: 12, color: 'var(--color-svv-muted)' }}>
        Contours © IGN ADMIN EXPRESS (Licence Ouverte Etalab 2.0) — aucun fond de plan. Cliquez une commune pour la (dé)sélectionner.
      </p>
    </div>
  );
}
