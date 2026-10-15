import { createHmac } from 'node:crypto';
import { queryAnalytics } from '../analytics/pool';
import { sujetVisiteur, SUJET_PARTAGE } from '../cadence/ip';

/**
 * M2 — LOT 7. Détection de FORCE BRUTE par IDENTIFIANT (throttle progressif) + compteurs d'audit AGRÉGÉS.
 * Branché DANS la route de connexion (`app/(admin)/api/admin/session/route.ts`), EN AMONT de la vérification
 * du mot de passe. NE touche PAS `password.ts`/`motDePasse.ts` (byte-unchanged) : il les encadre.
 *
 * INVARIANTS :
 *  - THROTTLE, PAS LOCKOUT DUR : le délai par décision croît (backoff exponentiel) puis PLAFONNE
 *    (`login_throttle_max_s`) ; le throttle s'AUTO-GUÉRIT dès que les échecs cessent (aucun verrou permanent).
 *    ⚠️ Limite ASSUMÉE du throttle par identifiant (complété depuis le 15/10/2026 par une limite par IP, en EMPREINTE
 *    seulement — cf. `cleThrottleIp` ; l'ancienne contrainte « sans IP » (RGPD Q-C=1) est tenue : aucune adresse en
 *    clair, aucune conservation au-delà de la fenêtre) : un attaquant qui connaît
 *    l'identifiant d'un compte NOMMÉ peut, par des échecs soutenus, maintenir CE compte en 429 tant que dure
 *    l'attaque (constat revue F1). Ce n'est pas un lockout permanent, et la CLI `admin:secours` (sur le
 *    serveur) contourne toujours la route. La VOIE DE SECOURS web (identifiant vide) est RETIRÉE depuis le
 *    15/10/2026 (audit point A) : un identifiant vide est refusé, compté sous la clé ''.
 *    argon2 (m=64 Mo, t=3, via `verifier`) est le frein PRIMAIRE du débit de devinettes.
 *  - ANTI-ÉNUMÉRATION : keyé sur la CHAÎNE identifiant (normalisée en minuscules), compte existant OU NON.
 *    La réponse ne révèle jamais l'existence d'un compte ni ne distingue « mauvais mot de passe » de
 *    « compte inexistant ».
 *  - SANS IP, SANS PROFIL : l'état `login_echec` (identifiant, ts) est OPÉRATIONNEL et éphémère (purge cron).
 *    Il n'est JAMAIS lu par la vue d'audit (qui ne lit que les agrégats `analytics_admin_jour`).
 *  - FAIL-SAFE : toute erreur DB (état de détection indisponible) → on N'ALTÈRE PAS le login légitime :
 *    le throttle laisse passer (`bloque:false`), les notes best-effort sont avalées. Jamais de blocage accidentel.
 *  - ISOLATION : pool analytique dédié (`queryAnalytics`, timeouts courts) → une lecture/écriture de throttle
 *    ne peut jamais affamer le pool applicatif ni ralentir une certification.
 */

/** Repli CODÉ sûr si 021 n'est pas (encore) appliquée / config absente. Aligné sur les défauts SQL de 021. */
const DEFAUTS = { seuil: 5, fenetreS: 900, baseS: 2, maxS: 300 } as const;
export interface ConfigThrottle {
  seuil: number;
  fenetreS: number;
  baseS: number;
  maxS: number;
}

/**
 * AUDIT POINT 3 (15/10/2026) — LIMITE PAR ADRESSE IP, en plus de la limite par compte : une seule machine ne peut plus
 * essayer un mot de passe sur des dizaines de comptes. Réglages `login_throttle_ip_seuil` / `login_throttle_ip_fenetre_s`
 * (analytics_config, migration 355 NON appliquée) ; le délai suit `login_throttle_base_s` / `_max_s`. Repli = ces défauts ;
 * une valeur hors PLAGE est ignorée (défaut), jamais appliquée.
 * 🔒 L'ADRESSE N'EST JAMAIS STOCKÉE EN CLAIR : la clé est `ip:` + HMAC-SHA256(adresse) avec le secret serveur
 * (`ADMIN_SESSION_SECRET`) ; ses échecs sont effacés dès qu'ils sortent de la fenêtre (à chaque nouvel échec), et la purge
 * quotidienne de `login_echec` balaie le reste.
 */
export const DEFAUTS_IP = { seuil: 20, fenetreS: 900 } as const;
export const PLAGES_IP = { seuil: [5, 1000], fenetreS: [60, 86400] } as const;
export interface ConfigThrottleIp {
  seuil: number;
  fenetreS: number;
  baseS: number;
  maxS: number;
}

