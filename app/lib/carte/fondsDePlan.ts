/**
 * Fonds de plan de la carte de localisation et ZOOM MAXIMAL (lot CARTE-ZOOM, 15/10/2026). Chaque fournisseur s'arrête à
 * un niveau : OpenStreetMap ne sert AUCUNE tuile au-delà de 19 (404 → carte entièrement grise) ; Esri World Imagery sert
 * des tuiles « Map data not yet available » au-delà de son dernier niveau (19 garanti partout). La carte va jusqu'à
 * ZOOM_MAX_CARTE (inchangé : 20, assez pour viser une façade) ; au-delà de `zoomMaxFourni`, Leaflet AGRANDIT les tuiles
 * du dernier niveau fourni (`maxNativeZoom`) au lieu d'en demander d'inexistantes → la carte reste affichée à tous les zooms.
 */
export const ZOOM_MAX_CARTE = 20;
export const FONDS_DE_PLAN = {
  map: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", zoomMaxFourni: 19 },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", zoomMaxFourni: 19 },
} as const;
