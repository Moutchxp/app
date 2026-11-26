/**
 * 🔴 (Arno, 26/11/2026, 11h58) « à vérifier » sur une adresse de la copropriété : le modèle de l'examen et le lien de la carte. MODULE PUR (l'écran
 * l'importe : AUCUN import qui tire `pg`). La lecture est dans `adresseCoproExamen.ts`.
 */

export interface ExamenAdresse {
  /** l'adresse telle qu'elle est écrite dans la copropriété */
  ecrite: string;
  statut: 'certain' | 'a_verifier' | 'introuvable';
  motif: string;
  /** l'adresse officielle retenue ou la meilleure proposition ; `null` : aucune */
  officielle: string | null;
  banId: string | null;
  /** la parcelle cadastrale du point de l'adresse ; `null` : inconnue */
  parcelle: string | null;
  /** la position de l'adresse (WGS 84) ; `null` : inconnue */
  position: { lat: number; lon: number } | null;
}

/** Le lien qui montre la position sur une carte (OpenStreetMap, une nouvelle fenêtre ; aucune donnée de l'agence n'y part). PUR. */
export const lienCarte = (p: { lat: number; lon: number }): string =>
  `https://www.openstreetmap.org/?mlat=${p.lat.toFixed(6)}&mlon=${p.lon.toFixed(6)}#map=19/${p.lat.toFixed(6)}/${p.lon.toFixed(6)}`;

