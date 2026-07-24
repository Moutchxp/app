import 'server-only';
import { createHash } from 'node:crypto';
import { query } from '../db/client';

/**
 * THROTTLE des DEMANDES de réinitialisation de mot de passe (« mot de passe oublié »). Module DISTINCT du throttle de
 * LOGIN (`authThrottle.ts`) : mêmes TABLE (`internaute_login_echec`, un log générique de paires (clé hachée, ts)) et
 * même MÉCANISME (fenêtre glissante + backoff exponentiel plafonné), mais trois différences assumées :
 *   1. ESPACE DE CLÉS DISJOINT — préfixe `reset:` DANS LE PRÉIMAGE du hash → jamais mélangé avec la clé de login
 *      (`sha256(email)`). Un login échoué ne consomme pas le quota de reset, ni l'inverse.
 *   2. SÉMANTIQUE « compter TOUTES les demandes » — aucun `noterSucces` : une demande réussie compte comme les autres
 *      (contrairement au login, où le succès purge le compteur).
 *   3. TUNING PROPRE, bien plus permissif (cadence d'un e-mail, pas d'une saisie de mot de passe).
 *
 * FAIL-SAFE (comme le login) : une erreur DB ne bloque JAMAIS une demande légitime. Jamais d'e-mail ni d'empreinte loggés.
 *
 * ORDRE D'APPEL (côté route, commit suivant) : normaliser l'e-mail → `verifierThrottleReset` → si bloqué, refuser →
 * sinon `noterDemandeReset` PUIS résoudre si un compte existe. Le throttle s'applique AVANT de savoir si l'e-mail a un
 * compte, sinon on crée un oracle de timing sur l'existence.
 */

/** Demandes LIBRES dans la fenêtre avant le début du backoff (couvre le « 2-3 fois » d'un humain légitime). */
const SEUIL_RESET = 3;
/** Fenêtre de comptage (s) — 1 h : cadence d'un envoi d'e-mail, pas d'une saisie de mot de passe. */
const FENETRE_RESET_S = 3600;
/** Délai de base du backoff (s) après le seuil : la 1re demande excédentaire attend ~1 min. */
const BASE_RESET_S = 60;
/** Plafond du backoff (s) — 1 h : un abuseur reste borné, JAMAIS de lockout dur. */
const MAX_RESET_S = 3600;

/**
 * Clé de throttle des demandes de reset = `SHA-256 hex` de `reset:` + e-mail normalisé (trim + minuscules). Le préfixe
 * DANS LE PRÉIMAGE rend la clé DISJOINTE de la clé de login sans changer sa forme (64-hex, même index) ; l'e-mail n'est
 * jamais en clair en base. Disjonction garantie par la résistance aux collisions de SHA-256 (même hypothèse que le login).
 */
export function cleThrottleReset(email: string): string {
  return createHash('sha256').update(`reset:${email.trim().toLowerCase()}`, 'utf8').digest('hex');
}

/** Délai requis (s) après `demandes` dans la fenêtre : 0 sous le seuil, sinon `BASE·2^(demandes−SEUIL)` plafonné MAX. PUR. */
export function delaiPourReset(demandes: number): number {
  if (demandes < SEUIL_RESET) return 0;
  const exp = Math.min(demandes - SEUIL_RESET, 40); // anti-overflow flottant (2^40 dépasse déjà MAX_RESET_S)
  return Math.min(MAX_RESET_S, Math.round(BASE_RESET_S * 2 ** exp));
}

export interface VerdictThrottle {
  bloque: boolean;
  retryAfter: number; // secondes à attendre ; 0 si non bloqué
}

/**
 * Verdict de throttle pour une clé hachée de reset, d'après ses demandes récentes dans la fenêtre. FAIL-SAFE : toute
 * erreur DB → `{ bloque:false }` (on n'enferme jamais un demandeur légitime dehors pour un hoquet DB).
 */
export async function verifierThrottleReset(cle: string): Promise<VerdictThrottle> {
  try {
    const r = await query<{ n: number; dernier: string | null }>(
      `SELECT count(*)::int AS n, max(ts) AS dernier
         FROM internaute_login_echec
        WHERE cle_hachee = $1 AND ts > now() - ($2 || ' seconds')::interval`,
      [cle, FENETRE_RESET_S],
    );
    const n = r.rows[0]?.n ?? 0;
    const dernier = r.rows[0]?.dernier;
    const requis = delaiPourReset(n);
    if (requis === 0 || !dernier) return { bloque: false, retryAfter: 0 };
    const ecouleS = (Date.now() - new Date(dernier).getTime()) / 1000;
    if (ecouleS >= requis) return { bloque: false, retryAfter: 0 }; // délai écoulé depuis la dernière demande
    return { bloque: true, retryAfter: Math.ceil(requis - ecouleS) };
  } catch {
    return { bloque: false, retryAfter: 0 }; // FAIL-SAFE : jamais de blocage d'une demande légitime
  }
}

/**
 * Enregistre UNE demande de reset (compte TOUTES les demandes — aucun reset-sur-succès). Best-effort : ne throw JAMAIS
 * (on ne prive pas un internaute de son e-mail pour un hoquet d'écriture). Aucun e-mail ni empreinte loggés.
 */
export async function noterDemandeReset(cle: string): Promise<void> {
  try {
    await query(`INSERT INTO internaute_login_echec (cle_hachee, ts) VALUES ($1, now())`, [cle]);
  } catch {
    /* best-effort */
  }
}
