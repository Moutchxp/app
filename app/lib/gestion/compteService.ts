/**
 * MODULE « GESTION » — LOT 5-PJ-C2 : LE COMPTE DE SERVICE ET SA DÉLÉGATION. Partie PURE (aucun réseau).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 LE CHANGEMENT DE PRINCIPE, décidé par Arno le 25/09 à 12h34 : « il ne faut pas demander la boîte mail utilisée
 * pour l'accès au Drive, il faut utiliser par défaut l'adresse mail du collaborateur qu'il utilise pour s'identifier ».
 * Plus aucun écran Google, plus aucun choix de compte, plus aucun bouton « Connecter ». On agit AU NOM de l'adresse
 * avec laquelle la personne s'est déjà identifiée à l'interface.
 *
 * COMMENT : un COMPTE DE SERVICE Google avec DÉLÉGATION AU NIVEAU DU DOMAINE. Le compte de service signe lui-même une
 * attestation disant « je demande un jeton pour agir au nom de a.jorel@sansvisavis.com », et Google la lui accorde
 * PARCE QUE l'administrateur du Workspace l'y a autorisé — pour ce scope-là, et pour lui seul.
 *
 * 🔴 UN SEUL SCOPE : Drive. Pas Gmail, pas l'Admin SDK, rien d'autre. Une délégation est un pouvoir d'usurpation
 * d'identité sur TOUT le domaine : elle ne doit porter que sur ce dont on a besoin, et ce besoin se limite à lire
 * une arborescence et y déposer un fichier. C'est écrit ici, et c'est ce qu'Arno déclare dans la console.
 *
 * 🔴 LE SUBJECT NE VIENT JAMAIS DU NAVIGATEUR. Il est lu côté serveur, dans la session authentifiée. Accepter une
 * adresse envoyée par la page reviendrait à offrir à quiconque d'agir au nom de n'importe qui — c'est-à-dire à
 * transformer la délégation en trou béant. Voir `jetonCollaborateur.ts`, où la règle est appliquée.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Le SEUL scope délégué. Écrit une fois, et cité tel quel dans les instructions données à l'administrateur. */
export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive';

/** Où trouver la clé : un CHEMIN vers le fichier JSON (recommandé), ou le JSON lui-même (hébergements à secrets). */
export const VARIABLE_CLE_FICHIER = 'GOOGLE_DELEGATION_CLE_FICHIER';
export const VARIABLE_CLE_JSON = 'GOOGLE_DELEGATION_CLE_JSON';

export const ENDPOINT_TOKEN = 'https://oauth2.googleapis.com/token';

/** Ce dont on a besoin dans la clé du compte de service. Le reste du fichier JSON est ignoré. */
export interface CleService {
  clientEmail: string;
  privateKey: string;
  /** L'« ID client » à déclarer dans la console d'administration. Affiché pour le contrôle, jamais secret. */
  clientId: string;
}

/** Le coffre du compte de service n'est pas configuré. Se répare dans `.env`, pas dans la base. */
export class DelegationAbsente extends Error {}

/**
 * LIT LA CLÉ. `null` quand rien n'est configuré — ce n'est pas une panne, c'est un état que l'écran doit pouvoir
 * annoncer (« Drive pas encore configuré par l'administrateur »).
 *
 * 🔒 LE CONTENU DE LA CLÉ N'EST JAMAIS JOURNALISÉ NI RENDU. Seuls `clientEmail` et `clientId` sortent d'ici, et ce
 * sont des identifiants publics — c'est d'ailleurs le `clientId` qu'Arno colle dans la console d'administration.
 */
export function lireCleService(
  env: Record<string, string | undefined> = process.env,
  lireFichier: (chemin: string) => string = (c) => readFileSync(c, 'utf8'),
): CleService | null {
  const brut = (() => {
    const inline = (env[VARIABLE_CLE_JSON] ?? '').trim();
    if (inline !== '') return inline;
    const chemin = (env[VARIABLE_CLE_FICHIER] ?? '').trim();
    if (chemin === '') return '';
    try { return lireFichier(chemin); } catch { return ''; }
  })();
  if (brut === '') return null;
  try {
    const j = JSON.parse(brut) as { client_email?: string; private_key?: string; client_id?: string };
    const clientEmail = (j.client_email ?? '').trim();
    const privateKey = (j.private_key ?? '').trim();
    if (clientEmail === '' || privateKey === '') return null;
    return { clientEmail, privateKey, clientId: (j.client_id ?? '').trim() };
  } catch {
    // Un JSON abîmé n'est pas « pas configuré » : on rend `null`, et l'appelant dit « pas encore configuré ». Le
    //   détail exact irait au journal du serveur, jamais à l'écran — il contiendrait des morceaux de la clé.
    return null;
  }
}

