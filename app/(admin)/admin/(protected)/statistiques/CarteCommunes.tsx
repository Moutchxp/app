'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { bulleRayon, formatNombre, type CommuneGeo } from './affichage';

/**
 * M2 — LOT 6. Carte communale (chargée en `dynamic(ssr:false)` : Leaflet accède à `window`). Bulles
 * proportionnelles (rayon ∝ √n) sur les seules communes VISIBLES (k-safe) — jointes au référentiel
 * cartographique (centroïdes, Phase 1). Une commune masquée n'a PAS de localisation → jamais tracée : la carte
 * ne peut pas devenir un canal de ré-identification (le masquage reste une note textuelle, hors carte).
 *
 * AUCUN BLEU sur nos éléments : bulles ROUGES (token `--color-svv-red` lu au runtime). Fond OSM = tuiles
 * métier (non concernées). Popups au TAP (CircleMarker ouvre au clic → tactile, jamais au survol seul).
 * `zoomAnimation` coupé si `prefers-reduced-motion`.
 */

const CENTRE_IDF: [number, number] = [48.86, 2.35];

/** Lit le rouge SVAV depuis les design tokens (le SVG Leaflet vit dans un pane où les var() ne cascadent pas toujours). */
function lireRouge(): string {
  if (typeof window === 'undefined') return '#a30402';
  const v = getComputedStyle(document.documentElement).getPropertyValue('--color-svv-red').trim();
  return v || '#a30402';
}

/** Cadre la carte sur les communes tracées + corrige la taille (conteneur à 0 au montage : iOS Safari, onglet caché). */
function Cadreur({ points }: { points: CommuneGeo[] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (points.length > 0) {
      map.fitBounds(
        points.map((p) => [p.lat, p.lon] as [number, number]),
        { padding: [24, 24], maxZoom: 13 },
      );
    }
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map, points]);
  return null;
}

export interface CarteCommunesProps {
  communes: CommuneGeo[];
  selection: string | null;
  onSelect: (insee: string) => void;
  reducedMotion: boolean;
}

export default function CarteCommunes({ communes, selection, onSelect, reducedMotion }: CarteCommunesProps) {
  const rouge = useMemo(() => lireRouge(), []);
  const max = useMemo(() => communes.reduce((m, c) => Math.max(m, c.n), 1), [communes]);
  return (
    <MapContainer
      center={CENTRE_IDF}
      zoom={10}
      style={{ height: 320, width: '100%', borderRadius: 10 }}
      zoomAnimation={!reducedMotion}
      markerZoomAnimation={!reducedMotion}
      scrollWheelZoom={false}
      aria-label="Carte des communes où des analyses ont abouti (résultats produits)"
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {communes.map((c) => {
        const actif = c.commune_insee === selection;
        return (
          <CircleMarker
            key={c.commune_insee}
            center={[c.lat, c.lon]}
            radius={bulleRayon(c.n, max)}
            pathOptions={{ color: rouge, weight: actif ? 3 : 1, fillColor: rouge, fillOpacity: actif ? 0.55 : 0.28 }}
            eventHandlers={{ click: () => onSelect(c.commune_insee) }}
          >
            <Popup>
              <strong>{c.nom}</strong>
              <br />
              {formatNombre(c.n)} analyse{c.n > 1 ? 's' : ''} (résultats)
            </Popup>
          </CircleMarker>
        );
      })}
      <Cadreur points={communes} />
    </MapContainer>
  );
}
