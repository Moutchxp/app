import 'server-only';
import { createHash } from 'node:crypto';
import { query } from '../db/client';

/**
 * ANTI-FORCE-BRUTE de la connexion INTERNAUTE. SÉPARÉ de l'admin (`login_echec`/`antiBruteforce.ts`, pool analytique,
 * sans-PII) : ici POOL APPLICATIF + table `internaute_login_echec`, keyée par un HACHÉ de l'e-mail (SHA-256 hex de
 * lower(email)) — JAMAIS l'e-mail en clair (donnée personnelle). Throttle PROGRESSIF (backoff plafonné), JAMAIS un
 * lockout dur ; FAIL-SAFE (erreur DB → ne bloque pas un login légitime). Défauts alignés sur l'admin (021).
 */
const SEUIL = 5;
const FENETRE_S = 900;
const BASE_S = 2;
const MAX_S = 300;

/** Clé de throttle = SHA-256 hex de l'e-mail normalisé (trim + minuscules). Pseudonyme : jamais l'e-mail en clair en base. */
export function cleThrottle(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');
}

/** Délai requis (s) après `echecs` dans la fenêtre : 0 sous le seuil, sinon backoff `BASE·2^(echecs-SEUIL)` plafonné à
 *  MAX_S. PUR & déterministe. (Ré-implémenté dans le domaine internaute plutôt qu'importé du module admin/analytique.) */
export function delaiPour(echecs: number): number {
  if (echecs < SEUIL) return 0;
  const exp = Math.min(echecs - SEUIL, 40); // 2^40 dépasse déjà tout MAX_S réaliste (anti-overflow flottant)
  return Math.min(MAX_S, Math.round(BASE_S * 2 ** exp));
}

export interface VerdictThrottle {
  bloque: boolean;
  retryAfter: number; // secondes à attendre ; 0 si non bloqué
}

/** Verdict de throttle pour une clé hachée, d'après ses échecs récents. FAIL-SAFE : toute erreur DB → `{ bloque:false }`. */
export async function verifierThrottle(cle: string): Promise<VerdictThrottle> {
  try {
    const r = await query<{ n: number; dernier: string | null }>(
      `SELECT count(*)::int AS n, max(ts) AS dernier
         FROM internaute_login_echec
        WHERE cle_hachee = $1 AND ts > now() - ($2 || ' seconds')::interval`,
      [cle, FENETRE_S],
    );
    const n = r.rows[0]?.n ?? 0;
    const dernier = r.rows[0]?.dernier;
    const requis = delaiPour(n);
    if (requis === 0 || !dernier) return { bloque: false, retryAfter: 0 };
    const ecouleS = (Date.now() - new Date(dernier).getTime()) / 1000;
    if (ecouleS >= requis) return { bloque: false, retryAfter: 0 }; // délai écoulé depuis le dernier échec
    return { bloque: true, retryAfter: Math.ceil(requis - ecouleS) };
  } catch {
    return { bloque: false, retryAfter: 0 }; // FAIL-SAFE : jamais de blocage d'un login légitime
  }
}

/** Après un ÉCHEC : enregistre l'échec (état throttle). Best-effort (ne throw jamais). */
export async function noterEchec(cle: string): Promise<void> {
  try {
    await query(`INSERT INTO internaute_login_echec (cle_hachee, ts) VALUES ($1, now())`, [cle]);
  } catch {
    /* best-effort */
  }
}

/** Après un SUCCÈS : purge les échecs de cette clé (RESET du throttle). Best-effort (ne throw jamais). */
export async function noterSucces(cle: string): Promise<void> {
  try {
    await query(`DELETE FROM internaute_login_echec WHERE cle_hachee = $1`, [cle]);
  } catch {
    /* best-effort */
  }
}