/** Jour civil Europe/Paris 'YYYY-MM-DD' pour le compteur d'audit (identique à writer.jourParis ; local → module autonome). */
function jourParis(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);
}

/** Lit la config throttle (runtime, `analytics_config`), avec repli sûr par clé. Best-effort (erreur → défauts). */
async function lireConfig(): Promise<ConfigThrottle> {
  return (await lireConfigs()).compte;
}

/** Les deux configurations (par compte, par IP) en UNE lecture. Best-effort : erreur → défauts. */
async function lireConfigs(): Promise<{ compte: ConfigThrottle; ip: ConfigThrottleIp }> {
  try {
    const r = await queryAnalytics<{ cle: string; valeur: string }>(
      `SELECT cle, valeur FROM analytics_config
        WHERE cle IN ('login_throttle_seuil','login_throttle_fenetre_s','login_throttle_base_s','login_throttle_max_s',
                      'login_throttle_ip_seuil','login_throttle_ip_fenetre_s')`,
    );
    const m = new Map(r.rows.map((x) => [x.cle, Number(x.valeur)]));
    const val = (cle: string, d: number) => {
      const v = m.get(cle);
      return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d;
    };
    const dansPlage = (cle: string, [min, max]: readonly [number, number], d: number) => {
      const v = m.get(cle);
      return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : d;
    };
    const compte = {
      seuil: val('login_throttle_seuil', DEFAUTS.seuil),
      fenetreS: val('login_throttle_fenetre_s', DEFAUTS.fenetreS),
      baseS: val('login_throttle_base_s', DEFAUTS.baseS),
      maxS: val('login_throttle_max_s', DEFAUTS.maxS),
    };
    return {
      compte,
      ip: {
        seuil: dansPlage('login_throttle_ip_seuil', PLAGES_IP.seuil, DEFAUTS_IP.seuil),
        fenetreS: dansPlage('login_throttle_ip_fenetre_s', PLAGES_IP.fenetreS, DEFAUTS_IP.fenetreS),
        baseS: compte.baseS,
        maxS: compte.maxS,
      },
    };
  } catch {
    return { compte: { ...DEFAUTS }, ip: { ...DEFAUTS_IP, baseS: DEFAUTS.baseS, maxS: DEFAUTS.maxS } };
  }
}

/** Configuration effective de la limite par IP (réglages lus, plages appliquées, repli sûr). Exportée pour les tests. */
export async function lireConfigIp(): Promise<ConfigThrottleIp> {
  return (await lireConfigs()).ip;
}

/**
 * Clé de throttle par ADRESSE d'une requête : `ip:` + HMAC-SHA256 hexadécimal de l'adresse, clé = `ADMIN_SESSION_SECRET`.
 * `null` — et donc AUCUNE limite par IP — si l'adresse n'est pas établie de façon sûre (aucun mandataire de confiance
 * déclaré par `CADENCE_ENTETE_IP`, ou en-tête absent : cf. `cadence/ip.ts`) ou si le secret manque. Sans cette règle, tous
 * les visiteurs partageraient un seul compteur, et quelques échecs d'un inconnu bloqueraient Arno lui-même.
 */
export function cleThrottleIp(requete: Request): string | null {
  const sujet = sujetVisiteur(requete);
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (sujet === SUJET_PARTAGE || !secret) return null;
  return `ip:${createHmac('sha256', secret).update(`login-ip:${sujet}`).digest('hex')}`;
}

/** Comme `verifierThrottle`, pour une clé d'adresse (`cleThrottleIp`), avec la configuration par IP. FAIL-SAFE. */
export async function verifierThrottleIp(cle: string): Promise<VerdictThrottle> {
  try {
    const cfg = await lireConfigIp();
    return await verdictDepuisEchecs(cle, cfg);
  } catch {
    return { bloque: false, retryAfter: 0 };
  }
}

/** Après un échec venu d'une adresse établie : enregistre l'échec sous l'empreinte, puis EFFACE les échecs d'adresse sortis
 *  de la fenêtre (aucune empreinte gardée au-delà de la fenêtre de blocage). Best-effort, ne throw jamais. */
