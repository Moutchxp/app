/**
 * T2 — définition des SIX fenêtres GLISSANTES du cumul du journal des relèves, + helpers PURS (aucune I/O, aucun import
 * serveur). Séparé de `reponsesSuivi.ts` pour être importable côté CLIENT (Vue/Rendu) SANS tirer `db/client` dans le bundle.
 *
 * Fenêtres GLISSANTES (pas calendaires) : `demarre_le` est un timestamptz ; un découpage calendaire (« ce mois-ci »)
 * introduirait un piège de fuseau pour un gain nul ici. Les libellés disent donc la fenêtre RÉELLE, jamais « ce mois-ci ».
 * `total` = sans borne. `bornesFenetres` est l'UNIQUE source des seuils : le SQL (via paramètres liés) et l'affichage en
 * dérivent tous les deux — pas de seconde vérité.
 */
const JOUR_MS = 24 * 3_600_000;

/** Les six fenêtres, dans l'ordre d'affichage. `ms` = largeur glissante ; `null` = sans borne (total). */
export const FENETRES_CUMUL = [
  { cle: '24h', libelle: '24 dernières heures', ms: JOUR_MS },
  { cle: '7j', libelle: '7 derniers jours', ms: 7 * JOUR_MS },
  { cle: '30j', libelle: '30 derniers jours', ms: 30 * JOUR_MS },
  { cle: '90j', libelle: '90 derniers jours', ms: 90 * JOUR_MS },
  { cle: '365j', libelle: '365 derniers jours', ms: 365 * JOUR_MS },
  { cle: 'total', libelle: 'depuis le début', ms: null },
] as const;

/** Clé d'une fenêtre glissante (union fermée — exploitable par un futur sélecteur d'admin). */
export type FenetreCumul = (typeof FENETRES_CUMUL)[number]['cle'];

/** Libellé lisible d'une fenêtre (« 7 derniers jours »). Pur. */
export function libelleFenetre(cle: FenetreCumul): string {
  return FENETRES_CUMUL.find((f) => f.cle === cle)?.libelle ?? cle;
}

/**
 * Borne basse (instant) de chaque fenêtre vue de `maintenant` ; `total` → `null` (sans borne). PURE.
 * Sert à LIER les paramètres de la requête d'agrégation (via `.toISOString()`) ET à raisonner l'appartenance en test.
 */
export function bornesFenetres(maintenant: Date): { cle: FenetreCumul; depuis: Date | null }[] {
  const t = maintenant.getTime();
  return FENETRES_CUMUL.map((f) => ({ cle: f.cle, depuis: f.ms === null ? null : new Date(t - f.ms) }));
}

/**
 * Les fenêtres GLISSANTES qui CONTIENNENT une relève démarrée à `demarreLe`, vu de `maintenant`. Miroir exact du prédicat
 * SQL `demarre_le >= depuis` (comparaison numérique, pas lexicographique → robuste au format). PURE.
 */
export function fenetresContenant(demarreLe: Date, maintenant: Date): FenetreCumul[] {
  const t = demarreLe.getTime();
  return bornesFenetres(maintenant)
    .filter((b) => b.depuis === null || t >= b.depuis.getTime())
    .map((b) => b.cle);
}
