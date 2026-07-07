import 'server-only';
import { MODES_COMBINAISON, metaParColonne } from '../../../admin/(protected)/pilotage/mappingConfig';
import { evaluerRepli } from './repli';

/**
 * Validation server-side d'un patch d'écriture sur `config_scoring` (M1, T2).
 *
 * Fonction PURE : aucune dépendance métier (`app/lib/svv/**`, `profilConfig`).
 * S'appuie sur l'ALLOWLIST des métadonnées (`mappingConfig.META` via
 * `metaParColonne`) + la garde anti-repli locale (`./repli`).
 *
 * Aucun clamp, aucune coercition silencieuse : une valeur invalide est REJETÉE
 * (§5 « aucun arrondi » ; OQ2/B1). L'anti-repli (B2) garantit qu'aucune écriture
 * ne laisse la ligne dans un état de repli sur `PROFIL_DEGAGEMENT_DEFAUT`.
 */

export interface ErreurValidation {
  /** Colonne concernée (`''` pour une erreur globale, ex. body vide). */
  colonne: string;
  message: string;
}

export interface SetItem {
  colonne: string;
  valeur: number | string;
}

export type ResultatValidation =
  | { ok: true; set: SetItem[] }
  | { ok: false; erreurs: ErreurValidation[] };

/**
 * Valide `patch` (colonnes soumises) contre la ligne actuelle. Retourne la liste
 * des colonnes à écrire (`ok:true`) ou les erreurs (`ok:false`, aucune écriture).
 */
export function validerPatch(
  patch: Record<string, unknown>,
  ligneActuelle: Record<string, unknown>,
): ResultatValidation {
  const erreurs: ErreurValidation[] = [];
  const cles = Object.keys(patch ?? {});

  // 1. Patch vide → rien à écrire.
  if (cles.length === 0) {
    return { ok: false, erreurs: [{ colonne: '', message: 'aucune colonne à modifier' }] };
  }

  const patchValide: Record<string, number | string> = {};

  for (const cle of cles) {
    // 2. Colonne connue (allowlist META).
    const meta = metaParColonne(cle);
    if (!meta) {
      erreurs.push({ colonne: cle, message: `colonne inconnue « ${cle} »` });
      continue;
    }
    // 3. Colonne éditable (couvre VESTIGIALE + `id` + `natures_remarquables`).
    if (!meta.editable) {
      erreurs.push({ colonne: cle, message: `colonne « ${cle} » non éditable` });
      continue;
    }
    // 4. NOT NULL — valeur présente.
    const valeur = patch[cle];
    if (valeur === null || valeur === undefined) {
      erreurs.push({ colonne: cle, message: 'valeur requise (NOT NULL)' });
      continue;
    }

    // 5. Type.
    if (meta.type === 'enum') {
      // Liste fermée propre à CHAQUE enum (`meta.optionsEnum`) ; repli sûr sur
      // MODES_COMBINAISON si absente. Rejet en 422 AVANT le CHECK DB (503).
      const options = meta.optionsEnum ?? MODES_COMBINAISON;
      if (typeof valeur !== 'string' || !options.includes(valeur)) {
        erreurs.push({
          colonne: cle,
          message: `valeur hors liste fermée {${options.join(', ')}}`,
        });
        continue;
      }
      patchValide[cle] = valeur;
      continue;
    }
    // Numérique (`entier` | `nombre`) : REJET strict d'une string ("85") et de NaN/Infinity.
    if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
      erreurs.push({
        colonne: cle,
        message: 'valeur numérique finie attendue (ni texte, ni NaN/Infinity)',
      });
      continue;
    }
    if (meta.type === 'entier' && !Number.isInteger(valeur)) {
      erreurs.push({ colonne: cle, message: 'valeur entière attendue' });
      continue;
    }
    // 6. Plage (garde-fous de dev).
    if (typeof meta.min === 'number' && valeur < meta.min) {
      erreurs.push({ colonne: cle, message: `valeur en deçà du minimum (${meta.min})` });
      continue;
    }
    if (typeof meta.max === 'number' && valeur > meta.max) {
      erreurs.push({ colonne: cle, message: `valeur au-delà du maximum (${meta.max})` });
      continue;
    }

    patchValide[cle] = valeur;
  }

  // 7. Anti-repli sur la ligne RÉSULTANTE (valeurs valides appliquées).
  const resultante = { ...ligneActuelle, ...patchValide };
  const repli = evaluerRepli(resultante);
  if (!repli.actif) {
    for (const raison of repli.raisons) {
      const colonne = raison.includes('mode_combinaison')
        ? 'mode_combinaison'
        : raison.includes('distance_max_m')
          ? 'distance_max_m'
          : '';
      erreurs.push({ colonne, message: raison });
    }
  }

  if (erreurs.length > 0) return { ok: false, erreurs };

  const set: SetItem[] = Object.entries(patchValide).map(([colonne, valeur]) => ({ colonne, valeur }));
  return { ok: true, set };
}
