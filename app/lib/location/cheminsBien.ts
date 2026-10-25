/**
 * ══ 🔴 Arno (25/10/2026) — LES CHOIX EN CASCADE REMIS À ZÉRO : LES CHAMPS PROPRES À CHAQUE CHEMIN (famille du bien) ═══════════════════════
 * Constat d'Arno : Nouveau bien → « Local » → « Local commercial » ; puis « Logement » ; puis de nouveau « Local » : « Local commercial »
 * était encore coché. Règle : QUITTER un chemin (changer le choix principal) vide tous ses sous-choix et ses champs propres ; en
 * revenant, on repart à vide. Les champs communs à tous les chemins (adresse, propriétaire, DPE, accès, copropriété…) ne sont jamais
 * touchés. Rien n'est perdu sans le dire : « Les informations propres à « Local » ont été effacées. » À l'enregistrement, seuls les
 * champs du chemin CHOISI partent au serveur. PUR.
 */
export type FamilleBien = 'logement' | 'local' | 'parking';

/** Les champs propres à chaque chemin (les noms de l'envoi « logement » / de l'encart). */
export const CHAMPS_DU_CHEMIN: Record<FamilleBien, readonly string[]> = {
  logement: ['typeLogement', 'meuble', 'nombrePieces', 'surfaceHabitableM2', 'surfaceCarrezM2', 'surfaceExterieureM2'],
  local: ['typeLocal', 'nombrePieces', 'surfaceHabitableM2', 'surfaceCarrezM2', 'surfaceExterieureM2'],
  parking: ['parkingSituation', 'parkingType', 'surfaceM2'],
};
/** Tous les champs propres à UN chemin au moins. */
export const CHAMPS_DE_CHEMIN: readonly string[] = [...new Set(Object.values(CHAMPS_DU_CHEMIN).flat())];

export const LIBELLE_CHEMIN: Record<FamilleBien, string> = { logement: 'Logement', local: 'Local', parking: 'Parking' };
export const messageEffacement = (f: FamilleBien): string => `Les informations propres à « ${LIBELLE_CHEMIN[f]} » ont été effacées.`;

const rempli = (v: unknown): boolean => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');

/** Les champs du chemin quitté qui étaient remplis (vide : rien à dire). */
export function champsRemplisDuChemin(f: FamilleBien, valeurs: Record<string, unknown>): string[] {
  return CHAMPS_DU_CHEMIN[f].filter((k) => rempli(valeurs[k]));
}

/** La même chose pour une saisie dont toutes les clés sont exigées (l'encart de « Modifier ») : les champs des autres chemins à ''. */
export function viderHorsChemin<T extends object>(o: T, f: FamilleBien | null): T {
  const garder = new Set(f === null ? [] : CHAMPS_DU_CHEMIN[f]);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, CHAMPS_DE_CHEMIN.includes(k) && !garder.has(k) ? '' : v])) as T;
}

/** L'envoi limité au chemin choisi : les champs propres aux AUTRES chemins sont retirés (les champs communs restent). */
export function restreindreAuChemin<T extends Record<string, unknown>>(o: T, f: FamilleBien | null): T {
  const garder = new Set(f === null ? [] : CHAMPS_DU_CHEMIN[f]);
  return Object.fromEntries(Object.entries(o).filter(([k]) => !CHAMPS_DE_CHEMIN.includes(k) || garder.has(k))) as T;
}
