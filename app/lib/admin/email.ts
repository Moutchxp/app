// Validation d'adresse e-mail (M3). Volontairement MINIMALE et permissive — même esprit que la CHECK SQL
// (015_identifiant_email.sql) : on n'implémente PAS la RFC 5322. But : rejeter les saisies grossièrement
// invalides (pas d'arobase, deux arobases, espace, domaine sans point…), pas trancher les cas exotiques.
// Partagé par le script CLI (app/scripts/admin.ts) et disponible côté formulaire → PAS de `import 'server-only'`.

/**
 * Renvoie `true` si `valeur` ressemble à une adresse e-mail exploitable : après trim, longueur totale ≤ 254,
 * aucun blanc, exactement une arobase, partie locale non vide, et domaine comportant au moins un point (jamais
 * en tête ni en fin). Comparaison/casse ne sont PAS gérées ici (l'unicité insensible à la casse est en base).
 */
export function estEmailValide(valeur: string): boolean {
  const v = valeur.trim();
  if (v.length === 0 || v.length > 254) return false; // RFC 5321 : 254 caractères max pour un chemin d'adresse
  if (/\s/.test(v)) return false; // aucun espace/tabulation/saut de ligne
  const morceaux = v.split('@');
  if (morceaux.length !== 2) return false; // exactement UNE arobase
  const [local, domaine] = morceaux;
  if (local.length === 0) return false; // partie locale non vide
  if (!domaine.includes('.')) return false; // domaine avec au moins un point
  if (domaine.startsWith('.') || domaine.endsWith('.')) return false; // point en position utile
  return true;
}