export async function noterEchecIp(cle: string): Promise<void> {
  try {
    const cfg = await lireConfigIp();
    await queryAnalytics(`INSERT INTO login_echec (identifiant, ts) VALUES ($1, now())`, [cle]);
    await queryAnalytics(
      `DELETE FROM login_echec WHERE identifiant LIKE 'ip:%' AND ts <= now() - ($1 || ' seconds')::interval`,
      [cfg.fenetreS],
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Délai REQUIS (s) après `echecs` échecs dans la fenêtre : 0 sous le seuil, sinon backoff exponentiel
 * `base · 2^(echecs-seuil)` PLAFONNÉ à `maxS`. PUR & déterministe (testé). L'exposant est borné (anti overflow
 * de flottant sur un `echecs` absurde) : au-delà, on est de toute façon au plafond.
 */
export function delaiPour(echecs: number, cfg: Pick<ConfigThrottle, 'seuil' | 'baseS' | 'maxS'>): number {
  if (echecs < cfg.seuil) return 0;
  const exp = Math.min(echecs - cfg.seuil, 40); // 2^40 dépasse déjà tout maxS réaliste
  return Math.min(cfg.maxS, Math.round(cfg.baseS * 2 ** exp));
}

export interface VerdictThrottle {
  bloque: boolean;
  retryAfter: number; // secondes à attendre (Retry-After) ; 0 si non bloqué
}

/**
 * Vérifie si l'identifiant (normalisé) est actuellement throttlé, d'après ses échecs récents dans la fenêtre.
 * Best-effort : toute erreur DB → `{ bloque:false }` (FAIL-SAFE : jamais de blocage d'un login légitime si
 * l'état de détection est indisponible). Ne révèle rien sur l'existence d'un compte.
 */
export async function verifierThrottle(identifiant: string): Promise<VerdictThrottle> {
  try {
    const cfg = await lireConfig();
    return await verdictDepuisEchecs(identifiant, cfg);
  } catch {
    return { bloque: false, retryAfter: 0 }; // FAIL-SAFE
  }
}

/** Échecs récents d'une clé dans la fenêtre → verdict (commun aux limites par compte et par IP). */
async function verdictDepuisEchecs(cle: string, cfg: ConfigThrottle): Promise<VerdictThrottle> {
  const r = await queryAnalytics<{ n: number; dernier: string | null }>(
    `SELECT count(*)::int AS n, max(ts) AS dernier
       FROM login_echec
      WHERE identifiant = $1 AND ts > now() - ($2 || ' seconds')::interval`,
    [cle, cfg.fenetreS],
  );
  const n = r.rows[0]?.n ?? 0;
  const dernier = r.rows[0]?.dernier;
  const requis = delaiPour(n, cfg);
  if (requis === 0 || !dernier) return { bloque: false, retryAfter: 0 };
  const ecouleS = (Date.now() - new Date(dernier).getTime()) / 1000;
  if (ecouleS >= requis) return { bloque: false, retryAfter: 0 }; // le délai depuis le dernier échec est écoulé
  return { bloque: true, retryAfter: Math.ceil(requis - ecouleS) };
}

/** Incrément best-effort d'un compteur d'audit AGRÉGÉ (`analytics_admin_jour`) — jour × événement, SANS identifiant. */
async function incrementerAudit(nom: 'admin_connexion' | 'admin_connexion_echec'): Promise<void> {
  try {
    await queryAnalytics(
      `INSERT INTO analytics_admin_jour (jour_paris, nom, n) VALUES ($1::date, $2, 1)
       ON CONFLICT ON CONSTRAINT analytics_admin_jour_dims_uniq DO UPDATE SET n = analytics_admin_jour.n + 1`,
      [jourParis(), nom],
    );
  } catch {
    /* best-effort : l'audit ne bloque JAMAIS le login */
  }
}

/** Après un ÉCHEC de vérification : enregistre l'échec (état throttle) + incrémente l'audit agrégé. Best-effort. */
export async function noterEchec(identifiant: string): Promise<void> {
  try {
    await queryAnalytics(`INSERT INTO login_echec (identifiant, ts) VALUES ($1, now())`, [identifiant]);
  } catch {
    /* best-effort */
  }
  await incrementerAudit('admin_connexion_echec');
}

/** Après un SUCCÈS : purge les échecs de cet identifiant (RESET du throttle) + incrémente l'audit agrégé. Best-effort. */
export async function noterSucces(identifiant: string): Promise<void> {
  try {
    await queryAnalytics(`DELETE FROM login_echec WHERE identifiant = $1`, [identifiant]);
  } catch {
    /* best-effort */
  }
  await incrementerAudit('admin_connexion');
}
