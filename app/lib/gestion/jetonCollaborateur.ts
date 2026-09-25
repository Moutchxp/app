/**
 * MODULE « GESTION » — LOT 5-PJ-C : QUEL JETON GOOGLE POUR CETTE REQUÊTE ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA RÈGLE, ET TOUTE LA RAISON D'ÊTRE DU LOT : le parcours du Drive, la recherche et les DÉPÔTS se font avec le
 * jeton DU COLLABORATEUR CONNECTÉ. C'est donc Google qui applique ses droits, exactement comme sur
 * drive.google.com. Aucune liste de droits n'est recopiée chez nous — elle serait fausse dès le lendemain.
 *
 * 🔴 LE JETON DE `gestion@` N'EST PAS TOUCHÉ, et reste utilisé pour l'ENVOI des mails (lot 5e) et pour la future
 * copie automatique (lot D). Ce fichier ne l'emploie QUE dans un cas, énoncé ci-dessous.
 *
 * LE SEUL CAS OÙ L'ON RETOMBE SUR `gestion@` : la migration 246 n'est pas encore appliquée. Le comportement est
 * alors EXACTEMENT celui d'aujourd'hui — on ne retire aucune fonction en attendant qu'Arno passe la migration. Une
 * fois la table là, le repli disparaît de lui-même, et un collaborateur non connecté voit « Connecter mon Google
 * Drive » au lieu des boutons Drive.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { auteurDeLaRequete } from './auteur';
import { coffreConfigure } from './coffre';
import { lireCompteDe, noterErreurCompte } from './comptesGoogleRepo';
import { lireIdentifiants, rafraichirJeton } from './google';
import { jetonAccesGestion } from './jetonAcces';
import { comptesGoogleDisponibles } from './schema';
import type { EtatCollaborateur } from './googleCollaborateur';

/** Le jeton retenu, et AU NOM DE QUI il agit. L'adresse sert au journal des dépôts. */
export type IssueJeton =
  | { etat: 'ok'; jeton: string; compteGoogle: string; source: 'collaborateur' | 'compte_partage' }
  | { etat: 'refus'; etatCollaborateur: EtatCollaborateur; motif: string };

/**
 * LE JETON À EMPLOYER pour cette requête.
 *
 * L'ordre des questions n'est pas indifférent : on regarde d'abord le SCHÉMA (sinon on proposerait une connexion
 * impossible à enregistrer), puis le COFFRE (sinon on écrirait un jeton qu'on ne saurait pas relire), puis le
 * compte du collaborateur. Chaque refus dit lequel des trois manque — ils ne se réparent pas au même endroit.
 */
export async function jetonPourRequete(request: Request): Promise<IssueJeton> {
  // ── ① Migration absente → comportement d'AVANT, à l'identique. ──
  if (!await comptesGoogleDisponibles()) {
    const partage = await jetonAccesGestion();
    if (partage.etat !== 'ok') {
      return { etat: 'refus', etatCollaborateur: { etat: 'sans_schema' }, motif: partage.motif };
    }
    return { etat: 'ok', jeton: partage.jeton, compteGoogle: 'gestion@criterimmo.fr', source: 'compte_partage' };
  }

  // ── ② Coffre non configuré → on ne propose PAS de connexion : on écrirait un jeton illisible demain. ──
  if (!coffreConfigure()) {
    return {
      etat: 'refus', etatCollaborateur: { etat: 'coffre_absent' },
      motif: 'La clé de chiffrement des jetons n’est pas configurée : aucun compte Google ne peut être relié.',
    };
  }

  const auteur = await auteurDeLaRequete(request);
  if (auteur.id === null) {
    // Voie de secours (mot de passe partagé) : aucune identité personnelle, donc aucun compte Google personnel.
    return {
      etat: 'refus', etatCollaborateur: { etat: 'jamais' },
      motif: 'Cet accès n’est rattaché à aucun compte personnel : relier un compte Google demande d’être connecté nominativement.',
    };
  }

  const compte = await lireCompteDe(auteur.id);
  if (compte === null) {
    return { etat: 'refus', etatCollaborateur: { etat: 'jamais' }, motif: 'Aucun compte Google relié.' };
  }
  if (compte.refreshToken === '') {
    return {
      etat: 'refus',
      etatCollaborateur: { etat: 'a_reconnecter', email: compte.email, motif: compte.derniereErreur ?? 'jeton illisible' },
      motif: compte.derniereErreur ?? 'Le jeton enregistré n’est plus lisible.',
    };
  }

  const identifiants = lireIdentifiants();
  if (identifiants === null) {
    return {
      etat: 'refus', etatCollaborateur: { etat: 'coffre_absent' },
      motif: 'Aucun identifiant de client OAuth n’est configuré.',
    };
  }

  try {
    const acces = await rafraichirJeton({ identifiants, refreshToken: compte.refreshToken }, { fetch });
    if (!acces.ok) {
      // Google a refusé : autorisation retirée, mot de passe changé. On le NOTE, pour que l'écran propose une
      //   reconnexion la prochaine fois au lieu de retenter et d'échouer de la même façon.
      await noterErreurCompte(auteur.id, acces.motif);
      return {
        etat: 'refus',
        etatCollaborateur: { etat: 'a_reconnecter', email: compte.email, motif: acces.motif },
        motif: acces.motif,
      };
    }
    return { etat: 'ok', jeton: acces.valeur, compteGoogle: compte.email, source: 'collaborateur' };
  } catch {
    return {
      etat: 'refus',
      etatCollaborateur: { etat: 'a_reconnecter', email: compte.email, motif: 'Google n’a pas répondu.' },
      motif: 'Google n’a pas répondu.',
    };
  }
}

/** L'état de la connexion Google de cette personne, SANS jamais déchiffrer ni appeler Google. Pour l'affichage seul. */
export async function etatGoogleDuCollaborateur(request: Request): Promise<EtatCollaborateur> {
  if (!await comptesGoogleDisponibles()) return { etat: 'sans_schema' };
  if (!coffreConfigure()) return { etat: 'coffre_absent' };
  const auteur = await auteurDeLaRequete(request);
  if (auteur.id === null) return { etat: 'jamais' };
  const { lireEmailDe } = await import('./comptesGoogleRepo');
  const c = await lireEmailDe(auteur.id);
  if (c === null) return { etat: 'jamais' };
  return c.derniereErreur
    ? { etat: 'a_reconnecter', email: c.email, motif: c.derniereErreur }
    : { etat: 'connecte', email: c.email };
}
