import 'server-only';
import { capaciteModifPermis, permsDuCompte, type CompteDB } from './comptes';
import type { SessionAdmin } from './session';
import { empreinteMotDePasse, lireEtatCompte } from './etatSession';

/**
 * LA SESSION D'UN COMPTE, telle que la connexion l'ouvre — une seule source pour la connexion (`/api/admin/session`) et le
 * « mot de passe oublié » (`/api/admin/reinitialiser`, Arno 24/10/2026) : rôle, droits, « doit changer », capacité Permis, et
 * (audit points 4-5) l'empreinte du mot de passe et la version de session que le proxy compare à la base à chaque requête.
 */
export async function sessionPourCompte(compte: CompteDB): Promise<SessionAdmin> {
  return {
    sub: compte.id,
    identifiant: compte.identifiant,
    role: compte.role,
    perms: permsDuCompte(compte),
    doitChanger: compte.doit_changer_mot_de_passe, // M3-4 Lot B : le drapeau entre dans le JWS
    peutModifierPermis: capaciteModifPermis(compte), // RATT-EDIT lot A3 — capacité EFFECTIVE (subordination incluse) portée dans le JWS
    // AUDIT POINTS 4-5 : empreinte du mot de passe et version de session, que le proxy compare à la base à chaque requête.
    empreinteMdp: empreinteMotDePasse(compte.mot_de_passe),
    versionSession: (await lireEtatCompte(compte.id).catch(() => null))?.versionSession ?? undefined,
  };
}
