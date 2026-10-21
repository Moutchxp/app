/**
 * Fonds de plan de la carte de localisation et ZOOM MAXIMAL (lot CARTE-ZOOM, 15/10/2026). Chaque fournisseur s'arrête à
 * un niveau : OpenStreetMap ne sert AUCUNE tuile au-delà de 19 (404 → carte entièrement grise) ; Esri World Imagery sert
 * des tuiles « Map data not yet available » au-delà de son dernier niveau (19 garanti partout). La carte va jusqu'à
 * ZOOM_MAX_CARTE (inchangé : 20, assez pour viser une façade) ; au-delà de `zoomMaxFourni`, Leaflet AGRANDIT les tuiles
 * du dernier niveau fourni (`maxNativeZoom`) au lieu d'en demander d'inexistantes → la carte reste affichée à tous les zooms.
 */
export const ZOOM_MAX_CARTE = 20;

/**
 * ══ 🔴 LE FOND « PLAN » = PLAN IGN V2 DE LA GÉOPLATEFORME (Arno, 20/10/2026) ════════════════════════════════════════════
 * Les serveurs de tuiles d'OpenStreetMap (bénévoles) refusent (403 « Access blocked ») toute demande sans en-tête Referer :
 * depuis le 15/10/2026 (commit 92900ac4), l'admin pose `Referrer-Policy: same-origin` — réglage de sécurité gardé tel
 * quel — et le navigateur n'envoie plus de Referer vers un autre site. On ne dépend plus de leur politique d'usage : le fond
 * est le Plan IGN v2 (WMTS de data.geopf.fr, sans clé, Licence Ouverte), le MÊME que celui des cartes de certificat
 * (`orientationCarte.ts`). Attribution IGN obligatoire, portée par chaque carte. Une seule URL, ici.
 */
export const URL_PLAN_IGN = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0'
  + '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png'
  + '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}';
export const ATTRIBUTION_IGN = '© <a href="https://www.ign.fr/" target="_blank" rel="noopener noreferrer">IGN</a> — Plan IGN v2';
/**
 * ══ 🔴 LE DERNIER NIVEAU DÉTAILLÉ DU PLAN IGN V2 = 18 (mesuré le 22/10/2026, Arno) ═══════════════════════════════════════
 * Le WMTS sert jusqu'au niveau 19, mais le 19 est une AUTRE carte : bâtiments et numéros de parcelle, sans le nom de la plupart
 * des rues ni les espaces verts (mesure sur 8 rue Denfert-Rochereau, Asnières : au 19, plus de « Rue Denfert-Rochereau » ni de
 * square en vert ; au 18, noms de rue, jardins, numéros, sens de circulation) ; le 20 n'existe pas (404). Le fond s'arrête donc
 * au 18 (`maxNativeZoom`) : au-delà, Leaflet AGRANDIT les tuiles du 18 au lieu de charger le 19 → tous les détails à tous les
 * zooms. Chaque carte garde son zoom maximal (`maxZoom`).
 */
export const ZOOM_DETAILLE_PLAN_IGN = 18;
export const FOND_PLAN_IGN = { url: URL_PLAN_IGN, zoomMaxFourni: ZOOM_DETAILLE_PLAN_IGN, attribution: ATTRIBUTION_IGN } as const;

/**
 * Zoom d'arrivée de l'écran « (Point GPS) Déplacez le curseur sur votre fenêtre » (Arno, 22/10/2026) : le niveau qui montre tous
 * les détails du Plan IGN tout en permettant de viser une fenêtre. Les autres cartes gardent leur zoom d'arrivée.
 */
export const ZOOM_ARRIVEE_POINT_GPS = 18;

export const FONDS_DE_PLAN = {
  map: FOND_PLAN_IGN,
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", zoomMaxFourni: 19, attribution: '© Esri' },
} as const;
