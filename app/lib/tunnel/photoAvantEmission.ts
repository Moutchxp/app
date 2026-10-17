/**
 * ══ 🔴🔴 LOT CERTIFICAT-PHOTO (Arno, 17/10/2026) — LA PHOTO EST DÉPOSÉE AVANT L'ÉMISSION DU CERTIFICAT ══════════════
 *
 * DÉFAUT EN PRODUCTION : le certificat partait sans photo. Le serveur RECOPIE `internaute_projet.photo_cle` dans le
 * certificat au moment de l'émission (`emettreCertificat`), et le certificat est IMMUABLE (trigger
 * `certificat_immuable`) : une photo arrivée après l'émission n'y entre jamais. Le dépôt de la photo part en
 * arrière-plan après l'ingestion ; tant qu'un clic sur l'écran B séparait les deux, il avait le temps de finir. Depuis
 * le lot TUNNEL-CONNECTE (a285cedc), l'internaute connecté n'a plus d'écran B : l'émission part dans la foulée de
 * l'ingestion, AVANT la fin du dépôt de la photo (envoi depuis l'iPhone + recompression + stockage).
 *
 * LA RÈGLE : toute émission attend que le dépôt de la photo en cours soit TERMINÉ (réussi ou non), au plus
 * `DELAI_MAX_ATTENTE_PHOTO_MS` — la photo reste annexe : un dépôt bloqué ne prive jamais l'internaute de son certificat.
 * Aucun dépôt en cours : l'émission part tout de suite, comme avant. PUR (aucun réseau, aucune base).
 */

/** Au-delà, le certificat part sans attendre la photo (elle est annexe : hors verdict et hors score). */
export const DELAI_MAX_ATTENTE_PHOTO_MS = 30_000;

/** Le message affiché à l'internaute PENDANT l'attente (Arno, 17/10/2026), avec l'indicateur d'attente existant. */
export const MESSAGE_ENVOI_PHOTO = 'Envoi de votre photo… merci de ne pas fermer l’application';

export async function emettreApresPhoto(
  depotPhoto: Promise<unknown> | null,
  emettre: () => Promise<boolean>,
  options: {
    delaiMs?: number;
    attendre?: (ms: number) => Promise<void>;
    /** `true` quand l'attente commence (un dépôt est en cours), `false` juste avant l'émission : le message s'efface. */
    signaler?: (enAttente: boolean) => void;
  } = {},
): Promise<boolean> {
  const { delaiMs = DELAI_MAX_ATTENTE_PHOTO_MS, attendre = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), signaler } = options;
  if (depotPhoto !== null) {
    signaler?.(true);
    await Promise.race([depotPhoto.then(() => undefined, () => undefined), attendre(delaiMs)]);
    signaler?.(false);
  }
  return emettre();
}
