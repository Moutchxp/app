import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/** Modules de la barre latérale = les permissions granulaires (M3). Ordre = ordre du menu.
 *  RATT-EDIT (lot A2) : 'permis' rejoint les 6 modules historiques → « Permis de construire » devient un module GARDÉ par
 *  collaborateur (colonne perm_permis, migration 225), au lieu d'être réservé au rôle administrateur.
 *  GESTION (lot 2) : 'gestion' rejoint la liste sur le MÊME patron (colonne perm_gestion, migration 228). Le module porte des
 *  données personnelles de locataires — un accès « tout compte authentifié » n'est pas tenable. AJOUT PUR : aucun module
 *  existant n'est retiré, renommé ni réordonné. */
export const MODULES = ['pilotage', 'cartes_annee', 'statistiques', 'internautes', 'curation', 'banc_test', 'permis', 'gestion'] as const;
export type Module = (typeof MODULES)[number];
export type Perms = Record<Module, boolean>;
export type RoleAdmin = 'administrateur' | 'collaborateur';

/** Session admin résolue (permissions EFFECTIVES). Un administrateur a toutes les permissions, implicitement. */
export interface SessionAdmin {
  sub: number | null; // id du compte admin_utilisateur ; null pour la VOIE DE SECOURS (mot de passe partagé)
  identifiant: string | null;
  role: RoleAdmin;
  perms: Perms;
  // Drapeau de première connexion (M3-4 Lot B). true ⇒ l'utilisateur DOIT changer son mot de passe avant tout accès
  // (redirection appliquée dans proxy.ts). VOIE DE SECOURS (sub=null) ⇒ TOUJOURS false (jamais piégée, règle d'or).
  doitChanger: boolean;
  // RATT-EDIT (lot A3) — CAPACITÉ « modifier un permis après validation » (perm_permis_modif && perm_permis, ou administrateur).
  //   HORS MODULES : ce n'est pas une zone gardée mais un GESTE. Portée dans le JWT pour l'UI (bouton « Modifier » du lot B2). La
  //   GARDE serveur relit la base à chaque geste (retrait immédiat) — le JWT ne fait pas foi seul. Administrateur → true.
  peutModifierPermis: boolean;
}

/** Toutes permissions à true (administrateur, ou voie de secours). */
export function permsToutes(): Perms {
  return { pilotage: true, cartes_annee: true, statistiques: true, internautes: true, curation: true, banc_test: true, permis: true, gestion: true };
}

/** Toutes permissions à false (collaborateur par défaut ; complétées au Lot 4). */
export function permsAucune(): Perms {
  return { pilotage: false, cartes_annee: false, statistiques: false, internautes: false, curation: false, banc_test: false, permis: false, gestion: false };
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
  // RÈGLE D'OR : sub=null (voie de secours) ⇒ doitChanger FORCÉ à false, jamais lu depuis l'appelant → jamais piégé.
  const doitChanger = session.sub === null ? false : session.doitChanger;
  // RATT-EDIT (lot A3) — la capacité de modif entre dans le JWS (valeur EFFECTIVE calculée à la connexion : administrateur/secours → true).
  const jwt = new SignJWT({ identifiant: session.identifiant, role: session.role, perms: session.perms, doitChanger, peutModifierPermis: session.peutModifierPermis })
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
 * Résout la session EFFECTIVE d'un payload vérifié — FAIL-CLOSED (item M1, audit 21/09) :
 *  - `role === 'administrateur'` → administrateur, TOUTES permissions ;
 *  - `role === 'collaborateur'`  → collaborateur, permissions EXPLICITES du jeton ;
 *  - TOUT LE RESTE (rôle absent, valeur inconnue, ancien `role:'admin'`, payload forgé/vide) → collaborateur SANS
 *    AUCUNE PERMISSION → les gardes refusent. Un jeton signé mais MAL FORMÉ n'est donc JAMAIS administrateur « par
 *    défaut » : le rôle administrateur doit être une claim POSITIVE explicite (défense en profondeur : borne le rayon
 *    d'une fuite du secret de signature). Tous les jetons légitimes portent role 'administrateur'/'collaborateur'
 *    explicite (signerJeton, y compris la voie de secours — session/route.ts:107) ; les jetons pré-M3 sans rôle sont
 *    expirés depuis longtemps (TTL 8 h) → le seul effet possible d'un jeton non conforme est une reconnexion.
 */
export function sessionDepuisPayload(payload: JWTPayload): SessionAdmin {
  const role: RoleAdmin = payload.role === 'administrateur' ? 'administrateur' : 'collaborateur';
  const perms: Perms = payload.role === 'administrateur' ? permsToutes()
    : payload.role === 'collaborateur' ? permsDepuis(payload.perms)
    : permsAucune(); // rôle inconnu/absent → collaborateur SANS permission (fail-closed) : les gardes refuseront
  const subNum = typeof payload.sub === 'string' && payload.sub !== '' ? Number(payload.sub) : null;
  const sub = subNum !== null && Number.isFinite(subNum) ? subNum : null;
  const identifiant = typeof payload.identifiant === 'string' ? payload.identifiant : null;
  // doitChanger : voie de secours (sub=null) → false FORCÉ ; jeton LEGACY sans le champ → false (tolérant, fail-open
  // ASSUMÉ sur ce seul champ : un jeton antérieur appartient à un compte déjà établi qui n'a pas à être piégé).
  // Sinon la valeur signée. Conséquence acceptée (Q1=MVP) : remettre doit_changer=true en base n'affecte pas une
  // session déjà ouverte (le drapeau vit dans le JWS pour ≤ 8 h) ; l'enforcement s'applique dès la prochaine connexion.
  const doitChanger = sub === null ? false : payload.doitChanger === true;
  // RATT-EDIT (lot A3) — capacité de modif : administrateur (rôle) ⇒ true ; sinon la valeur signée (jeton legacy sans le champ ⇒ false, sûr).
  //   La GARDE serveur (exigerCapaciteModif) relit la base à chaque geste — cette valeur JWT sert l'UI, jamais seule à autoriser un geste.
  const peutModifierPermis = role === 'administrateur' ? true : payload.peutModifierPermis === true;
  return { sub, identifiant, role, perms, doitChanger, peutModifierPermis };
}
