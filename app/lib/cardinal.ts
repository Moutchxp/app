// Azimut → point cardinal FR.
// Formule verrouillée : 8 secteurs de 45°, Nord centré sur 0° ([337.5,360)∪[0,22.5)).
const CARDINAUX = [
  "Nord",
  "Nord-Est",
  "Est",
  "Sud-Est",
  "Sud",
  "Sud-Ouest",
  "Ouest",
  "Nord-Ouest",
] as const;

export function cardinal(deg: number): string {
  const x = ((deg % 360) + 360) % 360;
  return CARDINAUX[Math.round(x / 45) % 8];
}

// Forme abrégée (mêmes 8 secteurs verrouillés).
const CARDINAUX_ABREGES = ["N", "N-E", "E", "S-E", "S", "S-O", "O", "N-O"] as const;

export function cardinalAbrege(deg: number): string {
  const x = ((deg % 360) + 360) % 360;
  return CARDINAUX_ABREGES[Math.round(x / 45) % 8];
}
