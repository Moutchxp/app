/**
 * MODULE « GESTION » — LOT 5-PJ-C2 : OBTENIR UN JETON DRIVE AU NOM D'UN COLLABORATEUR.
 *
 * 🔴 LE JETON EST DEMANDÉ POUR UN `subject` — l'adresse du collaborateur — et Google applique ensuite SES droits.
 * Aucune liste de droits n'est recopiée chez nous : c'est le principe du lot précédent, tenu sans lui demander de
 * cliquer sur quoi que ce soit.
 *
 * 🔒 LA CLÉ DU COMPTE DE SERVICE NE SORT JAMAIS : ni dans une réponse HTTP, ni dans un journal, ni dans un message
 * d'erreur. Ce module ne rend qu'un jeton d'accès (qui, lui, ne quitte pas non plus le serveur) ou un motif en
 * français.
 */
import {
  construireAssertion, corpsEchange, lireCleService, motifRefus, ENDPOINT_TOKEN, SCOPE_DRIVE,
} from './compteService';

export type IssueJetonDelegue =
  | { ok: true; jeton: string }
  /** Rien n'est configuré de NOTRE côté (clé absente) : l'administrateur n'a pas fini. */
  | { ok: false; cause: 'non_configure'; motif: string }
  /** Google a refusé : délégation non déclarée, compte inconnu, compte suspendu. Le motif le dit. */
  | { ok: false; cause: 'refus'; motif: string };

/**
 * LE CACHE DES JETONS, par subject.
 *
 * Un jeton d'accès vaut une heure. Sans cache, chaque clic du sélecteur signerait une attestation et ferait un
 * aller-retour de plus chez Google — pour rien, et en multipliant les occasions d'être ralenti par lui. La marge de
 * 60 secondes évite de servir un jeton qui expirerait pendant la requête qu'il autorise.
 *
 * ⚠️ EN MÉMOIRE DU PROCESSUS, délibérément : un jeton est un secret de courte vie, il n'a rien à faire en base, et
 * un redémarrage n'a pas à s'en souvenir.
 */
const cache = new Map<string, { jeton: string; expireA: number }>();
const MARGE_MS = 60_000;

/** Pour les tests : oublie les jetons mémorisés. Sans effet en production, où rien ne l'appelle. */
export function oublierJetons(): void {
  cache.clear();
}

/**
 * UN JETON DRIVE AU NOM DE `subject`.
 *
 * ⚠️ `subject` DOIT venir de la session, jamais du navigateur. Ce module ne peut pas le vérifier — c'est l'appelant
 * qui en répond (`jetonCollaborateur.ts`), et c'est là qu'un test le tient.
 */
export async function jetonPourSubject(
  subject: string,
  deps: { fetch: typeof fetch; maintenant?: () => Date } = { fetch },
): Promise<IssueJetonDelegue> {
  const adresse = (subject ?? '').trim().toLowerCase();
  if (adresse === '' || !adresse.includes('@')) {
    return { ok: false, cause: 'refus', motif: 'Aucune adresse professionnelle n’est associée à cet accès.' };
  }

  const maintenant = (deps.maintenant ?? (() => new Date()))();
  const memorise = cache.get(adresse);
  if (memorise && memorise.expireA - MARGE_MS > maintenant.getTime()) return { ok: true, jeton: memorise.jeton };

  const cle = lireCleService();
  if (cle === null) {
    return {
      ok: false, cause: 'non_configure',
      motif: 'Drive pas encore configuré par l’administrateur.',
    };
  }

  try {
    const res = await deps.fetch(ENDPOINT_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpsEchange(construireAssertion({ cle, subject: adresse, scope: SCOPE_DRIVE, maintenant })),
    });
    const j = (await res.json().catch(() => ({}))) as
      { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || j.error || !j.access_token) {
      // 🔴 ON NE MÉMORISE PAS UN REFUS. Une délégation qu'Arno vient d'activer doit marcher au clic suivant, pas
      //   dans une heure — et un compte réactivé de même.
      return { ok: false, cause: 'refus', motif: motifRefus(j.error, j.error_description) };
    }
    const duree = (typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 3600) * 1000;
    cache.set(adresse, { jeton: j.access_token, expireA: maintenant.getTime() + duree });
    return { ok: true, jeton: j.access_token };
  } catch {
    return { ok: false, cause: 'refus', motif: 'Le Drive n’a pas répondu — à réessayer dans un moment.' };
  }
}
