/**
 * Lecture de `config_scoring.reentree_tolerance_contact_m` (décision d'Arno du 14/10/2026, option A — voir `svv/config.ts`).
 *
 * Lue À PART de `chargerProfilDegagement` : l'ajouter à son SELECT ferait retomber TOUT le profil sur le défaut tant que la
 * migration 352 n'est pas appliquée (colonne absente → erreur → repli global). Ici, l'absence ne coûte que ce seul réglage.
 * Repli sûr sur `REENTREE_TOLERANCE_CONTACT_DEFAUT_M` (0,01 m) : colonne absente, ligne absente, valeur nulle, non finie ou
 * hors plage [0,001 ; 0,10]. Jamais d'exception propagée. Lecture seule.
 */
import { query } from "./client";
import {
  REENTREE_TOLERANCE_CONTACT_DEFAUT_M,
  REENTREE_TOLERANCE_CONTACT_MAX_M,
  REENTREE_TOLERANCE_CONTACT_MIN_M,
} from "../svv/config";

/** La valeur retenue pour une valeur lue : elle-même si c'est un nombre fini dans la plage, sinon le défaut. PUR. */
export function toleranceContactValide(v: unknown): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= REENTREE_TOLERANCE_CONTACT_MIN_M && n <= REENTREE_TOLERANCE_CONTACT_MAX_M
    ? n
    : REENTREE_TOLERANCE_CONTACT_DEFAUT_M;
}

/** La tolérance de contact de la réentrée, lue dans `config_scoring` (repli 0,01 m, cf. en-tête). */
export async function lireToleranceContactReentree(): Promise<number> {
  try {
    // `to_jsonb(c) -> 'colonne'` rend NULL (et non une erreur) tant que la colonne n'existe pas : aucune requête en échec,
    // donc aucune transaction appelante interrompue (ex. le diagnostic en lecture seule `scripts/diag-golden.ts`).
    const { rows } = await query<{ t: unknown }>(
      `SELECT to_jsonb(c) -> 'reentree_tolerance_contact_m' AS t FROM config_scoring c WHERE c.id = 1`,
    );
    return toleranceContactValide(rows[0]?.t);
  } catch {
    return REENTREE_TOLERANCE_CONTACT_DEFAUT_M; // colonne absente (migration 352 non appliquée) ou table indisponible
  }
}
