import 'server-only';
import { cookies } from 'next/headers';
import { query } from '../db/client';
import { NOM_COOKIE, verifierJeton, sessionDepuisPayload, type Module } from './session';

/**
 * Defense in depth (M3 Lot 2e). `proxy.ts` reste la garde PRINCIPALE (il refuse déjà l'accès sans la
 * permission), mais une route peut vérifier une SECONDE fois côté serveur, au cas où le matcher du proxy
 * changerait. Renvoie `true` si la session courante porte la permission `module`, `false` sinon (cookie
 * absent/invalide/expiré, ou collaborateur sans la permission). Un administrateur a toujours `true`
 * (permissions implicites, cf. sessionDepuisPayload).
 */
export async function aLaPermission(module: Module): Promise<boolean> {
  const jeton = (await cookies()).get(NOM_COOKIE)?.value;
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return false;
  return sessionDepuisPayload(payload).perms[module];
}

/** Extrait la valeur d'un cookie du header `Cookie` brut de la requête (sans dépendance `next/headers`). */
function lireCookie(request: Request, nom: string): string | null {
  const brut = request.headers.get('cookie');
  if (!brut) return null;
  for (const part of brut.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === nom) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Réponse 403 de révocation. Code machine STABLE `ACCES_REVOQUE` pour l'UI ; AUCUNE cause précise
 *  (actif ? perm ? supprimé ?) → pas de fuite d'énumération. */
function refusRevoque(): Response {
  return Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403 });
}

/** Réponse 403 « interdit » (tuile Administratif réservée au rôle administrateur). Générique, sans cause. */
function refusInterdit(): Response {
  return Response.json({ erreur: 'INTERDIT' }, { status: 403 });
}

/** Résultat de `exigerAdministrateur` : soit un refus à retourner tel quel, soit l'`auteurId` (sub) autorisé. */
export type GardeAdmin = { refus: Response } | { auteurId: number | null };

/**
 * DEUXIÈME BARRIÈRE de la tuile « Administratif » (M3-4 Lot C). `proxy.ts` garde déjà `/admin/comptes` par le
 * rôle du JWS, mais ce jeton vit ≤ 8 h : un rôle rétrogradé EN BASE après l'émission y resterait `administrateur`.
 * Ce garde RELIT donc `role` + `actif` en base à chaque handler d'administration des comptes. Indispensable :
 * sans lui, un compte fraîchement rétrogradé garderait le pouvoir d'administrer les comptes pendant 8 h.
 *
 * RÈGLE D'OR : `sub === null` (voie de secours / jeton legacy) → administrateur, autorisé SANS requête,
 * `auteurId = null` (auteur inconnu au journal). Sinon : `SELECT role, actif WHERE id=sub` ; refus (403 INTERDIT)
 * si compte absent, désactivé, ou rôle ≠ administrateur. Une seule requête, lecture seule.
 */
export async function exigerAdministrateur(request: Request): Promise<GardeAdmin> {
  const jeton = lireCookie(request, NOM_COOKIE);
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return { refus: refusInterdit() };

  const session = sessionDepuisPayload(payload);
  if (session.sub === null) return { auteurId: null }; // voie de secours = administrateur (auteur inconnu)

  const { rows } = await query<{ actif: boolean; role: string }>(
    `SELECT actif, role FROM admin_utilisateur WHERE id = $1`,
    [session.sub],
  );
  const compte = rows[0];
  if (!compte || !compte.actif || compte.role !== 'administrateur') return { refus: refusInterdit() };
  return { auteurId: session.sub };
}

/**
 * Révocation IMMÉDIATE sur une route d'ÉCRITURE (M3-0). `proxy.ts` autorise d'après le JWS, figé jusqu'à
 * 8 h ; ce garde relit l'état RÉEL du compte en base à chaque écriture, pour que la désactivation d'un
 * compte ou le retrait d'une permission coupe l'accès au prochain appel — sans attendre l'expiration du jeton.
 *
 * À appeler EN TÊTE de chaque handler mutant, AVANT toute écriture et toute lecture métier :
 *   const refus = await exigerCompteActif(request, 'curation'); if (refus) return refus;
 *
 * RÈGLE D'OR (prioritaire sur tout) : `sub === null` = VOIE DE SECOURS (mot de passe partagé) ou jeton
 * legacy sans `sub` → administrateur → AUTORISÉ SANS AUCUNE REQUÊTE. Ne JAMAIS dériver un refus d'un
 * « 0 ligne » : un `WHERE id = null` (0 ligne) enfermerait Arno dehors. C'est le cas testé en priorité.
 *
 * Renvoie `null` si l'écriture est autorisée, ou une réponse 403 `ACCES_REVOQUE` à retourner telle quelle.
 * Une seule requête en base (aucun N+1), en LECTURE SEULE (SELECT de colonnes existantes).
 */
export async function exigerCompteActif(request: Request, module: Module): Promise<Response | null> {
  const jeton = lireCookie(request, NOM_COOKIE);
  const payload = jeton ? await verifierJeton(jeton) : null;
  if (!payload) return refusRevoque(); // pas de session valide (proxy aurait déjà bloqué ; defense in depth)

  const session = sessionDepuisPayload(payload);
  // RÈGLE D'OR : voie de secours / jeton legacy sans sub → autoriser SANS requête (jamais de refus « 0 ligne »).
  if (session.sub === null) return null;

  // Compte nommé : relire l'état RÉEL. `module` appartient à l'union fermée `Module` → nom de colonne sûr.
  const colonne = `perm_${module}`;
  const { rows } = await query<{ actif: boolean; role: string; perm: boolean }>(
    `SELECT actif, role, ${colonne} AS perm FROM admin_utilisateur WHERE id = $1`,
    [session.sub],
  );
  const compte = rows[0];
  if (!compte) return refusRevoque(); // compte supprimé
  if (!compte.actif) return refusRevoque(); // compte désactivé
  // `=== 'administrateur'` (strict) plutôt que `!== 'collaborateur'` : choix FAIL-CLOSED. La colonne `role` est
  // verrouillée par le CHECK de 014 (role IN 'administrateur'|'collaborateur'), donc les deux formulations
  // coïncident aujourd'hui ; si une 3e valeur de rôle apparaissait, ce garde REFUSERAIT (direction sûre : pas
  // d'escalade), à réaligner alors explicitement avec sessionDepuisPayload.
  if (compte.role === 'administrateur') return null; // administrateur ⇒ toutes permissions
  if (!compte.perm) return refusRevoque(); // collaborateur dont la permission a été retirée
  return null;
}
