import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/** Modules de la barre latérale = les 6 permissions granulaires (M3). Ordre = ordre du menu. */
export const MODULES = ['pilotage', 'cartes_annee', 'statistiques', 'internautes', 'curation', 'banc_test'] as const;
export type Module = (typeof MODULES)[number];
export type Perms = Record<Module, boolean>;
export type RoleAdmin = 'administrateur' | 'collaborateur';

/** Session admin résolue (permissions EFFECTIVES). Un administrateur a toutes les permissions, implicitement. */
export interface SessionAdmin {
  sub: number | null; // id du compte admin_utilisateur ; null pour la VOIE DE SECOURS (mot de passe partagé)
  identifiant: string | null;
  role: RoleAdmin;
  perms: Perms;
}

/** Toutes permissions à true (administrateur, ou voie de secours). */
export function permsToutes(): Perms {
  return { pilotage: true, cartes_annee: true, statistiques: true, internautes: true, curation: true, banc_test: true };
}

/** Toutes permissions à false (collaborateur par défaut ; complétées au Lot 4). */
export function permsAucune(): Perms {
  return { pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false };
}

/** Nom du cookie de session admin. */
export const NOM_COOKIE = 'svv_admin_session';

/** Durée de vie de la session : 8 heures (D2 / EX-18). */
export const TTL_SECONDES = 8 * 3600;

/**
 * Options du cookie de session admin.
 * `secure` dépend de l'environnement (HTTPS en prod uniquement).
 * `path:'/'` OBLIGATOIRE pour que le cookie soit envoyé sur tout le périmètre admin/api.
 */
export function optionsCookie(prod: boolean) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: prod,
    path: '/',
    maxAge: TTL_SECONDES,
  };
}

/**
 * Clé de signature dérivée de `ADMIN_SESSION_SECRET`.
 * STATELESS : lue à CHAQUE appel (aucun cache mutable au niveau module). Throw si absente.
 */
function cleSignature(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET manquant : impossible de signer/vérifier la session admin.');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Signe un jeton de session admin (JWS `jose`, HS256, exp 8 h). Porte le compte (`sub`/`identifiant`), le `role`
 * et les `perms` EFFECTIVES, plus un `jti` (UUID opaque de session, tracé dans le journal — jamais une personne).
 * `sub === null` = VOIE DE SECOURS (mot de passe partagé) ; on ne pose alors pas la claim standard `sub`.
 */
export async function signerJeton(session: SessionAdmin): Promise<string> {
  const jwt = new SignJWT({ identifiant: session.identifiant, role: session.role, perms: session.perms })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime('8h');
  if (session.sub !== null) jwt.setSubject(String(session.sub));
  return jwt.sign(cleSignature());
}

/**
 * Vérifie un jeton de session admin.
 * Retourne le payload si valide, `null` en cas d'erreur (signature invalide, expiration, etc.).
 */
export async function verifierJeton(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, cleSignature(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

/** Reconstruit les permissions d'un jeton (objet `perms` brut) — chaque module absent/non-`true` → false. */
function permsDepuis(brut: unknown): Perms {
  const o = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : {};
  const p = permsAucune();
  for (const m of MODULES) p[m] = o[m] === true;
  return p;
}

/**
 * Résout la session EFFECTIVE d'un payload vérifié, de façon TOLÉRANTE :
 *  - `role === 'collaborateur'` → collaborateur, permissions EXPLICITES du jeton ;
 *  - tout le reste (ancien jeton `role:'admin'`, `role:'administrateur'`, ou rôle absent) → ADMINISTRATEUR,
 *    toutes permissions à true. Ainsi un jeton antérieur à M3 (sans sub/perms) reste un administrateur complet
 *    (les sessions ouvertes ne cassent pas), et la voie de secours est un administrateur.
 */
export function sessionDepuisPayload(payload: JWTPayload): SessionAdmin {
  const role: RoleAdmin = payload.role === 'collaborateur' ? 'collaborateur' : 'administrateur';
  const perms: Perms = role === 'administrateur' ? permsToutes() : permsDepuis(payload.perms);
  const subNum = typeof payload.sub === 'string' && payload.sub !== '' ? Number(payload.sub) : null;
  const sub = subNum !== null && Number.isFinite(subNum) ? subNum : null;
  const identifiant = typeof payload.identifiant === 'string' ? payload.identifiant : null;
  return { sub, identifiant, role, perms };
}
