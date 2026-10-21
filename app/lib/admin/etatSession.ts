import 'server-only';
import { createHash } from 'node:crypto';
import { query } from '../db/client';
import { permsAucune, permsToutes, MODULES, type Perms, type RoleAdmin, type SessionAdmin } from './session';

/**
 * ══ AUDIT POINTS 4 ET 5 (15/10/2026) — UNE SESSION VIT AUSSI LONGTEMPS QUE LE COMPTE LE PERMET, PAS PLUS ═════════════════
 *
 * Le trou : le jeton de session (8 h) était seul juge au proxy. Une DÉCONNEXION ne faisait qu'effacer le cookie ; une
 * DÉSACTIVATION, un CHANGEMENT ou une RÉINITIALISATION de mot de passe laissaient le jeton valable ; une TUILE RETIRÉE
 * restait ouverte sur les routes et les pages qui ne relisaient pas la base (curation en lecture, banc de test, config…).
 *
 * Désormais le proxy relit le compte EN BASE à chaque requête de l'admin (une requête indexée par clé primaire) :
 *  · compte absent ou désactivé → session refusée ;
 *  · le jeton porte l'EMPREINTE du mot de passe (`emp`) : si le hash en base a changé (changement, réinitialisation,
 *    `admin:secours`), la session est refusée — sans aucune migration ;
 *  · le jeton porte la VERSION de session (`ver`) : la déconnexion et la désactivation l'incrémentent (colonne
 *    `session_version`, migration 356 NON appliquée ; tant qu'elle manque, ce contrôle est sauté — repli sûr, les deux
 *    précédents restent actifs) ;
 *  · 🔴 Arno (21/10/2026) : droits et rôle EFFECTIFS = ceux de la BASE, relus à chaque requête — un ajout comme un retrait
 *    s'appliquent à la requête suivante, sans reconnexion. (Avant : droits du jeton ∩ droits en base — un retrait valait tout
 *    de suite, mais un AJOUT attendait la prochaine connexion, jusqu'à 8 h : la tuile cochée restait fermée.) Le proxy
 *    réémet alors le jeton avec ces droits (`reemettreJeton`), pour que le menu, les tuiles et les pages qui lisent le
 *    cookie voient les mêmes droits dès cette requête.
 * Un jeton émis avant ce lot (sans `emp`) reste accepté jusqu'à son expiration, mais subit les contrôles en base.
 */

/** Empreinte du HASH argon2 du mot de passe (pas du mot de passe) : 32 caractères hexadécimaux de SHA-256. PUR. */
export function empreinteMotDePasse(hashArgon2: string): string {
  return createHash('sha256').update(hashArgon2).digest('hex').slice(0, 32);
}

/** Ce que la base dit du compte, pour décider d'une session. */
export interface EtatCompte {
  actif: boolean;
  role: RoleAdmin;
  perms: Perms;
  empreinteMdp: string;
  /** `null` tant que la migration 356 (colonne `session_version`) n'est pas appliquée. */
  versionSession: number | null;
}

/** Relit le compte (une requête, clé primaire). `null` si absent. Lève si la base est injoignable (le proxy refuse alors). */
export async function lireEtatCompte(id: number): Promise<EtatCompte | null> {
  const { rows } = await query<Record<string, unknown>>(
    `SELECT u.actif, u.role, u.mot_de_passe,
            ${MODULES.map((m) => `u.perm_${m}`).join(', ')},
            to_jsonb(u) ->> 'session_version' AS version
       FROM admin_utilisateur u WHERE u.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const role: RoleAdmin = r.role === 'administrateur' ? 'administrateur' : 'collaborateur';
  const perms = role === 'administrateur' ? permsToutes() : permsAucune();
  if (role !== 'administrateur') for (const m of MODULES) perms[m] = r[`perm_${m}`] === true;
  const version = r.version === null || r.version === undefined ? null : Number(r.version);
  return {
    actif: r.actif === true,
    role,
    perms,
    empreinteMdp: empreinteMotDePasse(String(r.mot_de_passe ?? '')),
    versionSession: version !== null && Number.isFinite(version) ? version : null,
  };
}

export type MotifRefus = 'compte_absent' | 'compte_inactif' | 'mot_de_passe_change' | 'session_revoquee';
export type VerdictSession = { valide: true; role: RoleAdmin; perms: Perms } | { valide: false; motif: MotifRefus };

/**
 * Une session (jeton vérifié + session résolue) est-elle encore valable face à l'état du compte ? PUR.
 * `payload.emp` / `payload.ver` : claims posées par `signerJeton`. Jeton sans `emp` (émis avant ce lot) → pas de contrôle
 * d'empreinte ; sans `ver` → version 0.
 */
export function verdictSession(payload: Record<string, unknown>, session: SessionAdmin, etat: EtatCompte | null): VerdictSession {
  if (!etat) return { valide: false, motif: 'compte_absent' };
  if (!etat.actif) return { valide: false, motif: 'compte_inactif' };
  if (typeof payload.emp === 'string' && payload.emp !== etat.empreinteMdp) return { valide: false, motif: 'mot_de_passe_change' };
  if (etat.versionSession !== null) {
    const ver = typeof payload.ver === 'number' && Number.isFinite(payload.ver) ? payload.ver : 0;
    if (ver !== etat.versionSession) return { valide: false, motif: 'session_revoquee' };
  }
  // 🔴 Arno (21/10/2026) : la BASE fait foi (rôle et droits actuels) — un ajout s'applique sans reconnexion, un retrait aussi.
  void session;
  const role: RoleAdmin = etat.role === 'administrateur' ? 'administrateur' : 'collaborateur';
  const perms = permsAucune();
  for (const m of MODULES) perms[m] = role === 'administrateur' || etat.perms[m];
  return { valide: true, role, perms };
}

/**
 * Révoque TOUTES les sessions d'un compte : `session_version + 1`. Renvoie `false` (sans erreur) si la migration 356 n'est
 * pas appliquée (colonne absente) ou si le compte n'existe pas. Best-effort : n'empêche jamais le geste qui l'appelle.
 */
export async function revoquerSessions(id: number): Promise<boolean> {
  try {
    const { rowCount } = await query(`UPDATE admin_utilisateur SET session_version = session_version + 1 WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  } catch (e) {
    if ((e as { code?: string })?.code !== '42703') console.error('[admin] révocation des sessions impossible', e);
    return false;
  }
}
