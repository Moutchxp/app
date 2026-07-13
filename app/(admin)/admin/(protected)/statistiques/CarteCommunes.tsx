'use client';

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { bulleRayon, formatNombre, couleurDominant, LIBELLE_VERDICT, type CommuneGeo } from './affichage';

/**
 * M2 — LOT 6 + Chantier B. Carte communale (chargée en `dynamic(ssr:false)` : Leaflet accède à `window`). Bulles
 * proportionnelles (rayon ∝ √n) sur les seules communes VISIBLES (k-safe) — jointes au référentiel cartographique
 * (centroïdes). Une commune masquée n'a PAS de localisation → jamais tracée : la carte ne peut pas devenir un canal
 * de ré-identification (le masquage reste une note textuelle, hors carte).
 *
 * COULEUR (Chantier B) : chaque bulle est teintée par le VERDICT DOMINANT de la commune, MAIS SEULEMENT quand ce
 * dominant est k-safe (calculé côté serveur). Une commune dont le split verdict est indéterminable sous k arrive avec
 * `dominant: null` → bulle GRIS CLAIR NEUTRE (taille seule) : aucune couleur ne trahit « quel verdict domine à faible
 * volume ». Le client ne recalcule RIEN — il applique la couleur d'un dominant déjà anonymisé.
 *
 * NAVIGATION (Chantier B) : s'ouvre CENTRÉE sur l'Île-de-France (où sont les données) mais reste LIBREMENT navigable —
 * molette/pinch (`scrollWheelZoom`) et drag actifs, `minZoom` permettant de voir la France entière, AUCUN `maxBounds`
 * restrictif. Dézoomer montre une carte vide ailleurs (aucune donnée hors IdF) : c'est ATTENDU. Un bouton « Recentrer »
 * ramène au cadrage initial. AUCUN BLEU sur nos éléments. Popups au TAP. `zoomAnimation` coupé si `prefers-reduced-motion`.
 */

const CENTRE_IDF: [number, number] = [48.85, 2.35]; // Paris ~ centre de la petite couronne
const ZOOM_IDF = 11; //                               cadre 75 + 92 + 93 + 94
const ZOOM_MIN = 5; //                                France entière visible
const ZOOM_MAX = 18; //                               niveau rue

/** Capte l'instance Leaflet (pour le bouton « Recentrer ») + corrige la taille (conteneur à 0 au montage : iOS Safari,
 *  onglet caché). Ne cadre PAS sur les points : le cadrage initial IdF est STABLE (center/zoom fixes), indépendant du
 *  volume de données (Chantier B — ouverture IdF, pas un fit-to-data qui zoomerait à fond sur une commune isolée). */
function Controleur({ mapRef }: { mapRef: MutableRefObject<LeafletMap | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map, mapRef]);
  return null;
}

export interface CarteCommunesProps {
  communes: CommuneGeo[];
  selection: string[]; //     multi-sélection : communes surlignées (Set côté client, toutes déjà k-safe)
  onSelect: (insee: string) => void; // clic sur une bulle = bascule la commune dans/hors la sélection
  reducedMotion: boolean;
}

export default function CarteCommunes({ communes, selection, onSelect, reducedMotion }: CarteCommunesProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const max = useMemo(() => communes.reduce((m, c) => Math.max(m, c.n), 1), [communes]);
  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={CENTRE_IDF}
        zoom={ZOOM_IDF}
        minZoom={ZOOM_MIN}
        maxZoom={ZOOM_MAX}
        style={{ height: 340, width: '100%', borderRadius: 10 }}
        zoomAnimation={!reducedMotion}
        markerZoomAnimation={!reducedMotion}
        scrollWheelZoom
        aria-label="Carte des communes où des analyses ont abouti — bulles colorées par verdict dominant (anonymisé k)"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
        {communes.map((c) => {
          const actif = selection.includes(c.commune_insee);
          const couleur = couleurDominant(c.dominant); // dominant déjà k-safe ; null → gris clair neutre
          return (
            <CircleMarker
              key={c.commune_insee}
              center={[c.lat, c.lon]}
              radius={bulleRayon(c.n, max)}
              pathOptions={{ color: couleur, weight: actif ? 3 : 1, fillColor: couleur, fillOpacity: actif ? 0.6 : 0.35 }}
              eventHandlers={{ click: () => onSelect(c.commune_insee) }}
            >
              <Popup>
                <strong>{c.nom}</strong>
                <br />
                {formatNombre(c.n)} analyse{c.n > 1 ? 's' : ''} (résultats)
                <br />
                {c.dominant ? `Verdict dominant : ${LIBELLE_VERDICT[c.dominant]}` : 'Verdict dominant : anonymisé (k)'}
              </Popup>
            </CircleMarker>
          );
        })}
        <Controleur mapRef={mapRef} />
      </MapContainer>
      <button
        type="button"
        onClick={() => mapRef.current?.setView(CENTRE_IDF, ZOOM_IDF)}
        aria-label="Recentrer la carte sur l’Île-de-France"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          minHeight: 44,
          padding: '0 12px',
          borderRadius: 10,
          border: '1px solid var(--color-svv-red)',
          background: '#fff',
          color: 'var(--color-svv-red)',
          fontWeight: 700,
          fontSize: '.76rem',
          cursor: 'pointer',
        }}
      >
        Recentrer Île-de-France
      </button>
    </div>
  );
}
