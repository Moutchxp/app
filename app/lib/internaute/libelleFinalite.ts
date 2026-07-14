/**
 * Module INTERNAUTE — helper d'AFFICHAGE des libellés de finalité (admin « Internautes »).
 *
 * Pur, sans dépendance base ni serveur (importable client). ENRICHISSEMENT D'AFFICHAGE UNIQUEMENT : la donnée
 * base (`internaute_finalite.libelle`, seed migration 023) n'est JAMAIS modifiée — on suffixe seulement à l'écran
 * le canal (F1 = appel téléphonique) et le code court F1/F2/F3. Les clés proviennent de `FINALITES_SEED` (aucune
 * chaîne de clé re-hardcodée ici). Une finalité FUTURE hors référentiel SEED → libellé base tel quel (fallback sûr).
 */
import { FINALITES_SEED } from './consentement';

/** Code court F1/F2/F3 par clé de finalité SEED (dérivé de `FINALITES_SEED` — pas de clé en dur). */
const CODE_FINALITE: Record<string, string> = {
  [FINALITES_SEED.recontactInterne]: 'F1',
  [FINALITES_SEED.emailMarketing]: 'F2',
  [FINALITES_SEED.retargetingTiers]: 'F3',
};

/** Précision de CANAL par clé (affichage). Seule F1 en a une aujourd'hui : le recontact interne = appel téléphonique. */
const CANAL_FINALITE: Record<string, string> = {
  [FINALITES_SEED.recontactInterne]: 'appel téléphonique',
};

/**
 * Libellé de finalité ENRICHI pour l'affichage : `{libelle} (canal éventuel) (code F)`.
 * - `recontact_interne` (F1) → `{libelle} (appel téléphonique) (F1)`
 * - `email_marketing` (F2)   → `{libelle} (F2)`
 * - `retargeting_tiers` (F3) → `{libelle} (F3)`
 * - clé inconnue             → `{libelle}` (fallback sûr, jamais de crash).
 * `libelle` est passé tel quel (valeur base) : cette fonction ne fait que suffixer.
 */
export function libelleFinaliteAffichage(finalite: string, libelle: string): string {
  const code = CODE_FINALITE[finalite];
  if (!code) return libelle; // finalité hors référentiel SEED → libellé base inchangé
  const canal = CANAL_FINALITE[finalite];
  return canal ? `${libelle} (${canal}) (${code})` : `${libelle} (${code})`;
}
