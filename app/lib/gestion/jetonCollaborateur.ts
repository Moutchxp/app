/**
 * MODULE « GESTION » — LOT 5-PJ-C2 : QUEL JETON GOOGLE POUR CETTE REQUÊTE ?
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LA RÈGLE, EN UNE PHRASE : on agit AU NOM DE L'ADRESSE AVEC LAQUELLE LA PERSONNE S'EST IDENTIFIÉE À L'INTERFACE.
 * Pas de choix de compte, pas d'écran Google, pas de bouton « Connecter » — décision d'Arno du 25/09, 12h34. Google
 * applique donc les droits de cette personne, exactement comme sur drive.google.com.
 *
 * 🔴 LE SUBJECT EST LU CÔTÉ SERVEUR, DANS LA SESSION, PUIS RELU EN BASE. Jamais dans un paramètre d'URL, jamais dans
 * un corps de requête, jamais dans un en-tête fourni par la page. Accepter une adresse venue du navigateur
 * reviendrait à offrir à quiconque d'agir au nom de n'importe qui : la délégation au niveau du domaine est un
 * pouvoir d'usurpation, et c'est CETTE fonction qui en est la serrure. Un test le tient explicitement.
 *
 * POURQUOI RELIRE EN BASE plutôt que de croire la session : une session vaut huit heures. Un identifiant corrigé, un
 * compte désactivé, et le jeton signé continuerait de porter l'ancienne valeur. La base est la source ; la session
 * ne sert qu'à savoir DE QUI il s'agit.
 *
 * 🔴 LE JETON DE `gestion@` N'EST PAS TOUCHÉ, et reste utilisé pour l'ENVOI des mails (lot 5e) et pour la future
 * copie automatique (lot D). Ce fichier ne l'emploie plus du tout.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { NOM_COOKIE, sessionDepuisPayload, verifierJeton } from '../admin/session';
import { delegationConfiguree } from './compteService';
import { jetonPourSubject } from './driveDelegue';
import { lireDomainesAutorises } from './comptesGoogleRepo';
import { domaineDe, lireDomaines } from './googleCollaborateur';

/** Ce que l'écran affiche selon l'état de l'accès Drive. Plus aucun état ne demande un GESTE de l'utilisateur. */
export type EtatAccesDrive =
  /** Tout va bien : on agit au nom de cette adresse. */
  | { etat: 'ok'; adresse: string }
  /** L'administrateur n'a pas fini de configurer la délégation (clé absente, ou non déclarée côté Google). */
  | { etat: 'non_configure'; motif: string }
  /** Cette personne n'a pas de compte Drive dans l'organisation, ou il est suspendu. */
  | { etat: 'sans_acces'; motif: string }
  /** L'accès n'est rattaché à aucune adresse professionnelle (voie de secours, identifiant sans domaine autorisé). */
  | { etat: 'sans_adresse'; motif: string };

/** Le message affiché. Un seul endroit : quatre formulations dispersées dériveraient. PUR. */
export function messageAcces(e: EtatAccesDrive): string {
  switch (e.etat) {
    case 'ok': return `Drive ouvert au nom de ${e.adresse}`;
    case 'non_configure': return e.motif;
    case 'sans_acces': return e.motif;
    case 'sans_adresse': return e.motif;
  }
}

/**
 * L'ADRESSE AU NOM DE LAQUELLE ON AGIT — lue dans la session, relue en base, puis vérifiée contre les domaines
 * autorisés (réglage du lot 5-PJ-C, `gestion_config.domaines_google_autorises`).
 *
 * ⚠️ Le paramètre de cette fonction est une `Request` et RIEN D'AUTRE : il n'existe aucun moyen de lui souffler une
 * adresse. C'est volontaire, et c'est ce qui rend la règle vérifiable d'un coup d'œil.
 */
