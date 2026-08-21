/**
 * CORRECTIF « boucle d'auto-alerte » — SIGNAL d'AUTO-ÉMISSION. Module PUR (aucune dépendance lourde : ni nodemailer ni base) pour
 * qu'il soit importable À LA FOIS par l'émission (email/index) ET par la relève (veille/releveReponses) sans traîner nodemailer
 * dans le graphe node-pur des tests de relève.
 *
 * POURQUOI : nos e-mails automatiques (alertes T7-B, alerte GED G1, récapitulatif, relances) partent de noreply@ vers la boîte
 * que la relève LIT. Ils citent la référence de la mairie (corps forwardé) → l'ancien prédicat de rétention les retenait, la
 * cascade les rattachait, T7-A les classait → nouvelle alerte → boucle. On les IGNORE en amont de toute rétention. DEUX signaux :
 *   1. cet EN-TÊTE, posé à l'émission — le filet SÛR : il voyage avec le message même si l'adresse d'expédition change ;
 *   2. l'adresse d'expéditeur (MAIL_FROM) — filet de repli pour les messages DÉJÀ en boîte, émis avant l'ajout de l'en-tête.
 */

/** En-tête d'auto-identification posé sur TOUS nos envois automatiques. Lu à la relève (comparaison insensible à la casse). */
export const ENTETE_AUTO_EMISSION = 'X-SVAV-Auto';
/** Valeur de l'en-tête — présence non vide = « émis par nous » (une valeur stable, jamais un secret). */
export const VALEUR_AUTO_EMISSION = 'sans-vis-a-vis-emission-automatique';

/**
 * Un message ENTRANT a-t-il été émis par NOUS ? (1) porte l'en-tête d'auto-émission (voyage avec le message), OU (2) son
 * expéditeur est une de NOS adresses (repli pour les messages déjà en boîte, sans en-tête). PUR — aucune I/O.
 */
export function estEmisParNous(deAdresse: string, entetes: Record<string, string> | undefined, adressesNous: readonly string[]): boolean {
  if (entetes) {
    const cible = ENTETE_AUTO_EMISSION.toLowerCase();
    for (const cle of Object.keys(entetes)) if (cle.toLowerCase() === cible && (entetes[cle] ?? '').trim() !== '') return true; // signal 1 : en-tête
  }
  const de = deAdresse.trim().toLowerCase();
  return de !== '' && adressesNous.some((a) => a.trim().toLowerCase() === de); // signal 2 : adresse d'expéditeur
}
