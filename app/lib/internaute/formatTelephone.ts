/**
 * Reformatage d'AFFICHAGE d'un numéro de téléphone — module PUR & client-safe.
 *
 * La base stocke les numéros en **E.164** (indicatif international conservé, sans séparateur : `+33612345678`,
 * cf. capture publique `page.tsx` via `react-international-phone`). Ce helper les rend LISIBLES au format
 * NATIONAL du pays de l'indicatif (`06 12 34 56 78` en FR, `0476 12 34 56` en BE, `(415) 555-2671` en US…),
 * via `libphonenumber-js` (déjà dépendance du projet).
 *
 * ⚠️ AFFICHAGE UNIQUEMENT : ne modifie JAMAIS la donnée stockée (qui reste E.164). Pure fonction, testée isolément.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * `+33612345678` → `06 12 34 56 78`. Repli si non parsable en E.164 : si la chaîne ressemble à un national FR
 * (10 chiffres commençant par 0), groupes de 2 ; sinon la chaîne brute (jamais de perte). `null`/`""` → `""`.
 */
export function formaterTelephone(brut: string | null | undefined): string {
  const s = (brut ?? "").trim();
  if (s === "") return "";
  const tel = parsePhoneNumberFromString(s);
  if (tel) return tel.formatNational();
  return repliFrancais(s);
}

/** Repli hors E.164 : national FR (0X XX XX XX XX) en groupes de 2 ; sinon la chaîne d'origine inchangée. */
function repliFrancais(s: string): string {
  const digits = s.replace(/\D/g, "");
  if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return s;
}
