/**
 * 🔴🔴 Arno (15/11/2026, bug de l'envoi final) — LE MESSAGE D'UNE ÉCRITURE QUI ÉCHOUE DIT LA VRAIE PANNE. Avant, toute exception de la
 * route Location devenait « la base n'a pas répondu » — y compris un débordement de pile dans la vérification d'un son, qui n'avait rien à
 * voir avec la base. Seule une vraie erreur PostgreSQL ou de connexion garde ce message ; le reste dit « erreur inattendue du serveur ».
 * Aucun détail technique (ni requête, ni secret) n'est montré. PUR, sans import.
 */
export const MOTIF_BASE_INJOIGNABLE = 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.';
export const MOTIF_ERREUR_SERVEUR = 'Enregistrement impossible : erreur inattendue du serveur (la base n’est pas en cause). Rien n’a été modifié — réessayez, et si cela se reproduit, signalez-le.';

/** L'erreur vient-elle de la base (code SQLSTATE, connexion, délai) ? PUR. */
export function erreurDeLaBase(e: unknown): boolean {
  const x = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  if (typeof x.code === 'string' && /^[0-9A-Z]{5}$/.test(x.code)) return true;
  if (typeof x.code === 'string' && /^(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|57P01)$/.test(x.code)) return true;
  const m = typeof x.message === 'string' ? x.message : '';
  return /Connection terminated|connection timeout|timeout exceeded when trying to connect|Client has encountered a connection error|too many clients/i.test(m);
}
export const messageEcritureImpossible = (e: unknown): string => (erreurDeLaBase(e) ? MOTIF_BASE_INJOIGNABLE : MOTIF_ERREUR_SERVEUR);
