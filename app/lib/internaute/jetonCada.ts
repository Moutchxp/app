/**
 * X5 / F1 — CAPACITÉ DE SIGNATURE du jeton de CONFIRMATION de saisine CADA, EXTRAITE de `jetonRectification.ts` pour être
 * importable par un SCRIPT SERVEUR (moteur de veille : `app/scripts/veille-run.ts` → `propositionAuto`) SANS traverser
 * `import 'server-only'` — ce dernier LÈVE hors bundle react-server (tsx / node standard), ce qui tuait `npm run veille:run`.
 *
 * ⚠️ Ce module NE porte PAS `server-only`, À DESSEIN : il est sur le chemin d'un CLI serveur légitime (un CLI n'est PAS un
 * bundle client). On n'y expose QUE la signature CADA + la dérivation de clé partagée. Les capacités client-sensibles
 * (rectification / émission / retrait) ET le VÉRIFICATEUR CADA restent dans `jetonRectification.ts`, sous `server-only`.
 * AUCUN secret n'est écrit ici : la clé est lue à l'exécution depuis `process.env.INTERNAUTE_TOKEN_SECRET` (jamais inlinée
 * côté client par Next, qui n'inline que `NEXT_PUBLIC_*`). AUCUN import moteur / analytics (cloisonnement M2 préservé).
 * INVARIANT : ce fichier ne doit importer AUCUN module portant `server-only`, ni directement ni transitivement.
 */
import { SignJWT } from 'jose';

/**
 * Portée fermée du jeton de CONFIRMATION de saisine CADA (X5, voie e-mail interne). STRICTEMENT distincte des trois autres
 * capacités — même secret, scopes séparés : un jeton de confirmation n'ouvre NI rectification NI émission NI retrait, et
 * l'inverse (chaque vérifieur exige SON scope). Son `sub` scelle l'id (numérique) de la DEMANDE ; la page publique n'agit
 * que sur CET id vérifié, jamais un id du client.
 */
export const SCOPE_CADA = 'confirm-cada';
/** Durée de vie du jeton de confirmation CADA : 7 JOURS (il voyage dans un e-mail lu quand l'exploitant a le temps). */
const EXPIRATION_CADA = '7d';

/** Clé de signature dérivée du secret DÉDIÉ. Échoue proprement si la variable manque (fail-safe, jamais de repli sur le secret admin). */
export function cleSignature(): Uint8Array {
  const secret = process.env.INTERNAUTE_TOKEN_SECRET;
  if (!secret) {
    throw new Error('INTERNAUTE_TOKEN_SECRET manquant : impossible de signer/vérifier un jeton de rectification.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Frappe un jeton-capacité de CONFIRMATION de saisine CADA (X5) scellant l'id de la DEMANDE (`sub`, scope `confirm-cada`,
 * exp 7 jours). Capacité ÉTROITE : elle n'autorise QUE l'ouverture de la page de confirmation de CETTE demande — l'ACTE
 * (lancer la saisine) part d'un POST déclenché par un clic humain sur cette page, JAMAIS du seul chargement du lien.
 */
export async function signerJetonCada(demandeId: number): Promise<string> {
  return new SignJWT({ scope: SCOPE_CADA })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(demandeId))
    .setIssuedAt()
    .setExpirationTime(EXPIRATION_CADA)
    .sign(cleSignature());
}