/** La délégation est-elle configurée de notre côté ? (Ce que l'administrateur a déclaré côté Google, on ne le sait
 *  qu'en essayant — cf. `driveDelegue.ts`.) */
export function delegationConfiguree(env: Record<string, string | undefined> = process.env): boolean {
  return lireCleService(env) !== null;
}

/** Durée de validité de l'attestation. Google plafonne à une heure ; on reste largement en dessous. */
export const ASSERTION_DUREE_S = 3600;

function base64url(x: Buffer | string): string {
  return Buffer.from(x).toString('base64url');
}

/**
 * CONSTRUIT ET SIGNE L'ATTESTATION (JWT RS256) qui demande un jeton AU NOM DE `subject`.
 *
 * Les cinq revendications qui comptent :
 *   · `iss` — qui demande : le compte de service ;
 *   · `sub` — AU NOM DE QUI : l'adresse du collaborateur. C'est cette ligne, et elle seule, qui fait que Google
 *     appliquera ensuite les droits de cette personne, et pas ceux d'un compte partagé ;
 *   · `scope` — Drive, et rien d'autre ;
 *   · `aud` — le point d'échange de Google : une attestation destinée à autre chose ne doit pas y être acceptée ;
 *   · `iat`/`exp` — sa fenêtre de validité.
 *
 * PUR : signe et rend une chaîne, sans réseau. `maintenant` est injecté pour que le test soit déterministe.
 */
export function construireAssertion(o: {
  cle: CleService; subject: string; scope?: string; maintenant?: Date;
}): string {
  const iat = Math.floor((o.maintenant ?? new Date()).getTime() / 1000);
  const entete = { alg: 'RS256', typ: 'JWT' };
  const charge = {
    iss: o.cle.clientEmail,
    sub: o.subject,
    scope: o.scope ?? SCOPE_DRIVE,
    aud: ENDPOINT_TOKEN,
    iat,
    exp: iat + ASSERTION_DUREE_S,
  };
  const corps = `${base64url(JSON.stringify(entete))}.${base64url(JSON.stringify(charge))}`;
  const signature = createSign('RSA-SHA256').update(corps).end().sign(o.cle.privateKey);
  return `${corps}.${base64url(signature)}`;
}

/** Le corps de la requête d'échange. Écrit une fois : le `grant_type` est long et se recopie mal. PUR. */
export function corpsEchange(assertion: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
}

/**
 * POURQUOI GOOGLE A REFUSÉ, EN FRANÇAIS. Trois refus très différents se ressemblent dans la réponse brute, et chacun
 * appelle un geste différent — d'où cette traduction, au lieu d'un « erreur 400 » qui n'aide personne. PUR.
 */
export function motifRefus(erreur: string | undefined, description: string | undefined): string {
  const e = (erreur ?? '').toLowerCase();
  const d = (description ?? '').toLowerCase();

  // L'administrateur n'a pas (encore) autorisé ce compte de service pour ce scope, dans la console d'administration.
  if (e === 'unauthorized_client') {
    return 'Drive pas encore configuré par l’administrateur : la délégation du compte de service n’est pas autorisée pour cette organisation.';
  }
  if (e === 'invalid_grant') {
    // Google répond la même erreur pour « ce compte n'existe pas » et « ce compte est suspendu » ; la description
    //   les sépare quand elle est présente. On ne devine pas au-delà de ce qu'elle dit.
    if (d.includes('invalid email') || d.includes('not found') || d.includes('account not found')) {
      return 'Votre adresse n’a pas d’accès Drive dans l’organisation : elle n’y est pas reconnue.';
    }
    if (d.includes('disabled') || d.includes('suspended')) {
      return 'Votre compte Google est suspendu dans l’organisation : l’accès au Drive est fermé.';
    }
    return 'Votre adresse n’a pas d’accès Drive dans l’organisation.';
  }
  if (e === 'invalid_client') {
    return 'Drive pas encore configuré par l’administrateur : la clé du compte de service n’est pas reconnue par Google.';
  }
  return `Le Drive n’a pas pu être ouvert (${erreur ?? 'raison inconnue'}).`;
}