export async function adresseDuCollaborateur(request: Request): Promise<EtatAccesDrive> {
  const cookie = request.headers.get('cookie');
  const brut = cookie === null ? null : lireCookieBrut(cookie, NOM_COOKIE);
  const payload = brut ? await verifierJeton(brut) : null;
  if (!payload) {
    return { etat: 'sans_adresse', motif: 'Session absente : impossible de savoir au nom de qui ouvrir le Drive.' };
  }
  const session = sessionDepuisPayload(payload);
  if (session.sub === null) {
    // Voie de secours (mot de passe partagé) : aucune identité personnelle, donc aucun Drive personnel. Ce n'est
    //   pas une panne — c'est la conséquence normale d'un accès qui n'est au nom de personne.
    return {
      etat: 'sans_adresse',
      motif: 'Cet accès n’est rattaché à aucune adresse professionnelle : le Drive ne peut pas être ouvert en votre nom.',
    };
  }

  const { rows } = await query<{ identifiant: string | null; actif: boolean }>(
    `SELECT identifiant, actif FROM admin_utilisateur WHERE id = $1`, [session.sub]);
  const compte = rows[0];
  const adresse = (compte?.identifiant ?? '').trim().toLowerCase();
  if (!compte || !compte.actif || adresse === '' || !adresse.includes('@')) {
    return {
      etat: 'sans_adresse',
      motif: 'Votre identifiant n’est pas une adresse professionnelle : le Drive ne peut pas être ouvert en votre nom.',
    };
  }

  // Le DOMAINE est vérifié ici, contre un RÉGLAGE en base. Un identifiant hors des domaines de l'entreprise ne doit
  //   pas partir en délégation : Google le refuserait, mais mieux vaut le dire nous-mêmes, et plus clairement.
  const permis = lireDomaines(await lireDomainesAutorises());
  if (permis.length > 0 && !permis.includes(domaineDe(adresse))) {
    return {
      etat: 'sans_adresse',
      motif: `Votre adresse n’appartient pas à l’organisation. Domaines acceptés : ${permis.join(', ')}.`,
    };
  }
  return { etat: 'ok', adresse };
}

/** Lecture d'un cookie dans un en-tête brut. Même règle que `auteur.ts` — une seule façon de lire un cookie. PUR. */
function lireCookieBrut(entete: string, nom: string): string | null {
  for (const part of entete.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === nom) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** Le jeton retenu, et AU NOM DE QUI il agit. L'adresse sert au journal des dépôts. */
export type IssueJeton =
  | { etat: 'ok'; jeton: string; compteGoogle: string }
  | { etat: 'refus'; acces: EtatAccesDrive; motif: string };

/**
 * LE JETON À EMPLOYER pour cette requête. Deux étapes, dans cet ordre : QUI (session, base, domaine), puis LE JETON
 * (délégation). Inverser reviendrait à demander un jeton avant de savoir pour qui.
 */
export async function jetonPourRequete(request: Request): Promise<IssueJeton> {
  const acces = await adresseDuCollaborateur(request);
  if (acces.etat !== 'ok') return { etat: 'refus', acces, motif: messageAcces(acces) };

  if (!delegationConfiguree()) {
    const e: EtatAccesDrive = { etat: 'non_configure', motif: 'Drive pas encore configuré par l’administrateur.' };
    return { etat: 'refus', acces: e, motif: e.motif };
  }

  const jeton = await jetonPourSubject(acces.adresse, { fetch });
  if (!jeton.ok) {
    const e: EtatAccesDrive = jeton.cause === 'non_configure'
      ? { etat: 'non_configure', motif: jeton.motif }
      : { etat: 'sans_acces', motif: jeton.motif };
    return { etat: 'refus', acces: e, motif: jeton.motif };
  }
  return { etat: 'ok', jeton: jeton.jeton, compteGoogle: acces.adresse };
}

/** L'état de l'accès Drive, SANS demander de jeton à Google. Pour l'affichage seul — aucune requête sortante. */
export async function etatAccesDrive(request: Request): Promise<EtatAccesDrive> {
  const acces = await adresseDuCollaborateur(request);
  if (acces.etat !== 'ok') return acces;
  return delegationConfiguree()
    ? acces
    : { etat: 'non_configure', motif: 'Drive pas encore configuré par l’administrateur.' };
}
